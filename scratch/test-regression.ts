
import { KokoroTTSService } from '../src/services/tts/kokoro.service';
import { logger } from '../src/logger';

async function test() {
  const tts = new KokoroTTSService();
  
  // Mock internal generate_from_ids to avoid actually running the model in this test
  // but capture the phonemes passed to the tokenizer.
  // We need to initialize the instance first.
  const ttsInstance = await tts['getTTSInstance']();
  
  const originalTokenizer = ttsInstance.tokenizer.bind(ttsInstance);
  let capturedPhonemes = '';
  
  ttsInstance.tokenizer = (text, options) => {
    capturedPhonemes = text;
    console.log(`Captured Phonemes: ${text}`);
    return originalTokenizer(text, options);
  };

  console.log('--- Testing Portuguese (pt-br) ---');
  try {
    await tts.generate('Olá mundo', 'pt', 'pm_alex');
  } catch (e) {
    // We expect some errors if not in full env, but we just want to see the phonemes
    console.log('PT Error (expected if model/whisper not fully mocked):', e.message);
  }

  console.log('\n--- Testing English (en-us) ---');
  try {
    await tts.generate('Hello world', 'en', 'af_heart');
  } catch (e) {
    console.log('EN Error (expected):', e.message);
  }
}

test();
