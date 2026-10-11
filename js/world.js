// The world: Yerushalayim, Har HaBayit, and the Beit HaMikdash.
import * as THREE from 'three';
import { MAT, TEX } from './materials.js';
import { StaticBuilder } from './builder.js';
import { signTexture } from './textures.js';
import {
  AZARA, EZRAT_NASHIM, STEPS15, OUTER_Y, MIZBEACH, KEVESH, ULAM, HEICHAL, ULAM_STEPS, P,
} from './config.js';

// ── Terrain noise ──
function hash2(i, j) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, o = 5) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let k = 0; k < o; k++) { s += a * vnoise(x * f, z * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const G = (d, w) => Math.exp(-(d * d) / (w * w));

// Har HaBayit platform footprint (approx. 300 x 310 m around our Mikdash)
const MOUNT = { x0: -190, x1: 150, z0: -150, z1: 160, top: OUTER_Y };

export function terrainH(x, z) {
  let h = -40;
  h += 125 * G(x - 560, 240) * (0.8 + 0.2 * Math.cos(z / 260));   // Har HaZeitim (east)
  h += 75 * G(x + 560, 320);                                        // western hills (Upper City)
  h += 50 * G(z + 620, 320);                                        // north
  h -= 22 * G(x - 230, 75);                                         // Nachal Kidron
  h -= 16 * G(x + 250, 60);                                         // Tyropoeon valley
  h -= 30 * G(z - 700, 260) * G(x - 100, 300);                      // valleys to the south
  h += (fbm(x * 0.006 + 3, z * 0.006 - 1) - 0.5) * 46;
  const r = Math.hypot(x, z);
  h += sstep(1300, 2700, r) * (160 + fbm(x * 0.0016 + 7, z * 0.0016) * 460);
  // carve around the platform so the retaining walls are tall
  const px = Math.max(0, Math.max(MOUNT.x0 - x, x - MOUNT.x1));
  const pz = Math.max(0, Math.max(MOUNT.z0 - z, z - MOUNT.z1));
  const dp = Math.hypot(px, pz);
  if (dp < 80) h = Math.min(h, -36 + (h + 36) * sstep(0, 80, dp));
  return h;
}

function insideMount(x, z, m = 0) {
  return x > MOUNT.x0 - m && x < MOUNT.x1 + m && z > MOUNT.z0 - m && z < MOUNT.z1 + m;
}

export function buildWorld(scene, physics, quality) {
  const b = new StaticBuilder(physics);
  const out = { props: {}, lamps: [], fires: [], animated: [], signs: [], lights: {} };

  buildLand(scene, quality);
  buildMount(b, scene, quality);
  buildEzratNashim(b, scene, out);
  buildAzara(b, scene, out);
  buildMizbeach(b, scene, out);
  buildKiyor(b, scene, out);
  buildSlaughterArea(b, scene, out);
  buildHeichal(b, scene, out);
  b.build(scene);
  out.staticMeshes = b.meshes;
  return out;
}

// ─────────────────────────────────────────────────────────────
// Land: terrain, distant mountains, the city, olive trees
// ─────────────────────────────────────────────────────────────
function buildLand(scene, quality) {
  const SIZE = 7000, SEG = quality === 'low' ? 150 : 230;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const cA = new THREE.Color(0xb59b6a), cB = new THREE.Color(0x8c8d5a), cC = new THREE.Color(0xa59a86), cD = new THREE.Color(0x7d8a5b);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainH(x, z);
    pos.setY(i, h);
    const n = fbm(x * 0.01, z * 0.01, 3);
    tmp.copy(cA).lerp(cB, sstep(0.35, 0.7, n));
    if (x > 300 && x < 900) tmp.lerp(cD, 0.45);                 // olive groves
    tmp.lerp(cC, sstep(120, 400, h));                            // rocky heights
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, MAT.terrain);
  terrain.receiveShadow = false;
  scene.add(terrain);

  // City houses (instanced)
  const houseGeo = new THREE.BoxGeometry(1, 1, 1);
  houseGeo.translate(0, 0.5, 0);
  const N = quality === 'low' ? 900 : 1700;
  const houses = new THREE.InstancedMesh(houseGeo, MAT.house, N);
  const housesB = new THREE.InstancedMesh(houseGeo, MAT.houseDark, N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let na = 0, nb = 0;
  let seed = 4242;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let tries = 0;
  while ((na < N || nb < N) && tries < 40000) {
    tries++;
    // Upper & lower city lie west and south of the Mount; houses thin out on the Mount of Olives
    const ang = rnd() * Math.PI * 2;
    const r = 230 + Math.pow(rnd(), 0.8) * 760;
    const x = Math.cos(ang) * r - 120, z = Math.sin(ang) * r + 60;
    if (insideMount(x, z, 25)) continue;
    if (x > 250 && rnd() < 0.93) continue;                       // Har HaZeitim — groves
    const h = terrainH(x, z);
    if (h > 90) continue;
    const w = 6 + rnd() * 10, d = 6 + rnd() * 10, ht = 4 + rnd() * 6 + (rnd() < 0.08 ? 8 : 0);
    const yaw = Math.round(rnd() * 4) * (Math.PI / 2) + (rnd() - 0.5) * 0.3;
    q.setFromAxisAngle(up, yaw);
    m4.compose(p.set(x, h - 2, z), q, s.set(w, ht + 2, d));
    if (rnd() < 0.55) { if (na < N) houses.setMatrixAt(na++, m4); }
    else if (nb < N) housesB.setMatrixAt(nb++, m4);
  }
  houses.count = na; housesB.count = nb;
  houses.castShadow = housesB.castShadow = false;
  scene.add(houses, housesB);

  // Landmark towers: Herod's palace (west) and Antonia fortress (north-west of the Mount)
  const towers = [[-640, 140, 14, 46], [-660, 170, 12, 40], [-620, 190, 11, 36], [-210, -185, 16, 38], [-150, -185, 14, 34], [-210, -235, 14, 34], [-150, -235, 14, 34]];
  for (const [x, z, w, ht] of towers) {
    const t = new THREE.Mesh(houseGeo, MAT.house);
    const h = Math.min(terrainH(x, z), -10);
    t.position.set(x, h - 4, z); t.scale.set(w, ht + 4, w);
    scene.add(t);
  }
  const antonia = new THREE.Mesh(houseGeo, MAT.houseDark);
  antonia.position.set(-180, -40, -210); antonia.scale.set(80, 52, 60);
  scene.add(antonia);

  // Trees: olive groves on the Mount of Olives + cypresses in the city
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3, 5); trunkGeo.translate(0, 1.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(2.6, 0); crownGeo.scale(1, 0.75, 1); crownGeo.translate(0, 3.8, 0);
  const cypGeo = new THREE.ConeGeometry(1.4, 11, 6); cypGeo.translate(0, 5.5, 0);
  const NT = quality === 'low' ? 600 : 1400;
  const trunks = new THREE.InstancedMesh(trunkGeo, MAT.trunk, NT);
  const crowns = new THREE.InstancedMesh(crownGeo, MAT.oliveLeaf, NT);
  const cyps = new THREE.InstancedMesh(cypGeo, MAT.cypress, 260);
  let nt = 0, nc = 0;
  seed = 999;
  for (let k = 0; k < 20000 && nt < NT; k++) {
    const x = 200 + rnd() * 900, z = -700 + rnd() * 1400;
    const h = terrainH(x, z);
    if (insideMount(x, z, 30)) continue;
    const sc = 0.8 + rnd() * 0.7;
    q.setFromAxisAngle(up, rnd() * 6.28);
    m4.compose(p.set(x, h - 0.3, z), q, s.set(sc, sc, sc));
    trunks.setMatrixAt(nt, m4); crowns.setMatrixAt(nt, m4); nt++;
  }
  for (let k = 0; k < 5000 && nc < 260; k++) {
    const ang = rnd() * 6.28, r = 200 + rnd() * 700;
    const x = Math.cos(ang) * r - 100, z = Math.sin(ang) * r + 60;
    if (insideMount(x, z, 20) || x > 250) continue;
    const sc = 0.8 + rnd() * 0.6;
    m4.compose(p.set(x, terrainH(x, z) - 0.5, z), q.identity(), s.set(sc, sc, sc));
    cyps.setMatrixAt(nc++, m4);
  }
  trunks.count = crowns.count = nt; cyps.count = nc;
  scene.add(trunks, crowns, cyps);
}

// ─────────────────────────────────────────────────────────────
// Har HaBayit: platform, retaining walls, colonnades, soreg
// ─────────────────────────────────────────────────────────────
function buildMount(b, scene, quality) {
  const { x0, x1, z0, z1, top } = MOUNT;
  const far = { shadow: false };
  // retaining walls (Herodian ashlars — think of the Kotel!)
  b.boxMM(MAT.stoneWarm, x0, -70, z0, x1, top - 1, z1, far);
  b.boxMM(MAT.floorOuter, x0 + 0.5, top - 1, z0 + 0.5, x1 - 0.5, top, z1 - 0.5, { shadow: false, collide: true });
  // parapet + porticoes (stoas) around the edge
  const colGeo = new THREE.CylinderGeometry(0.62, 0.7, 11, 12);
  const m = new THREE.Matrix4();
  const addRow = (ax, az, bx, bz, step, height, inset) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / step);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      m.makeScale(1, height / 11, 1).setPosition(x, top + height / 2, z);
      b.add(MAT.marble, colGeo, m, far);
    }
  };
  const H = 11, inset = 6, inset2 = 13;
  // N, E, W porticoes: two rows; S: Royal Stoa with three rows and taller columns
  addRow(x0 + inset, z0 + inset, x1 - inset, z0 + inset, 6, H);
  addRow(x0 + inset2, z0 + inset2, x1 - inset2, z0 + inset2, 6, H);
  addRow(x1 - inset, z0 + inset, x1 - inset, z1 - inset, 6, H);
  addRow(x1 - inset2, z0 + inset2, x1 - inset2, z1 - inset2, 6, H);
  addRow(x0 + inset, z0 + inset, x0 + inset, z1 - inset, 6, H);
  addRow(x0 + inset2, z0 + inset2, x0 + inset2, z1 - inset2, 6, H);
  addRow(x0 + inset, z1 - inset, x1 - inset, z1 - inset, 6, 17);
  addRow(x0 + inset2, z1 - inset2, x1 - inset2, z1 - inset2, 6, 17);
  addRow(x0 + 20, z1 - 20, x1 - 20, z1 - 20, 6, 17);
  // roofs + back walls
  const R = (ax0, az0, ax1, az1, hh) => {
    b.boxMM(MAT.cedar, ax0, top + hh, az0, ax1, top + hh + 1.2, az1, far);
    b.boxMM(MAT.stoneTrim, ax0 - 0.3, top + hh + 1.2, az0 - 0.3, ax1 + 0.3, top + hh + 1.8, az1 + 0.3, far);
  };
  R(x0 + 1, z0 + 1, x1 - 1, z0 + inset2 + 1.5, H);
  R(x1 - inset2 - 1.5, z0 + 1, x1 - 1, z1 - 1, H);
  R(x0 + 1, z0 + 1, x0 + inset2 + 1.5, z1 - 1, H);
  R(x0 + 1, z1 - 21.5, x1 - 1, z1 - 1, 17);
  b.boxMM(MAT.stoneWarm, x0, top, z0, x1, top + 13, z0 + 1, far);
  b.boxMM(MAT.stoneWarm, x0, top, z1 - 1, x1, top + 19, z1, far);
  b.boxMM(MAT.stoneWarm, x0, top, z0, x0 + 1, top + 13, z1, far);
  b.boxMM(MAT.stoneWarm, x1 - 1, top, z0, x1, top + 13, z1, far);

  // Soreg (lattice fence) around the holy area & the Chel terrace
  const sx0 = -96, sx1 = 80, sz0 = -54, sz1 = 54;
  const postGeo = new THREE.BoxGeometry(0.2, 1.5, 0.2);
  for (let x = sx0; x <= sx1; x += 2) {
    for (const z of [sz0, sz1]) { m.makeTranslation(x, top + 0.75, z); b.add(MAT.lattice, postGeo, m, far); }
  }
  for (let z = sz0; z <= sz1; z += 2) {
    for (const x of [sx0, sx1]) { m.makeTranslation(x, top + 0.75, z); b.add(MAT.lattice, postGeo, m, far); }
  }
  for (const yy of [0.5, 1.3]) {
    b.boxMM(MAT.lattice, sx0, top + yy, sz0 - 0.05, sx1, top + yy + 0.12, sz0 + 0.05, far);
    b.boxMM(MAT.lattice, sx0, top + yy, sz1 - 0.05, sx1, top + yy + 0.12, sz1 + 0.05, far);
    b.boxMM(MAT.lattice, sx0 - 0.05, top + yy, sz0, sx0 + 0.05, top + yy + 0.12, sz1, far);
    b.boxMM(MAT.lattice, sx1 - 0.05, top + yy, sz0, sx1 + 0.05, top + yy + 0.12, sz1, far);
  }
  // Chel: the raised terrace with steps
  b.boxMM(MAT.stone, -88, top - 1, -46, 72, -3.1, 46, { collide: true });
  for (let i = 0; i < 6; i++) {
    b.boxMM(MAT.stone, 72 + i * 0.5, top - 1, -10, 72.5 + i * 0.5, -3.1 - (i + 1) * 0.48, 10, far);
  }
  // The Azara sits higher again
  b.boxMM(MAT.stone, -80, -3.2, -38, 21.4, -0.1, 38, { collide: true });
}

// ─────────────────────────────────────────────────────────────
// Ezrat Nashim, the 15 steps, Nikanor gate
// ─────────────────────────────────────────────────────────────
function buildEzratNashim(b, scene, out) {
  const E = EZRAT_NASHIM, fy = E.floorY, top = fy + E.wallH;
  b.boxMM(MAT.floor, E.minX, fy - 0.5, E.minZ, E.maxX, fy, E.maxZ, { collide: true });
  // walls
  b.boxMM(MAT.stone, E.minX, fy, E.minZ - 2, E.maxX + 2, top, E.minZ, { collide: true });
  b.boxMM(MAT.stone, E.minX, fy, E.maxZ, E.maxX + 2, top, E.maxZ + 2, { collide: true });
  b.boxMM(MAT.stone, E.maxX, fy, E.minZ, E.maxX + 2, top, E.maxZ, { collide: true });
  crenellate(b, E.minX, E.minZ - 2, E.maxX + 2, E.minZ, top);
  crenellate(b, E.minX, E.maxZ, E.maxX + 2, E.maxZ + 2, top);
  crenellate(b, E.maxX, E.minZ, E.maxX + 2, E.maxZ, top, true);
  // Eastern gate (closed, gilded)
  b.boxMM(MAT.stone, E.maxX - 0.5, fy, -6, E.maxX + 2.5, top + 4, 6, { collide: true });
  b.boxMM(MAT.gold, E.maxX - 0.62, fy, -2.8, E.maxX - 0.5, fy + 7, 2.8);
  b.boxMM(MAT.stoneTrim, E.maxX - 0.8, top + 3.4, -6.3, E.maxX + 2.8, top + 4.2, 6.3);

  // Balcony (built for Simchat Beit HaShoevah — Sukkah 51b)
  const colG = new THREE.CylinderGeometry(0.28, 0.32, 4.2, 10);
  const m = new THREE.Matrix4();
  const balY = fy + 4.2;
  for (let x = 33; x <= 51; x += 4) for (const z of [-17, 17]) {
    m.makeTranslation(x, fy + 2.1, z); b.add(MAT.marble, colG, m); physics_col(b, x, fy, z, 0.3, 4.2);
  }
  for (let z = -9; z <= 9; z += 4) { m.makeTranslation(58.6, fy + 2.1, z); b.add(MAT.marble, colG, m); physics_col(b, 58.6, fy, z, 0.3, 4.2); }
  b.boxMM(MAT.stoneTrim, E.minX, balY, E.minZ, E.maxX, balY + 0.4, -16.6, { collide: true });
  b.boxMM(MAT.stoneTrim, E.minX, balY, 16.6, E.maxX, balY + 0.4, E.maxZ, { collide: true });
  b.boxMM(MAT.stoneTrim, 58.2, balY, -16.6, E.maxX, balY + 0.4, 16.6, { collide: true });
  b.boxMM(MAT.lattice, E.minX, balY + 0.4, -16.75, E.maxX, balY + 1.3, -16.6);
  b.boxMM(MAT.lattice, E.minX, balY + 0.4, 16.6, E.maxX, balY + 1.3, 16.75);
  b.boxMM(MAT.lattice, 58.2, balY + 0.4, -16.6, 58.35, balY + 1.3, 16.6);

  // Four corner chambers (Middot 2:5)
  const ch = [
    { x0: 21.5, z0: -20, x1: 31, z1: -11, door: 'S', he: 'לשכת המצורעים', en: 'Chamber of the Metzora\'im' },
    { x0: 52, z0: -20, x1: 61.5, z1: -11, door: 'S', he: 'לשכת דיר העצים', en: 'Wood Chamber' },
    { x0: 21.5, z0: 11, x1: 31, z1: 20, door: 'N', he: 'לשכת בית שמניה', en: 'Oil Chamber' },
    { x0: 52, z0: 11, x1: 61.5, z1: 20, door: 'N', he: 'לשכת הנזירים', en: 'Chamber of the Nezirim' },
  ];
  for (const c of ch) {
    const h = fy + 3.6, t = 0.5;
    const cx = (c.x0 + c.x1) / 2;
    const dz = c.door === 'S' ? c.z1 : c.z0;
    const dzIn = c.door === 'S' ? c.z1 - t : c.z0 + t;
    // side walls
    b.boxMM(MAT.stoneWarm, c.x0, fy, c.z0, c.x0 + t, h, c.z1, { collide: true });
    b.boxMM(MAT.stoneWarm, c.x1 - t, fy, c.z0, c.x1, h, c.z1, { collide: true });
    // door wall with gap
    b.boxMM(MAT.stoneWarm, c.x0, fy, Math.min(dz, dzIn), cx - 1.2, h, Math.max(dz, dzIn), { collide: true });
    b.boxMM(MAT.stoneWarm, cx + 1.2, fy, Math.min(dz, dzIn), c.x1, h, Math.max(dz, dzIn), { collide: true });
    b.boxMM(MAT.stoneWarm, cx - 1.2, fy + 2.8, Math.min(dz, dzIn), cx + 1.2, h, Math.max(dz, dzIn));
    addSign(scene, out, c.he, c.en, cx, fy + 3.25, dz + (c.door === 'S' ? 0.03 : -0.03), c.door === 'S' ? 0 : Math.PI, 2.6);
  }

  // Golden lamp-towers of Simchat Beit HaShoevah (Sukkah 5:2)
  out.lampTowers = [];
  for (const [x, z] of [[37, -7], [37, 7], [47, -7], [47, 7]]) {
    b.cyl(MAT.gold, x, fy, z, 0.28, 0.42, 21, 12, { collide: true });
    b.cyl(MAT.gold, x, fy, z, 1.1, 1.3, 0.5, 16);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      const bx = x + Math.cos(a) * 1.3, bz = z + Math.sin(a) * 1.3;
      b.box(MAT.gold, (x + bx) / 2, fy + 20.6, (z + bz) / 2, 1.4, 0.12, 0.12, { ry: -a });
      b.cyl(MAT.gold, bx, fy + 20.6, bz, 0.55, 0.35, 0.45, 12);
      out.lampTowers.push(new THREE.Vector3(bx, fy + 21.2, bz));
    }
  }

  // The 15 semicircular steps (Middot 2:5) — Leviim sang Shir HaMa'alot here
  const S = STEPS15;
  for (let i = S.count - 1; i >= 0; i--) {
    const r = (i + 1) * S.depth;
    const y = -i * S.rise;
    b.cyl(MAT.stoneTrim, S.cx, fy, S.cz, r, r, y - fy, 40, { thetaStart: 0, thetaLength: Math.PI });
  }
  b.physics.addSurface(S.cx, -S.count * S.depth, S.cx + S.count * S.depth, S.count * S.depth, (x, z) => {
    const d = Math.hypot(x - S.cx, z - S.cz);
    if (d > S.count * S.depth) return fy;
    const idx = Math.min(S.count - 1, Math.floor(d / S.depth));
    return -idx * S.rise;
  });
}

function physics_col(b, x, y0, z, r, h) { b.physics.addBox(x - r, y0, z - r, x + r, y0 + h, z + r, false); }

function crenellate(b, x0, z0, x1, z1, top, alongZ = false) {
  b.boxMM(MAT.stoneTrim, x0 - 0.25, top - 0.5, z0 - 0.25, x1 + 0.25, top + 0.15, z1 + 0.25, { shadow: false });
  const len = alongZ ? z1 - z0 : x1 - x0;
  const n = Math.floor(len / 2.2);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    if (alongZ) {
      const z = z0 + len * t;
      b.boxMM(MAT.stone, x0, top + 0.15, z - 0.6, x1, top + 1.3, z + 0.6, { shadow: false });
    } else {
      const x = x0 + len * t;
      b.boxMM(MAT.stone, x - 0.6, top + 0.15, z0, x + 0.6, top + 1.3, z1, { shadow: false });
    }
  }
}

function addSign(scene, out, he, en, x, y, z, ry, w = 3) {
  const tex = signTexture(he, en);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 160 / 512), MAT.sign(tex));
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  scene.add(mesh);
  out.signs.push(mesh);
  return mesh;
}

// ─────────────────────────────────────────────────────────────
// Azara: floor, walls, gates, chambers, Duchan
// ─────────────────────────────────────────────────────────────
function buildAzara(b, scene, out) {
  const A = AZARA, H = A.wallH, T = A.wallT;
  b.boxMM(MAT.floor, A.minX, -0.5, A.minZ, A.maxX, 0, A.maxZ, { collide: true });
  // the north (Kodshei Kodashim slaughter area) is marked with darker slabs
  b.boxMM(MAT.floorNorth, -14, 0, A.minZ, 8.5, 0.012, -12.2, { collide: true, shadow: false });
  // walls
  b.boxMM(MAT.stone, A.minX - T, -0.1, A.minZ - T, A.maxX + T, H, A.minZ, { collide: true });
  b.boxMM(MAT.stone, A.minX - T, -0.1, A.maxZ, A.maxX + T, H, A.maxZ + T, { collide: true });
  b.boxMM(MAT.stone, A.minX - T, -0.1, A.minZ, A.minX, H, A.maxZ, { collide: true });
  crenellate(b, A.minX - T, A.minZ - T, A.maxX + T, A.minZ, H);
  crenellate(b, A.minX - T, A.maxZ, A.maxX + T, A.maxZ + T, H);
  crenellate(b, A.minX - T, A.minZ, A.minX, A.maxZ, H, true);
  // east wall (with Nikanor) goes down to the Ezrat Nashim floor
  const ex0 = A.maxX, ex1 = A.maxX + T;
  b.boxMM(MAT.stone, ex0, -3, A.minZ, ex1, H, -6.5, { collide: true });
  b.boxMM(MAT.stone, ex0, -3, 6.5, ex1, H, A.maxZ, { collide: true });
  crenellate(b, ex0, A.minZ, ex1, -7, H, true);
  crenellate(b, ex0, 7, ex1, A.maxZ, H, true);

  // Nikanor gate tower
  const gx0 = 19, gx1 = 21.5, gTop = 16.5;
  b.boxMM(MAT.stoneWarm, gx0, -3, -6.5, gx1, gTop, -3, { collide: true });
  b.boxMM(MAT.stoneWarm, gx0, -3, 3, gx1, gTop, 6.5, { collide: true });
  b.boxMM(MAT.stoneWarm, gx0, 10, -3, gx1, gTop, 3, { collide: true });
  b.boxMM(MAT.floor, gx0, -0.5, -3, gx1, 0, 3, { collide: true });
  b.boxMM(MAT.stoneTrim, gx0 - 0.4, gTop - 0.2, -6.9, gx1 + 0.4, gTop + 0.6, 6.9);
  b.boxMM(MAT.bronze, gx0 - 0.2, 9.6, -3.4, gx1 + 0.2, 10.2, 3.4);
  // Nikanor's bronze doors, swung open against the inside of the wall
  b.boxMM(MAT.bronze, gx0 - 0.18, 0, -6.3, gx0, 9.6, -3.1);
  b.boxMM(MAT.bronze, gx0 - 0.18, 0, 3.1, gx0, 9.6, 6.3);
  for (const z of [-4.7, 4.7]) for (let y = 1.2; y < 9.4; y += 1.6) b.box(MAT.goldBright, gx0 - 0.22, y, z, 0.08, 0.25, 0.25);
  addSign(scene, out, 'שער ניקנור', 'Nikanor Gate', gx1 + 0.04, 12.6, 0, Math.PI / 2, 4.4);

  // Gates in the north and south walls (gilded doors — Middot 2:3)
  const gates = [
    { x: -56, z: A.minZ, he: 'שער בית המוקד', en: 'Gate of Beit HaMoked' },
    { x: -28, z: A.minZ, he: 'שער הקרבן', en: 'Gate of the Korban' },
    { x: 2, z: A.minZ, he: 'שער הניצוץ', en: 'Gate of the Spark' },
    { x: -56, z: A.maxZ, he: 'שער הדלק', en: 'Gate of the Kindling' },
    { x: -28, z: A.maxZ, he: 'שער הבכורות', en: 'Gate of the Firstborn' },
    { x: 8, z: A.maxZ, he: 'שער המים', en: 'Water Gate' },
  ];
  for (const g of gates) {
    const north = g.z < 0;
    const inner = north ? A.minZ : A.maxZ, outer = north ? A.minZ - T - 1.5 : A.maxZ + T + 1.5;
    const zi = north ? inner + 0.8 : inner - 0.8;
    b.boxMM(MAT.stoneWarm, g.x - 4.5, -0.1, Math.min(zi, outer), g.x + 4.5, H + 3, Math.max(zi, outer), { collide: true });
    b.boxMM(MAT.stoneTrim, g.x - 4.8, H + 2.8, Math.min(zi, outer) - 0.3, g.x + 4.8, H + 3.5, Math.max(zi, outer) + 0.3);
    const fz = north ? zi + 0.01 : zi - 0.01;
    b.boxMM(MAT.gold, g.x - 2.2, 0, Math.min(fz, fz + (north ? 0.1 : -0.1)), g.x + 2.2, 6.6, Math.max(fz, fz + (north ? 0.1 : -0.1)));
    b.boxMM(MAT.dark, g.x - 0.05, 0.2, Math.min(fz, fz + (north ? 0.12 : -0.12)), g.x + 0.05, 6.4, Math.max(fz, fz + (north ? 0.12 : -0.12)), { shadow: false });
    addSign(scene, out, g.he, g.en, g.x, 8, north ? zi + 0.03 : zi - 0.03, north ? 0 : Math.PI, 3.6);
  }

  // Chambers (lishkot) — doorways along the walls
  const lishkot = [
    { x: 13, z: A.minZ, he: 'לשכת הגזית', en: 'Chamber of Hewn Stone' },
    { x: -40, z: A.minZ, he: 'לשכת העץ', en: 'Wood Chamber' },
    { x: -14, z: A.maxZ, he: 'לשכת המלח', en: 'Salt Chamber' },
    { x: -40, z: A.maxZ, he: 'לשכת הפרוה', en: 'Parvah Chamber' },
    { x: 15, z: A.maxZ, he: 'לשכת המדיחין', en: 'Rinsing Chamber' },
  ];
  for (const l of lishkot) {
    const north = l.z < 0;
    const fz = north ? l.z + 0.02 : l.z - 0.02;
    b.boxMM(MAT.dark, l.x - 1.4, 0, Math.min(fz, fz + (north ? 0.05 : -0.05)), l.x + 1.4, 3.6, Math.max(fz, fz + (north ? 0.05 : -0.05)), { shadow: false });
    b.boxMM(MAT.stoneTrim, l.x - 1.8, 3.6, Math.min(l.z, l.z + (north ? 0.3 : -0.3)), l.x + 1.8, 4.0, Math.max(l.z, l.z + (north ? 0.3 : -0.3)));
    addSign(scene, out, l.he, l.en, l.x, 4.7, north ? l.z + 0.06 : l.z - 0.06, north ? 0 : Math.PI, 3.2);
  }
  // Lishkat HaGazit — Sanhedrin seat, a grander portal
  b.boxMM(MAT.stoneTrim, 10.6, 0, A.minZ, 11.2, 4.2, A.minZ + 0.6, { collide: true });
  b.boxMM(MAT.stoneTrim, 14.8, 0, A.minZ, 15.4, 4.2, A.minZ + 0.6, { collide: true });

  // Duchan — the Leviim's platform, split in two to keep the view to the Heichal open
  for (const [z0, z1] of [[-12, -3.2], [3.2, 12]]) {
    b.boxMM(MAT.stoneTrim, 12.2, 0, z0, 14.6, 0.27, z1, { collide: true });
    b.boxMM(MAT.stoneTrim, 12.8, 0, z0, 14.6, 0.53, z1, { collide: true });
    b.boxMM(MAT.stoneTrim, 13.4, 0, z0, 14.6, 0.8, z1, { collide: true });
  }

  // Lamb chamber pen (Lishkat HaTla'im)
  const px0 = -17, px1 = -9, pz0 = A.minZ, pz1 = -29.6;
  const postG = new THREE.BoxGeometry(0.16, 1.1, 0.16);
  const m = new THREE.Matrix4();
  for (let x = px0; x <= px1 + 0.01; x += 1) {
    if (x > -13.6 && x < -10.4) continue;
    m.makeTranslation(x, 0.55, pz1); b.add(MAT.cedar, postG, m);
  }
  for (let z = pz0; z <= pz1; z += 1) { for (const x of [px0, px1]) { m.makeTranslation(x, 0.55, z); b.add(MAT.cedar, postG, m); } }
  for (const y of [0.45, 0.95]) {
    b.boxMM(MAT.cedar, px0, y, pz1 - 0.05, -13.5, y + 0.1, pz1 + 0.05, { collide: true });
    b.boxMM(MAT.cedar, -10.5, y, pz1 - 0.05, px1, y + 0.1, pz1 + 0.05, { collide: true });
    b.boxMM(MAT.cedar, px0 - 0.05, y, pz0, px0 + 0.05, y + 0.1, pz1, { collide: true });
    b.boxMM(MAT.cedar, px1 - 0.05, y, pz0, px1 + 0.05, y + 0.1, pz1, { collide: true });
  }
  // gate bar (pen is closed — interact from outside)
  b.boxMM(MAT.cedar, -13.5, 0.7, pz1 - 0.05, -10.5, 0.8, pz1 + 0.05, { collide: true });
  b.physics.addBox(-13.5, 0, pz1 - 0.1, -10.5, 1.0, pz1 + 0.1, false);
  b.boxMM(MAT.wood, px0 + 0.3, 0, pz0 + 0.2, px0 + 2.3, 0.35, pz0 + 1, {});   // hay trough
  addSign(scene, out, 'לשכת הטלאים', 'Lamb Chamber', -13, 4.7, A.minZ + 0.06, 0, 3.2);

  // Wood pile (near the ramp)
  const logG = new THREE.CylinderGeometry(0.16, 0.16, 2.2, 8);
  const e = new THREE.Euler(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), pp = new THREE.Vector3();
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 6 - row; i++) {
      e.set(Math.PI / 2, 0, 0); q.setFromEuler(e);
      m.compose(pp.set(P.woodPile.x - 1 + i * 0.34 + row * 0.17, 0.16 + row * 0.29, P.woodPile.z + 1.2), q, s1);
      b.add(MAT.wood, logG, m);
    }
  }
  b.physics.addBox(P.woodPile.x - 1.2, 0, P.woodPile.z + 0.1, P.woodPile.x + 1.2, 1.2, P.woodPile.z + 2.3, false);

  // Machta stand (west of the ramp)
  b.boxMM(MAT.stoneTrim, P.machtaStand.x - 0.45, 0, P.machtaStand.z - 0.45, P.machtaStand.x + 0.45, 0.95, P.machtaStand.z + 0.45, { collide: true });
}

// ─────────────────────────────────────────────────────────────
// Mizbeach HaChitzon with the Kevesh
// ─────────────────────────────────────────────────────────────
function buildMizbeach(b, scene, out) {
  const M = MIZBEACH, cx = M.cx, cz = M.cz;
  const hb = M.base / 2, hbo = M.body / 2, ht = M.top / 2;
  b.boxMM(MAT.plaster, cx - hb, 0, cz - hb, cx + hb, M.baseH, cz + hb, { collide: true });
  b.boxMM(MAT.plaster, cx - hbo, M.baseH, cz - hbo, cx + hbo, M.bodyH, cz + hbo, { collide: true });
  b.boxMM(MAT.plaster, cx - ht, M.bodyH, cz - ht, cx + ht, M.topH, cz + ht, { collide: true });
  // sovev edge trim
  b.boxMM(MAT.stoneTrim, cx - hbo - 0.02, M.bodyH - 0.12, cz - hbo - 0.02, cx + hbo + 0.02, M.bodyH, cz + hbo + 0.02);
  // chut ha-sikra: the red line half way up (Middot 3:1)
  const y0 = M.redLineY - 0.06, y1 = M.redLineY + 0.06, o = hbo + 0.015;
  b.boxMM(MAT.redLine, cx - o, y0, cz - o, cx + o, y1, cz - o + 0.02, { shadow: false });
  b.boxMM(MAT.redLine, cx - o, y0, cz + o - 0.02, cx + o, y1, cz + o, { shadow: false });
  b.boxMM(MAT.redLine, cx - o, y0, cz - o, cx - o + 0.02, y1, cz + o, { shadow: false });
  b.boxMM(MAT.redLine, cx + o - 0.02, y0, cz - o, cx + o, y1, cz + o, { shadow: false });
  // horns (kranot)
  const hs = M.hornS, hy = M.topH;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const x = cx + sx * (ht - hs / 2), z = cz + sz * (ht - hs / 2);
    b.boxMM(MAT.plaster, x - hs / 2, hy, z - hs / 2, x + hs / 2, hy + M.hornH, z + hs / 2, { collide: true, cam: false });
  }
  // Kevesh (ramp): a wedge
  const K = KEVESH;
  const rg = new THREE.BoxGeometry(K.maxX - K.minX, K.topY, K.bottomZ - K.topZ);
  const pa = rg.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    if (pa.getY(i) > 0 && pa.getZ(i) > 0) pa.setY(i, -K.topY / 2 + 0.02);
  }
  rg.computeVertexNormals();
  const m = new THREE.Matrix4().makeTranslation((K.minX + K.maxX) / 2, K.topY / 2, (K.topZ + K.bottomZ) / 2);
  b.add(MAT.plaster, rg, m);
  rg.dispose();
  b.physics.addSurface(K.minX, K.topZ, K.maxX, K.bottomZ, (x, z) => K.topY * (K.bottomZ - z) / (K.bottomZ - K.topZ));
  // ramp edging
  b.boxMM(MAT.stoneTrim, K.minX - 0.12, 0, K.bottomZ - 0.3, K.minX, 0.25, K.bottomZ);
  b.boxMM(MAT.stoneTrim, K.maxX, 0, K.bottomZ - 0.3, K.maxX + 0.12, 0.25, K.bottomZ);

  // Salt on the ramp (every korban is salted — Vayikra 2:13)
  const saltG = new THREE.SphereGeometry(0.45, 12, 8); saltG.scale(1, 0.45, 1);
  const sz = P.saltSpot.z, sy = K.topY * (K.bottomZ - sz) / (K.bottomZ - K.topZ);
  b.add(MAT.white, saltG, new THREE.Matrix4().makeTranslation(P.saltSpot.x, sy, sz));
  saltG.dispose();

  // Top of the altar: wood piles, the ash heap (tapuach)
  const ty = M.topH;
  const logG = new THREE.CylinderGeometry(0.17, 0.17, 2.4, 8);
  const e = new THREE.Euler(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  const pile = (x, z, layers, len) => {
    for (let l = 0; l < layers; l++) for (let i = -2; i <= 2; i++) {
      e.set(0, l % 2 ? 0 : Math.PI / 2, Math.PI / 2); q.setFromEuler(e);
      const ox = l % 2 ? i * 0.38 : 0, oz = l % 2 ? 0 : i * 0.38;
      m.compose(p.set(x + ox, ty + 0.17 + l * 0.3, z + oz), q, one.set(1, len, 1));
      b.add(MAT.wood, logG, m, { uv: 'keep' });
    }
  };
  pile(P.fireBig.x, P.fireBig.z, 3, 1);
  pile(P.fireKetoret.x, P.fireKetoret.z, 2, 0.6);
  pile(-3.4, -0.4, 2, 0.55);
  out.fires.push({ x: P.fireBig.x, y: ty + 0.6, z: P.fireBig.z, scale: 1.4, main: true });
  out.fires.push({ x: P.fireKetoret.x, y: ty + 0.45, z: P.fireKetoret.z, scale: 0.75 });
  out.fires.push({ x: -3.4, y: ty + 0.45, z: -0.4, scale: 0.65 });
  const heap = new THREE.SphereGeometry(1.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  heap.scale(1.3, 0.55, 1.3);
  b.add(MAT.ash, heap, new THREE.Matrix4().makeTranslation(P.ashHeap.x - 0.4, ty, P.ashHeap.z), { uv: 'keep' });
  heap.dispose();
  const ember = new THREE.SphereGeometry(0.09, 6, 4);
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * 6.28, r = Math.random() * 1.6;
    b.add(MAT.ember, ember, new THREE.Matrix4().makeTranslation(P.ashHeap.x - 0.4 + Math.cos(a) * r, ty + 0.55 - r * 0.28, P.ashHeap.z + Math.sin(a) * r), { shadow: false });
  }
  // Shitin: two silver bowls on the south-west corner for nisuch (Sukkah 4:9)
  b.cyl(MAT.silver, cx - ht + 1.2, ty, cz + ht - 0.75, 0.22, 0.14, 0.22, 14);
  b.cyl(MAT.silver, cx - ht + 0.75, ty, cz + ht - 1.25, 0.22, 0.14, 0.22, 14);
}

// ─────────────────────────────────────────────────────────────
// Kiyor — the laver with 12 spouts (Yoma 37a, Ben Katin)
// ─────────────────────────────────────────────────────────────
function buildKiyor(b, scene, out) {
  const { x, z } = P.kiyor;
  b.cyl(MAT.stoneTrim, x, 0, z, 1.25, 1.4, 0.35, 24, { collide: true });
  b.cyl(MAT.bronze, x, 0.35, z, 0.45, 0.75, 1.0, 20);
  const prof = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    prof.push(new THREE.Vector2(0.4 + Math.sin(t * Math.PI * 0.5) * 1.25, t * 0.85));
  }
  prof.push(new THREE.Vector2(1.72, 0.88));
  const bowl = new THREE.LatheGeometry(prof, 32);
  b.add(MAT.bronze, bowl, new THREE.Matrix4().makeTranslation(x, 1.3, z), { uv: 'keep' });
  bowl.dispose();
  const water = new THREE.CircleGeometry(1.58, 32); water.rotateX(-Math.PI / 2);
  const wm = new THREE.Mesh(water, MAT.water); wm.position.set(x, 2.05, z); scene.add(wm);
  const spout = new THREE.CylinderGeometry(0.05, 0.07, 0.5, 8);
  const q = new THREE.Quaternion(), e = new THREE.Euler(), m = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  out.kiyorSpouts = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    e.set(0, -a, Math.PI / 2 - 0.5, 'YXZ'); q.setFromEuler(e);
    const sx = x + Math.cos(a) * 1.55, sz = z + Math.sin(a) * 1.55;
    m.compose(p.set(sx, 1.55, sz), q, one);
    b.add(MAT.bronze, spout, m);
    out.kiyorSpouts.push(new THREE.Vector3(x + Math.cos(a) * 1.8, 1.45, z + Math.sin(a) * 1.8));
  }
  b.physics.addBox(x - 1.4, 0, z - 1.4, x + 1.4, 2.2, z + 1.4, false);
}

// ─────────────────────────────────────────────────────────────
// Beit HaMitbachayim — rings, pillars with hooks, marble tables (Middot 3:5)
// ─────────────────────────────────────────────────────────────
function buildSlaughterArea(b, scene, out) {
  const ring = new THREE.TorusGeometry(0.28, 0.05, 6, 18); ring.rotateX(-Math.PI / 2);
  const plate = new THREE.CylinderGeometry(0.42, 0.42, 0.03, 18);
  out.rings = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) {
    const x = -7.5 + i * 3, z = -15 - j * 3.2;
    b.add(MAT.silver, ring, new THREE.Matrix4().makeTranslation(x, 0.06, z), { shadow: false });
    b.add(MAT.stoneTrim, plate, new THREE.Matrix4().makeTranslation(x, 0.015, z), { shadow: false });
    out.rings.push({ x, z });
  }
  ring.dispose(); plate.dispose();
  for (let i = 0; i < 8; i++) {
    const x = -9 + i * 3, z = -27;
    b.cyl(MAT.marble, x, 0, z, 0.3, 0.36, 2.5, 12, { collide: true, cam: false });
    b.boxMM(MAT.cedar, x - 0.7, 2.5, z - 0.3, x + 0.7, 2.85, z + 0.3);
    for (let r = 0; r < 3; r++) for (const s of [-1, 1]) b.box(MAT.silver, x + s * (0.3 + r * 0.17), 2.38, z + 0.32, 0.04, 0.22, 0.04);
  }
  for (let i = 0; i < 6; i++) {
    const x = -3 + i * 3, z = -30.8;
    b.boxMM(MAT.marble, x - 0.65, 0.78, z - 0.45, x + 0.65, 0.9, z + 0.45, { collide: true, cam: false });
    b.boxMM(MAT.marble, x - 0.5, 0, z - 0.3, x + 0.5, 0.78, z + 0.3);
  }
}

// ─────────────────────────────────────────────────────────────
// Ulam & Heichal (Middot 4) — and its holy vessels
// ─────────────────────────────────────────────────────────────
function buildHeichal(b, scene, out) {
  const U = ULAM, Hh = HEICHAL, S = ULAM_STEPS;
  const fy = Hh.floorY;
  // 12 steps up to the Ulam (Middot 3:6)
  const dx = (S.x0 - S.x1) / S.count;
  for (let i = 0; i < S.count; i++) {
    b.boxMM(MAT.stoneTrim, S.x0 - i * dx - dx, 0, -S.halfW, S.x1, (i + 1) * (S.topY / S.count), S.halfW, { collide: true });
  }
  // podium
  b.boxMM(MAT.stone, Hh.frontWallX0, 0, -U.halfW, U.frontX, fy - 0.02, U.halfW, { collide: true });
  b.boxMM(MAT.stone, Hh.bodyMinX, 0, -Hh.bodyHalfW, Hh.frontWallX0, fy - 0.02, Hh.bodyHalfW, { collide: true });
  // floors
  b.boxMM(MAT.marble, U.backX, fy - 0.1, -23, U.frontX, fy, 23, { collide: true });
  b.boxMM(MAT.marble, Hh.frontWallX0, fy - 0.1, -Hh.doorHalfW, Hh.frontWallX1, fy, Hh.doorHalfW, { collide: true });
  b.boxMM(MAT.marble, Hh.hallMinX, fy - 0.1, -Hh.hallHalfW, Hh.hallMaxX, fy, Hh.hallHalfW, { collide: true });

  // ── Ulam ──
  const ow = U.openHalfW, oy = U.openTopY;
  b.boxMM(MAT.marble, U.frontX - 1, fy, -U.halfW, U.frontX, U.topY, -ow, { collide: true });
  b.boxMM(MAT.marble, U.frontX - 1, fy, ow, U.frontX, U.topY, U.halfW, { collide: true });
  b.boxMM(MAT.marble, U.frontX - 1, oy, -ow, U.frontX, U.topY, ow, { collide: true });
  b.boxMM(MAT.marble, U.backX, fy, -U.halfW, U.frontX - 1, U.topY, -23, { collide: true });
  b.boxMM(MAT.marble, U.backX, fy, 23, U.frontX - 1, U.topY, U.halfW, { collide: true });
  b.boxMM(MAT.marble, U.backX, 40, -23, U.frontX - 1, U.topY, 23, { collide: true });
  // Golden facade — the whole front was plated with gold
  const fx = U.frontX, gt = 0.14;
  b.boxMM(MAT.goldRelief, fx, fy, -U.halfW, fx + gt, U.topY, -ow - 0.6);
  b.boxMM(MAT.goldRelief, fx, fy, ow + 0.6, fx + gt, U.topY, U.halfW);
  b.boxMM(MAT.goldRelief, fx, oy + 0.6, -ow - 0.6, fx + gt, U.topY, ow + 0.6);
  // door frame
  b.boxMM(MAT.gold, fx, fy, -ow - 0.6, fx + 0.35, oy + 0.6, -ow);
  b.boxMM(MAT.gold, fx, fy, ow, fx + 0.35, oy + 0.6, ow + 0.6);
  b.boxMM(MAT.gold, fx, oy, -ow - 0.6, fx + 0.35, oy + 0.6, ow + 0.6);
  // pilasters and cornices
  for (const z of [-24.4, -16, -9.2, 9.2, 16, 24.4]) b.boxMM(MAT.goldBright, fx, fy, z - 0.6, fx + 0.5, U.topY - 2, z + 0.6);
  for (const y of [fy + 0.0, 31, U.topY - 2.4]) b.boxMM(MAT.goldBright, fx - 0.2, y, -U.halfW - 0.3, fx + 0.7, y + 0.9, U.halfW + 0.3);
  b.boxMM(MAT.stoneTrim, U.backX - 0.4, U.topY, -U.halfW - 0.4, fx + 0.8, U.topY + 1.2, U.halfW + 0.4);
  // oak beams (milbanot) above the opening (Middot 3:7)
  for (const y of [oy + 1.6, oy + 2.8]) b.boxMM(MAT.cedar, fx, y, -ow - 1.5, fx + 0.6, y + 0.7, ow + 1.5);

  // Golden vine (gefen shel zahav) over the entrance — Middot 3:8
  const vineY = oy + 5.6;
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, z = -9 + t * 18;
    pts.push(new THREE.Vector3(fx + 0.45, vineY + Math.sin(t * Math.PI * 4) * 0.7, z));
  }
  const vine = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.14, 8);
  b.add(MAT.goldBright, vine, null, { uv: 'keep' });
  vine.dispose();
  const grape = new THREE.SphereGeometry(0.15, 8, 6);
  const leaf = new THREE.SphereGeometry(0.42, 8, 4); leaf.scale(1, 1, 0.25);
  const m = new THREE.Matrix4();
  for (let k = 0; k < 14; k++) {
    const t = (k + 0.5) / 14, z = -9 + t * 18;
    const y = vineY + Math.sin(t * Math.PI * 4) * 0.7;
    // cluster hanging down
    for (let g = 0; g < 14; g++) {
      const row = Math.floor(Math.sqrt(g * 2));
      const gy = y - 0.35 - row * 0.22, gz = z + (Math.random() - 0.5) * (0.6 - row * 0.1);
      m.makeTranslation(fx + 0.55 + Math.random() * 0.1, gy, gz);
      b.add(MAT.goldBright, grape, m, { uv: 'keep' });
    }
    m.makeRotationY(Math.PI / 2).setPosition(fx + 0.52, y + 0.45, z + 0.5);
    b.add(MAT.gold, leaf, m, { uv: 'keep' });
    m.makeRotationY(Math.PI / 2).setPosition(fx + 0.52, y + 0.2, z - 0.5);
    b.add(MAT.gold, leaf, m, { uv: 'keep' });
  }
  grape.dispose(); leaf.dispose();

  // Golden chains hanging inside the Ulam (Middot 3:8)
  for (const z of [-15, -10, 10, 15]) b.cyl(MAT.gold, -22.5, 26, z, 0.05, 0.05, 14, 6);
  // Two tables at the entrance for the Lechem HaPanim (Menachot 11:7) — marble and gold
  b.boxMM(MAT.marble, -22.9, fy, -4.6, -21.7, fy + 0.95, -2.8, { collide: true });
  b.boxMM(MAT.gold, -22.9, fy, 2.8, -21.7, fy + 0.95, 4.6, { collide: true });
  // Queen Helena's golden candelabrum above the Heichal door (Yoma 3:10)
  b.cyl(MAT.goldBright, Hh.frontWallX1 + 0.35, fy + 11.8, 0, 0.9, 0.9, 0.12, 24, { rz: Math.PI / 2 });
  out.nivreshet = new THREE.Vector3(Hh.frontWallX1 + 0.5, fy + 11.8, 0);

  // ── Heichal shell ──
  const hm = Hh.hallMinX, hx = Hh.hallMaxX, hw = Hh.hallHalfW, cy = Hh.ceilY;
  // front wall with the great door
  b.boxMM(MAT.marble, Hh.frontWallX0, fy, -U.halfW, Hh.frontWallX1, U.topY, -Hh.doorHalfW, { collide: true });
  b.boxMM(MAT.marble, Hh.frontWallX0, fy, Hh.doorHalfW, Hh.frontWallX1, U.topY, U.halfW, { collide: true });
  b.boxMM(MAT.marble, Hh.frontWallX0, Hh.doorTopY, -Hh.doorHalfW, Hh.frontWallX1, U.topY, Hh.doorHalfW, { collide: true });
  // the Heichal's front wall inside the Ulam is gold-plated too
  b.boxMM(MAT.goldRelief, Hh.frontWallX1, fy, -23, Hh.frontWallX1 + 0.06, 40, -Hh.doorHalfW - 2.6);
  b.boxMM(MAT.goldRelief, Hh.frontWallX1, fy, Hh.doorHalfW + 2.6, Hh.frontWallX1 + 0.06, 40, 23);
  b.boxMM(MAT.goldRelief, Hh.frontWallX1, Hh.doorTopY + 0.6, -Hh.doorHalfW - 2.6, Hh.frontWallX1 + 0.06, 40, Hh.doorHalfW + 2.6);
  // gilded door jambs and lintel through the thickness of the Heichal wall
  b.boxMM(MAT.goldRelief, Hh.frontWallX0, fy, -Hh.doorHalfW, Hh.frontWallX1, Hh.doorTopY, -Hh.doorHalfW + 0.05);
  b.boxMM(MAT.goldRelief, Hh.frontWallX0, fy, Hh.doorHalfW - 0.05, Hh.frontWallX1, Hh.doorTopY, Hh.doorHalfW);
  b.boxMM(MAT.goldRelief, Hh.frontWallX0, Hh.doorTopY - 0.05, -Hh.doorHalfW, Hh.frontWallX1, Hh.doorTopY, Hh.doorHalfW);
  // the Ulam's own opening is lined with gold as well
  b.boxMM(MAT.gold, U.frontX - 1, fy, -ow, U.frontX, oy, -ow + 0.05);
  b.boxMM(MAT.gold, U.frontX - 1, fy, ow - 0.05, U.frontX, oy, ow);
  b.boxMM(MAT.gold, U.frontX - 1, oy - 0.05, -ow, U.frontX, oy, ow);
  // golden doors on the outside of the Heichal door
  b.boxMM(MAT.gold, Hh.frontWallX1, fy, -Hh.doorHalfW - 2.6, Hh.frontWallX1 + 0.12, Hh.doorTopY, -Hh.doorHalfW);
  b.boxMM(MAT.gold, Hh.frontWallX1, fy, Hh.doorHalfW, Hh.frontWallX1 + 0.12, Hh.doorTopY, Hh.doorHalfW + 2.6);
  b.boxMM(MAT.goldBright, Hh.frontWallX1, Hh.doorTopY, -Hh.doorHalfW - 0.4, Hh.frontWallX1 + 0.3, Hh.doorTopY + 0.6, Hh.doorHalfW + 0.4);
  // side blocks around the hall, ceiling mass, western block (Kodesh HaKodashim behind the paroches)
  b.boxMM(MAT.marble, hm, fy, -Hh.bodyHalfW, hx, Hh.topY, -hw, { collide: true });
  b.boxMM(MAT.marble, hm, fy, hw, hx, Hh.topY, Hh.bodyHalfW, { collide: true });
  b.boxMM(MAT.marble, hm, cy, -hw, hx, Hh.topY, hw, { collide: true });
  b.boxMM(MAT.marble, Hh.bodyMinX, fy, -Hh.bodyHalfW, hm, Hh.topY, Hh.bodyHalfW, { collide: true });
  // exterior cornices, windows & roof spikes
  for (const y of [25, Hh.topY - 1]) {
    b.boxMM(MAT.goldBright, Hh.bodyMinX - 0.4, y, -Hh.bodyHalfW - 0.4, Hh.frontWallX0, y + 0.8, Hh.bodyHalfW + 0.4);
  }
  b.boxMM(MAT.stoneTrim, Hh.bodyMinX - 0.5, Hh.topY, -Hh.bodyHalfW - 0.5, Hh.frontWallX0, Hh.topY + 1.2, Hh.bodyHalfW + 0.5);
  for (let x = Hh.bodyMinX + 4; x < Hh.frontWallX0 - 2; x += 5) {
    for (const s of [-1, 1]) {
      b.boxMM(MAT.dark, x - 0.5, 34, s * Hh.bodyHalfW - 0.06, x + 0.5, 39, s * Hh.bodyHalfW + 0.06, { shadow: false });
      b.boxMM(MAT.dark, x - 0.5, 14, s * Hh.bodyHalfW - 0.06, x + 0.5, 18, s * Hh.bodyHalfW + 0.06, { shadow: false });
    }
  }
  // kalah orev — golden spikes so birds would not perch (Middot 4:6)
  const spike = new THREE.ConeGeometry(0.1, 1.2, 5);
  const addSpikes = (ax, az, bx, bz, y) => {
    const n = Math.floor(Math.hypot(bx - ax, bz - az) / 1.1);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      m.makeTranslation(ax + (bx - ax) * t, y + 0.6, az + (bz - az) * t);
      b.add(MAT.goldBright, spike, m, { shadow: false });
    }
  };
  addSpikes(fx + 0.5, -U.halfW, fx + 0.5, U.halfW, U.topY + 1.2);
  addSpikes(Hh.bodyMinX, -Hh.bodyHalfW, Hh.frontWallX0, -Hh.bodyHalfW, Hh.topY + 1.2);
  addSpikes(Hh.bodyMinX, Hh.bodyHalfW, Hh.frontWallX0, Hh.bodyHalfW, Hh.topY + 1.2);
  addSpikes(Hh.bodyMinX, -Hh.bodyHalfW, Hh.bodyMinX, Hh.bodyHalfW, Hh.topY + 1.2);
  spike.dispose();

  // ── Heichal interior ──
  const L = 0.08;
  b.boxMM(MAT.goldRelief, hm, fy, -hw, hx, cy, -hw + L);
  b.boxMM(MAT.goldRelief, hm, fy, hw - L, hx, cy, hw);
  b.boxMM(MAT.goldRelief, hx - L, fy, -hw, hx, cy, -Hh.doorHalfW);
  b.boxMM(MAT.goldRelief, hx - L, fy, Hh.doorHalfW, hx, cy, hw);
  b.boxMM(MAT.goldRelief, hx - L, Hh.doorTopY, -Hh.doorHalfW, hx, cy, Hh.doorHalfW);
  b.boxMM(MAT.cedar, hm, cy - 0.1, -hw, hx, cy, hw, { shadow: false });
  for (let x = hm + 1; x < hx; x += 2) b.boxMM(MAT.cedar, x - 0.25, cy - 0.7, -hw, x + 0.25, cy - 0.1, hw, { shadow: false });
  // inner doors folded back
  b.boxMM(MAT.gold, hx - 2.6, fy, -Hh.doorHalfW - 0.14, hx, fy + 10, -Hh.doorHalfW);
  b.boxMM(MAT.gold, hx - 2.6, fy, Hh.doorHalfW, hx, fy + 10, Hh.doorHalfW + 0.14);
  // windows: "wide outside, narrow inside" (Menachot 86b) — glowing slits
  const winMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0 });
  out.windowMat = winMat;
  out.shafts = [];
  for (let x = hm + 3; x < hx - 2; x += 4.5) {
    for (const s of [-1, 1]) {
      const z = s * (hw - L - 0.01);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.4), winMat);
      w.position.set(x, 19.5, z); w.rotation.y = s > 0 ? Math.PI : 0;
      scene.add(w);
    }
  }
  // Paroches (two curtains — Yoma 5:1)
  for (const off of [0, 0.3]) {
    const pg = new THREE.PlaneGeometry(2 * hw, cy - fy, 40, 1);
    const pp = pg.attributes.position;
    for (let i = 0; i < pp.count; i++) pp.setZ(i, Math.sin(pp.getX(i) * 4.2 + off * 3) * 0.08);
    pg.computeVertexNormals();
    const pm = new THREE.Mesh(pg, MAT.paroches);
    pm.rotation.y = Math.PI / 2;
    pm.position.set(hm + 0.25 + off, (fy + cy) / 2, 0);
    pm.receiveShadow = true;
    scene.add(pm);
  }
  b.physics.addBox(hm - 1, fy, -hw, hm + 0.8, cy, hw, false);

  // Menorah — 18 tefachim, 7 lamps facing the middle (Menachot 28b)
  const mz = P.menorah.z, mx = P.menorah.x;
  // the stone with 3 steps in front of it (Tamid 3:9)
  for (let i = 0; i < 3; i++) b.boxMM(MAT.marble, mx - 0.6, fy, mz - 1.5 + i * 0.3, mx + 0.6, fy + 0.18 * (i + 1), mz - 0.6, { collide: true });
  const baseY = fy;
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI * 2 / 3;
    b.box(MAT.goldBright, mx + Math.cos(a) * 0.22, baseY + 0.18, mz + Math.sin(a) * 0.22, 0.12, 0.36, 0.12, { ry: -a });
  }
  b.cyl(MAT.goldBright, mx, baseY + 0.3, mz, 0.06, 0.16, 0.25, 12);
  const shaftTop = baseY + 2.2;
  b.cyl(MAT.goldBright, mx, baseY + 0.5, mz, 0.06, 0.06, shaftTop - baseY - 0.5, 12);
  const knob = new THREE.SphereGeometry(0.1, 10, 8);
  const cup = new THREE.ConeGeometry(0.075, 0.16, 10); cup.rotateX(Math.PI);
  for (const y of [0.9, 1.35, 1.65, 1.95]) { m.makeTranslation(mx, baseY + y, mz); b.add(MAT.goldBright, knob, m, { uv: 'keep' }); }
  const radii = [0.24, 0.48, 0.72];
  for (const r of radii) {
    const arc = new THREE.TorusGeometry(r, 0.045, 8, 28, Math.PI);
    arc.rotateZ(Math.PI);
    m.makeTranslation(mx, shaftTop, mz);
    b.add(MAT.goldBright, arc, m, { uv: 'keep' });
    arc.dispose();
    for (const s of [-1, 1]) {
      m.makeTranslation(mx + s * r * 0.71, shaftTop - r * 0.71, mz);
      b.add(MAT.goldBright, knob, m, { uv: 'keep' });
    }
  }
  out.menorahLamps = [];
  const lampXs = [-0.72, -0.48, -0.24, 0, 0.24, 0.48, 0.72];
  for (let i = 0; i < 7; i++) {
    const lx = mx + lampXs[i];
    m.makeTranslation(lx, shaftTop + 0.1, mz); b.add(MAT.goldBright, cup, m, { uv: 'keep' });
    b.cyl(MAT.goldBright, lx, shaftTop + 0.16, mz, 0.09, 0.05, 0.07, 12);
    out.menorahLamps.push(new THREE.Vector3(lx, shaftTop + 0.3, mz));
  }
  knob.dispose(); cup.dispose();
  b.physics.addBox(mx - 0.85, fy, mz - 0.4, mx + 0.85, fy + 2.6, mz + 0.4, false);

  // Shulchan — gold table with 12 loaves (Menachot 11)
  const sx = P.shulchan.x, sz = P.shulchan.z, tY = fy + 0.95;
  b.boxMM(MAT.goldBright, sx - 0.55, tY - 0.06, sz - 0.3, sx + 0.55, tY, sz + 0.3);
  b.boxMM(MAT.goldBright, sx - 0.55, tY - 0.2, sz - 0.3, sx + 0.55, tY - 0.12, sz + 0.3);
  for (const [ox, oz] of [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]]) b.boxMM(MAT.goldBright, sx + ox - 0.04, fy, sz + oz - 0.04, sx + ox + 0.04, tY, sz + oz + 0.04);
  const loafMat = new THREE.MeshStandardMaterial({ color: 0xd8a25a, roughness: 0.85 });
  for (const ox of [-0.27, 0.27]) for (let i = 0; i < 6; i++) {
    b.boxMM(loafMat, sx + ox - 0.22, tY + i * 0.11, sz - 0.24, sx + ox + 0.22, tY + i * 0.11 + 0.08, sz + 0.24);
  }
  for (const ox of [-0.27, 0.27]) b.cyl(MAT.goldBright, sx + ox, tY + 0.66, sz, 0.08, 0.06, 0.08, 10);
  b.physics.addBox(sx - 0.6, fy, sz - 0.35, sx + 0.6, fy + 1.7, sz + 0.35, false);

  // Mizbeach HaZahav — the golden incense altar (Shemot 30)
  const gx = P.goldAltar.x, gz = P.goldAltar.z;
  b.boxMM(MAT.goldBright, gx - 0.3, fy, gz - 0.3, gx + 0.3, fy + 1.0, gz + 0.3, { collide: true, cam: false });
  b.boxMM(MAT.gold, gx - 0.34, fy + 0.86, gz - 0.34, gx + 0.34, fy + 0.94, gz + 0.34);
  for (const [ox, oz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) b.boxMM(MAT.goldBright, gx + ox * 0.26 - 0.04, fy + 1.0, gz + oz * 0.26 - 0.04, gx + ox * 0.26 + 0.04, fy + 1.1, gz + oz * 0.26 + 0.04);
  out.goldAltarTop = new THREE.Vector3(gx, fy + 1.02, gz);
}
