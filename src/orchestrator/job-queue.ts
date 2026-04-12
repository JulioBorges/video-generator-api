import PQueue from "p-queue";
import type { CreateVideoInput } from "../types/video.types";
import type { JobsRepository } from "../db/jobs.repository";
import { VideoPipeline } from "./video-pipeline";
import { logger } from "../logger";

export class JobQueue {
  private queue: PQueue;

  constructor(
    private jobsRepo: JobsRepository,
    private pipeline: VideoPipeline,
    concurrency: number = 1,
  ) {
    this.queue = new PQueue({ concurrency });
  }

  enqueue(videoId: string, input: CreateVideoInput): void {
    this.queue.add(async () => {
      logger.info({ videoId, queueSize: this.queue.size }, "Starting video job");
      try {
        await this.pipeline.execute(videoId, input);
      } catch (err) {
        logger.error({ videoId, err }, "Pipeline failed");
      }
    });

    logger.debug({ videoId, pending: this.queue.size + this.queue.pending }, "Job enqueued");
  }

  get pendingCount(): number {
    return this.queue.size + this.queue.pending;
  }
}
