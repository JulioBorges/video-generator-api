import { describe, it, expect } from "vitest";
import { createVideoSchema } from "../../src/types/video.types";

describe("createVideoSchema validation", () => {
  const validInput = {
    script: "This is a valid script with more than ten characters.",
    videoItems: [{ searchTerm: "AI robots", type: "video" as const }],
  };

  it("accepts valid minimal input", () => {
    const result = createVideoSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("applies defaults for optional fields", () => {
    const result = createVideoSchema.parse(validInput);
    expect(result.language).toBe("pt");
    expect(result.useSrt).toBe(true);
    expect(result.useBackgroundMusic).toBe(true);
    expect(result.config.orientation).toBe("landscape");
    expect(result.config.paddingBack).toBe(1500);
  });

  it("rejects script shorter than 10 chars", () => {
    const result = createVideoSchema.safeParse({ ...validInput, script: "short" });
    expect(result.success).toBe(false);
  });

  it("rejects empty videoItems", () => {
    const result = createVideoSchema.safeParse({ ...validInput, videoItems: [] });
    expect(result.success).toBe(false);
  });

  it("accepts all video item types", () => {
    const types = ["video", "image", "animated_text", "formula", "3d_image"] as const;
    for (const type of types) {
      const result = createVideoSchema.safeParse({
        ...validInput,
        videoItems: [{ searchTerm: "test", type }],
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid language", () => {
    const result = createVideoSchema.safeParse({ ...validInput, language: "es" });
    expect(result.success).toBe(false);
  });
});
