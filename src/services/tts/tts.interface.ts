import type { Language, WordTimestamp } from "../../types/video.types";

export interface TTSResult {
  audioBuffer: Buffer;
  durationMs: number;
  timestamps: WordTimestamp[];
}

export interface TTSProvider {
  generate(text: string, language: Language, voice?: string): Promise<TTSResult>;
}
