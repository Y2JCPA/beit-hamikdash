// Entry point
import { Game } from './game.js';

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2')) || !!c.getContext('webgl');
  } catch { return false; }
}

if (!webglOK()) {
  document.getElementById('load-text').textContent = 'Sorry — this game needs WebGL. Please try a newer browser or device.';
} else {
  const game = new Game();
  game.init().catch((e) => {
    console.error(e);
    document.getElementById('load-text').textContent = 'Something went wrong while building the Mikdash: ' + e.message;
  });
}
