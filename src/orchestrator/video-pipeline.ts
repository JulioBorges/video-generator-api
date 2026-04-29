import path from "path";
import https from "https";
import http from "http";
import cuid from "cuid";
import fs from "fs-extra";
import type { CreateVideoInput, SceneMedia, ComposedScene, Caption } from "../types/video.types";
import type { JobsRepository } from "../db/jobs.repository";

import type { TTSFactory } from "../services/tts/tts.factory";
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
    private ttsFactory: TTSFactory,
    private imageSearch: MediaSearchProvider,
    private videoSearch: MediaSearchProvider, // Manteve para dependência existente mas inativo
    private musicService: MusicService,
    private ffmpeg: FFmpegService,
    private remotion: RemotionService,
    private storage: StorageService,
  ) {}

  private calculateTimings(items: CreateVideoInput["videoItems"], totalAudioMs: number, paddingBackMs: number) {
    const MIN_DURATION_MS = 1500;
    
    // 1. Get requested durations
    let rawDurations = items.map(item => item.duration ? item.duration * 1000 : null);
    const missingCount = rawDurations.filter(x => x === null).length;
    
    // Calculate total requested duration
    let sumRequested = 0;
    rawDurations.forEach(d => {
      if (d !== null) sumRequested += d;
    });

    if (missingCount > 0) {
      // If some are missing, fill the gap based on audio length or use a safe default
      const gap = Math.max(0, totalAudioMs - sumRequested);
      const perMissing = gap > 0 ? gap / missingCount : Math.max(MIN_DURATION_MS, totalAudioMs / items.length);
      rawDurations = rawDurations.map(d => d === null ? perMissing : d);
      sumRequested = rawDurations.reduce((a, b) => a! + b!, 0) as number;
    }

    // 2. Proportional Redistribution
    // Ensure the SUM of scene durations matches totalAudioMs exactly before padding
    const scaleFactor = sumRequested > 0 ? totalAudioMs / sumRequested : 1;
    
    // Apply scale and ensure MIN_DURATION
    let finalDurations = rawDurations.map(d => Math.max(d! * scaleFactor, MIN_DURATION_MS));
    
    // 3. Final alignment (Fixing rounding errors or MIN_DURATION overhead)
    // Adjust the LAST scene to ensure the total is EXACTLY totalAudioMs
    const currentTotal = finalDurations.reduce((a, b) => a + b, 0);
    const diff = totalAudioMs - currentTotal;
    
    if (finalDurations.length > 0) {
      finalDurations[finalDurations.length - 1] = Math.max(MIN_DURATION_MS, finalDurations[finalDurations.length - 1] + diff);
    }

    // 4. Add paddingBack to the LAST scene
    if (finalDurations.length > 0) {
      finalDurations[finalDurations.length - 1] += paddingBackMs;
    }

    const finalTotalMs = finalDurations.reduce((a, b) => a + b, 0);

    return { durationsMs: finalDurations, finalTotalMs };
  }

  async execute(videoId: string, input: CreateVideoInput): Promise<void> {
    const tempFiles: string[] = [];
    const startTime = performance.now();
    const stageTimes: Record<string, number> = {};
    let lastStageTime = startTime;

    const recordStage = (stageName: string) => {
      const now = performance.now();
      stageTimes[stageName] = Math.round(now - lastStageTime);
      lastStageTime = now;
    };

    try {
      this.update(videoId, "processing", PROGRESS.TTS_START, "tts_generation");

      // 1. Generate TTS audio for the full script
      logger.info({ videoId }, "Step 1: TTS generation");
      const tts = this.ttsFactory.getProvider(input.ttsProvider ?? "openai");
      const ttsResult = await tts.generate(
        input.script,
        input.language,
        input.config?.voice,
        config.tempDirPath,
        this.ffmpeg,
      );
      recordStage("TTS");

      // TTS now returns an MP3 file on disk — use it directly
      const audioMp3Path = ttsResult.audioFilePath;
      tempFiles.push(audioMp3Path);

      this.update(videoId, "processing", PROGRESS.TTS_DONE, "subtitle_generation");

      // 2. Build captions from word timestamps
      logger.info({ videoId }, "Step 2: Subtitle generation");
      const orientation = input.config?.orientation ?? "landscape";
      const maxLineLength = orientation === "landscape" ? 40 : 20;
      
      const wordCaptions: Caption[] = this.subtitleService.buildCaptions(ttsResult.timestamps);
      const pages = this.subtitleService.createCaptionPages(wordCaptions, maxLineLength);
      
      // Map pages back into single Caption objects so the rest of the pipeline renders blocks of text
      const captions: Caption[] = pages.map(p => {
        const text = p.lines.map(l => l.texts.map(t => t.text).join(" ")).join("\n");
        return {
          text,
          startMs: p.startMs,
          endMs: p.endMs,
        };
      });

      recordStage("Subtitles");
      this.update(videoId, "processing", PROGRESS.SUBTITLES_DONE, "media_search");

      // 3. Search & download media for each video item
      logger.info({ videoId, itemCount: input.videoItems.length }, "Step 3: Media search");
      const paddingBackMs = input.config?.paddingBack ?? 1500;
      
      const { durationsMs, finalTotalMs } = this.calculateTimings(
        input.videoItems, 
        ttsResult.durationMs,
        paddingBackMs
      );

      const scenes: ComposedScene[] = await this.buildScenes(
        input,
        captions,
        audioMp3Path,
        durationsMs,
        orientation,
        tempFiles,
        videoId,
      );

      recordStage("MediaSearch");
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
          durationMs: finalTotalMs,
          orientation,
          useSrt: input.useSrt,
          srtStyle: input.srtStyle,
          musicVolume: input.config?.musicVolume ?? "medium",
          paddingBack: paddingBackMs,
        },
      };

      const renderedPath = await this.remotion.render(renderInput, videoId);

      recordStage("RemotionRender");
      this.update(videoId, "processing", PROGRESS.RENDER_DONE, "storage");

      // 5. Save to storage
      logger.info({ videoId, renderedPath }, "Step 5: Storage");
      const videoBuffer = await fs.readFile(renderedPath);
      const outputPath = await this.storage.save(videoId, videoBuffer);

      recordStage("Storage");
      this.update(videoId, "ready", PROGRESS.STORAGE_DONE, "done", outputPath);
      
      const totalTime = Math.round(performance.now() - startTime);
      const mem = process.memoryUsage();
      const cpu = process.cpuUsage();
      
      logger.info({ 
        videoId, 
        outputPath,
        telemetry: {
          totalTimeMs: totalTime,
          stageTimesMs: stageTimes,
          memoryUsageMB: {
            rss: Math.round(mem.rss / 1024 / 1024),
            heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
            heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
          },
          cpuUsageMicros: cpu,
        }
      }, "Video generation complete and telemetry logged");

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
