// @ts-nocheck
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { Router } from "express";
import cuid from "cuid";
import type { JobsRepository } from "../db/jobs.repository";
import type { JobQueue } from "../orchestrator/job-queue";
import type { MusicService } from "../services/music/music.service";
import type { StorageService } from "../services/storage/storage.factory";
import { createVideoSchema } from "../types/video.types";
import { logger } from "../logger";

/**
 * Registers all MCP tools on a given McpServer instance.
 * Extracted so each SSE session gets its own server with the same tools.
 */
function registerTools(
  server: McpServer,
  jobsRepo: JobsRepository,
  jobQueue: JobQueue,
  musicService: MusicService,
  storage: StorageService,
): void {
  // Tool: create-video
  server.tool(
    "create-video",
    "Create a YouTube video generation job from a script and video items",
    {
      language: z.enum(["pt", "en"]).default("pt").describe("Script language"),
      ttsProvider: z.enum(["openai", "elevenlabs", "google", "kokoro"]).default("openai").describe("The TTS provider to use"),
      sceneItems: z
        .array(
          z.object({
            imageUrl: z.string().describe("Image URL (required for image-type scenes)"),
            type: z
              .enum(["image", "animated_text", "formula", "3d_image"])
              .describe("Type of scene"),
            displayMode: z
              .enum(["fit", "ken_burns", "static", "slide", "typewriter", "fade", "reveal"])
              .optional()
              .describe("How the media is displayed"),
            duration: z.number().positive().optional().describe("Custom duration in seconds for this scene. Required if sceneNarration is empty."),
            sceneNarration: z.string().optional().describe("Narration for this specific scene. The scene length will match the audio duration."),
          }),
        )
        .min(1)
        .describe("List of scene items (imageUrl required for image scenes)"),
      config: z
        .object({
          orientation: z.enum(["landscape", "portrait"]).default("landscape").describe("Video orientation"),
          voice: z.string().optional().describe("Voice identifier. For ElevenLabs: voice ID (e.g. pNInz6obpgDQGcFmaJgB). For OpenAI: voice name (alloy, echo, fable, onyx, nova, shimmer). For Google Cloud: full voice name (e.g. pt-BR-Neural2-A, en-US-Neural2-D). For Kokoro: voice name (e.g. af_heart, pt_br_voice)."),
          paddingBack: z.number().nonnegative().default(1500).describe("Silence padding at end (ms)"),
          musicVolume: z.enum(["muted", "low", "medium", "high"]).default("medium").describe("Background music volume"),
          useSrt: z.boolean().default(true).describe("Burn subtitles into video"),
          srtStyle: z
            .object({
              position: z.enum(["top", "center", "bottom"]).default("bottom").describe("Subtitle position"),
              backgroundColor: z.string().default("#0066ff").describe("Subtitle background color (hex)"),
              fontSize: z.number().positive().default(48).describe("Subtitle font size in px"),
              fontFamily: z.string().default("Inter").describe("Subtitle font family"),
            })
            .optional()
            .describe("Subtitle styling options"),
          useBackgroundMusic: z.boolean().default(true).describe("Add background music"),
          backgroundMusicStyle: z
            .enum(["sad", "melancholic", "happy", "euphoric", "excited", "chill", "uneasy", "angry", "dark", "hopeful", "contemplative", "funny"])
            .optional()
            .describe("Music mood"),
          backgroundMusicUrl: z.string().url().optional().describe("Optional URL to an external audio file to use as background music."),
        })
        .optional()
        .describe("Video configuration options"),
      webhookUrl: z
        .string()
        .optional()
        .describe("Optional URL to receive a POST callback when video generation completes or fails. Payload includes event type, videoId, status, and download endpoint."),
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
      stage: j.stage,
      createdAt: j.created_at,
    }));
    return { content: [{ type: "text", text: JSON.stringify({ videos: jobs }) }] };
  });

  // Tool: delete-video
  server.tool(
    "delete-video",
    "Delete a video generation job and its output file",
    { videoId: z.string().describe("The video ID to delete") },
    async ({ videoId }) => {
      const job = jobsRepo.findById(videoId);
      if (!job) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "Video not found" }) }] };
      }

      try {
        await storage.delete(videoId);
      } catch {
        // ignore storage errors on delete
      }
      jobsRepo.delete(videoId);

      logger.info({ videoId }, "Video job deleted via MCP");

      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, videoId }) }],
      };
    },
  );

  // Tool: download-video
  server.tool(
    "download-video",
    "Get the download URL or status for a completed video",
    { videoId: z.string().describe("The video ID to download") },
    async ({ videoId }) => {
      const job = jobsRepo.findById(videoId);
      if (!job) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "Video not found" }) }] };
      }
      if (job.status !== "ready") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Video not ready",
                status: job.status,
                progress: job.progress,
                stage: job.stage,
              }),
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              videoId: job.id,
              status: "ready",
              downloadEndpoint: `/api/videos/${videoId}`,
              message: "Video is ready for download via the endpoint above.",
            }),
          },
        ],
      };
    },
  );

  // Tool: list-music-styles
  server.tool("list-music-styles", "List available background music styles/moods", {}, async () => {
    const styles = musicService.listStyles();
    return { content: [{ type: "text", text: JSON.stringify(styles) }] };
  });
}

export function createMcpRouter(
  jobsRepo: JobsRepository,
  jobQueue: JobQueue,
  musicService: MusicService,
  storage: StorageService,
): Router {
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
    registerTools(server, jobsRepo, jobQueue, musicService, storage);

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
