/**
 * « REF: », « Ref.1 », « REFRAIN », « (refrain) »… dans les paroles → section REFRAIN (REFRAIN 1, 2…).
 * - marqueur suivi de paroles (même ligne ou lignes suivantes du paragraphe) : section REFRAIN sur ce paragraphe ;
 * - marqueur seul dans son paragraphe (« on rechante le refrain ») : le refrain précédent est recopié.
 * Le paragraphe suivant le refrain repart dans une section sans nom.
 *   tsx scripts/migrate/refrain.ts            → rapport (rien n'est écrit)
 *   tsx scripts/migrate/refrain.ts --write    → applique
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseChordPro, serializeChordPro } from '../../src/model/chordpro';
import { refrainMarker, applyRefrains } from '../../src/model/refrain';

const DIR = join(new URL('../..', import.meta.url).pathname, 'data/songs');
const write = process.argv.includes('--write');
let files = 0;
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.cho')).sort()) {
  const raw = readFileSync(join(DIR, f), 'utf8');
  const { song } = parseChordPro(f.slice(0, -4), raw);
  const { song: next, report } = applyRefrains(song);
  if (!report.length) continue;
  files++;
  console.log(`\n== ${f}`);
  report.forEach((r) => console.log('  ' + r));
  const out = serializeChordPro(next);
  if (write && out !== raw) writeFileSync(join(DIR, f), out);
}
console.log(`\n${files} morceau(x) concerné(s)${write ? ' — écrit' : ' — rapport seulement'}`);
void refrainMarker;
