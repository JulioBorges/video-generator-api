
async function test() {
  const { default: createEphone, gmw, roa } = await import('ephone');
  const ephone = await createEphone([gmw, roa]);
  // Usually ephone doesn't have a listVoices method, but we can try to find where it gets them.
  // Let's try some common espeak codes.
  const tryCodes = ['en', 'en-us', 'en-gb', 'english', 'us', 'gb', 'pt', 'pt-br'];
  for (const code of tryCodes) {
    try {
      ephone.setVoice(code);
      console.log(`Code [${code}] is AVAILABLE`);
    } catch (e) {
      // console.log(`Code [${code}] is NOT available`);
    }
  }
}

test();
