// Hidden missions in the chambers (lishkot) of the Mikdash. Each one starts when you talk
// to someone in that chamber, and can be played any time between the avodot of the day.
//   Ezrat Nashim's four corners (Middot 2:5): wood, Nezirim, Metzora'im, oil
//   The Leviim's instrument rooms under Ezrat Yisrael (Middot 2:6)
//   Lishkat HaGazit, the Sanhedrin (Middot 5:4) — the Par He'elem Davar (Vayikra 4:13-21)
import * as THREE from 'three';
import { P, HEICHAL, EZRAT_NASHIM } from './config.js';
import { at, inAzara, inNorth, kabbalahStep, partsStep, saltStep, haktarahStep, g_npcPos } from './quests.js';
import { noteFreq } from './audio.js';

const FY = EZRAT_NASHIM.floorY;
const npcAt = (id) => () => g_npcPos(id);

// the people you meet (the game places them; see Game.setupLishkot)
export const LISHKA_NPCS = [
  { id: 'etzimKohen', name: 'Natan the Kohen', icon: '🪵', role: 'kohen', x: 79, z: -27.4, facing: 0, quest: 'etzim' },
  { id: 'nazir', name: 'Gidon the Nazir', icon: '🧔', role: 'yisrael', robe: 0x7d4e57, hair: 0x2a1b10, x: 79.5, z: 25.4, facing: Math.PI, quest: 'nezirim' },
  { id: 'metzora', name: 'Yoav', icon: '🙂', role: 'yisrael', robe: 0x4f6d7a, x: 34.5, z: -25.5, facing: 0, quest: 'metzoraim' },
  { id: 'shemanyaKohen', name: 'Menachem the Kohen', icon: '🫒', role: 'kohen', x: 31.5, z: 27.4, facing: Math.PI, quest: 'shemanya' },
  { id: 'leviShir', name: 'Uziel the Levi', icon: '🎶', role: 'levi', robe: 0xeef0f4, accent: 0x3d5a8a, x: 23.4, z: -9.5, facing: Math.PI / 2, quest: 'kleiShir', instrument: 'kinor' },
  { id: 'zaken', name: 'A sage of the Sanhedrin', icon: '👴', role: 'yisrael', robe: 0xf2ece0, hair: 0xe8e4dc, x: 27, z: 42.4, facing: Math.PI, quest: 'parHelem' },
];

// ─────────────────────────────────────────────────────────
// Lishkat HaEtzim: Kohanim with a mum check the wood for worms (Middot 2:5)
// ─────────────────────────────────────────────────────────
const ETZIM = {
  id: 'etzim', icon: '🪵', title: 'The Wood Chamber', he: 'לִשְׁכַּת הָעֵצִים', npc: 'etzimKohen',
  intro: [
    { who: 'etzimKohen', text: 'Shalom! I am a Kohen, but I was born with a mum (a blemish), so I may not serve at the Mizbeach. I still have a holy job: I check every log for worms! Will you help me?' },
    { who: 'etzimKohen', text: 'A log with a worm is pasul — it may not go on the Mizbeach. And we never use olive wood or grapevine.' },
  ],
  steps: () => [
    {
      text: 'Check the logs: take out every log that may NOT go on the Mizbeach', kind: 'auto',
      run: async (g) => {
        const c = g.world.woodChamberPile;
        await g.closeUp(new THREE.Vector3(c.x, FY + 1.9, c.z + 3.4), new THREE.Vector3(c.x, FY + 0.55, c.z + 1.2), 2.6);
        const kinds = ['fig', 'worm', 'walnut', 'olive', 'pine', 'worm', 'vine', 'fig', 'worm'];
        const LOOK = {
          fig: ['🪵', 'Fig wood'], walnut: ['🪵', 'Walnut wood'], pine: ['🪵', 'Pine wood'],
          worm: ['🐛', 'A worm!'], olive: ['🫒', 'Olive wood'], vine: ['🍇', 'Grapevine'],
        };
        const good = (k) => k === 'fig' || k === 'walnut' || k === 'pine';
        await g.minigames.hotspots({
          title: 'Find the logs that may NOT go on the Mizbeach — tap them to take them out!', small: true,
          spots: kinds.map((k, i) => ({
            pos: new THREE.Vector3(c.x - 0.9 + (i % 3) * 0.9, FY + 0.25 + Math.floor(i / 3) * 0.32, c.z + 1.25),
            icon: LOOK[k][0], label: LOOK[k][1], kind: k, wrong: good(k),
          })),
          onSpot: async (s) => {
            g.audio.play('scoop');
            g.ui.toast(s.kind === 'worm' ? '🐛 A worm! This log is pasul for the Mizbeach.' : s.kind === 'olive' ? '🫒 Olive wood — it is not used on the Mizbeach.' : '🍇 Grapevine — it is not used on the Mizbeach.');
          },
          onWrong: (s) => { g.mistakeSoft(); g.ui.toast(`🪵 That is good ${s.label} — keep it for the Mizbeach!`); },
        });
        await g.releaseCam();
      },
      fact: ['All kinds of wood may go on the Mizbeach except olive and grapevine. The Kohanim liked to use branches of fig, walnut and pine.', 'Tamid 2:3'],
    },
    {
      text: 'Take an armful of the good logs', kind: 'use', at: { x: 83.5, y: FY, z: -27.6 }, r: 2.4, icon: '🪵', prompt: 'Take the good logs',
      run: async (g) => { g.player.setHeld(['logs']); g.audio.play('pickup'); },
      fact: ['Why not olive wood and grapevine? Their knots make a lot of smoke — and Eretz Yisrael needs its olives and grapes!', 'Tamid 29b'],
    },
    {
      text: 'Carry the logs up to the wood pile beside the Kevesh, in the Azara', kind: 'use', at: { x: P.woodPile.x, y: 0, z: P.woodPile.z - 0.6 }, r: 2.6, icon: '🪵', prompt: 'Add the logs to the pile',
      run: async (g) => { g.player.char.pose = 'work'; g.audio.play('scoop'); await g.wait(0.6); g.player.setHeld([]); g.player.char.pose = 'idle'; },
      fact: ['On nine days every year, families from all over Israel brought wood for the Mizbeach as a gift — and for them it was a holiday!', 'Ta\'anit 4:5'],
    },
  ],
  outroFact: ['Even a Kohen who may not serve at the Mizbeach has a holy job in the Mikdash: Kohanim with a mum checked the wood in Lishkat HaEtzim.', 'Middot 2:5'],
};

// ─────────────────────────────────────────────────────────
// Lishkat HaNezirim: the Nazir finishes his nezirut (Middot 2:5; Nazir 6:8-9)
// ─────────────────────────────────────────────────────────
const NEZIRIM = {
  id: 'nezirim', icon: '✂️', title: 'The Nazir\'s Last Day', he: 'לִשְׁכַּת הַנְּזִירִים', npc: 'nazir',
  intro: [
    { who: 'nazir', text: 'Shalom, Kohen! For thirty days I was a Nazir: no wine, and no cutting my hair. Today my nezirut is finished! My korbanot were brought in the Azara, and my Shelamim is cooking here in the pot.' },
  ],
  steps: () => [
    {
      text: 'Watch: the Nazir cuts his hair and puts it into the fire under the pot', kind: 'auto',
      run: async (g) => {
        const n = g.npcs.nazir;
        n.char.pose = 'work';
        g.ui.cine(true, 'Gidon shaves off the hair of his nezirut and throws it into the fire under the pot of his Shelamim.', 'וְנָתַן עַל הָאֵשׁ אֲשֶׁר תַּחַת זֶבַח הַשְּׁלָמִים');
        await g.wait(1.4);
        g.potFlare();
        await g.wait(2.2);
        g.ui.cine(false);
        n.char.pose = 'idle';
      },
      fact: ['The Nazir shaves his head at the door of the Mikdash, and puts his hair into the fire under the pot of his Shelamim.', 'Bamidbar 6:18; Nazir 6:8'],
    },
    {
      text: 'Take the cooked foreleg (zeroa) from the pot, with a matzah and a wafer from the Nazir\'s basket', kind: 'use', at: { x: 81, y: FY, z: 26.6 }, r: 2.4, icon: '🍖', prompt: 'Take the zeroa',
      run: async (g) => { g.player.setHeld(['chazeh']); g.audio.play('pickup'); },
      fact: ['The Kohen takes the cooked foreleg of the ram, one matzah loaf and one wafer.', 'Nazir 6:9; Bamidbar 6:19'],
    },
    {
      text: 'Tenufah: put them on the Nazir\'s hands and wave them together', kind: 'use', at: npcAt('nazir'), r: 2.6, icon: '🙌', prompt: 'Do the Tenufah',
      run: async (g) => {
        g.player.char.pose = 'carry';
        g.npcs.nazir.char.pose = 'raise';
        await g.minigames.arrows({ title: 'Tenufah — wave it forward & back, up & down! Press the arrows in order', seq: ['→', '←', '↑', '↓'] });
        g.player.setHeld([]);
        g.player.char.pose = 'idle';
        g.npcs.nazir.char.pose = 'idle';
      },
      fact: ['The Kohen puts them on the Nazir\'s palms, and they wave them together. After that, the Nazir may drink wine again!', 'Nazir 6:9; Bamidbar 6:20'],
    },
  ],
  thanks: { who: 'nazir', text: 'Thank you, Kohen! My nezirut is complete. I feel so close to Hashem!' },
  outroFact: ['A Nazir\'s hair goes into the fire only when he finishes his nezirut in purity, here in the Mikdash.', 'Nazir 6:8'],
};

// ─────────────────────────────────────────────────────────
// Lishkat HaMetzora'im: the metzora's last step of tahara (Negaim 14:8-9)
// ─────────────────────────────────────────────────────────
const METZORAIM = {
  id: 'metzoraim', icon: '💧', title: 'Yoav Becomes Tahor', he: 'לִשְׁכַּת הַמְּצֹרָעִים', npc: 'metzora',
  intro: [
    { who: 'metzora', text: 'Shalom, Kohen! I was a metzora, and I had to live outside the city. Now, baruch Hashem, I am healed! Today is the last step of my tahara.' },
    { who: 'metzora', text: 'The Kohanim already brought my Asham. First I immerse here — then I go to Nikanor Gate. Will you meet me there?' },
  ],
  steps: () => [
    {
      text: 'Watch: Yoav immerses in the pool of the Lishkat HaMetzora\'im', kind: 'auto',
      run: async (g) => {
        const n = g.npcs.metzora, w = g.world.mikveh;
        await g.walkNpcPath(n, [{ x: w.x + 2.4, z: w.z + 2.6 }]);
        g.ui.cine(true, 'Yoav immerses in the water of the Lishkat HaMetzora\'im.', 'טְבִילָה');
        g.audio.play('water');
        g.fx.sparkle(w.x, w.y + 0.4, w.z, { count: 50, color: 0x9fd8ff, color2: 0xffffff, speed: 2, up: 2, size: 0.22 });
        await g.wait(2.4);
        g.ui.cine(false);
        // out of the chamber and up the 15 steps, to wait at Nikanor Gate
        g.walkNpcPath(n, [{ x: 31.5, z: -12 }, { x: 26, z: -4 }, { x: 22.3, z: -0.9 }], -Math.PI / 2);
      },
      fact: ['A healed metzora immerses in the Lishkat HaMetzora\'im, in the corner of Ezrat Nashim.', 'Negaim 14:8; Middot 2:5'],
    },
    {
      text: 'Go to Nikanor Gate, from the inside — Yoav waits for you at the top of the 15 steps', kind: 'use', at: { x: 20.4, y: 0, z: -0.6 }, r: 2.4, icon: '🚪', prompt: 'Help Yoav',
      run: async (g) => {
        const n = g.npcs.metzora;
        const p = n.char.group.position;
        // his right side, when he faces into the Azara (west)
        const R = new THREE.Vector3(0, 0, -0.18);
        await g.closeUp(new THREE.Vector3(p.x + 0.5, p.y + 1.4, p.z - 2.7), new THREE.Vector3(p.x, p.y + 0.85, p.z), 2.2);
        await g.minigames.hotspots({
          title: 'Put the dam of his Asham on his RIGHT ear, RIGHT thumb and RIGHT big toe — in order!', ordered: true, small: true,
          spots: [
            { pos: p.clone().add(R).setY(p.y + 1.52), icon: '👂', label: 'Right ear' },
            { pos: p.clone().add(R.clone().multiplyScalar(1.4)).setY(p.y + 0.85), icon: '👍', label: 'Right thumb' },
            { pos: p.clone().add(R).setY(p.y + 0.08), icon: '🦶', label: 'Right big toe' },
          ],
          onSpot: async () => { g.audio.play('pour'); },
        });
        await g.releaseCam();
      },
      fact: ['The metzora puts his head through Nikanor Gate, then his hand, then his foot — and the Kohen puts the dam of the Asham on his right ear, right thumb and right big toe.', 'Negaim 14:9; Vayikra 14:14'],
    },
  ],
  thanks: { who: 'metzora', text: 'Todah rabbah! Now I am completely tahor — and I can come into the Azara with everyone!' },
  after: (g) => g.npcHome('metzora'),
  outroFact: ['After the dam, the Kohen puts oil on the same three places. Now the metzora is tahor and may enter the Azara!', 'Vayikra 14:17'],
};

// ─────────────────────────────────────────────────────────
// Lishkat Beit Shemanya: the wine and the oil (Middot 2:5, as Abba Shaul says)
// ─────────────────────────────────────────────────────────
const SHEMANYA = {
  id: 'shemanya', icon: '🫒', title: 'The Chamber of Oil', he: 'לִשְׁכַּת בֵּית שְׁמַנְיָה', npc: 'shemanyaKohen',
  intro: [
    { who: 'shemanyaKohen', text: 'Shalom! Here in Beit Shemanya we keep the wine and the oil for the korbanot. Every evening the Menorah needs oil — will you help me measure it?' },
  ],
  steps: () => [
    {
      text: 'Fill the half-log measure with pure olive oil', kind: 'auto',
      run: async (g) => {
        g.player.char.pose = 'work';
        const r = await g.minigames.meter({ title: 'Pour the oil into the half-log measure — stop right at the line!', hint: 'Press when the needle is in the green zone', button: '🫒 Stop!' });
        if (r.tries > 1) g.mistakeSoft();
        g.player.char.pose = 'idle';
        g.audio.play('pour');
      },
      fact: ['The oil for the Menorah is the purest: the first drop pressed from each olive.', 'Shemot 27:20; Menachot 8:4'],
    },
    {
      text: 'How much oil does the whole Menorah need?', kind: 'auto',
      run: async (g) => {
        const r = await g.minigames.tally({ title: 'How many half-log measures does the whole Menorah need?', hint: 'Half a log for each lamp of the Menorah', items: [{ icon: '🫙', label: 'Half-log measures', target: 7 }] });
        if (r.tries > 1) g.mistakeSoft();
      },
      fact: ['The Menorah got 3½ logs of oil: half a log in each of its 7 lamps — enough to burn through the longest night of the winter.', 'Menachot 89a'],
    },
    {
      text: 'Now the wine for the nesachim', kind: 'auto',
      run: async (g) => {
        const r = await g.minigames.tally({
          title: 'Wine for the nesachim: how many logs for each korban?',
          hint: 'A hin is 12 logs. A lamb gets ¼ of a hin, a ram ⅓, and a bull ½',
          items: [{ icon: '🐑', label: 'Logs for a lamb', target: 3 }, { icon: '🐏', label: 'Logs for a ram', target: 4 }, { icon: '🐂', label: 'Logs for a bull', target: 6 }],
        });
        if (r.tries > 1) g.mistakeSoft();
        g.audio.play('pour');
      },
      fact: ['The wine of the nesachim: a quarter of a hin for a lamb, a third for a ram, and half a hin for a bull.', 'Bamidbar 28:14; Menachot 89a'],
    },
  ],
  outroFact: ['Rabbi Eliezer ben Yaakov forgot what this chamber was used for — and Abba Shaul remembered: the wine and the oil!', 'Middot 2:5'],
};

// ─────────────────────────────────────────────────────────
// The Leviim's instrument rooms (Middot 2:6): a music game
// ─────────────────────────────────────────────────────────
const KLEI_SHIR = {
  id: 'kleiShir', icon: '🎶', title: 'The Leviim\'s Music Room', he: 'לִשְׁכּוֹת כְּלֵי הַשִּׁיר', npc: 'leviShir',
  intro: [
    { who: 'leviShir', text: 'Shalom! I am Uziel the Levi. In these rooms under Ezrat Yisrael we keep the kinorot, the nevalim, the chalilim and the cymbals. Can you play back the tunes I teach you?' },
  ],
  steps: () => [
    {
      text: 'Listen to the Levi, then play the same tune back', kind: 'auto',
      run: async (g) => {
        const a = g.audio, now = () => a.ctx?.currentTime ?? 0;
        const r = await g.minigames.echo({
          title: 'Play it back! Listen to Uziel, then tap the same instruments',
          pads: [
            { icon: '🎵', label: 'Kinor', play: () => a.pluck(noteFreq(4, 1), now(), 0.55, 'kinor') },
            { icon: '🎶', label: 'Nevel', play: () => a.pluck(noteFreq(0, -1), now(), 0.6, 'nevel') },
            { icon: '🌬️', label: 'Chalil', play: () => a.chalil(noteFreq(2, 1), now(), 0.45) },
            { icon: '🥁', label: 'Metziltayim', play: () => a.cymbal(0.32) },
          ],
        });
        g.shirEcho = r.tries;
        if (r.tries > 2) g.mistakeSoft();
      },
      fact: ['The young Leviim did not play instruments on the Duchan — they sang with their high voices, to make the song sweet!', 'Arachin 2:6'],
    },
    {
      text: 'How many instruments play every day, at least?', kind: 'auto',
      run: async (g) => {
        const r = await g.minigames.tally({
          title: 'Every day, at least how many of each played?',
          hint: 'At least 9 kinorot and 2 nevalim — but only ONE pair of cymbals',
          items: [{ icon: '🎵', label: 'Kinorot', target: 9 }, { icon: '🎶', label: 'Nevalim', target: 2 }, { icon: '🥁', label: 'Metziltayim', target: 1 }],
        });
        if (r.tries > 1) g.mistakeSoft();
      },
      fact: ['Never fewer than 9 kinorot, and between 2 and 6 nevalim — but only one pair of cymbals.', 'Arachin 2:3, 2:5'],
    },
  ],
  outroFact: ['The instruments were kept in rooms under Ezrat Yisrael, opening into Ezrat Nashim.', 'Middot 2:6'],
};

// ─────────────────────────────────────────────────────────
// Lishkat HaGazit: the Par He'elem Davar — when the Sanhedrin made a mistake
// (Vayikra 4:13-21; Horayot 1:5; Zevachim 5:2; Menachot 9:7)
// ─────────────────────────────────────────────────────────
const KG_GO_IN = { x: HEICHAL.hallMaxX - 2, y: 3, z: 0 };
const PAROCHES_SPOT = { x: -40.6, y: 3, z: 0 };

const PAR_HELEM = {
  id: 'parHelem', icon: '⚖️', title: 'The Par He\'elem Davar', he: 'פַּר הֶעְלֵם דָּבָר שֶׁל צִבּוּר', npc: 'zaken', korban: true, achievement: 'sanhedrin',
  intro: [
    { who: 'zaken', text: 'Shalom, young Kohen! Welcome to Lishkat HaGazit. Here the 71 sages of the Great Sanhedrin sit in half a circle, so every sage can see all the others.' },
    { who: 'zaken', text: 'Even great sages can make a mistake. Imagine that the Sanhedrin taught by mistake that it is allowed to carry from a house into the street on Shabbat — and most of Israel did it!' },
    { who: 'zaken', text: 'The Torah tells us how to fix it: the Sanhedrin brings a special korban, the Par He\'elem Davar — "the bull for a thing that was hidden." Will you help us bring it?' },
  ],
  steps: (g) => {
    const kg = g.isKG();
    const start = [
      {
        text: 'Take the bull of the Sanhedrin — it is waiting inside the Azara, by the door of Lishkat HaGazit', kind: 'use', at: at(P.parSpot), r: 2.6, icon: '🐂', prompt: 'Take the bull',
        run: async (g) => { g.parBull(false); g.player.addFollower('par'); g.audio.play('baa'); },
        fact: ['If the Sanhedrin said "there is no Shabbat" at all, there is no korban — the bull is brought only for a mistake in one detail, like carrying.', 'Horayot 4a'],
      },
      {
        text: 'Bring the bull to the rings in the NORTH of the Azara — the sages will meet you there for semicha', kind: 'use', icon: '✋', prompt: 'Semicha & shechita',
        at: at(P.slaughterRing), r: 2.2, zone: inAzara,
        check: (g) => (!inNorth(g.player.pos) ? { msg: 'Wait! The Par He\'elem Davar is a Chatat whose dam goes inside — it must be slaughtered in the NORTH of the Azara.', src: 'Zevachim 5:2' } : null),
        run: async (g) => {
          const a = g.player.followers[0];
          if (a) a.parked = true;
          await g.sagesSemicha(a ? a.pos : g.player.pos);
          g.player.char.pose = 'work';
          if (a) {
            g.fx.sparkle(a.pos.x, a.pos.y + 0.6, a.pos.z, { count: 50, color: 0xffffff, color2: 0xffe08a, speed: 2, up: 1.5, size: 0.3 });
            g.audio.play('step');
            await g.wait(0.9);
            g.player.removeFollower(a);
          }
          g.player.char.pose = 'idle';
        },
        fact: ['Not the whole Sanhedrin: three of its sages lean their hands on the bull for all of Israel (Rabbi Yehuda says five). It is one of only two korbanot of the whole people that get semicha.', 'Sanhedrin 1:3; Menachot 9:7; Rambam, Maaseh HaKorbanot 3:10'],
      },
    ];
    // the dam goes into the Heichal — that is the avodah of the Kohen Gadol (Vayikra 4:16)
    const inside = kg ? [
      { ...kabbalahStep(), text: 'Kohen Gadol! Kabbalah: catch the dam in the golden mizrak (hold the button)' },
      { text: 'Carry the dam up the steps of the Ulam and into the Heichal', kind: 'go', at: KG_GO_IN, r: 2.6, icon: '🚶' },
      {
        text: 'Stand before the Paroches and sprinkle the dam toward it, seven times', kind: 'use', at: PAROCHES_SPOT, r: 2.2, icon: '💧', prompt: 'Sprinkle toward the Paroches',
        run: async (g) => {
          g.player.char.pose = 'work';
          const r = await g.minigames.tally({ title: 'Sprinkle the dam toward the Paroches — count the sprinkles!', hint: '"…and sprinkle it seven times before Hashem, toward the Paroches"', items: [{ icon: '💧', label: 'Sprinkles', target: 7 }] });
          if (r.tries > 1) g.mistakeSoft();
          g.sprinkleParoches();
          g.player.char.pose = 'idle';
        },
        fact: ['The Kohen Gadol dips his finger in the dam and sprinkles it seven times toward the Paroches.', 'Vayikra 4:17; Zevachim 5:2'],
      },
      {
        text: 'Put the dam on the four horns of the golden Mizbeach', kind: 'use', at: { x: P.goldAltar.x, y: 3, z: P.goldAltar.z + 1.6 }, r: 2.2, icon: '💧', prompt: 'The horns of the golden Mizbeach',
        run: async (g) => {
          const t = g.world.goldAltarTop;
          await g.closeUp(new THREE.Vector3(t.x - 1.6, t.y + 1.1, t.z + 1.2), t.clone(), 1.4);
          const ids = ['NE', 'NW', 'SW', 'SE'];
          await g.minigames.hotspots({
            title: 'Go around the horns in order: North-East, North-West, South-West, South-East', ordered: true, small: true,
            spots: ids.map(id => ({ pos: g.goldHorn(id), icon: '💧', label: { NE: 'North-East', NW: 'North-West', SW: 'South-West', SE: 'South-East' }[id], id })),
            onSpot: async (s) => { g.goldAltarMark(s.id); g.audio.play('pour'); },
          });
          await g.releaseCam();
        },
        fact: ['Standing between the golden Mizbeach and the Menorah, he puts the dam on its horns: North-East, North-West, South-West, South-East.', 'Vayikra 4:18; Rambam, Maaseh HaKorbanot 5:14'],
      },
      {
        text: 'Go out and pour the rest of the dam on the WESTERN yesod of the outer Mizbeach — the side facing the Heichal', kind: 'use', at: at(P.westYesod), r: 2.4, icon: '🫗', prompt: 'Pour the rest of the dam',
        run: async (g) => { await g.pourYesod(P.westYesod); g.player.setHeld([]); },
        fact: ['The rest of the dam of the bulls that are burned is poured on the western yesod — the first side you reach when you come out of the Heichal.', 'Zevachim 5:2; Vayikra 4:18'],
      },
    ] : [
      {
        text: 'The Kohen Gadol does the avodah of the dam, inside the Heichal — watch!', kind: 'auto',
        run: async (g) => { await g.kgParAvodah(); },
        fact: ['The Kohen Gadol sprinkles the dam seven times toward the Paroches, puts it on the four horns of the golden Mizbeach, and pours the rest on the western yesod of the outer Mizbeach.', 'Vayikra 4:16-18; Zevachim 5:2'],
      },
    ];
    const end = [
      { ...partsStep('emurim'), text: 'Take the emurim of the bull — its fats — from the marble tables' },
      saltStep(),
      haktarahStep('Haktarah: place the emurim on the big fire (hold)'),
      {
        text: 'The rest of the bull is burned outside Yerushalayim — watch!', kind: 'auto',
        run: async (g) => { await g.burnOutside(); },
        fact: ['This bull is not eaten: the Kohanim carry it out on poles, outside Yerushalayim to the place of the ashes, and burn all of it there.', 'Vayikra 4:21; Zevachim 5:2'],
      },
    ];
    return [...start, ...inside, ...end];
  },
  thanks: { who: 'zaken', text: 'Thank you! Now all of Israel is forgiven. Even the greatest sages must say: "We made a mistake" — and fix it.' },
  outroFact: ['Rabbi Meir says the Sanhedrin brings one bull for all of Israel. Rabbi Yehuda says each tribe that sinned brings its own bull!', 'Vayikra 4:13-14; Horayot 1:5'],
};

export const LISHKOT = [ETZIM, NEZIRIM, METZORAIM, SHEMANYA, KLEI_SHIR, PAR_HELEM];

// What the people say when you come back after their mission (a different fact each time)
export const LISHKA_FACTS = {
  etzimKohen: [['Kohanim with a mum checked the wood here — every log with a worm was pasul for the Mizbeach.', 'Middot 2:5']],
  nazir: [['A Nazir may not drink wine, may not cut his hair, and may not become tamei from a dead body.', 'Bamidbar 6:3-6']],
  metzora: [['The metzora puts his head, his hand and his foot through Nikanor Gate — Rabbi Yehuda says all three at once!', 'Negaim 14:9']],
  shemanyaKohen: [['A hin is 12 logs.', 'Menachot 89a']],
  leviShir: [['On twelve days of the year, the chalil was played before the Mizbeach — like on Pesach and on Sukkot.', 'Arachin 2:3']],
  zaken: [
    ['The Sanhedrin also judged the Kohanim. A Kohen found fit dressed in white and joined his brothers — and they made a celebration!', 'Middot 5:4'],
    ['Every morning the Kohanim came into Lishkat HaGazit to say Shema together.', 'Tamid 5:1'],
    ['The Payis was held in the east of this hall, while a sage of the court sat in its west.', 'Yoma 25a'],
    ['The Sanhedrin sat in half a circle, so all the sages could see one another, with two scribes in front of them.', 'Sanhedrin 4:3'],
  ],
};
