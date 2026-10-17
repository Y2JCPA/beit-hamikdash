// Navigation for "Guide me": a hand-placed graph of waypoints whose links are
// verified by simulating a walk through the real collision world, so routes go
// up the 15 steps, the Kevesh and the Ulam steps instead of off ledges.
import { PLAYER } from './config.js';

const STEP = PLAYER.step;
const R = 0.55;   // keep a safe margin (the Kohen himself is 0.34 m wide)

// [x, approxY, z]
const NODES = [
  // Ezrat Nashim → 15 steps → Nikanor
  [84, -3, 0], [76, -3, 0], [66, -3, 0], [56, -3, 0], [46, -3, 0], [36, -3, 0], [28.5, -3, 0], [23, -1, 0], [20.2, 0, 0], [17, 0, 0], [12.6, 0, 0],
  // the corner chambers of Ezrat Nashim (doors face the courtyard) and the Leviim's instrument rooms
  [31.5, -3, -10], [31.5, -3, -22], [79, -3, -10], [79, -3, -22], [31.5, -3, 10], [31.5, -3, 22], [79, -3, 10], [79, -3, 22], [26, -3, -9.5], [26, -3, 9.5],
  // Ezrat Yisrael / by the Duchan
  [12.6, 0, 14], [12.6, 0, -14], [12.6, 0, 21.5], [12.6, 0, -21.5], [16, 0, 13], [16, 0, -13],
  // around the Mizbeach
  [10.6, 0, 6.5], [10.6, 0, -4], [10.6, 0, -14.6], [0, 0, -14.4], [-10.4, 0, -14.6], [-10.4, 0, -4],
  [-9.4, 0, 4.8], [-7.2, 0, 10.5], [-6, 0, 21], [0, 0, 21], [6.8, 0, 11.5], [8.5, 0, 21],
  // north: rings, tables, lamb chamber
  [0, 0, -21], [-6, 0, -21], [6, 0, -21], [1.5, 0, -29.2], [-12, 0, -28.5], [-12, 0, -21],
  // top of the Mizbeach (via the Kevesh)
  [0, 4.5, 1.8], [4.6, 4.5, -0.6], [-4.6, 4.5, -0.6], [4.6, 4.5, -8.6], [-4.6, 4.5, -8.6], [0, 4.5, -10.2],
  // Ulam steps → Ulam → Heichal
  [-12.8, 0, 0], [-16, 1, 0], [-18.6, 3, 0], [-21.5, 3, 0], [-26.5, 3, 0], [-30.5, 3, 0], [-35.5, 3, -1.8], [-35.5, 3, 1.8], [-41, 3, 0], [-45, 3, 0],
  // the rest of the Azara
  [-20, 0, 27], [-45, 0, 27], [-73, 0, 20], [-73, 0, 0], [-73, 0, -20], [-45, 0, -27], [-20, 0, -27], [0, 0, 27], [12, 0, 27], [12, 0, -27],
  // through the south door into Lishkat HaGazit, to the middle of the Sanhedrin
  [16, 0, 31], [16, 0, 38], [21.5, 0, 38.4], [27, 0, 40.4],
];

export class Nav {
  constructor(physics) {
    this.p = physics;
    this.nodes = NODES.map(([x, y, z]) => ({ x, y: physics.groundAt(x, z, y + 0.6, 0.8), z, out: [] }));
    this.build();
  }

  blocked(x, z, y, r = R) {
    for (const b of this.p.near(x, z)) {
      if (b.y1 <= y + STEP || b.y0 >= y + PLAYER.height) continue;
      // the big safety margin is for tall things (walls, people); steps just need the body's own size
      const rr = b.y1 > y + 1.0 ? r : Math.min(r, 0.3);
      const cx = Math.max(b.x0, Math.min(x, b.x1)), cz = Math.max(b.z0, Math.min(z, b.z1));
      if ((x - cx) ** 2 + (z - cz) ** 2 < rr * rr) return true;
    }
    return false;
  }

  // Simulate walking a straight line from a to b; returns the arrival height or null
  walk(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(2, Math.ceil(d / 0.3));
    let y = a.y;
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      // full safety margin in open space, but allow starting/ending right beside things
      const near = d * Math.min(t, 1 - t) < 0.9;
      if (this.p.surfaceBlocks(x, z, y, STEP)) return null;
      const g = this.p.groundAt(x, z, y, STEP);   // step up (or down) first, like the player does
      if (y - g > 0.75) return null;              // never route off a ledge
      if (this.blocked(x, z, g, near ? 0.22 : R)) return null;
      y = g;
    }
    return y;
  }
  reach(a, b) { const y = this.walk(a, b); return y !== null && Math.abs(y - (b.y || 0)) < 1.2; }

  build() {
    const N = this.nodes;
    for (let i = 0; i < N.length; i++) for (let j = 0; j < N.length; j++) {
      if (i === j) continue;
      const d = Math.hypot(N[i].x - N[j].x, N[i].z - N[j].z);
      if (d > 34) continue;
      if (this.reach(N[i], N[j])) N[i].out.push({ j, d });
    }
  }

  // Returns a list of points from `from` to the first reachable goal in `goals`, or null.
  // One Dijkstra search from the start; goals are tried in order of preference.
  plan(from, goals) {
    if (!Array.isArray(goals)) goals = [goals];
    for (const to of goals) if (Math.hypot(to.x - from.x, to.z - from.z) < 30 && this.reach(from, to)) return [to];
    const N = this.nodes;
    const dist = new Array(N.length).fill(Infinity), prev = new Array(N.length).fill(-1);
    const open = new Set();
    for (let i = 0; i < N.length; i++) {
      const d = Math.hypot(N[i].x - from.x, N[i].z - from.z);
      if (d < 40 && this.reach(from, N[i])) { dist[i] = d; open.add(i); }
    }
    while (open.size) {
      let u = -1, best = Infinity;
      for (const i of open) if (dist[i] < best) { best = dist[i]; u = i; }
      open.delete(u);
      for (const { j, d } of N[u].out) {
        if (dist[u] + d < dist[j]) { dist[j] = dist[u] + d; prev[j] = u; open.add(j); }
      }
    }
    for (const to of goals) {
      const order = [];
      for (let i = 0; i < N.length; i++) {
        if (dist[i] === Infinity || Math.abs(N[i].y - (to.y || 0)) > 1.6) continue;
        const d = Math.hypot(N[i].x - to.x, N[i].z - to.z);
        if (d < 40) order.push([dist[i] + d, i]);
      }
      order.sort((a, b) => a[0] - b[0]);
      for (const [, i] of order) {
        if (!this.reach(N[i], to)) continue;
        const path = [to];
        for (let k = i; k >= 0; k = prev[k]) path.unshift(N[k]);
        return path;
      }
    }
    return null;
  }
}
