import createEphone, { roa } from 'ephone';

async function test() {
    const ephone = await createEphone([roa]);
    ephone.setVoice('pt-br');
    const text = "O rato roeu a roupa do rei de Roma.";
    const ipa = ephone.textToIpa(text);
    console.log("Original IPA:", ipa);
    
    // Simulate postProcessIpa logic
    let processed = ipa
        .replace(/ã/g, "a\u0303")
        .replace(/õ/g, "o\u0303")
        .replace(/ẽ/g, "e\u0303")
        .replace(/ĩ/g, "i\u0303")
        .replace(/ũ/g, "u\u0303")
        .replace(/r/g, "ɾ");
    
    console.log("Processed IPA:", processed);
}

test();
