import type { Orientation } from "../../types/video.types";

export interface MediaResult {
  id: string;
  url: string;
  width: number;
  height: number;
  durationS?: number;
  thumbnail?: string;
}

export interface MediaSearchProvider {
  searchImages(term: string, count?: number): Promise<MediaResult[]>;
  searchVideos(
    term: string,
    minDurationS: number,
    orientation: Orientation,
  ): Promise<MediaResult[]>;
}
