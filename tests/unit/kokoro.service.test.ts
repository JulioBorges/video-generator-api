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
    it("should generate estimated timestamps proportionally based on word length", () => {
      const text = "A inconstitucionalidade é ruim.";
      const durationSec = 4; // 4000ms
      
      const timestamps = (service as any).estimateTimestampsForText(text, durationSec);
      
      expect(timestamps).toHaveLength(4);
      expect(timestamps[0].word).toBe("A");
      expect(timestamps[1].word).toBe("inconstitucionalidade");
      expect(timestamps[3].word).toBe("ruim.");
      
      const durationA = timestamps[0].endMs - timestamps[0].startMs;
      const durationLong = timestamps[1].endMs - timestamps[1].startMs;
      
      expect(durationLong).toBeGreaterThan(durationA * 3); // Must be significantly longer
      expect(timestamps[3].endMs).toBe(4000); // Last word ends at total duration
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

    it("should generate TTS using Kokoro and estimated timestamps", async () => {
      const result = await service.generate("Hello world.", "en", "af_heart", undefined, "/tmp/test", mockFFmpeg);
      
      expect(mockKokoroGenerate).toHaveBeenCalledWith("Hello world.", { voice: "af_heart", speed: 1 });
      
      // Axios should NOT be called since Whisper is removed
      expect(axios.post).not.toHaveBeenCalled();
      
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.timestamps).toHaveLength(2);
      expect(result.timestamps[0].word).toBe("Hello");
      expect(result.timestamps[1].word).toBe("world.");
      
      expect(result.audioFilePath).toContain("tts-");
      expect(result.audioFilePath).toContain("-final.mp3");
    });



    it("should default to pm_alex for pt language if voice is not provided", async () => {
      await service.generate("Olá mundo.", "pt", undefined, undefined, "/tmp/test", mockFFmpeg);
      expect(mockKokoroGenerate).toHaveBeenCalledWith("Olá mundo.", { voice: "pm_alex", speed: 1 });
    });
  });
});
