const createEphone = require("ephone").default;
const { roa } = require("ephone");

(async () => {
  try {
    const ephone = await createEphone(roa);
    ephone.setVoice("pt-br");
    const text = "Olá, como vai você? Eu estou testando o sistema de voz.";
    const ipa = ephone.textToIpa(text);
    console.log("IPA:", ipa);
  } catch (err) {
    console.error(err);
  }
})();
