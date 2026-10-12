// Lists every line the game reads aloud, in English and Hebrew, with the file id
// each recording must have. Writes voice/lines.json.
//   cd tools && npm i acorn acorn-walk && node voice-lines.mjs
// Re-run it after texts change: lines whose id is already in voice/manifest.json
// are recorded; the others still need a recording.
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = async (f) => import('data:text/javascript,' + encodeURIComponent(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const { cleanForSpeech, voiceId } = await load('js/voice.js');
const HE = (await load('js/he.js')).default.strings;

const spoken = new Set();
const keyName = (p) => p.key && (p.key.name || p.key.value);
for (const f of fs.readdirSync(path.join(ROOT, 'js'))) {
  if (!f.endsWith('.js') || f === 'he.js') continue;
  const ast = acorn.parse(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' });
  const lit = (n) => !n ? null
    : n.type === 'Literal' && typeof n.value === 'string' ? n.value
    : n.type === 'TemplateLiteral' && !n.expressions.length ? n.quasis[0].value.cooked : null;
  walk.full(ast, (n) => {
    // { text: '…' } in a dialog, an intro line, a place or a miracle (not a quest step, which has `kind`)
    if (n.type === 'ObjectExpression') {
      const keys = n.properties.map(keyName);
      for (const p of n.properties) {
        const k = keyName(p), v = lit(p.value);
        if (v && (k === 'thanks' || k === 'msg' || (k === 'text' && !keys.includes('kind')))) spoken.add(v);
        if (k === 'fact' && p.value.type === 'ArrayExpression' && lit(p.value.elements[0])) spoken.add(lit(p.value.elements[0]));
      }
    }
    // say(who, '…'), fact('…', src), ui.fact(title, '…', src), speak('…')
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression') {
      const name = n.callee.property.name, onUi = n.callee.object.property?.name === 'ui';
      const arg = name === 'say' ? n.arguments[1] : name === 'fact' ? n.arguments[onUi ? 1 : 0] : name === 'speak' ? n.arguments[0] : null;
      if (lit(arg)) spoken.add(lit(arg));
    }
  });
}
const out = { en: [], he: [] };
for (const en of [...spoken].sort()) {
  if (!/[A-Za-z]{2}/.test(en)) continue;
  const e = cleanForSpeech(en, 'en');
  if (e.split(' ').length >= 2) out.en.push({ id: voiceId(e), text: e });
  if (HE[en]) { const h = cleanForSpeech(HE[en], 'he'); if (h) out.he.push({ id: voiceId(h), text: h }); }
}
for (const l of ['en', 'he']) out[l] = [...new Map(out[l].map(x => [x.id, x])).values()];
fs.writeFileSync(path.join(ROOT, 'voice/lines.json'), JSON.stringify(out, null, 1));
console.log(`voice/lines.json: ${out.en.length} English lines, ${out.he.length} Hebrew lines`);
