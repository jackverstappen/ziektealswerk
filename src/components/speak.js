/**
 * Dutch text-to-speech helpers built on the Web Speech API.
 *
 * Browser-only — do not import this into a data loader.
 * Reactive concerns (buttons, display, invalidation) belong on the page,
 * not in here.
 */

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

/** Abbreviations that a Dutch voice would otherwise mangle. */
const REPLACEMENTS = [
  [/\bACC\b/g, 'acceptatie'],
  [/\bPROD\b/g, 'productie'],
  [/\bP1\b/g, 'P één'],
  [/\bSVN\b/g, 'S V N'],
  [/\bDB\b/g, 'database'],
  [/\bBI\b/g, 'B I'],
  [/\bWS\b/g, 'webservice'],
  // Version numbers: 2.0.7 -> "2 punt 0 punt 7"
  [/\b(\d+)\.(\d+)(?:\.(\d+))?\b/g, (_, a, b, c) =>
    [a, b, c].filter(Boolean).join(' punt ')],
];

export function normalize(text, replacements = REPLACEMENTS) {
  return replacements.reduce((s, [re, to]) => s.replace(re, to), String(text));
}

/**
 * Resolve the voice list, waiting for `voiceschanged` when it is not yet
 * populated (the usual case on first call).
 */
export function getVoices() {
  if (!synth) return Promise.resolve([]);
  const list = synth.getVoices();
  if (list.length) return Promise.resolve(list);

  return new Promise((resolve) => {
    const done = () => resolve(synth.getVoices());
    synth.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1000); // some browsers never fire the event
  });
}

/** Voices for a language prefix, e.g. "nl" for both nl-NL and nl-BE. */
export async function getVoicesFor(prefix = 'nl') {
  return (await getVoices()).filter((v) => v.lang.startsWith(prefix));
}

/**
 * Speak `text`. Returns a promise that resolves when playback finishes,
 * or rejects if it is cancelled or errors.
 */
export async function speak(text, options = {}) {
  const { lang = 'nl-NL', rate = 1, pitch = 1, voice, clean = true } = options;
  if (!synth) throw new Error('Speech synthesis is not available.');

  stop();

  const source = clean ? normalize(text) : String(text);
  // Long utterances are truncated in some browsers; split on sentences.
  const chunks = (source.match(/[^.!?\n]+[.!?\n]*/g) || [source])
    .map((c) => c.trim())
    .filter(Boolean);
  if (!chunks.length) return;

  const chosen = voice || (await getVoicesFor(lang.slice(0, 2)))[0];

  await new Promise((resolve, reject) => {
    chunks.forEach((chunk, i) => {
      const u = new SpeechSynthesisUtterance(chunk);
      u.lang = lang;
      u.rate = rate;
      u.pitch = pitch;
      if (chosen) u.voice = chosen;
      if (i === chunks.length - 1) u.onend = resolve;
      u.onerror = (e) => (e.error === 'interrupted' ? resolve() : reject(e));
      synth.speak(u);
    });
  });
}

export function stop() {
  if (synth) synth.cancel();
}

export function pause() {
  if (synth) synth.pause();
}

export function resume() {
  if (synth) synth.resume();
}

export function isSpeaking() {
  return Boolean(synth && synth.speaking);
}