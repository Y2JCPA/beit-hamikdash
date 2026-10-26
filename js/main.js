// Entry point
import { track } from './analytics.js';
import { Game } from './game.js';
import { initLanguage } from './i18n.js';
import { loadVoices } from './voice.js';

await initLanguage();
loadVoices();

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2')) || !!c.getContext('webgl');
  } catch { return false; }
}

if (!webglOK()) {
  track('game_load_error', { error_type: 'webgl_unavailable' });
  document.getElementById('load-text').textContent = 'Sorry — this game needs WebGL. Please try a newer browser or device.';
} else {
  const game = new Game();
  game.init().catch((e) => {
    track('game_load_error', { error_type: 'initialization_failed' });
    console.error(e);
    document.getElementById('load-text').textContent = 'Something went wrong while building the Mikdash: ' + e.message;
  });
}

// offline play: keep a copy of the game on the device (only works over https or localhost)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // when a new version is published, switch to it right away (on the title screen) instead of
  // showing the copy saved on the device
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && window.__game?.mode !== 'play' && !sessionStorage.getItem('avodah-reloaded')) {
      sessionStorage.setItem('avodah-reloaded', '1');
      location.reload();
    }
  });
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => { }));
}
