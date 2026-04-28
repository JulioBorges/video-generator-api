
import { KokoroTTSService } from '../src/services/tts/kokoro.service';

async function test() {
  const tts = new KokoroTTSService();
  const ttsInstance = await tts['getTTSInstance']();
  console.log('Keys of ttsInstance:', Object.keys(ttsInstance));
  console.log('Type of tokenizer:', typeof ttsInstance.tokenizer);
}

test();
