// Replicate the exact PR phonemize logic and compare
import createEphone, { roa, en_us } from 'ephone';

const PUNCTUATION = ';:,.!?¡¿—\u2026"«»""(){}[]';
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const PUNCTUATION_PATTERN = new RegExp(`(\\s*[${escapeRegExp(PUNCTUATION)}]+\\s*)+`, 'g');

function split(text, regex) {
    const result = [];
    let prev = 0;
    for (const match of text.matchAll(regex)) {
        const fullMatch = match[0];
        if (prev < match.index) {
            result.push({ match: false, text: text.slice(prev, match.index) });
        }
        if (fullMatch.length > 0) {
            result.push({ match: true, text: fullMatch });
        }
        prev = match.index + fullMatch.length;
    }
    if (prev < text.length) {
        result.push({ match: false, text: text.slice(prev) });
    }
    return result;
}

async function phonemizeLikePR(text, language = 'p') {
    const isEnglish = language === 'a' || language === 'b';
    
    // Normalize: universal only for non-English
    text = text
        .replace(/['']/g, "'")
        .replace(/«/g, '\u201c')
        .replace(/»/g, '\u201d')
        .replace(/[\u201c\u201d]/g, '"')
        .replace(/\(/g, '«')
        .replace(/\)/g, '»')
        .replace(/[^\S \n]/g, ' ')
        .replace(/  +/, ' ')
        .replace(/(?<=\n) +(?=\n)/g, '')
        .replace(/\n+/g, ' ')
        .trim();
    
    // Split into sections preserving punctuation
    const sections = split(text, PUNCTUATION_PATTERN);
    
    const ephone = await createEphone([roa, en_us]);
    
    const voiceName = language === 'p' ? 'pt-BR' : 'en-US';
    ephone.setVoice(voiceName);
    
    // Convert sections to IPA
    const ps = sections
        .map(({ match, text: t }) => {
            if (match) return t;
            if (!t.trim()) return t;
            return ephone.textToIpa(t).replace(/\.$/, '').trim();
        })
        .join('');
    
    // Universal post-processing
    let processed = ps.replace(/ʲ/g, 'j');
    
    // English-only post processing
    if (isEnglish) {
        processed = processed
            .replace(/r/g, 'ɹ')
            .replace(/kəkˈoːɹoʊ/g, 'kˈoʊkəɹoʊ')
            .replace(/kəkˈɔːɹəʊ/g, 'kˈəʊkəɹəʊ')
            .replace(/x/g, 'k')
            .replace(/ɬ/g, 'l')
            .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, ' ')
            .replace(/ z(?=[;:,.!?¡¿—…"«»"" ]|$)/g, 'z');
        
        if (language === 'a') {
            processed = processed.replace(/(?<=nˈaɪn)ti(?!ː)/g, 'di');
        }
    }
    
    return processed.trim();
}

async function main() {
    const ptText = "O rato roeu a roupa do rei de Roma.";
    const ptIpa = await phonemizeLikePR(ptText, 'p');
    console.log("PT-BR text:", ptText);
    console.log("PT-BR IPA (PR logic):", ptIpa);
    console.log();
    
    const enText = "Hello world, this is a test.";
    const enIpa = await phonemizeLikePR(enText, 'a');
    console.log("EN-US text:", enText);
    console.log("EN-US IPA (PR logic):", enIpa);
    console.log();

    // Additional PT tests
    console.log("=== More PT examples ===");
    const ptTests = [
        "Bom dia, como você está?",
        "O Brasil é um país incrível.",
        "A inteligência artificial está mudando o mundo.",
    ];
    for (const t of ptTests) {
        const ipa = await phonemizeLikePR(t, 'p');
        console.log(`"${t}" -> "${ipa}"`);
    }
}

main();
