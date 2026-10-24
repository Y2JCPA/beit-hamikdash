// Offline support: every file the game loads is kept in a cache, so the installed
// app opens without internet (in the car, on a trip). Online, the newest files are
// always fetched first, so updates arrive as soon as they are published.
const CACHE = 'avodah-v5';
const FONT_CACHE = 'avodah-fonts-v1';
const CORE = [
  './', './index.html', './manifest.json', './css/style.css',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
  './vendor/three/three.module.min.js',
  './vendor/three/addons/objects/Sky.js',
  './vendor/three/addons/postprocessing/EffectComposer.js', './vendor/three/addons/postprocessing/MaskPass.js',
  './vendor/three/addons/postprocessing/OutputPass.js', './vendor/three/addons/postprocessing/Pass.js',
  './vendor/three/addons/postprocessing/RenderPass.js', './vendor/three/addons/postprocessing/ShaderPass.js',
  './vendor/three/addons/postprocessing/UnrealBloomPass.js',
  './vendor/three/addons/shaders/CopyShader.js', './vendor/three/addons/shaders/LuminosityHighPassShader.js',
  './vendor/three/addons/shaders/OutputShader.js', './vendor/three/addons/utils/BufferGeometryUtils.js',
  './js/audio.js',
  './js/builder.js',
  './js/calendar.js',
  './js/characters.js',
  './js/config.js',
  './js/crowd.js',
  './js/data.js',
  './js/fx.js',
  './js/game.js',
  './js/he-nikud.js',
  './js/he.js',
  './js/i18n.js',
  './js/input.js',
  './js/lishkot.js',
  './js/main.js',
  './js/materials.js',
  './js/minigames.js',
  './js/nav.js',
  './js/physics.js',
  './js/player.js',
  './js/progress.js',
  './js/questRunner.js',
  './js/quests.js',
  './js/sky.js',
  './js/textures.js',
  './js/ui.js',
  './js/voice.js',
  './js/world.js',
  './voice/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // one by one, so a single missing file can't stop the rest from being saved
    await Promise.all(CORE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => { })));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE && k !== FONT_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: use the saved copy, refresh it in the background
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const c = await caches.open(FONT_CACHE);
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })());
    return;
  }
  if (url.origin !== location.origin) return;

  // the game's own files: newest from the network, the saved copy when offline or very slow
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      // 'no-cache' asks the server whether a file changed, so a new version is never missed
      const r = await Promise.race([fetch(req, { cache: 'no-cache' }), timeout(8000)]);
      if (r.ok) c.put(req, r.clone());
      return r;
    } catch {
      const hit = await c.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await c.match('./index.html') : null);
      return hit || Response.error();
    }
  })());
});
