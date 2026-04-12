import path from "path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition, ensureBrowser } from "@remotion/renderer";
import type { AppConfig } from "../../config";
import { logger } from "../../logger";

export interface RemotionRenderInput {
  scenes: Array<{
    media: {
      type: string;
      url: string;
      displayMode?: string;
      width?: number;
      height?: number;
    };
    durationMs: number;
    captions: Array<{ text: string; startMs: number; endMs: number }>;
  }>;
  voiceover: { url: string };
  music?: {
    url: string;
    file: string;
    start: number;
    end: number;
  };
  config: {
    durationMs: number;
    orientation: string;
    useSrt: boolean;
    srtStyle?: Record<string, unknown>;
    musicVolume?: string;
    paddingBack?: number;
  };
}

export class RemotionService {
  private bundled: string | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(private appConfig: AppConfig) { }

  async init(): Promise<void> {
    this.initPromise = this._doInit();
    return this.initPromise;
  }

  private async _doInit(): Promise<void> {
    await ensureBrowser();
    const entryPoint = path.join(
      this.appConfig.packageDirPath,
      "src",
      "remotion",
      "Root.tsx",
    );
    this.bundled = await bundle({ entryPoint });
    logger.info("Remotion bundle ready");
  }

  async render(input: RemotionRenderInput, videoId: string): Promise<string> {
    // Wait for lazy init to complete if still running
    if (this.initPromise) {
      await this.initPromise;
    }
    if (!this.bundled) throw new Error("RemotionService not initialized — call init() first");

    const compositionId =
      input.config.orientation === "portrait" ? "ShortsVideo" : "YouTubeVideo";

    const composition = await selectComposition({
      serveUrl: this.bundled,
      id: compositionId,
      inputProps: input as unknown as Record<string, unknown>,
    });

    const outputLocation = path.join(this.appConfig.videosDirPath, `${videoId}.mp4`);

    await renderMedia({
      codec: "h264",
      composition,
      serveUrl: this.bundled,
      outputLocation,
      inputProps: input as unknown as Record<string, unknown>,
      concurrency: this.appConfig.concurrency,
      onProgress: ({ progress }) => {
        logger.debug(
          { videoId, progress: Math.floor(progress * 100) },
          "Remotion render progress",
        );
      },
    });

    logger.info({ videoId, outputLocation }, "Remotion render complete");
    return outputLocation;
  }
}
