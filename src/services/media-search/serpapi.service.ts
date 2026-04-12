import axios from "axios";
import type { MediaSearchProvider, MediaResult } from "./media-search.interface";
import type { Orientation } from "../../types/video.types";
import { logger } from "../../logger";

export class SerpApiService implements MediaSearchProvider {
  private readonly baseUrl = "https://serpapi.com/search";

  constructor(private apiKey: string) {}

  async searchImages(term: string, count = 10): Promise<MediaResult[]> {
    logger.debug({ term, count }, "Searching images via SerpAPI");

    const response = await axios.get(this.baseUrl, {
      params: {
        q: term,
        engine: "google_images",
        api_key: this.apiKey,
        num: count,
        safe: "active",
      },
    });

    const results = (response.data.images_results ?? []) as {
      original: string;
      original_width: number;
      original_height: number;
      thumbnail: string;
      position: number;
    }[];

    return results.slice(0, count).map((img, i) => ({
      id: `serp-img-${i}`,
      url: img.original,
      width: img.original_width ?? 1920,
      height: img.original_height ?? 1080,
      thumbnail: img.thumbnail,
    }));
  }

  async searchVideos(
    term: string,
    minDurationS: number,
    orientation: Orientation,
  ): Promise<MediaResult[]> {
    logger.debug({ term, minDurationS, orientation }, "Searching videos via SerpAPI");

    const response = await axios.get(this.baseUrl, {
      params: {
        q: term,
        engine: "google_videos",
        api_key: this.apiKey,
      },
    });

    const results = (response.data.video_results ?? []) as {
      link: string;
      thumbnail: { static: string };
      duration: string;
    }[];

    return results
      .map((v, i) => ({
        id: `serp-vid-${i}`,
        url: v.link,
        width: orientation === "landscape" ? 1920 : 1080,
        height: orientation === "landscape" ? 1080 : 1920,
        thumbnail: v.thumbnail?.static,
        durationS: this.parseDuration(v.duration),
      }))
      .filter((v) => !v.durationS || v.durationS >= minDurationS);
  }

  private parseDuration(duration?: string): number | undefined {
    if (!duration) return undefined;
    const parts = duration.split(":").map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return undefined;
  }
}
