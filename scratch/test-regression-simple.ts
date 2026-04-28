
import { KokoroTTSService } from '../src/services/tts/kokoro.service';

async function test() {
  const tts = new KokoroTTSService();
  
  console.log('--- Testing Portuguese (pt-br) ---');
  try {
    // We use a small text to avoid long generation
    await tts.generate('Olá', 'pt', 'pm_alex');
  } catch (e) {
    console.log('PT Done (ignored error if any):', e.message);
  }

  console.log('\n--- Testing English (en-us) ---');
  try {
    await tts.generate('Hello', 'en', 'af_heart');
  } catch (e) {
    console.log('EN Done (ignored error if any):', e.message);
  }
}

test();
