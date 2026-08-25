// src/components/speak.js
export function speak(text, {lang = "nl-NL", rate = 1} = {}) {
  const synth = window.speechSynthesis;
  synth.cancel();

  // Chrome truncates long utterances; split on sentence boundaries.
  const chunks = text.match(/[^.!?\n]+[.!?\n]*/g) ?? [text];
  const voice = synth.getVoices().find((v) => v.lang.startsWith(lang.slice(0, 2)));

  for (const chunk of chunks) {
    const u = new SpeechSynthesisUtterance(chunk.trim());
    u.lang = lang;
    u.rate = rate;
    if (voice) u.voice = voice;
    synth.speak(u);
  }
}