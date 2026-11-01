/**
 * Compile data/songs/*.cho + data/setlists/*.json -> public/data/{songs,setlists,members}.json
 *   --format : réécrit les .cho au format canonique
 *   --check  : valide sans écrire (CI), code de sortie 1 si erreur
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseChordPro, serializeChordPro } from '../src/model/chordpro';
import { hasAdmin, parseMembers, type Member } from '../src/model/members';
import { INSTRUMENT_ROLES, VOICE_ROLES } from '../src/model/roles';
import type { Catalog, Setlist, Song } from '../src/model/types';

const ROOT = new URL('..', import.meta.url).pathname;
const SONGS_DIR = join(ROOT, 'data/songs');
const SETLISTS_DIR = join(ROOT, 'data/setlists');
const OUT_DIR = join(ROOT, 'public/data');
const args = new Set(process.argv.slice(2));
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const errors: string[] = [];
const warnings: string[] = [];
const songs: Song[] = [];
let formatted = 0;

for (const file of readdirSync(SONGS_DIR).filter((f) => f.endsWith('.cho')).sort()) {
  const id = file.slice(0, -4);
  if (!ID_RE.test(id)) errors.push(`${file} : nom de fichier invalide (slug a-z0-9-)`);
  const raw = readFileSync(join(SONGS_DIR, file), 'utf8');
  const { song, warnings: w } = parseChordPro(id, raw);
  w.forEach((m) => (m.includes('manquant') || m.includes('invalide') ? errors : warnings).push(`${file} : ${m}`));
  if (!song.sections.some((s) => s.stanzas.length)) warnings.push(`${file} : aucune parole`);
  const badRole = (list: { role?: string }[], allowed: readonly string[], what: string) =>
    list.filter((a) => a.role && !allowed.includes(a.role)).forEach((a) => errors.push(`${file} : ${what} « ${a.role} » hors liste`));
  badRole(song.singers, VOICE_ROLES, 'voix');
  badRole(song.musicians, INSTRUMENT_ROLES, 'instrument');
  song.sections.forEach((s) => s.voices && badRole(s.voices, VOICE_ROLES, 'voix de section'));
  songs.push(song);
  if (args.has('--format')) {
    const canon = serializeChordPro(song);
    if (canon !== raw) { writeFileSync(join(SONGS_DIR, file), canon); formatted++; }
  }
}

const ids = new Set(songs.map((s) => s.id));
const setlists: Setlist[] = readdirSync(SETLISTS_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => {
    const sl = JSON.parse(readFileSync(join(SETLISTS_DIR, f), 'utf8')) as Setlist;
    sl.parts.forEach((p) => p.songIds.forEach((id) => {
      if (!ids.has(id)) errors.push(`${f} : "${id}" introuvable dans data/songs`);
    }));
    return sl;
  });

// Membres (connexion) : facultatif ; liste vide = pas de page de connexion
let members: Member[] = [];
const MEMBERS_FILE = join(ROOT, 'data/members.json');
if (existsSync(MEMBERS_FILE)) {
  try {
    members = parseMembers(JSON.parse(readFileSync(MEMBERS_FILE, 'utf8')));
    if (!hasAdmin(members)) errors.push('members.json : aucun admin');
  } catch (e) { errors.push(String(e instanceof Error ? e.message : e)); }
}

warnings.forEach((w) => console.warn(`⚠ ${w}`));
errors.forEach((e) => console.error(`✖ ${e}`));
console.log(`${songs.length} morceaux, ${setlists.length} setlist(s), ${warnings.length} avertissement(s), ${errors.length} erreur(s)` +
  (args.has('--format') ? `, ${formatted} fichier(s) reformaté(s)` : ''));

if (errors.length) process.exit(1);
if (!args.has('--check')) {
  mkdirSync(OUT_DIR, { recursive: true });
  const catalog: Catalog = { version: 1, builtAt: new Date().toISOString(), songs };
  writeFileSync(join(OUT_DIR, 'songs.json'), JSON.stringify(catalog));
  writeFileSync(join(OUT_DIR, 'setlists.json'), JSON.stringify(setlists));
  writeFileSync(join(OUT_DIR, 'members.json'), JSON.stringify(members));
  console.log(`→ public/data/songs.json (${(JSON.stringify(catalog).length / 1024).toFixed(0)} Ko)`);
}
