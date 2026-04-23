export const openApiSpec = {
  openapi: "3.0.0",
  info: {
    title: "Video Generator API",
    version: "1.0.0",
    description:
      "API for asynchronous generation of YouTube videos from scripts using ElevenLabs TTS, SerpAPI/Pexels media search, and Remotion rendering.",
    contact: { name: "API Support" },
  },
  servers: [{ url: "/api", description: "API server" }],
  security: [{ ApiKeyAuth: [] }],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: "API key configured via API_KEY environment variable",
      },
    },
    schemas: {
      VideoItem: {
        type: "object",
        required: ["type"],
        properties: {
          searchTerm: { type: "string", example: "artificial intelligence" },
          imageUrl: { type: "string", format: "uri", example: "https://example.com/image.jpg" },
          type: {
            type: "string",
            enum: ["image", "animated_text", "formula", "3d_image"],
          },
          displayMode: {
            type: "string",
            enum: ["fit", "ken_burns", "static", "slide", "typewriter", "fade", "reveal"],
          },
          duration: { type: "number", example: 5, description: "Duration in seconds (e.g. 2 for 2s)" },
        },
      },
      SrtStyle: {
        type: "object",
        properties: {
          position: { type: "string", enum: ["top", "center", "bottom"], default: "bottom" },
          backgroundColor: { type: "string", example: "#0066ff" },
          fontSize: { type: "number", default: 48 },
          fontFamily: { type: "string", default: "Inter" },
        },
      },
      CreateVideoRequest: {
        type: "object",
        required: ["script", "videoItems"],
        properties: {
          script: { type: "string", minLength: 10, example: "Neste vídeo vamos aprender sobre IA" },
          language: { type: "string", enum: ["pt", "en"], default: "pt" },
          videoItems: {
            type: "array",
            items: { $ref: "#/components/schemas/VideoItem" },
            minItems: 1,
          },
          useSrt: { type: "boolean", default: true },
          srtStyle: { $ref: "#/components/schemas/SrtStyle" },
          useBackgroundMusic: { type: "boolean", default: true },
          backgroundMusicStyle: {
            type: "string",
            enum: ["sad","melancholic","happy","euphoric","excited","chill","uneasy","angry","dark","hopeful","contemplative","funny"],
          },
          config: {
            type: "object",
            properties: {
              orientation: { type: "string", enum: ["landscape", "portrait"], default: "landscape" },
              voice: { type: "string", example: "pNInz6obpgDQGcFmaJgB" },
              paddingBack: { type: "number", default: 1500 },
              musicVolume: { type: "string", enum: ["muted", "low", "medium", "high"], default: "medium" },
            },
          },
          webhookUrl: {
            type: "string",
            format: "uri",
            example: "https://example.com/hooks/video-ready",
            description: "Optional URL to receive a POST callback when video generation completes or fails. Payload: { event, videoId, status, outputPath?, downloadEndpoint?, error?, timestamp }",
          },
        },
      },
      VideoStatusResponse: {
        type: "object",
        properties: {
          videoId: { type: "string" },
          status: { type: "string", enum: ["queued", "processing", "ready", "failed"] },
          progress: { type: "number", minimum: 0, maximum: 100 },
          stage: { type: "string", nullable: true },
          error: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
          message: { type: "string" },
        },
      },
      WebhookCompletedPayload: {
        type: "object",
        description: "Payload sent via POST to webhookUrl when video generation succeeds",
        properties: {
          event: { type: "string", enum: ["video.completed"], example: "video.completed" },
          videoId: { type: "string" },
          status: { type: "string", enum: ["ready"] },
          outputPath: { type: "string" },
          downloadEndpoint: { type: "string", example: "/api/videos/{videoId}" },
          completedAt: { type: "string", format: "date-time" },
        },
      },
      WebhookFailedPayload: {
        type: "object",
        description: "Payload sent via POST to webhookUrl when video generation fails",
        properties: {
          event: { type: "string", enum: ["video.failed"], example: "video.failed" },
          videoId: { type: "string" },
          status: { type: "string", enum: ["failed"] },
          error: { type: "string" },
          failedAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
  paths: {
    "/videos": {
      post: {
        summary: "Create a video generation job",
        operationId: "createVideo",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateVideoRequest" } } },
        },
        responses: {
          "201": {
            description: "Job created",
            content: {
              "application/json": {
                schema: { type: "object", properties: { videoId: { type: "string" } } },
              },
            },
          },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { description: "Unauthorized" },
        },
      },
      get: {
        summary: "List all video jobs",
        operationId: "listVideos",
        responses: {
          "200": {
            description: "List of video jobs",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    videos: {
                      type: "array",
                      items: { $ref: "#/components/schemas/VideoStatusResponse" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/videos/{id}/status": {
      get: {
        summary: "Get video generation status",
        operationId: "getVideoStatus",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Video status",
            content: { "application/json": { schema: { $ref: "#/components/schemas/VideoStatusResponse" } } },
          },
          "404": { description: "Video not found" },
        },
      },
    },
    "/videos/{id}": {
      get: {
        summary: "Download a rendered video",
        operationId: "downloadVideo",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Video file (MP4)", content: { "video/mp4": {} } },
          "404": { description: "Video not found" },
          "409": { description: "Video not ready yet" },
        },
      },
      delete: {
        summary: "Delete a video",
        operationId: "deleteVideo",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Deleted successfully" },
          "404": { description: "Video not found" },
        },
      },
    },
    "/videos/music-styles": {
      get: {
        summary: "List available background music styles",
        operationId: "listMusicStyles",
        responses: {
          "200": {
            description: "Array of music style names",
            content: { "application/json": { schema: { type: "array", items: { type: "string" } } } },
          },
        },
      },
    },
  },
};
