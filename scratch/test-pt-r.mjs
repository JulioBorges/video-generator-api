import createEphone, { roa } from 'ephone';

async function test() {
    const ephone = await createEphone([roa]);
    ephone.setVoice('pt-br');
    const texts = ["O rato roeu a roupa do rei de Roma.", "caro", "carro"];
    for (const text of texts) {
        const ipa = ephone.textToIpa(text);
        console.log(`Text: ${text} | IPA: ${ipa}`);
    }
}

test();
