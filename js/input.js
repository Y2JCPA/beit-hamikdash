// Keyboard, mouse and touch input.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.actionDown = false;
    this.actionPressed = false;
    this.jumpPressed = false;
    this.lookDX = 0; this.lookDY = 0; this.zoom = 0;
    this.joy = { x: 0, y: 0, active: false };
    this.runToggle = false;
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
    const joy = document.getElementById('joy'), base = document.getElementById('joy-base'), knob = document.getElementById('joy-knob');
    let jid = null;
    const setKnob = (x, y) => { knob.style.transform = `translate(${x}px, ${y}px)`; };
    const move = (cx, cy) => {
      const r = base.getBoundingClientRect();
      const ox = r.left + r.width / 2, oy = r.top + r.height / 2;
      let dx = cx - ox, dy = cy - oy;
      const max = r.width / 2;
      const d = Math.hypot(dx, dy);
      if (d > max) { dx *= max / d; dy *= max / d; }
      setKnob(dx, dy);
      this.joy.x = dx / max; this.joy.y = dy / max;
    };
    joy.addEventListener('pointerdown', (e) => { jid = e.pointerId; joy.setPointerCapture(jid); this.joy.active = true; move(e.clientX, e.clientY); });
    joy.addEventListener('pointermove', (e) => { if (e.pointerId === jid) move(e.clientX, e.clientY); });
    const end = (e) => { if (e.pointerId !== jid) return; jid = null; this.joy.active = false; this.joy.x = this.joy.y = 0; setKnob(0, 0); };
    joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);

    const act = document.getElementById('m-action');
    act.addEventListener('pointerdown', (e) => { e.preventDefault(); this.actionDown = true; this.actionPressed = true; });
    const actUp = () => { this.actionDown = false; };
    act.addEventListener('pointerup', actUp); act.addEventListener('pointercancel', actUp); act.addEventListener('pointerleave', actUp);
    document.getElementById('m-jump').addEventListener('pointerdown', (e) => { e.preventDefault(); this.jumpPressed = true; });
    const run = document.getElementById('m-run');
    run.addEventListener('pointerdown', (e) => { e.preventDefault(); this.runToggle = !this.runToggle; run.classList.toggle('on', this.runToggle); });
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
    const run = k.has('ShiftLeft') || k.has('ShiftRight') || this.runToggle || (this.joy.active && Math.hypot(this.joy.x, this.joy.y) > 0.92);
    return { x, y, run };
  }

  endFrame() {
    this.actionPressed = false;
    this.jumpPressed = false;
    this.lookDX = 0; this.lookDY = 0; this.zoom = 0;
  }
}
