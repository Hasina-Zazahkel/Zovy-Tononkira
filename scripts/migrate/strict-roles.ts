/**
 * Reclasse les rôles de tous les .cho vers les listes fermées (src/model/roles.ts).
 * Idempotent. Les valeurs sans équivalent perdent leur rôle (le membre reste) et sont listées.
 * Usage : npx tsx scripts/migrate/strict-roles.ts
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseChordPro, serializeChordPro } from '../../src/model/chordpro';
import { mapLegacyInstrument, mapLegacyVoice } from '../../src/model/roles';
import type { Assignment } from '../../src/model/types';

const DIR = join(new URL('../..', import.meta.url).pathname, 'data/songs');
const dropped: string[] = [];
let changed = 0;

function convert(list: Assignment[], map: (r: string) => string | undefined, where: string): Assignment[] {
  const out: Assignment[] = [];
  for (const a of list) {
    let role = a.role;
    if (role) {
      role = map(role);
      if (!role) dropped.push(`${where} : ${a.member === '*' ? 'Tous' : a.member} « ${a.role} » → rôle retiré`);
    }
    const next = role ? { member: a.member, role } : { member: a.member };
    if (!out.some((x) => x.member === next.member && x.role === next.role)) out.push(next);
  }
  return out;
}

for (const f of readdirSync(DIR).filter((x) => x.endsWith('.cho')).sort()) {
  const raw = readFileSync(join(DIR, f), 'utf8');
  const { song } = parseChordPro(f.slice(0, -4), raw);
  song.singers = convert(song.singers, mapLegacyVoice, song.id);
  song.musicians = convert(song.musicians, mapLegacyInstrument, song.id);
  for (const s of song.sections) if (s.voices) s.voices = convert(s.voices, mapLegacyVoice, `${song.id} § ${s.label ?? s.id}`);
  const out = serializeChordPro(song);
  if (out !== raw) { writeFileSync(join(DIR, f), out); changed++; }
}
console.log(`${changed} fichier(s) reclassé(s)`);
if (dropped.length) console.log(`Rôles sans équivalent (${dropped.length}) :\n- ${dropped.join('\n- ')}`);
