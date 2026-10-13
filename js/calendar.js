// The Hebrew calendar, worked out on the device (no internet needed) with the
// browser's built-in Hebrew calendar. Used for Rosh Chodesh and the 📅 page.
// (The day changes at midnight here, not at sunset.)

const MONTHS = {
  Tishri: ['Tishrei', 'תשרי'], Heshvan: ['Cheshvan', 'חשוון'], Kislev: ['Kislev', 'כסלו'], Tevet: ['Tevet', 'טבת'],
  Shevat: ['Shevat', 'שבט'], 'Adar I': ['Adar Aleph', 'אדר א׳'], 'Adar II': ['Adar Bet', 'אדר ב׳'], Adar: ['Adar', 'אדר'],
  Nisan: ['Nisan', 'ניסן'], Iyar: ['Iyar', 'אייר'], Sivan: ['Sivan', 'סיוון'], Tamuz: ['Tammuz', 'תמוז'], Av: ['Av', 'אב'], Elul: ['Elul', 'אלול'],
};

let fmt = null;
try {
  fmt = new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' });
  const m = fmt.formatToParts(new Date()).find(p => p.type === 'month')?.value;
  if (!MONTHS[m]) fmt = null;          // this browser doesn't really know the Hebrew calendar
} catch { fmt = null; }

export const calendarSupported = () => !!fmt;

export function hebrewDate(d = new Date()) {
  if (!fmt) return null;
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
  const [name, he] = MONTHS[parts.month] || [parts.month, parts.month];
  return { day: +parts.day, month: parts.month, name, he, year: +parts.year };
}

const addDays = (d, n) => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() + n); return x; };

// Rosh Chodesh is the 1st of the month, and also the 30th of the month before (two days).
// 1 Tishrei is Rosh Hashanah, a Yom Tov, so it is listed as that instead.
export function roshChodesh(d = new Date()) {
  const h = hebrewDate(d);
  if (!h) return null;
  if (h.day === 30) { const n = hebrewDate(addDays(d, 1)); return n.month === 'Tishri' ? null : { name: n.name, he: n.he, day: 1, of: 2 }; }
  if (h.day === 1 && h.month !== 'Tishri') {
    const prev = hebrewDate(addDays(d, -1));
    return { name: h.name, he: h.he, day: prev.day === 30 ? 2 : 1, of: prev.day === 30 ? 2 : 1 };
  }
  return null;
}

const HOLIDAYS = [
  { m: 'Tishri', d: 1, icon: '📯', title: 'Rosh Hashanah', he: 'ראש השנה', yt: true },
  { m: 'Tishri', d: 10, icon: '🤍', title: 'Yom Kippur', he: 'יום כיפור', yt: true },
  { m: 'Tishri', d: 15, icon: '🌿', title: 'Sukkot', he: 'סוכות', yt: true },
  { m: 'Tishri', d: 22, icon: '💧', title: 'Shemini Atzeret', he: 'שמיני עצרת', yt: true },
  { m: 'Kislev', d: 25, icon: '🕎', title: 'Chanukah', he: 'חנוכה' },
  { m: 'Adar', d: 14, icon: '🎭', title: 'Purim', he: 'פורים' },
  { m: 'Adar II', d: 14, icon: '🎭', title: 'Purim', he: 'פורים' },
  { m: 'Nisan', d: 14, icon: '🐑', title: 'Erev Pesach — the Korban Pesach', he: 'ערב פסח' },
  { m: 'Nisan', d: 15, icon: '🍷', title: 'Pesach', he: 'פסח', yt: true },
  { m: 'Nisan', d: 16, icon: '🌾', title: 'The Omer', he: 'העומר' },
  { m: 'Sivan', d: 6, icon: '🍞', title: 'Shavuot', he: 'שבועות', yt: true },
  { m: 'Av', d: 9, icon: '🕯️', title: 'Tisha B\'Av', he: 'תשעה באב' },
];

// What's coming up in the next `days` days (today included)
export function upcoming(days = 60, from = new Date()) {
  if (!fmt) return [];
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i), h = hebrewDate(d);
    const rc = roshChodesh(d);
    if (rc && rc.day === 1) out.push({ inDays: i, date: d, h, icon: '🌙', title: `Rosh Chodesh ${rc.name}`, kind: 'rc', playable: true });
    for (const x of HOLIDAYS) if (x.m === h.month && x.d === h.day) out.push({ inDays: i, date: d, h, icon: x.icon, title: x.title, kind: x.yt ? 'yomtov' : 'holiday' });
    if (d.getDay() === 6 && i < 8) out.push({ inDays: i, date: d, h, icon: '🕯️', title: 'Shabbat', kind: 'shabbat' });
  }
  return out;
}

// Shabbat or Yom Tov (in Eretz Yisrael): days nobody is expected to play
export function isRestDay(d) {
  if (d.getDay() === 6) return true;
  const h = hebrewDate(d);
  if (!h) return false;
  if (h.month === 'Tishri' && h.day === 2) return true;          // 2nd day of Rosh Hashanah
  return HOLIDAYS.some(x => x.yt && x.m === h.month && x.d === h.day);
}
