import { z } from "zod";

export type VideoStatus = "queued" | "processing" | "ready" | "failed";

export type SceneItemType = "image" | "animated_text" | "formula" | "3d_image";

export type DisplayMode =
  | "fit"
  | "ken_burns"
  | "static"
  | "slide"
  | "typewriter"
  | "fade"
  | "reveal";

export type Orientation = "landscape" | "portrait";

export type Language = "pt" | "en";

export type MusicVolume = "muted" | "low" | "medium" | "high";

export type MusicMood =
  | "sad"
  | "melancholic"
  | "happy"
  | "euphoric"
  | "excited"
  | "chill"
  | "uneasy"
  | "angry"
  | "dark"
  | "hopeful"
  | "contemplative"
  | "funny";

export const sceneItemSchema = z.object({
  imageUrl: z.string().url().optional(),
  type: z.enum(["image", "animated_text", "formula", "3d_image"]),
  displayMode: z
    .enum(["fit", "ken_burns", "static", "slide", "typewriter", "fade", "reveal"])
    .optional(),
  duration: z.number().positive().optional(),
  sceneNarration: z.string().optional(),
}).refine(data => data.type !== "image" || !!data.imageUrl, {
  message: "imageUrl is required for image-type scenes",
  path: ["imageUrl"],
}).refine(data => !!data.sceneNarration || !!data.duration, {
  message: "duration is required when sceneNarration is empty",
  path: ["duration"],
});

export const srtStyleSchema = z.object({
  position: z.enum(["top", "center", "bottom"]).default("bottom"),
  backgroundColor: z.string().default("#0066ff"),
  fontSize: z.number().positive().default(48),
  fontFamily: z.string().default("Inter"),
});

export const videoConfigSchema = z.object({
  orientation: z.enum(["landscape", "portrait"]).default("landscape"),
  voice: z.string().optional(),
  voiceSpeed: z.number().min(0.25).max(4.0).default(1.0),
  paddingBack: z.number().nonnegative().default(1500),
  musicVolume: z.enum(["muted", "low", "medium", "high"]).default("medium"),
  useSrt: z.boolean().default(true),
  srtStyle: srtStyleSchema.optional().default({}),
  useBackgroundMusic: z.boolean().default(true),
  backgroundMusicStyle: z
    .enum([
      "sad",
      "melancholic",
      "happy",
      "euphoric",
      "excited",
      "chill",
      "uneasy",
      "angry",
      "dark",
      "hopeful",
      "contemplative",
      "funny",
    ])
    .optional(),
  backgroundMusicUrl: z.string().url().optional(),
});

export const createVideoSchema = z.object({
  ttsProvider: z.enum(["openai", "elevenlabs", "google", "kokoro"]).default("openai"),
  language: z.enum(["pt", "en"]).default("pt"),
  sceneItems: z.array(sceneItemSchema).min(1, "At least one scene item is required"),
  config: videoConfigSchema.optional().default({}),
  webhookUrl: z.string().url("webhookUrl must be a valid URL").optional(),
});

export type CreateVideoInput = z.infer<typeof createVideoSchema>;
export type SceneItem = z.infer<typeof sceneItemSchema>;
export type SrtStyle = z.infer<typeof srtStyleSchema>;
export type VideoConfig = z.infer<typeof videoConfigSchema>;

// Internal pipeline types
export type WordTimestamp = {
  word: string;
  startMs: number;
  endMs: number;
};

export type Caption = {
  text: string;
  startMs: number;
  endMs: number;
};

export type CaptionLine = {
  texts: Caption[];
};

export type CaptionPage = {
  startMs: number;
  endMs: number;
  lines: CaptionLine[];
};

export type SceneMedia = {
  type: SceneItemType;
  url: string;
  displayMode?: DisplayMode;
  duration?: number;
  width?: number;
  height?: number;
};

export type ComposedScene = {
  media: SceneMedia;
  durationMs: number;
  captions: Caption[];
  audioUrl?: string;
};

export type MusicTrack = {
  file: string;
  url: string;
  start: number;
  end: number;
  mood: MusicMood;
};
