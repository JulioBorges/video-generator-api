
async function test() {
  const { default: createEphone, gmw } = await import('ephone');
  const ephone = await createEphone([gmw]);
  
  const langs = ['en-us', 'en-gb'];
  for (const lang of langs) {
    try {
      ephone.setVoice(lang);
      const ipa = ephone.textToIpa('Hello world');
      console.log(`Language ${lang}: ${ipa}`);
    } catch (e) {
      console.log(`Language ${lang} failed: ${e.message}`);
    }
  }
}

test();
