// Visual effects: shader fire, smoke pillar, embers, particles, quest markers.
import * as THREE from 'three';
import { TEX } from './materials.js';

const NOISE_GLSL = `
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
`;

// ─────────────────────────────────────────────────────────
// Fire: a cluster of vertically-billboarded flame quads
// ─────────────────────────────────────────────────────────
export class Fire {
  constructor(scene, pos, scale = 1, count = 9, embers = true) {
    this.pos = pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z);
    this.base = scale;
    this.scale = scale;
    this.target = scale;
    const quad = [-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0];
    const uvs = [0, 0, 1, 0, 1, 1, 0, 1];
    const P = [], U = [], O = [], S = [], SD = [], I = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2, r = i === 0 ? 0 : 0.35 + Math.random() * 0.55;
      const off = [Math.cos(a) * r, 0, Math.sin(a) * r];
      const big = i === 0 ? 1.0 : 0.55 + Math.random() * 0.45;
      const sz = [1.5 * big, 2.6 * big];
      for (let v = 0; v < 4; v++) {
        P.push(quad[v * 3], quad[v * 3 + 1], quad[v * 3 + 2]);
        U.push(uvs[v * 2], uvs[v * 2 + 1]);
        O.push(...off); S.push(...sz); SD.push(Math.random());
      }
      const b = i * 4;
      I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setAttribute('offset', new THREE.Float32BufferAttribute(O, 3));
    g.setAttribute('size', new THREE.Float32BufferAttribute(S, 2));
    g.setAttribute('seed', new THREE.Float32BufferAttribute(SD, 1));
    g.setIndex(I);
    this.uniforms = { uTime: { value: 0 }, uIntensity: { value: 1 }, uScale: { value: scale } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        attribute vec3 offset; attribute vec2 size; attribute float seed;
        uniform float uScale; uniform float uTime;
        varying vec2 vUv; varying float vSeed;
        void main(){
          vec3 o = offset * uScale;
          vec4 mv = modelViewMatrix * vec4(o, 1.0);
          vec3 upV = normalize((viewMatrix * vec4(0.0,1.0,0.0,0.0)).xyz);
          vec3 rightV = normalize(cross(upV, vec3(0.0,0.0,1.0)));
          float sway = sin(uTime*2.0 + seed*20.0) * 0.06 * position.y;
          mv.xyz += rightV * (position.x * size.x + sway) * uScale + upV * position.y * size.y * uScale * (0.85 + 0.25*sin(uTime*3.0+seed*9.0));
          gl_Position = projectionMatrix * mv;
          vUv = uv; vSeed = seed;
        }`,
      fragmentShader: NOISE_GLSL + `
        uniform float uTime; uniform float uIntensity;
        varying vec2 vUv; varying float vSeed;
        void main(){
          vec2 q = vec2((vUv.x-0.5)*2.0, vUv.y);
          float t = uTime*1.7 + vSeed*13.0;
          float n = fbm(vec2(q.x*1.8 + vSeed*7.0, q.y*2.6 - t*1.9));
          float width = mix(0.95, 0.04, pow(vUv.y, 0.75));
          float d = abs(q.x + (n-0.5)*0.75*vUv.y) / max(width, 0.001);
          float flame = smoothstep(1.0, 0.15, d) * smoothstep(1.0, 0.45 + n*0.4, vUv.y) * smoothstep(0.0, 0.1, vUv.y);
          flame *= 0.65 + n*0.7;
          vec3 col = mix(vec3(0.95,0.18,0.02), vec3(1.0,0.62,0.16), smoothstep(0.15,0.7,flame));
          col = mix(col, vec3(1.0,0.95,0.78), smoothstep(0.7,1.05,flame));
          gl_FragColor = vec4(col * flame * uIntensity * 4.0, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.position.copy(this.pos);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.embers = embers ? new Embers(scene, this.pos, scale) : null;
  }
  flare(mult = 2.2, secs = 4) { this.target = this.base * mult; this.flareT = secs; }
  setVisible(v) { this.mesh.visible = v; if (this.embers) this.embers.points.visible = v; }
  update(t, dt) {
    if (this.flareT > 0) { this.flareT -= dt; if (this.flareT <= 0) this.target = this.base; }
    this.scale += (this.target - this.scale) * Math.min(1, dt * 2.5);
    this.uniforms.uTime.value = t;
    this.uniforms.uScale.value = this.scale;
    this.embers?.update(t, this.scale);
  }
}

class Embers {
  constructor(scene, pos, scale, count = 40) {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3), s = new Float32Array(count);
    for (let i = 0; i < count; i++) { p[i * 3] = (Math.random() - 0.5) * 1.6; p[i * 3 + 2] = (Math.random() - 0.5) * 1.6; s[i] = Math.random(); }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(s, 1));
    this.u = { uTime: { value: 0 }, uScale: { value: scale }, uPix: { value: window.devicePixelRatio || 1 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: `attribute float seed; uniform float uTime; uniform float uScale; uniform float uPix; varying float vA;
        void main(){ float life = 2.6; float a = mod(uTime*0.6 + seed*life, life)/life;
          vec3 p = position*uScale; p.y += a*7.0*uScale; p.x += sin(uTime*1.3+seed*30.0)*0.5*a; p.z += cos(uTime*1.1+seed*17.0)*0.5*a;
          vA = (1.0-a)*smoothstep(0.0,0.1,a);
          vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = uPix*(60.0/ -mv.z)*(0.6+seed*0.6); }`,
      fragmentShader: `varying float vA; void main(){ vec2 c=gl_PointCoord-0.5; float d=length(c); if(d>0.5) discard;
        gl_FragColor = vec4(vec3(1.0,0.55,0.15)*(1.0-d*2.0)*vA*2.5, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.points = new THREE.Points(g, m);
    this.points.position.copy(pos);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  update(t, scale) { this.u.uTime.value = t; this.u.uScale.value = scale; }
}

// ─────────────────────────────────────────────────────────
// Smoke — rises straight as a pillar (one of the 10 miracles, Avot 5:5)
// ─────────────────────────────────────────────────────────
export class SmokeColumn {
  constructor(scene, pos, { count = 46, height = 34, spread = 0.35, color = 0xd9d4cc, opacity = 0.42, size = 3.2, speed = 1 } = {}) {
    const quad = [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5];
    const P = [], U = [], SD = [], I = [];
    for (let i = 0; i < count; i++) {
      for (let v = 0; v < 4; v++) { P.push(quad[v * 2], quad[v * 2 + 1], 0); U.push(quad[v * 2] + 0.5, quad[v * 2 + 1] + 0.5); SD.push(i / count + Math.random() * 0.01); }
      const b = i * 4; I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setAttribute('seed', new THREE.Float32BufferAttribute(SD, 1));
    g.setIndex(I);
    this.u = {
      uTime: { value: 0 }, uHeight: { value: height }, uSpread: { value: spread }, uSize: { value: size },
      uOpacity: { value: opacity }, uColor: { value: new THREE.Color(color) }, map: { value: TEX.smoke }, uSpeed: { value: speed },
      uLight: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: `attribute float seed; uniform float uTime, uHeight, uSpread, uSize, uSpeed; varying vec2 vUv; varying float vA;
        void main(){
          float a = fract(seed + uTime*0.035*uSpeed);
          vec3 c = vec3(sin(seed*91.0)*uSpread*(0.3+a), a*uHeight, cos(seed*57.0)*uSpread*(0.3+a));
          vec4 mv = modelViewMatrix*vec4(c,1.0);
          float s = uSize*(0.5 + a*1.6);
          float rot = seed*6.28 + uTime*0.1;
          vec2 p = vec2(position.x*cos(rot)-position.y*sin(rot), position.x*sin(rot)+position.y*cos(rot));
          mv.xy += p*s;
          gl_Position = projectionMatrix*mv;
          vUv = uv; vA = smoothstep(0.0,0.08,a)*(1.0-smoothstep(0.55,1.0,a));
        }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 uColor; uniform float uOpacity, uLight; varying vec2 vUv; varying float vA;
        void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(uColor*uLight, t.a*vA*uOpacity); }`,
      transparent: true, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.position.copy(pos);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    scene.add(this.mesh);
    this.baseOpacity = opacity;
  }
  update(t, light = 1) { this.u.uTime.value = t; this.u.uLight.value = light; }
}

// ─────────────────────────────────────────────────────────
// Particle bursts (sparkles, water, ash, incense)
// ─────────────────────────────────────────────────────────
export class Particles {
  constructor(scene, max = 600, additive = true) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.n = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('psize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uPix: { value: Math.min(window.devicePixelRatio || 1, 2) }, map: { value: TEX.soft } },
      vertexShader: `attribute vec3 color; attribute float psize; attribute float alpha; uniform float uPix; varying vec3 vC; varying float vA;
        void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize = psize*uPix*(300.0/ -mv.z); }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC, t.a*vA); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: !additive,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 7;
    scene.add(this.points);
  }
  emit(x, y, z, { count = 20, color = 0xffd36e, speed = 3, up = 2, life = 1.2, size = 0.25, gravity = -2, spread = 0.2, color2 = null } = {}) {
    const c1 = new THREE.Color(color), c2 = color2 ? new THREE.Color(color2) : c1;
    for (let k = 0; k < count; k++) {
      let i = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
      const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI;
      const sp = speed * (0.4 + Math.random() * 0.6);
      this.pos[i * 3] = x + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 1] = y + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
      this.vel[i * 3] = Math.cos(th) * Math.sin(ph) * sp;
      this.vel[i * 3 + 1] = Math.abs(Math.cos(ph)) * sp * 0.5 + up * (0.5 + Math.random() * 0.5);
      this.vel[i * 3 + 2] = Math.sin(th) * Math.sin(ph) * sp;
      const cc = Math.random() < 0.5 ? c1 : c2;
      this.col[i * 3] = cc.r; this.col[i * 3 + 1] = cc.g; this.col[i * 3 + 2] = cc.b;
      this.size[i] = size * (0.6 + Math.random() * 0.8);
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.6);
      this.grav[i] = gravity;
    }
  }
  // a stream from a to b (e.g. water from the Kiyor spout, wine into the bowl)
  stream(from, to, opts = {}) {
    const dir = to.clone().sub(from);
    for (let k = 0; k < (opts.count || 4); k++) {
      const t = Math.random() * 0.2;
      const i = this.n < this.max ? this.n++ : Math.floor(Math.random() * this.max);
      this.pos[i * 3] = from.x + dir.x * t; this.pos[i * 3 + 1] = from.y + dir.y * t; this.pos[i * 3 + 2] = from.z + dir.z * t;
      const L = opts.life || 0.5;
      this.vel[i * 3] = dir.x / L; this.vel[i * 3 + 1] = dir.y / L + 2.0; this.vel[i * 3 + 2] = dir.z / L;
      const c = new THREE.Color(opts.color || 0xaee3ff);
      this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
      this.size[i] = (opts.size || 0.12) * (0.7 + Math.random() * 0.6);
      this.life[i] = this.maxLife[i] = L;
      this.grav[i] = -8;
    }
  }
  update(dt) {
    let alive = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] += this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.min(1, f * 2.5) * Math.min(1, (1 - f) * 8 + 0.2);
      alive++;
    }
    if (alive === 0) this.n = 0;
    this.geo.setDrawRange(0, this.n);
    for (const k of ['position', 'color', 'psize', 'alpha']) this.geo.attributes[k].needsUpdate = true;
  }
}

// ─────────────────────────────────────────────────────────
// Quest markers: ground ring + light beam + floating gem
// ─────────────────────────────────────────────────────────
export class Marker {
  constructor(scene, color = 0xffd36e, { beam = true, size = 1 } = {}) {
    this.group = new THREE.Group();
    this.color = new THREE.Color(color);
    this.u = { uTime: { value: 0 }, uColor: { value: this.color } };
    const ringMat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
        void main(){ vec2 c=vUv-0.5; float r=length(c)*2.0;
          float ring = smoothstep(0.78,0.86,r)*(1.0-smoothstep(0.92,1.0,r));
          float pulse = fract(uTime*0.6); float wave = smoothstep(pulse-0.08,pulse,r)*(1.0-smoothstep(pulse,pulse+0.02,r))*(1.0-pulse);
          float fill = (1.0-r)*0.18;
          float a = ring*0.95 + wave*0.8 + fill;
          gl_FragColor = vec4(uColor*a*1.6, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(2.4 * size, 2.4 * size), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    ring.renderOrder = 4;
    this.group.add(ring);
    if (beam) {
      const beamMat = new THREE.ShaderMaterial({
        uniforms: this.u,
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
          void main(){ float edge = sin(vUv.x*3.14159); float a = pow(1.0-vUv.y, 1.6)*0.55*edge;
            a *= 0.75 + 0.25*sin(vUv.y*30.0 - uTime*4.0);
            gl_FragColor = vec4(uColor*a, 1.0); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
      });
      const bg = new THREE.CylinderGeometry(0.5 * size, 0.7 * size, 30, 16, 1, true);
      bg.translate(0, 15, 0);
      const beamMesh = new THREE.Mesh(bg, beamMat);
      beamMesh.renderOrder = 4;
      this.group.add(beamMesh);
    }
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.28 * size, 0),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, metalness: 0.4, roughness: 0.3 }));
    gem.position.y = 2.6;
    this.gem = gem;
    this.group.add(gem);
    this.group.visible = false;
    scene.add(this.group);
  }
  show(x, y, z, color) {
    this.group.position.set(x, y, z);
    if (color !== undefined) { this.color.set(color); this.gem.material.color.set(color); this.gem.material.emissive.set(color); }
    this.group.visible = true;
  }
  hide() { this.group.visible = false; }
  update(t) {
    this.u.uTime.value = t;
    this.gem.position.y = 2.4 + Math.sin(t * 2.5) * 0.18;
    this.gem.rotation.y = t * 1.8;
  }
}

// Volumetric-looking light shafts (Heichal windows)
export function lightShaft(scene, from, to, width = 1.2, color = 0xfff0c8, opacity = 0.12) {
  const dir = to.clone().sub(from);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(width * 0.5, width * 1.4, len, 12, 1, true);
  g.translate(0, -len / 2, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOp: { value: opacity } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOp; varying vec2 vUv;
      void main(){ float a = sin(vUv.x*3.14159*2.0)*0.5+0.5; a = pow(a, 0.5)*uOp*(0.4+0.6*vUv.y); gl_FragColor = vec4(uColor*a, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
  const m = new THREE.Mesh(g, mat);
  m.position.copy(from);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
  m.renderOrder = 3;
  scene.add(m);
  return m;
}
