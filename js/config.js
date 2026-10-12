// ─────────────────────────────────────────────────────────────
//  Layout & constants.  1 unit = 1 metre.  1 amah ≈ 0.5 m.
//  Axes: +x = EAST, -z = NORTH, +y = UP.
//  Proportions follow Mishnah Middot (simplified where needed).
// ─────────────────────────────────────────────────────────────

export const AMAH = 0.5;

// Azara (inner courtyard) — Middot 5:1 (187 x 135 amot)
export const AZARA = { minX: -76, maxX: 19.5, minZ: -34, maxZ: 34, wallH: 12, wallT: 2 };

// Ezrat Nashim (women's courtyard) — lower by 15 steps
export const EZRAT_NASHIM = { minX: 21.5, maxX: 61.5, minZ: -20, maxZ: 20, floorY: -3, wallH: 9 };
export const NIKANOR = { x: 20.5, halfW: 3, h: 10 };
export const STEPS15 = { cx: 21.5, cz: 0, count: 15, rise: 0.2, depth: 0.35 };

// Outer Har HaBayit platform level (visual only)
export const OUTER_Y = -6;

// Mizbeach HaChitzon — Middot 3:1 (32 x 32 amot, 10 amot tall)
export const MIZBEACH = {
  cx: 0, cz: -4,
  base: 16, baseH: 0.5,        // yesod
  body: 15, bodyH: 3.0,        // up to the sovev
  top: 14, topH: 4.5,          // walking surface
  hornH: 0.55, hornS: 0.55,
  redLineY: 2.5,               // chut ha-sikra (half way up)
};
// Kevesh (ramp) — south side, 32 amot long, 16 wide
export const KEVESH = { minX: -4, maxX: 4, topZ: 3, bottomZ: 19, topY: 4.5 };

// Altar corners (on the ground, for Olah blood) and horns (on top, for Chatat)
const M = MIZBEACH;
export const CORNERS = {
  NE: { x: M.cx + 8.6, z: M.cz - 8.6, label: 'North-East' },
  NW: { x: M.cx - 8.6, z: M.cz - 8.6, label: 'North-West' },
  SE: { x: M.cx + 8.6, z: M.cz + 8.6, label: 'South-East' },
  SW: { x: M.cx - 8.6, z: M.cz + 8.6, label: 'South-West' },
};
const hornOff = M.top / 2 - 0.9;
export const HORNS = {
  NE: { x: M.cx + hornOff, z: M.cz - hornOff, label: 'North-East horn' },
  NW: { x: M.cx - hornOff, z: M.cz - hornOff, label: 'North-West horn' },
  SE: { x: M.cx + hornOff, z: M.cz + hornOff, label: 'South-East horn' },
  SW: { x: M.cx - hornOff, z: M.cz + hornOff, label: 'South-West horn' },
};

// Ulam & Heichal — Middot 4
export const ULAM = { frontX: -19, backX: -25, halfW: 25, topY: 50, openHalfW: 5, openTopY: 23 };
export const HEICHAL = {
  frontWallX0: -28, frontWallX1: -25,
  hallMinX: -48, hallMaxX: -28, hallHalfW: 5, floorY: 3, ceilY: 23,
  doorHalfW: 2.5, doorTopY: 13,
  bodyMinX: -70, bodyHalfW: 17.5, topY: 50,
};
export const ULAM_STEPS = { x0: -14, x1: -19, halfW: 10, count: 12, topY: 3 };

// Key places
export const P = {
  kiyor:       { x: -11.5, z: 7 },
  ashPlace:    { x: 5.6, z: 12.5 },          // east of the ramp (Tamid 1:4)
  machtaStand: { x: -5.4, z: 6.2 },          // west of the ramp
  woodPile:    { x: 6.2, z: 17 },
  saltSpot:    { x: -2.6, z: 13.5 },         // salt on the ramp (Middot 5:3 Lishkat HaMelach)
  ashHeap:     { x: 0, z: -4 },              // tapuach on top of the altar
  fireBig:     { x: 3.2, z: -4 },            // ma'arachah gedolah (east side of top)
  fireKetoret: { x: -3.6, z: -7.5 },         // ma'arachah sheniyah (for ketoret coals)
  lambPen:     { x: -12, z: -29 },
  slaughterRing: { x: -4.5, z: -15 },        // NW corner, 2nd ring (Tamid 4:1)
  tables:      { x: 1.5, z: -29.3 },
  southYesod:  { x: -6.5, z: 4.6 },
  duchan:      { x: 13, z: 0 },
  ulamTop:     { x: -17.6, z: 0 },
  heichalDoor: { x: -26.5, z: 0 },
  menorah:     { x: -38, z: 3.2 },
  shulchan:    { x: -38, z: -3.2 },
  goldAltar:   { x: -34.5, z: 0 },
  paroches:    { x: -47.6, z: 0 },
  avtinas:     { x: -12.6, z: -9.5 },        // Kohen with the ketoret, by the Ulam steps
  wineSpot:    { x: 4.4, z: 8.5 },
  spawn:       { x: 54, z: 0 },
  memuneh:     { x: 9.6, z: 8.5 },
  nikanor:     { x: 20.5, z: 0 },
  gazit:       { x: 8, z: -32 },
};

// Where visitors with korbanot wait in Ezrat Yisrael (in front of the crowd)
export const VISITOR_SPOTS = {
  reuven: { x: 15.5, z: -13.6 }, miriam: { x: 15.5, z: 13.6 }, yehuda: { x: 15.5, z: -17.8 },
  family: { x: 15.5, z: 18 }, chana: { x: 15.5, z: 22.4 }, bikkurim: { x: 15.5, z: -22.6 },
};
// each day's visitors take these places, nearest to Nikanor Gate first
export const VISITOR_SLOTS = ['miriam', 'reuven', 'family', 'yehuda', 'chana', 'bikkurim'].map(k => VISITOR_SPOTS[k]);
export const VISITORS_PER_DAY = 4;

export const NORTH_LINE_Z = MIZBEACH.cz - M.base / 2; // north of the altar's north edge

// Player
export const PLAYER = {
  radius: 0.34, height: 1.6, walk: 5.2, sprint: 8.4, accel: 26, decel: 22,
  jump: 6.2, gravity: 20, step: 0.42,
};
export const INTERACT_RADIUS = 2.6;

export const SAVE_KEY = 'mikdash3_profiles';
export const SAVE_PREFIX = 'mikdash3_save_';
export const SETTINGS_KEY = 'mikdash3_settings';
