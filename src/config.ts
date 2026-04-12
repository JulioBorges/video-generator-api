import "dotenv/config";
import path from "path";
import os from "os";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  API_KEY: z.string().min(1, "API_KEY is required"),

  ELEVENLABS_API_KEY: z.string().min(1, "ELEVENLABS_API_KEY is required"),
  SERPAPI_KEY: z.string().min(1, "SERPAPI_KEY is required"),
  PEXELS_API_KEY: z.string().min(1, "PEXELS_API_KEY is required"),

  STORAGE_TYPE: z.enum(["local", "gcs"]).default("local"),
  GCS_BUCKET: z.string().optional(),
  GCS_KEY_FILE: z.string().optional(),

  DATA_DIR_PATH: z.string().default(path.join(os.homedir(), ".yt-video-generator")),
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

  if (env.STORAGE_TYPE === "gcs") {
    if (!env.GCS_BUCKET) throw new Error("GCS_BUCKET is required when STORAGE_TYPE=gcs");
    if (!env.GCS_KEY_FILE) throw new Error("GCS_KEY_FILE is required when STORAGE_TYPE=gcs");
  }

  const dataDirPath = env.DATA_DIR_PATH;

  return {
    port: env.PORT,
    apiKey: env.API_KEY,
    elevenLabsApiKey: env.ELEVENLABS_API_KEY,
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
