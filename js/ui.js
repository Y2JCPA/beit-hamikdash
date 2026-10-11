// DOM UI: HUD, dialogs, fact cards, banners, journal, settings, minimap.
import { PLACES, MIRACLES, ACHIEVEMENTS } from './data.js';
import { AZARA, EZRAT_NASHIM, MIZBEACH, KEVESH, ULAM, HEICHAL, P } from './config.js';
import { audio } from './audio.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function speakable(t) {
  // strip emoji and Hebrew so the English voice reads cleanly
  return String(t).replace(/[\u0590-\u05FF]+/g, ' ').replace(/[\u{1F000}-\u{1FAFF}\u2600-\u27BF]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export class UI {
  speak(text) {
    try {
      if (!('speechSynthesis' in window)) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(speakable(text));
      u.rate = 0.95; u.pitch = 1.05; u.lang = 'en-US';
      speechSynthesis.speak(u);
    } catch { }
  }
  stopSpeaking() { try { speechSynthesis.cancel(); } catch { } }

  constructor() {
    this.factQueue = [];
    this.factTimer = null;
    this.dialogOpen = false;
    this.modalOpen = false;
    this.labels = new Map();
    this.zoneTimer = null;
    this.mm = $('#minimap').getContext('2d');
  }

  // ── Loading ──
  loading(p, text) {
    $('#load-fill').style.width = Math.round(p * 100) + '%';
    if (text) $('#load-text').textContent = text;
  }
  hideLoading() { $('#loading').classList.add('fade'); setTimeout(() => $('#loading').classList.add('hidden'), 900); }

  show(id, on = true) { $(id).classList.toggle('hidden', !on); }

  // ── Player card ──
  setPlayerCard(name, title, stars, avatar) {
    $('#pc-name').textContent = name;
    $('#pc-title').textContent = title;
    const el = $('#pc-stars span');
    if (el.textContent !== String(stars)) {
      el.textContent = stars;
      const box = $('#pc-stars'); box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
    }
    if (avatar) $('#pc-avatar').textContent = avatar;
  }

  setClock(hour) {
    const h = Math.floor(hour), m = Math.floor((hour - h) * 60);
    $('#clock-text').textContent = `${h}:${String(m).padStart(2, '0')}`;
    $('#clock-icon').textContent = hour < 5.8 || hour > 19.2 ? '🌙' : hour < 7 ? '🌅' : hour > 17.8 ? '🌇' : '☀️';
  }

  // ── Quest card ──
  setQuest(q, stepIdx) {
    if (!q) { $('#quest-card').classList.add('hidden'); return; }
    $('#quest-card').classList.remove('hidden');
    $('#qc-icon').textContent = q.icon;
    $('#qc-title').textContent = q.title;
    $('#qc-he').textContent = q.he || '';
    const step = q.steps[stepIdx];
    $('#qc-step').innerHTML = step ? esc(step.text) : '';
    $('#qc-steps').innerHTML = q.steps.map((s, i) => `<div class="qs ${i < stepIdx ? 'done' : i === stepIdx ? 'cur' : ''}"></div>`).join('');
  }
  setQuestText(text) { $('#qc-step').innerHTML = esc(text); }

  // ── Prompt ──
  setPrompt(p) {
    const el = $('#prompt');
    if (!p) { if (!el.classList.contains('hidden')) el.classList.add('hidden'); this.promptKey = null; return; }
    const key = p.text + p.icon + (p.bad ? 1 : 0);
    if (this.promptKey !== key) {
      this.promptKey = key;
      el.classList.remove('hidden');
      $('#prompt-text').textContent = p.text;
      $('#prompt-icon').textContent = p.icon || '';
      $('#prompt-key').textContent = this.touch ? '✋' : 'E';
      el.classList.toggle('bad', !!p.bad);
      el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    }
    $('#prompt-arc').style.strokeDashoffset = String(106.8 * (1 - (p.progress || 0)));
  }

  // ── Toasts / banners / facts ──
  toast(text) {
    const d = document.createElement('div');
    d.className = 'toast'; d.textContent = text;
    $('#toasts').appendChild(d);
    setTimeout(() => d.remove(), 3100);
  }
  banner(icon, title, sub = '') {
    const b = $('#banner');
    b.classList.add('hidden'); void b.offsetWidth;
    $('#banner-icon').textContent = icon; $('#banner-title').textContent = title; $('#banner-sub').textContent = sub;
    b.classList.remove('hidden');
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => b.classList.add('hidden'), 3700);
  }
  fact(title, text, src, secs = 9) {
    this.factQueue.push({ title, text, src, secs });
    if (!this.factShowing) this.nextFact();
  }
  nextFact() {
    const f = this.factQueue.shift();
    const el = $('#fact-card');
    if (!f) { el.classList.add('hidden'); this.factShowing = false; return; }
    this.factShowing = true;
    $('#fc-title').textContent = f.title || 'Did you know?';
    $('#fc-text').textContent = f.text;
    $('#fc-src').textContent = f.src ? '— ' + f.src : '';
    el.classList.add('hidden'); void el.offsetWidth; el.classList.remove('hidden');
    if (this.readAloud && !this.dialogOpen) this.speak(f.text);
    clearTimeout(this.factTimer);
    this.factTimer = setTimeout(() => this.nextFact(), f.secs * 1000);
    el.onclick = () => { clearTimeout(this.factTimer); this.nextFact(); };
  }
  clearFacts() { this.factQueue.length = 0; clearTimeout(this.factTimer); $('#fact-card').classList.add('hidden'); this.factShowing = false; }

  zone(name, he) {
    const el = $('#zone-name');
    el.innerHTML = `${esc(name)}${he ? `<span class="he">${esc(he)}</span>` : ''}`;
    el.classList.add('show');
    clearTimeout(this.zoneTimer);
    this.zoneTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  // ── Dialog (returns a Promise with the chosen button value) ──
  dialog({ icon = '🙂', name = '', text = '', he = '', buttons = [{ label: 'OK ▶', value: true }] }) {
    return new Promise(resolve => {
      this.dialogOpen = true;
      $('#dlg-portrait').textContent = icon;
      $('#dlg-name').textContent = name;
      $('#dlg-text').innerHTML = (he ? `<span class="he">${esc(he)}</span>` : '') + esc(text);
      const bwrap = $('#dlg-buttons');
      bwrap.innerHTML = '';
      if ('speechSynthesis' in window) {
        const sp = document.createElement('button');
        sp.className = 'btn btn-stone'; sp.textContent = '🔊'; sp.title = 'Read aloud';
        sp.style.marginRight = 'auto';
        sp.onclick = (e) => { e.stopPropagation(); this.speak(text); };
        bwrap.appendChild(sp);
      }
      if (this.readAloud) this.speak(text);
      let closed = false, armT = 0;
      const finish = (v) => {
        if (closed) return;
        closed = true;
        clearTimeout(armT);
        this.stopSpeaking();
        document.removeEventListener('keydown', onKey, true);
        $('#dialog').classList.add('hidden');
        this.dialogOpen = false;
        audio.play('click');
        resolve(v);
      };
      buttons.forEach((b, i) => {
        const btn = document.createElement('button');
        btn.className = 'btn ' + (i === buttons.length - 1 ? 'btn-gold' : 'btn-stone');
        btn.textContent = b.label;
        btn.onclick = (e) => { e.stopPropagation(); finish(b.value); };
        bwrap.appendChild(btn);
      });
      const onKey = (e) => {
        if (e.repeat) { e.preventDefault(); e.stopPropagation(); return; }
        if (['KeyE', 'Enter', 'Space'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); finish(buttons[buttons.length - 1].value); }
        else if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(buttons[0].value); }
        else if (e.code === 'KeyJ') { e.stopPropagation(); }
      };
      // small delay so the key that opened the dialog doesn't close it
      armT = setTimeout(() => { if (!closed) document.addEventListener('keydown', onKey, true); }, 250);
      $('#dialog').classList.remove('hidden');
    });
  }

  // ── Celebration ──
  celebrate({ icon = '✨', title, stars = 0, maxStars = 3, lines = [], button = 'Continue ▶' }) {
    return new Promise(resolve => {
      this.modalOpen = true;
      $('#cel-icon').textContent = icon;
      $('#cel-title').textContent = title;
      $('#cel-stars').innerHTML = maxStars ? Array.from({ length: maxStars }, (_, i) => `<span class="${i < stars ? '' : 'off'}" style="animation-delay:${0.25 + i * 0.22}s">⭐</span>`).join('') : '';
      $('#cel-lines').innerHTML = lines.join('');
      $('#cel-btn').textContent = button;
      $('#celebrate').classList.remove('hidden');
      for (let i = 0; i < stars; i++) setTimeout(() => audio.play('star'), 300 + i * 220);
      let closed = false, armT = 0;
      const done = () => {
        if (closed) return;
        closed = true;
        clearTimeout(armT);
        document.removeEventListener('keydown', onKey, true);
        $('#celebrate').classList.add('hidden');
        this.modalOpen = false;
        audio.play('click');
        resolve();
      };
      const onKey = (e) => {
        e.stopPropagation();
        if (e.repeat) { e.preventDefault(); return; }
        if (['Enter', 'KeyE', 'Space', 'Escape'].includes(e.code)) { e.preventDefault(); done(); }
      };
      armT = setTimeout(() => { if (!closed) document.addEventListener('keydown', onKey, true); }, 700);
      $('#cel-btn').onclick = done;
    });
  }

  // ── Panels ──
  openPanel(title, tabs, render, startTab = 0) {
    this.modalOpen = true;
    $('#panel-title').textContent = title;
    const tabsEl = $('#panel-tabs');
    tabsEl.innerHTML = '';
    const select = (i) => {
      [...tabsEl.children].forEach((c, j) => c.classList.toggle('sel', i === j));
      $('#panel-body').innerHTML = '';
      render(i, $('#panel-body'));
    };
    tabs.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'tab'; b.textContent = t; b.onclick = () => { audio.play('click'); select(i); };
      tabsEl.appendChild(b);
    });
    tabsEl.style.display = tabs.length > 1 ? '' : 'none';
    select(startTab);
    $('#panel').classList.remove('hidden');
    $('#panel-close').onclick = () => this.closePanel();
    $('#panel').onclick = (e) => { if (e.target.id === 'panel') this.closePanel(); };
  }
  closePanel() {
    if ($('#panel').classList.contains('hidden')) return false;
    $('#panel').classList.add('hidden');
    this.modalOpen = false;
    if (this.onPanelClose) this.onPanelClose();
    return true;
  }

  openJournal(state) {
    this.openPanel('📖 Sefer HaMikdash', ['Places', 'Miracles', 'Lessons'], (tab, body) => {
      if (tab === 0) {
        const n = PLACES.filter(p => state.discovered.includes(p.id)).length;
        body.innerHTML = `<div class="progress-line">🗺️ Discovered ${n} / ${PLACES.length} places — walk around to find them all!</div>` +
          PLACES.map(p => {
            const ok = state.discovered.includes(p.id);
            return `<div class="entry ${ok ? '' : 'locked'}"><div class="e-icon">${ok ? '📍' : '❔'}</div><div><div class="e-name">${ok ? esc(p.name) : '???'}<span class="e-he">${ok ? esc(p.he) : ''}</span></div>
              <div class="e-text">${ok ? esc(p.text) : 'Not discovered yet.'}</div>${ok ? `<div class="e-src">${esc(p.src)}</div>` : ''}</div></div>`;
          }).join('');
      } else if (tab === 1) {
        const n = MIRACLES.filter(m => state.miracles.includes(m.id)).length;
        body.innerHTML = `<div class="progress-line">🌟 Found ${n} / ${MIRACLES.length} miracles of the Beit HaMikdash</div>` +
          MIRACLES.map(m => {
            const ok = state.miracles.includes(m.id);
            return `<div class="entry ${ok ? '' : 'locked'}"><div class="e-icon">${ok ? '🌟' : '❔'}</div><div><div class="e-name">${ok ? esc(m.name) : '???'}</div>
              <div class="e-text">${ok ? esc(m.text) : 'Keep doing the avodah to discover this miracle!'}</div>${ok ? `<div class="e-src">${esc(m.src)}</div>` : ''}</div></div>`;
          }).join('');
      } else {
        const facts = state.facts || [];
        body.innerHTML = `<div class="progress-line">📜 ${facts.length} lessons learned</div>` + (facts.length ? facts.slice().reverse().map(f =>
          `<div class="entry"><div class="e-icon">📜</div><div><div class="e-name">${esc(f.title || '')}</div><div class="e-text">${esc(f.text)}</div><div class="e-src">${esc(f.src || '')}</div></div></div>`).join('')
          : '<div class="entry"><div class="e-text">Do the avodah and talk to people to learn!</div></div>');
      }
    });
  }

  openAchievements(state) {
    this.openPanel('🏆 Achievements', [], (tab, body) => {
      const n = ACHIEVEMENTS.filter(a => state.achievements.includes(a.id)).length;
      body.innerHTML = `<div class="progress-line">${n} / ${ACHIEVEMENTS.length} unlocked</div>` + ACHIEVEMENTS.map(a => {
        const ok = state.achievements.includes(a.id);
        return `<div class="entry ${ok ? '' : 'locked'}"><div class="e-icon">${ok ? a.icon : '🔒'}</div><div><div class="e-name">${esc(a.name)}</div><div class="e-text">${esc(a.desc)}</div></div></div>`;
      }).join('');
    });
  }

  openSettings(settings, onChange, extra) {
    this.openPanel('⚙️ Settings', [], (tab, body) => {
      const seg = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${settings[key] === v ? 'sel' : ''}">${l}</button>`).join('')}</div>`;
      body.innerHTML = `
        <div class="set-row"><span>🎨 Graphics</span>${seg('quality', [['low', 'Fast'], ['medium', 'Nice'], ['high', 'Beautiful']])}</div>
        <div class="set-row"><span>🎶 Music</span><input type="range" min="0" max="1" step="0.05" value="${settings.music}" data-key="music"></div>
        <div class="set-row"><span>🔔 Sounds</span><input type="range" min="0" max="1" step="0.05" value="${settings.sfx}" data-key="sfx"></div>
        <div class="set-row"><span>🖱️ Camera speed</span><input type="range" min="0.3" max="2" step="0.1" value="${settings.camSpeed}" data-key="camSpeed"></div>
        <div class="set-row"><span>🧭 Guide markers</span>${seg('guided', [[true, 'On'], [false, 'Off (challenge)']])}</div>
        <div class="set-row"><span>🔊 Read everything aloud</span>${seg('readAloud', [[true, 'On'], [false, 'Off']])}</div>
        <div class="set-row"><span>💡 Graphics changes apply after reload</span><button class="btn btn-stone" id="set-reload">Reload</button></div>
        <div class="set-row"><span>🏠 Back to the title screen</span><button class="btn btn-stone" id="set-title">Title</button></div>
        <div style="margin-top:12px;font-size:13px;color:#8a6a2a">Controls: WASD / arrows to walk · Shift to run · Space to jump · E to act · drag to look · scroll to zoom · J for the Sefer</div>`;
      body.querySelectorAll('.seg').forEach(s => s.querySelectorAll('button').forEach(b => b.onclick = () => {
        const raw = b.dataset.v; const v = raw === 'true' ? true : raw === 'false' ? false : raw;
        settings[s.dataset.key] = v;
        s.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b));
        onChange(s.dataset.key, v);
      }));
      body.querySelectorAll('input[type=range]').forEach(r => r.oninput = () => { settings[r.dataset.key] = parseFloat(r.value); onChange(r.dataset.key, parseFloat(r.value)); });
      body.querySelector('#set-reload').onclick = () => location.reload();
      body.querySelector('#set-title').onclick = () => { this.closePanel(); extra.toTitle(); };
    });
  }

  // ── Minimap ──
  drawMinimap(player, yaw, target, extraDots, inside) {
    const c = this.mm, W = 220, S = 1.25; // pixels per metre
    c.clearRect(0, 0, W, W);
    c.save();
    c.beginPath(); c.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2); c.clip();
    c.fillStyle = 'rgba(40,40,52,.85)'; c.fillRect(0, 0, W, W);
    c.translate(W / 2, W / 2);
    c.scale(S, S);
    c.translate(-player.x, -player.z);
    const rect = (x0, z0, x1, z1, fill, stroke) => { c.fillStyle = fill; c.fillRect(x0, z0, x1 - x0, z1 - z0); if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1 / S; c.strokeRect(x0, z0, x1 - x0, z1 - z0); } };
    rect(AZARA.minX - 2, AZARA.minZ - 2, AZARA.maxX + 2, AZARA.maxZ + 2, '#7a6a4f');
    rect(AZARA.minX, AZARA.minZ, AZARA.maxX, AZARA.maxZ, '#e9dfc8');
    rect(-14, AZARA.minZ, 8.5, -12.2, '#d7c9a9');
    rect(EZRAT_NASHIM.minX, EZRAT_NASHIM.minZ - 2, EZRAT_NASHIM.maxX + 2, EZRAT_NASHIM.maxZ + 2, '#7a6a4f');
    rect(EZRAT_NASHIM.minX, EZRAT_NASHIM.minZ, EZRAT_NASHIM.maxX, EZRAT_NASHIM.maxZ, '#e3d7bd');
    rect(19, -3, 23, 3, '#e9dfc8');
    rect(HEICHAL.bodyMinX, -HEICHAL.bodyHalfW, HEICHAL.frontWallX0, HEICHAL.bodyHalfW, '#f6f1e6', '#b9a77d');
    rect(ULAM.backX, -ULAM.halfW, ULAM.frontX, ULAM.halfW, '#f2c14e', '#a8761e');
    rect(HEICHAL.hallMinX, -HEICHAL.hallHalfW, HEICHAL.hallMaxX, HEICHAL.hallHalfW, '#ffe6a0');
    const M = MIZBEACH;
    rect(M.cx - M.base / 2, M.cz - M.base / 2, M.cx + M.base / 2, M.cz + M.base / 2, '#cfc6b6', '#8d826d');
    rect(KEVESH.minX, KEVESH.topZ, KEVESH.maxX, KEVESH.bottomZ, '#bfb6a6');
    c.fillStyle = '#ff7a2a'; c.beginPath(); c.arc(P.fireBig.x, P.fireBig.z, 1.4, 0, 6.28); c.fill();
    c.fillStyle = '#c47d3e'; c.beginPath(); c.arc(P.kiyor.x, P.kiyor.z, 1.8, 0, 6.28); c.fill();
    rect(12.2, -12, 14.6, -3.2, '#cbbd9c'); rect(12.2, 3.2, 14.6, 12, '#cbbd9c');
    if (extraDots) for (const d of extraDots) { c.fillStyle = d.color; c.beginPath(); c.arc(d.x, d.z, d.r || 1.2, 0, 6.28); c.fill(); }
    if (target) {
      c.fillStyle = '#ffd34a'; c.strokeStyle = '#7a4a00'; c.lineWidth = 0.8 / S;
      c.beginPath(); c.arc(target.x, target.z, 2.4, 0, 6.28); c.fill(); c.stroke();
    }
    c.restore();
    // player arrow
    c.save();
    c.translate(W / 2, W / 2);
    c.rotate(-yaw);
    c.fillStyle = '#2b6cff'; c.strokeStyle = '#fff'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 9); c.lineTo(0, 4); c.lineTo(-8, 9); c.closePath(); c.fill(); c.stroke();
    c.restore();
    // target direction when off map
    if (target) {
      const dx = (target.x - player.x) * S, dz = (target.z - player.z) * S;
      const d = Math.hypot(dx, dz);
      if (d > W / 2 - 12) {
        const a = Math.atan2(dz, dx);
        c.fillStyle = '#ffd34a';
        c.beginPath(); c.arc(W / 2 + Math.cos(a) * (W / 2 - 12), W / 2 + Math.sin(a) * (W / 2 - 12), 7, 0, 6.28); c.fill();
      }
    }
    c.fillStyle = '#fff'; c.font = 'bold 16px Fredoka, sans-serif'; c.textAlign = 'center';
    c.fillText('N', W / 2, 20);
  }

  // ── World labels (names / "!" above NPCs) ──
  setLabel(id, html, sx, sy, visible) {
    let el = this.labels.get(id);
    if (!el) {
      el = document.createElement('div'); el.className = 'wl';
      $('#world-labels').appendChild(el); this.labels.set(id, el);
    }
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
    el.style.display = visible ? '' : 'none';
    if (visible) el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
    el.style.left = '0'; el.style.top = '0';
  }
  removeLabel(id) { const el = this.labels.get(id); if (el) { el.remove(); this.labels.delete(id); } }

  edgeArrow(show, x, y, angle, dist) {
    const el = $('#edge-arrow');
    if (!show) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.querySelector('.ea-arrow').style.transform = `rotate(${angle}rad)`;
    $('#ea-dist').textContent = dist ? Math.round(dist) + 'm' : '';
  }

  cine(on, caption = '', he = '') {
    $('#cine-bars').classList.toggle('hidden', !on);
    $('#cine-caption').innerHTML = caption ? `${he ? `<span class="he">${esc(he)}</span>` : ''}${esc(caption)}` : '';
  }
  fade(on) { $('#fade').classList.toggle('on', on); return new Promise(r => setTimeout(r, 650)); }
}
