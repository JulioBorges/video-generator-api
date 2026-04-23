import axios from "axios";
import type { TTSProvider, TTSResult } from "./tts.interface";
import type { Language, WordTimestamp } from "../../types/video.types";
import { logger } from "../../logger";

// OpenAI TTS voices
const DEFAULT_VOICES: Record<Language, string> = {
  pt: "onyx",
  en: "nova",
};

export class OpenAITTSService implements TTSProvider {
  private readonly baseUrl = "https://api.openai.com/v1";

  constructor(private apiKey: string) { }

  async generate(text: string, language: Language, voice?: string): Promise<TTSResult> {
    const voiceName = voice ?? DEFAULT_VOICES[language];

    logger.debug({ language, voice: voiceName, textLength: text.length }, "Generating TTS via OpenAI");

    // 1. Generate speech audio
    const speechResponse = await axios.post(
      `${this.baseUrl}/audio/speech`,
      {
        model: "gpt-4o-mini-tts",
        input: text,
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

    const audioBuffer = Buffer.from(speechResponse.data);

    // 2. Transcribe with Whisper to get word-level timestamps
    const timestamps = await this.transcribeForTimestamps(audioBuffer, language);

    const durationMs =
      timestamps.length > 0
        ? timestamps[timestamps.length - 1].endMs
        : this.estimateDurationMs(text);

    logger.debug({ durationMs, wordCount: timestamps.length }, "OpenAI TTS generated");

    return { audioBuffer, durationMs, timestamps };
  }

  private async transcribeForTimestamps(
    audioBuffer: Buffer,
    language: Language,
  ): Promise<WordTimestamp[]> {
    try {
      // Whisper expects a file upload via multipart/form-data
      const FormData = (await import("form-data")).default;
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

  /**
   * Rough fallback: distribute timestamps evenly based on estimated WPM.
   */
  private estimateTimestamps(durationSec: number): WordTimestamp[] {
    // Return empty — subtitle service will handle gracefully
    if (durationSec <= 0) return [];
    return [
      {
        word: "",
        startMs: 0,
        endMs: Math.round(durationSec * 1000),
      },
    ];
  }

  /**
   * Estimate audio duration from text length when no other data available.
   * Average speaking rate ~150 WPM → ~2.5 words/sec
   */
  private estimateDurationMs(text: string): number {
    const wordCount = text.split(/\s+/).length;
    return Math.round((wordCount / 2.5) * 1000);
  }
}
