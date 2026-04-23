import axios from "axios";
import type { TTSProvider, TTSResult } from "./tts.interface";
import type { Language, WordTimestamp } from "../../types/video.types";
import { logger } from "../../logger";

// ElevenLabs voice IDs for PT/EN
const DEFAULT_VOICES: Record<Language, string> = {
  pt: "pNInz6obpgDQGcFmaJgB", // Adam (multilingual)
  en: "21m00Tcm4TlvDq8ikWAM", // Rachel
};

// ElevenLabs model IDs
const MODEL = "eleven_flash_v2_5"

export class ElevenLabsService implements TTSProvider {
  private readonly baseUrl = "https://api.elevenlabs.io/v1";

  constructor(private apiKey: string) { }

  async generate(text: string, language: Language, voice?: string): Promise<TTSResult> {
    const voiceId = voice ?? DEFAULT_VOICES[language];

    logger.debug({ language, voiceId, textLength: text.length }, "Generating TTS");

    // Generate audio with timestamps
    const response = await axios.post(
      `${this.baseUrl}/text-to-speech/${voiceId}/with-timestamps`,
      {
        text,
        model_id: MODEL,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      },
      {
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        responseType: "json",
      },
    );

    const { audio_base64, alignment } = response.data as {
      audio_base64: string;
      alignment: {
        characters: string[];
        character_start_times_seconds: number[];
        character_end_times_seconds: number[];
      };
    };

    const audioBuffer = Buffer.from(audio_base64, "base64");
    const durationMs = (alignment.character_end_times_seconds.at(-1) ?? 0) * 1000;

    // Build word-level timestamps from character alignment
    const timestamps = this.buildWordTimestamps(alignment);

    logger.debug({ durationMs, wordCount: timestamps.length }, "TTS generated");

    return { audioBuffer, durationMs, timestamps };
  }

  private buildWordTimestamps(alignment: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  }): WordTimestamp[] {
    const words: WordTimestamp[] = [];
    let currentWord = "";
    let wordStart = 0;

    for (let i = 0; i < alignment.characters.length; i++) {
      const char = alignment.characters[i];
      const start = alignment.character_start_times_seconds[i];
      const end = alignment.character_end_times_seconds[i];

      if (char === " " || i === alignment.characters.length - 1) {
        if (char !== " ") currentWord += char;
        if (currentWord.trim()) {
          words.push({
            word: currentWord.trim(),
            startMs: Math.round(wordStart * 1000),
            endMs: Math.round(end * 1000),
          });
        }
        currentWord = "";
        wordStart = end;
      } else {
        if (!currentWord) wordStart = start;
        currentWord += char;
      }
    }

    return words;
  }
}
