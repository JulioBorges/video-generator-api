import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { Router } from "express";
import cuid from "cuid";
import type { JobsRepository } from "../db/jobs.repository";
import type { JobQueue } from "../orchestrator/job-queue";
import { createVideoSchema } from "../types/video.types";
import { logger } from "../logger";

export function createMcpRouter(jobsRepo: JobsRepository, jobQueue: JobQueue): Router {
  const router = Router();

  const server = new McpServer({
    name: "video-generator",
    version: "1.0.0",
  });

  // Tool: create-video
  server.tool(
    "create-video",
    "Create a YouTube video generation job from a script and video items",
    {
      script: z.string().describe("The video narration script"),
      language: z.enum(["pt", "en"]).default("pt").describe("Script language"),
      videoItems: z
        .array(
          z.object({
            searchTerm: z.string().describe("Search term for media"),
            type: z
              .enum(["video", "image", "animated_text", "formula", "3d_image"])
              .describe("Type of scene"),
            displayMode: z
              .enum(["fit", "ken_burns", "static", "slide", "typewriter", "fade", "reveal"])
              .optional(),
          }),
        )
        .describe("List of scene items"),
      useBackgroundMusic: z.boolean().default(true).describe("Add background music"),
      backgroundMusicStyle: z
        .enum(["sad","melancholic","happy","euphoric","excited","chill","uneasy","angry","dark","hopeful","contemplative","funny"])
        .optional()
        .describe("Music mood"),
      useSrt: z.boolean().default(true).describe("Burn subtitles into video"),
    },
    async (params) => {
      const input = createVideoSchema.parse(params);
      const videoId = cuid();

      jobsRepo.create(videoId, input);
      jobQueue.enqueue(videoId, input);

      logger.info({ videoId }, "Video job created via MCP");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              videoId,
              message: `Video generation started. Check status with get-video-status tool.`,
              statusEndpoint: `/api/videos/${videoId}/status`,
            }),
          },
        ],
      };
    },
  );

  // Tool: get-video-status
  server.tool(
    "get-video-status",
    "Get the status and progress of a video generation job",
    { videoId: z.string().describe("The video ID returned by create-video") },
    async ({ videoId }) => {
      const job = jobsRepo.findById(videoId);
      if (!job) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "Video not found" }) }] };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              videoId: job.id,
              status: job.status,
              progress: job.progress,
              stage: job.stage,
              error: job.error,
              createdAt: job.created_at,
            }),
          },
        ],
      };
    },
  );

  // Tool: list-videos
  server.tool("list-videos", "List all video generation jobs", {}, async () => {
    const jobs = jobsRepo.findAll().map((j) => ({
      id: j.id,
      status: j.status,
      progress: j.progress,
      createdAt: j.created_at,
    }));
    return { content: [{ type: "text", text: JSON.stringify({ videos: jobs }) }] };
  });

  // MCP HTTP transport
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => cuid() });
  server.connect(transport).catch((err) => logger.error(err, "MCP server connection error"));

  router.all("/mcp", async (req, res) => {
    await transport.handleRequest(req, res, req.body);
  });

  return router;
}
