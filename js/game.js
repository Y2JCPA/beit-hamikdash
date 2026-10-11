// Avodah — the game orchestrator.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { P, MIZBEACH, HEICHAL, AZARA, EZRAT_NASHIM, HORNS, CORNERS, SAVE_KEY, SAVE_PREFIX, SETTINGS_KEY } from './config.js';
import { buildMaterials, MAT } from './materials.js';
import { Physics } from './physics.js';
import { buildWorld } from './world.js';
import { Environment } from './sky.js';
import { Fire, SmokeColumn, Particles, Marker, lightShaft } from './fx.js';
import { makeCharacter, makeAnimal, makeItem, makeInstrument, setBakedEnvMap, disposeBaked, SKIN_TONES, HAIR_COLORS } from './characters.js';
import { Crowd, crowdLayout, Doves } from './crowd.js';
import { Player, CameraRig } from './player.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { audio, noteFreq } from './audio.js';
import { Minigames } from './minigames.js';
import { QuestRunner } from './questRunner.js';
import { Nav } from './nav.js';
import { DAILY, VISITORS, setNpcPosResolver, shirForToday } from './quests.js';
import { PLACES, MIRACLES, ACHIEVEMENTS, TITLES, NPC_NAMES } from './data.js';

const $ = (s) => document.querySelector(s);
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const TOP = MIZBEACH.topH;

function loadSettings() {
  const def = { quality: 'auto', music: 0.7, sfx: 0.85, camSpeed: 1, guided: true, readAloud: false, facts: 'auto' };
  try { return { ...def, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return def; }
}

export class Game {
  constructor() {
    this.settings = loadSettings();
    this.ui = new UI();
    this.minigames = new Minigames();
    this.audio = audio;
    this.mode = 'loading';
    this.t = 0;
    this.npcs = {};
    this.walkers = [];
    this.visitors = [];
    this.bloodMarks = [];
    this.props = {};
    this.camOverride = null;
    this.camTween = null;
    this.camLook = new THREE.Vector3();
    this.hour = 7;
    this.hourTween = null;
    this.state = null;
    this.saveTimer = 0;
    this.lastZone = '';
    this.interiorMix = 0;
    this.tmp = new THREE.Vector3();
    this.labelTimer = 0;
  }

  // ───────────────────────── Boot ─────────────────────────
  async init() {
    const ui = this.ui;
    ui.loading(0.03, 'Gathering Jerusalem stone…');
    // fonts are only needed for the painted signs: let them download while textures are painted
    const fontsReady = Promise.race([document.fonts?.ready, new Promise(r => setTimeout(r, 1500))]);
    let q = this.settings.quality;
    const touch = matchMedia('(pointer: coarse)').matches;
    if (q === 'auto') q = touch ? 'medium' : 'high';
    this.quality = q;
    ui.touch = touch;
    ui.phone = touch && Math.min(innerWidth, innerHeight) < 600;
    document.body.classList.toggle('phone', ui.phone);
    document.body.classList.toggle('touch', touch);
    ui.readAloud = !!this.settings.readAloud;
    ui.factMode = this.settings.facts === 'auto' ? (touch ? 'compact' : 'full') : this.settings.facts;
    this.adaptive = this.settings.quality === 'auto';

    // Renderer
    const renderer = this.renderer = new THREE.WebGLRenderer({ antialias: q !== 'high', powerPreference: 'high-performance' });
    // phones start at 1x (the 3D view is the costly part; the UI stays crisp), tablets a bit higher
    const phoneish = touch && Math.min(innerWidth, innerHeight) < 600;
    this.phoneish = phoneish;
    const prCap = q === 'high' ? 2 : q === 'medium' ? (phoneish ? 1.0 : touch ? 1.25 : 1.35) : 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, prCap));
    renderer.setSize(innerWidth, innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.7;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = q !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    $('#app').appendChild(renderer.domElement);
    const scene = this.scene = new THREE.Scene();
    const camera = this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 9000);
    camera.position.set(120, 60, 80);

    await nextFrame();
    ui.loading(0.15, 'Carving the ashlars…');
    await nextFrame();
    await buildMaterials(q, touch, (f) => ui.loading(0.15 + f * 0.25, 'Carving the ashlars…'));
    ui.loading(0.4, 'Building the Beit HaMikdash…');
    await fontsReady;
    await nextFrame();
    this.physics = new Physics();
    this.world = buildWorld(scene, this.physics, q);
    ui.loading(0.62, 'Lighting the fire on the Mizbeach…');
    await nextFrame();

    this.env = new Environment(renderer, scene, q);
    this.env.metalMats = [MAT.gold, MAT.goldBright, MAT.goldRelief, MAT.silver, MAT.bronze];
    for (const m of this.env.metalMats) m.envMapIntensity = 0.9;
    this.env.setHour(7.2, true);
    this.setupFX();
    ui.loading(0.75, 'Calling the Kohanim and Leviim…');
    await nextFrame();
    this.setupNPCs();
    setBakedEnvMap(this.env.envRT.texture);
    const people = crowdLayout();
    this.crowd = new Crowd(scene, people);
    // people and standing NPCs are solid (but don't block the camera)
    for (const pp of people) this.physics.addBox(pp.x - 0.28, pp.y, pp.z - 0.28, pp.x + 0.28, pp.y + 1.5, pp.z + 0.28, false);
    for (const id in this.npcs) { const n = this.npcs[id]; if (!n.path) this.physics.addBox(n.x - 0.3, n.y, n.z - 0.3, n.x + 0.3, n.y + 1.6, n.z + 0.3, false); }
    this.nav = new Nav(this.physics);
    this.doves = new Doves(scene, q === 'low' ? 10 : 22);
    this.input = new Input(renderer.domElement);
    this.input.handlers.key = (code) => this.onKey(code);
    this.input.handlers.canvasDown = () => audio.init();
    this.player = new Player(scene, this.physics, { skin: SKIN_TONES[1], hair: HAIR_COLORS[0] });
    this.player.teleport(P.spawn.x, EZRAT_NASHIM.floorY, P.spawn.z, -Math.PI / 2);
    this.rig = new CameraRig(camera, this.physics);
    this.runner = new QuestRunner(this);
    setNpcPosResolver((id) => {
      const n = this.npcs[id];
      return n ? { x: n.x + Math.sin(n.facing) * 1.1, y: n.y, z: n.z + Math.cos(n.facing) * 1.1 } : { x: 0, y: 0, z: 0 };
    });
    this.setupPost();
    this.perf = { t: 0, n: 0, pr: renderer.getPixelRatio(), max: renderer.getPixelRatio(), min: 0.7, stage: 0, good: 0, wait: 0 };
    if (touch) { this.rig.followDelay = 0.5; this.rig.followRate = 1.7; }
    this.applyFov();
    $('#guide-desk').addEventListener('click', (e) => { e.currentTarget.blur(); this.input.guidePressed = true; });
    ui.loading(0.92, 'Tuning the kinor…');
    await nextFrame();
    this.bindUI();
    addEventListener('resize', () => this.onResize());
    // warm up shaders
    this.renderer.compile(scene, camera);
    ui.loading(1, 'Ready!');
    this.clock = new THREE.Clock();
    this.mode = 'title';
    this.showTitle();
    ui.hideLoading();
    this.loop();
    window.__game = this;
  }

  setupPost() {
    const q = this.quality;
    this.composer = null;
    if (q === 'low') return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q === 'high' ? 4 : 0 });
    const composer = new EffectComposer(this.renderer, rt);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.45, 0.5, 1.6);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  // a wider lens when the phone is held upright, so you still see around you
  applyFov() {
    this.camera.fov = innerWidth / innerHeight < 0.8 ? 72 : 58;
    this.camera.updateProjectionMatrix();
  }

  setPixelRatio(pr) {
    const pf = this.perf;
    pf.pr = Math.max(pf.min, Math.min(pf.max, pr));
    this.renderer.setPixelRatio(pf.pr);
    this.renderer.setSize(innerWidth, innerHeight);
    if (this.composer) { this.composer.setPixelRatio(pf.pr); this.composer.setSize(innerWidth, innerHeight); }
  }

  // Keep phones smooth: lower the resolution when frames are slow, raise it when there's room.
  // Nothing here ever forces shaders to recompile (that would freeze a phone for seconds).
  adaptPerformance(raw) {
    const pf = this.perf;
    pf.t += raw; pf.n++;
    if (pf.t < 3) return;
    const fps = pf.n / pf.t;
    pf.t = 0; pf.n = 0;
    if (this.mode !== 'play' || document.hidden || this.camOverride) return;
    if (pf.wait > 0) { pf.wait--; return; }
    // few, decisive steps: each resolution change re-creates the frame buffers (a small hitch)
    if (fps < 40 && pf.pr > pf.min + 0.01) { this.setPixelRatio(fps < 25 ? pf.min : pf.pr - 0.15); pf.good = 0; pf.wait = 1; return; }
    if (fps < 26 && pf.stage === 0 && this.bloom) { pf.stage = 1; this.bloom.enabled = false; pf.wait = 1; return; }
    if (fps < 22 && pf.stage === 1) { pf.stage = 2; this.renderer.shadowMap.autoUpdate = false; this.lazyShadows = true; return; }
    if (fps > 58) { if (++pf.good >= 4 && pf.pr < pf.max - 0.01) { this.setPixelRatio(pf.pr + 0.1); pf.good = 0; } }
    else pf.good = 0;
  }

  // With lazy shadows the shadow map is only redrawn when the player has moved a bit
  updateLazyShadows() {
    const p = this.player.pos, last = this._shadowAt || (this._shadowAt = p.clone().addScalar(99));
    const now = performance.now();
    if (last.distanceToSquared(p) > 16 || now - (this._shadowT || 0) > 2500) {
      last.copy(p); this._shadowT = now;
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  updateLocalLight(night) {
    const L = this.localLight, k = this.interiorMix, m = P.menorah;
    if (k > 0.02 || !night) {
      L.position.set(m.x + 1.5, 3 + 4.5, m.z - 2.2);
      L.color.setHex(0xffc070);
      L.distance = 34;
      L.intensity = (6 + this.lampsLit * 5) + 20 * k;
    } else {
      L.position.set(42, 16, 0);
      L.color.setHex(0xffb060);
      L.distance = 60;
      L.intensity = 120;
    }
  }

  buzz(ms) { try { if (this.ui.touch) navigator.vibrate?.(ms); } catch { } }

  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.applyFov();
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    if (this.composer) {
      this.composer.setSize(innerWidth, innerHeight);
    }
  }

  // ───────────────────────── FX ─────────────────────────
  setupFX() {
    const scene = this.scene;
    this.fires = this.world.fires.map(f => new Fire(scene, new THREE.Vector3(f.x, f.y, f.z), f.scale, f.main ? 11 : 7));
    this.fireBig = this.fires[0];
    this.smoke = new SmokeColumn(scene, new THREE.Vector3(P.fireBig.x, TOP + 2, P.fireBig.z), { height: 40, size: 3.6, opacity: 0.36 });
    this.smokeExtra = 0;
    this.fireLight = new THREE.PointLight(0xff8a3a, 60, 38, 1.6);
    this.fireLight.position.set(P.fireBig.x, TOP + 2.2, P.fireBig.z);
    scene.add(this.fireLight);
    const fx = this.fx = {
      sparkles: new Particles(scene, 700, true),
      dust: new Particles(scene, 500, false),
      incense: new Particles(scene, 400, false),
    };
    fx.sparkle = (x, y, z, o) => fx.sparkles.emit(x, y, z, o);
    this.markers = [new Marker(scene, 0xffd36e)];
    this.optMarkers = [0, 1, 2, 3].map(() => new Marker(scene, 0xffffff, { beam: false, size: 0.8 }));

    // Heichal interior lights
    const m = P.menorah;
    // One movable "local" light does three jobs: the Menorah's glow, the Heichal's fill light
    // indoors, and the Simchat Beit HaShoevah lamps at night. Every extra light costs every pixel.
    this.localLight = new THREE.PointLight(0xffb45a, 14, 30, 1.2);
    this.localLight.position.set(m.x, 3 + 2.8, m.z - 0.6);
    scene.add(this.localLight);
    // Menorah flames
    this.lampFires = this.world.menorahLamps.map((p, i) => {
      const f = new Fire(scene, p.clone().setY(p.y - 0.06), 0.085, 3, false);
      f.uniforms.uIntensity.value = 0.45;
      f.setVisible(i === 0);
      return f;
    });
    this.lampsLit = 1;
    // lamp towers of Simchat Beit HaShoevah (night only)
    this.towerFires = this.world.lampTowers.map(p => new Fire(scene, p, 0.6, 5));
    // Light shafts through the Heichal windows
    this.shafts = [];
    for (const x of [-42, -37.5, -33]) {
      this.shafts.push(lightShaft(scene, new THREE.Vector3(x, 19.5, 4.6), new THREE.Vector3(x + 2.5, 3.1, -2), 1.1, 0xfff0c8, 0.07));
    }
    // Props
    this.props.machta = makeItem('machta');
    this.props.machta.position.set(P.machtaStand.x, 1.0, P.machtaStand.z);
    this.props.machta.rotation.y = 0.6;
    scene.add(this.props.machta);
    const ash = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), MAT.ash);
    ash.scale.y = 0.4; ash.position.set(P.ashPlace.x, 0, P.ashPlace.z);
    ash.visible = false; scene.add(ash);
    this.props.ashPile = ash;
    this.props.altarCoals = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), MAT.ember);
    this.props.altarCoals.scale.y = 0.35;
    this.props.altarCoals.position.copy(this.world.goldAltarTop);
    this.props.altarCoals.visible = false;
    scene.add(this.props.altarCoals);
  }

  // ───────────────────────── NPCs ─────────────────────────
  addNPC(id, opts, x, z, facing, extra = {}) {
    const ch = makeCharacter(opts);
    const y = this.physics.groundAt(x, z, 10, 20);
    ch.group.position.set(x, y, z);
    ch.group.rotation.y = facing;
    ch.group.traverse(o => { if (o.isMesh && o.geometry.boundingSphere?.radius > 0.1) o.castShadow = true; });
    this.scene.add(ch.group);
    const n = { id, char: ch, x, y, z, facing, ...extra };
    this.npcs[id] = n;
    return n;
  }

  setupNPCs() {
    const K = (o = {}) => ({ role: 'kohen', skin: SKIN_TONES[o.s ?? 1], hair: HAIR_COLORS[o.h ?? 0], beard: o.beard ?? true });
    this.addNPC('memuneh', { ...K({ h: 4, s: 1 }), hair: 0xd8d4cc }, P.memuneh.x, P.memuneh.z, -Math.PI / 2 - 0.5, { name: NPC_NAMES.memuneh.name, icon: '👴' });
    const av = this.addNPC('avtinas', K({ h: 1, s: 2 }), P.avtinas.x, P.avtinas.z, Math.PI / 2, { name: NPC_NAMES.avtinas.name, icon: '🧔' });
    av.char.setHeld(makeItem('kaf'));
    const wk = this.addNPC('winekohen', K({ h: 2, s: 0 }), P.wineSpot.x + 1.3, P.wineSpot.z, -Math.PI / 2, { name: NPC_NAMES.winekohen.name, icon: '🧔' });
    wk.char.setHeld(makeItem('wine'));
    // Leviim on the Duchan
    const inst = ['kinor', 'nevel', 'kinor', 'metziltayim', 'kinor', 'nevel', 'kinor', 'kinor'];
    const names = ['Asaf', 'Heiman', 'Yedutun', 'Ben Arza', 'Yoel', 'Shmuel', 'Elkanah', 'Berachyah'];
    const zs = [-10.8, -8.6, -6.4, -4.2, 4.2, 6.4, 8.6, 10.8];
    this.leviim = zs.map((z, i) => {
      const n = this.addNPC('levi' + i, { role: 'levi', skin: SKIN_TONES[(i * 3 + 1) % 5], hair: HAIR_COLORS[i % 5], beard: i % 3 !== 2, robe: 0xeef0f4, accent: [0x3d5a8a, 0x6b4f7a, 0xc79a3e][i % 3] }, 14.0, z, -Math.PI / 2, { name: i === 3 ? 'Ben Arza the Levi' : i < 3 ? `${names[i]} the Levi` : `${names[i]} of Beit ${['Asaf', 'Heiman', 'Yedutun'][i % 3]}`, icon: '🎶', instrument: inst[i] });
      n.char.setHeld(makeInstrument(inst[i]));
      return n;
    });
    // Two Kohanim with silver trumpets by the Kevesh (Tamid 7:3)
    this.trumpeters = [[-6.2, 15], [-6.2, 17]].map(([x, z], i) => {
      const n = this.addNPC('trump' + i, K({ h: i + 1, s: i * 2 }), x, z, Math.PI / 2 + 0.3, { name: 'Kohen with chatzotzrot', icon: '🎺', instrument: 'chatzotzrot' });
      n.char.setHeld(makeInstrument('chatzotzrot'));
      return n;
    });
    // Kohanim at work (walking loops)
    const loops = [
      [[4.5, TOP, -9], [4.5, TOP, 1.5], [-4.5, TOP, 1.5], [-4.5, TOP, -9]],
      [[-13.5, 0, 0], [-9.5, 0, 12], [0, 0, 22], [10.5, 0, 10], [10.5, 0, -14], [-2, 0, -24], [-12, 0, -16]],
      [[-15.2, 0, 6], [-15.2, 0, -6]],
    ];
    loops.forEach((pts, i) => {
      const n = this.addNPC('walker' + i, K({ h: (i + 2) % 5, s: (i + 3) % 5, beard: i !== 2 }), pts[0][0], pts[0][2], 0, { name: 'Kohen', icon: '🙂' });
      n.path = pts.map(([x, y, z]) => new THREE.Vector3(x, y, z));
      n.pi = 1; n.speed = 1.3 + i * 0.2; n.wait = 0;
      n.y = pts[0][1];
      this.walkers.push(n);
    });
    // lambs in the pen
    this.penLambObjs = [];
    for (let i = 0; i < 4; i++) {
      const a = makeAnimal('lamb');
      a.pos = new THREE.Vector3(-15.5 + i * 1.9, 0, -32 + (i % 2) * 1.2);
      a.target = a.pos.clone(); a.facing = Math.random() * 6; a.wait = Math.random() * 3;
      a.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
      this.scene.add(a.group);
      this.penLambObjs.push(a);
    }
    this.penVisible = 4;
  }

  penLambs(delta) {
    this.penVisible = Math.max(0, Math.min(4, this.penVisible + delta));
    this.penLambObjs.forEach((a, i) => { a.group.visible = i < this.penVisible; });
  }

  updateNPCs(dt) {
    const t = this.t;
    for (const id in this.npcs) {
      const n = this.npcs[id];
      if (n.path) {
        if (n.wait > 0) { n.wait -= dt; n.char.update(dt, 0); continue; }
        const tg = n.path[n.pi];
        const dx = tg.x - n.x, dz = tg.z - n.z, d = Math.hypot(dx, dz);
        if (d < 0.2) { n.pi = (n.pi + 1) % n.path.length; n.wait = Math.random() < 0.4 ? 1 + Math.random() * 2 : 0; }
        else {
          n.x += dx / d * n.speed * dt; n.z += dz / d * n.speed * dt;
          const f = Math.atan2(dx, dz);
          n.facing += Math.atan2(Math.sin(f - n.facing), Math.cos(f - n.facing)) * Math.min(1, dt * 6);
        }
        const gy = this.physics.groundAt(n.x, n.z, n.y + 0.5, 0.5);
        n.y += (gy - n.y) * Math.min(1, dt * 10);
        n.char.group.position.set(n.x, n.y, n.z);
        n.char.group.rotation.y = n.facing;
        n.char.update(dt, d < 0.2 ? 0 : n.speed);
      } else {
        n.char.update(dt, 0);
      }
    }
    // pen lambs wander
    for (const a of this.penLambObjs) {
      if (!a.group.visible) continue;
      const d = a.target.distanceTo(a.pos);
      let sp = 0;
      if (d < 0.1) { a.wait -= dt; if (a.wait < 0) { a.target.set(-16.3 + Math.random() * 6.6, 0, -33.3 + Math.random() * 3.2); a.wait = 2 + Math.random() * 5; } }
      else {
        sp = 0.7;
        const dx = a.target.x - a.pos.x, dz = a.target.z - a.pos.z;
        a.pos.x += dx / d * sp * dt; a.pos.z += dz / d * sp * dt;
        const f = Math.atan2(dx, dz);
        a.facing += Math.atan2(Math.sin(f - a.facing), Math.cos(f - a.facing)) * Math.min(1, dt * 4);
      }
      a.group.position.copy(a.pos); a.group.rotation.y = a.facing; a.baseY = 0;
      a.update(dt, sp);
    }
    if (this.extraKohanim) for (const c of this.extraKohanim) c.update(dt, 0);
    for (const v of this.visitors) {
      v.char.update(dt, v.walkSpeed || 0);
      if (v.animal) { v.animal.update(dt, 0); }
    }
  }

  // ───────────────────────── Title ─────────────────────────
  showTitle() {
    this.mode = 'title';
    this._starting = false;
    this.ui.show('#title', true);
    this.ui.show('#hud', false);
    this.ui.show('#mobile', false);
    this.setHourNow(7.1);
    this.renderProfiles();
  }

  profiles() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '[]'); } catch { return []; } }
  saveProfiles(p) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(p)); } catch { } }

  renderProfiles() {
    const list = $('#profile-list');
    const ps = this.profiles();
    list.innerHTML = ps.length ? '' : '<div style="text-align:center;color:#8a6a2a;padding:6px">No Kohanim yet — create one to begin!</div>';
    ps.forEach(p => {
      const d = document.createElement('div');
      d.className = 'profile';
      d.innerHTML = `<div class="p-av">${p.kg ? '👑' : '🕊️'}</div><div><div class="p-name"></div><div class="p-info">⭐ ${p.stars || 0} · ${p.title || 'Young Kohen'}</div></div><button class="p-del" title="Delete">🗑️</button>`;
      d.querySelector('.p-name').textContent = p.name;
      d.onclick = (e) => { if (e.target.closest('.p-del')) return; audio.init(); this.startProfile(p.id); };
      d.querySelector('.p-del').onclick = (e) => {
        e.stopPropagation();
        if (confirm(`Delete ${p.name}?`)) {
          this.saveProfiles(this.profiles().filter(x => x.id !== p.id));
          try { localStorage.removeItem(SAVE_PREFIX + p.id); } catch { }
          this.renderProfiles();
        }
      };
      list.appendChild(d);
    });
  }

  bindUI() {
    let skin = 1, hair = 0;
    const sw = (el, colors, sel, set) => {
      el.innerHTML = '';
      colors.forEach((c, i) => {
        const s = document.createElement('div');
        s.className = 'swatch' + (i === sel ? ' sel' : '');
        s.style.background = '#' + c.toString(16).padStart(6, '0');
        s.onclick = () => { set(i); [...el.children].forEach((x, j) => x.classList.toggle('sel', j === i)); audio.play('click'); };
        el.appendChild(s);
      });
    };
    $('#btn-new-profile').onclick = () => {
      audio.init();
      $('#np-name').value = '';
      sw($('#np-skin'), SKIN_TONES, skin, (i) => skin = i);
      sw($('#np-hair'), HAIR_COLORS, hair, (i) => hair = i);
      this.ui.show('#new-profile', true);
      setTimeout(() => $('#np-name').focus(), 50);
    };
    $('#np-cancel').onclick = () => this.ui.show('#new-profile', false);
    const create = () => {
      if (this._starting) return;
      const name = $('#np-name').value.trim() || 'Kohen';
      const ps = this.profiles();
      const id = 'k' + Date.now();
      ps.push({ id, name, stars: 0, title: 'Young Kohen' });
      this.saveProfiles(ps);
      try { localStorage.setItem(SAVE_PREFIX + id, JSON.stringify(this.newState(name, skin, hair))); } catch { }
      this.ui.show('#new-profile', false);
      this.startProfile(id);
    };
    $('#np-go').onclick = create;
    $('#np-name').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.repeat) create(); e.stopPropagation(); });
    const hudBtn = (id, fn) => { $(id).onclick = (e) => { e.currentTarget.blur(); if (this.locked) return; fn(); }; };
    hudBtn('#btn-journal', () => this.openJournal());
    hudBtn('#btn-achieve', () => { audio.play('click'); this.ui.openAchievements(this.state); });
    hudBtn('#btn-settings', () => this.openSettings());
    $('#prompt').addEventListener('pointerdown', (e) => { e.preventDefault(); this.input.actionDown = true; this.input.actionPressed = true; });
    $('#prompt').addEventListener('pointerup', () => { this.input.actionDown = false; });
    $('#prompt').addEventListener('pointerleave', () => { this.input.actionDown = false; });
    $('#title').addEventListener('pointerdown', () => audio.init());
    // phones only allow sound after a touch — start it on the very first touch anywhere
    document.addEventListener('pointerdown', () => audio.init(), { capture: true, passive: true });
    const skip = () => { if (this.skippable) this.cineSkip = true; };
    document.addEventListener('pointerdown', skip, true);
    addEventListener('keydown', (e) => { if (['Space', 'Enter', 'KeyE', 'Escape'].includes(e.code)) skip(); }, true);
  }

  openJournal() { audio.play('click'); this.ui.openJournal(this.state); }
  openSettings() {
    audio.play('click');
    this.ui.openSettings(this.settings, (k, v) => {
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { }
      if (k === 'music' || k === 'sfx') audio.setVolumes(this.settings.music, this.settings.sfx);
      if (k === 'camSpeed') this.rig.sens = v;
      if (k === 'readAloud') { this.ui.readAloud = v; if (!v) this.ui.stopSpeaking(); }
      if (k === 'facts') this.ui.factMode = v;
    }, { toTitle: () => this.toTitle() });
  }

  async toTitle() {
    // a clean reload is the safest way to drop every running async flow
    this.save();
    await this.ui.fade(true);
    location.reload();
  }

  // true while something else owns the screen (dialogs, cut-scenes, mini-games)
  get locked() {
    return this.ui.dialogOpen || this.ui.modalOpen || this.minigames.busy || this.runner.busy || this.player.frozen || !!this.camOverride;
  }

  newState(name, skin, hair) {
    return {
      name, skin, hair, stars: 0, dailyIndex: 0, dayDone: false, days: 0, dayOffset: 0,
      visitorsDone: [], visitorsEver: [], achievements: [], discovered: [], miracles: [], facts: [],
      kg: false, wearKG: false, questStars: {}, intro: false, night: false,
    };
  }

  // ───────────────────────── Start a profile ─────────────────────────
  async startProfile(id) {
    if (this.mode !== 'title' || this._starting) return;
    this._starting = true;
    audio.init();
    audio.setVolumes(this.settings.music, this.settings.sfx);
    this.rig.sens = this.settings.camSpeed;
    let st = null;
    try { st = JSON.parse(localStorage.getItem(SAVE_PREFIX + id) || 'null'); } catch { }
    const prof = this.profiles().find(p => p.id === id);
    if (!st) st = this.newState(prof?.name || 'Kohen', 1, 0);
    st = { ...this.newState(st.name, st.skin, st.hair), ...st };
    if (!DAILY[st.dailyIndex]) st.dailyIndex = 0;
    if (st.dayDone && !st.night && VISITORS.every(d => st.visitorsDone.includes(d.id))) st.night = true;
    this.state = st;
    this.profileId = id;
    await this.ui.fade(true);
    this.ui.show('#title', false);
    this.player.setLook({ skin: SKIN_TONES[st.skin ?? 1], hair: HAIR_COLORS[st.hair ?? 0], kohenGadol: !!(st.kg && st.wearKG) });
    // where to begin
    if (st.dailyIndex === 0 && !st.dayDone) this.player.teleport(P.spawn.x, EZRAT_NASHIM.floorY, P.spawn.z, -Math.PI / 2);
    else this.player.teleport(12, 0, 2.5, -Math.PI / 2);
    this.rig.yaw = this.player.facing + Math.PI;
    this.rig.pitch = 0.28;
    this.rig.snap(this.player);
    this.resetDayProps();
    this.mode = 'play';
    this.ui.show('#hud', true);
    this.ui.show('#mobile', this.ui.touch);
    this.refreshCard();
    if (st.dayDone) {
      this.setHourNow(st.night ? 20.3 : 10.5);
      this.lightAllLamps();
      this.spawnVisitors();
    } else {
      this.setHourNow(DAILY[st.dailyIndex]?.hour ?? 5.2);
      if (st.dailyIndex > 2) this.setHourNow(Math.max(6.4, DAILY[st.dailyIndex].hour));
      if (st.dailyIndex > 4) this.lightAllLamps();
    }
    this.ui.fade(false);
    if (!st.intro) {
      st.intro = true;
      await this.introCinematic();
      await this.ui.dialog({
        icon: '🎮', name: 'How to play',
        text: this.ui.touch
          ? 'Put your thumb anywhere on the LEFT side and slide to walk (slide far to run). Drag on the RIGHT side to look around. Tap ✋ to act — some things need you to HOLD it. Lost? Tap 🧭 and your Kohen walks there by himself! Swipe away any card that is in your way.'
          : 'Walk with W A S D or the arrow keys (hold Shift to run). Drag with the mouse to look around. When a golden prompt appears, press E — some things need you to HOLD E. Follow the golden light — or press G (🧭 Guide me) to walk there automatically!',
        buttons: [{ label: 'Let\'s go! ▶', value: true }],
      });
    }
    this.maybeRotateHint();
    if (!st.dayDone) this.startDaily(st.dailyIndex);
    else {
      this.ui.toast(st.night ? '🌙 Imagine it\'s Sukkot — the Simchat Beit HaShoevah lamps are lit! Explore, or talk to Elazar for a new day.' : '❗ Visitors are waiting in Ezrat Yisrael!');
    }
    this.save();
  }

  maybeRotateHint() {
    if (!this.ui.phone || innerWidth > innerHeight) return;
    try { if (localStorage.getItem('mikdash3_rotate')) return; localStorage.setItem('mikdash3_rotate', '1'); } catch { }
    const d = document.createElement('div');
    d.id = 'rotate-hint';
    d.innerHTML = '📱↔️<br>Tip: turn your phone sideways<br>for a bigger view!';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 5200);
  }

  resetDayProps() {
    // restore the courtyard to match how far through the day this Kohen is
    const st = this.state || { dailyIndex: 0, dayDone: false };
    const idx = st.dayDone ? 99 : st.dailyIndex;
    this.bloodMarks.forEach(m => { this.scene.remove(m); m.geometry.dispose(); });
    this.bloodMarks = [];
    this.props.ashPile.visible = idx > 1;
    this.props.machta.visible = true;
    this.props.altarCoals.visible = idx > 5;
    if (this.props.basket) { this.scene.remove(this.props.basket); disposeBaked(this.props.basket); this.props.basket = null; }
    this.penLambs(idx > 3 ? 3 : 4);
    const lit = idx > 4;
    this.lampFires.forEach((f, i) => f.setVisible(lit || i === 0));
    this.lampsLit = lit ? 7 : 1;
  }

  refreshCard() {
    const st = this.state;
    const title = [...TITLES].reverse().find(t => st.stars >= t.stars) || TITLES[0];
    this.ui.setPlayerCard(st.name, title.name, st.stars, st.kg && st.wearKG ? '👑' : '🙂');
    const ps = this.profiles();
    const p = ps.find(x => x.id === this.profileId);
    if (p) { p.stars = st.stars; p.title = title.name; p.kg = st.kg; this.saveProfiles(ps); }
  }

  save() {
    if (!this.state || !this.profileId) return;
    try { localStorage.setItem(SAVE_PREFIX + this.profileId, JSON.stringify(this.state)); } catch { }
  }

  // ───────────────────────── Quest flow ─────────────────────────
  async startDaily(i) {
    const q = DAILY[i];
    if (!q) return;
    this.state.dailyIndex = i;
    if (q.hour && Math.abs(this.hour - q.hour) > 0.05) this.setHour(Math.max(this.hour, q.hour), 2.5);
    if (q.id === 'menorah') { this.lampFires.forEach((f, k) => f.setVisible(k === 0)); this.lampsLit = 1; }
    if (q.id === 'deshen') this.props.machta.visible = true;
    for (const line of q.intro || []) await this.say(line.who, line.text);
    this.runner.start(q);
  }

  async onQuestComplete(q, stars, mistakes) {
    const st = this.state;
    if (q.id === 'shir' && this.shirResult) stars = this.shirResult.stars;
    const prev = st.questStars[q.id];
    // first time: the stars you earned; replays: any improvement, and at least one bonus star
    const gained = prev === undefined ? stars : Math.max(1, stars - prev);
    st.questStars[q.id] = Math.max(prev || 0, stars);
    st.stars += gained;
    if (q.achievement) this.achieve(q.achievement);
    if (q.korban && mistakes === 0) this.achieve('perfect');
    if (q.id === 'shir' && stars === 3) this.achieve('music3');
    this.refreshCard();
    audio.play('complete');
    const p = this.player.pos;
    this.fx.sparkle(p.x, p.y + 1.5, p.z, { count: 70, color: 0xffd36e, color2: 0xffffff, speed: 3, up: 3, size: 0.28 });
    const lines = [];
    if (q.outroFact) {
      lines.push(`<p>📜 ${q.outroFact[0]}<br><span class="src">— ${q.outroFact[1]}</span></p>`);
      this.recordFact(q.title, q.outroFact[0], q.outroFact[1]);
    }
    lines.push(`<p>⭐ +${gained} star${gained === 1 ? '' : 's'}${mistakes ? ` · ${mistakes} thing${mistakes === 1 ? '' : 's'} to remember for next time` : ' · Perfect!'}</p>`);
    await this.ui.celebrate({ icon: q.icon, title: `${q.title} — complete!`, stars, lines });
    if (q.after) await q.after(this);
    this.save();

    if (q.visitor) return this.finishVisitor(q);
    const idx = DAILY.findIndex(d => d.id === q.id);
    if (idx >= 0) {
      if (idx + 1 < DAILY.length) { st.dailyIndex = idx + 1; this.save(); this.startDaily(idx + 1); }
      else await this.dayComplete();
    }
  }

  async dayComplete() {
    const st = this.state;
    st.dayDone = true; st.days++; st.dailyIndex = 0;
    this.achieve('day');
    this.save();
    await this.cinematicOrbit(7, 'You finished a whole day of Avodah in the Beit HaMikdash!', 'יְהִי רָצוֹן שֶׁיִּבָּנֶה בֵּית הַמִּקְדָּשׁ');
    await this.ui.celebrate({
      icon: '☀️', title: 'A full day of Avodah!', stars: 3,
      lines: [
        '<p class="he">אַשְׁרֵי עַיִן רָאֲתָה כָּל אֵלֶּה</p>',
        '<p>"Fortunate is the eye that saw all this!" — that\'s what people said about the Avodah in the Beit HaMikdash.</p>',
        '<p>🧺 Now visitors from all over Eretz Yisrael have come with their own korbanot. Find everyone with a <b>❗</b> in Ezrat Yisrael!</p>',
      ],
    });
    this.setHour(10.5, 4);
    this.spawnVisitors();
  }

  // ───────────────────────── Visitors ─────────────────────────
  spawnVisitors() {
    this.clearVisitors();
    for (const def of VISITORS) {
      if (this.state.visitorsDone.includes(def.id)) continue;
      const o = def.npc;
      const ch = makeCharacter({ role: o.role, beard: o.beard, robe: o.robe, accent: o.accent, skin: SKIN_TONES[(def.id.length) % 5], hair: HAIR_COLORS[def.id.length % 5] });
      const facing = -Math.PI / 2;
      ch.group.position.set(o.at.x, 0, o.at.z);
      ch.group.rotation.y = facing;
      ch.group.traverse(m => { if (m.isMesh) m.castShadow = true; });
      this.scene.add(ch.group);
      const v = { def, char: ch, x: o.at.x, y: 0, z: o.at.z, facing, pos: () => ({ x: o.at.x - 1.1, y: 0, z: o.at.z }) };
      if (o.animal) {
        v.animal = makeAnimal(o.animal);
        v.animal.group.position.set(o.at.x - 0.3, 0, o.at.z + 1.2);
        v.animal.group.rotation.y = facing;
        this.scene.add(v.animal.group);
      }
      if (def.id === 'bikkurim') {
        ch.setHeld(makeItem('basket'));
        v.animal = makeAnimal('ox');
        v.animal.group.position.set(o.at.x + 0.6, 0, o.at.z - 1.8);
        v.animal.group.rotation.y = facing;
        this.scene.add(v.animal.group);
      }
      if (def.id === 'miriam') ch.setHeld(makeItem('tor'));
      if (def.id === 'chana') ch.setHeld(makeItem('mincha'));
      this.visitors.push(v);
    }
  }
  clearVisitors() {
    for (const v of this.visitors) { this.removeVisitorModels(v); this.ui.removeLabel('v_' + v.def.id); }
    this.visitors = [];
  }

  removeVisitorModels(v) {
    this.scene.remove(v.char.group); disposeBaked(v.char.group);
    if (v.animal) { this.scene.remove(v.animal.group); disposeBaked(v.animal.group); }
  }

  // the visitor walks over (e.g. for semicha) and later back to his place
  visitorComeTo(pos) {
    const v = this.visitor;
    if (!v) return Promise.resolve();
    const to = { x: pos.x + 0.9, z: pos.z + 0.4 };
    return this.walkVisitor(v, to);
  }
  visitorGoHome() {
    const v = this.visitor;
    if (v) this.walkVisitor(v, v.def.npc.at, -Math.PI / 2);
  }
  walkVisitor(v, to, endFacing) {
    return new Promise((resolve) => {
      v.x = v.char.group.position.x; v.z = v.char.group.position.z;
      const start = performance.now();
      this.tasks = this.tasks || [];
      this.tasks.push((dt) => {
        const dx = to.x - v.x, dz = to.z - v.z, d = Math.hypot(dx, dz);
        // finish the last stretch instantly if it takes too long (keeps the scene snappy)
        if (d < 0.25 || performance.now() - start > 3500) {
          v.x = to.x; v.z = to.z; v.walkSpeed = 0;
          v.char.group.position.set(v.x, this.physics.groundAt(v.x, v.z, 1, 0.5), v.z);
          if (endFacing !== undefined) v.char.group.rotation.y = endFacing;
          resolve(); return true;
        }
        const sp = Math.min(8, Math.max(3, d / 2));
        v.x += dx / d * sp * dt; v.z += dz / d * sp * dt;
        v.char.group.position.set(v.x, this.physics.groundAt(v.x, v.z, 1, 0.5), v.z);
        v.char.group.rotation.y = Math.atan2(dx, dz);
        v.walkSpeed = sp;
        return false;
      });
    });
  }

  async talkVisitor(v) {
    if (this.runner.active) {
      await this.say({ icon: '🙂', name: v.def.npc.name }, 'Please finish the avodah you are doing first — I\'ll wait right here!');
      return;
    }
    const ok = await this.ui.dialog({ icon: v.def.icon, name: v.def.npc.name, text: v.def.intro[0].text, buttons: [{ label: 'Not now', value: false }, { label: 'Yes, I\'ll help! ▶', value: true }] });
    if (!ok) return;
    this.visitor = v;
    v.char.setHeld(null);
    if (v.animal && v.def.id !== 'bikkurim') { this.scene.remove(v.animal.group); disposeBaked(v.animal.group); v.animal = null; }
    const q = { ...v.def, visitor: true, steps: v.def.steps({ name: v.def.npc.name, pos: v.pos }), achievement: null };
    this.runner.start(q);
  }

  async finishVisitor(q) {
    const st = this.state;
    const v = this.visitors.find(x => x.def.id === q.id);
    if (v) {
      v.char.group.lookAt(this.player.pos.x, 0, this.player.pos.z);
      await this.say({ icon: v.def.icon, name: v.def.npc.name }, v.def.thanks);
      // walk away through Nikanor
      this.walkAway(v);
    }
    if (!st.visitorsDone.includes(q.id)) st.visitorsDone.push(q.id);
    if (!st.visitorsEver.includes(q.id)) st.visitorsEver.push(q.id);
    this.achieve('visitor');
    this.visitor = null;
    if (VISITORS.every(d => st.visitorsEver.includes(d.id))) this.achieve('visitors');
    this.save();
    if (VISITORS.every(d => st.visitorsDone.includes(d.id))) await this.allVisitorsDone();
  }

  walkAway(v) {
    this.ui.removeLabel('v_' + v.def.id);
    v.leaving = true;
    const startX = v.x, startZ = v.z;
    let t = 0;
    const step = (dt) => {
      t += dt;
      const tx = 22, tz = 0;
      const dx = tx - v.x, dz = tz - v.z, d = Math.hypot(dx, dz);
      if (d < 0.5 || t > 12) {
        this.removeVisitorModels(v);
        this.visitors = this.visitors.filter(x => x !== v);
        return true;
      }
      v.x += dx / d * 1.6 * dt; v.z += dz / d * 1.6 * dt;
      v.facing = Math.atan2(dx, dz);
      v.char.group.position.set(v.x, this.physics.groundAt(v.x, v.z, 1, 0.5), v.z);
      v.char.group.rotation.y = v.facing;
      v.walkSpeed = 1.6;
      if (v.animal) { v.animal.group.position.set(v.x - dx / d * 1.3, 0, v.z - dz / d * 1.3); v.animal.group.rotation.y = v.facing; v.animal.update(dt, 1.6); }
      return false;
    };
    this.tasks = this.tasks || [];
    this.tasks.push(step);
  }

  async allVisitorsDone() {
    const st = this.state;
    if (!st.kg) {
      st.kg = true; st.wearKG = true;
      this.achieve('kohen_gadol');
      await this.ui.celebrate({
        icon: '👑', title: 'The garments of the Kohen Gadol!', stars: 0, maxStars: 0,
        lines: [
          '<p>You helped everyone! As a reward, imagine you are the Kohen Gadol — only he wore these 8 garments:</p>',
          '<p>💙 The <b>Me\'il</b> — a techelet robe with golden bells and pomegranates (listen when you walk!)<br>🌈 The <b>Ephod</b> and the <b>Choshen</b> with 12 stones — one for each tribe<br>✨ The <b>Tzitz</b> — a golden plate saying "Kodesh LaHashem"</p>',
          '<span class="src">Shemot 28; Yoma 7:5</span>',
        ],
        button: 'Imagine it! 👑',
      });
      this.player.setLook({ ...this.player.look, kohenGadol: true });
      this.refreshCard();
    }
    this.player.frozen = true;
    this.ui.cine(true, 'Evening falls… Imagine it is Sukkot: the great golden lamps of Simchat Beit HaShoevah light up all of Yerushalayim!', 'שִׂמְחַת בֵּית הַשּׁוֹאֵבָה');
    this.beginSkippable();
    await this.setHour(20.2, 6);
    this.endSkippable();
    this.ui.cine(false);
    this.player.frozen = false;
    st.night = true;
    this.save();
    await this.say('memuneh', 'What a day! Explore the Mikdash at night — look at the lamps in Ezrat Nashim! (They were lit on the nights of Sukkot.) When you\'re ready for a new day, come talk to me.');
    this.fact('On the nights of Sukkot, young Kohanim climbed ladders to fill the giant golden lamps, and the light shone into every courtyard in Yerushalayim!', 'Sukkah 5:2-3', '🏮 Simchat Beit HaShoevah');
  }

  async newDay() {
    const st = this.state;
    st.dayDone = false; st.dailyIndex = 0; st.dayOffset++; st.visitorsDone = []; st.night = false;
    this.clearVisitors();
    await this.ui.fade(true);
    this.resetDayProps();
    this.setHourNow(5.15);
    this.player.teleport(12, 0, 2.5, -Math.PI / 2);
    this.rig.yaw = this.player.facing + Math.PI; this.rig.snap(this.player);
    this.ui.fade(false);
    this.save();
    this.startDaily(0);
  }

  // ───────────────────────── Helpers used by quests ─────────────────────────
  wait(s) { return new Promise(r => setTimeout(r, s * 1000)); }

  say(who, text, he) {
    let icon = '🙂', name = '';
    if (typeof who === 'string') {
      if (who === 'visitor' && this.visitor) { icon = this.visitor.def.icon; name = this.visitor.def.npc.name; }
      else { const n = NPC_NAMES[who] || this.npcs[who]; icon = n?.icon || '🙂'; name = n?.name || ''; }
    } else { icon = who.icon; name = who.name; }
    return this.ui.dialog({ icon, name, text, he });
  }

  recordFact(title, text, src) {
    const st = this.state;
    if (!st) return;
    if (!st.facts.some(f => f.text === text)) st.facts.push({ title, text, src });
  }
  fact(text, src, title) {
    this.ui.fact(title || 'Did you know?', text, src);
    this.recordFact(title || this.runner.q?.title || 'Did you know?', text, src);
  }

  miracle(id) {
    const st = this.state;
    if (!st || st.miracles.includes(id)) return;
    st.miracles.push(id);
    const m = MIRACLES.find(x => x.id === id);
    this.ui.banner('🌟', 'Miracle found!', m.name);
    audio.play('discover');
    this.fact(m.text, m.src, '🌟 ' + m.name);
    if (MIRACLES.every(x => st.miracles.includes(x.id))) this.achieve('miracles');
    this.save();
  }

  achieve(id) {
    const st = this.state;
    if (!st || st.achievements.includes(id)) return;
    st.achievements.push(id);
    const a = ACHIEVEMENTS.find(x => x.id === id);
    if (a) { this.ui.toast(`🏆 Achievement: ${a.icon} ${a.name}`); audio.play('star'); }
  }

  mistakeSoft() { this.runner.softMistake(); }

  smokeBurst() { this.smokeExtra = 1; }

  addBloodMark(id, top) {
    const M = MIZBEACH;
    const mk = (x, y, z, w, h, d) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT.blood);
      m.position.set(x, y, z);
      this.scene.add(m); this.bloodMarks.push(m);
    };
    const sx = Math.sign(CORNERS[id].x - M.cx), sz = Math.sign(CORNERS[id].z - M.cz);
    if (!top) {
      // one placement touches two sides of the corner, below the red line
      const o = M.body / 2 + 0.012;
      mk(M.cx + sx * o, 1.5, M.cz + sz * (o - 0.45), 0.02, 0.5, 0.7);
      mk(M.cx + sx * (o - 0.45), 1.5, M.cz + sz * o, 0.7, 0.5, 0.02);
    } else {
      const h = HORNS[id];
      const hx = M.cx + sx * (M.top / 2 - M.hornS / 2), hz = M.cz + sz * (M.top / 2 - M.hornS / 2);
      mk(hx - sx * 0.02, TOP + 0.3, hz - sz * 0.02, M.hornS + 0.03, 0.2, M.hornS + 0.03);
    }
  }

  nearestSpout() {
    let best = null, bd = 1e9;
    for (const s of this.world.kiyorSpouts) { const d = s.distanceTo(this.player.pos); if (d < bd) { bd = d; best = s; } }
    return best;
  }

  get menorahLamps() { return this.world.menorahLamps; }
  lightLamp(i) {
    this.lampFires[i].setVisible(true);
    this.lampsLit = this.lampFires.filter(f => f.mesh.visible).length;
    const p = this.world.menorahLamps[i];
    this.fx.sparkle(p.x, p.y, p.z, { count: 14, color: 0xffd36e, speed: 0.6, up: 0.5, size: 0.08 });
  }
  lightAllLamps() { this.lampFires.forEach(f => f.setVisible(true)); this.lampsLit = 7; }

  goldAltarCoals(on) { this.props.altarCoals.visible = on; }
  ketoretPuff(n) {
    const p = this.world.goldAltarTop;
    this.fx.incense.emit(p.x, p.y + 0.3, p.z, { count: n, color: 0xf3eefa, color2: 0xe3d7f0, speed: 0.5, up: 0.5, gravity: 0.25, life: 7, size: 1.6, spread: 0.5 });
  }
  placeBasket() {
    const b = makeItem('basket');
    b.position.set(CORNERS.SW.x + 1.2, 0.12, CORNERS.SW.z + 0.4);
    this.scene.add(b);
    this.props.basket = b;
  }
  leviimSing(secs) {
    this.leviim.forEach(l => l.char.pose = 'work');
    this.musicBoost = secs;
    setTimeout(() => this.leviim.forEach(l => l.char.pose = 'idle'), secs * 1000);
  }

  // ── Camera control for close-ups & cinematics ──
  tweenCam(toPos, toLook, dur = 1) {
    const fromPos = this.camera.position.clone(), fromLook = this.camLook.clone();
    this.camOverride = { pos: fromPos.clone(), look: fromLook.clone() };
    this.rig.override = this.camOverride;
    return new Promise(resolve => {
      this.camTween = { fromPos, fromLook, toPos: toPos.clone(), toLook: toLook.clone(), t: 0, dur, resolve };
    });
  }
  closeUp(pos, look) { this.player.frozen = true; return this.tweenCam(pos, look, 0.9); }
  async releaseCam() {
    // compute the follow pose then tween to it
    const ov = this.rig.override;
    this.rig.override = null;
    const saved = this.camera.position.clone();
    this.rig.update(0.016, this.player, { lookDX: 0, lookDY: 0, zoom: 0, lastLookAt: 0 }, true);
    const tp = this.camera.position.clone();
    const tl = this.rig.smoothTarget.clone().add(new THREE.Vector3(0, 0.1, 0));
    this.camera.position.copy(saved);
    this.rig.override = ov;
    await this.tweenCam(tp, tl, 0.7);
    this.rig.override = null;
    this.camOverride = null;
    this.player.frozen = false;
  }

  updateCamTween(dt) {
    const tw = this.camTween;
    if (!tw) return;
    tw.t += dt;
    if (this.skippable && this.cineSkip) tw.t = tw.dur;
    const k = ease(Math.min(1, tw.t / tw.dur));
    this.camOverride.pos.lerpVectors(tw.fromPos, tw.toPos, k);
    this.camOverride.look.lerpVectors(tw.fromLook, tw.toLook, k);
    if (tw.t >= tw.dur) { this.camTween = null; tw.resolve(); }
  }

  project(v) {
    const p = this.tmp.copy(v).project(this.camera);
    return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight, visible: p.z < 1 && p.z > -1 };
  }

  // ───────────────────────── Cinematics ─────────────────────────
  // ── Skippable story cinematics (tap / key to skip) ──
  beginSkippable() { this.skippable = true; this.cineSkip = false; document.getElementById('cine-skip').classList.remove('hidden'); }
  endSkippable() { this.skippable = false; this.cineSkip = false; document.getElementById('cine-skip').classList.add('hidden'); }
  cineWait(s) {
    return new Promise(res => {
      const t0 = performance.now();
      const iv = setInterval(() => { if (this.cineSkip || performance.now() - t0 > s * 1000) { clearInterval(iv); res(); } }, 60);
    });
  }

  async introCinematic() {
    this.beginSkippable();
    this.player.frozen = true;
    this.ui.show('#hud', false);
    const shots = [
      [new THREE.Vector3(140, 70, 95), new THREE.Vector3(-10, 10, 0), new THREE.Vector3(95, 34, 40), new THREE.Vector3(-20, 18, 0), 5, 'Yerushalayim, long ago… the Beit HaMikdash stands on Har HaBayit.', 'בֵּית הַמִּקְדָּשׁ'],
      [new THREE.Vector3(60, 4, 0), new THREE.Vector3(-20, 22, 0), new THREE.Vector3(40, 3, 0), new THREE.Vector3(-20, 18, 0), 4.5, 'Today, you are a young Kohen — and it\'s your first day of Avodah!', 'עֲבוֹדָה'],
    ];
    this.ui.cine(true);
    for (const [p0, l0, p1, l1, dur, cap, he] of shots) {
      this.ui.cine(true, cap, he);
      this.camera.position.copy(p0); this.camLook.copy(l0);
      this.camOverride = { pos: p0.clone(), look: l0.clone() };
      this.rig.override = this.camOverride;
      await this.tweenCam(p1, l1, dur);
    }
    this.ui.cine(false);
    this.endSkippable();
    this.ui.show('#hud', true);
    await this.releaseCam();
  }

  async barkai() {
    this.beginSkippable();
    this.player.frozen = true;
    this.ui.show('#hud', false);
    this.ui.cine(true, 'A Kohen on the roof calls out: "Barkai! The sky is lit all the way to Chevron!"', 'בַּרְקַאי!');
    this.camOverride = { pos: this.camera.position.clone(), look: this.camLook.clone() };
    this.rig.override = this.camOverride;
    const tw = this.tweenCam(new THREE.Vector3(-14, 12, -2), new THREE.Vector3(80, 18, 12), 2.5);
    this.setHour(6.3, 7);
    setTimeout(() => audio.trumpet('tashrat', 0.3), 1600);
    await tw;
    await this.cineWait(5);
    this.endSkippable();
    this.ui.cine(false);
    this.ui.show('#hud', true);
    this.fact('Each morning a Kohen climbed up high to watch the sky. When the whole east was bright to Chevron, he called "Barkai!" — and the Tamid could begin.', 'Tamid 3:2', '🌅 Barkai!');
    await this.releaseCam();
  }

  async birkatKohanim(verses) {
    const pl = this.player;
    pl.frozen = true;
    pl.facing = Math.PI / 2;
    pl.setHeld([]);
    pl.char.pose = 'raise';
    // more Kohanim join on the steps
    const extra = [-2.4, 2.4, -4.8, 4.8].map((dz, i) => {
      const ch = makeCharacter({ role: 'kohen', skin: SKIN_TONES[(i * 2 + 1) % 5], hair: HAIR_COLORS[(i + 1) % 5], beard: i % 2 === 0 });
      const x = pl.pos.x + (i < 2 ? 0.4 : 0.9), z = pl.pos.z + dz;
      ch.group.position.set(x, this.physics.groundAt(x, z, 4, 1), z);
      ch.group.rotation.y = Math.PI / 2;
      ch.pose = 'raise';
      this.scene.add(ch.group);
      return ch;
    });
    this.extraKohanim = extra;
    this.crowd.lookAt = new THREE.Vector3(-17, 0, 0);
    this.ui.show('#hud', false);
    this.camOverride = { pos: this.camera.position.clone(), look: this.camLook.clone() };
    this.rig.override = this.camOverride;
    await this.tweenCam(new THREE.Vector3(-11.2, 3.9, 4.2), new THREE.Vector3(-17.6, 3.7, 0), 1.6);
    await this.minigames.verses(verses, (i) => {
      audio.bell(noteFreq(i * 2, 1), 0.14, 0, 2); audio.bell(noteFreq(i * 2 + 4, 1), 0.1, 0.05, 2);
      for (let k = 0; k < 30; k++) this.fx.sparkle(15 + Math.random() * 4, 4 + Math.random() * 2, (Math.random() - 0.5) * 50, { count: 2, color: 0xffe08a, speed: 0.3, up: -0.3, gravity: -0.6, life: 3, size: 0.25 });
      this.tweenCam(new THREE.Vector3(-11.2 - i * 0.4, 3.9 + i * 0.25, 4.2 - i * 4.2), new THREE.Vector3(-17.6, 3.8, 0), 3);
    });
    this.ui.cine(true, 'All the people answer together:', 'בָּרוּךְ שֵׁם כְּבוֹד מַלְכוּתוֹ לְעוֹלָם וָעֶד');
    this.crowd.setBow(true);
    audio.play('success');
    await this.tweenCam(new THREE.Vector3(-19.5, 6.5, -1.5), new THREE.Vector3(16, 1.5, 0), 2);
    await this.wait(3.2);
    this.crowd.setBow(false);
    this.ui.cine(false);
    extra.forEach(c => { this.scene.remove(c.group); disposeBaked(c.group); });
    this.extraKohanim = null;
    this.crowd.lookAt = null;
    pl.char.pose = 'idle';
    this.ui.show('#hud', true);
    await this.releaseCam();
  }

  async shirShelYom() {
    const shir = shirForToday(this.state.dayOffset);
    this.player.frozen = true;
    this.ui.show('#hud', false);
    this.camOverride = { pos: this.camera.position.clone(), look: this.camLook.clone() };
    this.rig.override = this.camOverride;
    await this.tweenCam(new THREE.Vector3(5.5, 2.6, -1.2), new THREE.Vector3(14, 1.7, 0.6), 1.4);
    this.ui.cine(true, `Today is ${shir.day} — the Leviim sing Tehillim ${shir.tehillim}: ${shir.en}`, shir.he);
    await this.wait(3.6);
    this.ui.cine(false);
    this.leviim.forEach(l => l.char.pose = 'work');
    this.inRhythm = true;
    const res = await this.minigames.rhythm({
      title: `🎵 Cue the Leviim — Shir Shel Yom for ${shir.day} (Tehillim ${shir.tehillim})`, verse: shir.he, chart: shir.chart,
      onSection: () => {
        audio.trumpet('tashrat', 0.3);
        this.trumpeters.forEach(t => t.char.pose = 'raise');
        this.crowd.setBow(true);
        this.ui.toast('🎺 At each pause the Kohanim blow the trumpets — and everyone bows!');
        setTimeout(() => { this.crowd.setBow(false); this.trumpeters.forEach(t => t.char.pose = 'idle'); }, 2300);
      },
    });
    this.inRhythm = false;
    this.shirResult = res;
    this.leviim.forEach(l => l.char.pose = 'idle');
    this.fact('At each pause in the song, the Kohanim blew the silver trumpets and all the people bowed down.', 'Tamid 7:3', '🎺 The Shir');
    this.ui.show('#hud', true);
    await this.releaseCam();
  }

  async cinematicOrbit(secs, caption, he) {
    this.beginSkippable();
    this.player.frozen = true;
    this.ui.show('#hud', false);
    this.ui.cine(true, caption, he);
    this.camOverride = { pos: this.camera.position.clone(), look: this.camLook.clone() };
    this.rig.override = this.camOverride;
    const start = performance.now();
    await this.tweenCam(new THREE.Vector3(-8 + Math.cos(0.3) * 46, 22, Math.sin(0.3) * 46), new THREE.Vector3(-8, 8, 0), 1.5);
    this.orbitCam = { a0: 0.3, r: 46, h: 22, cx: -8, cz: 0, t0: this.t };
    await this.cineWait(secs);
    this.endSkippable();
    this.orbitCam = null;
    this.ui.cine(false);
    this.ui.show('#hud', true);
    await this.releaseCam();
  }

  // ───────────────────────── Time of day ─────────────────────────
  setHourNow(h) { this.hourTween?.resolve(); this.hour = h; this.hourTween = null; this.env.setHour(h, true); }
  setHour(h, secs) {
    this.hourTween?.resolve();
    return new Promise(r => { this.hourTween = { from: this.hour, to: h, t: 0, dur: secs, resolve: r }; });
  }

  // ───────────────────────── Input ─────────────────────────
  onKey(code) {
    if (this.minigames.busy) { this.minigames.key(code); return; }
    if (this.mode !== 'play') return;
    if (code !== 'Escape' && code !== 'KeyJ') return;
    if (this.ui.closePanel()) return;
    if (this.locked) return;
    if (code === 'Escape') this.openSettings(); else this.openJournal();
  }

  // free (non-quest) interactions
  nearestInteraction() {
    const p = this.player.pos;
    let best = null, bd = 2.8;
    const consider = (d, obj) => { if (d < bd) { bd = d; best = obj; } };
    const near = (x, z, y = 0) => Math.abs(p.y - y) < 1.8 ? Math.hypot(p.x - x, p.z - z) : 99;
    const memu = this.npcs.memuneh;
    consider(near(memu.x, memu.z, memu.y), { type: 'memuneh', text: 'Talk to Elazar', icon: '💬' });
    for (const l of this.leviim) consider(near(l.x - 1.0, l.z, 0) * 1.0, { type: 'levi', levi: l, text: `Listen to ${l.name}`, icon: '🎵' });
    for (const t of this.trumpeters) consider(near(t.x, t.z), { type: 'trumpet', text: 'Hear the chatzotzrot', icon: '🎺' });
    for (const v of this.visitors) if (!v.leaving) consider(near(v.x - 1, v.z) - 0.3, { type: 'visitor', v, text: `Talk to ${v.def.npc.name}`, icon: '❗' });
    consider(near(this.npcs.avtinas.x, this.npcs.avtinas.z), { type: 'chat', who: 'avtinas', text: 'Talk to Pinchas', icon: '💬' });
    consider(near(this.npcs.winekohen.x, this.npcs.winekohen.z), { type: 'chat', who: 'winekohen', text: 'Talk to Yosef', icon: '💬' });
    if (p.x < HEICHAL.hallMinX + 2.5 && p.y > 2) consider(Math.abs(p.x - HEICHAL.hallMinX) , { type: 'paroches', text: 'The Paroches', icon: '🚫' });
    if (Math.hypot(p.x - P.lambPen.x, p.z - P.lambPen.z) < 2.6 && !this.runner.active) consider(2, { type: 'lamb', text: 'Pet the lambs', icon: '🐑' });
    return best;
  }

  async doInteraction(it) {
    switch (it.type) {
      case 'memuneh': {
        const st = this.state;
        if (this.runner.active) { await this.say('memuneh', 'You are doing great! ' + this.runner.step.text + '.'); break; }
        if (st.dayDone && st.night && !this.hourTween) {
          const ok = await this.ui.dialog({ icon: '👴', name: NPC_NAMES.memuneh.name, text: 'Ready to start a brand-new day of Avodah? (The Leviim will sing a different Shir!)', buttons: [{ label: 'Not yet', value: false }, { label: 'New day! ☀️', value: true }] });
          if (ok) this.newDay();
        } else if (st.dayDone) {
          const left = VISITORS.filter(v => !st.visitorsDone.includes(v.id)).length;
          if (left) await this.say('memuneh', `${left} visitor${left === 1 ? ' is' : 's are'} waiting in Ezrat Yisrael with korbanot. Look for the ❗!`);
          else { const ok = await this.ui.dialog({ icon: '👴', name: NPC_NAMES.memuneh.name, text: 'Wonderful work today! Ready for a brand-new day?', buttons: [{ label: 'Not yet', value: false }, { label: 'New day! ☀️', value: true }] }); if (ok) this.newDay(); }
        } else await this.say('memuneh', 'Let\'s continue the Avodah!');
        break;
      }
      case 'levi': {
        const inst = it.levi.instrument;
        const info = {
          kinor: ['The Kinor (lyre) — the main instrument of the Leviim. At least 9 kinorot played every day!', 'Arachin 2:5'],
          nevel: ['The Nevel — a big harp with a deep sound. Between 2 and 6 were played.', 'Arachin 2:3'],
          metziltayim: ['Ben Arza played the Metziltayim — only ONE pair of cymbals, to start each part of the song.', 'Tamid 7:3; Arachin 2:5'],
        }[inst];
        it.levi.char.pose = 'work';
        setTimeout(() => it.levi.char.pose = 'idle', 1600);
        if (inst === 'metziltayim') audio.cymbal(0.4);
        else [0, 2, 4, 7].forEach((d, i) => audio.pluck(noteFreq(d + (it.levi.z > 0 ? 2 : 0), inst === 'nevel' ? -1 : 1), (audio.ctx?.currentTime ?? 0) + i * 0.18, 0.5, inst));
        this.fact(info[0], info[1], it.levi.name);
        break;
      }
      case 'trumpet':
        this.trumpeters.forEach(t => t.char.pose = 'raise');
        audio.trumpet('tashrat', 0.3);
        setTimeout(() => this.trumpeters.forEach(t => t.char.pose = 'idle'), 2500);
        this.fact('The Chatzotzrot were silver trumpets, blown by Kohanim. They blew tekiah-teruah-tekiah!', 'Bamidbar 10:2; Sukkah 5:5', 'Chatzotzrot');
        break;
      case 'visitor': await this.talkVisitor(it.v); break;
      case 'chat':
        await this.say(it.who, it.who === 'avtinas'
          ? 'Our family, Beit Avtinas, prepares the Ketoret. We never wore perfume, so no one could say we used the Ketoret for ourselves!'
          : 'I hold the wine for the nesachim. Wine and oil and flour come with many korbanot!');
        break;
      case 'paroches':
        await this.say('memuneh', 'Behind the Paroches is the Kodesh HaKodashim, with the Even HaShetiyah — the Foundation Stone of the world. Only the Kohen Gadol may enter, only on Yom Kippur.');
        this.discover('paroches');
        break;
      case 'lamb':
        audio.play('baa');
        this.fact('There were always at least six checked lambs ready in the Lishkat HaTla\'im.', 'Arachin 2:5', '🐑 Baa!');
        break;
    }
  }

  // ───────────────────────── Guide me ─────────────────────────
  // Where would "Guide me" walk to right now?
  guideTarget() {
    const s = this.runner.step;
    if (this.runner.active) {
      if (!s || s.kind === 'auto' || s.noMarker) return null;
      const t = this.runner.target(s);
      return t ? { x: t.x, y: t.y || 0, z: t.z, r: Math.min(s.kind === 'choose' ? 2.3 : (s.r || 2.6), 2.6) } : null;
    }
    const p = this.player.pos;
    const vs = this.visitors.filter(v => !v.leaving);
    if (vs.length) {
      vs.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
      const q = vs[0].pos();
      return { x: q.x, y: 0, z: q.z, r: 2.2 };
    }
    const m = this.npcs.memuneh;
    return { x: m.x + Math.sin(m.facing) * 1.3, y: m.y, z: m.z + Math.cos(m.facing) * 1.3, r: 2.2 };
  }

  stepKey() { return (this.runner.q?.id || '-') + ':' + this.runner.i + ':' + this.runner.k; }

  toggleGuide() {
    // ignore an accidental double-tap right after starting
    if (this.guide && performance.now() - this.guide.started < 1200) return;
    if (this.guide) { this.stopGuide('🧭 Guide off — you\'re walking yourself!'); return; }
    const t = this.guideTarget();
    if (!t) { this.ui.toast(this.runner.step?.noMarker ? '🧭 You can do this anywhere in the Azara!' : '🧭 Nothing to walk to right now'); return; }
    const p = this.player.pos;
    if (Math.hypot(p.x - t.x, p.z - t.z) < t.r - 0.5 && Math.abs(p.y - t.y) < 1.7) { this.ui.toast('✨ You are already here!'); return; }
    const path = this.planTo(t);
    if (!path) { this.ui.toast('🧭 I can\'t find the way from here — walk a little and try again'); return; }
    this.guide = { t, path, i: 0, best: Infinity, lastT: performance.now(), started: performance.now(), fails: 0, key: this.stepKey() };
    this.setGuideButtons(true);
    this.ui.toast(this.ui.touch ? '🧭 Follow me! Touch the joystick to stop' : '🧭 Follow me! Press a move key to stop');
    audio.play('pickup');
  }

  planTo(t) {
    const from = { x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z };
    const cands = [t];
    for (const f of [0.45, 0.7, 0.88]) {
      const rr = Math.max(0.8, t.r * f);
      for (let k = 0; k < 8; k++) cands.push({ x: t.x + Math.cos(k * Math.PI / 4) * rr, y: t.y, z: t.z + Math.sin(k * Math.PI / 4) * rr });
    }
    return this.nav.plan(from, cands);
  }

  stopGuide(msg) {
    if (!this.guide) return;
    this.guide = null;
    this.player.autoDir = null;
    this.setGuideButtons(false);
    if (msg) this.ui.toast(msg);
  }
  setGuideButtons(on) {
    document.getElementById('m-guide').classList.toggle('on', on);
    document.getElementById('guide-desk').classList.toggle('on', on);
    document.getElementById('guide-desk').textContent = on ? '🧭 Stop' : '🧭 Guide me';
  }

  updateGuide(blocked) {
    const g = this.guide, pl = this.player;
    if (!g) { pl.autoDir = null; return; }
    if (this.input.steering) { this.stopGuide(); return; }
    if (g.key !== this.stepKey()) { this.stopGuide(); return; }
    if (blocked || pl.frozen || this.camOverride) { pl.autoDir = null; return; }
    const p = pl.pos, t = g.t;
    if (Math.hypot(p.x - t.x, p.z - t.z) < t.r - 0.6 && Math.abs(p.y - t.y) < 1.7) {
      this.stopGuide('✨ Here we are!');
      this.fx.sparkle(p.x, p.y + 1, p.z, { count: 14, color: 0xffd36e });
      return;
    }
    let wp = g.path[g.i];
    let d = Math.hypot(wp.x - p.x, wp.z - p.z);
    if (d < 0.6 && g.i < g.path.length - 1) { g.i++; g.best = Infinity; wp = g.path[g.i]; d = Math.hypot(wp.x - p.x, wp.z - p.z); }
    if (d > 1e-3) pl.autoDir = { x: (wp.x - p.x) / d, z: (wp.z - p.z) / d };
    const now = performance.now();
    if (d < g.best - 0.25) { g.best = d; g.lastT = now; }
    else if (now - g.lastT > 1800) {
      // stuck (someone in the way?) — plan again from here
      g.fails++;
      const path = g.fails <= 3 ? this.planTo(t) : null;
      if (!path) { this.stopGuide('🧭 Something is in the way — walk around it, then tap 🧭 again'); return; }
      g.path = path; g.i = 0; g.best = Infinity; g.lastT = now;
    }
  }

  // ───────────────────────── Discovery ─────────────────────────
  discover(id) {
    const st = this.state;
    if (!st || st.discovered.includes(id)) return;
    const pl = PLACES.find(p => p.id === id);
    if (!pl) return;
    st.discovered.push(id);
    this.ui.banner('📍', pl.name, pl.he);
    audio.play('discover');
    this.fact(pl.text, pl.src, '📍 ' + pl.name);
    if (id === 'mitbachayim') setTimeout(() => this.miracle('fly'), 2500);
    if (id === 'shulchan') setTimeout(() => this.miracle('lechem'), 2500);
    if (id === 'nikanor') setTimeout(() => this.miracle('nikanor'), 2500);
    if (id === 'ezrat_nashim') setTimeout(() => this.miracle('crowded'), 6000);
    if (PLACES.every(p => st.discovered.includes(p.id))) this.achieve('explorer');
    this.save();
  }

  checkDiscoveries() {
    const p = this.player.pos;
    for (const pl of PLACES) {
      if (this.state.discovered.includes(pl.id)) continue;
      if (Math.hypot(p.x - pl.x, p.z - pl.z) < pl.r && Math.abs(p.y - pl.y) < 3) { this.discover(pl.id); break; }
    }
  }

  zoneOf(p) {
    if (this.player.inHeichal) return ['The Heichal', 'הַהֵיכָל'];
    if (p.x < -18.8 && p.y > 2.5) return ['The Ulam', 'הָאוּלָם'];
    if (p.y > 4 && Math.abs(p.x - MIZBEACH.cx) < 8 && Math.abs(p.z - MIZBEACH.cz) < 8) return ['Top of the Mizbeach', 'רֹאשׁ הַמִּזְבֵּחַ'];
    if (p.x > 21.4) return ['Ezrat Nashim', 'עֶזְרַת נָשִׁים'];
    if (p.x > 14.6) return ['Ezrat Yisrael', 'עֶזְרַת יִשְׂרָאֵל'];
    if (p.z < -12.2 && p.x > -14 && p.x < 8.5) return ['Tzafon — North of the Mizbeach', 'צָפוֹן'];
    return ['The Azara', 'הָעֲזָרָה'];
  }

  // ───────────────────────── Markers ─────────────────────────
  hideMarkers() { this.markers.forEach(m => m.hide()); this.optMarkers.forEach(m => m.hide()); this.ui.edgeArrow(false); }

  updateMarkers() {
    const s = this.runner.step;
    if (!s || this.runner.busy || s.kind === 'auto' || this.camOverride) { this.hideMarkers(); return null; }
    const guided = this.settings.guided || s.kind === 'go';
    const t = this.runner.target(s);
    if (s.kind === 'choose') {
      s.options.forEach((o, i) => {
        const done = s.need.indexOf(o.id) >= 0 && s.need.indexOf(o.id) < this.runner.k;
        if (done) this.optMarkers[i].hide();
        else this.optMarkers[i].show(o.at.x, (o.at.y || 0) + 0.02, o.at.z, 0xffffff);
      });
    } else this.optMarkers.forEach(m => m.hide());
    if (t && guided && !s.noMarker) this.markers[0].show(t.x, (t.y || 0) + 0.02, t.z, 0xffd36e);
    else this.markers[0].hide();
    return (guided && !s.noMarker) ? t : null;
  }

  updateEdgeArrow(t) {
    if (!t || this.camOverride) { this.ui.edgeArrow(false); return; }
    const v = this.tmp.set(t.x, (t.y || 0) + 1.5, t.z);
    const dist = Math.hypot(t.x - this.player.pos.x, t.z - this.player.pos.z);
    v.project(this.camera);
    const behind = v.z > 1;
    let x = v.x, y = v.y;
    if (behind) { x = -x; y = -y; }
    const onScreen = !behind && Math.abs(x) < 0.85 && Math.abs(y) < 0.85;
    if (onScreen || dist < 3) { this.ui.edgeArrow(false); return; }
    const a = Math.atan2(-y, x);
    const m = Math.max(Math.abs(x), Math.abs(y)) || 1;
    x = x / m * 0.86; y = y / m * 0.8;
    this.ui.edgeArrow(true, (x + 1) / 2 * innerWidth, (1 - y) / 2 * innerHeight, a, dist);
  }

  // ───────────────────────── Per-frame ─────────────────────────
  loop() {
    requestAnimationFrame(() => this.loop());
    const raw = this.clock.getDelta();
    const dt = Math.min(raw, 0.05);
    this.realDt = Math.min(raw, 0.25);   // cinematics & tweens follow real time even on slow devices
    this.frames = (this.frames || 0) + 1;
    // test hook: window.__game.turbo = N runs N logic steps per drawn frame (automated play-tests)
    const steps = this.turbo > 1 ? this.turbo : 1;
    for (let k = 0; k < steps; k++) {
      if (steps > 1) this.realDt = 0.05;
      this.t += dt;
      try { this.update(dt); } catch (e) { console.error(e); }
      if (k === 0 && steps > 1) { this.input.actionPressed = false; this.input.jumpPressed = false; this.input.guidePressed = false; }
    }
    // while a menu covers the screen the world barely changes: draw every 3rd frame to save battery
    const idle = this.ui.modalOpen && this.mode === 'play';
    if (!idle || this.frames % 3 === 0) {
      if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    }
    if (this.adaptive) this.adaptPerformance(raw);
    if (this.lazyShadows && this.mode === 'play') this.updateLazyShadows();
    this.input.endFrame();
  }

  update(dt) {
    const t = this.t;
    // time of day tween
    if (this.hourTween) {
      const h = this.hourTween;
      h.t += this.realDt;
      if (this.skippable && this.cineSkip) h.t = h.dur;
      const k = ease(Math.min(1, h.t / h.dur));
      this.hour = h.from + (h.to - h.from) * k;
      this.env.setHour(this.hour);
      if (h.t >= h.dur) { this.hourTween = null; h.resolve(); }
    }
    if (this.tasks) { const rd = this.realDt; this.tasks = this.tasks.filter(fn => !fn(rd)); }

    if (this.mode === 'title') {
      const a = t * 0.05;
      this.camera.position.set(-10 + Math.cos(a) * 150, 62 + Math.sin(t * 0.07) * 8, Math.sin(a) * 150);
      this.camLook.set(-14, 12, 0);
      this.camera.lookAt(this.camLook);
      this.env.follow(new THREE.Vector3(-10, 0, 0));
    } else if (this.mode === 'play') {
      this.updatePlay(dt);
    }
    // shared world animation
    for (const f of this.fires) f.update(t, dt);
    for (const f of this.lampFires) if (f.mesh.visible) f.update(t, dt);
    const night = this.env.isNight;
    for (const f of this.towerFires) { f.setVisible(night); if (night) f.update(t, dt); }

    this.fireLight.intensity = (55 + Math.sin(t * 13) * 6 + Math.sin(t * 7.3) * 8) * (this.fireBig.scale / this.fireBig.base) * (night ? 1.6 : 1);
    this.smokeExtra = Math.max(0, this.smokeExtra - dt * 0.12);
    this.smoke.u.uOpacity.value = 0.32 + this.smokeExtra * 0.4;
    this.smoke.u.uSize.value = 3.4 + this.smokeExtra * 2.5;
    this.smoke.update(t, 0.35 + this.env.daylight * 0.75);
    this.fx.sparkles.update(dt); this.fx.dust.update(dt); this.fx.incense.update(dt);
    for (const m of this.markers) m.update(t);
    for (const m of this.optMarkers) m.update(t);
    this.crowd.update(t, dt);
    this.doves.update(t, dt);
    this.updateNPCs(dt);
    this.updateLocalLight(night);
    this.updateCamTween(this.realDt);
    if (this.orbitCam) {
      const o = this.orbitCam, a = o.a0 + (t - (o.t0 || t)) * 0.12;
      this.camOverride.pos.set(o.cx + Math.cos(a) * o.r, o.h, o.cz + Math.sin(a) * o.r);
      this.camOverride.look.set(o.cx, 8, o.cz);
    }
    if (this.camOverride) { this.camera.position.copy(this.camOverride.pos); this.camLook.copy(this.camOverride.look); this.camera.lookAt(this.camLook); }
    this.minigames.update(Math.min(this.realDt, 0.1), (v) => this.project(v));
    const mg = this.minigames.busy || (!!this.camOverride && this.mode === 'play');
    if (mg !== this._mgClass) { this._mgClass = mg; document.body.classList.toggle('mg', mg); }
  }

  updatePlay(dt) {
    const pl = this.player, input = this.input;
    const blocked = this.ui.dialogOpen || this.ui.modalOpen || this.minigames.busy;
    input.enabled = !blocked && !pl.frozen;
    pl.update(dt, blocked ? { move: () => ({ x: 0, y: 0, run: false }), jumpPressed: false } : input, this.rig.yaw);
    if (!this.camOverride) {
      this.rig.update(dt, pl, blocked ? { lookDX: 0, lookDY: 0, zoom: 0, lastLookAt: input.lastLookAt } : input);
      this.camLook.copy(this.rig.smoothTarget);
    }
    this.env.follow(pl.pos);

    // guide me
    if (input.guidePressed && !blocked && !pl.frozen) this.toggleGuide();
    this.updateGuide(blocked);
    if (!this.ui.touch) {
      const show = !blocked && !pl.frozen && !this.camOverride && (!!this.guide || !!this.guideTarget());
      const gd = document.getElementById('guide-desk');
      if (gd.classList.contains('hidden') === show) gd.classList.toggle('hidden', !show);
    }

    // quest
    let used = false;
    if (!blocked && !pl.frozen) used = this.runner.update(this.realDt, input);
    const tgt = this.updateMarkers();
    this.updateEdgeArrow(this.camOverride ? null : tgt);

    // free interactions
    if (!blocked && !pl.frozen && !used && !this.runner.busy) {
      const it = this.nearestInteraction();
      if (it) {
        this.ui.setPrompt({ text: it.text, icon: it.icon });
        if (input.actionPressed) { this.ui.setPrompt(null); this.doInteraction(it); }
      } else this.ui.setPrompt(null);
    } else if (blocked || pl.frozen) this.ui.setPrompt(null);
    document.getElementById('m-action').classList.toggle('active', !!document.querySelector('#prompt:not(.hidden)'));

    // interior lighting blend
    const inside = pl.inHeichal || (pl.pos.x < -24 && pl.pos.y > 2.5);
    this.interiorMix += ((inside ? 1 : 0) - this.interiorMix) * Math.min(1, dt * 2);
    this.applyInterior();

    // periodic stuff
    this.labelTimer += dt;
    if (this.labelTimer > 0.25) {
      this.labelTimer = 0;
      this.checkDiscoveries();
      const [zn, zh] = this.zoneOf(pl.pos);
      if (zn !== this.lastZone) { this.lastZone = zn; this.ui.zone(zn, zh); }
      this.ui.setClock(this.hour);
      this.updateAmbience();
    }
    this.updateLabels();
    this.ui.drawMinimap(pl.pos, pl.facing - Math.PI, tgt, this.visitors.filter(v => !v.leaving).map(v => ({ x: v.x, z: v.z, color: '#ff9d2e', r: 1.6 })));
    this.saveTimer += dt;
    if (this.saveTimer > 8) { this.saveTimer = 0; this.save(); }
  }

  applyInterior() {
    const k = this.interiorMix;
    // dim sky light indoors so the golden Menorah light dominates
    const b = this.env.base;
    this.scene.environmentIntensity = b.envI * (1 - 0.7 * k);
    this.env.hemi.intensity = b.hemi * (1 - 0.5 * k);

    // metals carry their own env map, so dim their sky reflections indoors too
    const mi = 0.9 * (1 - 0.72 * k);
    if (Math.abs(mi - (this._metalEnv ?? -1)) > 0.01) {
      this._metalEnv = mi;
      for (const m of this.env.metalMats) m.envMapIntensity = mi;
    }
    this.renderer.toneMappingExposure = b.exp * (1 + 0.15 * k);
  }

  updateAmbience() {
    const p = this.player.pos;
    const dFire = Math.hypot(p.x - P.fireBig.x, p.z - P.fireBig.z);
    const dDuchan = Math.hypot(p.x - 13.5, p.z);
    const crowd = Math.max(0, 1 - Math.min(Math.hypot(p.x - 17, p.z) / 30, Math.hypot(p.x - 42, p.z) / 30));
    let music = 0.12 + Math.max(0, 1 - dDuchan / 40) * 0.5;
    if (this.musicBoost > 0) { music = 1; this.musicBoost -= 0.25; }
    if (this.inRhythm) music = 0.0;
    if (this.player.inHeichal) music *= 0.4;
    audio.setAmbience({ fire: Math.max(0, 1 - dFire / 26), crowd, music, birds: this.env.daylight > 0.5 && !this.player.inHeichal });
  }

  updateLabels() {
    const show = (id, wx, wy, wz, html, maxD = 16) => {
      const d = Math.hypot(this.player.pos.x - wx, this.player.pos.z - wz);
      const p = this.project(this.tmp.set(wx, wy, wz));
      this.ui.setLabel(id, html, p.x, p.y, p.visible && d < maxD && !this.camOverride && !this.minigames.busy);
    };
    const m = this.npcs.memuneh;
    show('memuneh', m.x, m.y + 2.15, m.z, `<span class="bubble">👴 Elazar</span>`, 18);
    for (const v of this.visitors) {
      if (v.leaving) continue;
      const busy = this.visitor === v;
      show('v_' + v.def.id, v.x, 2.25, v.z, busy ? `<span class="bubble">${v.def.npc.name}</span>` : `<span class="bang">!</span>`, 60);
    }
  }
}
