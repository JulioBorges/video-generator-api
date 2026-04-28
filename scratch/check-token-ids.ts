import { KokoroTTSService } from '../src/services/tts/kokoro.service';

async function test() {
    const service = new KokoroTTSService();
    // @ts-ignore
    const tts = await service.getTTSInstance();
    const tokenizer = tts.tokenizer;
    
    const symbols = ['x', 'ʁ', 'ɾ', 'r', 'ɹ', 'a', 'ã', 'u', 'ʊ'];
    console.log("Token IDs:");
    for (const s of symbols) {
        const { input_ids } = tokenizer(s);
        // input_ids is usually [bos, id, eos]
        console.log(`'${s}': ${JSON.stringify(Array.from(input_ids))}`);
    }
}

test();
