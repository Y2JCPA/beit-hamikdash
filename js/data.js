/* ============================================
   BEIT HAMIKDASH — Data (Korbanot, Items, etc.)
   ============================================ */

const SHOP_ITEMS = {
  keves:   { id: 'keves',   name: 'Keves (Lamb)',       emoji: '🐑', price: 50,  category: 'animal', desc: 'A male lamb in its first year.' },
  ez:      { id: 'ez',      name: 'Ez (Goat)',          emoji: '🐐', price: 50,  category: 'animal', desc: 'A male goat.' },
  par:     { id: 'par',     name: 'Par (Bull)',         emoji: '🐂', price: 200, category: 'animal', desc: 'A bull — the most valuable offering.' },
  tor:     { id: 'tor',     name: 'Tor (Turtledove)',   emoji: '🕊️', price: 15,  category: 'animal', desc: 'A bird offering for those who cannot afford a larger animal.' },
  solet:   { id: 'solet',   name: 'Solet (Fine Flour)', emoji: '🌾', price: 10,  category: 'mincha', levelReq: 2, desc: 'Fine wheat flour for meal offerings.' },
  shemen:  { id: 'shemen',  name: 'Shemen (Oil)',       emoji: '🫒', price: 10,  category: 'mincha', levelReq: 2, desc: 'Olive oil — poured on most menachot.' },
  levonah: { id: 'levonah', name: 'Levonah (Frankincense)', emoji: '💨', price: 15, category: 'mincha', levelReq: 2, desc: 'Frankincense — placed on the Mincha before Kemitza.' },
};

const KORBANOT = {
  tamid: {
    id: 'tamid', name: 'Korban Tamid', nameHe: 'קרבן תמיד', emoji: '🐑☀️',
    animal: 'keves', type: 'olah', category: 'kodshei_kodashim',
    slaughterLocation: 'north', bloodService: 'two_that_are_four',
    eatenBy: 'none', eatingLocation: null, eatingTimeLimit: null,
    description: 'The daily communal offering — one lamb each morning and afternoon. Never missed a single day.',
    source: 'Bamidbar 28:1-8', mishnah: 'Tamid 4:1',
    levelRequired: 1, coinReward: 25, special: true,
  },
  olah_keves: {
    id: 'olah_keves', name: 'Olat Keves', nameHe: 'עולת כבש', emoji: '🐑🔥',
    animal: 'keves', type: 'olah', category: 'kodshei_kodashim',
    slaughterLocation: 'north', bloodService: 'two_that_are_four',
    eatenBy: 'none', eatingLocation: null, eatingTimeLimit: null,
    description: 'A lamb burnt offering — entirely consumed by the fire on the Mizbeach. No one eats from it.',
    source: 'Vayikra 1:10-13', mishnah: 'Zevachim 5:4',
    levelRequired: 1, coinReward: 30,
  },
  olah_par: {
    id: 'olah_par', name: 'Olat Par', nameHe: 'עולת פר', emoji: '🐂🔥',
    animal: 'par', type: 'olah', category: 'kodshei_kodashim',
    slaughterLocation: 'north', bloodService: 'two_that_are_four',
    eatenBy: 'none', eatingLocation: null, eatingTimeLimit: null,
    description: 'A bull burnt offering — the most valuable Olah. Entirely consumed on the Mizbeach.',
    source: 'Vayikra 1:3-9', mishnah: 'Zevachim 5:4',
    levelRequired: 2, coinReward: 80,
  },
  olah_tor: {
    id: 'olah_tor', name: "Olat Ha'of", nameHe: 'עולת העוף', emoji: '🕊️🔥',
    animal: 'tor', type: 'olah', category: 'kodshei_kodashim',
    slaughterLocation: 'mizbeach', bloodService: 'squeeze_on_wall',
    eatenBy: 'none', eatingLocation: null, eatingTimeLimit: null,
    description: 'A bird burnt offering — performed on the Mizbeach itself through Melikah (pinching the neck).',
    source: 'Vayikra 1:14-17', mishnah: 'Zevachim 6:5',
    levelRequired: 1, coinReward: 15,
  },
  chatat_keves: {
    id: 'chatat_keves', name: 'Chatat Keves', nameHe: 'חטאת כבש', emoji: '🐑',
    animal: 'keves', type: 'chatat', category: 'kodshei_kodashim',
    slaughterLocation: 'north', bloodService: 'four_corners',
    eatenBy: 'male_kohanim', eatingLocation: 'azara', eatingTimeLimit: 'Day and night, until midnight',
    description: 'A sin offering for unintentional transgressions. Blood placed on all 4 horns of the Mizbeach.',
    source: 'Vayikra 4:32-35', mishnah: 'Zevachim 5:3',
    levelRequired: 2, coinReward: 40,
  },
  chatat_ez: {
    id: 'chatat_ez', name: 'Chatat Ez', nameHe: 'חטאת עז', emoji: '🐐',
    animal: 'ez', type: 'chatat', category: 'kodshei_kodashim',
    slaughterLocation: 'north', bloodService: 'four_corners',
    eatenBy: 'male_kohanim', eatingLocation: 'azara', eatingTimeLimit: 'Day and night, until midnight',
    description: 'A goat sin offering. The blood is placed on all 4 horns of the Mizbeach.',
    source: 'Vayikra 4:28-31', mishnah: 'Zevachim 5:3',
    levelRequired: 2, coinReward: 40,
  },
  shelamim_keves: {
    id: 'shelamim_keves', name: 'Shelamim Keves', nameHe: 'שלמים כבש', emoji: '🐑✌️',
    animal: 'keves', type: 'shelamim', category: 'kodashim_kalim',
    slaughterLocation: 'anywhere', bloodService: 'two_that_are_four',
    eatenBy: 'anyone_tahor', eatingLocation: 'yerushalayim', eatingTimeLimit: 'Two days and one night',
    description: 'A peace offering — shared between the Mizbeach, the Kohanim, and the owner. Promotes shalom!',
    source: 'Vayikra 3:6-11', mishnah: 'Zevachim 5:7',
    levelRequired: 2, coinReward: 35,
  },
  shelamim_par: {
    id: 'shelamim_par', name: 'Shelamim Par', nameHe: 'שלמים פר', emoji: '🐂✌️',
    animal: 'par', type: 'shelamim', category: 'kodashim_kalim',
    slaughterLocation: 'anywhere', bloodService: 'two_that_are_four',
    eatenBy: 'anyone_tahor', eatingLocation: 'yerushalayim', eatingTimeLimit: 'Two days and one night',
    description: 'A bull peace offering — a grand celebration shared by all.',
    source: 'Vayikra 3:1-5', mishnah: 'Zevachim 5:7',
    levelRequired: 2, coinReward: 70,
  },
};

// Map animal IDs to which korbanot they can be used for
const ANIMAL_TO_KORBANOT = {
  keves: ['tamid', 'olah_keves', 'chatat_keves', 'shelamim_keves'],
  ez:    ['chatat_ez'],
  par:   ['olah_par', 'shelamim_par'],
  tor:   ['olah_tor'],
};

const AVODAH_STEPS = {
  olah: [
    { id: 'shechita', name: 'Shechita', nameHe: 'שחיטה', emoji: '🔪', desc: 'Slaughter the animal in the correct location.' },
    { id: 'kabbalah', name: 'Kabbalah', nameHe: 'קבלה', emoji: '🏆', desc: 'Collect the blood in a Kli Sharet (sacred vessel).' },
    { id: 'holacha',  name: 'Holacha',  nameHe: 'הולכה', emoji: '🚶', desc: 'Carry the blood to the Mizbeach.' },
    { id: 'zerika',   name: 'Zerika',   nameHe: 'זריקה', emoji: '💧', desc: 'Apply the blood on the Mizbeach — two placements that are four.' },
    { id: 'haktarah', name: 'Haktarah', nameHe: 'הקטרה', emoji: '🔥', desc: 'Burn the entire animal on the Mizbeach fire.' },
  ],
  chatat: [
    { id: 'shechita', name: 'Shechita', nameHe: 'שחיטה', emoji: '🔪', desc: 'Slaughter in the north of the Azara.' },
    { id: 'kabbalah', name: 'Kabbalah', nameHe: 'קבלה', emoji: '🏆', desc: 'Collect the blood in a sacred vessel.' },
    { id: 'holacha',  name: 'Holacha',  nameHe: 'הולכה', emoji: '🚶', desc: 'Carry the blood to the Mizbeach.' },
    { id: 'zerika',   name: 'Zerika',   nameHe: 'זריקה', emoji: '💧', desc: 'Place blood on all 4 horns (Kranot) of the Mizbeach.' },
    { id: 'haktarah', name: 'Haktarah', nameHe: 'הקטרה', emoji: '🔥', desc: 'Burn the Chalavim (fats) on the Mizbeach. Meat is eaten by Kohanim.' },
  ],
  shelamim: [
    { id: 'shechita', name: 'Shechita', nameHe: 'שחיטה', emoji: '🔪', desc: 'Slaughter anywhere in the Azara (Kodashim Kalim).' },
    { id: 'kabbalah', name: 'Kabbalah', nameHe: 'קבלה', emoji: '🏆', desc: 'Collect the blood in a sacred vessel.' },
    { id: 'holacha',  name: 'Holacha',  nameHe: 'הולכה', emoji: '🚶', desc: 'Carry the blood to the Mizbeach.' },
    { id: 'zerika',   name: 'Zerika',   nameHe: 'זריקה', emoji: '💧', desc: 'Two placements that are four on diagonal corners.' },
    { id: 'haktarah', name: 'Haktarah', nameHe: 'הקטרה', emoji: '🔥', desc: 'Burn the Chalavim (fats). Meat shared between Kohanim and owner.' },
  ],
};

const ACHIEVEMENTS = {
  first_avodah:  { name: 'First Avodah',   emoji: '🔰', desc: 'Complete your first korban' },
  tamid_week:    { name: 'Tamid Master',    emoji: '⭐', desc: 'Perform 14 Tamid offerings (a full week)' },
  blood_expert:  { name: 'Blood Expert',    emoji: '🩸', desc: 'Perform both blood service types (2-that-are-4 and 4-corners)' },
  perfect_five:  { name: 'Perfect Service', emoji: '✨', desc: 'Complete 5 korbanot with zero mistakes' },
  music_lover:   { name: 'Music Lover',     emoji: '🎵', desc: 'Listen to all 4 Levite instruments' },
  torah_scholar: { name: 'Torah Scholar',   emoji: '📜', desc: 'Read 20 educational source popups' },
  big_spender:   { name: 'Nediv Lev',       emoji: '💰', desc: 'Spend 500 coins on korbanot' },
  kohen_rising:  { name: 'Rising Kohen',    emoji: '👑', desc: 'Complete 50 korbanot total' },
};

const INSTRUMENTS = {
  kinor:       { name: 'Kinor', nameHe: 'כינור', emoji: '🎵', desc: 'A lyre — the primary instrument of the Leviim. Minimum 9 in the Mikdash.', source: 'Arachin 2:3', freq: 440, wave: 'triangle' },
  nevel:       { name: 'Nevel', nameHe: 'נבל', emoji: '🎶', desc: 'A larger harp with deeper tones. Minimum 2, maximum 6.', source: 'Arachin 2:3', freq: 220, wave: 'sine' },
  chatzotzrot: { name: 'Chatzotzrot', nameHe: 'חצוצרות', emoji: '🎺', desc: 'Silver trumpets — blown to gather the people and signal offerings. Minimum 2, maximum 120.', source: 'Bamidbar 10:2', freq: 587, wave: 'square' },
  metziltayim: { name: 'Metziltayim', nameHe: 'מצלתיים', emoji: '🥁', desc: 'Cymbals — exactly one pair. Played to mark the beginning of the Shir.', source: 'Arachin 2:5', freq: 800, wave: 'sawtooth' },
};

const DAILY_SHIR = [
  { day: 'Sunday',    tehillim: 24, text: 'לה׳ הארץ ומלואה — "The earth is Hashem\'s and all it contains"' },
  { day: 'Monday',    tehillim: 48, text: 'גדול ה׳ ומהולל מאד — "Great is Hashem and very praised"' },
  { day: 'Tuesday',   tehillim: 82, text: 'אלוקים ניצב בעדת קל — "God stands in the divine assembly"' },
  { day: 'Wednesday', tehillim: 94, text: 'קל נקמות ה׳ — "God of vengeance, Hashem"' },
  { day: 'Thursday',  tehillim: 81, text: 'הרנינו לאלוקים עוזנו — "Sing joyously to God, our strength"' },
  { day: 'Friday',    tehillim: 93, text: 'ה׳ מלך גאות לבש — "Hashem reigns, He is clothed in majesty"' },
  { day: 'Shabbat',   tehillim: 92, text: 'מזמור שיר ליום השבת — "A psalm, a song for the Shabbat day"' },
];
