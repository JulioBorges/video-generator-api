import axios from "axios";
import fs from "fs-extra";
import path from "path";
import cuid from "cuid";
import type { TTSProvider, TTSResult } from "./tts.interface";
import type { Language, WordTimestamp } from "../../types/video.types";
import type { FFmpegService } from "../renderer/ffmpeg.service";
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
        const { default: createEphone, roa, gmw, en_all } = await (new Function('return import("ephone")'))();
        // Initialize with Romance (roa), Germanic (gmw) and English (en_all) packs
        this.ephoneInstance = await createEphone([roa, gmw, en_all]);
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
          const fsNode = require("fs");
          const pathNode = require("path");
          // Path to the voices directory in node_modules
          const voicesDir = pathNode.join(process.cwd(), "node_modules", "kokoro-js", "voices");
          
          if (fsNode.existsSync(voicesDir)) {
            const files = fsNode.readdirSync(voicesDir);
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

            // PATCH GENERATE TO USE EPHONE (aligned with PR #313)
            this.ttsInstance.generate = async (text: string, options: any = {}) => {
              const voice = options.voice || "af_heart";
              const voiceMeta = patchedVoices[voice];
              
              if (this.ephoneInstance && voiceMeta) {
                try {
                  const lang = voice.charAt(0); // voice prefix: 'p' for pt-br, 'a' for en-us
                  const isEnglish = lang === 'a' || lang === 'b';
                  const ephoneVoice = this.getEphoneVoice(lang);
                  
                  logger.debug({ text, voice, lang, ephoneVoice }, "Using ephone for phonemization");
                  
                  // 1. Normalize text (English-specific rules only for English)
                  const normalizedText = this.normalizeText(text, isEnglish);
                  
                  // 2. Split on punctuation, phonemize each segment, rejoin (PR #313 approach)
                  const sections = this.splitOnPunctuation(normalizedText);
                  this.ephoneInstance.setVoice(ephoneVoice);
                  
                  const phonemes = sections
                    .map(({ match, text: t }: { match: boolean; text: string }) => {
                      if (match) return t; // Keep punctuation as-is
                      if (!t.trim()) return t;
                      // ephone appends a trailing "." — strip it
                      return this.ephoneInstance.textToIpa(t).replace(/\.$/, '').trim();
                    })
                    .join('');
                  
                  // 3. Post-process IPA (English-specific gated behind isEnglish)
                  const finalPhonemes = this.postProcessIpa(phonemes, lang, isEnglish);
                  
                  // 4. Generate from ids (bypassing internal phonemizer)
                  // NOTE: Append a space to ensure the model processes the last phonemes fully
                  const phonemesWithPadding = finalPhonemes + " ";
                  logger.info({ finalPhonemes: phonemesWithPadding }, "Kokoro generating from IPA");
                  const { input_ids } = this.ttsInstance.tokenizer(phonemesWithPadding, { truncation: true });
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

  /**
   * Map Kokoro voice prefix to ephone voice name.
   * Matches PR #313 LANG_CONFIG mapping.
   */
  private getEphoneVoice(voicePrefix: string): string {
    const map: Record<string, string> = {
      'a': 'en-US',
      'b': 'en-US',  // Use en-US IPA for both US and UK (Standard practice in Kokoro PR #313)
      'p': 'pt-BR',
      'e': 'es',
      'f': 'fr',
      'i': 'it',
      'z': 'cmn',
      'j': 'ja',
    };
    return map[voicePrefix] || 'en-US';
  }

  /**
   * Split text on punctuation, preserving delimiters.
   * Matches the split() + PUNCTUATION_PATTERN from PR #313.
   */
  private splitOnPunctuation(text: string): Array<{ match: boolean; text: string }> {
    const PUNCTUATION = ';:,.!?\u00a1\u00bf\u2014\u2026"\u00ab\u00bb(){}[]';
    const escaped = PUNCTUATION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(\\s*[${escaped}]+\\s*)+`, 'g');
    
    const result: Array<{ match: boolean; text: string }> = [];
    let prev = 0;
    for (const m of text.matchAll(pattern)) {
      const fullMatch = m[0];
      if (prev < m.index!) {
        result.push({ match: false, text: text.slice(prev, m.index!) });
      }
      if (fullMatch.length > 0) {
        result.push({ match: true, text: fullMatch });
      }
      prev = m.index! + fullMatch.length;
    }
    if (prev < text.length) {
      result.push({ match: false, text: text.slice(prev) });
    }
    return result;
  }

  /**
   * Normalize text before phonemization.
   * Universal normalization always applied; English-specific rules gated behind isEnglish.
   * Matches normalize_text() from PR #313.
   */
  private normalizeText(text: string, isEnglish: boolean): string {
    // Steps 1-3: Universal normalization
    let normalized = text
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/\u00ab/g, '\u201c')
      .replace(/\u00bb/g, '\u201d')
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/\(/g, '\u00ab')
      .replace(/\)/g, '\u00bb')
      .replace(/\u3001/g, ', ')
      .replace(/\u3002/g, '. ')
      .replace(/\uff01/g, '! ')
      .replace(/\uff0c/g, ', ')
      .replace(/\uff1a/g, ': ')
      .replace(/\uff1b/g, '; ')
      .replace(/\uff1f/g, '? ')
      .replace(/[^\S \n]/g, ' ')
      .replace(/  +/, ' ')
      .replace(/(?<=\n) +(?=\n)/g, '')
      .replace(/\n+/g, ' ')
      .trim();

    if (!isEnglish) return normalized;

    // Steps 4-7: English-specific normalization
    return normalized
      .replace(/\bD[Rr]\.(?= [A-Z])/g, 'Doctor')
      .replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, 'Mister')
      .replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, 'Miss')
      .replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, 'Mrs')
      .replace(/\betc\.(?! [A-Z])/gi, 'etc')
      .replace(/\b(y)eah?\b/gi, "$1e'a")
      .replace(/(?<=[BCDFGHJ-NP-TV-Z])'?s\b/g, "'S")
      .replace(/(?<=X')S\b/g, 's')
      .replace(/(?:[A-Za-z]\.){2,} [a-z]/g, (m) => m.replace(/\./g, '-'))
      .replace(/(?<=[A-Z])\.(?=[A-Z])/gi, '-');
  }

  /**
   * Post-process IPA output from ephone for Kokoro consumption.
   * Only ʲ→j is universal. All other replacements (r→ɹ, x→k, kokoro pronunciation)
   * are gated behind isEnglish. Non-English phonemes pass through unchanged.
   * Matches the post-processing logic from PR #313.
   */
  private postProcessIpa(ipa: string, lang: string, isEnglish: boolean): string {
    // Universal: ʲ → j
    let processed = ipa.replace(/ʲ/g, 'j');

    if (isEnglish) {
      // English-specific post-processing
      processed = processed
        .replace(/r/g, 'ɹ')                              // eSpeak r → English retroflex ɹ
        .replace(/kəkˈoːɹoʊ/g, 'kˈoʊkəɹoʊ')             // "kokoro" pronunciation fix (US)
        .replace(/kəkˈɔːɹəʊ/g, 'kˈəʊkəɹəʊ')             // "kokoro" pronunciation fix (GB)
        .replace(/x/g, 'k')                               // x → k for English
        .replace(/ɬ/g, 'l')                               // ɬ → l for English
        .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, ' ')       // space before "hundred"
        .replace(/ z(?=[;:,.!?¡¿—…"«»"" ]|$)/g, 'z');    // collapse " z" before punctuation

      if (lang === 'a') {
        processed = processed.replace(/(?<=nˈaɪn)ti(?!ː)/g, 'di'); // "ninety" → "ninedy" (AmE)
      }
    }

    return processed.trim();
  }

  async generate(text: string, language: Language, voice: string | undefined, speed: number | undefined, tempDir: string, ffmpeg: FFmpegService): Promise<TTSResult> {
    const voiceName = (voice ?? DEFAULT_VOICES[language]).toLowerCase();
    const voiceSpeed = speed ?? 1.0;
    const chunks = this.splitTextIntoChunks(text);
    const batchId = cuid();

    logger.debug(
      { language, voice: voiceName, speed: voiceSpeed, textLength: text.length, chunks: chunks.length },
      "Generating TTS via Kokoro (Local)",
    );

    const tts = await this.getTTSInstance();
    const chunkPaths: string[] = [];
    const allTimestamps: WordTimestamp[] = [];
    let currentOffsetMs = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (chunks.length > 1) {
        logger.info({ chunkIndex: i + 1, totalChunks: chunks.length }, "Processing TTS chunk");
      }

      try {
        // 1. Generate speech audio for this chunk using Kokoro
        const audio = await tts.generate(chunk, { voice: voiceName, speed: voiceSpeed });
        
        // Convert Float32Array to WAV and save to disk
        const chunkBuffer = this.encodeWAV(audio.audio, audio.sampling_rate);
        const chunkPath = path.join(tempDir, `tts-${batchId}-${String(i).padStart(4, "0")}.wav`);
        await fs.writeFile(chunkPath, chunkBuffer);
        chunkPaths.push(chunkPath);

        // Detect possible audio truncation
        const actualDurationSec = audio.audio.length / audio.sampling_rate;
        const wordCount = chunk.split(/\s+/).length;
        const expectedMinDurationSec = wordCount / 4; // ~4 words/sec is fast speech
        if (actualDurationSec < expectedMinDurationSec * 0.6) {
          logger.warn(
            { chunkIndex: i + 1, chunkChars: chunk.length, wordCount, actualDurationSec: actualDurationSec.toFixed(1), expectedMinSec: expectedMinDurationSec.toFixed(1) },
            "Possible Kokoro audio truncation detected — chunk may be too long for the model"
          );
        }

        // 2. Estimate timestamps mathematically (since scenes are short, this is sufficient)
        const rawAudioDurationSec = (chunkBuffer.length - 44) / (audio.sampling_rate * 2);
        const chunkTimestamps = this.estimateTimestampsForText(chunk, rawAudioDurationSec);

        // 3. Adjust timestamps with the current cumulative offset
        const adjustedTimestamps = chunkTimestamps.map((t) => ({
          ...t,
          startMs: t.startMs + currentOffsetMs,
          endMs: t.endMs + currentOffsetMs,
        }));

        allTimestamps.push(...adjustedTimestamps);

        // 4. Update offset for next chunk
        // 4. Update offset for next chunk using the ACTUAL physical audio duration
        // because ffmpeg will concatenate the files back-to-back.
        // encodeWAV adds 0.25s of padding.
        const wavDurationMs = Math.round((actualDurationSec + 0.25) * 1000);

        currentOffsetMs += wavDurationMs;
      } catch (err: any) {
        throw new Error(`Kokoro TTS chunk ${i + 1} failed: ${err.message}`);
      }
    }

    // Concatenate all chunks into a single MP3 via FFmpeg
    const audioFilePath = path.join(tempDir, `tts-${batchId}-final.mp3`);
    await ffmpeg.concatAudioFiles(chunkPaths, audioFilePath);

    // Cleanup individual chunk files
    for (const p of chunkPaths) {
      await fs.remove(p).catch(() => {});
    }

    const durationMs = currentOffsetMs;
    logger.debug({ durationMs, wordCount: allTimestamps.length }, "Kokoro TTS generated (all chunks)");

    return { audioFilePath, durationMs, timestamps: allTimestamps };
  }

  private splitTextIntoChunks(text: string, maxChars = 200): string[] {
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



  private estimateTimestampsForText(text: string, durationSec: number): WordTimestamp[] {
    if (durationSec <= 0) return [];
    
    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return [];

    const durationMs = durationSec * 1000;
    
    // Calculate total "weight" of all words based on character length
    // Add base weight so very short words aren't skipped, and extra for punctuation.
    const wordWeights = words.map(word => {
      let weight = word.length + 1; 
      if (/[.,!?;:]$/.test(word)) {
        weight += 3; // add extra time for punctuation pauses
      }
      return weight;
    });

    const totalWeight = wordWeights.reduce((sum, w) => sum + w, 0);
    const msPerWeight = durationMs / totalWeight;

    let currentMs = 0;
    return words.map((word, index) => {
      const startMs = Math.round(currentMs);
      currentMs += wordWeights[index] * msPerWeight;
      const endMs = Math.round(currentMs);
      
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
    // Add 250ms of silence padding to the end to prevent truncation by players/converters
    const paddingFrames = Math.floor(sampleRate * 0.25);
    const numFrames = audioData.length + paddingFrames;
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
    for (let i = 0; i < numFrames; i++) {
      // Use original data or silence for padding
      const sample = i < audioData.length ? audioData[i] : 0;
      let s = Math.max(-1, Math.min(1, sample));
      buffer.writeInt16LE(s < 0 ? s * 0x8000 : Math.round(s * 0x7FFF), offset);
      offset += 2;
    }

    return buffer;
  }
}
