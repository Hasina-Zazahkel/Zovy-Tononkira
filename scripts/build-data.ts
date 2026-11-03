/**
 * Compile data/songs/*.cho + data/setlists/*.json -> public/data/{songs,setlists,members}.json
 *   --format : réécrit les .cho au format canonique
 *   --check  : valide sans écrire (CI), code de sortie 1 si erreur
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { parseChordPro, serializeChordPro } from '../src/model/chordpro';
import { hasAdmin, parseMembers, type Member } from '../src/model/members';
import { EDITIONS } from '../src/edition';
import { parseHideBook, type HideBook } from '../src/model/hide';
import { INSTRUMENT_ROLES, VOICE_ROLES } from '../src/model/roles';
import type { Catalog, Setlist, Song } from '../src/model/types';
import { parseTrackFile, sortTracks, trackNames, trackSlug, type AudioTrack } from '../src/model/audio';

const ROOT = new URL('..', import.meta.url).pathname;
// Édition et dossier de données (le dépôt d'une autre édition peut fournir ses propres données)
const EDITION = EDITIONS[process.env.EDITION ?? 'zovy'] ?? EDITIONS.zovy;
const DATA_DIR = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(ROOT, 'data');
const SONGS_DIR = join(DATA_DIR, 'songs');
const SETLISTS_DIR = join(DATA_DIR, 'setlists');
const OUT_DIR = join(ROOT, EDITION.publicDir, 'data');
const args = new Set(process.argv.slice(2));
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const errors: string[] = [];
const warnings: string[] = [];
const songs: Song[] = [];
let formatted = 0;

for (const file of (existsSync(SONGS_DIR) ? readdirSync(SONGS_DIR) : []).filter((f) => f.endsWith('.cho')).sort()) {
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
const setlists: Setlist[] = (existsSync(SETLISTS_DIR) ? readdirSync(SETLISTS_DIR) : [])
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
const MEMBERS_FILE = join(DATA_DIR, 'members.json');
if (existsSync(MEMBERS_FILE)) {
  try {
    members = parseMembers(JSON.parse(readFileSync(MEMBERS_FILE, 'utf8')));
    if (!hasAdmin(members)) errors.push('members.json : aucun admin');
  } catch (e) { errors.push(String(e instanceof Error ? e.message : e)); }
}

// Pistes audio (facultatif) : data/audio/<id>/<piste>.<ext>, recopiées telles quelles dans le site
const AUDIO_DIR = join(DATA_DIR, 'audio');
const audioCopies: { from: string; to: string }[] = [];
if (existsSync(AUDIO_DIR)) {
  const names = trackNames(EDITION.voices, EDITION.audioTracks);
  for (const id of readdirSync(AUDIO_DIR).sort()) {
    const dir = join(AUDIO_DIR, id);
    if (!statSync(dir).isDirectory()) continue;
    const song = songs.find((s) => s.id === id);
    if (!song) { warnings.push(`audio/${id} : morceau introuvable (ignoré)`); continue; }
    const tracks: AudioTrack[] = [];
    for (const f of readdirSync(dir).sort()) {
      if (f.startsWith('.')) continue;
      const t = parseTrackFile(f, names);
      if (!t) { warnings.push(`audio/${id}/${f} : piste inconnue (attendu ${names.map((n) => `${trackSlug(n)}.mp3`).join(', ')})`); continue; }
      if (tracks.some((x) => x.track === t.track)) { warnings.push(`audio/${id}/${f} : piste ${t.track} en double (ignorée)`); continue; }
      const buf = readFileSync(join(dir, f));
      const file = `data/audio/${id}/${f}`;
      tracks.push({ track: t.track, file, size: buf.length, v: createHash('sha1').update(buf).digest('hex').slice(0, 10) });
      audioCopies.push({ from: join(dir, f), to: join(ROOT, EDITION.publicDir, file) });
    }
    if (tracks.length) song.audio = sortTracks(tracks, names);
  }
}

// Vue musicien : lignes masquées par défaut (facultatif)
let musician: HideBook = {};
const MUSICIAN_FILE = join(DATA_DIR, 'musician.json');
if (existsSync(MUSICIAN_FILE)) {
  try {
    musician = parseHideBook(JSON.parse(readFileSync(MUSICIAN_FILE, 'utf8')));
    for (const id of Object.keys(musician)) if (!ids.has(id)) warnings.push(`musician.json : "${id}" introuvable (ignoré)`);
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
  writeFileSync(join(OUT_DIR, 'musician.json'), JSON.stringify(musician));
  rmSync(join(OUT_DIR, 'audio'), { recursive: true, force: true });
  for (const c of audioCopies) { mkdirSync(join(c.to, '..'), { recursive: true }); copyFileSync(c.from, c.to); }
  if (audioCopies.length) console.log(`→ ${audioCopies.length} piste(s) audio`);
  console.log(`→ public/data/songs.json (${(JSON.stringify(catalog).length / 1024).toFixed(0)} Ko)`);
}
