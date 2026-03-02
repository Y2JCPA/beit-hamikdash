/* ============================================
   AVODAH — Beit HaMikdash Simulator V2
   All known issues from V1 fixed.
   ============================================ */
(function() {
'use strict';

// Diagnostic logger
const _log = [];
function _dbg(msg) {
  _log.push(msg);
  let d = document.getElementById('_dbg');
  if (!d) { d = document.createElement('div'); d.id='_dbg'; d.style.cssText='position:fixed;top:0;left:0;right:0;background:rgba(0,0,0,0.85);color:#0f0;font:12px monospace;padding:8px;z-index:99999;max-height:50vh;overflow:auto;'; document.body.appendChild(d); }
  d.innerHTML = _log.join('<br>');
}
window.onerror = function(msg, src, line) { _dbg('❌ ERROR: ' + msg + ' (line ' + line + ')'); return false; };

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
const UI_REFRESH_SEC = 0.05;
const PLAYER_SPRINT_MULT = 1.35;
const MAX_ACTIVE_PARTICLES = 120;
const KAVANAH_WINDOW_SEC = 6;
const TAHARAH_BUFF_SEC = 45;
const FRAME_DT_MAX = 0.05;
const FRAME_DT_SMOOTH_ALPHA = 0.2;
const MOVE_ACCEL = 30;
const MOVE_DECEL = 24;
const ENABLE_CAMERA_SMOOTHING = true;
const CAMERA_LERP_STRENGTH = 10;
const INTERACT_DEBOUNCE_SEC = 0.18;
const INTERACT_RANGE_BONUS = 0.4;

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
let playerVelX = 0, playerVelZ = 0;
let camAngle = Math.PI;  // Start facing north (into the azara)
let keys = {};
let running = false;
let animFrameId = null;
let autoSaveTimer = 0;
let elapsedTime = 0;
let uiRefreshTimer = 0;
let smoothedDt = 1 / 60;
let lastInteractAt = -999;
let hasAnimalForAvodah = false;
let inventoryDirty = true;

// NPCs
let shimonGroup, leviimGroups = [], fireBoxes = [];

// Enhanced: waypoints, particles, labels
let waypointMesh = null, particles = [], particlePool = [], worldLabels = [];
let particleGeometry = null;
let worldLabelProjectVec = null;
let cameraTargetPos = null;
let cameraLookTarget = null;
let cameraLookCurrent = null;
const PANEL_IDS = ['shop-panel','achieve-panel','korban-select-panel','summary-panel','new-profile-modal'];

// Avodah
let avodahActive = false, avodahStep = 0, avodahKorban = null;
let avodahMistakes = 0, avodahSteps = [];
let kavanahStreak = 0;
let lastAvodahStepAt = 0;
let taharahBuffUntil = 0;

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
  markInventoryDirty();
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

function markInventoryDirty() {
  inventoryDirty = true;
}

function refreshInventoryDerivedState() {
  if (!inventoryDirty) return;
  hasAnimalForAvodah = Object.keys(gameState.inventory).some(
    id => SHOP_ITEMS[id]?.category === 'animal' && gameState.inventory[id] > 0
  );
  inventoryDirty = false;
}

function disposeMaterial(mat) {
  if (!mat) return;
  if (Array.isArray(mat)) {
    mat.forEach(disposeMaterial);
    return;
  }
  mat.dispose?.();
}

function teardownScene() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  running = false;
  removeWaypoint();
  worldLabels.forEach(l => l.div.remove());
  worldLabels = [];
  particles.length = 0;
  particlePool.length = 0;
  if (scene) {
    const seenGeos = new Set();
    const seenMats = new Set();
    scene.traverse(obj => {
      if (!obj.isMesh) return;
      if (obj.geometry && !seenGeos.has(obj.geometry)) {
        seenGeos.add(obj.geometry);
        obj.geometry.dispose?.();
      }
      const mat = obj.material;
      if (mat && !seenMats.has(mat)) {
        seenMats.add(mat);
        disposeMaterial(mat);
      }
    });
  }
  if (renderer) {
    renderer.domElement.remove();
    renderer.dispose();
  }
  scene = null;
  renderer = null;
  camera = null;
  particleGeometry = null;
  worldLabelProjectVec = null;
  cameraTargetPos = null;
  cameraLookTarget = null;
  cameraLookCurrent = null;
}

// ─── Scene Setup ───
function startGame() {
  _dbg('1. startGame called');
  teardownScene();
  autoSaveTimer = 0;
  elapsedTime = 0;
  uiRefreshTimer = 0;
  taharahBuffUntil = 0;
  kavanahStreak = 0;
  lastAvodahStepAt = 0;
  
  _dbg('2. Creating scene...');
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
  particleGeometry = new THREE.BoxGeometry(1, 1, 1);
  worldLabelProjectVec = new THREE.Vector3();
  _dbg('3. Renderer created: ' + renderer.domElement.width + 'x' + renderer.domElement.height);
  
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
  _dbg('4. Lights added');
  
  COLLIDERS.length = 0;
  _dbg('5. Building world...');
  buildWorld();
  _dbg('6. World built. Scene children: ' + scene.children.length);
  buildPlayer();
  _dbg('7. Player built');
  buildNPCs();
  _dbg('8. NPCs built');
  buildFire();
  _dbg('9. Fire built');
  
  playerPos = new THREE.Vector3(0, 0, 20);
  playerVelX = 0;
  playerVelZ = 0;
  playerVelY = 0;
  smoothedDt = 1 / 60;
  lastInteractAt = -999;
  camAngle = Math.PI;
  refreshInventoryDerivedState();
  
  // Set camera position immediately
  camera.position.set(0, 4, 28);
  camera.lookAt(0, 1, 20);
  cameraTargetPos = new THREE.Vector3(0, 4, 28);
  cameraLookTarget = new THREE.Vector3(0, 1, 20);
  cameraLookCurrent = new THREE.Vector3(0, 1, 20);
  _dbg('10. Camera at (0,4,28) looking at (0,1,20)');
  
  // Test render
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  gl.readPixels(Math.floor(renderer.domElement.width/2), Math.floor(renderer.domElement.height/2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  _dbg('11. Test render center pixel: RGBA(' + px[0] + ',' + px[1] + ',' + px[2] + ',' + px[3] + ')');
  _dbg('    WebGL error: ' + gl.getError());
  
  avodahActive = false; avodahStep = 0; avodahKorban = null;
  
  $('#hud').classList.remove('hidden');
  _dbg('12. HUD shown');
  updateHUD(); updateHotbar(); updateAvodahHUD(); updateStatusEffects();
  if (isMobile) $('#mobile-controls').classList.remove('hidden');
  
  buildLabels();
  if (!window._inputsBound) { bindInputs(); window._inputsBound = true; }
  
  running = true;
  animate();
  
  // Tutorial on first play
  if (gameState.korbanotCompleted === 0) {
    setTimeout(() => showEdu('🏛️ Welcome, Kohen!\n\n🖱️ DRAG to rotate camera\nWASD/Arrows to walk\nE to interact\n\n👣 Visit Shimon (🏪 southeast) to buy an animal.\nThen walk to the Mizbeach and press E!', ''), 1000);
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
  g.add((() => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.35), r); m.position.set(0, 0.85, 0); return m; })());
  g.add((() => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), s); m.position.set(0, 1.55, 0); return m; })());
  g.add((() => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.2, 0.38), a); m.position.set(0, 1.8, 0); return m; })());
  // legs
  g.add((() => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4, 0.18), r); m.position.set(-0.12, 0.2, 0); return m; })());
  g.add((() => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4, 0.18), r); m.position.set(0.12, 0.2, 0); return m; })());
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

// ═══ ENHANCEMENTS ═══

// ─── Sound Effects ───
function playSFX(type) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  if (type === 'step') {
    osc.type = 'sine'; osc.frequency.value = 660;
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.15);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    osc.start(t); osc.stop(t + 0.3);
  } else if (type === 'complete') {
    [440, 554, 660, 880].forEach((freq, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
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

// ─── Particles ───
function spawnParticles(x, y, z, color, count) {
  const room = Math.max(0, MAX_ACTIVE_PARTICLES - particles.length);
  const emitCount = Math.min(count, room);
  for (let i = 0; i < emitCount; i++) {
    let m = particlePool.pop();
    if (!m) {
      m = new THREE.Mesh(
        particleGeometry,
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 })
      );
      m.userData.vel = new THREE.Vector3();
    }
    const s = 0.08 + Math.random() * 0.12;
    m.material.color.setHex(color);
    m.material.opacity = 0.9;
    m.position.set(x, y, z);
    m.scale.setScalar(s);
    m.userData.life = 1;
    m.userData.vel.set((Math.random() - 0.5) * 3, Math.random() * 4 + 1, (Math.random() - 0.5) * 3);
    scene.add(m);
    particles.push(m);
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.userData.life -= dt * 1.5;
    if (p.userData.life <= 0) {
      scene.remove(p);
      particles.splice(i, 1);
      particlePool.push(p);
      continue;
    }
    p.position.x += p.userData.vel.x * dt;
    p.position.y += p.userData.vel.y * dt;
    p.position.z += p.userData.vel.z * dt;
    p.userData.vel.y -= 6 * dt;
    p.material.opacity = p.userData.life;
    p.scale.multiplyScalar(0.985);
  }
}

// ─── Waypoints ───
function showWaypoint(x, y, z, color) {
  removeWaypoint();
  waypointMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.2, 1),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 })
  );
  waypointMesh.position.set(x, y + 0.15, z);
  scene.add(waypointMesh);
  const pillar = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 4, 0.15),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3 })
  );
  pillar.position.set(x, y + 2, z);
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
  if (avodahActive && avodahSteps[avodahStep]?.id === 'shechita' && avodahKorban?.slaughterLocation === 'anywhere') {
    waypointMesh.position.x = playerPos.x;
    waypointMesh.position.z = playerPos.z;
    if (waypointMesh.userData.pillar) {
      waypointMesh.userData.pillar.position.x = playerPos.x;
      waypointMesh.userData.pillar.position.z = playerPos.z;
    }
  }
  waypointMesh.position.y += Math.sin(t * 3) * 0.003;
  waypointMesh.rotation.y = t * 2;
  waypointMesh.material.opacity = 0.4 + Math.sin(t * 4) * 0.2;
  if (waypointMesh.userData.pillar) waypointMesh.userData.pillar.material.opacity = 0.15 + Math.sin(t * 3) * 0.1;
}
function updateAvodahWaypoints() {
  if (!avodahActive || avodahStep >= avodahSteps.length) { removeWaypoint(); return; }
  const step = avodahSteps[avodahStep];
  if (step.id === 'shechita') {
    if (avodahKorban.slaughterLocation === 'north') showWaypoint(0, 0, -18, 0xFF4444);
    else showWaypoint(playerPos.x, 0, playerPos.z, 0x44FF44);
  } else if (['holacha','zerika','haktarah'].includes(step.id)) {
    showWaypoint(0, 0, KEVESH_END_Z - 2, 0xFF6600);
  }
}

// ─── World Labels ───
function addWorldLabel(text, x, y, z, cls) {
  const div = document.createElement('div');
  div.className = 'world-label ' + (cls || '');
  div.textContent = text;
  document.body.appendChild(div);
  worldLabels.push({ div, pos: new THREE.Vector3(x, y, z) });
}
function updateWorldLabels() {
  if (!camera || !renderer) return;
  const w2 = renderer.domElement.clientWidth / 2, h2 = renderer.domElement.clientHeight / 2;
  for (const l of worldLabels) {
    worldLabelProjectVec.copy(l.pos).project(camera);
    const distSq = l.pos.distanceToSquared(camera.position);
    if (worldLabelProjectVec.z > 1 || distSq > 1600) { l.div.style.display = 'none'; continue; }
    l.div.style.display = 'block';
    l.div.style.left = ((worldLabelProjectVec.x * w2) + w2) + 'px';
    l.div.style.top = (-(worldLabelProjectVec.y * h2) + h2) + 'px';
    const dist = Math.sqrt(distSq);
    l.div.style.opacity = Math.max(0, Math.min(1, 1 - (dist - 25) / 15));
  }
}
function buildLabels() {
  worldLabels.forEach(l => l.div.remove()); worldLabels = [];
  addWorldLabel('🏪 Shimon', SHIMON_POS.x, 3.8, SHIMON_POS.z, 'label-npc');
  addWorldLabel('🎵 Leviim', DUCHAN_POS.x, 3, DUCHAN_POS.z, 'label-npc');
  addWorldLabel('🔥 Mizbeach', 0, MIZBEACH_H + 3, 0, 'label-place');
  addWorldLabel('🚿 Kiyor', KIYOR_POS.x, 3.5, KIYOR_POS.z, 'label-place');
  addWorldLabel('🔪 North Zone', 0, 1.5, -20, 'label-zone');
}

// ─── Level Up ───
function checkLevelUp() {
  if (gameState.level === 1 && gameState.korbanotCompleted >= 5) {
    gameState.level = 2;
    playSFX('complete');
    spawnParticles(playerPos.x, playerPos.y + 2, playerPos.z, 0xFFD700, 30);
    showEdu('🎉 LEVEL UP — Kohen Mishamesh!\n\nYou can now:\n• More Korbanot (Chatat, Asham, Shelamim)\n• Buy Menachot from Shimon\n• Location matters: Kodshei Kodashim = NORTH only!', 'Zevachim 5:1-8');
    updateHUD(); saveGame();
    toast('⬆️ Level 2 Unlocked!');
  }
}

// ─── Compass + Zone ───
function updateCompass() {
  const el = $('#compass-arrow');
  if (el) el.style.transform = 'rotate(' + camAngle + 'rad)';
}
function updateZoneIndicator() {
  const el = $('#zone-indicator');
  if (!el) return;
  el.style.display = (avodahActive && playerPos.z < NORTH_ZONE_Z) ? 'block' : 'none';
  if (el.style.display === 'block') el.textContent = '🔪 NORTH ZONE — צפון';
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
  const blockedKeys = new Set(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ','space','e','shift']);
  window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (blockedKeys.has(key)) e.preventDefault();
    if (e.repeat && key === 'e') return;
    keys[key] = true;
  });
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
  markInventoryDirty();
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
  markInventoryDirty();
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
  markInventoryDirty();
  
  avodahActive = true;
  avodahKorban = korban;
  avodahMistakes = 0;
  avodahStep = 0;
  avodahSteps = AVODAH_STEPS[korban.type] || AVODAH_STEPS.olah;
  kavanahStreak = 0;
  lastAvodahStepAt = 0;
  
  updateHotbar(); updateAvodahHUD(); updateAvodahWaypoints(); updateStatusEffects();
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
    if (!isWithinDist(px, pz, 0, 0, 12)) {
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
  playSFX('step');
  const pColor = step.id === 'shechita' ? 0xFF3333 : step.id === 'zerika' ? 0xCC0000 : step.id === 'haktarah' ? 0xFF6600 : 0xFFD700;
  spawnParticles(playerPos.x, playerPos.y + 1, playerPos.z, pColor, 12);
  if (lastAvodahStepAt > 0 && elapsedTime - lastAvodahStepAt <= KAVANAH_WINDOW_SEC) kavanahStreak++;
  else kavanahStreak = 1;
  lastAvodahStepAt = elapsedTime;
  if (kavanahStreak >= 2) toast(`✨ Kavanah Streak x${kavanahStreak}`);
  avodahStep++;
  updateAvodahHUD();
  updateAvodahWaypoints();
  updateStatusEffects();
  
  if (avodahStep >= avodahSteps.length) completeAvodah();
}

function completeAvodah() {
  avodahActive = false;
  const k = avodahKorban;
  const perfect = avodahMistakes === 0;
  const perfectBonus = perfect ? Math.round(k.coinReward * 0.5) : 0;
  const streakBonus = Math.max(0, (kavanahStreak - 1) * 2);
  const taharahBonus = elapsedTime < taharahBuffUntil
    ? Math.round((k.coinReward + perfectBonus + streakBonus) * 0.1)
    : 0;
  const total = k.coinReward + perfectBonus + streakBonus + taharahBonus;
  
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
    <div class="summary-coins">+🪙${total}</div>
    ${perfectBonus > 0 ? `<div class="summary-detail">✨ Perfect bonus: +${perfectBonus}</div>` : ''}
    ${streakBonus > 0 ? `<div class="summary-detail">🕊️ Kavanah streak bonus: +${streakBonus}</div>` : ''}
    ${taharahBonus > 0 ? `<div class="summary-detail">🚿 Taharah focus bonus: +${taharahBonus}</div>` : ''}
    ${perfect ? '<div style="color:#27ae60;font-weight:700;">✨ Perfect Service!</div>' : `<div style="color:#e67e22;">Mistakes: ${avodahMistakes}</div>`}
    <button class="btn btn-gold summary-btn" id="summary-close-btn">Continue</button>`;
  $('#summary-close-btn').addEventListener('click', () => $('#summary-panel').classList.add('hidden'));
  $('#summary-panel').classList.remove('hidden');
  
  playSFX('complete');
  spawnParticles(playerPos.x, playerPos.y + 1.5, playerPos.z, 0xFFD700, 25);
  if (streakBonus > 0 || taharahBonus > 0) toast(`+🪙 Bonuses: ${streakBonus + taharahBonus}`);
  avodahKorban = null; avodahSteps = []; avodahStep = 0;
  kavanahStreak = 0;
  lastAvodahStepAt = 0;
  removeWaypoint();
  updateAvodahHUD(); updateStatusEffects(); updateHUD(); updateHotbar(); saveGame();
  checkLevelUp();
}

// ─── Interaction ───
function getInteractionContext() {
  const px = playerPos.x, pz = playerPos.z;
  const shimonDist = INTERACT_DIST + 2 + INTERACT_RANGE_BONUS;
  if (isWithinDist(px, pz, SHIMON_POS.x, SHIMON_POS.z, shimonDist)) return { type: 'shimon' };

  let nearestLevi = null;
  let nearestLeviDistSq = Infinity;
  const leviRange = INTERACT_DIST + INTERACT_RANGE_BONUS;
  const leviRangeSq = leviRange * leviRange;
  for (const levi of leviimGroups) {
    const dx = px - levi.position.x;
    const dz = pz - levi.position.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= leviRangeSq && d2 < nearestLeviDistSq) {
      nearestLevi = levi;
      nearestLeviDistSq = d2;
    }
  }
  if (nearestLevi) return { type: 'levi', levi: nearestLevi };

  if (isWithinDist(px, pz, KIYOR_POS.x, KIYOR_POS.z, INTERACT_DIST + INTERACT_RANGE_BONUS)) return { type: 'kiyor' };

  if (isWithinDist(px, pz, 0, 0, 14 + INTERACT_RANGE_BONUS)) {
    refreshInventoryDerivedState();
    if (hasAnimalForAvodah) return { type: 'mizbeach' };
    return { type: 'mizbeach-no-animal' };
  }

  if (Math.abs(px) < 3.2 && Math.abs(pz - 26) < 3.2) return { type: 'sign' };
  return null;
}

function handleInteract() {
  if (!running) return;
  if (elapsedTime - lastInteractAt < INTERACT_DEBOUNCE_SEC) return;
  lastInteractAt = elapsedTime;
  if (avodahActive) { advanceAvodah(); return; }

  const ctx = getInteractionContext();
  if (!ctx) return;

  if (ctx.type === 'shimon') { openShop(); return; }

  if (ctx.type === 'levi') {
    const inst = INSTRUMENTS[ctx.levi.userData.instrumentId];
    playInstrument(ctx.levi.userData.instrumentId);
    showEdu(`${inst.emoji} ${inst.name} (${inst.nameHe})\n${inst.desc}`, inst.source);
    return;
  }

  if (ctx.type === 'kiyor') {
    if (taharahBuffUntil - elapsedTime < 8) {
      taharahBuffUntil = elapsedTime + TAHARAH_BUFF_SEC;
      spawnParticles(KIYOR_POS.x, 2.5, KIYOR_POS.z, 0x5AB7FF, 16);
      toast('🚿 Taharah Focus: +10% coin rewards for 45s');
    }
    updateStatusEffects();
    showEdu('The Kiyor (כיור) — a bronze laver. Every Kohen must wash hands and feet before the Avodah.\n\n"And Aharon and his sons shall wash their hands and feet from it." (Shemot 30:19)', 'Shemot 30:19-21');
    return;
  }

  if (ctx.type === 'mizbeach') {
    openKorbanSelect();
    return;
  }

  if (ctx.type === 'mizbeach-no-animal') {
    toast('Buy an animal from Shimon first! 🏪 (He\'s at the booth to the southeast)');
    return;
  }

  if (ctx.type === 'sign') {
    showEdu('Welcome to the Beit HaMikdash!\n\n🏪 Visit Shimon (southeast) to buy a korban\n🔪 Walk north to slaughter\n🔥 Bring blood to the Mizbeach\n📖 Talk to the Leviim to hear their music!', '');
    return;
  }
}

function isWithinDist(x1, z1, x2, z2, maxDist) {
  const dx = x1 - x2;
  const dz = z1 - z2;
  return dx * dx + dz * dz <= maxDist * maxDist;
}

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

function updateStatusEffects() {
  const el = $('#status-effects');
  if (!el) return;
  const parts = [];
  if (avodahActive && kavanahStreak >= 2) parts.push(`✨ Kavanah x${kavanahStreak}`);
  const buffLeft = Math.max(0, Math.ceil(taharahBuffUntil - elapsedTime));
  if (buffLeft > 0) parts.push(`🚿 Taharah +10% (${buffLeft}s)`);
  if (parts.length === 0) {
    el.classList.add('hidden');
    return;
  }
  el.textContent = parts.join('  •  ');
  el.classList.remove('hidden');
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
    if (['holacha','zerika','haktarah'].includes(step.id) && !isWithinDist(px, pz, 0, 0, 12)) {
      hint += ' — Walk to the Mizbeach';
    }
    el.textContent = hint; el.classList.remove('hidden'); return;
  }

  const ctx = getInteractionContext();
  if (ctx?.type === 'shimon') { el.textContent = 'Press E — Talk to Shimon 🏪'; el.classList.remove('hidden'); return; }
  if (ctx?.type === 'kiyor') { el.textContent = 'Press E — Wash at the Kiyor'; el.classList.remove('hidden'); return; }
  if (ctx?.type === 'levi') { el.textContent = 'Press E — Listen to the Leviim 🎵'; el.classList.remove('hidden'); return; }
  if (ctx?.type === 'mizbeach') { el.textContent = 'Press E — Begin Avodah 🔥'; el.classList.remove('hidden'); return; }
  if (ctx?.type === 'sign') { el.textContent = 'Press E — Read the Welcome Sign'; el.classList.remove('hidden'); return; }
  el.classList.add('hidden');
}

function closeAllPanels() {
  PANEL_IDS.slice(0, 4).forEach(id => {
    const el = $('#'+id); if (el) el.classList.add('hidden');
  });
}

function isAnyPanelOpen() {
  return PANEL_IDS.some(id => {
    const el = $('#'+id); return el && !el.classList.contains('hidden');
  });
}

// ─── Game Loop ───
function animate() {
  animFrameId = requestAnimationFrame(animate);
  if (!running) return;

  const rawDt = clock.getDelta();
  const clampedDt = Math.min(rawDt, FRAME_DT_MAX);
  smoothedDt += (clampedDt - smoothedDt) * FRAME_DT_SMOOTH_ALPHA;
  const dt = smoothedDt;
  elapsedTime += dt;
  
  autoSaveTimer += dt;
  if (autoSaveTimer >= AUTO_SAVE_SEC) { autoSaveTimer = 0; saveGame(); }
  
  if (!isAnyPanelOpen()) updatePlayer(dt);
  
  updateFire(elapsedTime);
  updateNPCs(elapsedTime);
  updateWaypoint(elapsedTime);
  updateParticles(dt);
  uiRefreshTimer += dt;
  if (uiRefreshTimer >= UI_REFRESH_SEC) {
    uiRefreshTimer = 0;
    refreshInventoryDerivedState();
    updatePrompt();
    updateCompass();
    updateZoneIndicator();
    updateStatusEffects();
    updateWorldLabels();
  }
  updateCamera(dt);
  
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

  const len = Math.hypot(worldX, worldZ);
  const speedMul = keys.shift ? PLAYER_SPRINT_MULT : 1;
  const targetSpeed = PLAYER_SPEED * speedMul;
  let targetVelX = 0;
  let targetVelZ = 0;
  if (len > 0.0001) {
    targetVelX = (worldX / len) * targetSpeed;
    targetVelZ = (worldZ / len) * targetSpeed;
  }

  const accel = len > 0.0001 ? MOVE_ACCEL : MOVE_DECEL;
  const t = Math.min(1, accel * dt);
  playerVelX += (targetVelX - playerVelX) * t;
  playerVelZ += (targetVelZ - playerVelZ) * t;

  // Try to move, with collision
  const nx = playerVelX * dt;
  const nz = playerVelZ * dt;
  const newX = playerPos.x + nx;
  const newZ = playerPos.z + nz;
  if (canMoveTo(newX, playerPos.z)) playerPos.x = newX;
  else playerVelX = 0;
  if (canMoveTo(playerPos.x, newZ)) playerPos.z = newZ;
  else playerVelZ = 0;

  const movingSpeedSq = playerVelX * playerVelX + playerVelZ * playerVelZ;
  if (movingSpeedSq > 0.01) {
    playerGroup.rotation.y = Math.atan2(playerVelX, playerVelZ);
    const legAng = Math.sin(elapsedTime * (8 + speedMul * 2)) * 0.4;
    if (playerGroup.children[6]) playerGroup.children[6].rotation.x = legAng;
    if (playerGroup.children[7]) playerGroup.children[7].rotation.x = -legAng;
  } else {
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

function updateCamera(dt) {
  const cx = playerPos.x - Math.sin(camAngle) * CAM_DISTANCE;
  const cz = playerPos.z - Math.cos(camAngle) * CAM_DISTANCE;
  const cy = playerPos.y + CAM_HEIGHT_OFFSET;
  const lx = playerPos.x;
  const ly = playerPos.y + PLAYER_HEIGHT * 0.6;
  const lz = playerPos.z;

  if (!ENABLE_CAMERA_SMOOTHING) {
    camera.position.set(cx, cy, cz);
    camera.lookAt(lx, ly, lz);
    return;
  }

  cameraTargetPos.set(cx, cy, cz);
  cameraLookTarget.set(lx, ly, lz);
  const lerpT = 1 - Math.exp(-CAMERA_LERP_STRENGTH * dt);
  camera.position.lerp(cameraTargetPos, lerpT);
  cameraLookCurrent.lerp(cameraLookTarget, lerpT);
  camera.lookAt(cameraLookCurrent);
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
