import path from "path";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import { authMiddleware } from "./middleware/auth.middleware";
import { errorHandler } from "./middleware/error-handler.middleware";
import { createVideosRouter } from "./routes/videos.route";
import { openApiSpec } from "./docs/swagger";
import { JobsRepository } from "../db/jobs.repository";
import { JobQueue } from "../orchestrator/job-queue";
import { MusicService } from "../services/music/music.service";
import { StorageService } from "../services/storage/storage.factory";
import { logger } from "../logger";
import { config } from "../config";

export function createApp(
  jobsRepo: JobsRepository,
  jobQueue: JobQueue,
  musicService: MusicService,
  storage: StorageService,
): express.Application {
  const app = express();

  // Security headers (keep cross-origin loose for local Remotion Chromium)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false,
      crossOriginOpenerPolicy: false,
    }),
  );
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  // Global rate limit
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: { error: "Too many requests", message: "Rate limit exceeded" },
    }),
  );

  // Request logging
  app.use((req, _res, next) => {
    logger.debug({ method: req.method, path: req.path }, "Incoming request");
    next();
  });

  // Health check (no auth required)
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Swagger docs (no auth required)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use("/docs", ...(swaggerUi.serve as any[]), swaggerUi.setup(openApiSpec) as any);

  // Unauthenticated static routes for Remotion (headless Chromium cannot send API-Key headers)
  app.use("/tmp", express.static(config.tempDirPath, { maxAge: "1h" }));
  app.use("/music", express.static(config.musicDirPath, { maxAge: "1d" }));

  // Protected API routes
  app.use("/api/videos", authMiddleware, createVideosRouter(jobsRepo, jobQueue, musicService, storage));

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}

export function startServer(app: express.Application): void {
  const server = app.listen(config.port, () => {
    logger.info(
      { port: config.port, docs: `http://localhost:${config.port}/docs` },
      "Video Generator API started",
    );
  });

  server.on("error", (err) => {
    logger.error(err, "Server error");
    process.exit(1);
  });
}
