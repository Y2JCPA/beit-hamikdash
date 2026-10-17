// Instanced crowds (cheap: a handful of draw calls for ~100 people) and doves.
import * as THREE from 'three';
import { std, SKIN_TONES, HAIR_COLORS } from './characters.js';
import { VISITOR_SPOTS, GAZIT, AZARA } from './config.js';

const ROBES = [0x8a5a3c, 0x6b7a8f, 0xa0522d, 0x5d6b4a, 0x9c7b52, 0x7d4e57, 0x4f6d7a, 0xb08850, 0x6e5a7e, 0x8f3f2f, 0xc2a878, 0x3f5f4f];
const SCARVES = [0x8a3b4a, 0x3d5a8a, 0xc79a3e, 0x6b4f7a, 0x9c5a3a, 0xe0d4b8, 0x4f7a5a];

export class Crowd {
  constructor(scene, people) {
    this.people = people;
    const N = people.length;
    this.N = N;
    const robeProf = [[0.3, 0.0], [0.31, 0.04], [0.28, 0.3], [0.235, 0.62], [0.215, 0.85], [0.19, 1.02], [0.12, 1.1], [0.0, 1.12]].map(([x, y]) => new THREE.Vector2(x, y));
    const G = {
      robe: new THREE.LatheGeometry(robeProf, 16),
      band: new THREE.CylinderGeometry(0.228, 0.236, 0.1, 16, 1, true),
      head: new THREE.SphereGeometry(0.26, 14, 10),
      eye: new THREE.SphereGeometry(0.042, 6, 4),
      cap: new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.42),
      scarf: new THREE.SphereGeometry(0.29, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
      drape: new THREE.CylinderGeometry(0.2, 0.3, 0.5, 12, 1, true, Math.PI * 0.6, Math.PI * 1.8),
      arm: new THREE.CapsuleGeometry(0.068, 0.3, 3, 8),
      beard: new THREE.SphereGeometry(0.2, 10, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55),
    };
    G.arm.translate(0, -0.2, 0);
    const mk = (geo, mat, count) => {
      const m = new THREE.InstancedMesh(geo, mat, count);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    };
    const white = std(0xffffff, { roughness: 0.9 });
    const whiteDS = std(0xffffff, { roughness: 0.9, side: THREE.DoubleSide });
    this.robe = mk(G.robe, white, N);
    this.band = mk(G.band, whiteDS, N);
    this.head = mk(G.head, std(0xffffff, { roughness: 0.65 }), N);
    this.eyes = mk(G.eye, std(0x1d1410, { roughness: 0.3 }), N * 2);
    this.arms = mk(G.arm, white, N * 2);
    const women = people.filter(p => p.woman).length;
    const men = N - women;
    this.caps = mk(G.cap, white, Math.max(1, men));
    this.scarves = mk(G.scarf, white, Math.max(1, women));
    this.drapes = mk(G.drape, whiteDS, Math.max(1, women));
    this.beards = mk(G.beard, std(0xffffff, { roughness: 0.9 }), Math.max(1, men));
    this.eyes.castShadow = false;

    const c = new THREE.Color();
    let ci = 0, wi = 0, bi = 0;
    people.forEach((p, i) => {
      p.robeC = p.robeC ?? ROBES[(i * 7 + 3) % ROBES.length];
      p.skin = p.skin ?? SKIN_TONES[(i * 5 + 1) % SKIN_TONES.length];
      p.phase = Math.random() * 10;
      p.bow = 0;
      p.yaw = p.yaw ?? 0;
      p.scale = p.scale ?? (p.child ? 0.68 : 0.92 + Math.random() * 0.14);
      this.robe.setColorAt(i, c.set(p.robeC));
      this.band.setColorAt(i, c.set(p.woman ? SCARVES[(i + 2) % SCARVES.length] : ROBES[(i * 3 + 5) % ROBES.length]).multiplyScalar(0.8));
      this.head.setColorAt(i, c.set(p.skin));
      this.arms.setColorAt(i * 2, c.set(p.robeC)); this.arms.setColorAt(i * 2 + 1, c.set(p.robeC));
      if (p.woman) {
        p.hat = wi++;
        const sc = SCARVES[(i * 3) % SCARVES.length];
        this.scarves.setColorAt(p.hat, c.set(sc)); this.drapes.setColorAt(p.hat, c.set(sc));
      } else {
        p.hat = ci++;
        this.caps.setColorAt(p.hat, c.set([0xe9dfca, 0xd8c9a8, 0xf2ece0, 0xbfa77a][i % 4]));
        p.beardIdx = bi++;
        this.beards.setColorAt(p.beardIdx, c.set(p.beardC ?? HAIR_COLORS[i % HAIR_COLORS.length]));
      }
    });
    this.scarves.count = this.drapes.count = wi; this.caps.count = ci; this.beards.count = bi;
    for (const m of [this.robe, this.band, this.head, this.arms, this.scarves, this.drapes, this.caps, this.beards]) if (m.instanceColor) m.instanceColor.needsUpdate = true;

    this.bowTarget = 0;
    this.lookAt = null;
    this._m = new THREE.Matrix4(); this._b = new THREE.Matrix4(); this._l = new THREE.Matrix4();
    this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
    this.frame = 0;
    this.update(0, 0);
  }

  setBow(on) { this.bowTarget = on ? 1 : 0; }

  update(t, dt) {
    this.frame++;
    const M = this._m, B = this._b, L = this._l, q = this._q, e = this._e, v = this._v, s = this._s;
    const hasBeard = this.beards.count > 0;
    for (let i = 0; i < this.N; i++) {
      const p = this.people[i];
      // staggered bows look more natural
      const tgt = this.bowTarget * (p.bowDelay !== undefined ? 1 : 1);
      p.bow += (tgt - p.bow) * Math.min(1, dt * (2 + (i % 5) * 0.6));
      let yaw = p.yaw;
      if (this.lookAt && !p.fixedYaw) yaw = Math.atan2(this.lookAt.x - p.x, this.lookAt.z - p.z);
      p.curYaw = p.curYaw === undefined ? yaw : p.curYaw + Math.atan2(Math.sin(yaw - p.curYaw), Math.cos(yaw - p.curYaw)) * Math.min(1, dt * 1.5);
      const bob = Math.sin(t * 1.8 + p.phase) * 0.008;
      const sway = Math.sin(t * 0.7 + p.phase) * 0.03;
      e.set(0, p.curYaw, 0); q.setFromEuler(e);
      B.compose(v.set(p.x, p.y + bob, p.z), q, s.set(p.scale, p.scale, p.scale));
      // body bend (bow) around hips
      e.set(p.bow * 0.95, 0, sway * (1 - p.bow)); q.setFromEuler(e);
      L.compose(v.set(0, 0, 0), q, s.set(1, 1, 1));
      M.multiplyMatrices(B, L);
      this.robe.setMatrixAt(i, M);
      L.makeTranslation(0, 0.72, 0); this.band.setMatrixAt(i, L.premultiply(M));
      // head
      const H = this._h || (this._h = new THREE.Matrix4());
      H.makeTranslation(0, 1.36, 0).premultiply(M);
      this.head.setMatrixAt(i, H);
      L.makeTranslation(-0.092, 0.025, 0.228).premultiply(H); this.eyes.setMatrixAt(i * 2, L);
      L.makeTranslation(0.092, 0.025, 0.228).premultiply(H); this.eyes.setMatrixAt(i * 2 + 1, L);
      if (p.woman) {
        L.makeTranslation(0, -0.02, -0.01).premultiply(H); this.scarves.setMatrixAt(p.hat, L);
        L.makeTranslation(0, -0.3, -0.02).premultiply(H); this.drapes.setMatrixAt(p.hat, L);
      } else {
        L.makeTranslation(0, 0.07, 0).premultiply(H); this.caps.setMatrixAt(p.hat, L);
        if (hasBeard) {
          if (p.child) L.makeScale(0.001, 0.001, 0.001).premultiply(H);
          else L.makeTranslation(0, -0.06, 0.06).premultiply(H);
          this.beards.setMatrixAt(p.beardIdx, L);
        }
      }
      // arms (raised a little while bowing)
      for (let k = 0; k < 2; k++) {
        const sgn = k ? 1 : -1;
        e.set(-p.bow * 0.6 + Math.sin(t * 0.9 + p.phase + k) * 0.03, 0, sgn * 0.12); q.setFromEuler(e);
        L.compose(v.set(sgn * 0.215, 0.98, 0), q, s.set(1, 1, 1)).premultiply(M);
        this.arms.setMatrixAt(i * 2 + k, L);
      }
    }
    for (const m of [this.robe, this.band, this.head, this.eyes, this.arms, this.scarves, this.drapes, this.caps, this.beards]) m.instanceMatrix.needsUpdate = true;
  }
}

// Gather crowd placements
export function crowdLayout() {
  const people = [];
  let seed = 77;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // Ezrat Yisrael — the Ma'amad and visitors, facing the Mizbeach (west)
  for (const [z0, z1] of [[-31, -14.5], [14.5, 31]]) {
    for (let z = z0; z <= z1; z += 1.45) {
      for (const x of [16.6, 18.2]) {
        if (rnd() < 0.18) continue;
        if (Object.values(VISITOR_SPOTS).some(v => Math.hypot(v.x + 0.8 - x, v.z - z) < 2.4)) continue;
        if (Math.hypot(x - GAZIT.door, z - AZARA.maxZ) < 4.5) continue;         // the way into Lishkat HaGazit
        people.push({ x: x + (rnd() - 0.5) * 0.4, y: 0, z: z + (rnd() - 0.5) * 0.4, yaw: -Math.PI / 2, child: rnd() < 0.12 });
      }
    }
  }
  // Ezrat Nashim — families
  const groups = [[37, -7.5], [38, 8], [44, -14], [46, 13], [56, -12], [58, 11], [44, 3], [28, -4.5], [54, -3.8], [66, -18], [64, 20], [74, -6], [76, 7], [52, 24], [56, -25], [82, 3]];
  for (const [gx, gz] of groups) {
    const n = 3 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rnd();
      const r = 0.9 + rnd() * 0.5;
      const x = gx + Math.cos(a) * r, z = gz + Math.sin(a) * r;
      if (Math.abs(z) < 2.2) continue;
      people.push({ x, y: -3, z, yaw: Math.atan2(gx - x, gz - z), woman: rnd() < 0.55, child: rnd() < 0.25, fixedYaw: rnd() < 0.5 });
    }
  }
  // Pilgrims in the outer court of Har HaBayit
  for (let k = 0; k < 16; k++) {
    const a = rnd() * Math.PI * 2;
    const gx = -10 + Math.cos(a) * (120 + rnd() * 30), gz = Math.sin(a) * (85 + rnd() * 40);
    if (Math.abs(gz) < 60 && gx > -100 && gx < 112) continue;
    const n = 2 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const x = gx + (rnd() - 0.5) * 3, z = gz + (rnd() - 0.5) * 3;
      people.push({ x, y: -6, z, yaw: rnd() * 6.28, woman: rnd() < 0.5, child: rnd() < 0.25, fixedYaw: true });
    }
  }
  // Women watching from the balcony
  for (let x = 25; x < 58; x += 2.6) {
    for (const z of [-18.2, 18.2]) {
      if (rnd() < 0.45) continue;
      people.push({ x, y: 1.6, z, yaw: z < 0 ? 0 : Math.PI, woman: true, fixedYaw: true });
    }
  }
  return people;
}

// The sages of the Sanhedrin on their seats in Lishkat HaGazit (one seat is for the
// sage who talks with you, a real character)
export function sanhedrinLayout(seats, skip) {
  const GREY = [0xd8d4cc, 0xb8b2a8, 0xe8e4dc, 0x9a948a, 0x5a4a3a];
  const sages = seats.filter(s => s !== skip).map((s, i) => ({
    x: s.x, y: s.y - 0.5, z: s.z, yaw: s.yaw, fixedYaw: true, scale: 0.98,
    robeC: [0xf2ece0, 0xe4d9c2, 0x6b7a8f, 0xd8c9a8, 0x4f6d7a][i % 5], beardC: GREY[(i * 3) % GREY.length],
  }));
  // and the two scribes standing before them, at their desks (Sanhedrin 4:3)
  for (const dx of [-3.4, 3.4]) sages.push({ x: GAZIT.cx + dx, y: 0, z: GAZIT.cz + 2.75, yaw: Math.PI, fixedYaw: true, robeC: 0x8a5a3c, beardC: 0x5a3a1e });
  return sages;
}

// ─────────────────────────────────────────────────────────
// Doves circling high above (instanced)
// ─────────────────────────────────────────────────────────
export class Doves {
  constructor(scene, count = 22) {
    this.count = count;
    const body = new THREE.SphereGeometry(0.22, 8, 6); body.scale(0.8, 0.7, 1.6);
    const wing = new THREE.BoxGeometry(0.9, 0.03, 0.32); wing.translate(0.45, 0, 0);
    const mat = std(0xf6f3ee, { roughness: 0.9 });
    this.body = new THREE.InstancedMesh(body, mat, count);
    this.wingL = new THREE.InstancedMesh(wing, mat, count);
    this.wingR = new THREE.InstancedMesh(wing, mat, count);
    for (const m of [this.body, this.wingL, this.wingR]) { m.frustumCulled = false; scene.add(m); }
    this.birds = [];
    for (let i = 0; i < count; i++) {
      this.birds.push({
        cx: -10 + (Math.random() - 0.5) * 50, cz: (Math.random() - 0.5) * 40,
        r: 18 + Math.random() * 30, h: 28 + Math.random() * 30, sp: (0.12 + Math.random() * 0.12) * (Math.random() < 0.5 ? 1 : -1),
        a: Math.random() * 6.28, f: Math.random() * 6,
      });
    }
    this._m = new THREE.Matrix4(); this._w = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
  }
  update(t, dt) {
    const M = this._m, W = this._w, q = this._q, e = this._e, v = this._v, s = this._s;
    this.birds.forEach((b, i) => {
      b.a += b.sp * dt;
      const x = b.cx + Math.cos(b.a) * b.r, z = b.cz + Math.sin(b.a) * b.r;
      const y = b.h + Math.sin(t * 0.5 + b.f) * 2;
      const yaw = Math.atan2(-Math.sin(b.a) * Math.sign(b.sp), Math.cos(b.a) * Math.sign(b.sp));
      e.set(0, yaw, -Math.sign(b.sp) * 0.25); q.setFromEuler(e);
      M.compose(v.set(x, y, z), q, s);
      this.body.setMatrixAt(i, M);
      const flap = Math.sin(t * 9 + b.f) * 0.6;
      W.makeRotationZ(flap).premultiply(M); this.wingR.setMatrixAt(i, W);
      W.makeRotationZ(Math.PI - flap).premultiply(M); this.wingL.setMatrixAt(i, W);
    });
    this.body.instanceMatrix.needsUpdate = this.wingL.instanceMatrix.needsUpdate = this.wingR.instanceMatrix.needsUpdate = true;
  }
}
