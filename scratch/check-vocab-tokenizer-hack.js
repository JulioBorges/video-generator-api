async function checkVocab() {
    console.log("Loading transformers...");
    const { AutoTokenizer } = await (new Function('return import("@xenova/transformers")'))();
    
    console.log("Loading tokenizer...");
    const tokenizer = await AutoTokenizer.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX");
    
    const vocab = tokenizer.vocab;
    const targets = ['ã', 'õ', 'ẽ', 'ĩ', 'ũ', 'ʁ', 'ɾ', 'x', 'r', 'ɹ', 'u', 'ʊ', 'X'];
    
    for (const char of targets) {
        const id = vocab[char];
        console.log(`'${char}': ${id}`);
    }
    
    // Check for combining tilde
    const tilde = "\u0303";
    console.log(`Combining tilde (\\u0303): ${vocab[tilde]}`);
    
    // Check some tokens around 98 (where ʁ often is)
    const tokens = Object.keys(vocab);
    const sorted = tokens.sort((a, b) => vocab[a] - vocab[b]);
    console.log("Tokens 90-110:", sorted.slice(90, 110).map(t => `${vocab[t]}:${t}`).join(", "));
}

checkVocab().catch(console.error);
