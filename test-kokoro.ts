import { KokoroTTS } from 'kokoro-js';

async function test() {
  try {
    const tts = await KokoroTTS.from_pretrained('Xenova/kokoro-82m-v1.0-onnx', {
      dtype: 'fp32',
    });
    console.log(tts);
  } catch(e) {
    console.error(e);
  }
}
test();
