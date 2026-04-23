import { z } from "zod";

export type VideoStatus = "queued" | "processing" | "ready" | "failed";

export type VideoItemType = "image" | "animated_text" | "formula" | "3d_image";

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

export const videoItemSchema = z.object({
  searchTerm: z.string().min(1).optional(),
  imageUrl: z.string().url().optional(),
  type: z.enum(["image", "animated_text", "formula", "3d_image"]),
  displayMode: z
    .enum(["fit", "ken_burns", "static", "slide", "typewriter", "fade", "reveal"])
    .optional(),
  duration: z.number().positive().optional(),
}).refine(data => data.searchTerm || data.imageUrl, {
  message: "Provide either searchTerm (for automatic search) or imageUrl (for explicit image)",
  path: ["imageUrl"],
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
  paddingBack: z.number().nonnegative().default(1500),
  musicVolume: z.enum(["muted", "low", "medium", "high"]).default("medium"),
});

export const createVideoSchema = z.object({
  script: z.string().min(10, "Script must be at least 10 characters"),
  language: z.enum(["pt", "en"]).default("pt"),
  videoItems: z.array(videoItemSchema).min(1, "At least one video item is required"),
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
  config: videoConfigSchema.optional().default({}),
  webhookUrl: z.string().url("webhookUrl must be a valid URL").optional(),
});

export type CreateVideoInput = z.infer<typeof createVideoSchema>;
export type VideoItem = z.infer<typeof videoItemSchema>;
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
  type: VideoItemType;
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
};

export type MusicTrack = {
  file: string;
  url: string;
  start: number;
  end: number;
  mood: MusicMood;
};
