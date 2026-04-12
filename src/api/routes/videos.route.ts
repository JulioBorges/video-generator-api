import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import cuid from "cuid";
import fs from "fs-extra";
import path from "path";
import { createVideoSchema } from "../../types/video.types";
import { JobsRepository } from "../../db/jobs.repository";
import { JobQueue } from "../../orchestrator/job-queue";
import { MusicService } from "../../services/music/music.service";
import { StorageService } from "../../services/storage/storage.factory";
import { logger } from "../../logger";
import { config } from "../../config";

export function createVideosRouter(
  jobsRepo: JobsRepository,
  jobQueue: JobQueue,
  musicService: MusicService,
  storage: StorageService,
): Router {
  const router = Router();

  // POST /api/videos — create video generation job
  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = createVideoSchema.parse(req.body);
      const videoId = cuid();

      jobsRepo.create(videoId, input);
      jobQueue.enqueue(videoId, input);

      logger.info({ videoId, script: input.script.slice(0, 50) }, "Video job created");
      res.status(201).json({ videoId });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/videos — list all jobs
  router.get("/", (_req: Request, res: Response) => {
    const jobs = jobsRepo.findAll();
    res.json({
      videos: jobs.map((j) => ({
        id: j.id,
        status: j.status,
        progress: j.progress,
        stage: j.stage,
        createdAt: j.created_at,
      })),
    });
  });

  // GET /api/videos/:id/status
  router.get("/:id/status", (req: Request, res: Response) => {
    const job = jobsRepo.findById(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Video not found" });
      return;
    }
    res.json({
      videoId: job.id,
      status: job.status,
      progress: job.progress,
      stage: job.stage,
      error: job.error,
      createdAt: job.created_at,
    });
  });

  // GET /api/videos/:id — download video
  router.get("/:id", async (req: Request, res: Response) => {
    const job = jobsRepo.findById(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Video not found" });
      return;
    }
    if (job.status !== "ready") {
      res.status(409).json({ error: "Video not ready", status: job.status });
      return;
    }

    try {
      const videoBuffer = await storage.get(req.params.id);
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", `attachment; filename="${req.params.id}.mp4"`);
      res.setHeader("Content-Length", videoBuffer.length);
      res.send(videoBuffer);
    } catch {
      res.status(404).json({ error: "Video file not found" });
    }
  });

  // DELETE /api/videos/:id
  router.delete("/:id", async (req: Request, res: Response) => {
    const job = jobsRepo.findById(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Video not found" });
      return;
    }

    try {
      await storage.delete(req.params.id);
    } catch {
      // ignore storage errors on delete
    }
    jobsRepo.delete(req.params.id);
    res.json({ success: true });
  });

  // GET /api/music-styles
  router.get("/music-styles", (_req: Request, res: Response) => {
    res.json(musicService.listStyles());
  });

  // Serve temp files for Remotion during render
  router.get("/tmp/:file", (req: Request, res: Response) => {
    const filePath = path.join(config.tempDirPath, req.params.file);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    if (req.params.file.endsWith(".mp3")) res.setHeader("Content-Type", "audio/mpeg");
    if (req.params.file.endsWith(".wav")) res.setHeader("Content-Type", "audio/wav");
    if (req.params.file.endsWith(".mp4")) res.setHeader("Content-Type", "video/mp4");
    fs.createReadStream(filePath).pipe(res);
  });

  // Serve music files for Remotion
  router.get("/music/:file", (req: Request, res: Response) => {
    const filePath = path.join(config.musicDirPath, req.params.file);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "Music file not found" });
      return;
    }
    res.setHeader("Content-Type", "audio/mpeg");
    fs.createReadStream(filePath).pipe(res);
  });

  return router;
}
