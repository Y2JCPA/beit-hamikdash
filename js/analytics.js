// Gameplay telemetry only: never pass profiles, names, IDs or saved state here.
const milestones = [60, 300, 600, 1200];
let playing = false, firstTask = false, activeSeconds = 0, nextMilestone = 0;
let lastInput = 0;
for (const type of ['keydown', 'pointerdown', 'pointermove', 'touchstart', 'touchmove']) {
  window.addEventListener(type, () => { lastInput = performance.now(); }, { passive: true });
}

export function track(event, params = {}) {
  try {
    window.gtag?.('event', event, { send_to: 'G-MRMZPQXR3B', ...params });
  } catch { /* Analytics must never interrupt gameplay, even offline/blocked. */ }
}

export function startPlay(resuming) {
  playing = true; firstTask = false; activeSeconds = 0; nextMilestone = 0;
  lastInput = performance.now();
  track('game_start', { entry_type: resuming ? 'resume' : 'new',
    display_mode: window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser' });
}

export function taskComplete(q) {
  if (!playing) return;
  const params = { task_id: q.id, task_type: q.practice ? 'practice' : q.visitor ? 'visitor' : q.lishka ? 'chamber' : 'daily' };
  track('task_complete', params);
  if (!firstTask) { firstTask = true; track('first_task_complete', params); }
}

// Count foreground play with input in the last 60 seconds, not an idle open tab.
// Called once per rendered frame (outside the automated-test turbo loop).
export function tickPlay(seconds, inPlay) {
  if (!playing || !inPlay || document.hidden || performance.now() - lastInput > 60000) return;
  activeSeconds += Math.max(0, Math.min(seconds, 1));
  while (nextMilestone < milestones.length && activeSeconds >= milestones[nextMilestone]) {
    const duration = milestones[nextMilestone++];
    track('active_play_' + duration + 's', { active_seconds: duration });
  }
}
