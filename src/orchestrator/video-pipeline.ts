import path from "path";
import https from "https";
import http from "http";
import cuid from "cuid";
import fs from "fs-extra";
import type { CreateVideoInput, SceneMedia, ComposedScene, Caption } from "../types/video.types";
import type { JobsRepository } from "../db/jobs.repository";

import type { TTSFactory } from "../services/tts/tts.factory";

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
    private musicService: MusicService,
    private ffmpeg: FFmpegService,
    private remotion: RemotionService,
    private storage: StorageService,
  ) {}


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
      this.update(videoId, "processing", PROGRESS.TTS_START, "scene_processing");

      logger.info({ videoId, itemCount: input.sceneItems.length }, "Step 1 & 2: Scene processing (TTS + Media)");
      const orientation = input.config?.orientation ?? "landscape";
      const maxLineLength = orientation === "landscape" ? 40 : 20;
      const tts = this.ttsFactory.getProvider(input.ttsProvider ?? "openai");
      const paddingBackMs = input.config?.paddingBack ?? 1500;
      
      let finalTotalMs = 0;
      const scenes: ComposedScene[] = [];

      for (let i = 0; i < input.sceneItems.length; i++) {
        const item = input.sceneItems[i];
        let sceneDurationMs = 0;
        let captions: Caption[] = [];
        let audioUrl: string | undefined = undefined;

        // --- Audio & Subtitles ---
        if (item.sceneNarration) {
          const ttsResult = await tts.generate(
            item.sceneNarration,
            input.language,
            input.config?.voice,
            input.config?.voiceSpeed,
            config.tempDirPath,
            this.ffmpeg,
          );
          
          sceneDurationMs = ttsResult.durationMs + 300; // Add small buffer to prevent audio cut at the end of scenes
          audioUrl = `http://127.0.0.1:${config.port}/tmp/${path.basename(ttsResult.audioFilePath)}`;
          tempFiles.push(ttsResult.audioFilePath);

          const wordCaptions = this.subtitleService.buildCaptions(ttsResult.timestamps);
          const pages = this.subtitleService.createCaptionPages(wordCaptions, maxLineLength);
          
          captions = pages.map(p => {
            const text = p.lines.map(l => l.texts.map(t => t.text).join(" ")).join("\n");
            return {
              text,
              startMs: p.startMs,
              endMs: p.endMs,
            };
          });
        } else {
          // Duration is required if sceneNarration is empty
          sceneDurationMs = (item.duration || 2) * 1000;
        }

        // Add padding back to the last scene
        if (i === input.sceneItems.length - 1) {
          sceneDurationMs += paddingBackMs;
        }

        finalTotalMs += sceneDurationMs;

        // --- Media ---
        let media: SceneMedia;

        if (item.type === "animated_text" || item.type === "formula" || item.type === "3d_image") {
          media = {
            type: item.type,
            url: item.imageUrl || "content",
            displayMode: item.displayMode,
            duration: sceneDurationMs,
          };
        } else {
          if (!item.imageUrl) {
            throw new Error(`imageUrl is required for image scene ${i + 1}`);
          }

          const tempImagePath = path.join(config.tempDirPath, `${cuid()}.jpg`);
          tempFiles.push(tempImagePath);

          try {
            await this.downloadFile(item.imageUrl, tempImagePath);
          } catch (err) {
            logger.error({ url: item.imageUrl, err }, "Image download failed");
            throw new Error(`Failed to download image for scene ${i + 1}: ${item.imageUrl}`);
          }

          media = {
            type: "image",
            url: `http://127.0.0.1:${config.port}/tmp/${path.basename(tempImagePath)}`,
            displayMode: item.displayMode ?? "ken_burns",
            duration: sceneDurationMs,
          };
        }

        scenes.push({
          media,
          durationMs: sceneDurationMs,
          captions,
          audioUrl,
        });

        logger.debug({ videoId, scene: i + 1, type: item.type }, "Scene prepared");
      }

      recordStage("SceneProcessing");
      this.update(videoId, "processing", PROGRESS.MEDIA_DONE, "rendering");

      // 4. Compose Remotion render input
      logger.info({ videoId }, "Step 4: Remotion rendering");
      let musicTrack;
      
      if (input.config?.backgroundMusicUrl) {
        musicTrack = {
          file: "external",
          url: input.config.backgroundMusicUrl,
          start: 0,
          end: finalTotalMs / 1000,
          mood: "happy" as any, // Only needed for type constraints
        };
      } else if (input.config?.useBackgroundMusic ?? true) {
        musicTrack = this.musicService.pickTrack(input.config?.backgroundMusicStyle);
      }

      const renderInput = {
        scenes: scenes.map((s) => ({
          media: s.media,
          durationMs: s.durationMs,
          captions: s.captions,
          audioUrl: s.audioUrl,
        })),
        music: musicTrack,
        config: {
          durationMs: finalTotalMs,
          orientation,
          useSrt: input.config?.useSrt ?? true,
          srtStyle: input.config?.srtStyle,
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


  private downloadFile(url: string, destPath: string, maxRedirects = 5): Promise<void> {
    return new Promise((resolve, reject) => {
      const attempt = (currentUrl: string, redirectsLeft: number) => {
        // Node 18+ fix: map localhost to 127.0.0.1 to avoid IPv6 ECONNREFUSED issues
        currentUrl = currentUrl.replace('http://localhost:', 'http://127.0.0.1:');
        
        const protocol = currentUrl.startsWith("https") ? https : http;
        const options = {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; VideoGeneratorBot/1.0)",
          },
        };

        protocol
          .get(currentUrl, options, (response) => {
            const statusCode = response.statusCode ?? 0;

            // Follow redirects (301, 302, 307, 308)
            if ([301, 302, 307, 308].includes(statusCode) && response.headers.location) {
              response.resume(); // drain response to free socket
              if (redirectsLeft <= 0) {
                reject(new Error(`Too many redirects for: ${url}`));
                return;
              }
              const redirectUrl = new URL(response.headers.location, currentUrl).href;
              attempt(redirectUrl, redirectsLeft - 1);
              return;
            }

            if (statusCode !== 200) {
              response.resume();
              reject(new Error(`Download failed: ${statusCode} — ${currentUrl}`));
              return;
            }

            const fileStream = fs.createWriteStream(destPath);
            response.pipe(fileStream);
            fileStream.on("finish", () => { fileStream.close(); resolve(); });
            fileStream.on("error", (err) => {
              fs.removeSync(destPath);
              reject(err);
            });
          })
          .on("error", (err) => {
            fs.removeSync(destPath);
            reject(err);
          });
      };

      attempt(url, maxRedirects);
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
