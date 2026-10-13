// Coming back day after day:
//   🔥 Esh Tamid — a streak of real days played. Shabbat and Yom Tov never break it,
//      and a missed day only makes the fire smaller; it never goes out (Vayikra 6:6).
//   💎 The Choshen — a stone for each of the 12 tribes, from visitors of that tribe.
//      All 12 make you Kohen Gadol for a week; then the stones are collected again.
//   📜 Memunim — the officers of the Mikdash (Shekalim 5:1). Each day you finish,
//      Elazar appoints you as a helper to another one, with a new job.
import { isRestDay } from './calendar.js';

// Shemot 28:17-21. The names are in order of birth (Rashi); which stone is which
// gem, and its exact color, is debated — these colors are a guide.
export const TRIBES = [
  { id: 'reuven', name: 'Reuven', he: 'רְאוּבֵן', stone: 'Odem', stoneHe: 'אֹדֶם', color: '#c8283c' },
  { id: 'shimon', name: 'Shimon', he: 'שִׁמְעוֹן', stone: 'Pitdah', stoneHe: 'פִּטְדָה', color: '#a8c43a' },
  { id: 'levi', name: 'Levi', he: 'לֵוִי', stone: 'Bareket', stoneHe: 'בָּרֶקֶת', color: '#1f9a5c' },
  { id: 'yehuda', name: 'Yehuda', he: 'יְהוּדָה', stone: 'Nofech', stoneHe: 'נֹפֶךְ', color: '#2bb3b8' },
  { id: 'dan', name: 'Dan', he: 'דָּן', stone: 'Sapir', stoneHe: 'סַפִּיר', color: '#2a55c7' },
  { id: 'naftali', name: 'Naftali', he: 'נַפְתָּלִי', stone: 'Yahalom', stoneHe: 'יַהֲלֹם', color: '#e9f1ff' },
  { id: 'gad', name: 'Gad', he: 'גָּד', stone: 'Leshem', stoneHe: 'לֶשֶׁם', color: '#e08a2e' },
  { id: 'asher', name: 'Asher', he: 'אָשֵׁר', stone: 'Shvo', stoneHe: 'שְׁבוֹ', color: '#a08c78' },
  { id: 'yissachar', name: 'Yissachar', he: 'יִשָּׂשכָר', stone: 'Achlamah', stoneHe: 'אַחְלָמָה', color: '#8a3fb0' },
  { id: 'zevulun', name: 'Zevulun', he: 'זְבוּלֻן', stone: 'Tarshish', stoneHe: 'תַּרְשִׁישׁ', color: '#3f8fb5' },
  { id: 'yosef', name: 'Yosef', he: 'יוֹסֵף', stone: 'Shoham', stoneHe: 'שֹׁהַם', color: '#2c2b33' },
  { id: 'binyamin', name: 'Binyamin', he: 'בִּנְיָמִין', stone: 'Yashpeh', stoneHe: 'יָשְׁפֵה', color: 'conic-gradient(#c8283c, #e0b02e, #2bb38a, #2a55c7, #8a3fb0, #c8283c)' },
];
export const NEW_STONES_PER_DAY = 2;      // so the Choshen takes about a week of playing
export const KG_DAYS = 7;

// Helpers to the Memunim of Shekalim 5:1. `after` = full days of Avodah finished.
export const JOBS = [
  { id: 'gevini', after: 1, icon: '📣', name: 'Helper to Gevini the Crier', who: 'Gevini the Crier',
    job: 'Every morning, call out to wake the Kohanim, the Leviim and Yisrael.', src: 'Shekalim 5:1; Yoma 20b' },
  { id: 'bengever', after: 2, icon: '🚪', name: 'Helper to Ben Gever', who: 'Ben Gever',
    job: 'Every night, help close the great gates of the Azara.', src: 'Shekalim 5:1' },
  { id: 'garmu', after: 3, icon: '🍞', name: 'Helper to Beit Garmu', who: 'Beit Garmu',
    job: 'On Erev Shabbat (Friday), bake the 12 loaves of the Lechem HaPanim.', src: 'Shekalim 5:1; Yoma 3:11' },
];

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };

// Call once per real day. Returns what happened, for a message.
export function tendFire(st, now = new Date()) {
  const today = dayKey(now);
  const f = st.fire = st.fire || { last: null, streak: 0, best: 0, total: 0 };
  if (f.last === today) return null;
  let missed = 0;
  if (f.last) {
    const d = fromKey(f.last);
    for (d.setDate(d.getDate() + 1); dayKey(d) < today && missed < 60; d.setDate(d.getDate() + 1)) if (!isRestDay(d)) missed++;
  }
  f.streak = (missed ? Math.max(1, f.streak - missed) : f.streak) + 1;
  f.best = Math.max(f.best, f.streak);
  f.total++;
  f.last = today;
  return { streak: f.streak, missed, first: f.total === 1 };
}
export const fireLevel = (st) => Math.min(30, st.fire?.streak || 0);

export const kgActive = (st, now = Date.now()) => !!(st?.kgUntil && now < st.kgUntil);

// Give today's visitors their tribes: up to NEW_STONES_PER_DAY bring a stone you don't
// have yet (never Levi — the Leviim give that one), the rest come from other tribes.
export function assignTribes(st, visitorIds) {
  const have = new Set(st.stones || []);
  const shuffle = (a) => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
  const yisrael = TRIBES.filter(t => t.id !== 'levi').map(t => t.id);
  const fresh = shuffle(yisrael.filter(t => !have.has(t))).slice(0, kgActive(st) ? 0 : NEW_STONES_PER_DAY);
  const rest = shuffle(yisrael.filter(t => !fresh.includes(t)));
  const out = {};
  visitorIds.forEach((id, i) => { out[id] = fresh[i] || rest[(i - fresh.length) % rest.length]; });
  return out;
}

export const tribe = (id) => TRIBES.find(t => t.id === id);
