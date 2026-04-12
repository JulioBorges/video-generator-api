import { describe, it, expect } from "vitest";
import { SubtitleService } from "../../src/services/subtitle/subtitle.service";
import type { WordTimestamp } from "../../src/types/video.types";

const service = new SubtitleService();

const sampleTimestamps: WordTimestamp[] = [
  { word: "Hello", startMs: 0, endMs: 400 },
  { word: "world", startMs: 450, endMs: 800 },
  { word: "this", startMs: 850, endMs: 1100 },
  { word: "is", startMs: 1150, endMs: 1300 },
  { word: "a", startMs: 1350, endMs: 1450 },
  { word: "test", startMs: 1500, endMs: 1900 },
];

describe("SubtitleService", () => {
  it("builds captions from word timestamps", () => {
    const captions = service.buildCaptions(sampleTimestamps);
    expect(captions).toHaveLength(6);
    expect(captions[0]).toEqual({ text: "Hello", startMs: 0, endMs: 400 });
  });

  it("creates caption pages grouping words", () => {
    const captions = service.buildCaptions(sampleTimestamps);
    const pages = service.createCaptionPages(captions);
    expect(pages.length).toBeGreaterThan(0);
    // startMs equals the first caption's startMs
    expect(pages[0].startMs).toBe(captions[0].startMs);
    expect(pages[0].endMs).toBeGreaterThan(pages[0].startMs);
  });

  it("generates valid SRT content", () => {
    const captions = service.buildCaptions(sampleTimestamps);
    const srt = service.generateSrtContent(captions);
    expect(srt).toContain("-->"); // SRT time separator
    expect(srt).toContain("1\n"); // First entry index
  });

  it("formats SRT timestamps correctly", () => {
    const captions = [{ text: "Test", startMs: 1500, endMs: 3200 }];
    const srt = service.generateSrtContent(captions);
    expect(srt).toContain("00:00:01,500 --> 00:00:03,200");
  });
});
