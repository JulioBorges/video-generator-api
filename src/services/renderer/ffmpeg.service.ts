import ffmpeg from "fluent-ffmpeg";
import { Readable } from "stream";
import { logger } from "../../logger";

export class FFmpegService {
  static async init(): Promise<FFmpegService> {
    const installer = await import("@ffmpeg-installer/ffmpeg");
    ffmpeg.setFfmpegPath(installer.path);
    logger.info({ path: installer.path }, "FFmpeg initialized");
    return new FFmpegService();
  }

  async saveAsMp3(audioBuffer: Buffer, outputPath: string): Promise<void> {
    const input = Readable.from(audioBuffer);
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(input)
        .audioCodec("libmp3lame")
        .audioBitrate(128)
        .audioChannels(2)
        .toFormat("mp3")
        .save(outputPath)
        .on("end", () => {
          logger.debug({ outputPath }, "Audio saved as MP3");
          resolve();
        })
        .on("error", reject);
    });
  }

  async saveNormalizedWav(audioBuffer: Buffer, outputPath: string): Promise<void> {
    const input = Readable.from(audioBuffer);
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(input)
        .audioCodec("pcm_s16le")
        .audioChannels(1)
        .audioFrequency(16000)
        .toFormat("wav")
        .save(outputPath)
        .on("end", () => resolve())
        .on("error", reject);
    });
  }

  getDurationS(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) return reject(err);
        resolve(metadata.format.duration ?? 0);
      });
    });
  }
}
