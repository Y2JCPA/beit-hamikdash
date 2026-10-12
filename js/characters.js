// Characters (cute, rounded "chibi" style), animals and hand-held vessels.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAT, TEX } from './materials.js';

// ── Baking: merge a group's rigid meshes into a few vertex-coloured meshes ──
// (a character goes from ~30 draw calls to ~6)
const BAKE = {};
function bakeMat(cls) {
  if (!BAKE[cls]) {
    BAKE[cls] = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: cls === 'metal' ? 0.25 : cls === 'gloss' ? 0.3 : 0.82,
      metalness: cls === 'metal' ? 1 : 0,
      side: cls === 'double' ? THREE.DoubleSide : THREE.FrontSide,
    });
  }
  return BAKE[cls];
}
export function setBakedEnvMap(tex) { for (const k in BAKE) if (BAKE[k].metalness > 0.5) { BAKE[k].envMap = tex; BAKE[k].envMapIntensity = 0.9; BAKE[k].needsUpdate = true; } }
// free the GPU buffers of baked meshes (shared geometries are left alone)
export function disposeBaked(obj) {
  obj?.traverse(o => { if (o.isMesh && o.userData.baked) o.geometry.dispose(); });
}
export function bakeGroup(group, shadow = true) {
  const buckets = {};
  const remove = [];
  for (const child of group.children) {
    if (!child.isMesh || child.userData.noBake) continue;
    child.updateMatrix();
    const g = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    g.applyMatrix4(child.matrix);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const m = child.material;
    const c = m.color || new THREE.Color(1, 1, 1);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const cls = m.metalness > 0.5 ? 'metal' : m.side === THREE.DoubleSide ? 'double' : m.roughness < 0.35 ? 'gloss' : 'matte';
    (buckets[cls] ||= []).push(g);
    remove.push(child);
  }
  remove.forEach(c => group.remove(c));
  for (const cls in buckets) {
    const merged = mergeGeometries(buckets[cls], false);
    buckets[cls].forEach(g => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, bakeMat(cls));
    mesh.userData.baked = true;
    mesh.castShadow = shadow;
    group.add(mesh);
  }
  return group;
}

const matCache = new Map();
export function std(color, opts = {}) {
  // (never JSON.stringify a texture: that encodes the whole image — it made loading seconds slower)
  const key = color + '|' + Object.keys(opts).sort().map(k => k + ':' + (opts[k]?.isTexture ? opts[k].uuid : opts[k])).join(',');
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...opts }));
  return matCache.get(key);
}
function mesh(geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  return m;
}

// Shared geometries
const GEO = {};
function geo() {
  if (GEO.head) return GEO;
  GEO.head = new THREE.SphereGeometry(0.26, 24, 18);
  GEO.eye = new THREE.SphereGeometry(0.042, 10, 8);
  GEO.glint = new THREE.SphereGeometry(0.014, 6, 4);
  GEO.cheek = new THREE.SphereGeometry(0.05, 10, 6); GEO.cheek.scale(1, 0.6, 0.3);
  GEO.smile = new THREE.TorusGeometry(0.05, 0.013, 6, 14, Math.PI); GEO.smile.rotateZ(Math.PI);
  GEO.nose = new THREE.SphereGeometry(0.03, 8, 6);
  GEO.arm = new THREE.CapsuleGeometry(0.068, 0.3, 4, 10); GEO.arm.translate(0, -0.2, 0);
  GEO.hand = new THREE.SphereGeometry(0.072, 10, 8);
  GEO.foot = new THREE.SphereGeometry(0.075, 10, 8); GEO.foot.scale(1, 0.55, 1.5);
  const prof = [[0.3, 0.0], [0.31, 0.04], [0.28, 0.3], [0.235, 0.62], [0.215, 0.85], [0.19, 1.02], [0.12, 1.1], [0.0, 1.12]].map(([x, y]) => new THREE.Vector2(x, y));
  GEO.robe = new THREE.LatheGeometry(prof, 28);
  const meil = [[0.34, 0.14], [0.35, 0.18], [0.3, 0.42], [0.25, 0.68], [0.225, 0.88], [0.2, 1.03], [0.13, 1.11], [0.0, 1.13]].map(([x, y]) => new THREE.Vector2(x, y));
  GEO.meil = new THREE.LatheGeometry(meil, 28);
  GEO.sash = new THREE.CylinderGeometry(0.228, 0.236, 0.1, 28, 1, true);
  GEO.sashEnd = new THREE.BoxGeometry(0.025, 0.36, 0.02);
  GEO.band = new THREE.CylinderGeometry(0.229, 0.231, 0.0185, 28, 1, true);
  GEO.turbanRing = new THREE.TorusGeometry(0.2, 0.065, 10, 24); GEO.turbanRing.rotateX(Math.PI / 2);
  GEO.dome = new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  GEO.hairBack = new THREE.SphereGeometry(0.272, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
  GEO.beard = new THREE.SphereGeometry(0.2, 14, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55); GEO.beard.scale(1.05, 1.0, 0.9);
  GEO.cap = new THREE.SphereGeometry(0.27, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.42);
  GEO.scarf = new THREE.SphereGeometry(0.29, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62);
  GEO.drape = new THREE.CylinderGeometry(0.2, 0.3, 0.5, 18, 1, true, Math.PI * 0.6, Math.PI * 1.8);
  GEO.pom = new THREE.SphereGeometry(0.035, 8, 6);
  GEO.bell = new THREE.SphereGeometry(0.03, 8, 6);
  GEO.gem = new THREE.BoxGeometry(0.06, 0.05, 0.03);
  return GEO;
}

export const SKIN_TONES = [0xf3d0b0, 0xe8b98f, 0xd39a6a, 0xa8714a, 0x7a4d2e];
export const HAIR_COLORS = [0x2a1b10, 0x5a3a1e, 0x8a5a2b, 0xc89a52, 0x1a1a1a];

/**
 * opts: { role:'kohen'|'kohenGadol'|'levi'|'yisrael'|'woman'|'child', skin, hair, beard:bool, robe, accent, scale }
 */
export function makeCharacter(opts = {}) {
  const G = geo();
  const role = opts.role || 'yisrael';
  const skinM = std(opts.skin ?? SKIN_TONES[1], { roughness: 0.65 });
  const hairM = std(opts.hair ?? HAIR_COLORS[0], { roughness: 0.9 });
  const isKohen = role === 'kohen' || role === 'kohenGadol';
  const robeM = isKohen ? std(0xfbf8f2, { map: TEX.linen, roughness: 0.85 }) : std(opts.robe ?? 0x9b6b43, { roughness: 0.9 });

  const root = new THREE.Group();
  const body = new THREE.Group();          // bends at the hips for bowing
  body.position.y = 0.0;
  root.add(body);

  const robe = mesh(G.robe, robeM, 0, 0.02, 0);
  body.add(robe);

  if (role === 'kohenGadol') {
    // Me'il — techelet robe with pomegranates and golden bells on the hem (Shemot 28:31-35)
    const meil = mesh(G.meil, std(0x1f3f9e, { roughness: 0.7 }), 0, 0.02, 0);
    body.add(meil);
    const pomM = [std(0x2346a8), std(0x6b2a8c), std(0xc0283a)];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, r = 0.345;
      const isBell = i % 2 === 0;
      const m = mesh(isBell ? G.bell : G.pom, isBell ? MAT.goldBright : pomM[(i >> 1) % 3], Math.sin(a) * r, 0.13, Math.cos(a) * r, false);
      body.add(m);
    }
    // Ephod (gold, techelet, argaman, shani) and Choshen with 12 stones
    const ephod = mesh(new THREE.CylinderGeometry(0.236, 0.27, 0.32, 28, 1, true), std(0xd9a93a, { metalness: 0.6, roughness: 0.35, map: TEX.avnet }), 0, 0.62, 0);
    body.add(ephod);
    const choshen = mesh(new THREE.BoxGeometry(0.22, 0.24, 0.03), MAT.gold, 0, 0.9, 0.205);
    choshen.rotation.x = -0.16;
    body.add(choshen);
    const gems = [0xc0392b, 0xf1c40f, 0x27ae60, 0x2ecc71, 0x2980b9, 0xecf0f1, 0xe67e22, 0x8e44ad, 0x7f8c8d, 0x16a085, 0x34495e, 0x1abc9c];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      const g = mesh(G.gem, std(gems[r * 3 + c], { roughness: 0.15, metalness: 0.1, emissive: gems[r * 3 + c], emissiveIntensity: 0.25 }), (c - 1) * 0.065, 0.99 - r * 0.058, 0.224, false);
      g.rotation.x = -0.16;
      body.add(g);
    }
    for (const s of [-1, 1]) body.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), std(0x2b2b2b, { roughness: 0.2, metalness: 0.3 }), s * 0.13, 1.06, 0.03, false));
  } else if (role === 'kohen') {
    // Avnet — the sash of techelet, argaman & tola'at shani wool with linen (Yoma 12b)
    const bands = [0x2346a8, 0xf2ede0, 0x6b2a8c, 0xf2ede0, 0xc0283a, 0xf2ede0];
    bands.forEach((c, i) => body.add(mesh(G.band, std(c, { roughness: 0.8 }), 0, 0.67 + i * 0.0185, 0)));
    bands.slice(0, 3).forEach((c, i) => {
      const e = mesh(G.sashEnd, std(c), 0.08 + i * 0.025, 0.52, 0.236, false);
      e.rotation.z = 0.12;
      body.add(e);
    });
  } else if (role === 'levi') {
    body.add(mesh(G.sash, std(opts.accent ?? 0xc6a052, { roughness: 0.7 }), 0, 0.72, 0));
  } else {
    // a woollen mantle with a coloured stripe for Yisraelim
    body.add(mesh(G.sash, std(opts.accent ?? 0x5a4a3a), 0, 0.72, 0));
  }

  // Head
  const head = new THREE.Group();
  head.position.y = 1.36;
  body.add(head);
  head.add(mesh(G.head, skinM));
  const eyeM = std(0x1d1410, { roughness: 0.3 }), glintM = std(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.5 });
  for (const s of [-1, 1]) {
    head.add(mesh(G.eye, eyeM, s * 0.092, 0.025, 0.225, false));
    head.add(mesh(G.glint, glintM, s * 0.092 + 0.014, 0.042, 0.262, false));
    const ch = mesh(G.cheek, std(0xf6ab9e, { roughness: 1 }), s * 0.155, -0.045, 0.2, false);
    head.add(ch);
  }
  head.add(mesh(G.nose, std(new THREE.Color(opts.skin ?? SKIN_TONES[1]).multiplyScalar(0.92).getHex()), 0, -0.01, 0.255, false));
  const smile = mesh(G.smile, std(0x5a2a1a), 0, -0.075, 0.235, false);
  head.add(smile);
  const hairBack = mesh(G.hairBack, hairM, 0, 0.0, -0.012);
  hairBack.rotation.x = -0.55;
  head.add(hairBack);
  if (opts.beard) head.add(mesh(G.beard, hairM, 0, -0.06, 0.06));

  // Headwear
  if (role === 'kohen') {
    // Migba'at — wound linen turban
    const tm = std(0xfbf8f2, { map: TEX.linen, roughness: 0.85 });
    for (let i = 0; i < 3; i++) {
      const r = mesh(G.turbanRing, tm, 0, 0.14 + i * 0.075, 0);
      r.scale.setScalar(1.12 - i * 0.07);
      head.add(r);
    }
    head.add(mesh(G.dome, tm, 0, 0.27, 0));
  } else if (role === 'kohenGadol') {
    const tm = std(0xfbf8f2, { map: TEX.linen, roughness: 0.85 });
    for (let i = 0; i < 3; i++) {
      const r = mesh(G.turbanRing, tm, 0, 0.14 + i * 0.07, 0);
      r.scale.set(1.25 - i * 0.04, 1, 1.25 - i * 0.04);
      head.add(r);
    }
    head.add(mesh(G.dome, tm, 0, 0.27, 0));
    // Tzitz: "Kodesh LaHashem" golden plate with a techelet cord
    const tz = mesh(new THREE.BoxGeometry(0.24, 0.06, 0.02), MAT.goldBright, 0, 0.13, 0.27, false);
    head.add(tz);
    const cord = mesh(new THREE.TorusGeometry(0.262, 0.01, 6, 30), std(0x2346a8), 0, 0.13, 0, false);
    cord.rotation.x = Math.PI / 2;
    head.add(cord);
  } else if (role === 'levi') {
    head.add(mesh(G.cap, std(opts.accent2 ?? 0xf3ead6), 0, 0.06, 0));
  } else if (role === 'woman') {
    head.add(mesh(G.scarf, std(opts.accent ?? 0x8a3b4a, { roughness: 0.9 }), 0, -0.02, -0.01));
    const d = mesh(G.drape, std(opts.accent ?? 0x8a3b4a, { roughness: 0.9, side: THREE.DoubleSide }), 0, -0.3, -0.02);
    head.add(d);
  } else {
    head.add(mesh(G.cap, std(opts.accent2 ?? 0xe9dfca), 0, 0.07, 0));
  }

  // Arms
  const arms = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.215, 0.98, 0);
    const arm = mesh(G.arm, role === 'kohenGadol' ? std(0x1f3f9e) : robeM);
    pivot.add(arm);
    const hand = mesh(G.hand, skinM, 0, -0.42, 0);
    pivot.add(hand);
    pivot.rotation.z = s * 0.12;
    body.add(pivot);
    arms.push(pivot);
  }
  // Feet (Kohanim served barefoot)
  const feet = [];
  const footM = isKohen || role === 'levi' ? skinM : std(0x6b4a2b);
  for (const s of [-1, 1]) {
    const f = mesh(G.foot, footM, s * 0.11, 0.035, 0.08);
    root.add(f);
    feet.push(f);
  }
  // Anchor for held items (in front of the chest)
  const holder = new THREE.Group();
  holder.position.set(0, 0.86, 0.36);
  body.add(holder);

  const sc = opts.scale ?? 1;
  root.scale.setScalar(sc);
  bakeGroup(body); bakeGroup(head, false); arms.forEach(a => bakeGroup(a));
  root.traverse(o => { if (o.isMesh) o.receiveShadow = false; });

  const ch = {
    group: root, body, head, arms, feet, holder, role,
    phase: Math.random() * 10, t: Math.random() * 10,
    pose: 'idle', bow: 0, raise: 0, carry: 0, work: 0, held: null,
    speed: 0,
    setHeld(obj) {
      if (this.held) holder.remove(this.held);
      this.held = obj || null;
      if (obj) holder.add(obj);
    },
    update(dt, speed = 0) {
      this.t += dt;
      this.speed = speed;
      const moving = speed > 0.3;
      this.phase += dt * (moving ? 2.4 + speed * 1.15 : 0);
      const sw = moving ? Math.sin(this.phase) : 0;
      const tgtBow = this.pose === 'bow' ? 0.85 : 0;
      const tgtRaise = this.pose === 'raise' ? 1 : 0;
      const tgtCarry = this.held || this.pose === 'carry' ? 1 : 0;
      const tgtWork = this.pose === 'work' ? 1 : 0;
      const k = Math.min(1, dt * 6);
      this.bow += (tgtBow - this.bow) * k;
      this.raise += (tgtRaise - this.raise) * k;
      this.carry += (tgtCarry - this.carry) * k;
      this.work += (tgtWork - this.work) * k;
      // body bob / breathe / bow
      body.position.y = moving ? Math.abs(Math.sin(this.phase)) * 0.045 : Math.sin(this.t * 2) * 0.006;
      body.rotation.x = this.bow + (moving ? 0.06 : 0);
      body.rotation.z = moving ? Math.sin(this.phase) * 0.035 : 0;
      head.rotation.y = moving ? 0 : Math.sin(this.t * 0.4) * 0.18 * (1 - this.raise);
      head.rotation.x = -this.raise * 0.15;
      // feet
      feet[0].position.z = 0.08 + sw * 0.17; feet[1].position.z = 0.08 - sw * 0.17;
      feet[0].position.y = 0.035 + Math.max(0, sw) * 0.06; feet[1].position.y = 0.035 + Math.max(0, -sw) * 0.06;
      // arms
      for (let i = 0; i < 2; i++) {
        const s = i === 0 ? -1 : 1;
        const swing = -sw * s * 0.55 * (1 - this.carry) * (1 - this.raise);
        const workBob = this.work * Math.sin(this.t * 9 + i) * 0.35;
        arms[i].rotation.x = swing - this.carry * 1.15 - this.raise * 2.75 - this.work * 1.0 + workBob;
        arms[i].rotation.z = s * (0.12 + this.raise * 0.42 - this.carry * 0.28);
      }
      holder.position.y = 0.86 + (moving ? Math.abs(Math.sin(this.phase)) * 0.02 : 0);
    },
  };
  ch.update(0, 0);
  return ch;
}

// ─────────────────────────────────────────────────────────
// Animals
// ─────────────────────────────────────────────────────────
function fluffy(rx, ry, rz, color, seed = 1) {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + 0.09 * Math.sin(x * 9 + seed) * Math.sin(y * 8 + seed * 2) * Math.sin(z * 9 + seed * 3) + 0.05 * Math.sin(x * 23 + y * 19 + z * 17);
    p.setXYZ(i, x * rx * n, y * ry * n, z * rz * n);
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, std(color, { roughness: 1, flatShading: false }));
}

export function makeAnimal(type) {
  const root = new THREE.Group();
  const legs = [];
  let bodyH = 0.55, headZ = 0.6;
  const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; root.add(m); return m; };
  const eyeM = std(0x111111, { roughness: 0.3 });
  if (type === 'keves' || type === 'lamb' || type === 'ayil') {
    const s = type === 'lamb' ? 0.85 : type === 'ayil' ? 1.2 : 1;
    if (type === 'ayil') {
      // a ram: bigger, with curled horns
      for (const x of [-1, 1]) {
        const horn = add(new THREE.Mesh(new THREE.TorusGeometry(0.1 * s, 0.035 * s, 7, 14, Math.PI * 1.5), std(0xbfae8a, { roughness: 0.7 })), x * 0.15 * s, 0.8 * s, 0.44 * s);
        horn.rotation.set(0, x * Math.PI / 2, 0.4);
      }
    }
    add(fluffy(0.36 * s, 0.3 * s, 0.5 * s, 0xf6f0e2, 3), 0, 0.55 * s, 0);
    for (let i = 0; i < 5; i++) add(fluffy(0.14 * s, 0.12 * s, 0.14 * s, 0xfbf6ea, i), (Math.random() - 0.5) * 0.4 * s, 0.78 * s, (Math.random() - 0.5) * 0.6 * s);
    const head = add(new THREE.Mesh(new THREE.SphereGeometry(0.17 * s, 14, 10), std(0x3a2f2a)), 0, 0.72 * s, 0.5 * s);
    head.scale.set(0.9, 1, 1.25);
    add(fluffy(0.14 * s, 0.1 * s, 0.13 * s, 0xfbf6ea, 9), 0, 0.86 * s, 0.44 * s);
    for (const x of [-1, 1]) {
      const ear = add(new THREE.Mesh(new THREE.SphereGeometry(0.08 * s, 8, 6), std(0x3a2f2a)), x * 0.17 * s, 0.76 * s, 0.45 * s);
      ear.scale.set(1.4, 0.45, 0.7);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.03 * s, 8, 6), std(0xffffff, { emissive: 0x333333 })), x * 0.08 * s, 0.77 * s, 0.67 * s);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.018 * s, 6, 4), eyeM), x * 0.08 * s, 0.775 * s, 0.695 * s);
    }
    bodyH = 0.36 * s;
    for (const [x, z] of [[-0.17, 0.3], [0.17, 0.3], [-0.17, -0.3], [0.17, -0.3]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * s, 0.04 * s, bodyH, 8), std(0x3a2f2a));
      leg.geometry.translate(0, -bodyH / 2, 0);
      add(leg, x * s, bodyH + 0.02, z * s);
      legs.push(leg);
    }
    add(fluffy(0.08 * s, 0.08 * s, 0.08 * s, 0xfbf6ea, 4), 0, 0.62 * s, -0.5 * s);
  } else if (type === 'ez') {
    const body = add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), std(0x6b4a33, { roughness: 0.95 })), 0, 0.62, 0);
    body.scale.set(0.8, 0.75, 1.3);
    const head = add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), std(0x5a3d29)), 0, 0.92, 0.5);
    head.scale.set(0.85, 1, 1.35);
    for (const x of [-1, 1]) {
      const horn = add(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 12, Math.PI * 0.8), std(0xcfc3a8)), x * 0.07, 1.06, 0.42);
      horn.rotation.set(0, Math.PI / 2, 0.6);
      const ear = add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), std(0x4a3222)), x * 0.15, 0.95, 0.46);
      ear.scale.set(1.6, 0.4, 0.6);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), eyeM), x * 0.075, 0.97, 0.66);
    }
    const beard = add(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 8), std(0x3a2a1c)), 0, 0.76, 0.66);
    beard.rotation.x = Math.PI;
    bodyH = 0.45;
    for (const [x, z] of [[-0.16, 0.3], [0.16, 0.3], [-0.16, -0.3], [0.16, -0.3]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, bodyH, 8), std(0x4a3222));
      leg.geometry.translate(0, -bodyH / 2, 0);
      add(leg, x, bodyH + 0.02, z); legs.push(leg);
    }
  } else if (type === 'par' || type === 'ox') {
    const col = 0x8a5634;
    const body = add(new THREE.Mesh(new THREE.SphereGeometry(0.6, 18, 14), std(col, { roughness: 0.9 })), 0, 1.05, 0);
    body.scale.set(0.85, 0.75, 1.45);
    const head = add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12), std(0x7a4a2c)), 0, 1.25, 0.95);
    head.scale.set(0.95, 0.95, 1.2);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), std(0xd8a58a)), 0, 1.15, 1.22).scale.set(1.2, 0.8, 0.6);
    const hornM = type === 'ox' ? MAT.goldBright : std(0xefe6d0);
    for (const x of [-1, 1]) {
      const horn = add(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 8), hornM), x * 0.27, 1.46, 0.9);
      horn.rotation.z = -x * 0.9;
      add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), eyeM), x * 0.14, 1.32, 1.17);
      const ear = add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), std(0x6a3f25)), x * 0.3, 1.33, 0.84);
      ear.scale.set(1.5, 0.5, 0.6);
    }
    if (type === 'ox') {
      // olive wreath for the Bikkurim procession (Bikkurim 3:3)
      const wreath = add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 16), std(0x6f8a4a)), 0, 1.5, 0.9);
      wreath.rotation.x = Math.PI / 2;
    }
    bodyH = 0.72;
    for (const [x, z] of [[-0.28, 0.5], [0.28, 0.5], [-0.28, -0.5], [0.28, -0.5]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.075, bodyH, 8), std(0x6a3f25));
      leg.geometry.translate(0, -bodyH / 2, 0);
      add(leg, x, bodyH + 0.02, z); legs.push(leg);
    }
  } else if (type === 'tor') {
    const body = add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), std(0xf4f1ea)), 0, 0.1, 0);
    body.scale.set(0.85, 0.8, 1.3);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), std(0xf4f1ea)), 0, 0.2, 0.12);
    const beak = add(new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 6), std(0xe39a6a)), 0, 0.19, 0.2);
    beak.rotation.x = Math.PI / 2;
    for (const x of [-1, 1]) {
      add(new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), eyeM), x * 0.045, 0.22, 0.17);
      const w = add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 6), std(0xe6e0d4)), x * 0.09, 0.12, -0.02);
      w.scale.set(0.35, 0.6, 1.2);
    }
  }
  legs.forEach(l => { l.userData.noBake = true; });
  bakeGroup(root);
  const animal = {
    group: root, legs, type, phase: Math.random() * 6, t: Math.random() * 6,
    update(dt, speed = 0) {
      this.t += dt;
      const moving = speed > 0.2;
      this.phase += dt * (moving ? 5 + speed * 2 : 0);
      legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(this.phase + (i % 2 === (i < 2 ? 0 : 1) ? 0 : Math.PI)) * 0.5 : 0; });
      root.position.y = (this.baseY || 0) + (moving ? Math.abs(Math.sin(this.phase)) * 0.04 : 0);
    },
  };
  return animal;
}

// ─────────────────────────────────────────────────────────
// Hand-held vessels & items
// ─────────────────────────────────────────────────────────
export function makeItem(kind) {
  const g = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  switch (kind) {
    case 'mizrak': {
      // Mizrak — a pointed-bottom gold bowl (so it could not be set down — Pesachim 64a)
      const prof = [[0.0, -0.16], [0.06, -0.12], [0.13, -0.02], [0.17, 0.08], [0.18, 0.1], [0.16, 0.1]].map(([x, y]) => new THREE.Vector2(x, y));
      add(new THREE.LatheGeometry(prof, 20), new THREE.MeshStandardMaterial({ color: 0xffcf66, metalness: 1, roughness: 0.2, side: THREE.DoubleSide }));
      const fill = add(new THREE.CircleGeometry(0.155, 20), MAT.blood, 0, 0.07, 0);
      fill.rotation.x = -Math.PI / 2;
      g.userData.fill = fill;
      break;
    }
    case 'machta': {
      add(new THREE.CylinderGeometry(0.22, 0.18, 0.08, 20), MAT.silver, 0, 0, 0);
      add(new THREE.BoxGeometry(0.05, 0.04, 0.55), MAT.silver, 0, 0.02, -0.4);
      const coal = add(new THREE.SphereGeometry(0.18, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), MAT.ember, 0, 0.03, 0);
      coal.scale.y = 0.4;
      coal.visible = false;
      g.userData.coal = coal;
      break;
    }
    case 'machtaGold': {
      add(new THREE.CylinderGeometry(0.2, 0.17, 0.08, 20), MAT.goldBright, 0, 0, 0);
      add(new THREE.BoxGeometry(0.05, 0.04, 0.5), MAT.goldBright, 0, 0.02, -0.36);
      const coal = add(new THREE.SphereGeometry(0.16, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), MAT.ember, 0, 0.03, 0);
      coal.scale.y = 0.4;
      g.userData.coal = coal;
      break;
    }
    case 'logs': {
      for (const [x, y] of [[-0.12, 0], [0.12, 0], [0, 0.15]]) {
        const l = add(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 8), MAT.wood, x, y, 0);
        l.rotation.z = Math.PI / 2;
      }
      break;
    }
    case 'eivarim': {
      add(new THREE.CylinderGeometry(0.34, 0.3, 0.05, 24), MAT.goldBright, 0, 0, 0);
      const cloth = add(new THREE.SphereGeometry(0.28, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0xf3ece0, { map: TEX.linen }), 0, 0.02, 0);
      cloth.scale.y = 0.55;
      break;
    }
    case 'kaf': {
      add(new THREE.CylinderGeometry(0.16, 0.12, 0.08, 18), MAT.goldBright, 0, 0, 0);
      const k = add(new THREE.SphereGeometry(0.15, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), std(0x6b3f22, { roughness: 1 }), 0, 0.03, 0);
      k.scale.y = 0.5;
      add(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 18), MAT.goldBright, 0, 0.12, 0).visible = true;
      break;
    }
    case 'wine': {
      add(new THREE.CylinderGeometry(0.1, 0.14, 0.3, 16), MAT.silver, 0, 0.05, 0);
      add(new THREE.CylinderGeometry(0.05, 0.08, 0.1, 12), MAT.silver, 0, 0.25, 0);
      break;
    }
    case 'cup': {
      add(new THREE.CylinderGeometry(0.09, 0.06, 0.14, 16), MAT.goldBright, 0, 0, 0);
      break;
    }
    case 'oil': {
      add(new THREE.SphereGeometry(0.11, 14, 10), MAT.goldBright, 0, 0.02, 0);
      const sp = add(new THREE.CylinderGeometry(0.02, 0.03, 0.16, 8), MAT.goldBright, 0, 0.08, 0.1);
      sp.rotation.x = 0.9;
      break;
    }
    case 'mincha': {
      add(new THREE.CylinderGeometry(0.25, 0.2, 0.1, 20), MAT.silver, 0, 0, 0);
      const flour = add(new THREE.SphereGeometry(0.22, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), std(0xfaf5e8, { roughness: 1 }), 0, 0.04, 0);
      flour.scale.y = 0.35;
      add(new THREE.SphereGeometry(0.05, 8, 6), std(0xf6f0d6, { roughness: 0.4 }), 0.06, 0.12, 0.04);
      break;
    }
    case 'basket': {
      add(new THREE.CylinderGeometry(0.28, 0.2, 0.22, 16, 1, true), std(0xc89a52, { roughness: 1, side: THREE.DoubleSide }), 0, 0.05, 0);
      const fruit = [[0x6b2a8c, 0.08], [0xc0283a, 0.09], [0x6f4a2a, 0.07], [0x8a9a4a, 0.06], [0x3c5a2a, 0.05], [0xe0b050, 0.07], [0x6b2a8c, 0.07]];
      fruit.forEach(([c, r], i) => {
        const a = i / fruit.length * 6.28;
        add(new THREE.SphereGeometry(r, 10, 8), std(c, { roughness: 0.6 }), Math.cos(a) * 0.12, 0.16, Math.sin(a) * 0.12);
      });
      break;
    }
    case 'chazeh': {
      add(new THREE.CylinderGeometry(0.3, 0.28, 0.04, 20), MAT.silver, 0, 0, 0);
      const c = add(new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0xf3ece0, { map: TEX.linen }), 0, 0.02, 0);
      c.scale.y = 0.5;
      break;
    }
    case 'tor': {
      const bird = makeAnimal('tor').group;
      bird.position.set(0, -0.05, 0);
      g.add(bird);
      break;
    }
  }
  if (g.userData.fill) g.userData.fill.userData.noBake = true;
  if (g.userData.coal) g.userData.coal.userData.noBake = true;
  if (kind !== 'tor') bakeGroup(g);
  return g;
}

// Levite instruments for NPCs
export function makeInstrument(kind) {
  const g = new THREE.Group();
  const gold = MAT.goldBright, wood = std(0x8a5a2b, { roughness: 0.6 });
  if (kind === 'kinor') {
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 16, Math.PI * 1.3), wood);
    frame.rotation.z = -0.65; g.add(frame);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.38, 6), wood);
    bar.rotation.z = Math.PI / 2; bar.position.y = 0.18; g.add(bar);
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.3, 3), std(0xeeeeee));
      s.position.set(-0.12 + i * 0.06, 0.04, 0); g.add(s);
    }
  } else if (kind === 'nevel') {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), wood);
    frame.position.set(-0.15, 0.1, 0); frame.rotation.z = 0.2; g.add(frame);
    const sb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), wood);
    sb.scale.set(1, 0.6, 0.5); sb.position.set(0.05, -0.2, 0); g.add(sb);
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.5 - i * 0.05, 3), std(0xeeeeee));
      s.position.set(-0.1 + i * 0.04, 0.08, 0); g.add(s);
    }
  } else if (kind === 'chatzotzrot') {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 8), MAT.silver);
    tube.rotation.x = Math.PI / 2 - 0.3; g.add(tube);
    const bell = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 14, 1, true), MAT.silver);
    bell.rotation.x = -Math.PI / 2 - 0.3; bell.position.set(0, 0.12, 0.42); g.add(bell);
  } else if (kind === 'metziltayim') {
    for (const s of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 18), gold);
      c.rotation.z = Math.PI / 2; c.position.x = s * 0.12; g.add(c);
    }
  } else if (kind === 'chalil') {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.5, 8), wood);
    tube.rotation.x = Math.PI / 2 - 0.4; g.add(tube);
  }
  bakeGroup(g);
  return g;
}
