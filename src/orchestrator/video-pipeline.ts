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
    private videoSearch: MediaSearchProvider, // Manteve para dependência existente mas inativo
    private musicService: MusicService,
    private ffmpeg: FFmpegService,
    private remotion: RemotionService,
    private storage: StorageService,
  ) {}

  private calculateTimings(items: CreateVideoInput["videoItems"], totalAudioMs: number) {
    const MIN_DURATION_MS = 2000;
    
    // 1. Assign explicit requests
    let raw = items.map(item => item.duration ? item.duration * 1000 : null);
    const explicitSum = raw.reduce((a, b) => a! + (b || 0), 0) as number;
    const missing = raw.filter(x => x === null).length;

    // 2. Check budget remaining for missing
    const remaining = totalAudioMs - explicitSum;

    if (remaining < missing * MIN_DURATION_MS) {
       // Escala proporcional: total requested vs total avaiable
       const totalRequested = explicitSum + (missing * MIN_DURATION_MS);
       const scale = totalAudioMs / totalRequested;
       
       raw = raw.map(v => v === null ? (MIN_DURATION_MS * scale) : (v * scale));
       
       // Força limite minimo e estende se for fisicamente impossível
       raw = raw.map(v => Math.max(v!, MIN_DURATION_MS));
    } else {
       const distribute = missing > 0 ? remaining / missing : 0;
       raw = raw.map(v => v === null ? distribute : v);
       // Forçar limite novamente para as requests explícitas curtas
       raw = raw.map(v => Math.max(v!, MIN_DURATION_MS));
    }

    const finalDurations = raw as number[];
    const finalTotalMs = finalDurations.reduce((a, b) => a + b, 0);

    return { durationsMs: finalDurations, finalTotalMs: Math.max(totalAudioMs, finalTotalMs) };
  }

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
      
      const { durationsMs, finalTotalMs } = this.calculateTimings(input.videoItems, ttsResult.durationMs);

      const scenes: ComposedScene[] = await this.buildScenes(
        input,
        captions,
        audioMp3Path,
        durationsMs,
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
          durationMs: finalTotalMs + (input.config?.paddingBack ?? 0),
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

      // Webhook notification on success
      if (input.webhookUrl) {
        await this.notifyWebhook(input.webhookUrl, {
          event: "video.completed",
          videoId,
          status: "ready",
          outputPath,
          downloadEndpoint: `/api/videos/${videoId}`,
          completedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ videoId, err }, "Pipeline error");
      this.jobsRepo.updateStatus(videoId, "failed", 0, "error", undefined, message);

      // Webhook notification on failure
      if (input.webhookUrl) {
        await this.notifyWebhook(input.webhookUrl, {
          event: "video.failed",
          videoId,
          status: "failed",
          error: message,
          failedAt: new Date().toISOString(),
        });
      }
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
    durationsMs: number[],
    orientation: "landscape" | "portrait",
    tempFiles: string[],
    videoId: string,
  ): Promise<ComposedScene[]> {
    const scenes: ComposedScene[] = [];
    let currentTimeMs = 0;

    for (let i = 0; i < input.videoItems.length; i++) {
      const item = input.videoItems[i];
      const sceneDurationMs = durationsMs[i];
      const sceneStartMs = currentTimeMs;
      const sceneEndMs = sceneStartMs + sceneDurationMs;
      currentTimeMs = sceneEndMs;

      // Filter captions accurately based on their actual timing bounds
      const sceneCaption = captions.filter(
         c => (c.startMs >= sceneStartMs && c.startMs < sceneEndMs) || (c.endMs > sceneStartMs && c.endMs <= sceneEndMs)
      );

      // Build scene media URL
      let media: SceneMedia;

      if (item.type === "animated_text" || item.type === "formula" || item.type === "3d_image") {
        // Text-based scenes — no external media needed
        media = {
          type: item.type,
          url: item.searchTerm || item.imageUrl || "content", // used as content
          displayMode: item.displayMode,
          duration: sceneDurationMs,
        };
      } else {
        // Todo o resto cai na pesquisa padronizada de Imagem
        // Removemos o provedor de Video (Pexels) por demanda de otimização
        let imageUrl = item.imageUrl;
        let imageWidth: number | undefined;
        let imageHeight: number | undefined;

        if (!imageUrl) {
          const term = item.searchTerm || "background";
          const results = await this.imageSearch.searchImages(term, 5);
          if (results.length === 0) {
            throw new Error(`No images found for search term: "${term}"`);
          }
          const picked = results[Math.floor(Math.random() * results.length)];
          imageUrl = picked.url;
          imageWidth = picked.width;
          imageHeight = picked.height;
        }

        // Download image to temp file (to avoid CORS and cache headlessly)
        const tempImagePath = path.join(config.tempDirPath, `${cuid()}.jpg`);
        tempFiles.push(tempImagePath);
        await this.downloadFile(imageUrl, tempImagePath);

        media = {
          type: "image",
          url: `http://localhost:${config.port}/tmp/${path.basename(tempImagePath)}`,
          displayMode: item.displayMode ?? "ken_burns",
          width: imageWidth,
          height: imageHeight,
          duration: sceneDurationMs,
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

  private async notifyWebhook(webhookUrl: string, payload: Record<string, unknown>): Promise<void> {
    try {
      const body = JSON.stringify(payload);
      const url = new URL(webhookUrl);
      const protocol = url.protocol === "https:" ? https : http;

      await new Promise<void>((resolve, reject) => {
        const req = protocol.request(
          webhookUrl,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body),
            },
            timeout: 10_000,
          },
          (res) => {
            // Drain response to free socket
            res.resume();
            res.on("end", resolve);
          },
        );
        req.on("error", reject);
        req.on("timeout", () => { req.destroy(); reject(new Error("Webhook timeout")); });
        req.write(body);
        req.end();
      });

      logger.info({ webhookUrl, event: payload.event }, "Webhook delivered");
    } catch (err) {
      logger.warn({ webhookUrl, err }, "Webhook delivery failed (non-blocking)");
    }
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
