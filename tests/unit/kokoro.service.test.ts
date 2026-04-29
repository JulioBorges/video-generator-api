import { describe, it, expect, vi, beforeEach } from "vitest";
import { KokoroTTSService } from "../../src/services/tts/kokoro.service";
import axios from "axios";

// Mock axios
vi.mock("axios");

// Mock fs-extra
vi.mock("fs-extra", () => ({
  default: {
    writeFile: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
  writeFile: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
}));

const mockKokoroGenerate = vi.fn();
const mockKokoroInstance = {
  generate: mockKokoroGenerate,
};

const mockFFmpeg = {
  concatAudioFiles: vi.fn().mockResolvedValue(undefined),
} as any;

describe("KokoroTTSService", () => {
  let service: KokoroTTSService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new KokoroTTSService("test-openai-key");
    // Spy on getTTSInstance to return our mock, bypassing dynamic require
    vi.spyOn(service as any, "getTTSInstance").mockResolvedValue(mockKokoroInstance);
  });

  describe("splitTextIntoChunks", () => {
    it("should not split text shorter than maxChars", () => {
      // Accessing private method for testing purposes
      const chunks = (service as any).splitTextIntoChunks("Short text.", 50);
      expect(chunks).toEqual(["Short text."]);
    });

    it("should split long text into multiple chunks at sentence boundaries", () => {
      const longText = "This is a sentence. And here is another one. And a third one to make it longer.";
      const chunks = (service as any).splitTextIntoChunks(longText, 30);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0]).toContain("This is a sentence.");
    });
  });

  describe("estimateTimestampsForText", () => {
    it("should generate estimated timestamps based on duration and word count", () => {
      const text = "This is a test sentence";
      const durationSec = 5; // 5 words in 5 seconds = 1s per word
      
      const timestamps = (service as any).estimateTimestampsForText(text, durationSec);
      
      expect(timestamps).toHaveLength(5);
      expect(timestamps[0].word).toBe("This");
      expect(timestamps[0].startMs).toBe(0);
      expect(timestamps[0].endMs).toBe(1000);
      
      expect(timestamps[4].word).toBe("sentence");
      expect(timestamps[4].startMs).toBe(4000);
      expect(timestamps[4].endMs).toBe(5000);
    });

    it("should return empty array if text is empty or duration is 0", () => {
      expect((service as any).estimateTimestampsForText("", 5)).toEqual([]);
      expect((service as any).estimateTimestampsForText("test", 0)).toEqual([]);
    });
  });

  describe("generate", () => {
    beforeEach(() => {
      // Provide a mock audio output that simulates Kokoro's Float32Array
      mockKokoroGenerate.mockResolvedValue({
        audio: new Float32Array([0.1, 0.2, -0.1, -0.2]),
        sampling_rate: 24000,
      });

      // Mock OpenAI Whisper response
      (axios.post as any).mockResolvedValue({
        data: {
          words: [
            { word: "Hello", start: 0.0, end: 0.5 },
            { word: "world", start: 0.5, end: 1.0 },
          ],
        },
      });
    });

    it("should generate TTS using Kokoro and Whisper timestamps", async () => {
      const result = await service.generate("Hello world.", "en", "af_heart", "/tmp/test", mockFFmpeg);
      
      expect(mockKokoroGenerate).toHaveBeenCalledWith("Hello world.", { voice: "af_heart" });
      
      // Axios should be called to invoke Whisper
      expect(axios.post).toHaveBeenCalled();
      
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.timestamps).toHaveLength(2);
      expect(result.timestamps[0].word).toBe("Hello");
      expect(result.timestamps[0].startMs).toBe(0);
      expect(result.timestamps[0].endMs).toBe(500);
      
      expect(result.audioFilePath).toContain("tts-");
      expect(result.audioFilePath).toContain("-final.mp3");
    });

    it("should fallback to math estimation if no OpenAI key is provided", async () => {
      const serviceWithoutKey = new KokoroTTSService(); // no API key
      vi.spyOn(serviceWithoutKey as any, "getTTSInstance").mockResolvedValue(mockKokoroInstance);
      const result = await serviceWithoutKey.generate("Hello world.", "en", "af_heart", "/tmp/test", mockFFmpeg);
      
      // Whisper should not be called
      expect(axios.post).not.toHaveBeenCalled();
      
      expect(result.timestamps).toHaveLength(2);
      expect(result.timestamps[0].word).toBe("Hello");
      expect(result.timestamps[1].word).toBe("world.");
      // It will use estimateTimestampsForText which derives time from rawAudioDurationSec
    });

    it("should default to pm_alex for pt language if voice is not provided", async () => {
      await service.generate("Olá mundo.", "pt", undefined, "/tmp/test", mockFFmpeg);
      expect(mockKokoroGenerate).toHaveBeenCalledWith("Olá mundo.", { voice: "pm_alex" });
    });
  });
});
