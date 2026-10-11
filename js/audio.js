// All sound is synthesized live with the Web Audio API — no audio files.
// Kinor & Nevel use Karplus-Strong plucked strings.

// D "Ahava Rabba" (Phrygian dominant) mode — a traditional-sounding scale.
const SCALE = [0, 1, 4, 5, 7, 8, 10];
const BASE = 146.83; // D3
export function noteFreq(degree, octave = 0) {
  const n = SCALE.length;
  const o = Math.floor(degree / n) + octave;
  const d = ((degree % n) + n) % n;
  return BASE * Math.pow(2, o + SCALE[d] / 12);
}

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicVol = 0.7;
    this.sfxVol = 0.85;
    this.pluckCache = new Map();
    this.musicOn = false;
    this.nextNoteTime = 0;
    this.step = 0;
    this.musicLevel = 0.0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3;
    this.master.connect(comp); comp.connect(ctx.destination);
    // a simple reverb for the stone courtyard
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.6, 2.2);
    this.revGain = ctx.createGain(); this.revGain.gain.value = 0.28;
    this.reverb.connect(this.revGain); this.revGain.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxVol;
    this.sfx.connect(this.master); this.sfx.connect(this.reverb);
    this.music = ctx.createGain(); this.music.gain.value = 0;
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.musicVol;
    this.music.connect(this.musicBus); this.musicBus.connect(this.master); this.musicBus.connect(this.reverb);
    this.noise = this.makeNoise(2);
    this.brown = this.makeBrown(4);
    this.startAmbience();
    this.startMusic();
  }

  makeImpulse(secs, decay) {
    const ctx = this.ctx, len = ctx.sampleRate * secs;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  makeNoise(secs) {
    const ctx = this.ctx, len = ctx.sampleRate * secs;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  makeBrown(secs) {
    const ctx = this.ctx, len = ctx.sampleRate * secs;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    return buf;
  }

  // Karplus-Strong string, rendered once per pitch and cached
  pluckBuffer(freq, bright = 0.5, secs = 2.6) {
    const key = Math.round(freq * 10) + '_' + bright;
    if (this.pluckCache.has(key)) return this.pluckCache.get(key);
    const ctx = this.ctx, sr = ctx.sampleRate, len = Math.floor(sr * secs);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const N = Math.max(2, Math.round(sr / freq));
    const ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.sin(i / N * Math.PI));
    let idx = 0;
    const damp = 0.997 - (1 - bright) * 0.004;
    const w = 0.5 + bright * 0.2;
    for (let i = 0; i < len; i++) {
      const cur = ring[idx];
      const nxt = ring[(idx + 1) % N];
      d[i] = cur;
      ring[idx] = (cur * w + nxt * (1 - w)) * damp;
      idx = (idx + 1) % N;
    }
    // gentle fade-out
    for (let i = len - 2000; i < len; i++) d[i] *= (len - i) / 2000;
    this.pluckCache.set(key, buf);
    return buf;
  }

  pluck(freq, when = 0, vol = 0.5, kind = 'kinor', dest = null) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = Math.max(ctx.currentTime, when || ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = this.pluckBuffer(freq, kind === 'nevel' ? 0.25 : 0.55, kind === 'nevel' ? 3.2 : 2.2);
    const g = ctx.createGain(); g.gain.value = vol;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = kind === 'nevel' ? 1800 : 4200;
    src.connect(f); f.connect(g); g.connect(dest || this.sfx);
    src.start(t);
  }

  // Silver trumpets. pattern: 'tekiah' | 'teruah' | 'tashrat'
  trumpet(pattern = 'tashrat', vol = 0.35, dest = null) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    let t = ctx.currentTime + 0.02;
    const blast = (start, dur, f0 = 293.66) => {
      for (const [mult, detune] of [[1, 0], [1, 7], [2, -4]]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0 * mult * 0.97, start);
        o.frequency.linearRampToValueAtTime(f0 * mult, start + 0.08);
        o.detune.value = detune;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
        lp.frequency.setValueAtTime(600, start); lp.frequency.linearRampToValueAtTime(2600, start + 0.12);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(vol * (mult === 2 ? 0.25 : 0.5), start + 0.06);
        g.gain.setValueAtTime(vol * (mult === 2 ? 0.25 : 0.5), start + dur - 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        o.connect(lp); lp.connect(g); g.connect(dest || this.sfx);
        o.start(start); o.stop(start + dur + 0.05);
      }
    };
    const tekiah = (d = 1.1) => { blast(t, d); t += d + 0.18; };
    const teruah = () => { for (let i = 0; i < 9; i++) { blast(t, 0.12, 293.66 * (i % 2 ? 1.122 : 1)); t += 0.15; } t += 0.15; };
    if (pattern === 'tekiah') tekiah(1.4);
    else if (pattern === 'teruah') teruah();
    else { tekiah(); teruah(); tekiah(); }
    return t - ctx.currentTime;
  }

  cymbal(vol = 0.4, when = 0, dest = null) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = Math.max(ctx.currentTime, when || ctx.currentTime);
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5200;
    const bp = ctx.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 8400; bp.gain.value = 8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    src.connect(hp); hp.connect(bp); bp.connect(g); g.connect(dest || this.sfx);
    src.start(t, Math.random()); src.stop(t + 1.7);
    // metallic partials
    for (const f of [3123, 4210, 5317]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.setValueAtTime(vol * 0.03, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(og); og.connect(dest || this.sfx); o.start(t); o.stop(t + 1);
    }
  }

  chalil(freq, when, dur = 0.5, vol = 0.18, dest = null) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = Math.max(ctx.currentTime, when || ctx.currentTime);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const vib = ctx.createOscillator(); vib.frequency.value = 5.2;
    const vg = ctx.createGain(); vg.gain.value = freq * 0.012;
    vib.connect(vg); vg.connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.06);
    g.gain.setValueAtTime(vol, t + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfx);
    o.start(t); vib.start(t); o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  }

  // Bell (FM) — used for chimes, the Kohen Gadol's bells
  bell(freq = 880, vol = 0.2, when = 0, decay = 1.2) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = Math.max(ctx.currentTime, when || ctx.currentTime);
    const car = ctx.createOscillator(); car.frequency.value = freq;
    const mod = ctx.createOscillator(); mod.frequency.value = freq * 3.5;
    const mg = ctx.createGain(); mg.gain.setValueAtTime(freq * 2, t); mg.gain.exponentialRampToValueAtTime(1, t + decay);
    mod.connect(mg); mg.connect(car.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    car.connect(g); g.connect(this.sfx);
    car.start(t); mod.start(t); car.stop(t + decay + 0.05); mod.stop(t + decay + 0.05);
  }

  noiseBurst(dur, { type = 'bandpass', freq = 1000, q = 1, vol = 0.3, sweepTo = null, when = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = Math.max(ctx.currentTime, when || ctx.currentTime);
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.05, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  play(name) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'click': this.bell(1320, 0.05, t, 0.15); break;
      case 'step': this.bell(1046.5, 0.12, t, 0.9); this.bell(1568, 0.08, t + 0.09, 0.9); break;
      case 'success': [0, 2, 4, 7].forEach((d, i) => this.bell(noteFreq(d, 2), 0.13, t + i * 0.09, 1.2)); break;
      case 'complete': {
        [0, 2, 4, 5, 7].forEach((d, i) => this.pluck(noteFreq(d, 1), t + i * 0.11, 0.5));
        [7, 9, 11].forEach((d, i) => this.bell(noteFreq(d, 1), 0.12, t + 0.6 + i * 0.12, 1.6));
        break;
      }
      case 'error': {
        const o = this.ctx.createOscillator(); o.type = 'triangle';
        o.frequency.setValueAtTime(330, t); o.frequency.linearRampToValueAtTime(247, t + 0.25);
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.4);
        break;
      }
      case 'pickup': this.bell(784, 0.1, t, 0.4); this.bell(1175, 0.08, t + 0.06, 0.5); break;
      case 'discover': [4, 7, 9, 11, 14].forEach((d, i) => this.bell(noteFreq(d, 1), 0.08, t + i * 0.07, 1.4)); break;
      case 'star': this.bell(1760, 0.09, t, 0.5); this.bell(2349, 0.07, t + 0.08, 0.6); break;
      case 'whoosh': this.noiseBurst(1.4, { type: 'lowpass', freq: 200, sweepTo: 2400, vol: 0.45 }); break;
      case 'water': for (let i = 0; i < 6; i++) this.noiseBurst(0.35, { type: 'bandpass', freq: 900 + Math.random() * 1600, q: 4, vol: 0.12, when: t + i * 0.12 }); break;
      case 'pour': this.noiseBurst(1.6, { type: 'bandpass', freq: 700, q: 1.2, vol: 0.18 }); break;
      case 'scoop': this.noiseBurst(0.5, { type: 'highpass', freq: 1800, vol: 0.12 }); break;
      case 'salt': for (let i = 0; i < 5; i++) this.noiseBurst(0.08, { type: 'highpass', freq: 5000, vol: 0.08, when: t + i * 0.05 }); break;
      case 'baa': {
        const o = this.ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(420, t); o.frequency.linearRampToValueAtTime(380, t + 0.6);
        const vib = this.ctx.createOscillator(); vib.frequency.value = 22; const vg = this.ctx.createGain(); vg.gain.value = 30;
        vib.connect(vg); vg.connect(o.frequency);
        const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 2;
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
        o.connect(f); f.connect(g); g.connect(this.sfx); o.start(t); vib.start(t); o.stop(t + 0.7); vib.stop(t + 0.7);
        break;
      }
      case 'coo': for (let i = 0; i < 2; i++) { const o = this.ctx.createOscillator(); o.frequency.setValueAtTime(520, t + i * 0.3); o.frequency.linearRampToValueAtTime(420, t + i * 0.3 + 0.25); const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t + i * 0.3); g.gain.linearRampToValueAtTime(0.08, t + i * 0.3 + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.3 + 0.28); o.connect(g); g.connect(this.sfx); o.start(t + i * 0.3); o.stop(t + i * 0.3 + 0.3); } break;
      case 'jingle': for (let i = 0; i < 3; i++) this.bell(2200 + Math.random() * 600, 0.03, t + i * 0.04, 0.35); break;
      case 'shofar': this.trumpet('tekiah', 0.3); break;
    }
  }

  // ── Ambience ──
  startAmbience() {
    const ctx = this.ctx;
    const loop = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
    // crowd murmur
    const m = loop(this.brown);
    const mf = ctx.createBiquadFilter(); mf.type = 'bandpass'; mf.frequency.value = 420; mf.Q.value = 0.8;
    this.crowdGain = ctx.createGain(); this.crowdGain.gain.value = 0;
    m.connect(mf); mf.connect(this.crowdGain); this.crowdGain.connect(this.master);
    // wind
    const w = loop(this.noise);
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 380;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.025;
    w.connect(wf); wf.connect(this.windGain); this.windGain.connect(this.master);
    // fire roar
    const f = loop(this.brown);
    const ff = ctx.createBiquadFilter(); ff.type = 'lowpass'; ff.frequency.value = 900;
    this.fireGain = ctx.createGain(); this.fireGain.gain.value = 0;
    f.connect(ff); ff.connect(this.fireGain); this.fireGain.connect(this.master);
    this.fireLevel = 0;
    this.crackleTimer = setInterval(() => {
      if (!this.ctx || this.fireLevel < 0.02) return;
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) this.noiseBurst(0.03 + Math.random() * 0.05, { type: 'highpass', freq: 2500 + Math.random() * 3000, vol: this.fireLevel * 0.25 * Math.random(), when: this.ctx.currentTime + Math.random() * 0.2 });
    }, 140);
    this.birdTimer = setInterval(() => {
      if (!this.ctx || !this.birdsOn || Math.random() < 0.6) return;
      const t = this.ctx.currentTime;
      const n = 2 + Math.floor(Math.random() * 4), base = 2600 + Math.random() * 1600;
      for (let i = 0; i < n; i++) {
        const o = this.ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(base, t + i * 0.11); o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.4), t + i * 0.11 + 0.07);
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t + i * 0.11); g.gain.linearRampToValueAtTime(0.025, t + i * 0.11 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.11 + 0.09);
        o.connect(g); g.connect(this.master); o.start(t + i * 0.11); o.stop(t + i * 0.11 + 0.1);
      }
    }, 1500);
  }

  setAmbience({ fire = 0, crowd = 0, music = 0, birds = false, wind = 0.025 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.fireLevel = fire;
    this.fireGain.gain.setTargetAtTime(fire * 0.12, t, 0.3);
    this.crowdGain.gain.setTargetAtTime(crowd * 0.05, t, 0.5);
    this.windGain.gain.setTargetAtTime(wind, t, 1);
    this.music.gain.setTargetAtTime(music, t, 0.6);
    this.birdsOn = birds;
  }

  setVolumes(music, sfx) {
    this.musicVol = music; this.sfxVol = sfx;
    if (!this.ctx) return;
    this.musicBus.gain.value = music;
    this.sfx.gain.value = sfx;
  }

  // ── Leviim background music: gentle kinor melody over a nevel drone ──
  startMusic() {
    this.nextNoteTime = this.ctx.currentTime + 0.5;
    this.step = 0;
    const phrases = [
      [0, 2, 4, 2, 3, 4, 5, 4, 2, 1, 2, 0],
      [4, 5, 7, 5, 4, 2, 3, 4, 2, 1, 0, 0],
      [7, 8, 9, 8, 7, 5, 4, 5, 4, 2, 1, 2],
      [2, 4, 5, 4, 2, 1, 0, 1, 2, 1, 0, 0],
    ];
    this.phrases = phrases;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 90);
  }
  scheduleMusic() {
    if (!this.ctx) return;
    const beat = 60 / 84 / 2; // eighth notes at 84 bpm
    if (this.nextNoteTime < this.ctx.currentTime) this.nextNoteTime = this.ctx.currentTime + 0.05; // after a background tab, don't burst
    while (this.nextNoteTime < this.ctx.currentTime + 0.35) {
      const ph = this.phrases[Math.floor(this.step / 12) % this.phrases.length];
      const i = this.step % 12;
      const deg = ph[i];
      if (i % 3 !== 2 || Math.random() < 0.5) this.pluck(noteFreq(deg, 1), this.nextNoteTime, 0.32, 'kinor', this.music);
      if (i % 6 === 0) this.pluck(noteFreq(0, -1), this.nextNoteTime, 0.42, 'nevel', this.music);
      if (i % 6 === 3) this.pluck(noteFreq(4, -1), this.nextNoteTime, 0.32, 'nevel', this.music);
      if (i === 0 && Math.floor(this.step / 12) % 4 === 0) this.pluck(noteFreq(0, 0), this.nextNoteTime, 0.35, 'nevel', this.music);
      this.nextNoteTime += beat * (i % 3 === 2 ? 1.5 : 1);
      this.step++;
    }
  }
}

export const audio = new AudioEngine();
