import { describe, it, expect } from "vitest";
import { createVideoSchema } from "../../src/types/video.types";

describe("createVideoSchema validation", () => {
  const validInput = {
    sceneItems: [{ imageUrl: "https://example.com/image.jpg", type: "image" as const, duration: 5 }],
  };

  it("accepts valid minimal input", () => {
    const result = createVideoSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("applies defaults for optional fields", () => {
    const result = createVideoSchema.parse(validInput);
    expect(result.language).toBe("pt");
    expect(result.config.useSrt).toBe(true);
    expect(result.config.useBackgroundMusic).toBe(true);
    expect(result.config.orientation).toBe("landscape");
    expect(result.config.paddingBack).toBe(1500);
  });

  it("rejects scene items without duration and without narration", () => {
    const result = createVideoSchema.safeParse({ ...validInput, sceneItems: [{ imageUrl: "https://example.com/image.jpg", type: "image" as const }] });
    expect(result.success).toBe(false);
  });

  it("rejects empty sceneItems", () => {
    const result = createVideoSchema.safeParse({ ...validInput, sceneItems: [] });
    expect(result.success).toBe(false);
  });

  it("accepts all video item types", () => {
    const types = ["image", "animated_text", "formula", "3d_image"] as const;
    for (const type of types) {
      const result = createVideoSchema.safeParse({
        ...validInput,
        sceneItems: [{ imageUrl: "https://example.com/image.jpg", type, duration: 5 }],
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid language", () => {
    const result = createVideoSchema.safeParse({ ...validInput, language: "es" });
    expect(result.success).toBe(false);
  });
});
