import ffmpeg from "fluent-ffmpeg";
import { Readable } from "stream";
import fs from "fs-extra";
import path from "path";
import { execSync } from "child_process";
import { logger } from "../../logger";

export class FFmpegService {
  static async init(): Promise<FFmpegService> {
    const ffmpegPath = FFmpegService.resolveExecutable("ffmpeg");
    const ffprobePath = FFmpegService.resolveExecutable("ffprobe");

    ffmpeg.setFfmpegPath(ffmpegPath);
    if (ffprobePath) {
      ffmpeg.setFfprobePath(ffprobePath);
    }

    logger.info({ ffmpegPath, ffprobePath }, "FFmpeg initialized");
    return new FFmpegService();
  }

  /**
   * Resolve executable path with priority:
   * 1. System PATH (works inside Docker where apt-get installed ffmpeg)
   * 2. Well-known Linux/Mac paths
   * 3. @ffmpeg-installer bundled binary (fallback for local dev)
   */
  private static resolveExecutable(name: "ffmpeg" | "ffprobe"): string {
    // 1. Check system PATH via `which`
    try {
      const systemPath = execSync(`which ${name}`, { encoding: "utf-8" }).trim();
      if (systemPath && fs.existsSync(systemPath)) {
        logger.debug({ name, path: systemPath }, "Found executable in system PATH");
        return systemPath;
      }
    } catch {
      // `which` failed — not in PATH
    }

    // 2. Check well-known paths
    const knownPaths = [
      `/usr/bin/${name}`,
      `/usr/local/bin/${name}`,
      `/opt/homebrew/bin/${name}`,
    ];
    for (const p of knownPaths) {
      if (fs.existsSync(p)) {
        logger.debug({ name, path: p }, "Found executable at well-known path");
        return p;
      }
    }

    // 3. Fallback to @ffmpeg-installer (only supports ffmpeg, not ffprobe)
    if (name === "ffmpeg") {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const installer = require("@ffmpeg-installer/ffmpeg");
        if (installer?.path && fs.existsSync(installer.path)) {
          logger.debug({ name, path: installer.path }, "Using @ffmpeg-installer bundled binary");
          return installer.path;
        }
      } catch {
        // package not available
      }
    }

    throw new Error(
      `Could not find '${name}' executable. ` +
      `Install ffmpeg on the system (apt-get install ffmpeg) or ensure @ffmpeg-installer/ffmpeg is installed.`,
    );
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

  /**
   * Concatenate multiple audio files into a single MP3 using FFmpeg concat demuxer.
   * This avoids the corrupted-header problem from Buffer.concat of raw WAV/MP3 chunks.
   */
  async concatAudioFiles(inputPaths: string[], outputPath: string): Promise<void> {
    if (inputPaths.length === 0) {
      throw new Error("concatAudioFiles: no input files provided");
    }

    // Single file — just convert directly
    if (inputPaths.length === 1) {
      return this.saveAsMp3(await fs.readFile(inputPaths[0]), outputPath);
    }

    // Create concat list file for FFmpeg demuxer
    const listPath = outputPath + ".concat.txt";
    const listContent = inputPaths
      .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
      .join("\n");
    await fs.writeFile(listPath, listContent, "utf-8");

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(listPath)
          .inputOptions(["-f", "concat", "-safe", "0"])
          .audioCodec("libmp3lame")
          .audioBitrate(128)
          .audioChannels(2)
          .toFormat("mp3")
          .save(outputPath)
          .on("end", () => {
            logger.debug({ outputPath, chunkCount: inputPaths.length }, "Audio chunks concatenated to MP3");
            resolve();
          })
          .on("error", reject);
      });
    } finally {
      await fs.remove(listPath);
    }
  }
}
