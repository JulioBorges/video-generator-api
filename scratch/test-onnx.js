const { KokoroTTS } = require('kokoro-js');

async function test() {
  const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
    dtype: "fp32",
  });
  console.log('Available voices:', tts.list_voices().map(v => v.name));
  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
