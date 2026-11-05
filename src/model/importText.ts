/**
 * Import d'une ou plusieurs chansons à partir d'un texte collé.
 *
 * En-tête (lignes facultatives, dans n'importe quel ordre) — deux écritures acceptées :
 *   numérotée :  1 - Titre / 2 - Artiste / 3 - Voix / 4 - Musique / 5 - Ton / Commentaire / 6 - Paroles
 *   étiquettes : Titre : … / Artiste : … / Voix : … / Musique : … / Ton : … / Note : …
 * Corps :
 *   ligne vide                     → nouveau paragraphe
 *   Intro|Interlude|Outro - note   → repère instrumental
 *   [NOM]                          → nouvelle section (puis « Voix : … » facultatif)
 *   texte - commentaire x2         → ligne (commentaire et répétition facultatifs)
 *   texte<TAB>x2                   → paragraphe répété ×2 (aussi : « x2 » seul sur la ligne suivante)
 * Plusieurs chansons : séparées par une ligne « --- ».
 */
import { serializeChordPro } from './chordpro';
import { cleanNote } from './cues';
import { withItems, type Item } from './edit';
import { formatLine } from './repeat';
import { parseYoutube } from './youtube';
import { convertRefrainItems } from './refrain';
import { INSTRUMENT_ROLES, mapLegacyInstrument, mapLegacyVoice, VOICE_ROLES } from './roles';
import type { Accidental, Assignment, CueType, Key, NoteRoot, Song } from './types';

export interface ImportResult {
  song: Song;
  /** Ce qui a été reconnu (compte rendu positif). */
  found: string[];
  /** Ce qui demande une vérification. */
  warnings: string[];
  /** Erreurs bloquantes (pas de titre, pas de paroles…). */
  errors: string[];
  /** Morceau existant de même titre et même artiste. */
  duplicateOf?: string;
}

export const IMPORT_TEMPLATE = `Titre :
Artiste :
Voix : Prénom - Lead / Prénom - Soprano / Prénom - Alto
Musique : Prénom - Guitare / Prénom - Guitare basse
Ton : Do / Capo 5
YouTube :

Intro - commentaire

Ligne 1 - commentaire
Ligne 2 x2
Ligne 3
x2

[×2 Ligne A (groupe de lignes répété)
Ligne B]

[REFRAIN]
Voix : Tous - Chœur
Ligne 4
Ligne 5

Interlude - commentaire

Ligne 6

Outro
`;

/** Exemple affiché dans la case d'import (aide-mémoire du format). */
export const IMPORT_EXAMPLE = `Titre : MILA TSIKY
Artiste : Ma'zik'
Voix : Misa - Soprano / Hasina - Lead / Toky - Ténor
Musique : Haja - Guitare / Toky - Guitare basse
Ton : Do / Capo 5

Intro - guitare seule

Ilay tsiky avy aminao - Misa seule
No mba zavatra tsy foiko x2
x2

[REFRAIN]
Voix : Tous - Chœur
Ka ny zavatra ataoko
Toa manjary kilalaoko - doucement x2

Interlude - guitare

Ka rehefa hita fa matroka
Ny vodilanitra

Outro - comme l'intro

---
(morceau suivant…)`;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function slugify(s: string): string {
  return fold(s).replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'sans-titre';
}

/* ---------- Tonalité ---------- */
const NOTE_WORDS: Record<string, NoteRoot> = { do: 'DO', ut: 'DO', re: 'RE', mi: 'MI', fa: 'FA', sol: 'SOL', la: 'LA', si: 'SI', c: 'DO', d: 'RE', e: 'MI', f: 'FA', g: 'SOL', a: 'LA', b: 'SI' };

export function parseKeyLoose(raw: string): Key | undefined {
  const t = fold(raw).replace(/\s+(majeur|mineur|maj|min|m)$/, '').replace(/\s+/g, ' ');
  const m = /^(do|ut|re|mi|fa|sol|la|si|[a-g])\s*(b|bemol|♭|#|♯|diese|d)?$/.exec(t);
  if (!m) return undefined;
  const root = NOTE_WORDS[m[1]];
  const acc: Accidental | undefined = !m[2] ? undefined : /^(b|bemol|♭)$/.test(m[2]) ? 'b' : '#';
  return acc ? { root, accidental: acc } : { root };
}

/* ---------- Voix / instruments ---------- */
function parseRoles(raw: string, kind: 'voice' | 'inst', warn: (m: string) => void): Assignment[] {
  const list = kind === 'voice' ? VOICE_ROLES : INSTRUMENT_ROLES;
  const map = kind === 'voice' ? mapLegacyVoice : mapLegacyInstrument;
  const out: Assignment[] = [];
  for (const part of raw.split(/\s*[/,;]\s*/).map((s) => s.trim()).filter(Boolean)) {
    const m = /^(.+?)\s*[-–:=]\s*(.+)$/.exec(part);
    let member = (m ? m[1] : part).trim();
    const roleRaw = m ? m[2].trim() : '';
    if (/^(tous|reste|tout le monde|\*)$/i.test(member)) member = '*';
    else member = member.charAt(0).toUpperCase() + member.slice(1);
    if (!roleRaw) { out.push({ member }); continue; }
    const exact = list.find((r) => fold(r) === fold(roleRaw));
    const role = exact ?? map(roleRaw);
    if (!role) {
      warn(`${kind === 'voice' ? 'Voix' : 'Instrument'} « ${roleRaw} » (${member === '*' ? 'Tous' : member}) non reconnu${kind === 'voice' ? 'e' : ''} : à choisir dans l'éditeur`);
      out.push({ member });
    } else {
      if (!exact && fold(role) !== fold(roleRaw)) warn(`« ${roleRaw} » (${member === '*' ? 'Tous' : member}) compris comme « ${role} »`);
      out.push({ member, role });
    }
  }
  return out;
}

/* ---------- Lignes de paroles ---------- */
const REP_ONLY = /^\(?\s*(?:[x×]\s*(\d+)|(bis))\s*\)?$/i;
const REP_END = /\s+\(?\s*[x×]\s*(\d+)\s*\)?\s*$|\s+\(?(bis)\)?\s*$/i;

/** « texte - commentaire x2 » → ligne au format canonique. */
function parseLyricLine(raw: string): string {
  let t = raw.replace(/[{}]/g, '').trim();
  let times = 1;
  const r = REP_END.exec(t);
  if (r) { times = r[2] ? 2 : Number(r[1]); t = t.slice(0, r.index).trim(); }
  let note = '';
  const sep = t.lastIndexOf(' - ');
  if (sep > 0) { note = t.slice(sep + 3).trim(); t = t.slice(0, sep).trim(); }
  // « texte x2 - commentaire » : la répétition peut aussi précéder le commentaire
  const r2 = REP_END.exec(t);
  if (r2 && times === 1) { times = r2[2] ? 2 : Number(r2[1]); t = t.slice(0, r2.index).trim(); }
  return formatLine({ text: t, times: times > 1 ? times : 1, note });
}

/* ---------- En-tête ---------- */
type Field = 'title' | 'artist' | 'voices' | 'musicians' | 'key' | 'notes' | 'lyrics' | 'youtube';
const LABELS: [RegExp, Field][] = [
  [/^titre$/, 'title'], [/^(artiste|auteur|interprete|groupe)$/, 'artist'],
  [/^(voix|chanteurs?|chant)$/, 'voices'], [/^(musique|musiciens?|instruments?)$/, 'musicians'],
  [/^(ton|tonalite|cle)$/, 'key'], [/^(note|notes|commentaire|remarque)$/, 'notes'], [/^paroles?$/, 'lyrics'], [/^(youtube|original|lien|video)$/, 'youtube'],
];
const NUMBERED: Field[] = ['title', 'artist', 'voices', 'musicians', 'key', 'lyrics'];

function headerField(line: string): { field: Field; value: string } | null {
  const lab = /^([A-Za-zÀ-ÿ ]{2,20})\s*:\s*(.*)$/.exec(line);
  if (lab) {
    const f = LABELS.find(([re]) => re.test(fold(lab[1])));
    if (f) return { field: f[1], value: lab[2].trim() };
  }
  const num = /^\s*([1-6])\s*[-–.)]\s*(.*)$/.exec(line);
  if (num) return { field: NUMBERED[Number(num[1]) - 1], value: num[2].trim() };
  return null;
}

/** Découpe le texte collé en chansons (séparateur : ligne « --- »). */
export function splitSongs(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split(/^\s*-{3,}\s*$/m).map((s) => s.trim()).filter(Boolean);
}

export function parseImport(text: string, existing: Song[] = [], opts: { artist?: boolean } = {}): ImportResult[] {
  const taken = new Set(existing.map((s) => s.id));
  return splitSongs(text).map((chunk) => {
    const r = parseOne(chunk, existing, taken, opts.artist ?? true);
    taken.add(r.song.id);
    return r;
  });
}

function parseOne(chunk: string, existing: Song[], taken: Set<string>, withArtist = true): ImportResult {
  const warnings: string[] = [];
  const found: string[] = [];
  const errors: string[] = [];
  const warn = (m: string) => warnings.push(m);
  const lines = chunk.split('\n');

  const head = { youtube: undefined as string | undefined, title: '', artist: '', voices: [] as Assignment[], musicians: [] as Assignment[], key: undefined as Key | undefined, notes: '' };
  let i = 0;
  // En-tête : tant que les lignes sont des champs reconnus (ou vides)
  for (; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    const h = headerField(l);
    if (!h) break;
    if (h.field === 'lyrics') {
      // « 6 - Paroles de la chanson » = simple intitulé ; sinon c'est déjà la 1re ligne de paroles
      if (h.value && !/^paroles?( de la chanson)?\s*:?$/i.test(h.value)) { lines[i] = h.value; break; }
      continue;
    }
    if (h.field === 'youtube') {
      head.youtube = parseYoutube(h.value);
      if (h.value && !head.youtube) warn(`Lien YouTube « ${h.value} » non reconnu`);
      continue;
    }
    if (h.field === 'title') head.title = h.value;
    else if (h.field === 'artist') head.artist = h.value;
    else if (h.field === 'voices') head.voices = parseRoles(h.value, 'voice', warn);
    else if (h.field === 'musicians') head.musicians = parseRoles(h.value, 'inst', warn);
    else if (h.field === 'notes') head.notes = [head.notes, h.value].filter(Boolean).join(' · ');
    else if (h.field === 'key') {
      const [k, ...rest] = h.value.split(/\s*\/\s*/);
      const key = k ? parseKeyLoose(k) : undefined;
      if (k && !key) { warn(`Tonalité « ${k} » non reconnue`); rest.unshift(k); }
      head.key = key;
      if (rest.length) head.notes = [rest.join(' / '), head.notes].filter(Boolean).join(' · ');
    }
  }

  // Corps
  const items: Item[] = [];
  let stanza: (Item & { kind: 'stanza' }) | null = null;
  let lastStanza: (Item & { kind: 'stanza' }) | null = null;
  let lastSection: (Item & { kind: 'section' }) | null = null;
  const close = () => { stanza = null; };
  for (; i < lines.length; i++) {
    const raw = lines[i];
    const l = raw.trim();
    if (!l) { close(); continue; }
    let m: RegExpExecArray | null;
    if ((m = /^(intro|interlude|outro)\b\s*(?:[-–:]\s*(.*))?$/i.exec(l))) {
      close();
      items.push({ kind: 'cue', cue: m[1].toLowerCase() as CueType, note: cleanNote(m[2] ?? '') ?? '' });
      continue;
    }
    if ((m = /^\[\s*([^\]]+?)\s*\]$/.exec(l) ?? /^§\s*(.+)$/.exec(l))) {
      if (REP_ONLY.test(m[1]) || /^[x×]\s*\d+\s+\S/i.test(m[1]) || m[1].startsWith('«') || /^(jaune|vert|bleu|rose|violet)\s+\S/i.test(m[1])) { /* « [x2] » : traité plus bas */ } else {
        close();
        lastSection = { kind: 'section', label: m[1].toUpperCase(), voices: [] };
        items.push(lastSection);
        continue;
      }
    }
    if ((m = /^voix\s*:\s*(.*)$/i.exec(l))) {
      if (!lastSection || lastStanza && items.indexOf(lastStanza) > items.indexOf(lastSection)) {
        lastSection = { kind: 'section', label: '', voices: [] };
        close();
        items.push(lastSection);
      }
      lastSection.voices = parseRoles(m[1], 'voice', warn);
      continue;
    }
    const repOnly = REP_ONLY.exec(l.replace(/^\[|\]$/g, ''));
    if (repOnly) {
      const n = repOnly[2] ? 2 : Number(repOnly[1]);
      if (lastStanza) lastStanza.repeat = Math.max(lastStanza.repeat, n);
      else warn(`« ${l} » sans paragraphe au-dessus : ignoré`);
      close();
      continue;
    }
    // Tabulation (ou 4 espaces et plus) puis xN en fin de ligne : paragraphe répété
    let paraRepeat = 0;
    const tab = /^(.*?)(?:\t+|\s{4,})\s*\(?\s*(?:[x×]\s*(\d+)|(bis))\s*\)?\s*$/i.exec(raw);
    let content = raw;
    if (tab && tab[1].trim()) { paraRepeat = tab[3] ? 2 : Number(tab[2]); content = tab[1]; }
    if (!stanza) {
      stanza = { kind: 'stanza', lines: [], repeat: 1 };
      items.push(stanza);
      lastStanza = stanza;
    }
    stanza.lines.push(parseLyricLine(content));
    if (paraRepeat > 1) { stanza.repeat = Math.max(stanza.repeat, paraRepeat); close(); }
  }

  // Morceau
  const title = head.title.replace(/[{}]/g, '').trim().toUpperCase();
  const artist = head.artist.replace(/[{}]/g, '').trim().toUpperCase();
  let id = slugify(title || 'nouveau-morceau');
  for (let n = 2; taken.has(id); n++) id = `${slugify(title || 'nouveau-morceau')}-${n}`;
  const base: Song = {
    id, title, artist, tags: [], medley: [], singers: head.voices, musicians: head.musicians, sections: [],
    ...(head.key ? { key: head.key } : {}), ...(head.notes ? { notes: head.notes.replace(/[{}]/g, '') } : {}), ...(head.youtube ? { youtube: head.youtube } : {}),
  };
  const conv = convertRefrainItems(items);
  const { song } = withItems(base, conv.items);

  if (!title) errors.push('Titre manquant');
  if (!artist && withArtist) errors.push('Artiste manquant');
  const nLines = song.sections.reduce((n, s) => n + s.stanzas.flat().length, 0);
  if (!nLines) errors.push('Aucune ligne de paroles');

  if (title) found.push(`Titre : ${title}`);
  if (artist && withArtist) found.push(`Artiste : ${artist}`);
  if (song.key) found.push(`Tonalité : ${song.key.root}${song.key.accidental ?? ''}`);
  if (song.notes) found.push(`Commentaire : ${song.notes}`);
  if (song.youtube) found.push('Lien YouTube');
  if (song.singers.length) found.push(`${song.singers.length} chanteur${song.singers.length > 1 ? 's' : ''}`);
  if (song.musicians.length) found.push(`${song.musicians.length} musicien${song.musicians.length > 1 ? 's' : ''}`);
  const stanzas = song.sections.reduce((n, s) => n + s.stanzas.length, 0);
  const cues = song.sections.filter((s) => s.kind === 'instrumental').length;
  const named = song.sections.filter((s) => s.kind === 'lyrics' && s.label).length;
  if (conv.report.length) found.push(`${conv.report.length} refrain${conv.report.length > 1 ? 's' : ''} (REF) reconnu${conv.report.length > 1 ? 's' : ''}`);
  const lineReps = song.sections.flatMap((s) => s.stanzas.flat()).filter((l) => /\[×\d+\]/.test(l)).length;
  const paraReps = song.sections.flatMap((s) => s.repeats ?? []).filter((r) => r > 1).length;
  const groups = song.sections.flatMap((s) => s.stanzas.flat()).filter((l) => /^\[×\d+/.test(l)).length;
  const noteGroups = song.sections.flatMap((s) => s.stanzas.flat()).filter((l) => /^\[(jaune|vert|bleu|rose|violet)\b/.test(l)).length;
  const notes = song.sections.flatMap((s) => s.stanzas.flat()).filter((l) => / \/\/ /.test(l)).length;
  if (nLines) found.push(`${stanzas} paragraphe${stanzas > 1 ? 's' : ''}, ${nLines} ligne${nLines > 1 ? 's' : ''}`);
  if (cues) found.push(`${cues} intro / interlude / outro`);
  if (named) found.push(`${named} section${named > 1 ? 's' : ''} nommée${named > 1 ? 's' : ''}`);
  if (lineReps) found.push(`${lineReps} ligne${lineReps > 1 ? 's' : ''} répétée${lineReps > 1 ? 's' : ''}`);
  if (paraReps) found.push(`${paraReps} paragraphe${paraReps > 1 ? 's' : ''} répété${paraReps > 1 ? 's' : ''}`);
  if (groups) found.push(`${groups} groupe${groups > 1 ? 's' : ''} de lignes répété${groups > 1 ? 's' : ''}`);
  if (noteGroups) found.push(`${noteGroups} surlignage${noteGroups > 1 ? 's' : ''}`);
  if (notes) found.push(`${notes} commentaire${notes > 1 ? 's' : ''} de ligne`);

  const dup = existing.find((s) => fold(s.title) === fold(title) && (!withArtist || fold(s.artist) === fold(artist)));
  if (dup) warnings.unshift(withArtist ? `Existe déjà : « ${dup.title} » (${dup.artist})` : `Existe déjà : « ${dup.title} »`);
  return { song, found, warnings, errors, ...(dup ? { duplicateOf: dup.id } : {}) };
}

/** Modèle / exemple sans les rubriques inutiles à l'édition (artiste, musiciens). */
export function trimTemplate(t: string, opts: { artist: boolean; instruments: boolean }): string {
  return t.split('\n').filter((l) => !(!opts.artist && /^Artiste :/.test(l)) && !(!opts.instruments && /^Musique :/.test(l))).join('\n');
}

/** Contenu .cho canonique d'un import (pour enregistrement). */
export const importToCho = (r: ImportResult) => serializeChordPro(r.song);
