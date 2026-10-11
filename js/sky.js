// Sky, sun, image-based lighting and time of day.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { setBakedEnvMap } from './characters.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export class Environment {
  constructor(renderer, scene, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.quality = quality;
    this.hour = 9;
    this.lastEnvHour = -99;
    this.sunDir = new THREE.Vector3(0, 1, 0);

    this.sky = new Sky();
    this.sky.scale.setScalar(6000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 3.2;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.82;
    scene.add(this.sky);

    // separate scene for PMREM generation (sky only)
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(1000);
    // The env-map sky shares uniforms but uses a far dimmer sun disk; the real
    // one (x19000) would flood every material with light once baked into IBL.
    const envMat = this.sky.material.clone();
    envMat.uniforms = this.sky.material.uniforms;
    envMat.fragmentShader = envMat.fragmentShader.replace('vSunE * 19000.0', 'vSunE * 240.0');
    this.envSky.material = envMat;
    this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;

    // Sun / moon light
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = quality !== 'low';
    const sm = quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0xd8c09a, 0.6);
    scene.add(this.hemi);

    // Stars
    const N = 1600, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.95);
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * 2500;
      pos[i * 3 + 1] = Math.cos(ph) * 2500;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 2500;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.renderOrder = -1;
    scene.add(this.stars);

    // Moon
    const mc = document.createElement('canvas'); mc.width = mc.height = 128;
    const g = mc.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(0.42, 'rgba(255,248,225,1)');
    gr.addColorStop(0.5, 'rgba(255,240,210,0.25)'); gr.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const mt = new THREE.CanvasTexture(mc); mt.colorSpace = THREE.SRGBColorSpace;
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: mt, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
    this.moon.scale.setScalar(180);
    scene.add(this.moon);

    scene.fog = new THREE.FogExp2(0xcfdbe3, 0.0013);
    this.fogDay = new THREE.Color(0xb9cde0);
    this.fogDawn = new THREE.Color(0xe2ab84);
    this.fogNight = new THREE.Color(0x0e1a33);
    this.fogBlue = new THREE.Color(0x4a5f88);
    this.tmpC = new THREE.Color();
    this.followTarget = new THREE.Vector3();
  }

  // Sun direction for a given hour (Jerusalem-ish path: rise ESE, noon south, set WSW)
  sunDirection(hour, out) {
    const a = Math.PI * (hour - 5.9) / 13.2;        // 0 at sunrise … π at sunset
    const el = Math.sin(a) * THREE.MathUtils.degToRad(74);
    const hx = Math.cos(a), hz = 0.35 + Math.sin(a) * 0.25;
    const len = Math.hypot(hx, hz);
    out.set((hx / len) * Math.cos(el), Math.sin(el), (hz / len) * Math.cos(el));
    return out;
  }

  setHour(hour, force = false) {
    this.hour = hour;
    const d = this.sunDirection(hour, this.sunDir);
    const elev = d.y;                                  // -1..1
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(d);
    const day = smooth(-0.08, 0.25, elev);             // 0 night … 1 day
    const golden = 1 - smooth(0.02, 0.35, Math.abs(elev)) ;
    u.turbidity.value = lerp(2.5, 6, golden);
    u.rayleigh.value = lerp(0.6, 1.6, day) + golden * 1.2;

    // Directional light: sun by day, moon by night
    const moonMode = elev < -0.03;
    if (moonMode) {
      const md = this.tmpMoon || (this.tmpMoon = new THREE.Vector3());
      md.set(-0.45, 0.62, 0.35).normalize();
      this.lightDir = md;
      this.sun.color.setHex(0x9db6ff);
      this.sun.intensity = 0.55;
    } else {
      this.lightDir = d;
      this.tmpC.setRGB(1, lerp(0.62, 0.97, smooth(0.0, 0.4, elev)), lerp(0.38, 0.92, smooth(0.0, 0.45, elev)));
      this.sun.color.copy(this.tmpC);
      this.sun.intensity = lerp(0.4, 2.8, smooth(-0.03, 0.4, elev));
    }
    this.base = { hemi: lerp(0.1, 0.3, day), envI: lerp(0.1, 0.42, day), exp: lerp(1.15, 0.86, day) };
    this.hemi.intensity = this.base.hemi;
    this.hemi.color.setHex(day > 0.5 ? 0xc7dcff : 0x6d84c2);
    this.hemi.groundColor.setHex(day > 0.5 ? 0xd8c09a : 0x3a3550);
    this.scene.environmentIntensity = this.base.envI;

    // Fog colour
    const f = this.scene.fog.color;
    if (elev > 0.3) f.copy(this.fogDay);
    else if (elev > 0.0) f.copy(this.fogDawn).lerp(this.fogDay, smooth(0.0, 0.3, elev));
    else f.copy(this.fogNight).lerp(this.fogDawn, smooth(-0.14, 0.0, elev));
    this.scene.fog.density = lerp(0.0016, 0.0011, day);

    this.renderer.toneMappingExposure = this.base.exp;
    this.starMat.opacity = 1 - smooth(-0.12, 0.02, elev);
    this.moon.material.opacity = 1 - smooth(-0.05, 0.15, elev);
    this.moon.position.set(-0.45, 0.62, 0.35).normalize().multiplyScalar(2400);
    this.isNight = elev < -0.02;
    this.daylight = day;

    if (force || Math.abs(hour - this.lastEnvHour) > 0.2) this.updateEnvMap();
  }

  updateEnvMap() {
    this.lastEnvHour = this.hour;
    const old = this.envRT;
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 2000);
    this.scene.environment = this.envRT.texture;
    // metals get their own, stronger reflections so gold looks like gold
    for (const m of this.metalMats || []) { m.envMap = this.envRT.texture; m.needsUpdate = !m._hadEnv; m._hadEnv = true; }
    setBakedEnvMap(this.envRT.texture);
    if (old) old.dispose();
  }

  // Keep the shadow frustum centred on the player, snapped to texels
  follow(target) {
    const ext = 96, size = this.sun.shadow.mapSize.x;
    const texel = ext / size;
    const tx = Math.round(target.x / texel) * texel, tz = Math.round(target.z / texel) * texel;
    this.followTarget.set(tx, target.y, tz);
    const dir = this.lightDir || this.sunDir;
    this.sun.position.copy(this.followTarget).addScaledVector(dir, 130);
    this.sun.target.position.copy(this.followTarget);
    this.stars.position.copy(target);
  }
}
