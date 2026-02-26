# Build Spec — Beit HaMikdash V1 MVP

## Overview
Build a 3D educational game where you play as a Kohen in the Beit HaMikdash. Same tech stack and feel as our other game "Grow a Garden" (Three.js, vanilla JS, blocky Minecraft aesthetic, GitHub Pages).

## Tech Stack
- Single `index.html` + `style.css` + `js/game.js` + `js/data.js`
- Three.js via CDN (`https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`)
- No frameworks, no build tools, no npm
- localStorage for saves
- Mobile + desktop support

## File Structure
```
index.html          — Main HTML (login screen, HUD, panels)
style.css           — All styles
js/data.js          — Korban data, seed data, achievements, sources
js/game.js          — Main game logic
```

## World Layout (3D Scene)

Build a blocky Minecraft-style Beit HaMikdash courtyard. Everything is box geometry. Use these approximate proportions:

### Ground
- Large stone floor (light beige/cream `0xF5F0E1`) for the Azara courtyard
- Surrounding walls (white stone `0xE8E0D0`) — tall walls around the perimeter

### Key Structures (all blocky box geometry):

1. **Mizbeach HaChitzon (Outer Altar)** — Center of the courtyard
   - Large stone cube: ~8x5x8 units, color `0xD4C4A8` (sandstone)
   - Red/orange fire on top (small animated meshes or a glowing material)
   - Kevesh (Ramp) on south side — a sloped rectangular box leading up to the altar top
   - 4 Kranot (horns) — small cubes on each corner of the top

2. **Kiyor (Laver/Basin)** — Between Mizbeach and Ulam (east of altar)
   - Bronze/copper colored cylinder-ish shape (use box: `0xCD7F32`)
   - Where Kohen washes hands & feet before Avodah

3. **Ulam (Entrance Hall)** — West side of courtyard
   - Tall rectangular facade, gold-trimmed (`0xFFD700` accents on `0xE8E0D0` stone)
   - Two tall pillars (Yachin & Boaz) flanking the entrance
   - Doorway (dark rectangle suggesting interior)

4. **Beit HaMitbachayim (Slaughter Area)** — North side
   - Stone rings (small torus or cylinder shapes) embedded in ground
   - Hooks on pillars (small boxes on vertical poles)
   - This is where Kodshei Kodashim must be slaughtered

5. **Duchan (Levite Platform)** — Between Ezrat Yisrael and Ezrat Kohanim
   - Raised stone platform (east side of courtyard)
   - 4-5 Levi NPCs standing on it with instruments

6. **Korban Stand** — Near the entrance (southeast area)
   - A market stall/booth with NPC "Shimon"
   - Wooden booth with awning

7. **Trees/Decorations** — A few olive trees outside the walls for scenery

### Boundaries
- Player can walk freely in the Azara (courtyard)
- Walls prevent going outside
- North area is marked (maybe slightly different floor color) as the Shechita zone

## Player Character
- Blocky Kohen figure (like Grow a Garden's farmer but in white robes)
- White robe body, white hat/mitznefet on head
- Avnet (belt) — colored sash around waist (`0x4169E1` blue)
- Third-person camera following behind (same as Grow a Garden)
- Arrow keys/WASD to move, mouse to look

## NPCs

### 1. Shimon (Korban Seller)
- Stands at the Korban Stand booth
- Press E to interact → opens Shop Panel
- Sells animals and mincha ingredients

### 2. Leviim (4-5 on Duchan)
- Each holds a different instrument
- Press E near one → plays a sound effect + shows instrument info
- Instruments: Kinor (lyre), Nevel (harp), Chatzotzrot (trumpets), Metziltayim (cymbals)
- Use Web Audio API for simple instrument sounds (generate tones, not mp3 files)

### 3. Yisrael NPCs (optional for V1)
- 2-3 NPCs standing in Ezrat Yisrael area holding animals
- Flavor text when interacted with

## Core Gameplay

### Multi-Profile System (same as Grow a Garden)
- Login screen with profile selection
- Create new profile (name + choose level)
- localStorage save per profile
- Max 10 profiles

### Game State
```js
let gameState = {
  coins: 50,
  level: 1,                    // 1=Beginner, 2=Intermediate
  inventory: {},               // {korban_id: count}
  korbanotCompleted: 0,        // lifetime count
  korbanotPerfect: 0,          // no-mistake completions
  achievements: [],
  totalCoinsEarned: 0,
  currentAvodah: null,         // active korban being processed
};
```

### Shop Panel (Shimon)
Sell these items:

**Animals:**
| ID | Name | Emoji | Price | Used For |
|----|------|-------|-------|----------|
| keves | Keves (Lamb) | 🐑 | 50 | Olah, Chatat, Shelamim, Tamid |
| ez | Ez (Goat) | 🐐 | 50 | Olah, Chatat, Shelamim |
| par | Par (Bull) | 🐂 | 200 | Olah, Shelamim |
| tor | Tor (Turtledove) | 🕊️ | 15 | Olat Ha'of |

**Menachot ingredients (Level 2+):**
| ID | Name | Emoji | Price |
|----|------|-------|-------|
| solet | Solet (Fine Flour) | 🌾 | 10 |
| shemen | Shemen (Oil) | 🫒 | 10 |
| levonah | Levonah (Frankincense) | 💨 | 15 |

### The Avodah — Korban Process

This is the core mechanic. When you have a korban in inventory, walk to the appropriate area and press E to begin.

#### Level 1 — Guided Mode:
1. Select korban from hotbar
2. Walk to the Mizbeach area
3. A guided sequence plays:
   - Step indicators glow on screen
   - "Place the Olah on the Mizbeach" → click the glowing spot
   - Fire animation plays
   - Educational popup: "The Olah is entirely burned on the Mizbeach. No one eats from it. (Vayikra 1:9)"
   - Earn coins + XP
4. Can only do: **Korban Olah** (burnt offering) and **Tamid** (daily offering)

#### Level 2 — The 4 Avodot:
Player must perform steps in order:

1. **Shechita (שחיטה)** — Slaughter
   - Must walk to correct location:
     - Kodshei Kodashim (Olah, Chatat, Asham) → NORTH side only
     - Kodashim Kalim (Shelamim, Todah) → Anywhere in Azara
   - Press E at the location → slaughter animation
   - WRONG location = popup: "Kodshei Kodashim must be slaughtered in the north! (Zevachim 5:1)"

2. **Kabbalah (קבלה)** — Collect the blood
   - Press E → catch blood in a sacred vessel (Kli Sharet)
   - Visual: red particle effect into a golden bowl

3. **Holacha (הולכה)** — Carry to Mizbeach
   - Walk to the Mizbeach carrying the vessel
   - Player model shows holding a bowl

4. **Zerika (זריקה)** — Apply the blood
   - Different for each korban type:
     - **Olah**: "2 placements that are 4" — press E at 2 diagonal corners (blood splashes both sides)
     - **Chatat**: 4 placements on all 4 corners — must go to each horn
     - **Shelamim**: "2 placements that are 4" — same as Olah
   - After blood service → remainder poured on the Yesod (base)

5. **Haktarah (הקטרה)** — Burn the designated parts
   - Walk up the Kevesh (ramp)
   - Place parts on the fire
   - Different per korban:
     - Olah: entire animal burned
     - Shelamim: only Chalavim (fats) burned; meat distributed
     - Chatat: Chalavim burned; meat eaten by Kohanim

**After completion:**
- Educational summary panel showing what you did and why
- Source references (Vayikra + Mishnah)
- Coins awarded (more for perfect completion)
- Achievement checks

### Korban Data (for data.js)

```js
const KORBANOT = {
  olah_keves: {
    id: 'olah_keves',
    name: 'Olat Keves',
    nameHe: 'עולת כבש',
    emoji: '🐑🔥',
    animal: 'keves',
    type: 'olah',
    category: 'kodshei_kodashim',
    slaughterLocation: 'north',
    bloodService: 'two_that_are_four',  // 2 diagonal corners
    eatenBy: 'none',                     // entirely burned
    eatingLocation: null,
    eatingTimeLimit: null,
    description: 'A burnt offering — entirely consumed on the Mizbeach fire.',
    source: 'Vayikra 1:10-13',
    mishnah: 'Zevachim 5:4',
    levelRequired: 1,
    coinReward: 30,
  },
  chatat_keves: {
    id: 'chatat_keves',
    name: 'Chatat Keves',
    nameHe: 'חטאת כבש',
    emoji: '🐑',
    animal: 'keves',
    type: 'chatat',
    category: 'kodshei_kodashim',
    slaughterLocation: 'north',
    bloodService: 'four_corners',        // all 4 horns
    eatenBy: 'male_kohanim',
    eatingLocation: 'azara',             // within the curtains
    eatingTimeLimit: 'day_and_night_until_midnight',
    description: 'A sin offering brought for unintentional transgressions.',
    source: 'Vayikra 4:32-35',
    mishnah: 'Zevachim 5:3',
    levelRequired: 2,
    coinReward: 40,
  },
  shelamim_keves: {
    id: 'shelamim_keves',
    name: 'Shelamim Keves',
    nameHe: 'שלמים כבש',
    emoji: '🐑✌️',
    animal: 'keves',
    type: 'shelamim',
    category: 'kodashim_kalim',
    slaughterLocation: 'anywhere',
    bloodService: 'two_that_are_four',
    eatenBy: 'anyone_tahor',
    eatingLocation: 'yerushalayim',
    eatingTimeLimit: 'two_days_one_night',
    description: 'A peace offering — shared between the Mizbeach, the Kohanim, and the owner.',
    source: 'Vayikra 3:6-11',
    mishnah: 'Zevachim 5:7',
    levelRequired: 2,
    coinReward: 35,
  },
  olah_par: {
    id: 'olah_par',
    name: 'Olat Par',
    nameHe: 'עולת פר',
    emoji: '🐂🔥',
    animal: 'par',
    type: 'olah',
    category: 'kodshei_kodashim',
    slaughterLocation: 'north',
    bloodService: 'two_that_are_four',
    eatenBy: 'none',
    eatingLocation: null,
    eatingTimeLimit: null,
    description: 'A bull burnt offering — the most valuable Olah.',
    source: 'Vayikra 1:3-9',
    mishnah: 'Zevachim 5:4',
    levelRequired: 2,
    coinReward: 80,
  },
  olah_tor: {
    id: 'olah_tor',
    name: "Olat Ha'of",
    nameHe: 'עולת העוף',
    emoji: '🕊️🔥',
    animal: 'tor',
    type: 'olah',
    category: 'kodshei_kodashim',
    slaughterLocation: 'mizbeach_top',    // bird olah done on mizbeach itself
    bloodService: 'squeeze_on_wall',       // melikah + mitzui
    eatenBy: 'none',
    eatingLocation: null,
    eatingTimeLimit: null,
    description: 'A bird burnt offering — for those who cannot afford a larger animal.',
    source: 'Vayikra 1:14-17',
    mishnah: 'Zevachim 6:5',
    levelRequired: 1,
    coinReward: 15,
  },
  tamid: {
    id: 'tamid',
    name: 'Korban Tamid',
    nameHe: 'קרבן תמיד',
    emoji: '🐑☀️',
    animal: 'keves',
    type: 'olah',
    category: 'kodshei_kodashim',
    slaughterLocation: 'north',
    bloodService: 'two_that_are_four',
    eatenBy: 'none',
    eatingLocation: null,
    eatingTimeLimit: null,
    description: 'The daily communal offering — one lamb in the morning, one in the afternoon. Never skipped.',
    source: 'Bamidbar 28:1-8',
    mishnah: 'Tamid 4:1',
    levelRequired: 1,
    coinReward: 25,
    special: true,
  },
};

const ACHIEVEMENTS = {
  first_avodah:    { name: 'First Avodah',     emoji: '🔰', desc: 'Complete your first korban', req: 'korbanotCompleted >= 1' },
  tamid_week:      { name: 'Tamid Master',      emoji: '⭐', desc: 'Perform 14 Tamid offerings (a full week)', req: 'tamidCount >= 14' },
  blood_expert:    { name: 'Blood Expert',       emoji: '🩸', desc: 'Perform all blood service types correctly', req: 'bloodTypesCompleted >= 3' },
  perfect_five:    { name: 'Perfect Service',    emoji: '✨', desc: 'Complete 5 korbanot with zero mistakes', req: 'korbanotPerfect >= 5' },
  music_lover:     { name: 'Music Lover',        emoji: '🎵', desc: 'Listen to all 4 Levite instruments', req: 'instrumentsHeard >= 4' },
  torah_scholar:   { name: 'Torah Scholar',      emoji: '📜', desc: 'Read 20 educational source popups', req: 'sourcesRead >= 20' },
  big_spender:     { name: 'Nediv Lev',          emoji: '💰', desc: 'Spend 500 coins on korbanot', req: 'totalSpent >= 500' },
  kohen_gadol:     { name: 'Rising Kohen',       emoji: '👑', desc: 'Complete 50 korbanot total', req: 'korbanotCompleted >= 50' },
};

const INSTRUMENTS = {
  kinor:       { name: 'Kinor', nameHe: 'כינור', emoji: '🎵', desc: 'A lyre — the primary instrument of the Leviim. Minimum 9 in the Mikdash.', source: 'Arachin 2:3', freq: 440, type: 'triangle' },
  nevel:       { name: 'Nevel', nameHe: 'נבל', emoji: '🎶', desc: 'A larger harp with deeper tones. Minimum 2, maximum 6.', source: 'Arachin 2:3', freq: 220, type: 'sine' },
  chatzotzrot: { name: 'Chatzotzrot', nameHe: 'חצוצרות', emoji: '🎺', desc: 'Silver trumpets — blown to gather the people and signal offerings. Minimum 2, maximum 120.', source: 'Bamidbar 10:2', freq: 587, type: 'square' },
  metziltayim: { name: 'Metziltayim', nameHe: 'מצלתיים', emoji: '🥁', desc: 'Cymbals — exactly one pair, played to mark the start of the Shir.', source: 'Arachin 2:5', freq: 800, type: 'sawtooth' },
};

// Daily Shir sung by Leviim (Tamid 7:4)
const DAILY_SHIR = {
  0: { day: 'Sunday',    tehillim: 24, text: 'לה׳ הארץ ומלואה — "The earth is Hashem\'s and all it contains"' },
  1: { day: 'Monday',    tehillim: 48, text: 'גדול ה׳ ומהולל מאד — "Great is Hashem and very praised"' },
  2: { day: 'Tuesday',   tehillim: 82, text: 'אלוקים ניצב בעדת קל — "God stands in the divine assembly"' },
  3: { day: 'Wednesday', tehillim: 94, text: 'קל נקמות ה׳ — "God of vengeance, Hashem"' },
  4: { day: 'Thursday',  tehillim: 81, text: 'הרנינו לאלוקים עוזנו — "Sing joyously to God, our strength"' },
  5: { day: 'Friday',    tehillim: 93, text: 'ה׳ מלך גאות לבש — "Hashem reigns, He is clothed in majesty"' },
  6: { day: 'Shabbat',   tehillim: 92, text: 'מזמור שיר ליום השבת — "A psalm, a song for the Shabbat day"' },
};
```

## HUD Elements
- Top-left: Coins display (🪙 count)
- Top-left: Level indicator (Level 1/Level 2)
- Top-right: Korbanot completed count
- Bottom: Hotbar (inventory items, 1-9 slots)
- Top-center: Interaction prompt ("Press E to talk to Shimon", "Press E to begin Shechita here")
- Active Avodah indicator: When performing a korban, show progress steps at top of screen
  - e.g. [Shechita ✓] → [Kabbalah ✓] → [Holacha ...] → [Zerika] → [Haktarah]

## Panels (HTML overlays like Grow a Garden)
1. **Login/Profile Panel** — profile selection, create new
2. **Shop Panel** — buy from Shimon
3. **Korban Info Panel** — details about a korban (sources, rules)
4. **Achievement Panel** — view unlocked achievements
5. **Avodah Summary Panel** — shown after completing a korban
6. **Educational Popup** — brief source reference shown during gameplay

## Mobile Support
- Virtual joystick (bottom-left) for movement
- E button (bottom-right) for interaction
- Touch-friendly panels (44px minimum targets)
- PWA meta tags

## Visual Style
- **Floor**: Light stone beige `0xF5F0E1`
- **Walls**: White limestone `0xE8E0D0`
- **Mizbeach**: Sandstone `0xD4C4A8`
- **Gold accents**: `0xFFD700` (Ulam pillars, vessel details)
- **Kohen robes**: White `0xFAFAFA`
- **Kohen belt**: Blue `0x4169E1`
- **Fire**: Orange-red gradient (`0xFF4500`, `0xFF6600`, `0xFFAA00`)
- **Sky**: Jerusalem blue `0x87CEEB`
- **North zone floor**: Slightly different shade `0xE8DDD0` to indicate shechita area

## Important Rules
- BasicShadowMap (not soft) — performance
- Shadow map 512x512
- Pixel ratio capped at 1.5
- No ambient creatures (learned from Grow a Garden — they cause lag)
- Auto-save every 10 seconds
- Keep total mesh count reasonable for mobile
- IIFE wrapper `(function() { 'use strict'; ... })();`

## Educational Accuracy
Every korban, every blood service, every rule must match the Mishnah in Zevachim Chapter 5 and Menachot Chapter 5. This is the most important part of the game. When in doubt, quote the Mishnah.

Key rules from Zevachim 5:
- Kodshei Kodashim: slaughtered in the NORTH
- Olah blood: "2 placements that are 4" (shnayim she'hen arba)
- Chatat blood: 4 placements on 4 corners (kranot)
- Shelamim: slaughtered ANYWHERE in the Azara
- Shelamim eaten: 2 days and 1 night, by anyone tahor, anywhere in Yerushalayim
- Chatat eaten: day and night until midnight, male Kohanim only, in the Azara

Build this as a complete, working, playable game. Make it fun for kids!
