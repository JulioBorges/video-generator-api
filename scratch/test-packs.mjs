// Test what voices are available in gmw vs en_us packs
import createEphone, { roa, gmw, en_us } from 'ephone';

async function test() {
    // Test with gmw (our current setup)
    console.log("=== Testing with gmw pack ===");
    const ephone1 = await createEphone([roa, gmw]);
    
    for (const voice of ['en', 'en-US', 'en-GB', 'pt-BR']) {
        try {
            ephone1.setVoice(voice);
            const ipa = ephone1.textToIpa("Hello");
            console.log(`  ${voice}: OK -> ${ipa}`);
        } catch (e) { console.log(`  ${voice}: FAIL -> ${e.message}`); }
    }
    
    // Test with en_us pack
    console.log("\n=== Testing with en_us pack ===");
    const ephone2 = await createEphone([roa, en_us]);
    
    for (const voice of ['en', 'en-US', 'en-GB', 'pt-BR']) {
        try {
            ephone2.setVoice(voice);
            const ipa = ephone2.textToIpa("Hello");
            console.log(`  ${voice}: OK -> ${ipa}`);
        } catch (e) { console.log(`  ${voice}: FAIL -> ${e.message}`); }
    }
    
    // Test with both packs
    console.log("\n=== Testing with gmw + en_us packs ===");
    const ephone3 = await createEphone([roa, gmw, en_us]);
    
    for (const voice of ['en', 'en-US', 'en-GB', 'pt-BR']) {
        try {
            ephone3.setVoice(voice);
            const ipa = ephone3.textToIpa("Hello");
            console.log(`  ${voice}: OK -> ${ipa}`);
        } catch (e) { console.log(`  ${voice}: FAIL -> ${e.message}`); }
    }
}

test();
