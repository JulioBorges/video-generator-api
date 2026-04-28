const { KokoroTTS } = require("kokoro-js");

async function checkVocab() {
    const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
        dtype: "fp32",
    });
    
    const vocab = tts.tokenizer.vocab;
    const tokens = Object.keys(vocab).sort((a, b) => vocab[a] - vocab[b]);
    
    console.log("Vocab sample (first 100):", tokens.slice(0, 100).join(", "));
    console.log("Vocab sample (all):", tokens.join(", "));
    
    // Check for specific IPA symbols
    const targets = ['ʁ', 'ɾ', 'ã', 'õ', 'ẽ', 'ĩ', 'ũ', 'x', 'r', 'ɹ'];
    for (const char of targets) {
        console.log(`'${char}': ${vocab[char]}`);
    }
}

checkVocab();
