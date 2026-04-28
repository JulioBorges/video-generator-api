const { KokoroTTS } = require('kokoro-js');

async function test() {
  try {
    const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype: 'fp32',
    });
    console.log("TTS Loaded");
  } catch(e) {
    console.error(e);
  }
}
test();
