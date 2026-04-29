import "dotenv/config";
import path from "path";
import os from "os";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  API_KEY: z.string().default(""),


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
  const missingKeys = [
    ["API_KEY", env.API_KEY],
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

  let dataDirPath = env.DATA_DIR_PATH;
  if (dataDirPath.startsWith("~/")) {
    dataDirPath = path.join(os.homedir(), dataDirPath.slice(2));
  } else if (dataDirPath === "~") {
    dataDirPath = os.homedir();
  }
  dataDirPath = path.resolve(dataDirPath);

  return {
    port: env.PORT,
    apiKey: env.API_KEY,
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
