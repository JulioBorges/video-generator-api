import type { TTSProvider } from "./tts.interface";
import { ElevenLabsService } from "./elevenlabs.service";
import { OpenAITTSService } from "./openai.service";
import type { AppConfig } from "../../config";

export function createTTSProvider(config: AppConfig): TTSProvider {
  switch (config.ttsProvider) {
    case "openai":
      return new OpenAITTSService(config.openaiApiKey);
    case "elevenlabs":
    default:
      return new ElevenLabsService(config.elevenLabsApiKey);
  }
}
