import { KokoroTTSService } from '../src/services/tts/kokoro.service';
import { logger } from '../src/logger';

async function test() {
    const service = new KokoroTTSService();
    // Use Portuguese
    const text = "O rato roeu a roupa do rei de Roma.";
    console.log("Generating for text:", text);
    
    try {
        const result = await service.generate(text, 'pt', 'pm_alex');
        console.log("Success! Duration:", result.durationMs);
    } catch (err) {
        console.error("Error:", err);
    }
}

test();
