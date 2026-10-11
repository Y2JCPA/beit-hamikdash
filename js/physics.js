// Tiny collision world: AABBs (walls, steps, altar…) + height surfaces
// (ramps, the semicircular 15 steps). Uses a uniform grid for lookups.
const CELL = 8;

export class Physics {
  constructor() {
    this.boxes = [];
    this.surfaces = [];      // {x0,z0,x1,z1, h(x,z)}
    this.grid = new Map();
    this.camBoxes = [];
    this.floorY = -6;        // lowest possible ground
  }

  addBox(x0, y0, z0, x1, y1, z1, cam = true) {
    const b = { x0, y0, z0, x1, y1, z1, cam };
    this.boxes.push(b);
    if (cam && (x1 - x0) * (y1 - y0) * (z1 - z0) > 2) this.camBoxes.push(b);
    const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL);
    const cz0 = Math.floor(z0 / CELL), cz1 = Math.floor(z1 / CELL);
    for (let i = cx0; i <= cx1; i++) for (let j = cz0; j <= cz1; j++) {
      const k = i * 4096 + j;
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(b);
    }
    return b;
  }

  addSurface(x0, z0, x1, z1, h) { this.surfaces.push({ x0, z0, x1, z1, h }); }

  near(x, z) {
    return this.grid.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL)) || EMPTY;
  }

  // Highest walkable top under (x,z) that is not above feetY + step
  groundAt(x, z, feetY, step) {
    let g = this.floorY;
    const lim = feetY + step;
    const list = this.near(x, z);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y1 <= lim && b.y1 > g) g = b.y1;
    }
    for (const s of this.surfaces) {
      if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) {
        const h = s.h(x, z);
        if (h <= lim && h > g) g = h;
      }
    }
    return g;
  }

  // Is there a surface that is too high to step onto at (x,z)? (used for ramp sides)
  surfaceBlocks(x, z, feetY, step) {
    for (const s of this.surfaces) {
      if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) {
        if (s.h(x, z) > feetY + step) return true;
      }
    }
    return false;
  }

  // Push a vertical cylinder (x,z,r) at [feetY, feetY+height] out of boxes.
  resolve(pos, feetY, r, height, step) {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const list = this.near(pos.x, pos.z);
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b.y1 <= feetY + step || b.y0 >= feetY + height) continue;
        const cx = Math.max(b.x0, Math.min(pos.x, b.x1));
        const cz = Math.max(b.z0, Math.min(pos.z, b.z1));
        let dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), push = r - d;
          pos.x += (dx / d) * push; pos.z += (dz / d) * push;
        } else {
          // centre is inside the box: push out along the shallowest axis
          const l = pos.x - b.x0, rr = b.x1 - pos.x, t = pos.z - b.z0, bt = b.z1 - pos.z;
          const m = Math.min(l, rr, t, bt);
          if (m === l) pos.x = b.x0 - r; else if (m === rr) pos.x = b.x1 + r;
          else if (m === t) pos.z = b.z0 - r; else pos.z = b.z1 + r;
        }
        moved = true;
      }
      if (!moved) break;
    }
  }

  // Ray (origin o, unit dir d, length L) vs camera-blocking boxes → hit distance
  rayCast(o, d, L) {
    let best = L;
    for (const b of this.camBoxes) {
      let tmin = 0, tmax = best;
      for (const ax of ['x', 'y', 'z']) {
        const o0 = o[ax], dd = d[ax];
        const lo = b[ax + '0'], hi = b[ax + '1'];
        if (Math.abs(dd) < 1e-9) { if (o0 < lo || o0 > hi) { tmin = Infinity; break; } continue; }
        let t1 = (lo - o0) / dd, t2 = (hi - o0) / dd;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { tmin = Infinity; break; }
      }
      if (tmin !== Infinity && tmin < best && tmin > 0) best = tmin;
    }
    return best;
  }
}
const EMPTY = [];
