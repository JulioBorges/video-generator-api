import type { TTSProvider } from "./tts.interface";
import { ElevenLabsService } from "./elevenlabs.service";
import { OpenAITTSService } from "./openai.service";
import { GoogleTTSService } from "./google.service";
import { KokoroTTSService } from "./kokoro.service";
import type { AppConfig } from "../../config";

export class TTSFactory {
  constructor(private config: AppConfig) { }

  getProvider(providerName: string): TTSProvider {
    switch (providerName) {
      case "openai":
        return new OpenAITTSService(this.config.openaiApiKey);
      case "google":
        return new GoogleTTSService(this.config.googleTtsKeyFile);
      case "kokoro":
        // Passamos a apiKey da OpenAI para o fallback do Whisper (se houver)
        return new KokoroTTSService(this.config.openaiApiKey);
      case "elevenlabs":
      default:
        return new ElevenLabsService(this.config.elevenLabsApiKey);
    }
  }
}
