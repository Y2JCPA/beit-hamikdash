// Runs a quest: shows the target, prompts, handles press / hold / choose,
// checks for halachic mistakes and teaches gently.
import * as THREE from 'three';
import { INTERACT_RADIUS } from './config.js';

export class QuestRunner {
  constructor(g) {
    this.g = g;
    this.q = null;
    this.i = 0;
    this.busy = false;
    this.holdT = 0;
    this.holding = false;
    this.k = 0;
    this.mistakes = 0;
    this.here = new THREE.Vector3();
    this.blockHoldUntilRelease = false;
  }

  get active() { return !!this.q; }
  get step() { return this.q ? this.q.steps[this.i] : null; }

  start(q) {
    this.q = q;
    this.i = 0;
    this.mistakes = 0;
    this.enterStep();
  }
  stop() { this.q = null; this.g.ui.setQuest(null); this.g.hideMarkers(); this.holding = false; }

  enterStep() {
    const s = this.step;
    this.k = 0;
    this.holdT = 0;
    this.holding = false;
    this.here.copy(this.g.player.pos);
    this.g.ui.setQuest(this.q, this.i);
    this.g.onStepChange?.(this.q, this.i);
    if (s && s.kind === 'auto') this.runAuto(s);
  }

  async runAuto(s) {
    const q = this.q, i = this.i;
    this.busy = true;
    try { await s.run?.(this.g); } catch (e) { console.error(e); await this.recover(); }
    this.busy = false;
    if (this.q === q && this.i === i) this.complete();
  }

  // after an unexpected error inside a step, never leave the player frozen
  async recover() {
    const g = this.g;
    try { if (g.camOverride && !g.camTween) await g.releaseCam(); } catch (e) { console.error(e); }
    g.player.frozen = false;
    g.ui.cine(false);
  }

  // run a step action, then complete the step — unless the quest moved on meanwhile
  runThen(fn) {
    const q = this.q, i = this.i;
    this.busy = true;
    this.g.ui.setPrompt(null);
    return Promise.resolve().then(fn).catch(async (e) => { console.error(e); await this.recover(); })
      .then(() => { this.busy = false; return this.q === q && this.i === i; });
  }

  target(s = this.step) {
    if (!s) return null;
    if (s.kind === 'choose') {
      const id = s.need[this.k];
      return s.options.find(o => o.id === id)?.at;
    }
    if (s.at === 'here') return { x: this.here.x, y: this.here.y, z: this.here.z };
    if (typeof s.at === 'function') return s.at();
    return s.at;
  }

  inRange(t, r) {
    if (!t) return false;
    const p = this.g.player.pos;
    return Math.hypot(p.x - t.x, p.z - t.z) <= r && Math.abs(p.y - (t.y || 0)) < 1.7;
  }

  // returns true if this runner wants the action input this frame
  update(dt, input) {
    const s = this.step;
    const g = this.g;
    if (!s || this.busy) { if (!this.busy) g.ui.setPrompt(null); return false; }
    if (s.kind === 'auto') return false;

    if (s.kind === 'go') {
      const t = this.target(s);
      if (this.inRange(t, s.r || INTERACT_RADIUS)) { this.complete(); }
      return false;
    }

    if (s.kind === 'choose') {
      // any option in range can be tried
      let near = null;
      for (const o of s.options) {
        const idx = s.need.indexOf(o.id);
        if (idx >= 0 && idx < this.k) continue;          // already done here — don't offer it again
        if (this.inRange(o.at, 2.3)) { near = o; break; }
      }
      if (!near) { return false; }
      g.ui.setPrompt({ text: `${s.prompt} (${near.label})`, icon: s.icon });
      if (input.actionPressed) {
        // `anyOf`: any one of these options is right (e.g. any corner that has a yesod)
        if (s.anyOf ? s.anyOf.includes(near.id) : near.id === s.need[this.k]) {
          this.runThen(() => s.onOption?.(g, near.id)).then((same) => {
            if (!same) return;
            this.k++;
            g.audio.play('step');
            g.fx.sparkle(near.at.x, (near.at.y || 0) + 1.2, near.at.z, { count: 16, color: 0xffd36e });
            if (this.k >= s.need.length) this.complete();
            else { const nx = s.options.find(o => o.id === s.need[this.k]); g.ui.toast(`✔ ${near.label}! Next: the ${nx ? nx.label : 'next one'} — tap 🧭 if you need help`); }
          });
        } else {
          this.mistake(s.wrong.msg, s.wrong.src);
        }
      }
      return true;
    }

    // use / hold
    const t = this.target(s);
    const avail = this.inRange(t, s.r || INTERACT_RADIUS) || (s.zone && s.zone(g.player.pos));
    if (!avail) {
      if (this.holding) this.cancelHold(s);
      return false;
    }
    if (s.kind === 'use') {
      g.ui.setPrompt({ text: s.prompt, icon: s.icon });
      if (input.actionPressed) {
        const err = s.check?.(g);
        if (err) { this.mistake(err.msg, err.src); return true; }
        this.runThen(() => s.run?.(g)).then((same) => { if (same) this.complete(); });
      }
      return true;
    }
    if (s.kind === 'hold') {
      if (!input.actionDown) this.blockHoldUntilRelease = false;
      if (input.actionDown && !this.blockHoldUntilRelease) {
        if (!this.holding) {
          const err = s.check?.(g);
          if (err) { this.blockHoldUntilRelease = true; this.mistake(err.msg, err.src); return true; }
          this.holding = true;
          this.holdT = 0;
          s.start?.(g);
        }
        this.holdT += dt;
        s.tick?.(g, Math.min(1, this.holdT / s.hold), dt);
        if (this.holdT >= s.hold) {
          this.holding = false;
          this.runThen(() => s.run?.(g)).then((same) => { if (same) this.complete(); });
          return true;
        }
      } else if (this.holding) {
        this.cancelHold(s);
      }
      g.ui.setPrompt({ text: s.prompt, icon: s.icon, progress: this.holding ? this.holdT / s.hold : 0 });
      return true;
    }
    return false;
  }

  cancelHold(s) {
    this.holding = false;
    this.holdT = 0;
    s.cancel?.(this.g);
    if (this.g.player.char.pose === 'work') this.g.player.char.pose = 'idle';
  }

  async mistake(msg, src) {
    this.mistakes++;
    this.busy = true;
    this.g.ui.setPrompt(null);
    this.g.audio.play('error');
    await this.g.say('memuneh', msg + (src ? `  (${src})` : ''));
    this.busy = false;
  }
  softMistake() { this.mistakes++; }

  complete() {
    const s = this.step;
    const g = this.g;
    if (!s) return;
    g.ui.setPrompt(null);
    const f = typeof s.fact === 'function' ? s.fact(g) : s.fact;       // a fact can depend on the Kohen's tradition
    if (f) g.fact(f[0], f[1], f[2]);
    g.audio.play('step');
    g.buzz?.(18);
    const p = g.player.pos;
    g.fx.sparkle(p.x, p.y + 1.2, p.z, { count: 14, color: 0xffd36e, speed: 1.6, up: 1.4, size: 0.18 });
    this.i++;
    if (this.i >= this.q.steps.length) {
      const q = this.q;
      const stars = this.mistakes === 0 ? 3 : this.mistakes <= 2 ? 2 : 1;
      this.q = null;
      g.ui.setQuest(null);
      g.hideMarkers();
      g.onQuestComplete(q, stars, this.mistakes);
    } else {
      this.enterStep();
    }
  }
}
