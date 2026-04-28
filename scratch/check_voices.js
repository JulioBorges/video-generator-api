const { list_voices } = require("phonemizer");
(async () => {
  const voices = await list_voices();
  console.log(JSON.stringify(voices, null, 2));
})();
