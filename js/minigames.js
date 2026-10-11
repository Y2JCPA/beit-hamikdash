// Mini-games (DOM overlays driven by the main loop).
import { audio, noteFreq } from './audio.js';

const $ = (s) => document.querySelector(s);

export class Minigames {
  constructor() {
    this.active = null;
  }
  get busy() { return !!this.active; }

  update(dt, project) {
    if (this.active?.update) this.active.update(dt, project);
  }

  // ───────── Hotspots in the 3D world ─────────
  hotspots({ title, spots, ordered = false, onSpot, allowExit = false, small = false }) {
    return new Promise((resolve) => {
      const layer = $('#hs-layer');
      layer.innerHTML = '';
      $('#hs-title').textContent = title;
      $('#hotspots').classList.remove('hidden');
      $('#hs-exit').classList.toggle('hidden', !allowExit);
      let next = 0;
      const els = spots.map((s, i) => {
        const el = document.createElement('div');
        el.className = 'hs' + (small ? ' small' : '');
        el.innerHTML = `${s.icon}<div class="hs-label">${s.label}</div>`;
        el.onclick = async (e) => {
          e.stopPropagation();
          if (s.done || this.locked) return;
          if (ordered && i !== next) { audio.play('error'); el.animate([{ transform: 'translate(-50%,-50%) translateX(-6px)' }, { transform: 'translate(-50%,-50%) translateX(6px)' }, { transform: 'translate(-50%,-50%)' }], { duration: 250 }); return; }
          this.locked = true;
          s.done = true; el.classList.add('done'); next++;
          audio.play('pickup');
          try { await onSpot?.(s, i); } finally { this.locked = false; }
          refresh();
          if (spots.every(x => x.done)) finish(true);
        };
        layer.appendChild(el);
        return el;
      });
      const refresh = () => els.forEach((el, i) => el.classList.toggle('next', ordered && i === next));
      refresh();
      const finish = (ok) => {
        this.active = null;
        $('#hotspots').classList.add('hidden');
        layer.innerHTML = '';
        resolve(ok);
      };
      $('#hs-exit').onclick = () => finish(false);
      this.active = {
        update: (dt, project) => {
          spots.forEach((s, i) => {
            const p = project(s.pos);
            els[i].style.display = p.visible ? '' : 'none';
            els[i].style.left = p.x + 'px'; els[i].style.top = p.y + 'px';
          });
        },
        key: (code) => {
          if (code === 'KeyE' || code === 'Enter' || code === 'Space') {
            const i = ordered ? next : spots.findIndex(s => !s.done);
            if (i >= 0 && els[i]) els[i].click();
          }
        },
      };
    });
  }

  // ───────── Rhythm: play with the Leviim ─────────
  rhythm({ title, verse, chart, onSection, fall = 2.2 }) {
    return new Promise((resolve) => {
      const LANES = [
        { key: ['KeyA', 'Digit1', 'ArrowLeft'], icon: '🎵', name: 'Kinor', kind: 'kinor' },
        { key: ['KeyS', 'Digit2', 'ArrowDown'], icon: '🎶', name: 'Nevel', kind: 'nevel' },
        { key: ['KeyD', 'Digit3', 'ArrowRight'], icon: '🥁', name: 'Metziltayim', kind: 'cym' },
      ];
      $('#rh-title').textContent = title;
      $('#rh-verse').textContent = verse;
      const lanesEl = $('#rh-lanes');
      lanesEl.innerHTML = '';
      const laneEls = LANES.map((L, i) => {
        const d = document.createElement('div');
        d.className = 'lane';
        d.innerHTML = `<div class="hitzone"></div><button class="lane-btn">${L.icon}<small>${L.name} · ${'ASD'[i]}</small></button>`;
        lanesEl.appendChild(d);
        const btn = d.querySelector('.lane-btn');
        btn.addEventListener('pointerdown', (e) => { e.preventDefault(); hit(i); });
        return d;
      });
      $('#rhythm').classList.remove('hidden');
      const notes = chart.map(n => ({ ...n, el: null, state: 0 }));
      let t = -1.5;
      let hits = 0, perfect = 0, combo = 0, total = notes.length;
      let sectionIdx = 0;
      const fb = $('#rh-feedback');
      const feedback = (txt) => { fb.textContent = txt; fb.classList.remove('show'); void fb.offsetWidth; fb.classList.add('show'); };
      const score = () => { $('#rh-score').textContent = `🎼 ${hits} / ${total}${combo > 2 ? `  ·  🔥 x${combo}` : ''}`; };
      score();
      const playNote = (n) => {
        const L = LANES[n.lane];
        if (L.kind === 'cym') audio.cymbal(0.35);
        else audio.pluck(noteFreq(n.deg, L.kind === 'nevel' ? -1 : 1), 0, L.kind === 'nevel' ? 0.6 : 0.5, L.kind);
      };
      const hit = (lane) => {
        const btn = laneEls[lane].querySelector('.lane-btn');
        btn.classList.add('hit'); setTimeout(() => btn.classList.remove('hit'), 110);
        let best = null, bd = 1;
        for (const n of notes) {
          if (n.lane !== lane || n.state) continue;
          const d = Math.abs(n.t - t);
          if (d < bd) { bd = d; best = n; }
        }
        if (best && bd < 0.26) {
          best.state = 1; hits++; combo++;
          if (bd < 0.11) { perfect++; feedback('✨ Perfect!'); } else feedback('👍 Good');
          best.el?.classList.add('hit');
          playNote(best);
          score();
        } else {
          combo = 0;
          audio.pluck(noteFreq(0, lane === 1 ? -1 : 1), 0, 0.12, lane === 1 ? 'nevel' : 'kinor');
        }
      };
      let paused = 0;
      this.active = {
        key: (code) => { LANES.forEach((L, i) => { if (L.key.includes(code)) hit(i); }); },
        update: (dt) => {
          if (paused > 0) { paused -= dt; return; }
          t += dt;
          const H = laneEls[0].clientHeight;
          const hitY = H - 74 - 32;
          for (const n of notes) {
            const dtN = n.t - t;
            if (!n.el && dtN < fall && !n.state) {
              n.el = document.createElement('div');
              n.el.className = 'note' + (n.lane === 2 ? ' cym' : '');
              n.el.textContent = LANES[n.lane].icon;
              laneEls[n.lane].appendChild(n.el);
            }
            if (n.el) {
              const y = hitY - (dtN / fall) * hitY;
              n.el.style.top = (y - 29) + 'px';
              if (!n.state && dtN < -0.26) { n.state = 2; combo = 0; n.el.style.opacity = 0.25; feedback('·'); score(); }
              if (dtN < -0.6 || (n.state === 1 && dtN < -0.3)) { n.el.remove(); n.el = null; if (!n.state) n.state = 2; }
            }
          }
          // section breaks: the trumpets sound and the people bow (Tamid 7:3)
          const sec = chart.sections?.[sectionIdx];
          if (sec !== undefined && t > sec) { sectionIdx++; paused = 2.4; onSection?.(sectionIdx); }
          if (t > notes[notes.length - 1].t + 1.2) {
            this.active = null;
            $('#rhythm').classList.add('hidden');
            const pct = hits / total;
            resolve({ hits, total, perfect, stars: pct >= 0.85 ? 3 : pct >= 0.6 ? 2 : 1 });
          }
        },
      };
    });
  }

  // ───────── Timing meter (kemitzah) ─────────
  meter({ title, hint, button = 'Now!', zone = [0.42, 0.58], speed = 0.9 }) {
    return new Promise((resolve) => {
      $('#mt-title').textContent = title;
      $('#mt-hint').textContent = hint;
      $('#mt-btn').textContent = button;
      const z = $('#mt-zone');
      z.style.left = zone[0] * 100 + '%'; z.style.width = (zone[1] - zone[0]) * 100 + '%';
      $('#meter').classList.remove('hidden');
      let x = 0, dir = 1, tries = 0, done = false;
      const press = () => {
        if (done) return;
        tries++;
        if (x >= zone[0] && x <= zone[1]) {
          done = true; audio.play('success');
          setTimeout(() => { $('#meter').classList.add('hidden'); this.active = null; resolve({ tries }); }, 500);
        } else {
          audio.play('error');
          $('#mt-hint').textContent = x < zone[0] ? 'Too little! A kometz is a full handful.' : 'Too much! Only what fits under three fingers.';
        }
      };
      $('#mt-btn').onclick = press;
      this.active = {
        key: (code) => { if (['KeyE', 'Enter', 'Space'].includes(code)) press(); },
        update: (dt) => {
          if (done) return;
          x += dir * dt * speed; if (x > 1) { x = 1; dir = -1; } if (x < 0) { x = 0; dir = 1; }
          $('#mt-needle').style.left = (x * 100) + '%';
        },
      };
    });
  }

  // ───────── Arrow sequence (tenufah — waving) ─────────
  arrows({ title, seq }) {
    return new Promise((resolve) => {
      const MAP = { '→': 'ArrowRight', '←': 'ArrowLeft', '↑': 'ArrowUp', '↓': 'ArrowDown' };
      $('#ar-title').textContent = title;
      const seqEl = $('#ar-seq');
      seqEl.innerHTML = seq.map((s, i) => `<span class="${i === 0 ? 'cur' : ''}">${s}</span>`).join('');
      const pad = $('#ar-pad');
      pad.innerHTML = '';
      const layout = ['', '↑', '', '←', '↓', '→'];
      layout.forEach(a => {
        const b = document.createElement('button');
        b.textContent = a; if (!a) b.style.visibility = 'hidden';
        b.onclick = () => press(a);
        pad.appendChild(b);
      });
      $('#arrows').classList.remove('hidden');
      let i = 0, mistakes = 0;
      const press = (a) => {
        if (i >= seq.length) return;
        if (a === seq[i]) {
          seqEl.children[i].className = 'done';
          audio.bell(noteFreq(i * 2, 1), 0.12, 0, 0.8);
          this.onWave?.(a);
          i++;
          if (i < seq.length) seqEl.children[i].className = 'cur';
          else setTimeout(() => { $('#arrows').classList.add('hidden'); this.active = null; resolve({ mistakes }); }, 450);
        } else { mistakes++; audio.play('error'); }
      };
      this.active = {
        key: (code) => { for (const [a, k] of Object.entries(MAP)) if (k === code || ({ KeyW: '↑', KeyS: '↓', KeyA: '←', KeyD: '→' })[code] === a) press(a); },
      };
    });
  }

  // ───────── Verses (tap through) ─────────
  verses(list, onVerse) {
    return new Promise((resolve) => {
      let i = -1;
      const el = $('#verses');
      const next = () => {
        i++;
        if (i >= list.length) { el.classList.add('hidden'); this.active = null; resolve(); return; }
        $('#vs-he').textContent = list[i].he;
        $('#vs-en').textContent = list[i].en;
        $('#vs-he').style.animation = 'none'; $('#vs-en').style.animation = 'none'; void el.offsetWidth;
        $('#vs-he').style.animation = ''; $('#vs-en').style.animation = '';
        onVerse?.(i);
      };
      el.onclick = () => next();
      el.classList.remove('hidden');
      this.active = { key: (code) => { if (['KeyE', 'Enter', 'Space'].includes(code)) next(); } };
      next();
    });
  }

  key(code) { this.active?.key?.(code); }
}

// Build a chart for the Shir Shel Yom: a melody in the mode, with nevel bass and cymbal accents
export function makeChart(dayIndex) {
  const seed = 17 + dayIndex * 31;
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const notes = [];
  const beat = 60 / 92;
  let t = 0.5;
  const sections = [];
  for (let sec = 0; sec < 3; sec++) {
    notes.push({ t, lane: 2, deg: 0 });              // cymbal opens each section (Arachin 2:5)
    t += beat * 2;
    let deg = 0;
    for (let i = 0; i < 12; i++) {
      deg = Math.max(-2, Math.min(9, deg + [-2, -1, 1, 2, 1, -1][Math.floor(rnd() * 6)]));
      if (i % 4 === 0) notes.push({ t, lane: 1, deg: [0, 4, 3, 0][(i / 4 + sec) % 4] });
      else notes.push({ t, lane: 0, deg });
      t += beat * (i % 4 === 3 ? 1.5 : 1) * (sec === 2 ? 0.85 : 1);
    }
    notes.push({ t, lane: 2, deg: 0 });
    t += beat * 2;
    if (sec < 2) sections.push(t - 0.2);
  }
  notes.sections = sections;
  return notes;
}
