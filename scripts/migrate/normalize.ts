/**
 * Normalisation idempotente de tous les .cho :
 * - rôles reclassés vers les listes fermées (src/model/roles.ts) ; sans équivalent → rôle retiré (listé)
 * - {capo: N} fusionné dans le commentaire {notes} ("Capo N"), affiché à côté de la tonalité
 * - nettoyage structurel (src/model/cleanup.ts) : repères isolés, MUSIQUE, sections vides, interludes consécutifs
 * Usage : npx tsx scripts/migrate/normalize.ts
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseChordPro, serializeChordPro } from '../../src/model/chordpro';
import { cleanupSong } from '../../src/model/cleanup';
import { mapLegacyInstrument, mapLegacyVoice } from '../../src/model/roles';
import type { Assignment } from '../../src/model/types';

const DIR = join(new URL('../..', import.meta.url).pathname, 'data/songs');
const dropped: string[] = [];
const repeatNotes: string[] = [];
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
  const song = cleanupSong(parseChordPro(f.slice(0, -4), raw).song, (m) => repeatNotes.push(m));
  song.singers = convert(song.singers, mapLegacyVoice, song.id);
  song.musicians = convert(song.musicians, mapLegacyInstrument, song.id);
  for (const s of song.sections) if (s.voices) s.voices = convert(s.voices, mapLegacyVoice, `${song.id} § ${s.label ?? s.id}`);
  if (song.capo != null) {
    song.notes = [`Capo ${song.capo}`, song.notes].filter(Boolean).join(' · ');
    delete song.capo;
  }
  const out = serializeChordPro(song);
  if (out !== raw) { writeFileSync(join(DIR, f), out); changed++; }
}
console.log(`${changed} fichier(s) reclassé(s)`);
if (repeatNotes.length) console.log(`Répétitions à vérifier (${repeatNotes.length}) :\n- ${repeatNotes.join('\n- ')}`);
if (dropped.length) console.log(`Rôles sans équivalent (${dropped.length}) :\n- ${dropped.join('\n- ')}`);
