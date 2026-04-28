import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAITTSService } from "../../src/services/tts/openai.service";
import axios from "axios";

// Mock axios
vi.mock("axios");

describe("OpenAITTSService", () => {
  let service: OpenAITTSService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OpenAITTSService("test-openai-key");
  });

  describe("splitTextIntoChunks", () => {
    it("should split long text into multiple chunks at boundaries", () => {
      const longText = "a".repeat(4000) + ". " + "b".repeat(100);
      const chunks = (service as any).splitTextIntoChunks(longText);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it("should return the same text if shorter than max chunk length", () => {
      const chunks = (service as any).splitTextIntoChunks("Short text.", 4096);
      expect(chunks).toEqual(["Short text."]);
    });
  });

  describe("generate", () => {
    beforeEach(() => {
      // Mock TTS generation (Audio Buffer)
      (axios.post as any).mockImplementation((url: string) => {
        if (url.includes("/audio/speech")) {
          return Promise.resolve({
            data: Buffer.alloc(240044),
          });
        }
        if (url.includes("/audio/transcriptions")) {
          return Promise.resolve({
            data: {
              words: [
                { word: "Hello", start: 0.0, end: 0.5 },
                { word: "world", start: 0.5, end: 1.0 },
              ],
            },
          });
        }
      });
    });

    it("should generate TTS and fetch timestamps for a given text", async () => {
      const result = await service.generate("Hello world.", "en", "alloy");

      // Post should be called twice per chunk: one for /audio/speech, one for /audio/transcriptions
      expect(axios.post).toHaveBeenCalledTimes(2);
      
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.timestamps).toHaveLength(2);
      expect(result.timestamps[0].word).toBe("Hello");
      expect(result.timestamps[0].startMs).toBe(0);
      expect(result.timestamps[0].endMs).toBe(500);
      
      expect(Buffer.isBuffer(result.audioBuffer)).toBe(true);
      expect(result.audioBuffer.length).toBe(240044);
    });
    
    it("should fallback to estimation if Whisper timestamps fail", async () => {
      // Simulate Whisper transcription failure
      (axios.post as any).mockImplementation((url: string) => {
        if (url.includes("/audio/speech")) {
          return Promise.resolve({
            data: Buffer.alloc(240044),
          });
        }
        if (url.includes("/audio/transcriptions")) {
          return Promise.reject(new Error("Whisper API Error"));
        }
      });

      const result = await service.generate("Hello world.", "en", "alloy");

      // Generates TTS but returns empty timestamps on Whisper failure
      expect(Buffer.isBuffer(result.audioBuffer)).toBe(true);
      expect(result.timestamps.length).toBe(0);
      expect(result.durationMs).toBeGreaterThan(0);
    });
  });
});
