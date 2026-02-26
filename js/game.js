/* ============================================
   AVODAH — Beit HaMikdash Simulator V2
   All known issues from V1 fixed.
   ============================================ */
(function() {
'use strict';

// ─── Constants ───
const PLAYER_SPEED = 6;
const PLAYER_HEIGHT = 1.7;
const INTERACT_DIST = 5;
const CAM_DISTANCE = 8;
const CAM_HEIGHT_OFFSET = 4;
const PROFILES_KEY = 'mikdash_profiles';
const SAVE_PREFIX = 'mikdash_save_';
const MAX_PROFILES = 10;
const AUTO_SAVE_SEC = 10;

// Expanded Azara (was 38x38, now 70x70)
const AZARA_HALF = 32;
const WALL_HEIGHT = 7;

// Key positions (spread out more for bigger azara)
const MIZBEACH_POS = { x: 0, y: 0, z: 0 };
const MIZBEACH_W = 10, MIZBEACH_H = 5, MIZBEACH_D = 10;
const KEVESH_START_Z = MIZBEACH_D / 2;       // south face of mizbeach
const KEVESH_END_Z = KEVESH_START_Z + 12;    // ramp extends 12 units south
const KEVESH_WIDTH = 5;
const KIYOR_POS = { x: -10, z: 2 };
const SHIMON_POS = { x: 18, z: 22 };
const DUCHAN_POS = { x: 16, z: -8 };
const NORTH_ZONE_Z = -12;

// Collision boxes (simple AABB)
const COLLIDERS = [];

let activeProfileId = null;
const $ = s => document.querySelector(s);

// ─── Game State ───
let gameState = {
  coins: 50, level: 1, inventory: {},
  korbanotCompleted: 0, korbanotPerfect: 0, achievements: [],
  totalCoinsEarned: 0, totalSpent: 0, tamidCount: 0,
  bloodTypesCompleted: [], instrumentsHeard: [], sourcesRead: 0,
};

// ─── Three.js Globals ───
let scene, camera, renderer, clock;
let playerGroup, playerPos, playerVelY = 0, onGround = true;
let camAngle = Math.PI;  // Start facing north (into the azara)
let keys = {};
let running = false;
let animFrameId = null;
let autoSaveTimer = 0;
let elapsedTime = 0;

// NPCs
let shimonGroup, leviimGroups = [], fireBoxes = [];

// Waypoint / particle system
let waypointMesh = null;
let particles = [];

// Labels
let worldLabels = [];

// Avodah
let avodahActive = false, avodahStep = 0, avodahKorban = null;
let avodahMistakes = 0, avodahSteps = [];

// Audio
let audioCtx = null;

// Mobile
const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
let joyActive = false, joyDX = 0, joyDZ = 0;

// ─── Profiles ───
function getProfiles() { try { return JSON.parse(localStorage.getItem(PROFILES_KEY)) || []; } catch { return []; } }
function saveProfiles(p) { localStorage.setItem(PROFILES_KEY, JSON.stringify(p)); }

function renderProfiles() {
  const list = $('#profile-list');
  list.innerHTML = '';
  getProfiles().forEach(p => {
    const card = document.createElement('div');
    card.className = 'profile-card';
    card.innerHTML = `<div><div class="profile-name">🕊️ ${p.name}</div>
      <div class="profile-info">Level ${p.level} · 🪙${p.coins || 0} · 🔥${p.korbanot || 0} Korbanot</div></div>
      <button class="profile-delete" data-id="${p.id}" title="Delete">🗑️</button>`;
    card.addEventListener('click', e => { if (!e.target.closest('.profile-delete')) loadProfile(p.id); });
    card.querySelector('.profile-delete').addEventListener('click', e => {
      e.stopPropagation();
      if (confirm(`Delete ${p.name}?`)) { deleteProfile(p.id); }
    });
    list.appendChild(card);
  });
}

function deleteProfile(id) {
  saveProfiles(getProfiles().filter(p => p.id !== id));
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
  const p = getProfiles().find(x => x.id === id);
  if (!p) return;
  // Reset
  gameState = {
    coins: 50, level: p.level || 1, inventory: {},
    korbanotCompleted: 0, korbanotPerfect: 0, achievements: [],
    totalCoinsEarned: 0, totalSpent: 0, tamidCount: 0,
    bloodTypesCompleted: [], instrumentsHeard: [], sourcesRead: 0,
  };
  try {
    const raw = localStorage.getItem(SAVE_PREFIX + id);
    if (raw) { const d = JSON.parse(raw); Object.keys(d).forEach(k => { if (k in gameState) gameState[k] = d[k]; }); }
  } catch {}
  $('#login-screen').classList.add('hidden');
  startGame();
}

function saveGame() {
  if (!activeProfileId) return;
  try {
    localStorage.setItem(SAVE_PREFIX + activeProfileId, JSON.stringify(gameState));
    const profiles = getProfiles();
    const p = profiles.find(x => x.id === activeProfileId);
    if (p) { p.coins = gameState.coins; p.korbanot = gameState.korbanotCompleted; p.level = gameState.level; saveProfiles(profiles); }
  } catch {}
}

// ─── Scene Setup ───
function startGame() {
  // Prevent stacked loops
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  
  if (renderer) { renderer.domElement.remove(); renderer.dispose(); }
  
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0x87CEEB, 50, 120);
  
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
  clock = new THREE.Clock();
  
  renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  document.body.insertBefore(renderer.domElement, document.body.firstChild);
  
  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const sun = new THREE.DirectionalLight(0xfff4cc, 1.0);
  sun.position.set(15, 25, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
  sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 80;
  sun.shadow.camera.left = -35; sun.shadow.camera.right = 35;
  sun.shadow.camera.top = 35; sun.shadow.camera.bottom = -35;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x87CEEB, 0xD4C4A8, 0.3));
  
  COLLIDERS.length = 0;
  try { buildWorld(); } catch(e) { console.error('buildWorld failed:', e); alert('buildWorld error: ' + e.message); return; }
  try { buildPlayer(); } catch(e) { console.error('buildPlayer failed:', e); alert('buildPlayer error: ' + e.message); return; }
  try { buildNPCs(); } catch(e) { console.error('buildNPCs failed:', e); alert('buildNPCs error: ' + e.message); return; }
  try { buildFire(); } catch(e) { console.error('buildFire failed:', e); alert('buildFire error: ' + e.message); return; }
  
  playerPos = new THREE.Vector3(0, 0, 20);  // Start south of mizbeach
  camAngle = Math.PI;  // Face north (toward mizbeach)
  

  
  avodahActive = false; avodahStep = 0; avodahKorban = null;
  
  $('#hud').classList.remove('hidden');
  updateHUD(); updateHotbar(); updateAvodahHUD();
  if (isMobile) $('#mobile-controls').classList.remove('hidden');
  
  buildLabels();
  if (!window._inputsBound) { bindInputs(); window._inputsBound = true; }
  
  running = true;
  animate();
  
  // Show tutorial on very first play (no korbanot done yet)
  if (gameState.korbanotCompleted === 0) {
    setTimeout(() => {
      showEdu(
        '🏛️ Welcome, Kohen!\n\n' +
        '🖱️ MOUSE DRAG — rotate camera\n' +
        'WASD / ↑↓←→ — walk\n' +
        'E — interact\n\n' +
        '👣 Start by visiting Shimon\'s booth (🏪 southeast) to buy an animal.\n' +
        'Then walk to the Mizbeach and press E to begin the Avodah!',
        ''
      );
    }, 1000);
  }
}

function onResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

// ─── World Builder ───
function addBox(w, h, d, x, y, z, color, opts = {}) {
  const mat = new THREE.MeshLambertMaterial({ color, transparent: !!opts.opacity, opacity: opts.opacity || 1 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  if (opts.shadow) mesh.castShadow = true;
  if (opts.receive) mesh.receiveShadow = true;
  if (opts.rotX) mesh.rotation.x = opts.rotX;
  scene.add(mesh);
  if (opts.collide) {
    COLLIDERS.push({ minX: x - w/2, maxX: x + w/2, minZ: z - d/2, maxZ: z + d/2, minY: y - h/2, maxY: y + h/2 });
  }
  return mesh;
}

function buildWorld() {
  // Outer ground
  addBox(100, 0.5, 100, 0, -0.25, 0, 0xC4B390, { receive: true });
  
  // Azara floor
  addBox(AZARA_HALF * 2 + 2, 0.1, AZARA_HALF * 2 + 2, 0, 0.01, 0, 0xF5F0E1, { receive: true });
  
  // North zone
  addBox(AZARA_HALF * 2, 0.05, 20, 0, 0.02, -22, 0xE8DDD0);
  // North zone marker stones
  for (let x = -28; x <= 28; x += 8) {
    addBox(0.4, 0.2, 0.4, x, 0.1, NORTH_ZONE_Z, 0xC4943E);
  }
  
  // Walls
  const H = WALL_HEIGHT;
  addBox(AZARA_HALF * 2 + 4, H, 1.5, 0, H/2, -(AZARA_HALF + 1), 0xE8E0D0, { collide: true });
  addBox(AZARA_HALF * 2 + 4, H, 1.5, 0, H/2, AZARA_HALF + 1, 0xE8E0D0, { collide: true });
  addBox(1.5, H, AZARA_HALF * 2 + 4, -(AZARA_HALF + 1), H/2, 0, 0xE8E0D0, { collide: true });
  addBox(1.5, H, AZARA_HALF * 2 + 4, AZARA_HALF + 1, H/2, 0, 0xE8E0D0, { collide: true });
  
  // ─── Mizbeach ───
  addBox(MIZBEACH_W, MIZBEACH_H, MIZBEACH_D, 0, MIZBEACH_H/2, 0, 0xD4C4A8, { shadow: true, collide: true });
  // Yesod (base)
  addBox(MIZBEACH_W + 2, 0.6, MIZBEACH_D + 2, 0, 0.3, 0, 0xBFAF94);
  // Sovev (ledge)
  addBox(MIZBEACH_W + 1, 0.3, MIZBEACH_D + 1, 0, MIZBEACH_H * 0.6, 0, 0xD4C4A8);
  // Kranot (horns)
  const hw = MIZBEACH_W/2 - 0.3, hd = MIZBEACH_D/2 - 0.3;
  [[-hw, hd], [hw, hd], [-hw, -hd], [hw, -hd]].forEach(([hx, hz]) => {
    addBox(0.7, 1.2, 0.7, hx, MIZBEACH_H + 0.6, hz, 0xC8B898);
  });
  
  // ─── Kevesh (Ramp) ─── south side, walkable!
  // Build as a series of step blocks so the player can walk up
  const rampSteps = 12;
  for (let i = 0; i < rampSteps; i++) {
    const frac = i / rampSteps;
    const stepZ = KEVESH_START_Z + (KEVESH_END_Z - KEVESH_START_Z) * (1 - frac);
    const stepY = frac * MIZBEACH_H;
    const stepH = 0.5;
    addBox(KEVESH_WIDTH, stepH, (KEVESH_END_Z - KEVESH_START_Z) / rampSteps + 0.1, 0, stepY + stepH/2, stepZ, 0xD4C4A8);
  }
  
  // ─── Kiyor ───
  addBox(1.8, 0.5, 1.8, KIYOR_POS.x, 0.25, KIYOR_POS.z, 0xCD7F32);
  addBox(0.7, 1.8, 0.7, KIYOR_POS.x, 1.15, KIYOR_POS.z, 0xCD7F32);
  addBox(2.2, 0.8, 2.2, KIYOR_POS.x, 2.1, KIYOR_POS.z, 0xCD7F32);
  addBox(1.8, 0.2, 1.8, KIYOR_POS.x, 2.4, KIYOR_POS.z, 0x4FA4DE, { opacity: 0.6 });
  
  // ─── Ulam ─── (west side)
  addBox(5, 12, 14, -(AZARA_HALF - 2), 6, 0, 0xE8E0D0, { collide: true });
  // Gold trim
  addBox(0.2, 12, 14.5, -(AZARA_HALF - 4.5), 6, 0, 0xFFD700);
  // Pillars (Yachin & Boaz)
  [-4, 4].forEach(z => {
    addBox(1.2, 10, 1.2, -(AZARA_HALF - 4.5), 5, z, 0xCD7F32);
    addBox(1.5, 1.8, 1.5, -(AZARA_HALF - 4.5), 10.5, z, 0xFFD700);
  });
  
  // ─── Beit HaMitbachayim (north slaughter area) ───
  for (let x = -6; x <= 6; x += 6) {
    addBox(0.6, 0.3, 0.6, x, 0.15, -18, 0x888888);  // rings
    addBox(0.25, 3, 0.25, x, 1.5, -20, 0x888888);    // poles
    addBox(0.6, 0.15, 0.15, x + 0.25, 2.7, -20, 0x888888); // hooks
  }
  
  // ─── Duchan (Levite platform) ───
  addBox(12, 1.2, 4, DUCHAN_POS.x, 0.6, DUCHAN_POS.z, 0xD4C4A8);
  
  // ─── Korban Stand (Shimon's booth) ───
  addBox(4, 1.4, 2, SHIMON_POS.x, 0.7, SHIMON_POS.z, 0x8B6914);
  addBox(5, 0.15, 3, SHIMON_POS.x, 3.2, SHIMON_POS.z, 0xC0392B);  // awning
  [-2, 2].forEach(dx => {
    addBox(0.2, 3.2, 0.2, SHIMON_POS.x + dx, 1.6, SHIMON_POS.z - 1, 0x8B6914);
  });
  
  // ─── Olive Trees (outside walls) ───
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI * 2 * i) / 10;
    const d = 36 + Math.random() * 8;
    const tx = Math.cos(a) * d, tz = Math.sin(a) * d;
    addBox(0.5, 2.5, 0.5, tx, 1.25, tz, 0x6D4C41);
    addBox(2.5, 2, 2.5, tx, 3, tz, 0x4A7C3F);
  }
  
  // ─── Welcome sign near spawn ───
  // Small stone slab with gold top
  addBox(3, 0.6, 0.4, 0, 0.3, 26, 0xD4C4A8);
  addBox(3, 0.1, 0.4, 0, 0.65, 26, 0xFFD700);
}

// ─── Ground Height (for ramp walking) ───
function getGroundHeight(x, z) {
  // Check if on the Kevesh (ramp)
  if (Math.abs(x) < KEVESH_WIDTH / 2 && z > KEVESH_START_Z && z < KEVESH_END_Z) {
    const frac = 1 - (z - KEVESH_START_Z) / (KEVESH_END_Z - KEVESH_START_Z);
    return frac * MIZBEACH_H;
  }
  // Check if on top of mizbeach
  if (Math.abs(x) < MIZBEACH_W / 2 && Math.abs(z) < MIZBEACH_D / 2) {
    return MIZBEACH_H;
  }
  return 0;
}

// ─── Simple AABB collision ───
function canMoveTo(x, z) {
  const r = 0.3; // player radius
  for (const c of COLLIDERS) {
    if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) {
      return false;
    }
  }
  // Boundary
  if (Math.abs(x) > AZARA_HALF || Math.abs(z) > AZARA_HALF) return false;
  return true;
}

// ─── Player ───
function buildPlayer() {
  playerGroup = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xFAFAFA });
  const skin = new THREE.MeshLambertMaterial({ color: 0xE8C4A0 });
  const belt = new THREE.MeshLambertMaterial({ color: 0x4169E1 });
  const eye = new THREE.MeshLambertMaterial({ color: 0x333333 });
  
  // 0: body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.4), white);
  body.position.y = 0.9; playerGroup.add(body);
  // 1: belt
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.42), belt);
  b.position.y = 1.0; playerGroup.add(b);
  // 2: head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
  head.position.y = 1.65; playerGroup.add(head);
  // 3: left eye
  const el = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), eye);
  el.position.set(-0.1, 1.7, 0.21); playerGroup.add(el);
  // 4: right eye
  const er = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), eye);
  er.position.set(0.1, 1.7, 0.21); playerGroup.add(er);
  // 5: hat (Mitznefet)
  const hat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.44), white);
  hat.position.y = 1.95; playerGroup.add(hat);
  // 6: left leg
  const ll = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.2), white);
  ll.position.set(-0.15, 0.25, 0); playerGroup.add(ll);
  // 7: right leg
  const rl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.2), white);
  rl.position.set(0.15, 0.25, 0); playerGroup.add(rl);
  // 8: left arm
  const la = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.7, 0.15), white);
  la.position.set(-0.4, 0.95, 0); playerGroup.add(la);
  // 9: right arm
  const ra = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.7, 0.15), white);
  ra.position.set(0.4, 0.95, 0); playerGroup.add(ra);
  
  playerGroup.castShadow = true;
  scene.add(playerGroup);
}

function buildNPCModel(robeColor, accent) {
  const g = new THREE.Group();
  const r = new THREE.MeshLambertMaterial({ color: robeColor });
  const s = new THREE.MeshLambertMaterial({ color: 0xE8C4A0 });
  const a = new THREE.MeshLambertMaterial({ color: accent });
  g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.35), r), { position: new THREE.Vector3(0, 0.85, 0) }));
  g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), s), { position: new THREE.Vector3(0, 1.55, 0) }));
  g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.2, 0.38), a), { position: new THREE.Vector3(0, 1.8, 0) }));
  // legs
  g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4, 0.18), r), { position: new THREE.Vector3(-0.12, 0.2, 0) }));
  g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4, 0.18), r), { position: new THREE.Vector3(0.12, 0.2, 0) }));
  return g;
}

function buildNPCs() {
  // Shimon
  shimonGroup = buildNPCModel(0xD4A853, 0x8B6914);
  shimonGroup.position.set(SHIMON_POS.x, 0, SHIMON_POS.z - 2);
  shimonGroup.rotation.y = Math.PI;
  scene.add(shimonGroup);
  
  // Leviim
  leviimGroups = [];
  const colors = [0x6A5ACD, 0x483D8B, 0x7B68EE, 0x5B4FCF];
  const instKeys = Object.keys(INSTRUMENTS);
  for (let i = 0; i < 4; i++) {
    const levi = buildNPCModel(colors[i], 0xFAFAFA);
    const x = DUCHAN_POS.x - 4.5 + i * 3;
    levi.position.set(x, 1.2, DUCHAN_POS.z);
    levi.userData.instrumentId = instKeys[i];
    scene.add(levi);
    leviimGroups.push(levi);
    // Instrument visual
    addBox(0.4, 0.4, 0.2, x + 0.35, 2.3, DUCHAN_POS.z + 0.3, 0xFFD700);
  }
}

// ─── World Labels ───
function addWorldLabel(text, x, y, z, className) {
  const div = document.createElement('div');
  div.className = 'world-label ' + (className || '');
  div.textContent = text;
  document.body.appendChild(div);
  worldLabels.push({ div, pos: new THREE.Vector3(x, y, z) });
}

function updateWorldLabels() {
  if (!camera || !renderer) return;
  const w2 = renderer.domElement.clientWidth / 2;
  const h2 = renderer.domElement.clientHeight / 2;
  
  for (const label of worldLabels) {
    const v = label.pos.clone().project(camera);
    if (v.z > 1) { label.div.style.display = 'none'; continue; }
    const dist = label.pos.distanceTo(camera.position);
    if (dist > 40) { label.div.style.display = 'none'; continue; }
    label.div.style.display = 'block';
    label.div.style.left = ((v.x * w2) + w2) + 'px';
    label.div.style.top = (-(v.y * h2) + h2) + 'px';
    label.div.style.opacity = Math.max(0, Math.min(1, 1 - (dist - 25) / 15));
  }
}

function buildLabels() {
  // Clear existing
  worldLabels.forEach(l => l.div.remove());
  worldLabels = [];
  
  addWorldLabel('🏪 Shimon', SHIMON_POS.x, 3.8, SHIMON_POS.z, 'label-npc');
  addWorldLabel('🎵 Leviim', DUCHAN_POS.x, 3, DUCHAN_POS.z, 'label-npc');
  addWorldLabel('🔥 Mizbeach', 0, MIZBEACH_H + 3, 0, 'label-place');
  addWorldLabel('🚿 Kiyor', KIYOR_POS.x, 3.5, KIYOR_POS.z, 'label-place');
  addWorldLabel('⬆️ Kevesh', 0, 3, KEVESH_END_Z - 3, 'label-place');
  addWorldLabel('🔪 North Zone', 0, 1.5, -20, 'label-zone');
  addWorldLabel('🏛️ Ulam', -(AZARA_HALF - 2), 8, 0, 'label-place');
}

// ─── Level Up ───
function checkLevelUp() {
  if (gameState.level === 1 && gameState.korbanotCompleted >= 5) {
    gameState.level = 2;
    playSFX('complete');
    spawnParticles(playerPos.x, playerPos.y + 2, playerPos.z, 0xFFD700, 30);
    showEdu(
      '🎉 LEVEL UP — Kohen Mishamesh!\n\n' +
      'You\'ve proven yourself with the basics. Now you can:\n' +
      '• Choose from more Korbanot types (Chatat, Asham, Shelamim)\n' +
      '• Buy Menachot ingredients from Shimon\n' +
      '• Location matters: Kodshei Kodashim = NORTH only!\n\n' +
      'The Avodah gets more complex from here. B\'hatzlacha!',
      'Zevachim 5:1-8'
    );
    updateHUD();
    saveGame();
    toast('⬆️ Level 2 Unlocked!');
  }
}

function buildFire() {
  fireBoxes = [];
  const mats = [
    new THREE.MeshBasicMaterial({ color: 0xFF4500, transparent: true, opacity: 0.8 }),
    new THREE.MeshBasicMaterial({ color: 0xFF6600, transparent: true, opacity: 0.7 }),
    new THREE.MeshBasicMaterial({ color: 0xFFAA00, transparent: true, opacity: 0.6 }),
  ];
  for (let i = 0; i < 10; i++) {
    const s = 0.3 + Math.random() * 0.5;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s * 2, s), mats[i % 3]);
    mesh.position.set((Math.random() - 0.5) * 4, MIZBEACH_H + 0.5 + Math.random(), (Math.random() - 0.5) * 4);
    mesh.userData.baseY = mesh.position.y;
    mesh.userData.phase = Math.random() * Math.PI * 2;
    scene.add(mesh);
    fireBoxes.push(mesh);
  }
}

function updateFire(t) {
  for (const f of fireBoxes) {
    f.position.y = f.userData.baseY + Math.sin(t * 4 + f.userData.phase) * 0.4;
    f.rotation.y = t * 2 + f.userData.phase;
    f.scale.y = 0.7 + Math.sin(t * 7 + f.userData.phase) * 0.4;
  }
}

// ─── NPC Idle Animation ───
function updateNPCs(t) {
  // Shimon bobs slightly
  if (shimonGroup) {
    shimonGroup.position.y = Math.sin(t * 1.5) * 0.05;
  }
  // Leviim sway
  for (let i = 0; i < leviimGroups.length; i++) {
    const l = leviimGroups[i];
    l.rotation.y = Math.sin(t * 1.2 + i) * 0.15;
  }
}

// ─── Waypoint Markers ───
function showWaypoint(x, y, z, color) {
  removeWaypoint();
  const geo = new THREE.BoxGeometry(1, 0.2, 1);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 });
  waypointMesh = new THREE.Mesh(geo, mat);
  waypointMesh.position.set(x, y + 0.15, z);
  scene.add(waypointMesh);
  
  // Add a pillar of light
  const pillar = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 4, 0.15),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3 })
  );
  pillar.position.set(x, y + 2, z);
  pillar.userData.isPillar = true;
  scene.add(pillar);
  waypointMesh.userData.pillar = pillar;
}

function removeWaypoint() {
  if (waypointMesh) {
    scene.remove(waypointMesh);
    if (waypointMesh.userData.pillar) scene.remove(waypointMesh.userData.pillar);
    waypointMesh = null;
  }
}

function updateWaypoint(t) {
  if (!waypointMesh) return;
  waypointMesh.position.y += Math.sin(t * 3) * 0.003;
  waypointMesh.rotation.y = t * 2;
  waypointMesh.material.opacity = 0.4 + Math.sin(t * 4) * 0.2;
  if (waypointMesh.userData.pillar) {
    waypointMesh.userData.pillar.material.opacity = 0.15 + Math.sin(t * 3) * 0.1;
  }
}

function updateAvodahWaypoints() {
  if (!avodahActive || avodahStep >= avodahSteps.length) { removeWaypoint(); return; }
  const step = avodahSteps[avodahStep];
  
  if (step.id === 'shechita') {
    if (avodahKorban.slaughterLocation === 'north') {
      showWaypoint(0, 0, -18, 0xFF4444);  // North zone
    } else {
      // Anywhere — show near player's current position
      showWaypoint(playerPos.x, 0, playerPos.z, 0x44FF44);
    }
  } else if (step.id === 'kabbalah') {
    showWaypoint(playerPos.x, 0, playerPos.z, 0xFFD700);
  } else if (['holacha', 'zerika', 'haktarah'].includes(step.id)) {
    showWaypoint(0, 0, KEVESH_END_Z - 2, 0xFF6600);  // Base of ramp
  }
}

// ─── Particle Effects ───
function spawnParticles(x, y, z, color, count) {
  for (let i = 0; i < count; i++) {
    const size = 0.08 + Math.random() * 0.12;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
    );
    mesh.position.set(x, y, z);
    mesh.userData.vel = new THREE.Vector3(
      (Math.random() - 0.5) * 3,
      Math.random() * 4 + 1,
      (Math.random() - 0.5) * 3
    );
    mesh.userData.life = 1;
    scene.add(mesh);
    particles.push(mesh);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.userData.life -= dt * 1.5;
    if (p.userData.life <= 0) {
      scene.remove(p);
      particles.splice(i, 1);
      continue;
    }
    p.position.add(p.userData.vel.clone().multiplyScalar(dt));
    p.userData.vel.y -= 6 * dt;  // gravity
    p.material.opacity = p.userData.life;
    p.scale.setScalar(p.userData.life);
  }
}

// ─── Sound Effects ───
function playSFX(type) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  
  if (type === 'step_complete') {
    osc.type = 'sine'; osc.frequency.value = 660;
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.15);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    osc.start(t); osc.stop(t + 0.3);
  } else if (type === 'complete') {
    // Rising arpeggio
    [440, 554, 660, 880].forEach((freq, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.15, t + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.01, t + i * 0.12 + 0.4);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.4);
    });
  } else if (type === 'error') {
    osc.type = 'square'; osc.frequency.value = 200;
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.2);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
    osc.start(t); osc.stop(t + 0.25);
  } else if (type === 'buy') {
    osc.type = 'sine'; osc.frequency.value = 523;
    osc.frequency.exponentialRampToValueAtTime(784, t + 0.1);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
    osc.start(t); osc.stop(t + 0.2);
  }
}

// ─── Audio ───
function playInstrument(id) {
  const inst = INSTRUMENTS[id];
  if (!inst) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = inst.wave;
  osc.frequency.value = inst.freq;
  gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.5);
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.start(); osc.stop(audioCtx.currentTime + 1.5);
  
  if (!gameState.instrumentsHeard.includes(id)) {
    gameState.instrumentsHeard.push(id);
    checkAch('music_lover', gameState.instrumentsHeard.length >= 4);
    saveGame();
  }
}

// ─── Input ───
function bindInputs() {
  window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  
  // Mouse look (drag on canvas)
  let dragging = false, lastMX = 0;
  const cvs = () => renderer?.domElement;
  document.addEventListener('mousedown', e => { if (running && e.target === cvs()) { dragging = true; lastMX = e.clientX; } });
  document.addEventListener('mouseup', () => dragging = false);
  document.addEventListener('mousemove', e => { if (dragging) { camAngle -= (e.clientX - lastMX) * 0.005; lastMX = e.clientX; } });
  
  // Touch camera (right half of screen)
  let camTouchId = null, camLastX = 0;
  document.addEventListener('touchstart', e => {
    for (const t of e.changedTouches) {
      if (t.clientX > window.innerWidth * 0.4 && running) {
        camTouchId = t.identifier; camLastX = t.clientX;
      }
    }
  });
  document.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === camTouchId) { camAngle -= (t.clientX - camLastX) * 0.007; camLastX = t.clientX; }
    }
  });
  document.addEventListener('touchend', e => {
    for (const t of e.changedTouches) { if (t.identifier === camTouchId) camTouchId = null; }
  });
  
  // Joystick
  const jBase = $('#joystick-base'), jThumb = $('#joystick-thumb');
  if (jBase) {
    let jTouchId = null, jBaseX = 0, jBaseY = 0;
    jBase.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.changedTouches[0];
      jTouchId = t.identifier; jBaseX = t.clientX; jBaseY = t.clientY; joyActive = true;
    });
    document.addEventListener('touchmove', e => {
      if (!joyActive) return;
      for (const t of e.changedTouches) {
        if (t.identifier === jTouchId) {
          const dx = t.clientX - jBaseX, dy = t.clientY - jBaseY;
          const dist = Math.min(Math.sqrt(dx*dx + dy*dy), 40);
          const a = Math.atan2(dy, dx);
          if (jThumb) jThumb.style.transform = `translate(${Math.cos(a)*dist}px,${Math.sin(a)*dist}px)`;
          joyDX = Math.cos(a) * (dist/40); joyDZ = Math.sin(a) * (dist/40);
        }
      }
    });
    const endJoy = () => { joyActive = false; joyDX = 0; joyDZ = 0; if (jThumb) jThumb.style.transform = ''; jTouchId = null; };
    document.addEventListener('touchend', endJoy);
    document.addEventListener('touchcancel', endJoy);
  }
  
  // Prevent scroll on canvas
  document.addEventListener('touchmove', e => { if (running && e.target === cvs()) e.preventDefault(); }, { passive: false });
  
  // Buttons
  $('#shop-btn')?.addEventListener('click', openShop);
  $('#close-shop')?.addEventListener('click', () => $('#shop-panel').classList.add('hidden'));
  $('#achieve-btn')?.addEventListener('click', openAchievements);
  $('#close-achieve')?.addEventListener('click', () => $('#achieve-panel').classList.add('hidden'));
  $('#close-korban-select')?.addEventListener('click', () => $('#korban-select-panel').classList.add('hidden'));
  $('#close-summary')?.addEventListener('click', () => $('#summary-panel').classList.add('hidden'));
  $('#edu-popup')?.addEventListener('click', () => $('#edu-popup').classList.add('hidden'));
  $('#info-btn')?.addEventListener('click', () => {
    const shir = DAILY_SHIR[new Date().getDay()];
    showEdu(`Today is ${shir.day}. The Leviim sing Tehillim ${shir.tehillim}:\n${shir.text}`, 'Tamid 7:4');
  });
  $('#mobile-interact-btn')?.addEventListener('touchstart', e => { e.preventDefault(); handleInteract(); });
}

// ─── Shop ───
function openShop() {
  closeAllPanels();
  const body = $('#shop-body');
  body.innerHTML = '';
  
  // Sell-back section (if player has items)
  const owned = Object.keys(gameState.inventory).filter(id => gameState.inventory[id] > 0);
  if (owned.length > 0) {
    const sellTitle = document.createElement('div');
    sellTitle.className = 'shop-section-title';
    sellTitle.textContent = '💱 Sell Back (50% price)';
    body.appendChild(sellTitle);
    const sellGrid = document.createElement('div');
    sellGrid.className = 'shop-grid';
    owned.forEach(itemId => {
      const item = SHOP_ITEMS[itemId];
      if (!item) return;
      const sellPrice = Math.floor(item.price / 2);
      const card = document.createElement('div');
      card.className = 'shop-card';
      card.innerHTML = `<div class="shop-emoji">${item.emoji}</div>
        <div class="shop-name">${item.name} (×${gameState.inventory[itemId]})</div>
        <div class="shop-price">Sell for 🪙${sellPrice}</div>
        <button class="shop-btn sell-btn">Sell 1</button>`;
      card.querySelector('.sell-btn').addEventListener('click', () => sellItem(itemId, sellPrice));
      sellGrid.appendChild(card);
    });
    body.appendChild(sellGrid);
  }
  
  // Animals
  const aTitle = document.createElement('div');
  aTitle.className = 'shop-section-title';
  aTitle.textContent = '🐑 Animals';
  body.appendChild(aTitle);
  const aGrid = document.createElement('div');
  aGrid.className = 'shop-grid';
  Object.values(SHOP_ITEMS).filter(i => i.category === 'animal').forEach(item => {
    const card = document.createElement('div');
    card.className = 'shop-card';
    card.innerHTML = `<div class="shop-emoji">${item.emoji}</div>
      <div class="shop-name">${item.name}</div>
      <div class="shop-price">🪙 ${item.price}</div>
      <div class="shop-desc">${item.desc || ''}</div>
      <button class="shop-btn" ${gameState.coins < item.price ? 'disabled' : ''}>Buy</button>`;
    card.querySelector('.shop-btn').addEventListener('click', () => buyItem(item.id));
    aGrid.appendChild(card);
  });
  body.appendChild(aGrid);
  
  // Menachot (Level 2+)
  if (gameState.level >= 2) {
    const mTitle = document.createElement('div');
    mTitle.className = 'shop-section-title';
    mTitle.textContent = '🌾 Menachot Ingredients';
    body.appendChild(mTitle);
    const mGrid = document.createElement('div');
    mGrid.className = 'shop-grid';
    Object.values(SHOP_ITEMS).filter(i => i.category === 'mincha').forEach(item => {
      const card = document.createElement('div');
      card.className = 'shop-card';
      card.innerHTML = `<div class="shop-emoji">${item.emoji}</div>
        <div class="shop-name">${item.name}</div>
        <div class="shop-price">🪙 ${item.price}</div>
        <button class="shop-btn" ${gameState.coins < item.price ? 'disabled' : ''}>Buy</button>`;
      card.querySelector('.shop-btn').addEventListener('click', () => buyItem(item.id));
      mGrid.appendChild(card);
    });
    body.appendChild(mGrid);
  }
  
  $('#shop-panel').classList.remove('hidden');
}

function buyItem(id) {
  const item = SHOP_ITEMS[id];
  if (!item || gameState.coins < item.price) return;
  gameState.coins -= item.price;
  gameState.totalSpent += item.price;
  gameState.inventory[id] = (gameState.inventory[id] || 0) + 1;
  toast(`Bought ${item.emoji} ${item.name}!`);
  playSFX('buy');
  checkAch('big_spender', gameState.totalSpent >= 500);
  updateHUD(); updateHotbar(); saveGame();
  openShop();
}

function sellItem(id, price) {
  if (!gameState.inventory[id] || gameState.inventory[id] <= 0) return;
  gameState.inventory[id]--;
  if (gameState.inventory[id] <= 0) delete gameState.inventory[id];
  gameState.coins += price;
  toast(`Sold ${SHOP_ITEMS[id]?.emoji || ''} for 🪙${price}`);
  updateHUD(); updateHotbar(); saveGame();
  openShop();
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
    card.innerHTML = `<div class="achieve-emoji">${ach.emoji}</div>
      <div><div class="achieve-name">${ach.name}</div><div class="achieve-desc">${ach.desc}</div></div>`;
    body.appendChild(card);
  });
  $('#achieve-panel').classList.remove('hidden');
}

function checkAch(id, cond) {
  if (gameState.achievements.includes(id) || !cond) return;
  gameState.achievements.push(id);
  const ach = ACHIEVEMENTS[id];
  toast(`🏆 Achievement: ${ach.emoji} ${ach.name}!`);
  saveGame();
}

// ─── Korban Selection ───
function openKorbanSelect() {
  closeAllPanels();
  const body = $('#korban-select-body');
  body.innerHTML = '';
  
  // Gather ALL korbanot the player can do with ALL animals they own
  const available = [];
  Object.keys(gameState.inventory).forEach(animalId => {
    if (!SHOP_ITEMS[animalId] || SHOP_ITEMS[animalId].category !== 'animal' || gameState.inventory[animalId] <= 0) return;
    const opts = ANIMAL_TO_KORBANOT[animalId] || [];
    opts.forEach(kId => {
      const k = KORBANOT[kId];
      if (k && k.levelRequired <= gameState.level && !available.find(a => a.id === kId)) {
        available.push(k);
      }
    });
  });
  
  if (available.length === 0) {
    body.innerHTML = '<p style="text-align:center;color:#7f8c8d;padding:20px;">No korbanot available. Buy animals from Shimon first!</p>';
    $('#korban-select-panel').classList.remove('hidden');
    return;
  }
  
  available.forEach(k => {
    const opt = document.createElement('div');
    opt.className = 'korban-option';
    const catClass = k.category === 'kodshei_kodashim' ? 'kk' : 'kl';
    const catLabel = k.category === 'kodshei_kodashim' ? 'Kodshei Kodashim' : 'Kodashim Kalim';
    const animalItem = SHOP_ITEMS[k.animal];
    opt.innerHTML = `<div class="korban-option-emoji">${k.emoji}</div>
      <div><div class="korban-option-name">${k.name} <span class="korban-option-category ${catClass}">${catLabel}</span></div>
      <div class="korban-option-desc">${k.description}</div>
      <div style="font-size:0.8em;color:#888;">Requires: ${animalItem?.emoji || ''} ${animalItem?.name || k.animal} · Reward: 🪙${k.coinReward}</div></div>`;
    opt.addEventListener('click', () => {
      $('#korban-select-panel').classList.add('hidden');
      beginAvodah(k.id);
    });
    body.appendChild(opt);
  });
  
  $('#korban-select-panel').classList.remove('hidden');
}

// ─── Avodah ───
function beginAvodah(korbanId) {
  const korban = KORBANOT[korbanId];
  if (!korban) return;
  if (!gameState.inventory[korban.animal] || gameState.inventory[korban.animal] <= 0) {
    toast(`You need a ${SHOP_ITEMS[korban.animal]?.name || korban.animal}!`);
    return;
  }
  gameState.inventory[korban.animal]--;
  if (gameState.inventory[korban.animal] <= 0) delete gameState.inventory[korban.animal];
  
  avodahActive = true;
  avodahKorban = korban;
  avodahMistakes = 0;
  avodahStep = 0;
  avodahSteps = AVODAH_STEPS[korban.type] || AVODAH_STEPS.olah;
  
  updateHotbar(); updateAvodahHUD(); updateAvodahWaypoints();
  toast(`Beginning ${korban.emoji} ${korban.name}!`);
  
  // First-time guidance
  if (gameState.level === 1) {
    showEdu(`${korban.description}\n\nFollow the steps at the top of the screen. Walk to the right location and press E for each step!`, korban.source);
  } else {
    const locHint = korban.slaughterLocation === 'north'
      ? '⚠️ Kodshei Kodashim — must be slaughtered in the NORTH!'
      : '✅ Kodashim Kalim — can be slaughtered anywhere in the Azara.';
    showEdu(`${korban.name} (${korban.nameHe})\n${locHint}`, korban.mishnah);
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
  if (!avodahActive || avodahStep >= avodahSteps.length) return;
  const step = avodahSteps[avodahStep];
  const px = playerPos.x, pz = playerPos.z;
  
  // Location checks
  if (step.id === 'shechita') {
    if (avodahKorban.slaughterLocation === 'north' && pz > NORTH_ZONE_Z) {
      avodahMistakes++;
      playSFX('error');
      showEdu(`⚠️ Wrong location! ${avodahKorban.name} is Kodshei Kodashim — slaughter in the NORTH! (Walk past the stone markers)`, 'Zevachim 5:1');
      return;
    }
    if (avodahKorban.slaughterLocation === 'north' && pz <= NORTH_ZONE_Z) {
      showEdu(`✅ Correct! Shechita of ${avodahKorban.name} in the north.`, avodahKorban.mishnah);
    } else if (avodahKorban.slaughterLocation === 'anywhere') {
      showEdu(`✅ ${avodahKorban.name} is Kodashim Kalim — anywhere in the Azara is fine.`, avodahKorban.mishnah);
    }
  }
  
  if (['holacha', 'zerika', 'haktarah'].includes(step.id)) {
    if (dist2D(px, pz, 0, 0) > 12) {
      toast('Walk closer to the Mizbeach!');
      return;
    }
  }
  
  if (step.id === 'zerika') {
    const desc = avodahKorban.bloodService === 'four_corners'
      ? 'Place blood on all 4 horns (Kranot) of the Mizbeach — one on each corner.'
      : avodahKorban.bloodService === 'squeeze_on_wall'
      ? 'Squeeze the blood on the wall of the Mizbeach (Melikah for birds).'
      : 'Two placements that are four (Shnayim She\'hen Arba) — on two diagonal corners, so the blood touches all four sides.';
    showEdu(desc, avodahKorban.mishnah);
    if (!gameState.bloodTypesCompleted.includes(avodahKorban.bloodService)) {
      gameState.bloodTypesCompleted.push(avodahKorban.bloodService);
      checkAch('blood_expert', gameState.bloodTypesCompleted.length >= 2);
    }
  }
  
  if (step.id === 'haktarah') {
    const desc = avodahKorban.type === 'olah'
      ? 'The entire Olah is burned on the Mizbeach — a "Re\'ach Nichoach laHashem."'
      : avodahKorban.type === 'chatat'
      ? `The Chalavim (fats) are burned. Meat eaten by male Kohanim in the Azara, ${avodahKorban.eatingTimeLimit}.`
      : `The Chalavim (fats) are burned. Meat shared by anyone tahor, in Yerushalayim, ${avodahKorban.eatingTimeLimit}.`;
    showEdu(desc, avodahKorban.source);
  }
  
  toast(`${step.emoji} ${step.name} — Done!`);
  playSFX('step_complete');
  
  // Visual feedback
  const pColor = step.id === 'shechita' ? 0xFF3333 :
                 step.id === 'kabbalah' ? 0xFF3333 :
                 step.id === 'zerika' ? 0xCC0000 :
                 step.id === 'haktarah' ? 0xFF6600 : 0xFFD700;
  spawnParticles(playerPos.x, playerPos.y + 1, playerPos.z, pColor, 12);
  
  avodahStep++;
  updateAvodahHUD();
  updateAvodahWaypoints();
  
  if (avodahStep >= avodahSteps.length) completeAvodah();
}

function completeAvodah() {
  avodahActive = false;
  const k = avodahKorban;
  const perfect = avodahMistakes === 0;
  const bonus = perfect ? Math.round(k.coinReward * 0.5) : 0;
  const total = k.coinReward + bonus;
  
  gameState.coins += total;
  gameState.totalCoinsEarned += total;
  gameState.korbanotCompleted++;
  if (perfect) gameState.korbanotPerfect++;
  if (k.id === 'tamid') gameState.tamidCount++;
  
  checkAch('first_avodah', true);
  checkAch('tamid_week', gameState.tamidCount >= 14);
  checkAch('perfect_five', gameState.korbanotPerfect >= 5);
  checkAch('kohen_rising', gameState.korbanotCompleted >= 50);
  
  const eatenText = k.eatenBy === 'none'
    ? '<div class="summary-detail">🔥 Entirely consumed on the Mizbeach</div>'
    : `<div class="summary-detail">🍖 Eaten by: ${k.eatenBy === 'male_kohanim' ? 'Male Kohanim only' : 'Anyone who is tahor'} in ${k.eatingLocation} — ${k.eatingTimeLimit}</div>`;
  
  $('#summary-body').innerHTML = `
    <div class="summary-emoji">${k.emoji}</div>
    <div class="summary-title">${k.name} (${k.nameHe})</div>
    <div class="summary-detail">${k.description}</div>
    <div class="summary-source">📖 ${k.source} | ${k.mishnah}</div>
    ${eatenText}
    <div class="summary-coins">+🪙${total}${bonus > 0 ? ` (includes +${bonus} perfect bonus!)` : ''}</div>
    ${perfect ? '<div style="color:#27ae60;font-weight:700;">✨ Perfect Service!</div>' : `<div style="color:#e67e22;">Mistakes: ${avodahMistakes}</div>`}
    <button class="btn btn-gold summary-btn" id="summary-close-btn">Continue</button>`;
  $('#summary-close-btn').addEventListener('click', () => $('#summary-panel').classList.add('hidden'));
  $('#summary-panel').classList.remove('hidden');
  
  // Victory!
  playSFX('complete');
  spawnParticles(playerPos.x, playerPos.y + 1.5, playerPos.z, 0xFFD700, 25);
  
  avodahKorban = null; avodahSteps = []; avodahStep = 0;
  removeWaypoint();
  updateAvodahHUD(); updateHUD(); updateHotbar(); saveGame();
  checkLevelUp();
}

// ─── Interaction ───
function handleInteract() {
  if (!running) return;
  if (avodahActive) { advanceAvodah(); return; }
  
  const px = playerPos.x, pz = playerPos.z;
  
  if (dist2D(px, pz, SHIMON_POS.x, SHIMON_POS.z) < INTERACT_DIST + 2) { openShop(); return; }
  
  for (const levi of leviimGroups) {
    if (dist2D(px, pz, levi.position.x, levi.position.z) < INTERACT_DIST) {
      const inst = INSTRUMENTS[levi.userData.instrumentId];
      playInstrument(levi.userData.instrumentId);
      showEdu(`${inst.emoji} ${inst.name} (${inst.nameHe})\n${inst.desc}`, inst.source);
      return;
    }
  }
  
  if (dist2D(px, pz, KIYOR_POS.x, KIYOR_POS.z) < INTERACT_DIST) {
    showEdu('The Kiyor (כיור) — a bronze laver. Every Kohen must wash hands and feet before the Avodah.\n\n"And Aharon and his sons shall wash their hands and feet from it." (Shemot 30:19)', 'Shemot 30:19-21');
    return;
  }
  
  if (dist2D(px, pz, 0, 0) < 14) {
    const hasAnimal = Object.keys(gameState.inventory).some(id => SHOP_ITEMS[id]?.category === 'animal' && gameState.inventory[id] > 0);
    if (hasAnimal) { openKorbanSelect(); return; }
    toast('Buy an animal from Shimon first! 🏪 (He\'s at the booth to the southeast)');
    return;
  }
  
  // Welcome sign
  if (Math.abs(px) < 3 && Math.abs(pz - 26) < 3) {
    showEdu('Welcome to the Beit HaMikdash!\n\n🏪 Visit Shimon (southeast) to buy a korban\n🔪 Walk north to slaughter\n🔥 Bring blood to the Mizbeach\n📖 Talk to the Leviim to hear their music!', '');
    return;
  }
}

function dist2D(x1, z1, x2, z2) { return Math.sqrt((x1-x2)**2 + (z1-z2)**2); }

// ─── UI ───
function toast(msg) {
  const c = $('#toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function showEdu(text, source) {
  const el = $('#edu-popup'), content = $('#edu-popup-content');
  if (!el || !content) return;
  content.innerHTML = text.replace(/\n/g, '<br>') + (source ? `<div class="source">📖 ${source}</div>` : '');
  el.classList.remove('hidden');
  gameState.sourcesRead++;
  checkAch('torah_scholar', gameState.sourcesRead >= 20);
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 7000);
}

function updateHUD() {
  const ce = $('#coins-count'), le = $('#level-num'), ke = $('#korbanot-count');
  if (ce) ce.textContent = gameState.coins;
  if (le) le.textContent = gameState.level;
  if (ke) ke.textContent = gameState.korbanotCompleted;
}

function updateHotbar() {
  const hotbar = $('#hotbar');
  if (!hotbar) return;
  hotbar.innerHTML = '';
  const items = Object.keys(gameState.inventory).filter(id => gameState.inventory[id] > 0);
  if (items.length === 0) {
    hotbar.innerHTML = '<div class="hotbar-slot"><span class="slot-emoji" style="opacity:0.3">🕊️</span></div>';
    return;
  }
  items.slice(0, 9).forEach(id => {
    const item = SHOP_ITEMS[id];
    if (!item) return;
    const slot = document.createElement('div');
    slot.className = 'hotbar-slot';
    slot.innerHTML = `<span class="slot-emoji">${item.emoji}</span><span class="slot-count">${gameState.inventory[id]}</span>`;
    hotbar.appendChild(slot);
  });
}

function updatePrompt() {
  const el = $('#interaction-prompt');
  if (!el) return;
  const px = playerPos.x, pz = playerPos.z;
  
  if (avodahActive && avodahStep < avodahSteps.length) {
    const step = avodahSteps[avodahStep];
    let hint = `Press E: ${step.emoji} ${step.name}`;
    if (step.id === 'shechita' && avodahKorban.slaughterLocation === 'north') {
      hint += pz <= NORTH_ZONE_Z ? ' ✅ (North zone)' : ' ⚠️ (Walk NORTH past the markers!)';
    }
    if (['holacha','zerika','haktarah'].includes(step.id) && dist2D(px,pz,0,0) > 12) {
      hint += ' — Walk to the Mizbeach';
    }
    el.textContent = hint; el.classList.remove('hidden'); return;
  }
  
  if (dist2D(px,pz,SHIMON_POS.x,SHIMON_POS.z) < INTERACT_DIST + 2) { el.textContent = 'Press E — Talk to Shimon 🏪'; el.classList.remove('hidden'); return; }
  if (dist2D(px,pz,KIYOR_POS.x,KIYOR_POS.z) < INTERACT_DIST) { el.textContent = 'Press E — Wash at the Kiyor'; el.classList.remove('hidden'); return; }
  if (leviimGroups.some(l => dist2D(px,pz,l.position.x,l.position.z) < INTERACT_DIST)) { el.textContent = 'Press E — Listen to the Leviim 🎵'; el.classList.remove('hidden'); return; }
  if (dist2D(px,pz,0,0) < 14 && !avodahActive) {
    const has = Object.keys(gameState.inventory).some(id => SHOP_ITEMS[id]?.category === 'animal' && gameState.inventory[id] > 0);
    if (has) { el.textContent = 'Press E — Begin Avodah 🔥'; el.classList.remove('hidden'); return; }
  }
  if (Math.abs(px) < 3 && Math.abs(pz - 26) < 3) { el.textContent = 'Press E — Read the Welcome Sign'; el.classList.remove('hidden'); return; }
  el.classList.add('hidden');
}

function updateCompass() {
  const el = $('#compass-arrow');
  if (!el) return;
  // camAngle = angle of camera. North = negative Z direction. 
  // Arrow should point north = rotate based on camAngle
  el.style.transform = `rotate(${camAngle}rad)`;
}

function updateZoneIndicator() {
  const el = $('#zone-indicator');
  if (!el) return;
  if (avodahActive && playerPos.z < NORTH_ZONE_Z) {
    el.style.display = 'block';
    el.textContent = '🔪 NORTH ZONE — צפון';
  } else {
    el.style.display = 'none';
  }
}

function closeAllPanels() {
  ['shop-panel','achieve-panel','korban-select-panel','summary-panel'].forEach(id => {
    const el = $('#'+id); if (el) el.classList.add('hidden');
  });
}

function isAnyPanelOpen() {
  return ['shop-panel','achieve-panel','korban-select-panel','summary-panel','new-profile-modal'].some(id => {
    const el = $('#'+id); return el && !el.classList.contains('hidden');
  });
}

// ─── Game Loop ───
function animate() {
  animFrameId = requestAnimationFrame(animate);
  if (!running) return;
  
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsedTime += dt;
  
  autoSaveTimer += dt;
  if (autoSaveTimer >= AUTO_SAVE_SEC) { autoSaveTimer = 0; saveGame(); }
  
  if (!isAnyPanelOpen()) updatePlayer(dt);
  
  updateFire(elapsedTime);
  updateNPCs(elapsedTime);
  updateWaypoint(elapsedTime);
  updateParticles(dt);
  updatePrompt();
  updateCompass();
  updateZoneIndicator();
  updateWorldLabels();
  updateCamera();
  
  renderer.render(scene, camera);
}

// ─── Player Movement ───
function updatePlayer(dt) {
  let mx = 0, mz = 0;
  
  if (joyActive) { mx = joyDX; mz = joyDZ; }
  else {
    if (keys['w'] || keys['arrowup']) mz = -1;
    if (keys['s'] || keys['arrowdown']) mz = 1;
    if (keys['a'] || keys['arrowleft']) mx = -1;
    if (keys['d'] || keys['arrowright']) mx = 1;
  }
  
  // Camera-relative movement
  // camAngle = 0 means camera looks along +Z, PI means camera looks along -Z
  // W should move FORWARD (away from camera = toward where camera looks)
  // The camera is BEHIND the player, so forward = direction camera faces
  const sinA = Math.sin(camAngle);
  const cosA = Math.cos(camAngle);
  // Forward vector (camera facing direction) is (sinA, cosA) 
  // Right vector is (cosA, -sinA)
  const worldX = mx * cosA + mz * sinA;
  const worldZ = -mx * sinA + mz * cosA;
  
  const len = Math.sqrt(worldX * worldX + worldZ * worldZ);
  if (len > 0) {
    const speed = PLAYER_SPEED * dt;
    const nx = (worldX / len) * speed;
    const nz = (worldZ / len) * speed;
    
    // Try to move, with collision
    const newX = playerPos.x + nx;
    const newZ = playerPos.z + nz;
    if (canMoveTo(newX, playerPos.z)) playerPos.x = newX;
    if (canMoveTo(playerPos.x, newZ)) playerPos.z = newZ;
    
    // Face movement direction
    playerGroup.rotation.y = Math.atan2(worldX, worldZ);
    
    // Leg animation
    const legAng = Math.sin(elapsedTime * 10) * 0.4;
    if (playerGroup.children[6]) playerGroup.children[6].rotation.x = legAng;
    if (playerGroup.children[7]) playerGroup.children[7].rotation.x = -legAng;
  } else {
    // Reset legs when standing
    if (playerGroup.children[6]) playerGroup.children[6].rotation.x = 0;
    if (playerGroup.children[7]) playerGroup.children[7].rotation.x = 0;
  }
  
  // Ground height (ramp support)
  const targetY = getGroundHeight(playerPos.x, playerPos.z);
  
  // Gravity / grounding
  if (playerPos.y > targetY + 0.01) {
    playerVelY -= 18 * dt;
    playerPos.y += playerVelY * dt;
    if (playerPos.y <= targetY) {
      playerPos.y = targetY;
      playerVelY = 0;
      onGround = true;
    } else {
      onGround = false;
    }
  } else {
    playerPos.y = targetY;
    playerVelY = 0;
    onGround = true;
  }
  
  // Jump
  if ((keys[' '] || keys['space']) && onGround) {
    playerVelY = 6;
    onGround = false;
  }
  
  // Interact
  if (keys['e']) { keys['e'] = false; handleInteract(); }
  
  playerGroup.position.set(playerPos.x, playerPos.y, playerPos.z);
}

function updateCamera() {
  const cx = playerPos.x - Math.sin(camAngle) * CAM_DISTANCE;
  const cz = playerPos.z - Math.cos(camAngle) * CAM_DISTANCE;
  const cy = playerPos.y + CAM_HEIGHT_OFFSET;
  camera.position.set(cx, cy, cz);
  camera.lookAt(playerPos.x, playerPos.y + PLAYER_HEIGHT * 0.6, playerPos.z);
}

// ─── Save on visibility change ───
document.addEventListener('visibilitychange', () => { if (running) saveGame(); });
window.addEventListener('beforeunload', () => { if (running) saveGame(); });
window.addEventListener('pagehide', () => { if (running) saveGame(); });

// ─── Boot ───
renderProfiles();

$('#new-profile-btn')?.addEventListener('click', () => {
  $('#new-profile-modal').classList.remove('hidden');
  $('#profile-name-input').value = '';
  $('#profile-name-input').focus();
});
$('#cancel-profile-btn')?.addEventListener('click', () => $('#new-profile-modal').classList.add('hidden'));
$('#create-profile-btn')?.addEventListener('click', () => {
  const name = $('#profile-name-input').value.trim();
  if (!name) return;
  const levelBtn = document.querySelector('.level-btn.selected');
  const level = parseInt(levelBtn?.dataset?.level) || 1;
  $('#new-profile-modal').classList.add('hidden');
  createProfile(name, level);
});
document.querySelectorAll('.level-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.level-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});

// Show welcome guidance on first load
toast('🏛️ Welcome to the Beit HaMikdash!');

})();
