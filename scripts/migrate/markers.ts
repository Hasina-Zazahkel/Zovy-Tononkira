/**
 * Marqueurs restés dans les paroles après la migration :
 *  - « X2 », « (X2) », « X4 », « BIS », « (BIS) » seuls sur une ligne → répétition (ligne, groupe de lignes ou paragraphe) ;
 *  - « BIS ALL » → note « Tout le morceau ×2 » sur la dernière ligne ;
 *  - consignes musicales entre parenthèses → repère interlude ou commentaire de ligne.
 *   tsx scripts/migrate/markers.ts [--write]
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseChordPro, serializeChordPro } from '../../src/model/chordpro';
import { toItems, withItems, type Item } from '../../src/model/edit';
import { formatLine, groupLines, parseLine } from '../../src/model/repeat';
import type { CueType } from '../../src/model/types';

const DIR = join(new URL('../..', import.meta.url).pathname, 'data/songs');
const write = process.argv.includes('--write');

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Nombre de répétitions si la ligne n'est qu'un marqueur (« X2 », « (BIS) », « BIS [×3] »…). */
function repMarker(line: string): number | null {
  const p = parseLine(line);
  if (p.open || p.close || p.note) return null;
  const t = p.text.trim();
  let m = /^\(?\s*[x×]\s*(\d+)\s*\)?$/i.exec(t) ?? /^\(?\s*(\d+)\s*[x×]\s*\)?$/i.exec(t);
  if (m) return Number(m[1]);
  if (/^\(?\s*bis\s*\)?$/i.test(t)) return p.times > 1 ? p.times : 2;
  return null;
}

type Instr = { cue: CueType; note: string } | { note: string; on: 'next' | 'prev' };
const INSTR: Record<string, Instr> = {
  '(folaka)': { cue: 'interlude', note: 'Folaka' },
  '(interludes)': { cue: 'interlude', note: '' },
  'instrumental': { cue: 'interlude', note: '' },
  '(tehaka)': { cue: 'interlude', note: 'Tehaka (claquements de mains)' },
  '(accapela)': { note: 'A cappella', on: 'next' },
  '(coupure musique)': { note: 'Coupure musique', on: 'next' },
  '(unisson)': { note: 'Unisson', on: 'next' },
  '(musique sautillant)': { note: 'Musique sautillante', on: 'next' },
  "(pas d'interlude)": { note: 'Enchaîner sans interlude', on: 'prev' },
};
const instr = (line: string) => INSTR[norm(parseLine(line).text).replace(/[’']/g, "'")];

const addNote = (line: string, note: string) => {
  const p = parseLine(line);
  return formatLine({ ...p, note: [p.note, note].filter(Boolean).join(' · ') });
};

let total = 0;
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.cho')).sort()) {
  const raw = readFileSync(join(DIR, f), 'utf8');
  const { song } = parseChordPro(f.slice(0, -4), raw);
  const items = toItems(song.sections);
  const report: string[] = [];
  const out: Item[] = [];
  let pendingNext: string | null = null; // commentaire à poser sur la prochaine ligne de paroles
  let bisAll = false;

  const lastStanza = () => [...out].reverse().find((x) => x.kind === 'stanza') as (Item & { kind: 'stanza' }) | undefined;
  const pushLine = (cur: string[], l: string) => {
    if (pendingNext) { cur.push(addNote(l, pendingNext)); pendingNext = null; } else cur.push(l);
  };

  for (const it of items) {
    if (it.kind !== 'stanza') { out.push(it); continue; }
    // « BIS » seul dans son paragraphe : le paragraphe précédent est recopié
    if (it.lines.length === 1 && repMarker(it.lines[0])) {
      const prev = lastStanza();
      const n = repMarker(it.lines[0])!;
      if (prev) { out.push({ kind: 'stanza', lines: [...prev.lines], repeat: n }); report.push(`« ${it.lines[0]} » seul → paragraphe précédent recopié ×${n}`); }
      else report.push(`« ${it.lines[0]} » seul, rien à recopier → retiré`);
      continue;
    }
    let cur: string[] = [];
    let seg = 0; // début du segment courant (après le dernier marqueur)
    let repeat = it.repeat;
    const flush = () => { if (cur.length) out.push({ kind: 'stanza', lines: cur, repeat }); cur = []; seg = 0; repeat = 1; };
    for (const l of it.lines) {
      if (/^bis\s+all$/i.test(parseLine(l).text.trim())) { bisAll = true; report.push(`« ${l} » → note « Tout le morceau ×2 » en dernière ligne`); continue; }
      const n = repMarker(l);
      if (n) {
        const a = seg, b = cur.length - 1;
        if (b < a) { report.push(`« ${l} » sans ligne au-dessus → retiré`); continue; }
        const covered = cur.slice(a, b + 1).map((x) => parseLine(x).text).join(' / ');
        if (cur.slice(a, b + 1).some((x) => { const p = parseLine(x); return p.open || p.close; })) {
          report.push(`« ${l} » : lignes déjà groupées, marqueur retiré (à vérifier) : ${covered}`);
        } else if (a === 0 && b === cur.length - 1 && it.lines.indexOf(l) === it.lines.length - 1) {
          repeat = Math.max(repeat, n);
          report.push(`« ${l} » en fin de paragraphe → paragraphe ×${n}`);
        } else if (a === b) {
          const p = parseLine(cur[a]);
          cur[a] = formatLine({ ...p, times: Math.max(p.times, n) });
          report.push(`« ${l} » → ligne ×${n} : ${covered}`);
        } else {
          cur = groupLines(cur, a, b, n);
          report.push(`« ${l} » → groupe de ${b - a + 1} lignes ×${n} : ${covered}`);
        }
        seg = cur.length;
        continue;
      }
      const ins = instr(l);
      if (ins && 'cue' in ins) {
        flush();
        out.push({ kind: 'cue', cue: ins.cue, note: ins.note });
        report.push(`« ${l} » → repère ${ins.cue}${ins.note ? ` « ${ins.note} »` : ''}`);
        continue;
      }
      if (ins) {
        if (ins.on === 'prev') {
          if (cur.length) cur[cur.length - 1] = addNote(cur[cur.length - 1], ins.note);
          else { const p = lastStanza(); if (p) p.lines[p.lines.length - 1] = addNote(p.lines[p.lines.length - 1], ins.note); }
        } else pendingNext = ins.note;
        report.push(`« ${l} » → commentaire « ${ins.note} » (${ins.on === 'prev' ? 'ligne précédente' : 'ligne suivante'})`);
        continue;
      }
      pushLine(cur, l);
    }
    flush();
  }
  if (bisAll) { const p = lastStanza(); if (p) p.lines[p.lines.length - 1] = addNote(p.lines[p.lines.length - 1], 'Tout le morceau ×2'); }
  if (!report.length) continue;
  total++;
  console.log(`\n== ${f}`);
  report.forEach((r) => console.log('  ' + r));
  const next = serializeChordPro(withItems(song, out).song);
  if (write && next !== raw) writeFileSync(join(DIR, f), next);
}
console.log(`\n${total} morceau(x) concerné(s)${write ? ' — écrit' : ' — rapport seulement'}`);
