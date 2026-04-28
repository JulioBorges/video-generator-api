const { AutoTokenizer } = require("@xenova/transformers");

async function checkVocab() {
    console.log("Loading tokenizer...");
    const tokenizer = await AutoTokenizer.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX");
    
    const vocab = tokenizer.vocab;
    const targets = ['ã', 'õ', 'ẽ', 'ĩ', 'ũ', 'ʁ', 'ɾ', 'x', 'r', 'ɹ', 'u', 'ʊ'];
    
    for (const char of targets) {
        const id = vocab[char];
        const decomposed = char.normalize('NFD');
        const decomposedId = vocab[decomposed];
        console.log(`'${char}': ${id} | Decomposed: '${decomposed}' (${decomposedId})`);
    }
    
    // Check if it has the combining tilde
    const tilde = "\u0303";
    console.log(`Combining tilde: ${vocab[tilde]}`);
}

checkVocab().catch(console.error);
