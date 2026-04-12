import type { MediaSearchProvider, MediaResult } from "./media-search.interface";
import type { Orientation } from "../../types/video.types";
import { logger } from "../../logger";

const JOKER_TERMS = ["nature", "globe", "space", "ocean"];
const DURATION_BUFFER_S = 3;

interface PexelsVideoFile {
  fps: number;
  quality: string;
  width: number;
  height: number;
  id: string;
  link: string;
}

interface PexelsVideo {
  id: string;
  duration: number;
  video_files: PexelsVideoFile[];
}

export class PexelsService implements MediaSearchProvider {
  constructor(private apiKey: string) {}

  async searchImages(term: string, count = 10): Promise<MediaResult[]> {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(term)}&per_page=${count}`,
      { headers: { Authorization: this.apiKey } },
    );
    if (!response.ok) throw new Error(`Pexels API error: ${response.status}`);
    const data = await response.json() as { photos: { id: number; src: { original: string; medium: string }; width: number; height: number }[] };

    return data.photos.map((p) => ({
      id: String(p.id),
      url: p.src.original,
      width: p.width,
      height: p.height,
      thumbnail: p.src.medium,
    }));
  }

  async searchVideos(
    term: string,
    minDurationS: number,
    orientation: Orientation,
  ): Promise<MediaResult[]> {
    const results = await this._searchWithFallback(term, minDurationS, orientation);
    return results;
  }

  private async _searchWithFallback(
    term: string,
    minDurationS: number,
    orientation: Orientation,
  ): Promise<MediaResult[]> {
    const terms = [term, ...JOKER_TERMS];
    const { width, height } = this.getOrientationDims(orientation);

    for (const searchTerm of terms) {
      try {
        const videos = await this._fetchVideos(searchTerm, orientation);
        const filtered = videos
          .filter((v) => {
            const fps = v.video_files[0]?.fps ?? 25;
            const duration = fps < 25 ? v.duration * (fps / 25) : v.duration;
            return duration >= minDurationS + DURATION_BUFFER_S;
          })
          .map((v) => {
            const file = v.video_files.find(
              (f) => f.quality === "hd" && f.width === width && f.height === height,
            );
            if (!file) return null;
            return { id: String(v.id), url: file.link, width: file.width, height: file.height, durationS: v.duration };
          })
          .filter(Boolean) as MediaResult[];

        if (filtered.length > 0) {
          logger.debug({ term: searchTerm, count: filtered.length }, "Found Pexels videos");
          return filtered;
        }
      } catch (err) {
        logger.warn({ term: searchTerm, err }, "Pexels search failed, trying next term");
      }
    }
    throw new Error(`No videos found for: ${term}`);
  }

  private async _fetchVideos(term: string, orientation: Orientation): Promise<PexelsVideo[]> {
    const response = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(term)}&orientation=${orientation}&size=medium&per_page=80`,
      { headers: { Authorization: this.apiKey } },
    );
    if (!response.ok) throw new Error(`Pexels API error: ${response.status}`);
    const data = await response.json() as { videos: PexelsVideo[] };
    return data.videos ?? [];
  }

  private getOrientationDims(orientation: Orientation): { width: number; height: number } {
    return orientation === "landscape" ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
  }
}
