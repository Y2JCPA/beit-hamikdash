// Languages. The game is written in English; in Hebrew every piece of text is
// translated on its way onto the screen, so the rest of the code doesn't need to
// know about languages at all:
//   • a dictionary of whole sentences (js/he.js), with {0} {1} slots for names and numbers
//   • a watcher that translates any text the moment it is put on the page
//   • sources like "Zevachim 5:1" become "זבחים ה:א"
import { SETTINGS_KEY } from './config.js';

export let lang = 'en';
export let nikud = false;          // Hebrew with vowel points, for children learning to read
// two tables: what is shown (with nikud if chosen) and plain Hebrew (for read-aloud,
// so the recorded voices match either way)
const makeTable = () => ({ dict: new Map(), patterns: [], memo: new Map() });
const plain = makeTable();
let shown = plain;
let books = [];
const missed = new Set();          // for play-tests: text that had no translation

function fill(t, strings) {
  for (const [en, he] of Object.entries(strings)) {
    if (!he) continue;
    const k = norm(en);
    if (/\{\d\}/.test(k)) {
      const lit = k.replace(/\{\d\}/g, '');
      if (!/[A-Za-z]{2}/.test(lit)) continue;            // "{0} {1}" would match anything
      const re = new RegExp('^' + k.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{(\d)\\?\}/g, '(.*?)') + '$');
      const order = [...k.matchAll(/\{(\d)\}/g)].map(m => +m[1]);
      t.patterns.push({ re, he, order, weight: lit.length });
    } else t.dict.set(k, he);
  }
  t.patterns.sort((a, b) => b.weight - a.weight);
}

export async function initLanguage() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { }
  lang = s.lang || ((navigator.language || '').toLowerCase().startsWith('he') ? 'he' : 'en');
  document.documentElement.lang = lang;
  if (lang !== 'he') return;
  try {
    const HE = (await import('./he.js')).default;
    fill(plain, HE.strings);
    nikud = s.nikud !== false;
    if (nikud) {
      try {
        const NK = (await import('./he-nikud.js')).default;
        shown = makeTable();
        fill(shown, { ...HE.strings, ...NK });
        document.documentElement.classList.add('nikud');
      } catch (e) { console.error('Nikud could not load', e); nikud = false; }
    }
    books = Object.entries(HE.books || {}).sort((a, b) => b[0].length - a[0].length);
    document.documentElement.dir = 'rtl';
    document.title = tr(document.title);
    watch();
  } catch (e) {
    console.error('Hebrew could not load', e);
    lang = 'en'; document.documentElement.lang = 'en';
  }
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const hasLatin = (s) => /[A-Za-z]{2}/.test(s);

// ── gematria for sources ──
const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'], TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'], HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת'];
function gematria(n) {
  let s = '';
  if (n >= 100) { s += HUNDREDS[Math.min(4, Math.floor(n / 100))]; n %= 100; }
  if (n === 15) return s + 'טו';
  if (n === 16) return s + 'טז';
  s += TENS[Math.floor(n / 10)] + ONES[n % 10];
  return s;
}
// "Zevachim 5:1; Yoma 36a" → "זבחים ה:א; יומא לו."  (a/b pages become . and :)
function trSource(src) {
  let out = src;
  for (const [en, he] of books) out = out.split(en).join(he);
  out = out.replace(/(\d+)([ab])\b/g, (_, n, side) => gematria(+n) + (side === 'a' ? '.' : ':'))
    .replace(/\d+/g, (n) => gematria(+n));
  return hasLatin(out) ? null : out;
}
const looksLikeSource = (s) => books.some(([en]) => s.startsWith(en)) && /\d/.test(s);

export const tr = (s) => trWith(shown, s);
export const trPlain = (s) => trWith(plain, s);       // without nikud, for read-aloud

function trWith(T, s) {
  if (lang !== 'he' || typeof s !== 'string' || !hasLatin(s) || /[\u05D0-\u05EA]/.test(s)) return s;   // already Hebrew
  const hit = T.memo.get(s);
  if (hit !== undefined) return hit;
  const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
  const t = trCore(norm(s), T);
  const res = t === null ? s : lead + t + trail;
  if (t === null) missed.add(norm(s));
  T.memo.set(s, res);
  return res;
}

function trCore(core, T) {
  if (T.dict.has(core)) return T.dict.get(core);
  // a symbol or emoji in front: "📜 New lesson…", "— Zevachim 5:1"
  let m = core.match(/^([^A-Za-z"'(]+)(.+)$/);
  if (m && hasLatin(m[2])) { const t = trCore(m[2], T); if (t !== null) return m[1] + t; }
  // something in brackets at the end: "…by the rings.  (Zevachim 5:1)", "Zerika here (North-East)"
  m = core.match(/^(.*\S)\s+\(([^()]+)\)$/);
  if (m) {
    const a = trCore(m[1], T), b = looksLikeSource(m[2]) ? trSource(m[2]) : trCore(m[2], T);
    if (a !== null && b) return `${a} (${b})`;
  }
  // "Kinor · A": translate each part
  if (core.includes(' · ')) {
    const parts = core.split(' · ').map(x => hasLatin(x) ? trCore(x, T) : x);
    if (!parts.includes(null)) return parts.join(' · ');
  }
  if (looksLikeSource(core)) { const t = trSource(core); if (t) return t; }
  for (const p of T.patterns) {
    const mm = core.match(p.re);
    if (!mm) continue;
    return p.he.replace(/\{(\d)\}/g, (_, i) => {
      const v = mm[p.order.indexOf(+i) + 1] ?? '';
      if (!hasLatin(v)) return v;
      const t = trCore(norm(v), T);
      return t === null ? v : v.match(/^\s*/)[0] + t + v.match(/\s*$/)[0];   // keep the spaces around it
    });
  }
  return null;
}

// ── translate the page as it changes ──
const SKIP = new Set(['SCRIPT', 'STYLE', 'CANVAS', 'TEXTAREA', 'INPUT']);
function trText(n) {
  const p = n.parentNode;
  if (!p || SKIP.has(p.nodeName) || p.closest?.('[data-noi18n]')) return;
  const v = n.nodeValue;
  if (!hasLatin(v)) return;
  const t = tr(v);
  if (t !== v) n.nodeValue = t;
}
function trAttrs(el) {
  for (const a of ['title', 'placeholder', 'aria-label']) {
    const v = el.getAttribute?.(a);
    if (v && hasLatin(v)) { const t = tr(v); if (t !== v) el.setAttribute(a, t); }
  }
}
function trTree(root) {
  if (root.nodeType === 3) return trText(root);
  if (root.nodeType !== 1 || SKIP.has(root.nodeName)) return;
  trAttrs(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) n.nodeType === 3 ? trText(n) : trAttrs(n);
}
function watch() {
  trTree(document.body);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') trText(m.target);
      else if (m.type === 'attributes') trAttrs(m.target);
      else m.addedNodes.forEach(trTree);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder', 'aria-label'] });
}

// for automated play-tests
window.__i18n = { missed: () => [...missed], tr };
