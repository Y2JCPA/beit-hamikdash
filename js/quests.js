// Quest (avodah) definitions. Each quest is a list of steps the engine walks
// the player through. Halachic details follow the Mishnah (Tamid, Zevachim,
// Menachot, Middot) — simplified for kids where noted.
import * as THREE from 'three';
import { P, CORNERS, HORNS, MIZBEACH, KEVESH, AZARA, NORTH_LINE_Z, HEICHAL, VISITOR_SPOTS as VS } from './config.js';
import { BIRKAT_KOHANIM, DAILY_SHIR } from './data.js';
import { makeChart } from './minigames.js';

const TOP = MIZBEACH.topH;
const rampY = (z) => KEVESH.topY * (KEVESH.bottomZ - z) / (KEVESH.bottomZ - KEVESH.topZ);
const at = (p, y = 0) => ({ x: p.x, y, z: p.z });
const inAzara = (p) => p.x > AZARA.minX && p.x < AZARA.maxX && p.z > AZARA.minZ && p.z < AZARA.maxZ && p.y < 2.5;
// Tzafon: from the Mizbeach's north side to the north wall, opposite the Mizbeach (Zevachim 5:1; Yoma 36a)
const inNorth = (p) => p.z < NORTH_LINE_Z && p.x > -14 && p.x < 8.5 && inAzara(p);
const cornerAt = (id) => ({ x: CORNERS[id].x, y: 0, z: CORNERS[id].z });
const hornAt = (id) => ({ x: HORNS[id].x, y: TOP, z: HORNS[id].z });

// ─────────────────────────────────────────────────────────
// Reusable korban steps
// ─────────────────────────────────────────────────────────
function shechitaStep({ north, name, owner = null, vidui = false }) {
  return {
    text: north ? `Shechita: bring the animal to the rings in the NORTH of the Azara` : `Shechita: Shelamim may be slaughtered anywhere in the Azara`,
    kind: 'use', icon: '✨', prompt: 'Shechita',
    at: north ? at(P.slaughterRing) : at({ x: 6, z: 22 }), r: 2.2,
    zone: north ? inAzara : inAzara,
    noMarker: !north,
    check: (g) => {
      if (north && !inNorth(g.player.pos)) return {
        msg: `Wait! ${name} is Kodshei Kodashim — it must be slaughtered in the NORTH of the Azara, by the rings.`, src: 'Zevachim 5:1',
      };
      return null;
    },
    run: async (g) => {
      const a = g.player.followers[0];
      if (owner && a) {
        // Semicha happens right where the shechita is done, just before it (Menachot 9:8)
        a.parked = true;
        await g.visitorComeTo(a.pos);
        g.ui.cine(true, `${owner} leans both hands with all his strength on the animal's head — this is Semicha.${vidui ? ' He says vidui: "I made a mistake, and I am sorry."' : ''}`, 'סְמִיכָה');
        await g.wait(3.2);
        g.ui.cine(false);
        g.fact('Right where the shechita will be, the owner leans his hands on the animal\'s head (semicha) — and the shechita comes immediately after.', 'Menachot 9:8; Vayikra 1:4', 'Semicha');
      }
      g.player.char.pose = 'work';
      if (a) {
        a.parked = true;
        g.fx.sparkle(a.pos.x, a.pos.y + 0.6, a.pos.z, { count: 50, color: 0xffffff, color2: 0xffe08a, speed: 2, up: 1.5, size: 0.3 });
        g.audio.play('step');
        await g.wait(0.9);
        g.player.removeFollower(a);
      }
      g.player.char.pose = 'idle';
      if (owner) g.visitorGoHome();
    },
    fact: north
      ? ['Shechita is done swiftly with a perfectly smooth knife. Even a Yisrael may do the shechita — but from Kabbalah onward, only a Kohen!', 'Zevachim 3:1; 32a']
      : ['Shelamim are "Kodashim Kalim" (lighter holiness), so they may be slaughtered anywhere in the Azara.', 'Zevachim 5:7'],
  };
}

function kabbalahStep() {
  return {
    text: 'Kabbalah: catch the dam in the golden mizrak (hold the button)',
    kind: 'hold', hold: 1.8, icon: '🏺', prompt: 'Kabbalah — hold',
    at: 'here', r: 3,
    start: (g) => { g.player.setHeld(['mizrak']); const f = g.player.heldItem('mizrak')?.userData.fill; if (f) f.scale.setScalar(0.01); },
    tick: (g, frac) => { const f = g.player.heldItem('mizrak')?.userData.fill; if (f) { f.scale.setScalar(Math.max(0.01, frac)); f.position.y = -0.1 + frac * 0.17; } },
    cancel: (g) => g.player.setHeld([]),
    fact: ['The mizrak (bowl) had a pointed bottom, so the Kohen could never put it down and let the dam get cold and thick.', 'Pesachim 64a'],
  };
}

function holachaStep(type) {
  if (type === 'chatat') return {
    text: 'Holacha: carry the mizrak carefully up the Kevesh (ramp) to the top of the Mizbeach',
    kind: 'go', at: { x: 0, y: TOP, z: 1.5 }, r: 2.4, icon: '🚶',
    fact: ['Holacha means walking the dam to the Mizbeach. Walk carefully — no running with the mizrak!', 'Zevachim 1:4'],
  };
  return {
    text: 'Holacha: walk carefully to the NORTH-EAST corner of the Mizbeach',
    kind: 'go', at: cornerAt('NE'), r: 2.4, icon: '🚶',
    fact: ['Holacha means walking the dam to the Mizbeach. Walk carefully — no running with the mizrak!', 'Zevachim 1:4'],
  };
}

function zerikaOlahStep(label = 'Olah', src = 'Zevachim 5:4') {
  return {
    text: `Zerika — "two placements that are four": place the dam on the NORTH-EAST, then the SOUTH-WEST corner, below the red line`,
    kind: 'choose', icon: '💧', prompt: 'Zerika here',
    options: ['NE', 'NW', 'SE', 'SW'].map(id => ({ id, at: cornerAt(id), label: CORNERS[id].label })),
    need: ['NE', 'SW'],
    wrong: { msg: `${label === 'Olah' ? 'An' : 'A'} ${label} gets "two placements that are four": first the north-east corner, then the south-west — each placement touches two sides of the Mizbeach!`, src },
    onOption: async (g, id) => {
      g.player.char.pose = 'work';
      g.addBloodMark(id, false);
      g.audio.play('pour');
      await g.wait(0.6);
      g.player.char.pose = 'idle';
      const f = g.player.heldItem('mizrak')?.userData.fill;
      if (f) f.scale.setScalar(id === 'NE' ? 0.65 : 0.35);
    },
    fact: ['The dam of an Olah is placed below the red line (Chut HaSikra) that goes around the middle of the Mizbeach.', 'Middot 3:1; Zevachim 5:4'],
  };
}

function zerikaChatatStep() {
  return {
    text: 'Zerika on the 4 horns: go around the top — South-East, North-East, North-West, then South-West',
    kind: 'choose', icon: '💧', prompt: 'Place dam on this horn',
    options: ['SE', 'NE', 'NW', 'SW'].map(id => ({ id, at: hornAt(id), label: HORNS[id].label })),
    need: ['SE', 'NE', 'NW', 'SW'],
    wrong: { msg: 'For a Chatat, the Kohen walks around the top and places the dam on each horn in order: South-East, North-East, North-West, South-West.', src: 'Zevachim 5:3' },
    onOption: async (g, id) => {
      g.player.char.pose = 'work';
      g.addBloodMark(id, true);
      g.audio.play('pour');
      await g.wait(0.5);
      g.player.char.pose = 'idle';
      const f = g.player.heldItem('mizrak')?.userData.fill;
      if (f) f.scale.multiplyScalar(0.75);
    },
    fact: ['A Chatat\'s dam goes on all four horns (kranot), above the red line, dipping a finger into the mizrak each time.', 'Zevachim 5:3'],
  };
}

function shirayimStep() {
  return {
    text: 'Pour the rest of the dam (shirayim) on the SOUTHERN yesod (base) of the Mizbeach',
    kind: 'use', at: at(P.southYesod), r: 2.4, icon: '🫗', prompt: 'Pour the shirayim',
    run: async (g) => {
      g.player.char.pose = 'work';
      g.audio.play('pour');
      g.fx.dust.emit(P.southYesod.x, 0.6, P.southYesod.z - 0.4, { count: 12, color: 0x6e0a12, speed: 0.6, up: 0.2, gravity: -6, life: 0.6, size: 0.12 });
      await g.wait(0.8);
      g.player.setHeld([]);
      g.player.char.pose = 'idle';
    },
    fact: ['The leftover dam flowed through a channel into Nachal Kidron — and farmers bought it to fertilize their gardens!', 'Middot 3:2; Yoma 5:6'],
  };
}

function partsStep(kind) {
  return {
    text: kind === 'whole'
      ? 'Take the prepared parts of the korban (eivarim) from the marble tables in the north'
      : 'Take the emurim — the fats that go on the Mizbeach — from the marble tables',
    kind: 'use', at: at(P.tables), r: 2.4, icon: '🍽️', prompt: kind === 'whole' ? 'Take the eivarim' : 'Take the emurim',
    run: async (g) => { g.player.setHeld(['eivarim']); g.audio.play('pickup'); },
    fact: kind === 'whole'
      ? ['Nine Kohanim brought the Tamid up: six carried its parts, and three carried the flour, the chavitin and the wine.', 'Yoma 2:3-5; Tamid 4:3']
      : ['Only the fats (emurim) are burned. The rest of this korban is eaten!', 'Vayikra 3:3-5'],
  };
}

function saltStep() {
  return {
    text: 'Walk up the Kevesh and salt the offering at the salt pile',
    kind: 'use', at: { x: P.saltSpot.x + 0.6, y: rampY(P.saltSpot.z), z: P.saltSpot.z }, r: 2.0, icon: '🧂', prompt: 'Salt the offering',
    run: async (g) => {
      g.player.char.pose = 'work';
      g.audio.play('salt');
      const p = g.player.pos;
      g.fx.sparkle(p.x + Math.sin(g.player.facing) * 0.4, p.y + 1, p.z + Math.cos(g.player.facing) * 0.4, { count: 24, color: 0xffffff, speed: 0.8, up: 0.3, gravity: -5, life: 0.8, size: 0.08 });
      await g.wait(0.7);
      g.player.char.pose = 'idle';
    },
    fact: ['"On all your offerings you shall offer salt." Every korban is salted — salt never spoils, like our bond with Hashem.', 'Vayikra 2:13'],
  };
}

function haktarahStep(text = 'Haktarah: place it on the big fire (hold)') {
  return {
    text, kind: 'hold', hold: 1.6, icon: '🔥', prompt: 'Haktarah — hold',
    at: { x: P.fireBig.x - 1.8, y: TOP, z: P.fireBig.z + 1.0 }, r: 2.6,
    run: async (g) => {
      g.player.setHeld([]);
      g.fireBig.flare(2.6, 5);
      g.smokeBurst();
      g.audio.play('whoosh');
      g.fx.sparkle(P.fireBig.x, TOP + 1.5, P.fireBig.z, { count: 60, color: 0xffb040, color2: 0xffe08a, speed: 3, up: 4, size: 0.25 });
      await g.wait(1.2);
      g.miracle('smoke');
    },
    fact: ['"A pleasing aroma to Hashem" — and the smoke rose straight up like a pillar. Even the wind could not scatter it!', 'Vayikra 1:9; Avot 5:5'],
  };
}

function takeAnimalFromOwner(owner, animal, verb = 'Take the animal') {
  return {
    text: `${verb} from ${owner.name}`,
    kind: 'use', at: () => owner.pos(), r: 2.6, icon: '🤝', prompt: verb,
    run: async (g) => {
      g.player.addFollower(animal);
      g.audio.play(animal === 'tor' ? 'coo' : 'baa');
    },
  };
}

// ─────────────────────────────────────────────────────────
// The daily avodah — follows the order of Mishnah Tamid (simplified)
// ─────────────────────────────────────────────────────────
export const DAILY = [
  {
    id: 'kiyor', icon: '💧', title: 'Washing at the Kiyor', he: 'קִדּוּשׁ יָדַיִם וְרַגְלַיִם', hour: 5.15, achievement: 'kiyor',
    intro: [
      { who: 'memuneh', text: 'Boker tov, young Kohen! Welcome to the Beit HaMikdash. It is still dark — the Avodah begins before sunrise!' },
      { who: 'memuneh', text: 'Before any avodah, a Kohen washes his hands and feet at the Kiyor. Follow the golden light!' },
    ],
    steps: [
      { text: 'Find the Kiyor (the copper laver) between the Ulam and the Mizbeach — from Ezrat Nashim, go up the 15 steps and through Nikanor Gate', kind: 'go', at: at(P.kiyor), r: 4.2, icon: '🚶' },
      {
        text: 'Hold the button to wash your hands and feet', kind: 'hold', hold: 2.2, at: at(P.kiyor), r: 3.6, icon: '💧', prompt: 'Wash hands & feet — hold',
        start: (g) => { g.player.char.pose = 'work'; g.audio.play('water'); },
        tick: (g, f, dt) => {
          const sp = g.nearestSpout();
          if (sp) g.fx.dust.stream(sp, g.player.pos.clone().setY(g.player.pos.y + 0.7), { color: 0x9fd8ff, count: 3, life: 0.35, size: 0.1 });
        },
        run: async (g) => { g.player.char.pose = 'idle'; g.fx.sparkle(g.player.pos.x, g.player.pos.y + 1, g.player.pos.z, { count: 30, color: 0xbfe8ff }); },
        fact: ['The Kohen puts his right hand on his right foot and his left hand on his left foot, and washes them together!', 'Zevachim 19b'],
      },
    ],
    outroFact: ['Ben Katin made 12 spouts for the Kiyor so that 12 Kohanim could wash at the same time.', 'Yoma 3:10'],
  },
  {
    id: 'deshen', icon: '🌅', title: 'Terumat HaDeshen', he: 'תְּרוּמַת הַדֶּשֶׁן', hour: 5.3, achievement: 'deshen',
    intro: [{ who: 'memuneh', text: 'The first avodah of the day: Terumat HaDeshen — lifting a scoop of ashes from the Mizbeach. Take the silver machta (fire-pan) next to the Kevesh.' }],
    steps: [
      {
        text: 'Take the silver machta from its stand, west of the Kevesh (ramp)', kind: 'use', at: at(P.machtaStand), r: 2.3, icon: '🍳', prompt: 'Take the silver machta',
        run: async (g) => { g.player.setHeld(['machta']); g.props.machta.visible = false; g.audio.play('pickup'); },
        fact: ['The Kohen takes the silver machta from the corner between the Kevesh and the Mizbeach and walks up to the top.', 'Tamid 1:4'],
      },
      {
        text: 'Walk up the Kevesh to the top of the Mizbeach and scoop the inner ashes (hold)', kind: 'hold', hold: 2.0, icon: '🔥', prompt: 'Scoop the ashes — hold',
        at: { x: P.ashHeap.x + 1.4, y: TOP, z: P.ashHeap.z + 1.8 }, r: 2.6,
        start: (g) => { g.player.char.pose = 'work'; g.audio.play('scoop'); },
        tick: (g, f) => { if (Math.random() < 0.3) g.fx.sparkle(P.ashHeap.x, TOP + 0.6, P.ashHeap.z, { count: 3, color: 0xff7a2a, speed: 1, up: 1, size: 0.12 }); },
        run: async (g) => { g.player.char.pose = 'idle'; const c = g.player.heldItem('machta')?.userData.coal; if (c) c.visible = true; },
        fact: ['He scoops ashes from the inner part of the fire — the ones that were burned the most.', 'Tamid 1:4'],
      },
      {
        text: 'Go back down and place the ashes on the floor, just EAST of the Kevesh', kind: 'use', at: at(P.ashPlace), r: 2.2, icon: '⬇️', prompt: 'Place the ashes',
        run: async (g) => {
          g.player.char.pose = 'work';
          g.fx.dust.emit(P.ashPlace.x, 0.5, P.ashPlace.z, { count: 20, color: 0x6a645e, speed: 0.6, up: 0.4, gravity: -3, life: 1, size: 0.18 });
          g.props.ashPile.visible = true;
          await g.wait(0.6);
          g.player.setHeld([]);
          g.props.machta.visible = true;
          g.player.char.pose = 'idle';
        },
        fact: ['The ashes are placed beside the Kevesh — and they were miraculously swallowed up right there!', 'Tamid 1:4; Me\'ilah 11b'],
      },
    ],
  },
  {
    id: 'wood', icon: '🪵', title: 'Arranging the Wood', he: 'סִדּוּר הַמַּעֲרָכָה', hour: 5.45, achievement: 'wood',
    intro: [{ who: 'memuneh', text: 'Now let\'s make the fire on the Mizbeach big and strong! Bring wood from the woodpile next to the Kevesh.' }],
    steps: [
      {
        text: 'Pick up logs from the woodpile (east of the Kevesh)', kind: 'use', at: { x: P.woodPile.x, y: 0, z: P.woodPile.z - 0.5 }, r: 2.4, icon: '🪵', prompt: 'Take logs',
        run: async (g) => { g.player.setHeld(['logs']); g.audio.play('pickup'); },
        fact: ['Any wood may be used — except olive wood and grapevine. They mostly used fig, walnut and pine.', 'Tamid 2:3'],
      },
      {
        text: 'Carry the wood up and add it to the big fire (hold)', kind: 'hold', hold: 1.5, icon: '🔥', prompt: 'Add the wood — hold',
        at: { x: P.fireBig.x - 1.8, y: TOP, z: P.fireBig.z + 1.0 }, r: 2.6,
        start: (g) => { g.player.char.pose = 'work'; },
        run: async (g) => {
          g.player.char.pose = 'idle';
          g.player.setHeld([]);
          g.fireBig.flare(1.8, 6);
          g.audio.play('whoosh');
          g.fx.sparkle(P.fireBig.x, TOP + 1, P.fireBig.z, { count: 40, color: 0xff9a40, speed: 2.5, up: 3, size: 0.2 });
          await g.wait(1);
          g.miracle('rain');
        },
        fact: ['"A fire shall burn on the Mizbeach always — it shall not go out."', 'Vayikra 6:6'],
      },
    ],
    after: async (g) => { await g.barkai(); },
  },
  {
    id: 'tamid', icon: '🐑', title: 'The Morning Tamid', he: 'קָרְבַּן תָּמִיד שֶׁל שַׁחַר', hour: 6.25, achievement: 'tamid', korban: true,
    intro: [
      { who: 'memuneh', text: 'The sun is up — it\'s time for the Korban Tamid! Every single morning, one lamb is offered for all of Am Yisrael.' },
      { who: 'memuneh', text: 'Bring a lamb from the Lamb Chamber in the north of the Azara.' },
    ],
    steps: [
      {
        text: 'Take a lamb from the Lishkat HaTla\'im (lamb chamber) in the north', kind: 'use', at: at(P.lambPen), r: 2.6, icon: '🐑', prompt: 'Take a lamb',
        run: async (g) => { g.player.addFollower('lamb'); g.audio.play('baa'); g.penLambs(-1); },
      },
      {
        text: 'Check the lamb for any blemish (mum)', kind: 'auto',
        run: async (g) => {
          const lamb = g.player.followers[0];
          lamb.parked = true;
          const lp = lamb.pos;
          await g.closeUp(new THREE.Vector3(lp.x + Math.sin(lamb.facing + 1.1) * 2.2, lp.y + 1.3, lp.z + Math.cos(lamb.facing + 1.1) * 2.2), new THREE.Vector3(lp.x, lp.y + 0.5, lp.z), 1.9);
          const f = lamb.facing, fx = Math.sin(f), fz = Math.cos(f), rx = Math.cos(f), rz = -Math.sin(f);
          const pt = (fw, side, y) => new THREE.Vector3(lp.x + fx * fw + rx * side, lp.y + y, lp.z + fz * fw + rz * side);
          await g.minigames.hotspots({
            title: 'Bikur Mumim — tap each spot to check the lamb has no blemish',
            spots: [
              { pos: pt(0.55, 0.0, 0.8), icon: '👀', label: 'Eyes' },
              { pos: pt(0.42, 0.18, 0.75), icon: '👂', label: 'Ears' },
              { pos: pt(0.68, 0, 0.65), icon: '👄', label: 'Mouth' },
              { pos: pt(0.25, 0.2, 0.15), icon: '🦵', label: 'Legs' },
              { pos: pt(-0.5, 0, 0.62), icon: '🐑', label: 'Tail' },
            ],
            onSpot: async () => { g.audio.play('star'); },
          });
          g.ui.toast('✅ No mum — the lamb is perfect for the Mizbeach!');
          await g.minigames.hotspots({
            title: 'Give the lamb a drink from the golden cup',
            spots: [{ pos: pt(0.75, 0, 0.6), icon: '🥤', label: 'Golden cup' }],
            onSpot: async () => { g.audio.play('water'); g.audio.play('baa'); await g.wait(0.6); },
          });
          lamb.parked = false;
          await g.releaseCam();
        },
        fact: ['The Tamid lamb was checked for blemishes by torchlight, and given a drink from a golden cup!', 'Tamid 3:4'],
      },
      shechitaStep({ north: true, name: 'The Tamid (an Olah)' }),
      kabbalahStep(),
      holachaStep('olah'),
      zerikaOlahStep('Olah'),
      shirayimStep(),
      partsStep('whole'),
      saltStep(),
      haktarahStep('Haktarah: carry the parts up to the big fire and place them on it (hold)'),
    ],
    outroFact: ['The Tamid was offered every day, morning and afternoon — even on Shabbat and Yom Kippur! (In the real Mikdash its parts were burned a little later, after the Ketoret and Birkat Kohanim. We kept it simple.)', 'Bamidbar 28:3-10; Tamid 7:3'],
  },
  {
    id: 'menorah', icon: '🕎', title: 'Preparing the Menorah', he: 'הֲטָבַת הַנֵּרוֹת', hour: 7.0, achievement: 'menorah',
    intro: [{ who: 'memuneh', text: 'Now, a great honor: climb the 12 steps of the Ulam and go into the Heichal to prepare the Menorah. Only Kohanim may enter!' }],
    steps: [
      { text: 'Climb the steps of the Ulam and enter the Heichal', kind: 'go', at: { x: HEICHAL.hallMaxX - 2, y: 3, z: 0 }, r: 2.6, icon: '🚪' },
      {
        text: 'Go to the golden Menorah (south side) and climb its little stone step', kind: 'use', at: { x: P.menorah.x, y: 3, z: P.menorah.z - 1.7 }, r: 1.8, icon: '🕎', prompt: 'Prepare the Menorah',
        run: async (g) => {
          const m = P.menorah;
          await g.closeUp(new THREE.Vector3(m.x, 3 + 2.55, m.z - 2.05), new THREE.Vector3(m.x, 3 + 2.25, m.z), 1.9);
          const lamps = g.menorahLamps;
          await g.minigames.hotspots({
            title: 'Clean, refill and light each lamp that went out. (The western lamp is still burning!)', small: true,
            spots: lamps.map((p, i) => ({ pos: p.clone().setY(p.y + 0.1), icon: i === 0 ? '🔥' : '🪔', label: i === 0 ? 'Ner Ma\'aravi' : `Lamp ${i + 1}`, done: false, idx: i })).filter(s => s.idx !== 0),
            onSpot: async (s) => { g.lightLamp(s.idx); g.audio.bell(880 + s.idx * 80, 0.1, 0, 1.2); },
          });
          g.miracle('ner_maaravi');
          await g.releaseCam();
        },
        fact: ['In the morning the Kohen cleans the lamps, puts in fresh oil and wicks, and relights any that went out.', 'Tamid 3:9; Rambam, Temidin 3:12'],
      },
    ],
  },
  {
    id: 'ketoret', icon: '💨', title: 'The Ketoret', he: 'הַקְטָרַת הַקְּטֹרֶת', hour: 7.6, achievement: 'ketoret',
    intro: [{ who: 'memuneh', text: 'The Ketoret — the incense — is the most beloved avodah! First, take burning coals from the second fire on top of the Mizbeach.' }],
    steps: [
      {
        text: 'Go up the Mizbeach and take glowing coals from the small fire (hold)', kind: 'hold', hold: 1.6, icon: '🔥', prompt: 'Take coals — hold',
        at: { x: P.fireKetoret.x + 1.4, y: TOP, z: P.fireKetoret.z + 1.4 }, r: 2.4,
        start: (g) => { g.player.setHeld(['machtaGold']); g.player.char.pose = 'work'; },
        cancel: (g) => g.player.setHeld([]),
        run: async (g) => { g.player.char.pose = 'idle'; g.audio.play('scoop'); },
        fact: ['The coals for the Ketoret come from the second fire on the Mizbeach, placed in a golden machta.', 'Tamid 5:5; Yoma 4:4'],
      },
      {
        text: 'Get the Ketoret spoon (kaf) from Pinchas of Beit Avtinas, near the Ulam steps', kind: 'use', at: () => g_npcPos('avtinas'), r: 2.6, icon: '🥄', prompt: 'Receive the Ketoret',
        run: async (g) => { g.player.setHeld(['machtaGold', 'kaf']); g.audio.play('pickup'); },
        fact: ['The Ketoret is made of 11 spices. The family of Avtinas knew the secret recipe!', 'Keritot 6a; Yoma 3:11'],
      },
      {
        text: 'Enter the Heichal and spread the coals on the golden Mizbeach', kind: 'use', at: { x: P.goldAltar.x + 1.2, y: 3, z: P.goldAltar.z }, r: 1.9, icon: '🔥', prompt: 'Spread the coals',
        run: async (g) => { g.player.char.pose = 'work'; g.goldAltarCoals(true); await g.wait(0.6); g.player.setHeld(['kaf']); g.player.char.pose = 'idle'; },
      },
      {
        text: 'Offer the Ketoret — pour it gently onto the coals (hold)', kind: 'hold', hold: 2.6, icon: '💨', prompt: 'Offer the Ketoret — hold',
        at: { x: P.goldAltar.x + 1.2, y: 3, z: P.goldAltar.z }, r: 2.0,
        start: (g) => { g.player.char.pose = 'work'; },
        tick: (g, f) => { if (Math.random() < 0.5) g.ketoretPuff(1); },
        run: async (g) => {
          g.player.setHeld([]); g.player.char.pose = 'bow';
          g.ketoretPuff(40);
          g.crowd.setBow(true);
          g.audio.play('success');
          await g.wait(2.2);
          g.crowd.setBow(false);
          g.player.char.pose = 'idle';
        },
        fact: ['The smell of the Ketoret reached all the way to Yericho — and the goats there sneezed!', 'Tamid 3:8; Yoma 39b'],
      },
    ],
  },
  {
    id: 'bracha', icon: '🙌', title: 'Birkat Kohanim', he: 'בִּרְכַּת כֹּהֲנִים', hour: 8.1, achievement: 'bracha',
    intro: [{ who: 'memuneh', text: 'Now the Kohanim bless the people! Stand on the top of the steps of the Ulam, facing everyone.' }],
    steps: [
      { text: 'Stand at the top of the Ulam steps', kind: 'go', at: { x: P.ulamTop.x, y: 3, z: P.ulamTop.z }, r: 2.4, icon: '🙌' },
      {
        text: 'Raise your hands and bless the people', kind: 'auto',
        run: async (g) => { await g.birkatKohanim(BIRKAT_KOHANIM); },
        fact: ['In the Beit HaMikdash, the Kohanim raised their hands above their heads, and the people answered "Baruch Shem Kevod Malchuto L\'olam Va\'ed".', 'Sotah 7:6; Ta\'anit 16b'],
      },
    ],
    outroFact: ['When everyone bowed, they were packed tightly together — yet there was room for every single person!', 'Avot 5:5'],
    after: async (g) => { g.miracle('bowing'); },
  },
  {
    id: 'shir', icon: '🎵', title: 'Nesachim & the Shir Shel Yom', he: 'נִסּוּךְ הַיַּיִן וְשִׁיר שֶׁל יוֹם', hour: 8.6, achievement: 'shir',
    intro: [{ who: 'memuneh', text: 'Last one! Pour the wine (nesachim) on the Mizbeach — and when the wine is poured, the Leviim sing the Song of the Day!' }],
    steps: [
      {
        text: 'Take the wine from Yosef the Kohen, beside the Kevesh', kind: 'use', at: () => g_npcPos('winekohen'), r: 2.6, icon: '🍷', prompt: 'Take the wine',
        run: async (g) => { g.player.setHeld(['wine']); g.audio.play('pickup'); },
      },
      {
        text: 'Climb up and pour the wine into the silver bowl on the SOUTH-WEST corner (hold)', kind: 'hold', hold: 2.2, icon: '🍷', prompt: 'Pour the wine — hold',
        at: { x: HORNS.SW.x + 0.9, y: TOP, z: HORNS.SW.z - 1.0 }, r: 2.2,
        start: (g) => { g.player.char.pose = 'work'; g.audio.play('pour'); },
        tick: (g) => {
          const p = g.player.pos;
          g.fx.dust.stream(new THREE.Vector3(p.x + Math.sin(g.player.facing) * 0.4, p.y + 1, p.z + Math.cos(g.player.facing) * 0.4), new THREE.Vector3(HORNS.SW.x - 0.15, TOP + 0.2, HORNS.SW.z + 0.35), { color: 0x7a1030, count: 2, life: 0.3, size: 0.08 });
        },
        run: async (g) => { g.player.setHeld([]); g.player.char.pose = 'idle'; },
        fact: ['The wine flows through two holes (shitin) deep under the Mizbeach.', 'Sukkah 4:9; Sukkah 49a'],
      },
      { text: 'The Leviim are starting! Hurry to the Duchan — you will give the signals for their song', kind: 'go', at: { x: 11.5, y: 0, z: 0 }, r: 3.2, icon: '🎶' },
      {
        text: 'Play the Shir Shel Yom with the Leviim!', kind: 'auto',
        run: async (g) => { await g.shirShelYom(); },
      },
    ],
    outroFact: ['At least 12 Leviim stood on the Duchan with lyres, harps and one pair of cymbals — while Kohanim blew the silver trumpets.', 'Arachin 2:3-6; Tamid 7:3; Bamidbar 10:8'],
  },
];

// ─────────────────────────────────────────────────────────
// Visitors who bring their own korbanot
// ─────────────────────────────────────────────────────────
export const VISITORS = [
  {
    id: 'reuven', icon: '🐑', title: 'Reuven\'s Olah', he: 'עוֹלַת נְדָבָה', korban: true,
    npc: { name: 'Reuven', role: 'yisrael', beard: true, robe: 0x6b7a8f, at: VS.reuven, animal: 'keves' },
    intro: [
      { who: 'visitor', text: 'Shalom, Kohen! I want to bring an Olah — a present to Hashem, just because I love Him! Will you help me?' },
    ],
    steps: (v) => [
      takeAnimalFromOwner(v, 'keves', 'Take Reuven\'s lamb'),
      shechitaStep({ north: true, name: 'An Olah', owner: 'Reuven' }),
      kabbalahStep(),
      { ...holachaStep('olah'), text: 'Holacha: walk carefully to the first corner of the Mizbeach where an Olah gets its dam' },
      zerikaOlahStep('Olah'),
      shirayimStep(),
      partsStep('whole'),
      saltStep(),
      haktarahStep(),
    ],
    thanks: 'Todah rabbah! The whole Olah went up to Hashem. I feel so close to Him!',
  },
  {
    id: 'miriam', icon: '🕊️', title: 'Miriam\'s Dove', he: 'עוֹלַת הָעוֹף', korban: true,
    npc: { name: 'Miriam', role: 'woman', robe: 0x8a3b4a, accent: 0x3d5a8a, at: VS.miriam },
    intro: [{ who: 'visitor', text: 'Shalom! I don\'t have much money, but I brought a turtledove for an Olah. Is a little bird good enough for Hashem?' }],
    steps: (v) => [
      {
        text: 'Take the turtledove from Miriam', kind: 'use', at: () => v.pos(), r: 2.6, icon: '🕊️', prompt: 'Take the dove',
        run: async (g) => { g.player.setHeld(['tor']); g.audio.play('coo'); },
        fact: ['"Whether one brings a lot or a little — what matters is that the heart is directed to Heaven."', 'Menachot 13:11'],
      },
      {
        text: 'A bird Olah is done high on the Mizbeach, above the red line, at the SOUTH-EAST corner: go up there', kind: 'go', at: hornAt('SE'), r: 2.2, icon: '🚶',
      },
      {
        text: 'Melikah & mitzui: do the bird\'s melikah, then press its dam onto the wall of the Mizbeach (hold)', kind: 'hold', hold: 2.0, at: hornAt('SE'), r: 2.4, icon: '💧', prompt: 'Melikah & mitzui — hold',
        start: (g) => { g.player.char.pose = 'work'; },
        run: async (g) => { g.addBloodMark('SE', true); g.player.setHeld(['eivarim']); g.player.char.pose = 'idle'; g.fx.sparkle(HORNS.SE.x, TOP + 1, HORNS.SE.z, { count: 30, color: 0xffffff }); },
        fact: ['A bird Olah has no knife — the Kohen does melikah with his thumbnail, and squeezes its dam onto the wall of the Mizbeach.', 'Zevachim 6:5; Vayikra 1:15'],
      },
      {
        text: 'Throw the crop and feathers toward the ash place, east of the Kevesh', kind: 'use', at: { x: 3.2, y: TOP, z: 2.0 }, r: 2.2, icon: '🪶', prompt: 'Throw them to the ash place',
        run: async (g) => { g.fx.dust.emit(P.ashPlace.x, 3, P.ashPlace.z, { count: 16, color: 0xe8e2d8, speed: 1, up: 0.5, gravity: -3, life: 1.4, size: 0.15 }); g.audio.play('scoop'); },
        fact: ['The crop and feathers are thrown to the place of the ashes, east of the Kevesh.', 'Vayikra 1:16; Zevachim 6:5'],
      },
      haktarahStep('Haktarah: place the dove on the big fire (hold)'),
    ],
    thanks: 'Hashem loves my little dove as much as a big bull? That makes me so happy!',
  },
  {
    id: 'yehuda', icon: '🐐', title: 'Yehuda\'s Chatat', he: 'קָרְבַּן חַטָּאת', korban: true,
    npc: { name: 'Yehuda', role: 'yisrael', beard: true, robe: 0x5d6b4a, at: VS.yehuda, animal: 'ez' },
    intro: [{ who: 'visitor', text: 'Shalom, Kohen. Last Shabbat I carried something by mistake — I forgot it was Shabbat! I brought a goat for a Chatat, to come back close to Hashem.' }],
    steps: (v) => [
      takeAnimalFromOwner(v, 'ez', 'Take Yehuda\'s goat'),
      shechitaStep({ north: true, name: 'A Chatat', owner: 'Yehuda', vidui: true }),
      kabbalahStep(),
      holachaStep('chatat'),
      zerikaChatatStep(),
      shirayimStep(),
      partsStep('emurim'),
      saltStep(),
      haktarahStep('Haktarah: place the emurim on the big fire (hold)'),
      {
        text: 'The meat of a Chatat is eaten by the Kohanim — join them at the tables in the Azara', kind: 'use', at: at(P.tables), r: 2.6, icon: '🍽️', prompt: 'Eat with the Kohanim',
        run: async (g) => { g.audio.play('success'); g.miracle('meat'); },
        fact: ['A Chatat is eaten only by male Kohanim, inside the Azara, on that day and night until midnight.', 'Zevachim 5:3'],
      },
    ],
    thanks: 'Thank you, Kohen! I feel clean and new. I\'ll be extra careful on Shabbat!',
  },
  {
    id: 'family', icon: '🎉', title: 'A Family\'s Shelamim', he: 'קָרְבַּן שְׁלָמִים', korban: true,
    npc: { name: 'Avraham & family', role: 'yisrael', beard: true, robe: 0xa0522d, at: VS.family, animal: 'keves' },
    intro: [{ who: 'visitor', text: 'Shalom! We have a new baby, healthy and strong, baruch Hashem! We brought a Shelamim to celebrate — we\'ll share it with the Kohanim and have a big feast!' }],
    steps: (v) => [
      takeAnimalFromOwner(v, 'keves', 'Take the family\'s lamb'),
      shechitaStep({ north: false, name: 'Shelamim', owner: 'Avraham' }),
      kabbalahStep(),
      { ...holachaStep('olah'), text: 'Holacha: walk carefully to the corner of the Mizbeach where the dam goes first' },
      zerikaOlahStep('Shelamim', 'Zevachim 5:7'),
      shirayimStep(),
      {
        text: 'Tenufah: wave the chest and thigh together with Avraham (east of the Mizbeach)', kind: 'use', at: { x: 10.5, y: 0, z: 6 }, r: 2.6, icon: '🙌', prompt: 'Do the Tenufah',
        run: async (g) => {
          g.player.setHeld(['chazeh']);
          g.player.char.pose = 'carry';
          await g.minigames.arrows({ title: 'Tenufah — wave it forward & back, up & down! Press the arrows in order', seq: ['→', '←', '↑', '↓'] });
          g.player.setHeld([]);
          g.player.char.pose = 'idle';
        },
        fact: ['The owner holds the parts, the Kohen puts his hands underneath, and they wave them back and forth, up and down — to Hashem, Who owns all directions!', 'Menachot 5:6; 62a'],
      },
      partsStep('emurim'),
      saltStep(),
      haktarahStep('Haktarah: place the emurim on the big fire (hold)'),
    ],
    thanks: 'Mazal tov to us! Now the whole family will eat the Shelamim in Yerushalayim — for two days and one night!',
  },
  {
    id: 'chana', icon: '🌾', title: 'Chana\'s Mincha', he: 'מִנְחַת סֹלֶת', korban: true,
    npc: { name: 'Chana', role: 'woman', robe: 0x6e5a7e, accent: 0xc79a3e, at: VS.chana },
    intro: [{ who: 'visitor', text: 'Shalom, Kohen! I made a Minchat Solet — fine flour, with oil and frankincense (levonah). Can you offer it for me?' }],
    steps: (v) => [
      {
        text: 'Take the Mincha from Chana', kind: 'use', at: () => v.pos(), r: 2.6, icon: '🌾', prompt: 'Take the Mincha',
        run: async (g) => { g.player.setHeld(['mincha']); g.audio.play('pickup'); },
        fact: ['A Minchat Solet is fine flour with oil poured on it and a handful of levonah (frankincense) on top.', 'Vayikra 2:1'],
      },
      {
        text: 'Hagashah: bring the Mincha to the SOUTH-WEST corner of the Mizbeach', kind: 'use', at: cornerAt('SW'), r: 2.4, icon: '🙏', prompt: 'Hagashah',
        fact: ['Hagashah — the Mincha is brought close to the south-west corner of the Mizbeach.', 'Menachot 5:6; Sotah 14b'],
      },
      {
        text: 'Kemitzah: take exactly one fistful (kometz) of the Mincha', kind: 'auto',
        run: async (g) => {
          g.player.char.pose = 'work';
          const r = await g.minigames.meter({ title: 'Kemitzah — stop when the hand is exactly full!', hint: 'Press when the needle is in the green zone', button: '✊ Kemitzah!' });
          if (r.tries > 1) g.mistakeSoft();
          g.player.char.pose = 'idle';
        },
        fact: ['Kemitzah: the Kohen closes three fingers over his palm to take one handful — not more, not less!', 'Menachot 11a; Vayikra 2:2'],
      },
      haktarahStep('Haktarah: burn the kometz and the levonah on the big fire (hold)'),
    ],
    thanks: 'Thank you! And the rest of my Mincha will be baked as matzah and eaten by the Kohanim.',
    outroFact: ['The rest of the Mincha is eaten by the Kohanim — and it must be baked as matzah, never chametz.', 'Menachot 5:1; Vayikra 6:9-10'],
  },
  {
    id: 'bikkurim', icon: '🧺', title: 'Bikkurim — First Fruits', he: 'בִּכּוּרִים',
    npc: { name: 'Shimon the farmer', role: 'yisrael', beard: true, robe: 0x9c7b52, at: VS.bikkurim },
    intro: [{ who: 'visitor', text: 'Shalom! I came all the way from the Galil with the first fruits of my field! We marched with flutes and an ox with golden horns. Will you take my basket?' }],
    steps: (v) => [
      {
        text: 'Take the basket of Bikkurim from Shimon', kind: 'use', at: () => v.pos(), r: 2.6, icon: '🧺', prompt: 'Take the basket',
        run: async (g) => { g.player.setHeld(['basket']); g.audio.play('pickup'); },
        fact: ['Bikkurim come from the 7 species: wheat, barley, grapes, figs, pomegranates, olives and dates.', 'Bikkurim 1:3; Devarim 8:8'],
      },
      {
        text: 'Tenufah: wave the basket together with Shimon', kind: 'auto',
        run: async (g) => {
          g.player.char.pose = 'carry';
          await g.minigames.arrows({ title: 'Wave the basket — forward & back, up & down!', seq: ['→', '←', '↑', '↓'] });
          g.player.char.pose = 'idle';
        },
        fact: ['The Kohen puts his hands under the owner\'s hands and waves the basket.', 'Bikkurim 3:6'],
      },
      {
        text: 'Listen to Shimon say "Arami Oved Avi"', kind: 'auto',
        run: async (g) => {
          await g.minigames.verses([
            { he: 'אֲרַמִּי אֹבֵד אָבִי', en: '"An Aramean tried to destroy my father…"' },
            { he: 'וַיּוֹצִאֵנוּ ה׳ מִמִּצְרַיִם', en: '"…and Hashem took us out of Egypt…"' },
            { he: 'וַיִּתֶּן לָנוּ אֶת הָאָרֶץ הַזֹּאת', en: '"…and gave us this land, flowing with milk and honey."' },
          ]);
          g.leviimSing(4);
        },
        fact: ['The farmer thanks Hashem for the whole story of our people. (When his group entered the Azara, the Leviim sang "Aromimcha Hashem ki dilitani!")', 'Devarim 26:5-10; Bikkurim 3:4-6'],
      },
      {
        text: 'Walk with Shimon to the SOUTH-WEST corner of the Mizbeach, where he sets the basket down', kind: 'use', at: cornerAt('SW'), r: 2.4, icon: '🧺', prompt: 'Help set it down',
        run: async (g) => { g.player.setHeld([]); g.placeBasket(); },
        fact: ['The farmer sets the basket beside the Mizbeach, bows down, and goes home happy.', 'Bikkurim 3:6'],
      },
    ],
    thanks: 'Todah! Hashem gave us such a good land. See you next year with more fruit!',
  },
];

// tiny indirection so step "at" functions can find NPCs at runtime
let _npcPos = () => ({ x: 0, y: 0, z: 0 });
export function setNpcPosResolver(fn) { _npcPos = fn; }
function g_npcPos(id) { return _npcPos(id); }

export function shirForToday(dayOffset = 0) {
  const d = (new Date().getDay() + dayOffset) % 7;
  return { ...DAILY_SHIR[d], index: d, chart: makeChart(d) };
}
