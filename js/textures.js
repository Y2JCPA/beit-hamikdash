// Procedural textures — everything is painted on canvases at load time,
// so the game ships with zero image assets.
import * as THREE from 'three';

// ── Seeded random & tileable value noise ──
let _seed = 1337;
export function srand(s) { _seed = s >>> 0; }
export function rand() {
  _seed = (_seed + 0x6D2B79F5) >>> 0;
  let t = _seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rr = (a, b) => a + (b - a) * rand();

function makeLattice(n) {
  const a = new Float32Array(n * n);
  for (let i = 0; i < a.length; i++) a[i] = rand();
  return a;
}
function periodicNoise(lat, n, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const x0 = ((xi % n) + n) % n, y0 = ((yi % n) + n) % n;
  const x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = lat[y0 * n + x0], b = lat[y0 * n + x1], c = lat[y1 * n + x0], d = lat[y1 * n + x1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Tileable fbm noise field (Float32Array size*size, values ~0..1)
const noiseCache = new Map();
export function noiseField(size, baseFreq = 4, octaves = 5, seed = 7) {
  // fields with the same size & frequency are shared between textures (saves load time on phones)
  seed = baseFreq * 7 + octaves;
  const key = size + '_' + baseFreq + '_' + octaves;
  if (noiseCache.has(key)) return noiseCache.get(key);
  srand(seed);
  const lats = [];
  for (let o = 0; o < octaves; o++) lats.push(makeLattice(baseFreq << o));
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let amp = 0.5, sum = 0, norm = 0;
      for (let o = 0; o < octaves; o++) {
        const f = baseFreq << o;
        sum += amp * periodicNoise(lats[o], f, (x / size) * f, (y / size) * f);
        norm += amp; amp *= 0.5;
      }
      out[y * size + x] = sum / norm;
    }
  }
  noiseCache.set(key, out);
  return out;
}

// Size of the large tiling textures. Phones use 512 (a quarter of the work at load time).
let BIG = 1024;
export function setTextureResolution(px) { BIG = px; }

// these canvases are read back pixel-by-pixel, so keep them in CPU memory (much faster on phones)
const RF = { willReadFrequently: true };

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTexture(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// Apply per-pixel noise modulation on a canvas (multiplicative tint)
function applyNoise(ctx, size, field, amount, bias = 0.5) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const n = 1 + (field[p] - bias) * amount;     // ImageData clamps to 0..255 by itself
    d[i] *= n; d[i + 1] *= n; d[i + 2] *= n;
  }
  ctx.putImageData(img, 0, 0);
}

function rgb(r, g, b) { return `rgb(${r | 0},${g | 0},${b | 0})`; }

// ─────────────────────────────────────────────────────────
// Herodian ashlar wall — big blocks with drafted margins.
// Texture spans 6m x 6m.
// ─────────────────────────────────────────────────────────
export function ashlarTextures(opts = {}) {
  const S = BIG;
  const base = opts.base || [226, 209, 174];
  const cMap = canvas(S), cBump = canvas(S);
  const m = cMap.getContext('2d', RF), b = cBump.getContext('2d', RF);
  srand(opts.seed || 11);
  m.fillStyle = rgb(base[0] * 0.55, base[1] * 0.55, base[2] * 0.55); m.fillRect(0, 0, S, S);
  b.fillStyle = '#000'; b.fillRect(0, 0, S, S);
  const rows = opts.rows || 6;
  const rowH = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rr(0, 300);
    const y = r * rowH;
    while (x < S) {
      const w = rr(rowH * 1.6, rowH * 3.6);
      const tint = rr(-14, 12);
      const warm = rr(-6, 8);
      const draw = (ox) => {
        const x0 = x + ox + 2, y0 = y + 2, ww = w - 4, hh = rowH - 4;
        const mg = rowH * 0.09;
        // margin
        m.fillStyle = rgb(base[0] + tint - 6 + warm, base[1] + tint - 6, base[2] + tint - 8 - warm);
        m.fillRect(x0, y0, ww, hh);
        // boss (raised face)
        m.fillStyle = rgb(base[0] + tint + 4 + warm, base[1] + tint + 3, base[2] + tint - warm);
        m.fillRect(x0 + mg, y0 + mg, ww - mg * 2, hh - mg * 2);
        b.fillStyle = '#8a8a8a'; b.fillRect(x0, y0, ww, hh);
        b.fillStyle = '#d6d6d6'; b.fillRect(x0 + mg, y0 + mg, ww - mg * 2, hh - mg * 2);
      };
      draw(0);
      if (x + w > S) draw(-S);
      if (x < 0) draw(S);
      x += w;
    }
  }
  const nf = noiseField(S, 16, 5, opts.seed || 3);
  applyNoise(m, S, nf, 0.32);
  applyNoise(b, S, nf, 0.6);
  // subtle weathering streaks
  const nf2 = noiseField(S, 4, 4, 21);
  applyNoise(m, S, nf2, 0.16);
  return { map: toTexture(cMap), bump: toTexture(cBump, { srgb: false }) };
}

// Polished floor flagstones (texture spans 8m x 8m, 2m slabs)
export function floorTextures(opts = {}) {
  const S = BIG;
  const base = opts.base || [236, 226, 204];
  const cMap = canvas(S), cRough = canvas(S), cBump = canvas(S);
  const m = cMap.getContext('2d', RF), r = cRough.getContext('2d', RF), b = cBump.getContext('2d', RF);
  srand(opts.seed || 5);
  const n = opts.slabs || 4, s = S / n;
  m.fillStyle = rgb(base[0] * 0.72, base[1] * 0.72, base[2] * 0.72); m.fillRect(0, 0, S, S);
  r.fillStyle = '#ddd'; r.fillRect(0, 0, S, S);
  b.fillStyle = '#000'; b.fillRect(0, 0, S, S);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const t = rr(-10, 8);
    m.fillStyle = rgb(base[0] + t + rr(-3, 3), base[1] + t, base[2] + t - rr(0, 4));
    m.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
    const rv = rr(120, 175) | 0;
    r.fillStyle = rgb(rv, rv, rv); r.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
    b.fillStyle = '#ccc'; b.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
  }
  // faint veins
  m.globalAlpha = 0.07; m.strokeStyle = '#7a6a50'; m.lineWidth = 1.5;
  for (let k = 0; k < 40; k++) {
    m.beginPath(); let x = rr(0, S), y = rr(0, S); m.moveTo(x, y);
    for (let q = 0; q < 8; q++) { x += rr(-60, 60); y += rr(-60, 60); m.lineTo(x, y); }
    m.stroke();
  }
  m.globalAlpha = 1;
  const nf = noiseField(S, 8, 5, opts.seed || 9);
  applyNoise(m, S, nf, 0.18);
  applyNoise(r, S, nf, 0.4);
  return { map: toTexture(cMap), rough: toTexture(cRough, { srgb: false }), bump: toTexture(cBump, { srgb: false }) };
}

// Whitewashed altar stone (Middot 3:4 — plastered twice a year)
export function plasterTextures() {
  const S = 512;
  const cMap = canvas(S), cBump = canvas(S);
  const m = cMap.getContext('2d', RF), b = cBump.getContext('2d', RF);
  srand(77);
  m.fillStyle = rgb(232, 226, 212); m.fillRect(0, 0, S, S);
  b.fillStyle = '#999'; b.fillRect(0, 0, S, S);
  // ghost outlines of whole, unhewn stones under the plaster
  for (let k = 0; k < 70; k++) {
    const x = rr(0, S), y = rr(0, S), rx = rr(18, 46), ry = rr(14, 34);
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      b.fillStyle = `rgba(255,255,255,${rr(0.08, 0.2)})`;
      b.beginPath(); b.ellipse(x + ox, y + oy, rx, ry, rr(0, 3), 0, Math.PI * 2); b.fill();
      m.strokeStyle = 'rgba(150,135,110,0.045)'; m.lineWidth = 2;
      m.beginPath(); m.ellipse(x + ox, y + oy, rx, ry, 0, 0, Math.PI * 2); m.stroke();
    }
  }
  const nf = noiseField(S, 8, 5, 31);
  applyNoise(m, S, nf, 0.22);
  applyNoise(b, S, nf, 0.5);
  return { map: toTexture(cMap), bump: toTexture(cBump, { srgb: false }) };
}

// White marble with soft veins
export function marbleTextures() {
  const S = BIG;
  const c = canvas(S), m = c.getContext('2d', RF);
  const img = m.createImageData(S, S);
  const nf = noiseField(S, 4, 6, 41);
  const nf2 = noiseField(S, 16, 4, 43);
  for (let y = 0, p = 0; y < S; y++) for (let x = 0; x < S; x++, p++) {
    const v = Math.abs(Math.sin((x / S) * 6.283 * 2 + nf[p] * 9));
    const vein = Math.pow(1 - v, 9) * 0.28;
    const base = 0.93 + (nf2[p] - 0.5) * 0.05 - vein;
    img.data[p * 4] = 250 * base; img.data[p * 4 + 1] = 247 * base; img.data[p * 4 + 2] = 240 * base; img.data[p * 4 + 3] = 255;
  }
  m.putImageData(img, 0, 0);
  // block joints (large marble blocks, 4 rows)
  m.strokeStyle = 'rgba(120,110,95,0.35)'; m.lineWidth = 2;
  srand(44);
  for (let r = 0; r < 4; r++) {
    const y = r * S / 4; m.beginPath(); m.moveTo(0, y); m.lineTo(S, y); m.stroke();
    let x = rr(0, 200);
    while (x < S) { m.beginPath(); m.moveTo(x, y); m.lineTo(x, y + S / 4); m.stroke(); x += rr(260, 420); }
  }
  return { map: toTexture(c) };
}

// Hammered gold — roughness and bump variation (albedo comes from material colour)
export function goldTextures() {
  const S = 512;
  const cR = canvas(S), cB = canvas(S);
  const r = cR.getContext('2d', RF), b = cB.getContext('2d', RF);
  const img = r.createImageData(S, S), imgB = b.createImageData(S, S);
  const nf = noiseField(S, 32, 3, 51), nf2 = noiseField(S, 4, 4, 53);
  for (let p = 0; p < S * S; p++) {
    const rv = (0.18 + nf[p] * 0.22 + (nf2[p] - 0.5) * 0.15) * 255;
    img.data[p * 4] = img.data[p * 4 + 1] = img.data[p * 4 + 2] = rv; img.data[p * 4 + 3] = 255;
    const bv = nf[p] * 255;
    imgB.data[p * 4] = imgB.data[p * 4 + 1] = imgB.data[p * 4 + 2] = bv; imgB.data[p * 4 + 3] = 255;
  }
  r.putImageData(img, 0, 0); b.putImageData(imgB, 0, 0);
  return { rough: toTexture(cR, { srgb: false }), bump: toTexture(cB, { srgb: false }) };
}

// Gold relief panels with palms & flowers (interior of the Heichal)
export function goldReliefTextures() {
  const R = BIG, S = 1024;            // draw in 1024 "design units", scaled to the real size
  const cB = canvas(R), b = cB.getContext('2d', RF);
  const cM = canvas(R), m = cM.getContext('2d', RF);
  b.scale(R / S, R / S); m.scale(R / S, R / S);
  b.fillStyle = '#777'; b.fillRect(0, 0, S, S);
  m.fillStyle = '#fff'; m.fillRect(0, 0, S, S);
  const cell = S / 4;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x = i * cell, y = j * cell;
    b.strokeStyle = '#eee'; b.lineWidth = 10; b.strokeRect(x + 14, y + 14, cell - 28, cell - 28);
    m.strokeStyle = '#e9e0cc'; m.lineWidth = 8; m.strokeRect(x + 14, y + 14, cell - 28, cell - 28);
    const cx = x + cell / 2, cy = y + cell / 2;
    if ((i + j) % 2 === 0) {
      // palm tree (timorah)
      b.strokeStyle = '#fff'; b.lineWidth = 9;
      b.beginPath(); b.moveTo(cx, cy + cell * 0.32); b.lineTo(cx, cy - cell * 0.12); b.stroke();
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI / 2 + (k - 3) * 0.42;
        b.beginPath(); b.moveTo(cx, cy - cell * 0.12);
        b.quadraticCurveTo(cx + Math.cos(a) * 40, cy - cell * 0.12 + Math.sin(a) * 40 - 10, cx + Math.cos(a) * 75, cy - cell * 0.12 + Math.sin(a) * 60 + 25);
        b.stroke();
      }
    } else {
      // open flower (petur tzitzim)
      b.fillStyle = '#fff';
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        b.beginPath(); b.ellipse(cx + Math.cos(a) * 34, cy + Math.sin(a) * 34, 26, 11, a, 0, Math.PI * 2); b.fill();
      }
      b.beginPath(); b.arc(cx, cy, 16, 0, Math.PI * 2); b.fillStyle = '#ccc'; b.fill();
    }
  }
  const nf = noiseField(R, 32, 3, 55);
  applyNoise(b, R, nf, 0.25);
  applyNoise(m, R, nf, 0.1);
  return { bump: toTexture(cB, { srgb: false }), map: toTexture(cM) };
}

// Wood: bark/end grain for logs & cedar planks for ceilings
export function woodTextures(kind = 'log') {
  const S = 512;
  const c = canvas(S), m = c.getContext('2d', RF);
  const img = m.createImageData(S, S);
  const nf = noiseField(S, 4, 5, kind === 'log' ? 61 : 63);
  const base = kind === 'log' ? [118, 84, 56] : [150, 96, 58];
  for (let y = 0, p = 0; y < S; y++) for (let x = 0; x < S; x++, p++) {
    const g = Math.sin((x / S) * 6.283 * (kind === 'log' ? 18 : 10) + nf[p] * 14) * 0.5 + 0.5;
    const v = 0.72 + g * 0.22 + (nf[p] - 0.5) * 0.3;
    img.data[p * 4] = base[0] * v; img.data[p * 4 + 1] = base[1] * v; img.data[p * 4 + 2] = base[2] * v; img.data[p * 4 + 3] = 255;
  }
  m.putImageData(img, 0, 0);
  if (kind === 'plank') {
    m.strokeStyle = 'rgba(40,20,10,0.6)'; m.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { m.beginPath(); m.moveTo(i * S / 4, 0); m.lineTo(i * S / 4, S); m.stroke(); }
  }
  return { map: toTexture(c) };
}

// Bronze / Corinthian copper (Nikanor gates, Kiyor)
export function bronzeTextures() {
  const S = 512;
  const cR = canvas(S), r = cR.getContext('2d', RF);
  const img = r.createImageData(S, S);
  const nf = noiseField(S, 8, 5, 71);
  for (let p = 0; p < S * S; p++) {
    const v = (0.25 + nf[p] * 0.4) * 255;
    img.data[p * 4] = img.data[p * 4 + 1] = img.data[p * 4 + 2] = v; img.data[p * 4 + 3] = 255;
  }
  r.putImageData(img, 0, 0);
  return { rough: toTexture(cR, { srgb: false }) };
}

// Woven paroches — techelet, argaman, tola'at shani & linen threads (Yoma 71b)
export function parochesTexture() {
  const W = 512, H = 1024;
  const c = canvas(W, H), m = c.getContext('2d', RF);
  // deep techelet ground with fine thread texture
  m.fillStyle = '#1b2c6e'; m.fillRect(0, 0, W, H);
  srand(97);
  for (let x = 0; x < W; x += 2) {
    const r = rand();
    m.fillStyle = r < 0.33 ? 'rgba(110,40,140,0.35)' : r < 0.5 ? 'rgba(170,30,50,0.25)' : 'rgba(255,255,255,0.05)';
    m.fillRect(x, 0, 1, H);
  }
  for (let y = 0; y < H; y += 2) { m.fillStyle = y % 4 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.04)'; m.fillRect(0, y, W, 1); }
  // diamond lattice in argaman and tola'at shani, edged with gold
  const cell = 96;
  for (let row = -1; row < H / cell + 1; row++) for (let col = -1; col < W / cell + 1; col++) {
    const cx = col * cell + (row % 2 ? cell / 2 : 0), cy = row * cell * 0.9;
    m.beginPath(); m.moveTo(cx, cy - 40); m.lineTo(cx + 34, cy); m.lineTo(cx, cy + 40); m.lineTo(cx - 34, cy); m.closePath();
    m.fillStyle = (row + col) % 2 ? 'rgba(120,35,135,0.75)' : 'rgba(160,26,44,0.7)';
    m.fill();
    m.strokeStyle = 'rgba(232,190,90,0.85)'; m.lineWidth = 3; m.stroke();
    // rosette
    m.fillStyle = 'rgba(240,205,110,0.9)';
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; m.beginPath(); m.ellipse(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9, 7, 3.5, a, 0, Math.PI * 2); m.fill(); }
    m.fillStyle = '#f3ead8'; m.beginPath(); m.arc(cx, cy, 4.5, 0, Math.PI * 2); m.fill();
  }
  // borders
  const band = (y, h) => {
    m.fillStyle = '#7a1424'; m.fillRect(0, y, W, h);
    m.fillStyle = 'rgba(232,190,90,0.9)'; m.fillRect(0, y + 4, W, 4); m.fillRect(0, y + h - 8, W, 4);
  };
  band(H - 70, 70); band(0, 40);
  m.fillStyle = '#7a1424'; m.fillRect(0, 0, 26, H); m.fillRect(W - 26, 0, 26, H);
  m.fillStyle = 'rgba(232,190,90,0.9)'; m.fillRect(22, 0, 4, H); m.fillRect(W - 26, 0, 4, H);
  return { map: toTexture(c, { repeat: false }) };
}

// Avnet (sash) — blue, purple, scarlet and white linen stripes
export function avnetTexture() {
  const c = canvas(64, 256), m = c.getContext('2d', RF);
  const cols = ['#2346a8', '#f2ede0', '#6b2a8c', '#f2ede0', '#c0283a', '#f2ede0'];
  for (let i = 0; i < 16; i++) { m.fillStyle = cols[i % cols.length]; m.fillRect(0, i * 16, 64, 16); }
  return toTexture(c);
}

// Fine linen weave for garments
export function linenTexture() {
  const S = 128, c = canvas(S), m = c.getContext('2d', RF);
  m.fillStyle = '#fbf8f1'; m.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 2) {
    m.fillStyle = 'rgba(180,170,150,0.10)'; m.fillRect(i, 0, 1, S);
    m.fillStyle = 'rgba(180,170,150,0.08)'; m.fillRect(0, i, S, 1);
  }
  return toTexture(c);
}

// Terrain detail (dirt + dry grass speckle), multiplied with vertex colours
export function terrainDetail() {
  const S = 512, c = canvas(S), m = c.getContext('2d', RF);
  m.fillStyle = '#fff'; m.fillRect(0, 0, S, S);
  const nf = noiseField(S, 32, 4, 81);
  applyNoise(m, S, nf, 0.5);
  srand(82);
  for (let k = 0; k < 3000; k++) {
    m.fillStyle = `rgba(${rr(60, 120)},${rr(70, 110)},${rr(30, 60)},0.25)`;
    m.fillRect(rr(0, S), rr(0, S), 2, rr(2, 5));
  }
  return toTexture(c);
}

// Soft round sprite for particles/smoke
export function softSprite(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const S = 128, c = canvas(S), m = c.getContext('2d', RF);
  const g = m.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner); g.addColorStop(0.4, inner.replace(/[\d.]+\)$/, '0.55)')); g.addColorStop(1, outer);
  m.fillStyle = g; m.fillRect(0, 0, S, S);
  return toTexture(c, { repeat: false });
}

// Smoke puff with wispy noise
export function smokeSprite() {
  const S = 128, c = canvas(S), m = c.getContext('2d', RF);
  const img = m.createImageData(S, S);
  const nf = noiseField(S, 4, 4, 91);
  for (let y = 0, p = 0; y < S; y++) for (let x = 0; x < S; x++, p++) {
    const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
    const d = Math.sqrt(dx * dx + dy * dy);
    const a = Math.max(0, 1 - d) ** 1.6 * (0.55 + nf[p] * 0.9);
    img.data[p * 4] = img.data[p * 4 + 1] = img.data[p * 4 + 2] = 255;
    img.data[p * 4 + 3] = Math.min(255, a * 255);
  }
  m.putImageData(img, 0, 0);
  return toTexture(c, { repeat: false });
}

// Text label texture for signs above lishkot doors
export function signTexture(text, sub = '') {
  const c = canvas(512, 160), m = c.getContext('2d', RF);
  m.fillStyle = '#3b2a12'; m.fillRect(0, 0, 512, 160);
  m.strokeStyle = '#d9b45a'; m.lineWidth = 8; m.strokeRect(6, 6, 500, 148);
  m.fillStyle = '#f6e6b8'; m.textAlign = 'center'; m.textBaseline = 'middle';
  m.font = 'bold 54px "Frank Ruhl Libre", "Times New Roman", serif';
  m.fillText(text, 256, sub ? 62 : 80);
  if (sub) { m.font = '30px Fredoka, Arial, sans-serif'; m.fillStyle = '#e9d39a'; m.fillText(sub, 256, 120); }
  return toTexture(c, { repeat: false });
}
