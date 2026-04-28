// Test ephone voice names — the PR uses "pt-BR" (uppercase) not "pt-br"
import createEphone, { roa, en_us } from 'ephone';

async function test() {
    const ephone = await createEphone([roa, en_us]);
    
    // Test with PT-BR (uppercase as in PR)
    console.log("=== Testing pt-BR (uppercase) ===");
    try {
        ephone.setVoice('pt-BR');
        const ipa = ephone.textToIpa("O rato roeu a roupa do rei de Roma.");
        console.log("pt-BR IPA:", ipa);
    } catch (e) { console.log("pt-BR failed:", e.message); }
    
    // Test with pt-br (lowercase as in our current code)
    console.log("=== Testing pt-br (lowercase) ===");
    try {
        ephone.setVoice('pt-br');
        const ipa = ephone.textToIpa("O rato roeu a roupa do rei de Roma.");
        console.log("pt-br IPA:", ipa);
    } catch (e) { console.log("pt-br failed:", e.message); }
    
    // Test with en-US (as in PR)
    console.log("=== Testing en-US ===");
    try {
        ephone.setVoice('en-US');
        const ipa = ephone.textToIpa("Hello world, this is a test.");
        console.log("en-US IPA:", ipa);
    } catch (e) { console.log("en-US failed:", e.message); }
    
    // Test with en (for British, as in PR)
    console.log("=== Testing en (British) ===");
    try {
        ephone.setVoice('en');
        const ipa = ephone.textToIpa("Hello world, this is a test.");
        console.log("en IPA:", ipa);
    } catch (e) { console.log("en failed:", e.message); }
}

test();
