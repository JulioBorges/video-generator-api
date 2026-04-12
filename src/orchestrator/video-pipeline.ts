import path from "path";
import https from "https";
import http from "http";
import cuid from "cuid";
import fs from "fs-extra";
import type { CreateVideoInput, SceneMedia, ComposedScene, Caption } from "../types/video.types";
import type { JobsRepository } from "../db/jobs.repository";
import type { TTSProvider } from "../services/tts/tts.interface";
import type { MediaSearchProvider } from "../services/media-search/media-search.interface";
import { SubtitleService } from "../services/subtitle/subtitle.service";
import { MusicService } from "../services/music/music.service";
import { FFmpegService } from "../services/renderer/ffmpeg.service";
import { RemotionService } from "../services/renderer/remotion.service";
import type { StorageService } from "../services/storage/storage.interface";
import { logger } from "../logger";
import { config } from "../config";

//
// Progress milestones (0-100)
//
const PROGRESS = {
  TTS_START: 0,
  TTS_DONE: 20,
  SUBTITLES_DONE: 30,
  MEDIA_DONE: 55,
  RENDER_DONE: 90,
  STORAGE_DONE: 100,
};

export class VideoPipeline {
  private subtitleService = new SubtitleService();

  constructor(
    private jobsRepo: JobsRepository,
    private tts: TTSProvider,
    private imageSearch: MediaSearchProvider,
    private videoSearch: MediaSearchProvider,
    private musicService: MusicService,
    private ffmpeg: FFmpegService,
    private remotion: RemotionService,
    private storage: StorageService,
  ) {}

  async execute(videoId: string, input: CreateVideoInput): Promise<void> {
    const tempFiles: string[] = [];

    try {
      this.update(videoId, "processing", PROGRESS.TTS_START, "tts_generation");

      // 1. Generate TTS audio for the full script
      logger.info({ videoId }, "Step 1: TTS generation");
      const ttsResult = await this.tts.generate(
        input.script,
        input.language,
        input.config?.voice,
      );

      // Save audio to temp file
      const tempId = cuid();
      const audioMp3Path = path.join(config.tempDirPath, `${tempId}.mp3`);
      tempFiles.push(audioMp3Path);
      await this.ffmpeg.saveAsMp3(ttsResult.audioBuffer, audioMp3Path);

      this.update(videoId, "processing", PROGRESS.TTS_DONE, "subtitle_generation");

      // 2. Build captions from word timestamps
      logger.info({ videoId }, "Step 2: Subtitle generation");
      const captions: Caption[] = this.subtitleService.buildCaptions(ttsResult.timestamps);

      this.update(videoId, "processing", PROGRESS.SUBTITLES_DONE, "media_search");

      // 3. Search & download media for each video item
      logger.info({ videoId, itemCount: input.videoItems.length }, "Step 3: Media search");
      const orientation = input.config?.orientation ?? "landscape";
      const durationPerItemS = (ttsResult.durationMs / 1000) / input.videoItems.length;

      const scenes: ComposedScene[] = await this.buildScenes(
        input,
        captions,
        audioMp3Path,
        ttsResult.durationMs,
        durationPerItemS,
        orientation,
        tempFiles,
        videoId,
      );

      this.update(videoId, "processing", PROGRESS.MEDIA_DONE, "rendering");

      // 4. Compose Remotion render input
      logger.info({ videoId }, "Step 4: Remotion rendering");
      const musicTrack = input.useBackgroundMusic
        ? this.musicService.pickTrack(input.backgroundMusicStyle)
        : undefined;

      const renderInput = {
        scenes: scenes.map((s) => ({
          media: s.media,
          durationMs: s.durationMs,
          captions: s.captions,
        })),
        voiceover: { url: `http://localhost:${config.port}/tmp/${path.basename(audioMp3Path)}` },
        music: musicTrack,
        config: {
          durationMs: ttsResult.durationMs + (input.config?.paddingBack ?? 0),
          orientation,
          useSrt: input.useSrt,
          srtStyle: input.srtStyle,
          musicVolume: input.config?.musicVolume ?? "medium",
          paddingBack: input.config?.paddingBack ?? 1500,
        },
      };

      const renderedPath = await this.remotion.render(renderInput, videoId);

      this.update(videoId, "processing", PROGRESS.RENDER_DONE, "storage");

      // 5. Save to storage
      logger.info({ videoId, renderedPath }, "Step 5: Storage");
      const videoBuffer = await fs.readFile(renderedPath);
      const outputPath = await this.storage.save(videoId, videoBuffer);

      this.update(videoId, "ready", PROGRESS.STORAGE_DONE, "done", outputPath);
      logger.info({ videoId, outputPath }, "Video generation complete");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ videoId, err }, "Pipeline error");
      this.jobsRepo.updateStatus(videoId, "failed", 0, "error", undefined, message);
    } finally {
      // Cleanup temp files
      for (const f of tempFiles) {
        fs.removeSync(f);
      }
    }
  }

  private async buildScenes(
    input: CreateVideoInput,
    captions: Caption[],
    audioMp3Path: string,
    totalDurationMs: number,
    durationPerItemS: number,
    orientation: "landscape" | "portrait",
    tempFiles: string[],
    videoId: string,
  ): Promise<ComposedScene[]> {
    const scenes: ComposedScene[] = [];
    const captionsPerScene = Math.ceil(captions.length / input.videoItems.length);

    for (let i = 0; i < input.videoItems.length; i++) {
      const item = input.videoItems[i];
      const sceneStartMs = Math.floor((i / input.videoItems.length) * totalDurationMs);
      const sceneEndMs =
        i === input.videoItems.length - 1
          ? totalDurationMs
          : Math.floor(((i + 1) / input.videoItems.length) * totalDurationMs);
      const sceneDurationMs = sceneEndMs - sceneStartMs;
      const sceneCaption = captions.slice(i * captionsPerScene, (i + 1) * captionsPerScene);

      // Build scene media URL
      let media: SceneMedia;

      if (item.type === "animated_text" || item.type === "formula" || item.type === "3d_image") {
        // Text-based scenes — no external media needed
        media = {
          type: item.type,
          url: item.searchTerm, // used as content
          displayMode: item.displayMode,
          duration: sceneDurationMs,
        };
      } else if (item.type === "image") {
        // Search for an image via SerpAPI
        const results = await this.imageSearch.searchImages(item.searchTerm, 5);
        if (results.length === 0) {
          throw new Error(`No images found for search term: "${item.searchTerm}"`);
        }
        const picked = results[Math.floor(Math.random() * results.length)];

        // Download image to temp file
        const tempImagePath = path.join(config.tempDirPath, `${cuid()}.jpg`);
        tempFiles.push(tempImagePath);
        await this.downloadFile(picked.url, tempImagePath);

        media = {
          type: "image",
          url: `http://localhost:${config.port}/tmp/${path.basename(tempImagePath)}`,
          displayMode: item.displayMode ?? "ken_burns",
          width: picked.width,
          height: picked.height,
          duration: sceneDurationMs,
        };
      } else {
        // type === "video" — search Pexels for direct MP4 files
        const results = await this.videoSearch.searchVideos(
          item.searchTerm,
          durationPerItemS,
          orientation,
        );
        if (results.length === 0) {
          throw new Error(`No videos found for search term: "${item.searchTerm}"`);
        }
        const picked = results[Math.floor(Math.random() * results.length)];

        // Download video to temp file
        const tempVideoPath = path.join(config.tempDirPath, `${cuid()}.mp4`);
        tempFiles.push(tempVideoPath);
        await this.downloadFile(picked.url, tempVideoPath);

        media = {
          type: "video",
          url: `http://localhost:${config.port}/tmp/${path.basename(tempVideoPath)}`,
          displayMode: item.displayMode ?? "fit",
          width: picked.width,
          height: picked.height,
        };
      }

      scenes.push({
        media,
        durationMs: sceneDurationMs,
        captions: sceneCaption,
      });

      logger.debug({ videoId, scene: i + 1, type: item.type }, "Scene prepared");
    }

    return scenes;
  }

  private downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(destPath);
      const protocol = url.startsWith("https") ? https : http;

      protocol
        .get(url, (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`Download failed: ${response.statusCode} — ${url}`));
            return;
          }
          response.pipe(fileStream);
          fileStream.on("finish", () => { fileStream.close(); resolve(); });
        })
        .on("error", (err) => {
          fs.removeSync(destPath);
          reject(err);
        });
    });
  }

  private update(
    videoId: string,
    status: "processing" | "ready" | "failed",
    progress: number,
    stage: string,
    outputPath?: string,
    error?: string,
  ): void {
    this.jobsRepo.updateStatus(videoId, status, progress, stage, outputPath, error);
  }
}
