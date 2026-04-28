import type { Caption, CaptionLine, CaptionPage, WordTimestamp } from "../../types/video.types";

const LINE_MAX_LENGTH = 35;
const LINE_COUNT = 2;
const MAX_DISTANCE_MS = 1500;

export class SubtitleService {
  buildCaptions(timestamps: WordTimestamp[]): Caption[] {
    return timestamps.map((t) => ({
      text: t.word,
      startMs: t.startMs,
      endMs: t.endMs,
    }));
  }

  createCaptionPages(captions: Caption[], maxLineLength = 40): CaptionPage[] {
    const pages: CaptionPage[] = [];
    let currentPage: CaptionPage = { startMs: 0, endMs: 0, lines: [] };
    let currentLine: CaptionLine = { texts: [] };

    captions.forEach((caption, i) => {
      // New page on large time gap
      if (i > 0 && caption.startMs - currentPage.endMs > MAX_DISTANCE_MS) {
        if (currentLine.texts.length > 0) currentPage.lines.push(currentLine);
        if (currentPage.lines.length > 0) pages.push(currentPage);
        currentPage = { startMs: caption.startMs, endMs: caption.endMs, lines: [] };
        currentLine = { texts: [] };
      }

      // Wrap line if too long
      const currentLineText = currentLine.texts.map((t) => t.text).join(" ");
      if (
        currentLine.texts.length > 0 &&
        currentLineText.length + 1 + caption.text.length > maxLineLength
      ) {
        currentPage.lines.push(currentLine);
        currentLine = { texts: [] };

        if (currentPage.lines.length >= LINE_COUNT) {
          pages.push(currentPage);
          currentPage = { startMs: caption.startMs, endMs: caption.endMs, lines: [] };
        }
      }

      currentLine.texts.push(caption);
      currentPage.endMs = caption.endMs;
      // Set startMs on first word in page
      if (currentPage.lines.length === 0 && currentLine.texts.length === 1) {
        currentPage.startMs = caption.startMs;
      }
    });

    if (currentLine.texts.length > 0) currentPage.lines.push(currentLine);
    if (currentPage.lines.length > 0) pages.push(currentPage);

    return pages;
  }

  generateSrtContent(captions: Caption[]): string {
    const pages = this.createCaptionPages(captions);
    return pages
      .map((page, i) => {
        const text = page.lines
          .map((line) => line.texts.map((t) => t.text).join(" "))
          .join("\n");
        return `${i + 1}\n${this.formatTime(page.startMs)} --> ${this.formatTime(page.endMs)}\n${text}`;
      })
      .join("\n\n");
  }

  private formatTime(ms: number): string {
    const totalS = Math.floor(ms / 1000);
    const hours = Math.floor(totalS / 3600);
    const minutes = Math.floor((totalS % 3600) / 60);
    const seconds = totalS % 60;
    const msPart = ms % 1000;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(msPart).padStart(3, "0")}`;
  }
}
