/* ============================================
   AVODAH — Beit HaMikdash Simulator (Three.js)
   ============================================ */
(function() {
'use strict';

// ─── Constants ───
const WORLD_SIZE = 50;
const PLAYER_HEIGHT = 1.7;
const PLAYER_SPEED = 5;
const JUMP_FORCE = 7;
const GRAVITY = 18;
const INTERACT_DIST = 4;
const CAM_DISTANCE = 6;
const CAM_HEIGHT_OFFSET = 3;
const PROFILES_KEY = 'mikdash_profiles';
const SAVE_PREFIX = 'mikdash_save_';
const MAX_PROFILES = 10;
const AUTO_SAVE_SEC = 10;

// Zone definitions
const NORTH_ZONE_Z = -8;   // North shechita zone z < this
const AZARA_MIN_X = -18;
const AZARA_MAX_X = 18;
const AZARA_MIN_Z = -18;
const AZARA_MAX_Z = 18;

// Key positions
const MIZBEACH_POS = { x: 0, z: 0 };
const MIZBEACH_SIZE = { w: 8, h: 5, d: 8 };
const KEVESH_POS = { x: 0, z: 6 };
const KIYOR_POS = { x: -6, z: 0 };
const SHIMON_POS = { x: 12, z: 12 };
const DUCHAN_POS = { x: 10, z: -4 };
const SLAUGHTER_POS = { x: 0, z: -12 };

let activeProfileId = null;
function getSaveKey() { return SAVE_PREFIX + activeProfileId; }

const $ = (s) => document.querySelector(s);

// ─── Game State ───
let gameState = {
  coins: 50,
  level: 1,
  inventory: {},
  korbanotCompleted: 0,
  korbanotPerfect: 0,
  achievements: [],
  totalCoinsEarned: 0,
  totalSpent: 0,
  tamidCount: 0,
  bloodTypesCompleted: [],
  instrumentsHeard: [],
  sourcesRead: 0,
  currentAvodah: null,
};

// ─── Three.js Globals ───
let scene, camera, renderer, clock;
let playerModel, playerPos, playerVelocityY = 0, onGround = true;
let cameraAngleY = 0;
let keys = {};
let started = false;
let autoSaveTimer = 0;
let interactTarget = null;

// NPC references
let shimonModel, leviimModels = [], fireParticles = [];
let northZoneMesh;

// Audio
let audioCtx = null;

// Mobile
let isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
let joystickActive = false, joystickDX = 0, joystickDZ = 0;

// Avodah state
let avodahActive = false;
let avodahStep = 0;
let avodahKorban = null;
let avodahMistakes = 0;
let avodahSteps = [];

// ─── Profile System ───
function getProfiles() {
  try { return JSON.parse(localStorage.getItem(PROFILES_KEY)) || []; } catch { return []; }
}
function saveProfiles(profiles) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

function renderProfiles() {
  const list = $('#profile-list');
  list.innerHTML = '';
  const profiles = getProfiles();
  profiles.forEach(p => {
    const card = document.createElement('div');
    card.className = 'profile-card';
    card.innerHTML = `
      <div>
        <div class="profile-name">🕊️ ${p.name}</div>
        <div class="profile-info">Level ${p.level} · 🪙${p.coins || 0} · 🔥${p.korbanot || 0} Korbanot</div>
      </div>
      <button class="profile-delete" data-id="${p.id}" title="Delete">🗑️</button>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.profile-delete')) return;
      loadProfile(p.id);
    });
    card.querySelector('.profile-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Delete ${p.name}?`)) {
        deleteProfile(p.id);
      }
    });
    list.appendChild(card);
  });
}

function deleteProfile(id) {
  let profiles = getProfiles();
  profiles = profiles.filter(p => p.id !== id);
  saveProfiles(profiles);
  localStorage.removeItem(SAVE_PREFIX + id);
  renderProfiles();
}

function createProfile(name, level) {
  const profiles = getProfiles();
  if (profiles.length >= MAX_PROFILES) { alert('Maximum 10 profiles!'); return; }
  const id = 'kohen_' + Date.now();
  profiles.push({ id, name, level, coins: 50, korbanot: 0 });
  saveProfiles(profiles);
  loadProfile(id);
}

function loadProfile(id) {
  activeProfileId = id;
  const profiles = getProfiles();
  const p = profiles.find(x => x.id === id);
  if (!p) return;

  // Reset state
  gameState = {
    coins: 50, level: p.level || 1, inventory: {},
    korbanotCompleted: 0, korbanotPerfect: 0, achievements: [],
    totalCoinsEarned: 0, totalSpent: 0, tamidCount: 0,
    bloodTypesCompleted: [], instrumentsHeard: [], sourcesRead: 0,
    currentAvodah: null,
  };

  // Load saved data
  try {
    const raw = localStorage.getItem(getSaveKey());
    if (raw) {
      const data = JSON.parse(raw);
      Object.keys(data).forEach(k => { if (k in gameState) gameState[k] = data[k]; });
    }
  } catch {}

  $('#login-screen').classList.add('hidden');
  initGame();
}

// ─── Save / Load ───
function saveGame() {
  if (!activeProfileId) return;
  try {
    localStorage.setItem(getSaveKey(), JSON.stringify({ ...gameState, savedAt: Date.now() }));
    // Update profile summary
    const profiles = getProfiles();
    const p = profiles.find(x => x.id === activeProfileId);
    if (p) {
      p.coins = gameState.coins;
      p.korbanot = gameState.korbanotCompleted;
      p.level = gameState.level;
      saveProfiles(profiles);
    }
  } catch {}
}

// ─── Scene Setup ───
function initGame() {
  if (scene) {
    // Cleanup old scene
    while (scene.children.length > 0) scene.remove(scene.children[0]);
    renderer.domElement.remove();
  }

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0x87CEEB, 40, 80);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
  clock = new THREE.Clock();

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  document.body.insertBefore(renderer.domElement, document.body.firstChild);

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff4cc, 1.2);
  sun.position.set(10, 20, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 512;
  sun.shadow.mapSize.height = 512;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 60;
  sun.shadow.camera.left = -25;
  sun.shadow.camera.right = 25;
  sun.shadow.camera.top = 25;
  sun.shadow.camera.bottom = -25;
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0x87CEEB, 0xD4C4A8, 0.3);
  scene.add(hemi);

  buildWorld();
  buildPlayer();
  buildNPCs();
  buildFireEffect();

  playerPos = new THREE.Vector3(0, 0, 14);

  // HUD
  $('#hud').classList.remove('hidden');
  updateHUD();
  updateHotbar();

  if (isMobile) {
    $('#mobile-controls').classList.remove('hidden');
  }

  // Start
  started = true;
  window.addEventListener('resize', onResize);
  if (!window._keysSetup) {
    window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
    setupMouse();
    setupTouch();
    setupButtons();
    window._keysSetup = true;
  }

  // Prevent touch scroll
  renderer.domElement.addEventListener('touchstart', e => { if (started) e.preventDefault(); }, { passive: false });
  renderer.domElement.addEventListener('touchmove', e => { if (started) e.preventDefault(); }, { passive: false });

  animate();
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ─── Build World ───
function buildWorld() {
  // Ground — outer area (earth)
  const outerGround = new THREE.Mesh(
    new THREE.BoxGeometry(80, 0.5, 80),
    new THREE.MeshLambertMaterial({ color: 0xC4B390 })
  );
  outerGround.position.y = -0.25;
  outerGround.receiveShadow = true;
  scene.add(outerGround);

  // Azara floor (stone)
  const azaraFloor = new THREE.Mesh(
    new THREE.BoxGeometry(38, 0.1, 38),
    new THREE.MeshLambertMaterial({ color: 0xF5F0E1 })
  );
  azaraFloor.position.y = 0.01;
  azaraFloor.receiveShadow = true;
  scene.add(azaraFloor);

  // North zone indicator (slightly different color)
  northZoneMesh = new THREE.Mesh(
    new THREE.BoxGeometry(38, 0.05, 10),
    new THREE.MeshLambertMaterial({ color: 0xE8DDD0 })
  );
  northZoneMesh.position.set(0, 0.02, -13);
  scene.add(northZoneMesh);

  // North zone label (small marker stones)
  const markerMat = new THREE.MeshLambertMaterial({ color: 0xC4943E });
  for (let x = -16; x <= 16; x += 8) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.3), markerMat);
    m.position.set(x, 0.08, NORTH_ZONE_Z);
    scene.add(m);
  }

  // Walls
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xE8E0D0 });
  const wallH = 6;
  const walls = [
    { w: 40, d: 1, x: 0, z: -19 },  // North
    { w: 40, d: 1, x: 0, z: 19 },   // South
    { w: 1, d: 40, x: -19, z: 0 },  // West
    { w: 1, d: 40, x: 19, z: 0 },   // East
  ];
  walls.forEach(w => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w.w, wallH, w.d), wallMat);
    mesh.position.set(w.x, wallH / 2, w.z);
    scene.add(mesh);
  });

  // ─── Mizbeach (Outer Altar) ───
  const mizMat = new THREE.MeshLambertMaterial({ color: 0xD4C4A8 });
  const mizbeach = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 8), mizMat);
  mizbeach.position.set(0, 2.5, 0);
  mizbeach.castShadow = true;
  scene.add(mizbeach);

  // Sovev (ledge around mizbeach)
  const sovev = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 9), mizMat);
  sovev.position.set(0, 3, 0);
  scene.add(sovev);

  // Yesod (base)
  const yesod = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 10), new THREE.MeshLambertMaterial({ color: 0xBFAF94 }));
  yesod.position.set(0, 0.25, 0);
  scene.add(yesod);

  // Kranot (4 horns on corners)
  const hornMat = new THREE.MeshLambertMaterial({ color: 0xC8B898 });
  [[-3.5, 5.5, -3.5], [3.5, 5.5, -3.5], [-3.5, 5.5, 3.5], [3.5, 5.5, 3.5]].forEach(pos => {
    const horn = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1, 0.6), hornMat);
    horn.position.set(...pos);
    scene.add(horn);
  });

  // Kevesh (Ramp) — south side
  const keveshMat = new THREE.MeshLambertMaterial({ color: 0xD4C4A8 });
  const kevesh = new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, 8), keveshMat);
  kevesh.position.set(0, 2.5, 8);
  kevesh.rotation.x = Math.atan2(5, 8);
  scene.add(kevesh);

  // ─── Kiyor (Laver) ───
  const kiyorMat = new THREE.MeshLambertMaterial({ color: 0xCD7F32 });
  const kiyorBase = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 1.5), kiyorMat);
  kiyorBase.position.set(KIYOR_POS.x, 0.2, KIYOR_POS.z);
  scene.add(kiyorBase);
  const kiyorPillar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.5, 0.6), kiyorMat);
  kiyorPillar.position.set(KIYOR_POS.x, 1, KIYOR_POS.z);
  scene.add(kiyorPillar);
  const kiyorBowl = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 2), kiyorMat);
  kiyorBowl.position.set(KIYOR_POS.x, 1.8, KIYOR_POS.z);
  scene.add(kiyorBowl);
  // Water
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x4FA4DE, transparent: true, opacity: 0.6 });
  const water = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 1.6), waterMat);
  water.position.set(KIYOR_POS.x, 2.1, KIYOR_POS.z);
  scene.add(water);

  // ─── Ulam (Entrance Hall) — west side ───
  const ulamMat = new THREE.MeshLambertMaterial({ color: 0xE8E0D0 });
  const ulam = new THREE.Mesh(new THREE.BoxGeometry(4, 10, 12), ulamMat);
  ulam.position.set(-17, 5, 0);
  scene.add(ulam);

  // Gold trim on Ulam
  const goldMat = new THREE.MeshLambertMaterial({ color: 0xFFD700 });
  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 10, 12.5), goldMat);
  trim.position.set(-14.9, 5, 0);
  scene.add(trim);

  // Pillars (Yachin & Boaz)
  const pillarMat = new THREE.MeshLambertMaterial({ color: 0xCD7F32 });
  [-3, 3].forEach(z => {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 1), pillarMat);
    pillar.position.set(-14.5, 4, z);
    scene.add(pillar);
    // Capital
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.5, 1.3), goldMat);
    cap.position.set(-14.5, 8.5, z);
    scene.add(cap);
  });

  // ─── Beit HaMitbachayim (Slaughter Area) — north ───
  // Stone rings (for tying animals)
  const ringMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
  for (let x = -4; x <= 4; x += 4) {
    const ring = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), ringMat);
    ring.position.set(x, 0.15, -12);
    scene.add(ring);
    // Hooks (small vertical poles with protrusions)
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.5, 0.2), ringMat);
    pole.position.set(x, 1.25, -13.5);
    scene.add(pole);
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.15), ringMat);
    hook.position.set(x + 0.2, 2.2, -13.5);
    scene.add(hook);
  }

  // ─── Duchan (Levite Platform) — east side ───
  const duchanMat = new THREE.MeshLambertMaterial({ color: 0xD4C4A8 });
  const duchan = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 3), duchanMat);
  duchan.position.set(DUCHAN_POS.x, 0.5, DUCHAN_POS.z);
  scene.add(duchan);

  // ─── Korban Stand (booth) ───
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x8B6914 });
  // Counter
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 1.5), woodMat);
  counter.position.set(SHIMON_POS.x, 0.6, SHIMON_POS.z);
  scene.add(counter);
  // Awning
  const awningMat = new THREE.MeshLambertMaterial({ color: 0xC0392B });
  const awning = new THREE.Mesh(new THREE.BoxGeometry(4, 0.15, 2.5), awningMat);
  awning.position.set(SHIMON_POS.x, 2.8, SHIMON_POS.z);
  scene.add(awning);
  // Poles
  [[-1.5, 0, -0.7], [1.5, 0, -0.7]].forEach(off => {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.8, 0.15), woodMat);
    pole.position.set(SHIMON_POS.x + off[0], 1.4, SHIMON_POS.z + off[2]);
    scene.add(pole);
  });

  // ─── Olive Trees (outside walls) ───
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6D4C41 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x4A7C3F });
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8;
    const dist = 24 + Math.random() * 6;
    const tx = Math.cos(angle) * dist;
    const tz = Math.sin(angle) * dist;
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2, 0.4), trunkMat);
    trunk.position.set(tx, 1, tz);
    scene.add(trunk);
    const leaves = new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 2), leafMat);
    leaves.position.set(tx, 2.5, tz);
    scene.add(leaves);
  }
}

// ─── Build Player (Kohen) ───
function buildPlayer() {
  playerModel = new THREE.Group();

  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xFAFAFA });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xE8C4A0 });
  const beltMat = new THREE.MeshLambertMaterial({ color: 0x4169E1 });

  // Body (white robe)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.4), whiteMat);
  body.position.y = 0.9;
  playerModel.add(body);

  // Belt (Avnet)
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.42), beltMat);
  belt.position.y = 1.0;
  playerModel.add(belt);

  // Head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skinMat);
  head.position.y = 1.65;
  playerModel.add(head);

  // Eyes
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), eyeMat);
  eyeL.position.set(-0.1, 1.7, 0.2);
  playerModel.add(eyeL);
  const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), eyeMat);
  eyeR.position.set(0.1, 1.7, 0.2);
  playerModel.add(eyeR);

  // Mitznefet (hat)
  const hat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.44), whiteMat);
  hat.position.y = 1.95;
  playerModel.add(hat);

  // Legs
  const legMat = new THREE.MeshLambertMaterial({ color: 0xF0F0F0 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.2), legMat);
  legL.position.set(-0.15, 0.25, 0);
  playerModel.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.2), legMat);
  legR.position.set(0.15, 0.25, 0);
  playerModel.add(legR);

  // Arms
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.7, 0.15), whiteMat);
  armL.position.set(-0.4, 0.95, 0);
  playerModel.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.7, 0.15), whiteMat);
  armR.position.set(0.4, 0.95, 0);
  playerModel.add(armR);

  playerModel.castShadow = true;
  scene.add(playerModel);
}

// ─── Build NPCs ───
function buildNPCs() {
  // Shimon (korban seller)
  shimonModel = buildNPCModel(0xD4A853, 0x8B6914); // gold robes, brown apron
  shimonModel.position.set(SHIMON_POS.x, 0, SHIMON_POS.z - 1);
  scene.add(shimonModel);

  // Leviim on Duchan
  leviimModels = [];
  const leviColors = [0x6A5ACD, 0x483D8B, 0x7B68EE, 0x5B4FCF];
  const instrumentIds = Object.keys(INSTRUMENTS);
  for (let i = 0; i < 4; i++) {
    const levi = buildNPCModel(leviColors[i], 0xFAFAFA);
    const x = DUCHAN_POS.x - 3 + i * 2;
    levi.position.set(x, 1, DUCHAN_POS.z);
    levi.userData.instrumentId = instrumentIds[i];
    scene.add(levi);
    leviimModels.push(levi);

    // Instrument visual (small colored block above)
    const instMat = new THREE.MeshLambertMaterial({ color: 0xFFD700 });
    const inst = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.15), instMat);
    inst.position.set(x + 0.3, 1.9, DUCHAN_POS.z + 0.3);
    scene.add(inst);
  }
}

function buildNPCModel(robeColor, accentColor) {
  const g = new THREE.Group();
  const robeMat = new THREE.MeshLambertMaterial({ color: robeColor });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xE8C4A0 });
  const accentMat = new THREE.MeshLambertMaterial({ color: accentColor });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.35), robeMat);
  body.position.y = 0.85;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), skinMat);
  head.position.y = 1.55;
  g.add(head);
  const hat = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.2, 0.38), accentMat);
  hat.position.y = 1.8;
  g.add(hat);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4, 0.18), robeMat);
  legL.position.set(-0.12, 0.2, 0);
  g.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4, 0.18), robeMat);
  legR.position.set(0.12, 0.2, 0);
  g.add(legR);
  return g;
}

// ─── Fire Effect on Mizbeach ───
function buildFireEffect() {
  fireParticles = [];
  const fireMats = [
    new THREE.MeshBasicMaterial({ color: 0xFF4500, transparent: true, opacity: 0.8 }),
    new THREE.MeshBasicMaterial({ color: 0xFF6600, transparent: true, opacity: 0.7 }),
    new THREE.MeshBasicMaterial({ color: 0xFFAA00, transparent: true, opacity: 0.6 }),
  ];
  for (let i = 0; i < 8; i++) {
    const size = 0.3 + Math.random() * 0.4;
    const fire = new THREE.Mesh(new THREE.BoxGeometry(size, size * 1.5, size), fireMats[i % 3]);
    fire.position.set(
      (Math.random() - 0.5) * 3,
      5.2 + Math.random() * 1,
      (Math.random() - 0.5) * 3
    );
    fire.userData.baseY = fire.position.y;
    fire.userData.phase = Math.random() * Math.PI * 2;
    scene.add(fire);
    fireParticles.push(fire);
  }
}

function updateFire(time) {
  fireParticles.forEach(f => {
    f.position.y = f.userData.baseY + Math.sin(time * 5 + f.userData.phase) * 0.3;
    f.rotation.y = time * 2 + f.userData.phase;
    f.scale.y = 0.8 + Math.sin(time * 8 + f.userData.phase) * 0.3;
  });
}

// ─── Audio (Web Audio API) ───
function playInstrument(instrumentId) {
  const inst = INSTRUMENTS[instrumentId];
  if (!inst) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = inst.wave;
  osc.frequency.value = inst.freq;
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.5);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 1.5);

  // Track heard instruments
  if (!gameState.instrumentsHeard.includes(instrumentId)) {
    gameState.instrumentsHeard.push(instrumentId);
    checkAchievement('music_lover', gameState.instrumentsHeard.length >= 4);
    saveGame();
  }
}

// ─── Input ───
function setupMouse() {
  let mouseDown = false;
  let lastX = 0;
  document.addEventListener('mousedown', e => { if (started && e.target === renderer.domElement) { mouseDown = true; lastX = e.clientX; } });
  document.addEventListener('mouseup', () => { mouseDown = false; });
  document.addEventListener('mousemove', e => {
    if (mouseDown && started) {
      const dx = e.clientX - lastX;
      cameraAngleY -= dx * 0.005;
      lastX = e.clientX;
    }
  });
}

function setupTouch() {
  const jBase = $('#joystick-base');
  const jThumb = $('#joystick-thumb');
  if (!jBase) return;

  let touchId = null;
  let baseX = 0, baseY = 0;

  jBase.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    touchId = t.identifier;
    baseX = t.clientX;
    baseY = t.clientY;
    joystickActive = true;
  });

  document.addEventListener('touchmove', e => {
    if (!joystickActive) return;
    for (const t of e.changedTouches) {
      if (t.identifier === touchId) {
        const dx = t.clientX - baseX;
        const dy = t.clientY - baseY;
        const dist = Math.min(Math.sqrt(dx * dx + dy * dy), 40);
        const angle = Math.atan2(dy, dx);
        jThumb.style.transform = `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px)`;
        joystickDX = Math.cos(angle) * (dist / 40);
        joystickDZ = Math.sin(angle) * (dist / 40);
      }
    }
  });

  const endTouch = () => {
    joystickActive = false;
    joystickDX = 0;
    joystickDZ = 0;
    jThumb.style.transform = '';
    touchId = null;
  };
  document.addEventListener('touchend', endTouch);
  document.addEventListener('touchcancel', endTouch);

  // Camera rotation via right side touch
  let camTouchId = null, camLastX = 0;
  renderer.domElement.addEventListener('touchstart', e => {
    for (const t of e.changedTouches) {
      if (t.clientX > window.innerWidth * 0.4) {
        camTouchId = t.identifier;
        camLastX = t.clientX;
      }
    }
  });
  renderer.domElement.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === camTouchId) {
        cameraAngleY -= (t.clientX - camLastX) * 0.008;
        camLastX = t.clientX;
      }
    }
  });
  renderer.domElement.addEventListener('touchend', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === camTouchId) camTouchId = null;
    }
  });
}

function setupButtons() {
  // Shop
  $('#shop-btn').addEventListener('click', openShop);
  $('#close-shop').addEventListener('click', () => $('#shop-panel').classList.add('hidden'));

  // Achievements
  $('#achieve-btn').addEventListener('click', openAchievements);
  $('#close-achieve').addEventListener('click', () => $('#achieve-panel').classList.add('hidden'));

  // Korban select
  $('#close-korban-select').addEventListener('click', () => $('#korban-select-panel').classList.add('hidden'));

  // Summary
  $('#close-summary').addEventListener('click', () => $('#summary-panel').classList.add('hidden'));

  // Info
  $('#info-btn').addEventListener('click', () => {
    const shir = DAILY_SHIR[new Date().getDay()];
    showEduPopup(`Today is ${shir.day}. The Leviim sing Tehillim ${shir.tehillim}:\n${shir.text}`, 'Tamid 7:4');
  });

  // Mobile interact
  const mBtn = $('#mobile-interact-btn');
  if (mBtn) mBtn.addEventListener('touchstart', e => { e.preventDefault(); handleInteract(); });

  // New profile
  $('#new-profile-btn').addEventListener('click', () => {
    $('#new-profile-modal').classList.remove('hidden');
    $('#profile-name-input').value = '';
    $('#profile-name-input').focus();
  });
  $('#cancel-profile-btn').addEventListener('click', () => $('#new-profile-modal').classList.add('hidden'));
  $('#create-profile-btn').addEventListener('click', () => {
    const name = $('#profile-name-input').value.trim();
    if (!name) return;
    const levelBtn = document.querySelector('.level-btn.selected');
    const level = parseInt(levelBtn.dataset.level) || 1;
    $('#new-profile-modal').classList.add('hidden');
    createProfile(name, level);
  });
  document.querySelectorAll('.level-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.level-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
}

// ─── Shop ───
function openShop() {
  closeAllPanels();
  const body = $('#shop-body');
  body.innerHTML = '';

  // Animals section
  const animalTitle = document.createElement('div');
  animalTitle.className = 'shop-section-title';
  animalTitle.textContent = '🐑 Animals';
  body.appendChild(animalTitle);

  const animalGrid = document.createElement('div');
  animalGrid.className = 'shop-grid';

  Object.values(SHOP_ITEMS).filter(i => i.category === 'animal').forEach(item => {
    const card = document.createElement('div');
    card.className = 'shop-card';
    card.innerHTML = `
      <div class="shop-emoji">${item.emoji}</div>
      <div class="shop-name">${item.name}</div>
      <div class="shop-price">🪙 ${item.price}</div>
      <button class="shop-btn" ${gameState.coins < item.price ? 'disabled' : ''}>Buy</button>
    `;
    card.querySelector('.shop-btn').addEventListener('click', () => buyItem(item.id));
    animalGrid.appendChild(card);
  });
  body.appendChild(animalGrid);

  // Menachot section (Level 2+)
  if (gameState.level >= 2) {
    const minchaTitle = document.createElement('div');
    minchaTitle.className = 'shop-section-title';
    minchaTitle.textContent = '🌾 Menachot Ingredients';
    body.appendChild(minchaTitle);

    const minchaGrid = document.createElement('div');
    minchaGrid.className = 'shop-grid';
    Object.values(SHOP_ITEMS).filter(i => i.category === 'mincha').forEach(item => {
      const card = document.createElement('div');
      card.className = 'shop-card';
      card.innerHTML = `
        <div class="shop-emoji">${item.emoji}</div>
        <div class="shop-name">${item.name}</div>
        <div class="shop-price">🪙 ${item.price}</div>
        <button class="shop-btn" ${gameState.coins < item.price ? 'disabled' : ''}>Buy</button>
      `;
      card.querySelector('.shop-btn').addEventListener('click', () => buyItem(item.id));
      minchaGrid.appendChild(card);
    });
    body.appendChild(minchaGrid);
  }

  $('#shop-panel').classList.remove('hidden');
}

function buyItem(itemId) {
  const item = SHOP_ITEMS[itemId];
  if (!item || gameState.coins < item.price) return;
  gameState.coins -= item.price;
  gameState.totalSpent += item.price;
  gameState.inventory[itemId] = (gameState.inventory[itemId] || 0) + 1;
  showToast(`Bought ${item.emoji} ${item.name}!`);
  checkAchievement('big_spender', gameState.totalSpent >= 500);
  updateHUD();
  updateHotbar();
  saveGame();
  openShop(); // refresh
}

// ─── Achievements ───
function openAchievements() {
  closeAllPanels();
  const body = $('#achieve-body');
  body.innerHTML = '';
  Object.entries(ACHIEVEMENTS).forEach(([id, ach]) => {
    const unlocked = gameState.achievements.includes(id);
    const card = document.createElement('div');
    card.className = 'achieve-card' + (unlocked ? ' unlocked' : ' achieve-locked');
    card.innerHTML = `
      <div class="achieve-emoji">${ach.emoji}</div>
      <div>
        <div class="achieve-name">${ach.name}</div>
        <div class="achieve-desc">${ach.desc}</div>
      </div>
    `;
    body.appendChild(card);
  });
  $('#achieve-panel').classList.remove('hidden');
}

function checkAchievement(id, condition) {
  if (gameState.achievements.includes(id)) return;
  if (!condition) return;
  gameState.achievements.push(id);
  const ach = ACHIEVEMENTS[id];
  showToast(`🏆 Achievement: ${ach.emoji} ${ach.name}!`);
  saveGame();
}

// ─── Korban Selection ───
function openKorbanSelect(animalId) {
  closeAllPanels();
  const body = $('#korban-select-body');
  body.innerHTML = '';

  const options = ANIMAL_TO_KORBANOT[animalId] || [];
  const available = options.filter(kId => {
    const k = KORBANOT[kId];
    return k && k.levelRequired <= gameState.level;
  });

  if (available.length === 0) {
    body.innerHTML = '<p style="text-align:center;color:#7f8c8d;padding:20px;">No korbanot available for this animal at your level.</p>';
    $('#korban-select-panel').classList.remove('hidden');
    return;
  }

  available.forEach(kId => {
    const k = KORBANOT[kId];
    const opt = document.createElement('div');
    opt.className = 'korban-option';
    const catClass = k.category === 'kodshei_kodashim' ? 'kk' : 'kl';
    const catLabel = k.category === 'kodshei_kodashim' ? 'Kodshei Kodashim' : 'Kodashim Kalim';
    opt.innerHTML = `
      <div class="korban-option-emoji">${k.emoji}</div>
      <div>
        <div class="korban-option-name">${k.name} <span class="korban-option-category ${catClass}">${catLabel}</span></div>
        <div class="korban-option-desc">${k.description}</div>
      </div>
    `;
    opt.addEventListener('click', () => {
      $('#korban-select-panel').classList.add('hidden');
      beginAvodah(kId);
    });
    body.appendChild(opt);
  });

  $('#korban-select-panel').classList.remove('hidden');
}

// ─── Avodah System ───
function beginAvodah(korbanId) {
  const korban = KORBANOT[korbanId];
  if (!korban) return;

  // Consume animal from inventory
  const animalId = korban.animal;
  if (!gameState.inventory[animalId] || gameState.inventory[animalId] <= 0) {
    showToast(`You need a ${SHOP_ITEMS[animalId]?.name || animalId}!`);
    return;
  }
  gameState.inventory[animalId]--;
  if (gameState.inventory[animalId] <= 0) delete gameState.inventory[animalId];

  avodahActive = true;
  avodahKorban = korban;
  avodahMistakes = 0;
  avodahStep = 0;
  avodahSteps = AVODAH_STEPS[korban.type] || AVODAH_STEPS.olah;

  updateHotbar();
  updateAvodahHUD();
  showToast(`Beginning ${korban.emoji} ${korban.name}!`);

  if (gameState.level === 1) {
    showEduPopup(
      `${korban.description}\n\nFollow the glowing steps to complete the Avodah!`,
      korban.source
    );
  } else {
    showEduPopup(
      `${korban.name} (${korban.nameHe})\n${korban.category === 'kodshei_kodashim' ? '⚠️ Must be slaughtered in the NORTH!' : '✅ Can be slaughtered anywhere in the Azara.'}`,
      korban.mishnah
    );
  }
}

function updateAvodahHUD() {
  const el = $('#avodah-steps');
  if (!avodahActive) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML = '';
  avodahSteps.forEach((step, i) => {
    const div = document.createElement('div');
    div.className = 'avodah-step' + (i < avodahStep ? ' done' : '') + (i === avodahStep ? ' active' : '');
    div.textContent = `${step.emoji} ${step.name}`;
    el.appendChild(div);
  });
}

function advanceAvodah() {
  if (!avodahActive) return;

  const step = avodahSteps[avodahStep];
  if (!step) return;

  // Validate location for shechita
  if (step.id === 'shechita') {
    const inNorth = playerPos.z < NORTH_ZONE_Z;
    if (avodahKorban.slaughterLocation === 'north' && !inNorth) {
      avodahMistakes++;
      showEduPopup(
        `⚠️ Wrong location! ${avodahKorban.name} is Kodshei Kodashim — it must be slaughtered in the NORTH of the Azara!`,
        'Zevachim 5:1'
      );
      return;
    }
    if (avodahKorban.slaughterLocation === 'anywhere') {
      showEduPopup(
        `✅ ${avodahKorban.name} is Kodashim Kalim — it can be slaughtered anywhere in the Azara.`,
        avodahKorban.mishnah
      );
    }
  }

  // Validate near mizbeach for holacha/zerika/haktarah
  if (['holacha', 'zerika', 'haktarah'].includes(step.id)) {
    const dx = playerPos.x - MIZBEACH_POS.x;
    const dz = playerPos.z - MIZBEACH_POS.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 8) {
      showToast('Walk closer to the Mizbeach!');
      return;
    }
  }

  // Show educational content
  if (step.id === 'zerika') {
    const bloodDesc = avodahKorban.bloodService === 'four_corners'
      ? 'Place blood on all 4 horns (Kranot) of the Mizbeach — one on each corner.'
      : 'Two placements that are four (Shnayim She\'hen Arba) — on two diagonal corners, so the blood touches all four sides.';
    showEduPopup(bloodDesc, avodahKorban.mishnah);

    // Track blood type
    if (!gameState.bloodTypesCompleted.includes(avodahKorban.bloodService)) {
      gameState.bloodTypesCompleted.push(avodahKorban.bloodService);
      checkAchievement('blood_expert', gameState.bloodTypesCompleted.length >= 2);
    }
  }

  if (step.id === 'haktarah') {
    const burnDesc = avodahKorban.type === 'olah'
      ? 'The entire Olah is burned on the Mizbeach — a "Re\'ach Nichoach laHashem" (pleasing aroma to Hashem).'
      : avodahKorban.type === 'chatat'
      ? `The Chalavim (fats) are burned. The meat is eaten by male Kohanim in the Azara, ${avodahKorban.eatingTimeLimit}.`
      : `The Chalavim (fats) are burned. The meat is shared — eaten by anyone who is tahor in Yerushalayim, ${avodahKorban.eatingTimeLimit}.`;
    showEduPopup(burnDesc, avodahKorban.source);
  }

  showToast(`${step.emoji} ${step.name} — Done!`);
  avodahStep++;
  updateAvodahHUD();

  // Check completion
  if (avodahStep >= avodahSteps.length) {
    completeAvodah();
  }
}

function completeAvodah() {
  avodahActive = false;
  const korban = avodahKorban;
  const perfect = avodahMistakes === 0;

  // Award coins
  const bonus = perfect ? Math.round(korban.coinReward * 0.5) : 0;
  const totalReward = korban.coinReward + bonus;
  gameState.coins += totalReward;
  gameState.totalCoinsEarned += totalReward;
  gameState.korbanotCompleted++;
  if (perfect) gameState.korbanotPerfect++;
  if (korban.id === 'tamid') gameState.tamidCount++;

  // Achievements
  checkAchievement('first_avodah', true);
  checkAchievement('tamid_week', gameState.tamidCount >= 14);
  checkAchievement('perfect_five', gameState.korbanotPerfect >= 5);
  checkAchievement('kohen_rising', gameState.korbanotCompleted >= 50);

  // Show summary
  const body = $('#summary-body');
  body.innerHTML = `
    <div class="summary-emoji">${korban.emoji}</div>
    <div class="summary-title">${korban.name} (${korban.nameHe})</div>
    <div class="summary-detail">${korban.description}</div>
    <div class="summary-source">📖 ${korban.source} | ${korban.mishnah}</div>
    ${korban.eatenBy !== 'none' ? `<div class="summary-detail">🍖 Eaten by: ${formatEatenBy(korban.eatenBy)} in ${korban.eatingLocation} — ${korban.eatingTimeLimit}</div>` : '<div class="summary-detail">🔥 Entirely consumed on the Mizbeach</div>'}
    <div class="summary-coins">+🪙${totalReward}${bonus > 0 ? ` (includes +${bonus} perfect bonus!)` : ''}</div>
    ${perfect ? '<div style="color:#27ae60;font-weight:700;">✨ Perfect Service!</div>' : `<div style="color:#e67e22;">Mistakes: ${avodahMistakes}</div>`}
    <button class="btn btn-gold summary-btn" onclick="document.getElementById('summary-panel').classList.add('hidden')">Continue</button>
  `;
  $('#summary-panel').classList.remove('hidden');

  gameState.sourcesRead++;
  checkAchievement('torah_scholar', gameState.sourcesRead >= 20);

  avodahKorban = null;
  avodahSteps = [];
  avodahStep = 0;
  updateAvodahHUD();
  updateHUD();
  updateHotbar();
  saveGame();
}

function formatEatenBy(code) {
  switch (code) {
    case 'male_kohanim': return 'Male Kohanim only';
    case 'anyone_tahor': return 'Anyone who is tahor (ritually pure)';
    case 'kohanim': return 'Kohanim and their families';
    default: return code;
  }
}

// ─── Interaction ───
function handleInteract() {
  if (!started) return;

  // If in avodah, advance
  if (avodahActive) {
    advanceAvodah();
    return;
  }

  // Check proximity to NPCs/objects
  const px = playerPos.x, pz = playerPos.z;

  // Shimon
  if (dist2D(px, pz, SHIMON_POS.x, SHIMON_POS.z) < INTERACT_DIST) {
    openShop();
    return;
  }

  // Leviim
  for (const levi of leviimModels) {
    if (dist2D(px, pz, levi.position.x, levi.position.z) < INTERACT_DIST) {
      const inst = INSTRUMENTS[levi.userData.instrumentId];
      playInstrument(levi.userData.instrumentId);
      showEduPopup(
        `${inst.emoji} ${inst.name} (${inst.nameHe})\n${inst.desc}`,
        inst.source
      );
      return;
    }
  }

  // Kiyor
  if (dist2D(px, pz, KIYOR_POS.x, KIYOR_POS.z) < INTERACT_DIST) {
    showEduPopup(
      'The Kiyor (כיור) — a bronze laver. Every Kohen must wash his hands and feet before performing the Avodah.',
      'Shemot 30:19-21'
    );
    return;
  }

  // Mizbeach area — start korban if holding an animal
  if (dist2D(px, pz, MIZBEACH_POS.x, MIZBEACH_POS.z) < 10) {
    // Check if player has animals in inventory
    const animals = Object.keys(gameState.inventory).filter(id =>
      SHOP_ITEMS[id]?.category === 'animal' && gameState.inventory[id] > 0
    );
    if (animals.length > 0) {
      // If only one animal type, and it has only one korban option at this level, start directly
      if (animals.length === 1) {
        const opts = (ANIMAL_TO_KORBANOT[animals[0]] || []).filter(kId => KORBANOT[kId]?.levelRequired <= gameState.level);
        if (opts.length === 1) {
          beginAvodah(opts[0]);
          return;
        }
      }
      openKorbanSelect(animals[0]);
      return;
    }
    showToast('Buy an animal from Shimon first! 🏪');
    return;
  }
}

function dist2D(x1, z1, x2, z2) {
  return Math.sqrt((x1 - x2) ** 2 + (z1 - z2) ** 2);
}

// ─── UI Helpers ───
function showToast(msg) {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 3000);
}

function showEduPopup(text, source) {
  const el = $('#edu-popup');
  const content = $('#edu-popup-content');
  content.innerHTML = text.replace(/\n/g, '<br>') + (source ? `<div class="source">📖 ${source}</div>` : '');
  el.classList.remove('hidden');
  gameState.sourcesRead++;
  checkAchievement('torah_scholar', gameState.sourcesRead >= 20);
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 6000);
}

function updateHUD() {
  $('#coins-count').textContent = gameState.coins;
  $('#level-num').textContent = gameState.level;
  $('#korbanot-count').textContent = gameState.korbanotCompleted;
}

function updateHotbar() {
  const hotbar = $('#hotbar');
  hotbar.innerHTML = '';
  const items = Object.keys(gameState.inventory).filter(id => gameState.inventory[id] > 0);
  const slots = items.slice(0, 9);
  slots.forEach(itemId => {
    const item = SHOP_ITEMS[itemId];
    if (!item) return;
    const slot = document.createElement('div');
    slot.className = 'hotbar-slot';
    slot.innerHTML = `<span class="slot-emoji">${item.emoji}</span><span class="slot-count">${gameState.inventory[itemId]}</span>`;
    hotbar.appendChild(slot);
  });
  if (slots.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'hotbar-slot';
    empty.innerHTML = '<span class="slot-emoji" style="opacity:0.3">🕊️</span>';
    hotbar.appendChild(empty);
  }
}

function updateInteractionPrompt() {
  const el = $('#interaction-prompt');
  const px = playerPos.x, pz = playerPos.z;

  if (avodahActive) {
    const step = avodahSteps[avodahStep];
    if (step) {
      let hint = `Press E: ${step.emoji} ${step.name}`;
      if (step.id === 'shechita' && avodahKorban.slaughterLocation === 'north') {
        hint += pz < NORTH_ZONE_Z ? ' ✅ (North zone)' : ' ⚠️ (Go to the North!)';
      }
      if (['holacha', 'zerika', 'haktarah'].includes(step.id)) {
        const d = dist2D(px, pz, MIZBEACH_POS.x, MIZBEACH_POS.z);
        if (d > 8) hint += ' — Walk to the Mizbeach';
      }
      el.textContent = hint;
      el.classList.remove('hidden');
      return;
    }
  }

  if (dist2D(px, pz, SHIMON_POS.x, SHIMON_POS.z) < INTERACT_DIST) {
    el.textContent = 'Press E — Talk to Shimon 🏪';
    el.classList.remove('hidden');
  } else if (dist2D(px, pz, KIYOR_POS.x, KIYOR_POS.z) < INTERACT_DIST) {
    el.textContent = 'Press E — Wash at the Kiyor';
    el.classList.remove('hidden');
  } else if (leviimModels.some(l => dist2D(px, pz, l.position.x, l.position.z) < INTERACT_DIST)) {
    el.textContent = 'Press E — Listen to the Leviim 🎵';
    el.classList.remove('hidden');
  } else if (dist2D(px, pz, MIZBEACH_POS.x, MIZBEACH_POS.z) < 10 && !avodahActive) {
    const hasAnimal = Object.keys(gameState.inventory).some(id => SHOP_ITEMS[id]?.category === 'animal' && gameState.inventory[id] > 0);
    if (hasAnimal) {
      el.textContent = 'Press E — Begin Avodah 🔥';
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  } else {
    el.classList.add('hidden');
  }
}

function closeAllPanels() {
  ['shop-panel', 'achieve-panel', 'korban-select-panel', 'summary-panel'].forEach(id => {
    $('#' + id).classList.add('hidden');
  });
}

function isAnyPanelOpen() {
  return ['shop-panel', 'achieve-panel', 'korban-select-panel', 'summary-panel', 'new-profile-modal'].some(id => {
    const el = $('#' + id);
    return el && !el.classList.contains('hidden');
  });
}

// ─── Game Loop ───
function animate() {
  if (!started) return;
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.getElapsedTime();

  // Auto-save
  autoSaveTimer += dt;
  if (autoSaveTimer >= AUTO_SAVE_SEC) {
    autoSaveTimer = 0;
    saveGame();
  }

  if (!isAnyPanelOpen()) {
    updatePlayer(dt);
  }

  updateFire(time);
  updateInteractionPrompt();
  updateCamera();

  renderer.render(scene, camera);
}

// ─── Player Movement ───
function updatePlayer(dt) {
  let moveX = 0, moveZ = 0;

  if (joystickActive) {
    moveX = joystickDX;
    moveZ = joystickDZ;
  } else {
    if (keys['w'] || keys['arrowup']) moveZ = -1;
    if (keys['s'] || keys['arrowdown']) moveZ = 1;
    if (keys['a'] || keys['arrowleft']) moveX = -1;
    if (keys['d'] || keys['arrowright']) moveX = 1;
  }

  // Rotate movement by camera angle
  const sin = Math.sin(cameraAngleY);
  const cos = Math.cos(cameraAngleY);
  const worldX = moveX * cos - moveZ * sin;
  const worldZ = moveX * sin + moveZ * cos;

  const len = Math.sqrt(worldX * worldX + worldZ * worldZ);
  if (len > 0) {
    const nx = (worldX / len) * PLAYER_SPEED * dt;
    const nz = (worldZ / len) * PLAYER_SPEED * dt;
    playerPos.x += nx;
    playerPos.z += nz;

    // Face movement direction
    playerModel.rotation.y = Math.atan2(worldX, worldZ);

    // Leg animation
    const legAngle = Math.sin(time * 10) * 0.4;
    if (playerModel.children[6]) playerModel.children[6].rotation.x = legAngle;
    if (playerModel.children[7]) playerModel.children[7].rotation.x = -legAngle;
  }

  // Boundary clamp (stay in azara)
  playerPos.x = Math.max(AZARA_MIN_X, Math.min(AZARA_MAX_X, playerPos.x));
  playerPos.z = Math.max(AZARA_MIN_Z, Math.min(AZARA_MAX_Z, playerPos.z));

  // Gravity
  if (!onGround) {
    playerVelocityY -= GRAVITY * dt;
    playerPos.y += playerVelocityY * dt;
    if (playerPos.y <= 0) {
      playerPos.y = 0;
      playerVelocityY = 0;
      onGround = true;
    }
  }

  // Jump
  if ((keys[' '] || keys['space']) && onGround) {
    playerVelocityY = JUMP_FORCE;
    onGround = false;
  }

  // Interact
  if (keys['e']) {
    keys['e'] = false;
    handleInteract();
  }

  playerModel.position.set(playerPos.x, playerPos.y, playerPos.z);
}

function updateCamera() {
  const targetX = playerPos.x - Math.sin(cameraAngleY) * CAM_DISTANCE;
  const targetZ = playerPos.z - Math.cos(cameraAngleY) * CAM_DISTANCE;
  const targetY = playerPos.y + CAM_HEIGHT_OFFSET;
  camera.position.set(targetX, targetY, targetZ);
  camera.lookAt(playerPos.x, playerPos.y + PLAYER_HEIGHT * 0.7, playerPos.z);
}

// ─── Visibility save ───
document.addEventListener('visibilitychange', () => { if (started) saveGame(); });
window.addEventListener('beforeunload', () => { if (started) saveGame(); });
window.addEventListener('pagehide', () => { if (started) saveGame(); });

// ─── Boot ───
renderProfiles();

})();
