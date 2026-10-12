// Keyboard, mouse and touch input.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.actionDown = false;
    this.actionPressed = false;
    this.jumpPressed = false;
    this.lookDX = 0; this.lookDY = 0; this.zoom = 0;
    this.joy = { x: 0, y: 0, active: false };
    this.guidePressed = false;
    this.lastJoyAt = -10;
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.enabled = true;
    this.lastLookAt = -10;
    this.handlers = {};

    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE' || e.code === 'Enter') { this.actionDown = true; this.actionPressed = true; }
      if (e.code === 'Space') this.jumpPressed = true;
      if (e.code === 'KeyG') this.guidePressed = true;
      this.handlers.key?.(e.code);
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyE' || e.code === 'Enter') this.actionDown = false;
    });
    addEventListener('blur', () => { this.keys.clear(); this.actionDown = false; });

    // Mouse drag to look
    let dragging = false, lx = 0, ly = 0, pid = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      dragging = true; lx = e.clientX; ly = e.clientY; pid = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      this.handlers.canvasDown?.();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging || e.pointerId !== pid) return;
      this.lookDX += e.clientX - lx; this.lookDY += e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      this.lastLookAt = performance.now() / 1000;
    });
    const up = (e) => { if (e.pointerId === pid) { dragging = false; pid = null; } };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom += Math.sign(e.deltaY); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Touch: camera drag on the canvas (anything not the joystick or buttons)
    const touches = new Map();
    canvas.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
      this.handlers.canvasDown?.();
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        const p = touches.get(t.identifier);
        if (!p) continue;
        this.lookDX += (t.clientX - p.x) * 1.3; this.lookDY += (t.clientY - p.y) * 1.3;
        p.x = t.clientX; p.y = t.clientY;
        this.lastLookAt = performance.now() / 1000;
      }
      if (touches.size === 2) { /* pinch zoom */
        const [a, b] = [...touches.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this._pinch) this.zoom += (this._pinch - d) * 0.02;
        this._pinch = d;
      }
    }, { passive: true });
    const tEnd = (e) => { for (const t of e.changedTouches) touches.delete(t.identifier); this._pinch = null; };
    canvas.addEventListener('touchend', tEnd, { passive: true });
    canvas.addEventListener('touchcancel', tEnd, { passive: true });

    this.bindMobile();
  }

  bindMobile() {
    // Floating joystick: it appears wherever the thumb lands on the left side of the screen
    const joy = document.getElementById('joy'), base = document.getElementById('joy-base'), knob = document.getElementById('joy-knob');
    let jid = null, ox = 0, oy = 0;
    const R = 62;
    const setKnob = (x, y) => { knob.style.transform = `translate(${x}px, ${y}px)`; };
    const move = (cx, cy) => {
      let dx = cx - ox, dy = cy - oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      setKnob(dx, dy);
      this.joy.x = dx / R; this.joy.y = dy / R;
      if (Math.hypot(dx, dy) > 6) this.lastJoyAt = performance.now() / 1000;
    };
    joy.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      jid = e.pointerId; joy.setPointerCapture(jid);
      const r = joy.getBoundingClientRect();
      ox = e.clientX; oy = e.clientY;
      base.style.left = (ox - r.left - 66) + 'px';
      base.style.top = (oy - r.top - 66) + 'px';
      base.style.bottom = 'auto';
      base.classList.add('live');
      this.joy.active = true; move(e.clientX, e.clientY);
    });
    joy.addEventListener('pointermove', (e) => { if (e.pointerId === jid) move(e.clientX, e.clientY); });
    const end = (e) => {
      if (e.pointerId !== jid) return;
      jid = null; this.joy.active = false; this.joy.x = this.joy.y = 0; setKnob(0, 0);
      base.classList.remove('live');
      base.style.left = ''; base.style.top = ''; base.style.bottom = '';
    };
    joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);

    const act = document.getElementById('m-action');
    act.addEventListener('pointerdown', (e) => { e.preventDefault(); this.actionDown = true; this.actionPressed = true; });
    const actUp = () => { this.actionDown = false; };
    act.addEventListener('pointerup', actUp); act.addEventListener('pointercancel', actUp); act.addEventListener('pointerleave', actUp);
    document.getElementById('m-jump').addEventListener('pointerdown', (e) => { e.preventDefault(); this.jumpPressed = true; });
    document.getElementById('m-guide').addEventListener('pointerdown', (e) => { e.preventDefault(); this.guidePressed = true; });
  }

  // did the player steer by themselves this frame?
  get steering() {
    const k = this.keys;
    return this.joy.active && Math.hypot(this.joy.x, this.joy.y) > 0.15 ||
      ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some(c => k.has(c));
  }

  // Movement intent: x = right, y = forward (both -1..1)
  move() {
    if (!this.enabled) return { x: 0, y: 0, run: false };
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (this.joy.active) { x += this.joy.x; y -= this.joy.y; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    const run = k.has('ShiftLeft') || k.has('ShiftRight') || (this.joy.active && Math.hypot(this.joy.x, this.joy.y) > 0.9);
    return { x, y, run };
  }

  endFrame() {
    this.actionPressed = false;
    this.jumpPressed = false;
    this.guidePressed = false;
    this.lookDX = 0; this.lookDY = 0; this.zoom = 0;
  }
}
