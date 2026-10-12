// Recorded voices. Lines can be recorded ahead of time with a good text-to-speech
// voice and saved as  voice/<lang>/<id>.mp3 ; voice/manifest.json lists which exist.
// Anything without a recording falls back to the browser's own voice.
// The id is a hash of the cleaned-up text, so the same sentence always maps to the
// same file (tools/voice-lines.mjs lists every line with its id).

// What actually gets read: no emoji, no symbols, and none of the other language's letters
export function cleanForSpeech(t, lang) {
  let s = String(t);
  s = lang === 'he'
    ? s.replace(/[A-Za-z]+/g, ' ').replace(/[֑-ׇ]/g, '')
    : s.replace(/[֐-׿]+/g, ' ');
  return s.replace(/[\u{1F000}-\u{1FAFF}☀-➿️]/gu, ' ').replace(/\s+/g, ' ').trim();
}

// FNV-1a, 32-bit → 8 hex characters
export function voiceId(clean) {
  let h = 0x811c9dc5;
  for (const ch of clean) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

let have = null;           // { en: Set, he: Set } once the manifest has loaded
let current = null;
export async function loadVoices() {
  try {
    const r = await fetch('voice/manifest.json', { cache: 'no-cache' });
    if (!r.ok) return;
    const m = await r.json();
    have = { en: new Set(m.en || []), he: new Set(m.he || []), ext: m.format || 'mp3' };
  } catch { /* no recordings yet */ }
}

// Plays the recording if there is one; returns false so the caller can use the browser voice
export function playRecorded(clean, lang, volume = 1) {
  stopRecorded();
  if (!have) return false;
  const id = voiceId(clean);
  if (!have[lang]?.has(id)) return false;
  current = new Audio(`voice/${lang}/${id}.${have.ext}`);
  current.volume = volume;
  current.play().catch(() => { });
  return true;
}
export function stopRecorded() { if (current) { current.pause(); current = null; } }
