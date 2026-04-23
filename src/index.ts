import "dotenv/config";
import fs from "fs-extra";
import { config } from "./config";
import { logger } from "./logger";
import { getDb } from "./db/sqlite";
import { JobsRepository } from "./db/jobs.repository";
import { ElevenLabsService } from "./services/tts/elevenlabs.service";
import { SerpApiService } from "./services/media-search/serpapi.service";
import { PexelsService } from "./services/media-search/pexels.service";
import { MusicService } from "./services/music/music.service";
import { FFmpegService } from "./services/renderer/ffmpeg.service";
import { RemotionService } from "./services/renderer/remotion.service";
import { createStorageService } from "./services/storage/storage.factory";
import { VideoPipeline } from "./orchestrator/video-pipeline";
import { JobQueue } from "./orchestrator/job-queue";
import { createApp, startServer } from "./api/server";
import { createMcpRouter } from "./mcp/mcp-server";

async function bootstrap() {
  logger.info("Starting Video Generator API...");

  // Ensure data directories exist
  fs.ensureDirSync(config.videosDirPath);
  fs.ensureDirSync(config.tempDirPath);

  // Database
  const db = getDb(config.dbPath);
  const jobsRepo = new JobsRepository(db);

  // Services
  const tts = new ElevenLabsService(config.elevenLabsApiKey);
  const imageSearch = new SerpApiService(config.serpApiKey);
  const videoSearch = new PexelsService(config.pexelsApiKey);
  const storage = createStorageService(config);
  const musicService = new MusicService(
    config.musicDirPath,
    `http://0.0.0.0:${config.port}`,
  );
  musicService.ensureMusicFilesExist();

  const ffmpeg = await FFmpegService.init();
  const remotion = new RemotionService(config);

  // Start Remotion bundling in background — server must listen on PORT before Cloud Run timeout
  remotion.init().catch((err) => {
    logger.error(err, "Remotion init failed — video rendering will be unavailable");
  });

  // Orchestrator
  const pipeline = new VideoPipeline(
    jobsRepo,
    tts,
    imageSearch,
    videoSearch,
    musicService,
    ffmpeg,
    remotion,
    storage,
  );
  const jobQueue = new JobQueue(jobsRepo, pipeline, config.concurrency);

  // Express app
  const app = createApp(jobsRepo, jobQueue, musicService, storage);

  // MCP router
  const mcpRouter = createMcpRouter(jobsRepo, jobQueue, musicService, storage);
  app.use("/", mcpRouter);

  startServer(app);
}

bootstrap().catch((err) => {
  logger.error(err, "Fatal bootstrap error");
  process.exit(1);
});
