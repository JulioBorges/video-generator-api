import { describe, it, expect } from "vitest";
import { TTSFactory } from "../../src/services/tts/tts.factory";
import { ElevenLabsService } from "../../src/services/tts/elevenlabs.service";
import { OpenAITTSService } from "../../src/services/tts/openai.service";
import { GoogleTTSService } from "../../src/services/tts/google.service";
import { KokoroTTSService } from "../../src/services/tts/kokoro.service";
import type { AppConfig } from "../../src/config";

describe("TTSFactory", () => {
  const mockConfig: AppConfig = {
    elevenLabsApiKey: "test-eleven-key",
    openaiApiKey: "test-openai-key",
    googleTtsKeyFile: "test-google-key.json",
    serpApiKey: "test-serp-key",
    pexelsApiKey: "test-pexels-key",
    port: 3000,
    apiKey: "test-api-key",
    tempDirPath: "/tmp",
    ttsProvider: "elevenlabs",
    storageType: "local",
    dataDirPath: "/tmp",
    videosDirPath: "/tmp/videos",
    dbPath: "/tmp/jobs.db",
    musicDirPath: "/tmp/music",
    packageDirPath: "/tmp/package",
    logLevel: "info",
    concurrency: 1,
    gcsBucket: undefined,
    gcsKeyFile: undefined,
  };

  const factory = new TTSFactory(mockConfig);

  it("should return OpenAITTSService when provider is 'openai'", () => {
    const provider = factory.getProvider("openai");
    expect(provider).toBeInstanceOf(OpenAITTSService);
  });

  it("should return GoogleTTSService when provider is 'google'", () => {
    const provider = factory.getProvider("google");
    expect(provider).toBeInstanceOf(GoogleTTSService);
  });

  it("should return KokoroTTSService when provider is 'kokoro'", () => {
    const provider = factory.getProvider("kokoro");
    expect(provider).toBeInstanceOf(KokoroTTSService);
  });

  it("should return ElevenLabsService when provider is 'elevenlabs'", () => {
    const provider = factory.getProvider("elevenlabs");
    expect(provider).toBeInstanceOf(ElevenLabsService);
  });

  it("should return ElevenLabsService by default for unknown provider", () => {
    const provider = factory.getProvider("unknown_provider");
    expect(provider).toBeInstanceOf(ElevenLabsService);
  });
});
