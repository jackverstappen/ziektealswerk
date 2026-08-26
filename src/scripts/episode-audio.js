/* Divergent Kind - episode listen mode.
   Adds a "Listen" control to an episode masthead and reads the piece aloud with
   the browser's own speech engine. No audio files, no network calls, no third
   party: the voice is the one already installed on the reader's device, so the
   feature costs nothing to serve and sends nothing anywhere.

   Progressive enhancement only. If the engine is missing the control is never
   built, and the page is exactly what it was before. */
(function () {
  const synth = window.speechSynthesis;
  if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') return;

  const masthead = document.querySelector('.mh');
  const article = document.querySelector('main article');
  if (!masthead || !article) return;

  /* ---- what gets read -------------------------------------------------
     Body prose in document order. The sources list is skipped: a run of bare
     URLs is unlistenable, and it is reference material rather than the piece.
     Figures are skipped for the same reason - their labels are a diagram, not
     a sentence. */
  const STOP_HEADING = /^\s*(sources|sources and method|method and sources)\s*$/i;
  const blocks = [];
  let stopped = false;

  article.querySelectorAll('.article-body, .ibrief-inner').forEach(box => {
    if (stopped || box.closest('figure')) return;
    box.querySelectorAll('h2, h3, p, li, .apq').forEach(el => {
      if (stopped) return;
      if (el.classList.contains('cta-tag')) return;
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      if (/^H[23]$/.test(el.tagName) && STOP_HEADING.test(text)) { stopped = true; return; }
      blocks.push({ el, text });
    });
  });
  if (blocks.length < 3) return;

  const totalWords = blocks.reduce((n, b) => n + b.text.split(' ').length, 0);

  /* ---- voice ----------------------------------------------------------
     Prefer an Australian voice, then British, then any English one, and prefer
     the higher quality synths where the platform exposes them by name. */
  let voice = null;
  function pickVoice() {
    const all = synth.getVoices().filter(v => /^en(-|_|$)/i.test(v.lang));
    if (!all.length) return;
    const score = v => {
      let s = 0;
      if (/en[-_]AU/i.test(v.lang)) s += 40;
      else if (/en[-_]GB/i.test(v.lang)) s += 30;
      else if (/en[-_]US/i.test(v.lang)) s += 20;
      if (/natural|neural|premium|enhanced|siri|google/i.test(v.name)) s += 15;
      if (/compact|espeak/i.test(v.name)) s -= 20;
      if (v.localService) s += 3;
      return s;
    };
    voice = all.slice().sort((a, b) => score(b) - score(a))[0] || null;
  }
  pickVoice();
  if (synth.onvoiceschanged !== undefined) synth.addEventListener('voiceschanged', pickVoice);

  /* ---- control --------------------------------------------------------- */
  const RATES = [1, 1.25, 1.5, 0.85];
  let rateIndex = 0;
  let index = 0;
  let playing = false;
  /* Tracked here rather than read back from the engine: synth.paused has not
     flipped yet at the instant the control repaints. */
  let paused = false;

  const style = document.createElement('style');
  style.textContent = `
    /* The band continues the masthead's ink rather than sitting inside it: the
       masthead is a fixed 1440:680 field above 1200px, so anything added within
       it is clipped by its own overflow. */
    .lst-band { background: var(--ink); padding: 0 48px 34px; }
    @media (max-width: 720px) { .lst-band { padding: 0 22px 28px; } }
    .lst { display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
      border: 2px solid rgba(232,211,173,0.32); padding: 10px 14px; max-width: 520px; }
    .lst-btn { display: inline-flex; align-items: center; gap: 9px; cursor: pointer;
      background: var(--ember); color: var(--ink); border: 0; padding: 9px 15px;
      font-family: var(--font-display); font-weight: 400; font-size: 13px;
      letter-spacing: 0.13em; text-transform: uppercase; white-space: nowrap; }
    .lst-btn:hover { background: var(--canvas); }
    .lst-btn:focus-visible { outline: 2px solid var(--canvas); outline-offset: 3px; }
    .lst-ico { width: 0; height: 0; border-left: 9px solid currentColor;
      border-top: 6px solid transparent; border-bottom: 6px solid transparent; }
    .lst-ico--pause { width: 9px; height: 12px; border: 0;
      border-left: 3px solid currentColor; border-right: 3px solid currentColor; }
    .lst-meter { flex: 1; min-width: 90px; height: 3px; background: rgba(232,211,173,0.25); }
    .lst-fill { height: 100%; width: 0%; background: var(--ember); transition: width .25s linear; }
    .lst-time { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.12em;
      text-transform: uppercase; color: rgba(232,211,173,0.72); white-space: nowrap; }
    .lst-rate { cursor: pointer; background: transparent; color: rgba(232,211,173,0.72);
      border: 1px solid rgba(232,211,173,0.32); padding: 4px 8px;
      font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.1em; }
    .lst-rate:hover { color: var(--canvas); border-color: var(--canvas); }
    .lst-note { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em;
      text-transform: uppercase; color: rgba(232,211,173,0.45); flex-basis: 100%; margin: 0; }
    .lst-on { background: rgba(233,120,33,0.13); box-shadow: -14px 0 0 0 rgba(233,120,33,0.13),
      14px 0 0 0 rgba(233,120,33,0.13); }
    @media (max-width: 720px) { .lst { gap: 10px; padding: 9px 11px; } .lst-time { font-size: 10px; } }
    @media (prefers-reduced-motion: reduce) { .lst-fill { transition: none; } }
  `;
  document.head.appendChild(style);

  const band = document.createElement('div');
  band.className = 'lst-band';
  const wrap = document.createElement('div');
  wrap.className = 'lst';
  band.appendChild(wrap);
  wrap.innerHTML =
    '<button class="lst-btn" type="button" aria-label="Listen to this episode">' +
      '<span class="lst-ico" aria-hidden="true"></span><span class="lst-label">Listen</span></button>' +
    '<span class="lst-meter" aria-hidden="true"><span class="lst-fill"></span></span>' +
    '<span class="lst-time" role="status" aria-live="polite"></span>' +
    '<button class="lst-rate" type="button" aria-label="Playback speed">1x</button>' +
    '<p class="lst-note">Read aloud by your browser</p>';
  masthead.insertAdjacentElement('afterend', band);

  const btn = wrap.querySelector('.lst-btn');
  const ico = wrap.querySelector('.lst-ico');
  const label = wrap.querySelector('.lst-label');
  const fill = wrap.querySelector('.lst-fill');
  const time = wrap.querySelector('.lst-time');
  const rateBtn = wrap.querySelector('.lst-rate');

  function minutesLeft() {
    const done = blocks.slice(0, index).reduce((n, b) => n + b.text.split(' ').length, 0);
    return Math.max(1, Math.round((totalWords - done) / (180 * RATES[rateIndex])));
  }
  function paint() {
    fill.style.width = (blocks.length ? (index / blocks.length) * 100 : 0) + '%';
    time.textContent = (playing || paused) ? minutesLeft() + ' min left' : minutesLeft() + ' min';
    label.textContent = playing ? 'Pause' : (paused ? 'Resume' : 'Listen');
    ico.className = playing ? 'lst-ico lst-ico--pause' : 'lst-ico';
    btn.setAttribute('aria-label', playing ? 'Pause' : 'Listen to this episode');
  }

  function mark(on) {
    blocks.forEach(b => b.el.classList.remove('lst-on'));
    if (on && blocks[index]) blocks[index].el.classList.add('lst-on');
  }

  /* Chrome stops a long utterance after roughly fifteen seconds unless it is
     nudged, so the queue is kept warm while speaking. */
  let keepWarm = null;
  function warm(on) {
    if (keepWarm) { clearInterval(keepWarm); keepWarm = null; }
    if (on) keepWarm = setInterval(() => { if (synth.speaking && !synth.paused) { synth.pause(); synth.resume(); } }, 9000);
  }

  function speak() {
    if (index >= blocks.length) { stop(); return; }
    const u = new SpeechSynthesisUtterance(blocks[index].text);
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    u.rate = RATES[rateIndex];
    u.onend = () => { if (!playing) return; index += 1; mark(true); paint(); speak(); };
    u.onerror = () => { playing = false; paused = false; warm(false); mark(false); paint(); };
    synth.speak(u);
  }

  function start() {
    synth.cancel();
    playing = true; paused = false; warm(true); mark(true); paint(); speak();
  }
  function stop() {
    playing = false; paused = false; index = 0; warm(false); synth.cancel(); mark(false); paint();
  }
  /* A real pause, not a stop: the passage holds its place and its highlight, so
     resuming picks up mid sentence rather than restarting the paragraph. */
  function pause() {
    playing = false; paused = true; warm(false); synth.pause(); paint();
  }
  function resume() {
    playing = true; paused = false; warm(true); synth.resume(); paint();
    /* Some engines discard a paused utterance rather than holding it. If nothing
       is speaking shortly after a resume, restart the current passage. */
    setTimeout(() => { if (playing && !synth.speaking) speak(); }, 420);
  }

  btn.addEventListener('click', () => {
    if (playing) pause();
    else if (paused) resume();
    else start();
  });

  rateBtn.addEventListener('click', () => {
    rateIndex = (rateIndex + 1) % RATES.length;
    rateBtn.textContent = RATES[rateIndex] + 'x';
    if (playing) { synth.cancel(); speak(); }
    paint();
  });

  /* Some engines keep talking after the reader has navigated away. */
  window.addEventListener('beforeunload', () => synth.cancel());
  window.addEventListener('pagehide', () => synth.cancel());

  paint();
})();
