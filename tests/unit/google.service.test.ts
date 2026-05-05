import { describe, it, expect, vi, beforeEach } from "vitest";
import { GoogleTTSService } from "../../src/services/tts/google.service";

// Mock fs-extra
vi.mock("fs-extra", () => ({
  default: {
    writeFile: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
  writeFile: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
}));

// We need to mock the google cloud TTS library
const mockSynthesizeSpeech = vi.fn();
vi.mock("@google-cloud/text-to-speech", () => {
  return {
    v1beta1: {
      TextToSpeechClient: vi.fn(() => ({
        synthesizeSpeech: mockSynthesizeSpeech,
      })),
    },
  };
});

const mockFFmpeg = {
  concatAudioFiles: vi.fn().mockResolvedValue(undefined),
} as any;

describe("GoogleTTSService", () => {
  let service: GoogleTTSService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GoogleTTSService();
  });

  describe("escapeXml", () => {
    it("should escape special characters", () => {
      const result = (service as any).escapeXml("< > & ' \"");
      expect(result).toBe("&lt; &gt; &amp; &apos; &quot;");
    });
  });

  describe("buildSSMLWithMarks", () => {
    it("should build SSML with marks for each word", () => {
      const result = (service as any).buildSSMLWithMarks("Hello & world");
      expect(result.words).toEqual(["Hello", "&", "world"]);
      expect(result.ssml).toContain('<mark name="0"/>Hello');
      expect(result.ssml).toContain('<mark name="1"/>&amp;');
      expect(result.ssml).toContain('<mark name="2"/>world');
    });
  });

  describe("splitTextIntoChunks", () => {
    it("should not split short text", () => {
      const result = (service as any).splitTextIntoChunks("Short text.", 50);
      expect(result).toEqual(["Short text."]);
    });

    it("should split long text into multiple chunks at sentence boundaries", () => {
      const longText = "This is a sentence. And here is another one. And a third one to make it longer.";
      const chunks = (service as any).splitTextIntoChunks(longText, 30);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0]).toContain("This is a sentence.");
    });
  });

  describe("estimateDurationMs", () => {
    it("should estimate duration based on word count", () => {
      const result = (service as any).estimateDurationMs("One two three four five");
      expect(result).toBe(2000); // 5 / 2.5 * 1000 = 2000
    });
  });

  describe("generate", () => {
    it("should synthesize speech and return file path with timestamps", async () => {
      mockSynthesizeSpeech.mockResolvedValue([
        {
          audioContent: new Uint8Array([1, 2, 3]),
          timepoints: [
            { markName: "0", timeOffset: { seconds: 0, nanos: 0 } },
            { markName: "1", timeOffset: { seconds: 0, nanos: 500000000 } },
          ],
        },
      ]);

      const result = await service.generate("Hello world", "en", undefined, undefined, "/tmp/test", mockFFmpeg);

      expect(mockSynthesizeSpeech).toHaveBeenCalledWith({
        input: { ssml: expect.stringContaining("<speak>") },
        voice: { name: "en-US-Neural2-D", languageCode: "en-US" },
        audioConfig: { audioEncoding: "MP3", speakingRate: 1 },
        enableTimePointing: [1],
      });

      expect(result.audioFilePath).toContain("tts-");
      expect(result.audioFilePath).toContain("-final.mp3");
      expect(result.timestamps).toHaveLength(2);
      expect(result.timestamps[0].word).toBe("Hello");
      expect(result.timestamps[0].startMs).toBe(0);
      expect(result.timestamps[0].endMs).toBe(500);

      expect(result.timestamps[1].word).toBe("world");
      expect(result.timestamps[1].startMs).toBe(500);
      // Last word gets fallback end duration of +300
      expect(result.timestamps[1].endMs).toBe(800);
      expect(result.durationMs).toBe(800);
    });

    it("should handle Portuguese language and specific voice", async () => {
      mockSynthesizeSpeech.mockResolvedValue([
        {
          audioContent: new Uint8Array([1, 2, 3]),
          timepoints: [],
        },
      ]);

      await service.generate("Olá mundo", "pt", "pt-BR-Wavenet-A", undefined, "/tmp/test", mockFFmpeg);

      expect(mockSynthesizeSpeech).toHaveBeenCalledWith(
        expect.objectContaining({
          voice: { name: "pt-BR-Wavenet-A", languageCode: "pt-BR" },
        })
      );
    });

    it("should throw an error if no audio content is returned", async () => {
      mockSynthesizeSpeech.mockResolvedValue([{}]);
      
      await expect(service.generate("Hello", "en", undefined, undefined, "/tmp/test", mockFFmpeg)).rejects.toThrow("Google TTS failed for chunk 1: Google TTS returned no audio content");
    });
    
    it("should process multiple chunks", async () => {
      // Mock splitTextIntoChunks to force multiple chunks
      vi.spyOn(service as any, "splitTextIntoChunks").mockReturnValue(["Chunk one", "Chunk two"]);
      
      mockSynthesizeSpeech.mockResolvedValue([
        {
          audioContent: new Uint8Array([1, 2]),
          timepoints: [
            { markName: "0", timeOffset: { seconds: 0, nanos: 0 } },
            { markName: "1", timeOffset: { seconds: 1, nanos: 0 } },
          ],
        },
      ]);

      const result = await service.generate("Chunk one Chunk two", "en", undefined, undefined, "/tmp/test", mockFFmpeg);
      expect(mockSynthesizeSpeech).toHaveBeenCalledTimes(2);
      expect(result.timestamps).toHaveLength(4); // 2 per chunk
    });
  });
});
