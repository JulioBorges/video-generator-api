import axios from "axios";
import type { TTSProvider, TTSResult } from "./tts.interface";
import type { Language, WordTimestamp } from "../../types/video.types";
import { logger } from "../../logger";

// Fallback dynamic import for kokoro-js
let KokoroTTS: any = null;

// Default voices per language
const DEFAULT_VOICES: Record<Language, string> = {
  pt: "pm_alex", 
  en: "af_heart",
};

export class KokoroTTSService implements TTSProvider {
  private readonly openaiBaseUrl = "https://api.openai.com/v1";
  private ttsInstance: any = null;
  private ephoneInstance: any = null;

  constructor(private openaiApiKey?: string) { }

  private async getTTSInstance() {
    if (!this.ttsInstance) {
      if (!KokoroTTS) {
        // Use require to support CJS environment
        const kokoroModule = require("kokoro-js");
        KokoroTTS = kokoroModule.KokoroTTS;
      }
      logger.info("Loading Kokoro TTS model (this might take a while on first run)...");
      this.ttsInstance = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
        dtype: "fp32",
      });

      // Load ephone for multilingual phonemization
      try {
        logger.info("Loading ephone multilingual phonemizer...");
        // Use new Function hack to prevent TS from transpiling dynamic import to require
        // @ts-ignore
        const { default: createEphone, roa, gmw } = await (new Function('return import("ephone")'))();
        // Initialize with Romance (roa) and Germanic (gmw) packs to cover PT, EN, ES, FR, IT, DE, NL
        this.ephoneInstance = await createEphone([roa, gmw]);
        logger.info("ephone phonemizer loaded successfully");
      } catch (err) {
        logger.warn({ err }, "Failed to load ephone phonemizer, falling back to kokoro-js default (English only)");
      }

      // Monkey-patch to support ALL available voices in the library's voices directory
      if (this.ttsInstance) {
        // Store original methods before patching
        const originalGenerate = this.ttsInstance.generate.bind(this.ttsInstance);
        const originalStream = this.ttsInstance.stream.bind(this.ttsInstance);

        try {
          const fs = require("fs");
          const path = require("path");
          // Path to the voices directory in node_modules
          const voicesDir = path.join(process.cwd(), "node_modules", "kokoro-js", "voices");
          
          if (fs.existsSync(voicesDir)) {
            const files = fs.readdirSync(voicesDir);
            const extraVoices: any = {};
            
            for (const file of files) {
              if (file.endsWith(".bin")) {
                const voiceId = file.replace(".bin", "");
                if (!this.ttsInstance.voices[voiceId]) {
                  const [prefix, name] = voiceId.includes("_") ? voiceId.split("_") : [voiceId[0], voiceId];
                  extraVoices[voiceId] = { 
                    name: name ? (name.charAt(0).toUpperCase() + name.slice(1)) : voiceId, 
                    language: prefix,
                    gender: prefix.endsWith("f") ? "Female" : "Male",
                    overallGrade: "A"
                  };
                }
              }
            }
            
            const originalVoices = this.ttsInstance.voices;
            const patchedVoices = { ...originalVoices, ...extraVoices };
            
            Object.defineProperty(this.ttsInstance, 'voices', {
              get: () => patchedVoices,
              configurable: true
            });

            // Patch validation to allow any voice present in the patched list
            // Returning the first character as the language code (e.g., 'a', 'b', 'p', 'z')
            this.ttsInstance._validate_voice = (voice: string) => {
              if (patchedVoices[voice]) {
                return voice.charAt(0);
              }
              throw new Error(`Voice "${voice}" not found. Available: ${Object.keys(patchedVoices).join(", ")}`);
            };

            // PATCH GENERATE TO USE EPHONE
            this.ttsInstance.generate = async (text: string, options: any = {}) => {
              const voice = options.voice || "af_heart";
              const voiceMeta = patchedVoices[voice];
              
              if (this.ephoneInstance && voiceMeta) {
                try {
                  const lang = voiceMeta.language.charAt(0); // e.g., 'p' for pt-br, 'a' for en-us
                  const ephoneLang = this.getEphoneLang(lang);
                  
                  logger.debug({ text, voice, ephoneLang }, "Using ephone for phonemization");
                  
                  // 1. Normalize text (language aware)
                  const normalizedText = this.normalizeText(text, ephoneLang);
                  
                  // 2. Phonemize with ephone
                  this.ephoneInstance.setVoice(ephoneLang);
                  const ipa = this.ephoneInstance.textToIpa(normalizedText);
                  
                  // 3. Post-process IPA for Kokoro
                  const patchedIpa = this.postProcessIpa(ipa, lang);
                  
                  // 4. Prepend language prefix (Kokoro expects this for multilingual support)
                  // For American/British voices, we use 'a' or 'b'. For others, use the prefix.
                  const finalIpa = lang + patchedIpa;
                  
                  // 5. Generate from ids (bypassing internal phonemizer)
                  logger.info({ finalIpa }, "Kokoro generating from IPA");
                  const { input_ids } = this.ttsInstance.tokenizer(finalIpa, { truncation: true });
                  return this.ttsInstance.generate_from_ids(input_ids, options);
                } catch (err) {
                  logger.warn({ err }, "ephone generation failed, falling back to original generate");
                }
              }
              return originalGenerate(text, options);
            };
            
            logger.info(
              { extraVoicesCount: Object.keys(extraVoices).length, totalVoices: Object.keys(patchedVoices).length },
              "Kokoro TTS patched: all available voices unlocked and multilingual phonemizer integrated"
            );
          }
        } catch (err) {
          logger.warn({ err }, "Failed to dynamically patch Kokoro voices, using hardcoded fallback");
        }
      }

      logger.info("Kokoro TTS model loaded successfully");
    }
    return this.ttsInstance;
  }

  private getEphoneLang(kokoroLangPrefix: string): string {
    // Map Kokoro voice prefix to ephone language codes
    const map: Record<string, string> = {
      'a': 'en-us',
      'b': 'en-gb',
      'p': 'pt-br',
      'e': 'es',
      'f': 'fr',
      'i': 'it',
      'd': 'de',
      'n': 'nl',
      'z': 'cmn',
      'j': 'ja',
    };
    return map[kokoroLangPrefix] || 'en-us';
  }

  private normalizeText(text: string, lang: string): string {
    // Basic normalization
    let normalized = text
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\(/g, "«")
      .replace(/\)/g, "»")
      .trim();

    if (lang.startsWith('en')) {
      // English specific normalization (minimal subset of what kokoro-js does)
      normalized = normalized
        .replace(/\bD[Rr]\.(?= [A-Z])/g, "Doctor")
        .replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, "Mister")
        .replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, "Miss")
        .replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, "Mrs");
    } else if (lang.startsWith('pt')) {
      // Portuguese specific normalization
      normalized = normalized
        .replace(/\bSr\.\s/g, "Senhor ")
        .replace(/\bSra\.\s/g, "Senhora ")
        .replace(/\bDr\.\s/g, "Doutor ")
        .replace(/\bDra\.\s/g, "Doutora ")
        .replace(/\bProf\.\s/g, "Professor ")
        .replace(/\bProfa\.\s/g, "Professora ")
        .replace(/\bAv\.\s/g, "Avenida ")
        .replace(/\bcel\.\s/g, "celular ")
        .replace(/\bex\.:/g, "exemplo:")
        .replace(/\bVv\.\s/g, "Vocês ");
    }

    return normalized;
  }

  private postProcessIpa(ipa: string, lang: string): string {
    // Kokoro-specific IPA replacements (Global-ish)
    let processed = ipa
      .replace(/kəkˈoːɹoʊ/g, "kˈoʊkəɹoʊ")
      .replace(/kəkˈɔːɹəʊ/g, "kˈəʊkəɹəʊ")
      .replace(/ʲ/g, "j")
      .replace(/ɬ/g, "l")
      .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, " ")
      .replace(/ z(?=[;:,.!?¡¿—…"«»“” ]|$)/g, "z");

    // Language specific processing
    if (lang === 'a' || lang === 'b') {
      // English: Kokoro expects ɹ for r, and k for x (if any)
      processed = processed
        .replace(/r/g, "ɹ")
        .replace(/x/g, "k");
      if (lang === 'a') {
        processed = processed.replace(/(?<=nˈaɪn)ti(?!ː)/g, "di");
      }
    } else if (lang === 'p') {
      // Portuguese specific: Kokoro vocab has ʁ and ɾ, and uses decomposing tilde for nasals
      processed = processed
        // Nasals decomposition (ephone might return precomposed chars)
        .replace(/ã/g, "a\u0303")
        .replace(/õ/g, "o\u0303")
        .replace(/ẽ/g, "e\u0303")
        .replace(/ĩ/g, "i\u0303")
        .replace(/ũ/g, "u\u0303")
        // Mapping ephone 'r' (often used in clusters like 'br', 'gr') to Kokoro's flap 'ɾ'
        // Kokoro's 'r' (ID 60) is also available but ɾ is common for Portuguese weak R
        .replace(/r/g, "ɾ"); 
      
      // Note: 'x' (ID 66) is kept as is for Portuguese, as it represents the strong R in eSpeak/ephone
    }

    return processed.trim();
  }

  async generate(text: string, language: Language, voice?: string): Promise<TTSResult> {
    const voiceName = (voice ?? DEFAULT_VOICES[language]).toLowerCase();
    const chunks = this.splitTextIntoChunks(text);

    logger.debug(
      { language, voice: voiceName, textLength: text.length, chunks: chunks.length },
      "Generating TTS via Kokoro (Local)",
    );

    const tts = await this.getTTSInstance();
    const audioBuffers: Buffer[] = [];
    const allTimestamps: WordTimestamp[] = [];
    let currentOffsetMs = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (chunks.length > 1) {
        logger.info({ chunkIndex: i + 1, totalChunks: chunks.length }, "Processing TTS chunk");
      }

      try {
        // 1. Generate speech audio for this chunk using Kokoro
        const audio = await tts.generate(chunk, { voice: voiceName });
        
        // Convert Float32Array to WAV Buffer
        const chunkBuffer = this.encodeWAV(audio.audio, audio.sampling_rate);

        // 2. Transcribe chunk with Whisper to get word-level timestamps (fallback to estimation)
        const chunkTimestamps = await this.transcribeForTimestamps(chunkBuffer, chunk, language, audio.sampling_rate);

        // 3. Adjust timestamps with the current cumulative offset
        const adjustedTimestamps = chunkTimestamps.map((t) => ({
          ...t,
          startMs: t.startMs + currentOffsetMs,
          endMs: t.endMs + currentOffsetMs,
        }));

        audioBuffers.push(chunkBuffer);
        allTimestamps.push(...adjustedTimestamps);

        // 4. Update offset for next chunk
        const chunkDurationMs =
          chunkTimestamps.length > 0 && chunkTimestamps[chunkTimestamps.length - 1].endMs > 0
            ? chunkTimestamps[chunkTimestamps.length - 1].endMs
            : this.estimateDurationMs(chunk);

        currentOffsetMs += chunkDurationMs;
      } catch (err: any) {
        throw new Error(`Kokoro TTS chunk ${i + 1} failed: ${err.message}`);
      }
    }

    const audioBuffer = Buffer.concat(audioBuffers);
    const durationMs = currentOffsetMs;

    logger.debug({ durationMs, wordCount: allTimestamps.length }, "Kokoro TTS generated (all chunks)");

    return { audioBuffer, durationMs, timestamps: allTimestamps };
  }

  private splitTextIntoChunks(text: string, maxChars = 500): string[] {
    if (text.length <= maxChars) return [text];

    const chunks: string[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+|\s*[^.!?]+/g) || [text];

    let currentChunk = "";
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxChars && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  private async transcribeForTimestamps(
    audioBuffer: Buffer,
    text: string,
    language: Language,
    sampleRate: number = 24000
  ): Promise<WordTimestamp[]> {
    const rawAudioDurationSec = (audioBuffer.length - 44) / (sampleRate * 2);

    if (!this.openaiApiKey) {
      logger.info("OPENAI_API_KEY not configured, falling back to math estimation for Kokoro timestamps");
      return this.estimateTimestampsForText(text, rawAudioDurationSec);
    }

    try {
      const formModule = await import("form-data");
      const FormData = formModule.default || formModule;
      const form = new FormData();

      form.append("file", audioBuffer, {
        filename: "speech.wav",
        contentType: "audio/wav",
      });
      form.append("model", "whisper-1");
      form.append("language", language);
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "word");

      const response = await axios.post(
        `${this.openaiBaseUrl}/audio/transcriptions`,
        form,
        {
          headers: {
            Authorization: `Bearer ${this.openaiApiKey}`,
            ...form.getHeaders(),
          },
        },
      );

      const data = response.data as {
        duration?: number;
        words?: Array<{ word: string; start: number; end: number }>;
      };

      if (!data.words || data.words.length === 0) {
        logger.warn("Whisper returned no word timestamps, falling back to estimation");
        return this.estimateTimestampsForText(text, data.duration ?? rawAudioDurationSec);
      }

      return data.words.map((w) => ({
        word: w.word.trim(),
        startMs: Math.round(w.start * 1000),
        endMs: Math.round(w.end * 1000),
      }));
    } catch (err) {
      logger.warn({ err }, "Whisper transcription failed, using estimated timestamps");
      return this.estimateTimestampsForText(text, rawAudioDurationSec);
    }
  }

  private estimateTimestampsForText(text: string, durationSec: number): WordTimestamp[] {
    if (durationSec <= 0) return [];
    
    // Fallback mathematical logic
    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return [];

    const durationMs = durationSec * 1000;
    const timePerWord = durationMs / words.length;

    return words.map((word, index) => {
      const startMs = Math.round(index * timePerWord);
      const endMs = Math.round((index + 1) * timePerWord);
      return {
        word,
        startMs,
        endMs,
      };
    });
  }

  private estimateDurationMs(text: string): number {
    const wordCount = text.split(/\s+/).length;
    return Math.round((wordCount / 2.5) * 1000);
  }

  private encodeWAV(audioData: Float32Array, sampleRate: number): Buffer {
    const numChannels = 1;
    const numFrames = audioData.length;
    const bytesPerSample = 2; // 16-bit
    const byteRate = sampleRate * numChannels * bytesPerSample;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = numFrames * blockAlign;
    const buffer = Buffer.alloc(44 + dataSize);

    // RIFF chunk descriptor
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);

    // fmt sub-chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    buffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bytesPerSample * 8, 34);

    // data sub-chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    // write audio data
    let offset = 44;
    for (let i = 0; i < audioData.length; i++) {
      let s = Math.max(-1, Math.min(1, audioData[i]));
      buffer.writeInt16LE(s < 0 ? s * 0x8000 : Math.round(s * 0x7FFF), offset);
      offset += 2;
    }

    return buffer;
  }
}
