// StaticBuilder — collects static architecture, gives it world-space UVs
// (so stone blocks line up across neighbouring pieces), merges everything
// per material into a handful of draw calls, and records colliders.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

function worldUV(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (nx >= ny && nx >= nz) { uv[i * 2] = z * Math.sign(nor.getX(i) || 1); uv[i * 2 + 1] = y; }
    else if (ny >= nz) { uv[i * 2] = x; uv[i * 2 + 1] = z; }
    else { uv[i * 2] = -x * Math.sign(nor.getZ(i) || 1); uv[i * 2 + 1] = y; }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export class StaticBuilder {
  constructor(physics) {
    this.physics = physics;
    this.buckets = new Map();
    this.meshes = [];
  }

  // Add any geometry with a transform. opts: {shadow=true, receive=true, uv:'world'|'keep', collide, cam}
  add(mat, geo, matrix, opts = {}) {
    const g = geo.index ? geo.clone() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (opts.uv !== 'keep' || !g.attributes.uv) worldUV(g);
    const cast = opts.shadow !== false;
    const key = mat.uuid + (cast ? '_c' : '_n');
    if (!this.buckets.has(key)) this.buckets.set(key, { mat, cast, geos: [] });
    this.buckets.get(key).geos.push(g);
    return g;
  }

  // Axis-aligned box from min/max corners
  boxMM(mat, x0, y0, z0, x1, y1, z1, opts = {}) {
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0);
    const geo = new THREE.BoxGeometry(w, h, d);
    _m.makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(mat, geo, _m, opts);
    geo.dispose();
    if (opts.collide !== false && opts.collide) {
      this.physics.addBox(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1), opts.cam !== false);
    }
  }

  // Centred box with optional rotation
  box(mat, cx, cy, cz, w, h, d, opts = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    _e.set(opts.rx || 0, opts.ry || 0, opts.rz || 0);
    _q.setFromEuler(_e);
    _m.compose(_p.set(cx, cy, cz), _q, _s.set(1, 1, 1));
    this.add(mat, geo, _m, opts);
    geo.dispose();
    if (opts.collide) {
      // rotated boxes collide as their (conservative) AABB
      const r = Math.max(w, d) / 2;
      const hw = opts.ry ? r : w / 2, hd = opts.ry ? r : d / 2;
      this.physics.addBox(cx - hw, cy - h / 2, cz - hd, cx + hw, cy + h / 2, cz + hd, opts.cam !== false);
    }
  }

  cyl(mat, x, y0, z, rTop, rBot, h, seg = 16, opts = {}) {
    const geo = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, !!opts.open, opts.thetaStart || 0, opts.thetaLength || Math.PI * 2);
    _e.set(opts.rx || 0, opts.ry || 0, opts.rz || 0);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y0 + h / 2, z), _q, _s.set(opts.sx || 1, 1, opts.sz || 1));
    this.add(mat, geo, _m, opts);
    geo.dispose();
    if (opts.collide) {
      const r = Math.max(rTop, rBot);
      this.physics.addBox(x - r * 0.8, y0, z - r * 0.8, x + r * 0.8, y0 + h, z + r * 0.8, opts.cam !== false);
    }
  }

  // Merge everything and add to scene
  build(scene) {
    for (const { mat, cast, geos } of this.buckets.values()) {
      const anyNonIndexed = geos.some(g => !g.index);
      const list = anyNonIndexed ? geos.map(g => (g.index ? g.toNonIndexed() : g)) : geos;
      // merge in chunks to keep index ranges sane
      const CH = 600;
      for (let i = 0; i < list.length; i += CH) {
        const merged = mergeGeometries(list.slice(i, i + CH), false);
        if (!merged) { console.warn('merge failed for', mat.name || mat.uuid); continue; }
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = cast;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        scene.add(mesh);
        this.meshes.push(mesh);
      }
      geos.forEach(g => g.dispose());
    }
    this.buckets.clear();
  }
}
