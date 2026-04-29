import type { Language, WordTimestamp } from "../../types/video.types";
import type { FFmpegService } from "../renderer/ffmpeg.service";

export interface TTSResult {
  audioFilePath: string;
  durationMs: number;
  timestamps: WordTimestamp[];
}

export interface TTSProvider {
  generate(text: string, language: Language, voice: string | undefined, tempDir: string, ffmpeg: FFmpegService): Promise<TTSResult>;
}
