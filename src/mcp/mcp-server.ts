// @ts-nocheck
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { Router } from "express";
import cuid from "cuid";
import type { JobsRepository } from "../db/jobs.repository";
import type { JobQueue } from "../orchestrator/job-queue";
import { createVideoSchema } from "../types/video.types";
import { logger } from "../logger";

/**
 * Registers all MCP tools on a given McpServer instance.
 * Extracted so each SSE session gets its own server with the same tools.
 */
function registerTools(server: McpServer, jobsRepo: JobsRepository, jobQueue: JobQueue): void {
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
}

export function createMcpRouter(jobsRepo: JobsRepository, jobQueue: JobQueue): Router {
  const router = Router();

  // Active SSE sessions keyed by sessionId
  const sessions = new Map<string, SSEServerTransport>();

  // GET /sse — establishes the SSE stream (n8n connects here)
  router.get("/sse", async (req, res) => {
    logger.info("MCP SSE connection established");

    const transport = new SSEServerTransport("/messages", res);
    sessions.set(transport.sessionId, transport);

    // Each SSE connection gets its own McpServer instance
    const server = new McpServer({
      name: "video-generator",
      version: "1.0.0",
    });
    registerTools(server, jobsRepo, jobQueue);

    res.on("close", () => {
      logger.info({ sessionId: transport.sessionId }, "MCP SSE connection closed");
      sessions.delete(transport.sessionId);
    });

    await server.connect(transport);
  });

  // POST /messages?sessionId=xxx — receives JSON-RPC messages from the client
  router.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = sessions.get(sessionId);

    if (!transport) {
      logger.warn({ sessionId }, "MCP message for unknown session");
      res.status(400).json({ error: "Invalid or expired session" });
      return;
    }

    try {
      await transport.handlePostMessage(req, res, req.body);
    } catch (err) {
      logger.error(err, "MCP handlePostMessage error");
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal MCP error" });
      }
    }
  });

  return router;
}
