import { v1beta1 } from "@google-cloud/text-to-speech";
import type { TTSProvider, TTSResult } from "./tts.interface";
import type { Language, WordTimestamp } from "../../types/video.types";
import { logger } from "../../logger";

const DEFAULT_VOICES: Record<Language, string> = {
  pt: "pt-BR-Neural2-B",
  en: "en-US-Neural2-D",
};

export class GoogleTTSService implements TTSProvider {
  private client: v1beta1.TextToSpeechClient;

  constructor(keyFilePath?: string) {
    this.client = new v1beta1.TextToSpeechClient(
      keyFilePath ? { keyFilename: keyFilePath } : {},
    );
  }

  async generate(
    text: string,
    language: Language,
    voice?: string,
  ): Promise<TTSResult> {
    const voiceName = voice ?? DEFAULT_VOICES[language];
    const languageCode = language === "pt" ? "pt-BR" : "en-US";
    const chunks = this.splitTextIntoChunks(text);

    logger.debug(
      {
        language,
        voice: voiceName,
        textLength: text.length,
        chunks: chunks.length,
      },
      "Generating TTS via Google Cloud",
    );

    const audioBuffers: Buffer[] = [];
    const allTimestamps: WordTimestamp[] = [];
    let currentOffsetMs = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (chunks.length > 1) {
        logger.info(
          { chunkIndex: i + 1, totalChunks: chunks.length },
          "Processing Google TTS chunk",
        );
      }

      const { ssml, words } = this.buildSSMLWithMarks(chunk);

      try {
        // Using 'any' cast because the v1beta1 client's synthesizeSpeech method has complex overloads 
        // that sometimes confuse the TypeScript compiler regarding the return type.
        // Also using the numeric value 1 for SSML_MARK (TimepointType).
        const [response] = await (this.client as any).synthesizeSpeech({
          input: { ssml },
          voice: { name: voiceName, languageCode },
          audioConfig: { audioEncoding: "MP3" },
          enableTimePointing: [1],
        });

        if (!response.audioContent) {
          throw new Error("Google TTS returned no audio content");
        }

        const chunkBuffer = Buffer.from(response.audioContent as Uint8Array);
        const chunkTimestamps: WordTimestamp[] = [];

        if (response.timepoints && response.timepoints.length > 0) {
          for (let j = 0; j < response.timepoints.length; j++) {
            const tp = response.timepoints[j];
            const nextTp = response.timepoints[j + 1];
            const markIndex = parseInt(tp.markName || "0", 10);

            const startMs = Math.round(
              (tp.timeOffset?.seconds || 0) * 1000 +
                (tp.timeOffset?.nanos || 0) / 1000000,
            );

            // Estimate end time based on next mark or a fixed duration for the last word
            const endMs = nextTp
              ? Math.round(
                  (nextTp.timeOffset?.seconds || 0) * 1000 +
                    (nextTp.timeOffset?.nanos || 0) / 1000000,
                )
              : startMs + 300; // Average word duration fallback

            chunkTimestamps.push({
              word: words[markIndex],
              startMs: startMs + currentOffsetMs,
              endMs: endMs + currentOffsetMs,
            });
          }
        }

        audioBuffers.push(chunkBuffer);
        allTimestamps.push(...chunkTimestamps);

        // Update current offset for the next chunk
        // If we have timestamps, use the end of the last word, otherwise estimate
        const chunkDurationMs =
          chunkTimestamps.length > 0
            ? chunkTimestamps[chunkTimestamps.length - 1].endMs - currentOffsetMs
            : this.estimateDurationMs(chunk);

        currentOffsetMs += chunkDurationMs;
      } catch (err: any) {
        throw new Error(
          `Google TTS failed for chunk ${i + 1}: ${err.message}`,
        );
      }
    }

    const audioBuffer = Buffer.concat(audioBuffers);
    const durationMs = currentOffsetMs;

    logger.debug(
      { durationMs, wordCount: allTimestamps.length },
      "Google TTS generated (all chunks)",
    );

    return { audioBuffer, durationMs, timestamps: allTimestamps };
  }

  private buildSSMLWithMarks(text: string): { ssml: string; words: string[] } {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const ssmlParts = words.map(
      (word, i) => `<mark name="${i}"/>${this.escapeXml(word)}`,
    );
    return {
      ssml: `<speak>${ssmlParts.join(" ")}</speak>`,
      words,
    };
  }

  private escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case "&":
          return "&amp;";
        case "'":
          return "&apos;";
        case '"':
          return "&quot;";
      }
      return c;
    });
  }

  private splitTextIntoChunks(text: string, maxBytes = 4500): string[] {
    if (Buffer.byteLength(text) <= maxBytes) return [text];

    const chunks: string[] = [];
    // Split by sentences or whitespace
    const sentences = text.match(/[^.!?]+[.!?]+|\s*[^.!?]+/g) || [text];

    let currentChunk = "";
    for (const sentence of sentences) {
      if (
        Buffer.byteLength(currentChunk + sentence) > maxBytes &&
        currentChunk.length > 0
      ) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  private estimateDurationMs(text: string): number {
    const wordCount = text.split(/\s+/).length;
    return Math.round((wordCount / 2.5) * 1000);
  }
}
