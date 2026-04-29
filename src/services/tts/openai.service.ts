import axios from "axios";
import fs from "fs-extra";
import path from "path";
import cuid from "cuid";
import type { TTSProvider, TTSResult } from "./tts.interface";
import type { Language, WordTimestamp } from "../../types/video.types";
import type { FFmpegService } from "../renderer/ffmpeg.service";
import { logger } from "../../logger";

// OpenAI TTS voices
const DEFAULT_VOICES: Record<Language, string> = {
  pt: "onyx",
  en: "nova",
};

export class OpenAITTSService implements TTSProvider {
  private readonly baseUrl = "https://api.openai.com/v1";

  constructor(private apiKey: string) { }

  async generate(text: string, language: Language, voice: string | undefined, tempDir: string, ffmpeg: FFmpegService): Promise<TTSResult> {
    const voiceName = (voice ?? DEFAULT_VOICES[language]).toLowerCase();
    const chunks = this.splitTextIntoChunks(text);
    const batchId = cuid();

    logger.debug(
      { language, voice: voiceName, textLength: text.length, chunks: chunks.length },
      "Generating TTS via OpenAI",
    );

    const chunkPaths: string[] = [];
    const allTimestamps: WordTimestamp[] = [];
    let currentOffsetMs = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (chunks.length > 1) {
        logger.info({ chunkIndex: i + 1, totalChunks: chunks.length }, "Processing TTS chunk");
      }

      try {
        // 1. Generate speech audio for this chunk
        const speechResponse = await axios.post(
          `${this.baseUrl}/audio/speech`,
          {
            model: "gpt-4o-mini-tts",
            input: chunk,
            voice: voiceName,
            response_format: "mp3",
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              "Content-Type": "application/json",
            },
            responseType: "arraybuffer",
          },
        );

        // Save chunk to disk
        const chunkBuffer = Buffer.from(speechResponse.data);
        const chunkPath = path.join(tempDir, `tts-${batchId}-${String(i).padStart(4, "0")}.mp3`);
        await fs.writeFile(chunkPath, chunkBuffer);
        chunkPaths.push(chunkPath);

        // 2. Transcribe chunk with Whisper to get word-level timestamps
        const chunkTimestamps = await this.transcribeForTimestamps(chunkBuffer, language);

        // 3. Adjust timestamps with the current cumulative offset
        const adjustedTimestamps = chunkTimestamps.map((t) => ({
          ...t,
          startMs: t.startMs + currentOffsetMs,
          endMs: t.endMs + currentOffsetMs,
        }));

        allTimestamps.push(...adjustedTimestamps);

        // 4. Update offset for next chunk
        const chunkDurationMs =
          chunkTimestamps.length > 0
            ? chunkTimestamps[chunkTimestamps.length - 1].endMs
            : this.estimateDurationMs(chunk);

        currentOffsetMs += chunkDurationMs;
      } catch (err: any) {
        // Error is already logged in a readable way by our new logger serializer
        const status = err.response?.status;
        throw new Error(`OpenAI TTS chunk ${i + 1} failed (Status ${status}): ${err.message}`);
      }
    }

    // Concatenate all chunks into a single MP3 via FFmpeg
    const audioFilePath = path.join(tempDir, `tts-${batchId}-final.mp3`);
    await ffmpeg.concatAudioFiles(chunkPaths, audioFilePath);

    // Cleanup individual chunk files
    for (const p of chunkPaths) {
      await fs.remove(p).catch(() => {});
    }

    const durationMs = currentOffsetMs;
    logger.debug({ durationMs, wordCount: allTimestamps.length }, "OpenAI TTS generated (all chunks)");

    return { audioFilePath, durationMs, timestamps: allTimestamps };
  }

  private splitTextIntoChunks(text: string, maxChars = 3000): string[] {
    if (text.length <= maxChars) return [text];

    const chunks: string[] = [];
    // Split by sentences (trying to keep punctuation)
    const sentences = text.match(/[^.!?]+[.!?]+|\s*[^.!?]+/g) || [text];

    let currentChunk = "";
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxChars && currentChunk.length > 0) {
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

  private async transcribeForTimestamps(
    audioBuffer: Buffer,
    language: Language,
  ): Promise<WordTimestamp[]> {
    try {
      // Whisper expects a file upload via multipart/form-data
      const formModule = await import("form-data");
      const FormData = formModule.default || formModule;
      const form = new FormData();

      form.append("file", audioBuffer, {
        filename: "speech.mp3",
        contentType: "audio/mpeg",
      });
      form.append("model", "whisper-1");
      form.append("language", language);
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "word");

      const response = await axios.post(
        `${this.baseUrl}/audio/transcriptions`,
        form,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            ...form.getHeaders(),
          },
        },
      );

      const data = response.data as {
        duration?: number;
        words?: Array<{ word: string; start: number; end: number }>;
      };

      if (!data.words || data.words.length === 0) {
        logger.warn("Whisper returned no word timestamps, falling back to estimation");
        return this.estimateTimestamps(data.duration ?? 0);
      }

      return data.words.map((w) => ({
        word: w.word.trim(),
        startMs: Math.round(w.start * 1000),
        endMs: Math.round(w.end * 1000),
      }));
    } catch (err) {
      logger.warn({ err }, "Whisper transcription failed, using estimated timestamps");
      return [];
    }
  }

  private estimateTimestamps(durationSec: number): WordTimestamp[] {
    if (durationSec <= 0) return [];
    return [
      {
        word: "",
        startMs: 0,
        endMs: Math.round(durationSec * 1000),
      },
    ];
  }

  private estimateDurationMs(text: string): number {
    const wordCount = text.split(/\s+/).length;
    return Math.round((wordCount / 2.5) * 1000);
  }
}
