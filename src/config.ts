import "dotenv/config";
import path from "path";
import os from "os";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  API_KEY: z.string().default(""),

  TTS_PROVIDER: z.enum(["elevenlabs", "openai", "google"]).default("elevenlabs"),
  ELEVENLABS_API_KEY: z.string().default(""),
  OPENAI_API_KEY: z.string().default(""),
  GOOGLE_TTS_KEY_FILE: z.string().optional(),
  SERPAPI_KEY: z.string().default(""),
  PEXELS_API_KEY: z.string().default(""),

  STORAGE_TYPE: z.enum(["local", "gcs"]).default("local"),
  GCS_BUCKET: z.string().optional(),
  GCS_KEY_FILE: z.string().optional(),

  DATA_DIR_PATH: z.string().default(
    process.env.NODE_ENV === "production"
      ? "/data"
      : path.join(os.homedir(), ".yt-video-generator"),
  ),
  LOG_LEVEL: z.string().default("info"),
  CONCURRENCY: z.coerce.number().default(1),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errorMessages = result.error.errors
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Configuration error:\n${errorMessages}`);
  }

  const env = result.data;

  // Warn about missing API keys (don't crash — let the server start for health checks)
  // Check required TTS key based on selected provider
  const isGoogle = env.TTS_PROVIDER === "google";
  const isOpenAI = env.TTS_PROVIDER === "openai";
  
  let ttsKey = "ELEVENLABS_API_KEY";
  let ttsKeyValue = env.ELEVENLABS_API_KEY;
  
  if (isOpenAI) {
    ttsKey = "OPENAI_API_KEY";
    ttsKeyValue = env.OPENAI_API_KEY;
  } else if (isGoogle) {
    ttsKey = "GOOGLE_APPLICATION_CREDENTIALS";
    ttsKeyValue = env.GOOGLE_TTS_KEY_FILE || process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
  }

  const missingKeys = [
    ["API_KEY", env.API_KEY],
    [ttsKey, ttsKeyValue],
    ["SERPAPI_KEY", env.SERPAPI_KEY],
    ["PEXELS_API_KEY", env.PEXELS_API_KEY],
  ].filter(([, v]) => !v).map(([k]) => k);

  if (missingKeys.length > 0) {
    console.warn(`⚠️  Missing env vars: ${missingKeys.join(", ")}. Video generation may fail.`);
  }

  if (env.STORAGE_TYPE === "gcs") {
    if (!env.GCS_BUCKET) throw new Error("GCS_BUCKET is required when STORAGE_TYPE=gcs");
    if (!env.GCS_KEY_FILE) throw new Error("GCS_KEY_FILE is required when STORAGE_TYPE=gcs");
  }

  const dataDirPath = env.DATA_DIR_PATH;

  return {
    port: env.PORT,
    apiKey: env.API_KEY,
    ttsProvider: env.TTS_PROVIDER,
    elevenLabsApiKey: env.ELEVENLABS_API_KEY,
    openaiApiKey: env.OPENAI_API_KEY,
    googleTtsKeyFile: env.GOOGLE_TTS_KEY_FILE,
    serpApiKey: env.SERPAPI_KEY,
    pexelsApiKey: env.PEXELS_API_KEY,
    storageType: env.STORAGE_TYPE,
    gcsBucket: env.GCS_BUCKET,
    gcsKeyFile: env.GCS_KEY_FILE,
    dataDirPath,
    videosDirPath: path.join(dataDirPath, "videos"),
    tempDirPath: path.join(dataDirPath, "temp"),
    dbPath: path.join(dataDirPath, "jobs.db"),
    musicDirPath: path.join(__dirname, "..", "static", "music"),
    packageDirPath: path.join(__dirname, ".."),
    logLevel: env.LOG_LEVEL,
    concurrency: env.CONCURRENCY,
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;
export const config = loadConfig();
