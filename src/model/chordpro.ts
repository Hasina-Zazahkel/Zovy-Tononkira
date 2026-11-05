/**
 * ChordPro allégé Zovy — parse / serialize.
 *
 * Directives d'en-tête : {title} {artist} {key} {capo} {tags: a, b} {medley: a | b}
 *                        {singers: Hasina=lead, Misa=1ère voix} {musicians: Haja=guitare basse} {notes}
 * Directives de corps  : {section[: LABEL]}      nouvelle section de paroles
 *                        {intro[: note]} {interlude[: note]} {outro[: note]}  repère instrumental
 *                        ({instrumental: LIBELLÉ} : ancien format, classé automatiquement)
 *                        {voices: Hasina=lead, *=choeur}  voix de la section courante
 *                        {repeat: N}             la strophe qui suit est répétée N fois
 *                        « … [×N] » en fin de ligne : ligne répétée N fois
 *                        (si la section a déjà des paroles, en ouvre une nouvelle)
 * Ligne vide = fin de strophe.
 */
import { classifyCue } from './cues';
import { normalizeGroups } from './repeat';
import { parseYoutube } from './youtube';
import type { Assignment, CueType, Key, NoteRoot, Section, Song } from './types';

const DIRECTIVE_RE = /^\s*\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}\s*$/i;
const KEY_RE = /^(DO|RE|MI|FA|SOL|LA|SI)(b|#)?$/;

export interface ParseResult {
  song: Song;
  warnings: string[];
}

export function parseKey(raw: string): Key | undefined {
  const m = KEY_RE.exec(raw.trim());
  if (!m) return undefined;
  return m[2] ? { root: m[1] as NoteRoot, accidental: m[2] as Key['accidental'] } : { root: m[1] as NoteRoot };
}

export function formatKey(k: Key): string {
  return k.root + (k.accidental ?? '');
}

/** Affichage français : "SI♭", "FA♯". */
export function displayKey(k: Key): string {
  return k.root + (k.accidental === 'b' ? '♭' : k.accidental === '#' ? '♯' : '');
}

export function parseAssignments(raw: string): Assignment[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf('=');
      if (i < 0) return { member: s };
      const role = s.slice(i + 1).trim();
      return role ? { member: s.slice(0, i).trim(), role } : { member: s.slice(0, i).trim() };
    });
}

export function formatAssignments(v: Assignment[]): string {
  return v.map((x) => (x.role ? `${x.member}=${x.role}` : x.member)).join(', ');
}

const splitPipe = (v: string) => v.split('|').map((s) => s.trim()).filter(Boolean);

export function parseChordPro(id: string, text: string): ParseResult {
  const warnings: string[] = [];
  const song: Song = {
    id, title: '', artist: '', tags: [], medley: [], singers: [], musicians: [], sections: [],
  };
  let current: Section | null = null;
  let stanza: string[] | null = null;
  let pendingRepeat = 1;
  let n = 0;

  const newSection = (kind: Section['kind'], label?: string, cue?: CueType): Section => {
    const s: Section = { id: `s${n++}`, kind, stanzas: [] };
    if (cue) s.cue = cue;
    if (label) s.label = label;
    song.sections.push(s);
    stanza = null;
    return s;
  };
  const hasContent = (s: Section | null) => !!s && s.stanzas.some((st) => st.length > 0);
  const lyricsSection = (): Section => {
    if (!current || current.kind !== 'lyrics') current = newSection('lyrics');
    return current;
  };

  text.replace(/\r\n?/g, '\n').split('\n').forEach((line, idx) => {
    const d = DIRECTIVE_RE.exec(line);
    if (d) {
      const name = d[1].toLowerCase();
      const val = (d[2] ?? '').trim();
      switch (name) {
        case 'title': song.title = val; break;
        case 'artist': song.artist = val; break;
        case 'key': {
          const k = parseKey(val);
          if (k) song.key = k; else warnings.push(`l.${idx + 1} tonalité invalide "${val}"`);
          break;
        }
        case 'capo': {
          const c = Number.parseInt(val, 10);
          if (Number.isFinite(c)) song.capo = c; else warnings.push(`l.${idx + 1} capo invalide "${val}"`);
          break;
        }
        case 'tags': song.tags = val.split(',').map((s) => s.trim()).filter(Boolean); break;
        case 'medley': song.medley = splitPipe(val); break;
        case 'singers': song.singers = parseAssignments(val); break;
        case 'musicians': song.musicians = parseAssignments(val); break;
        case 'notes': song.notes = val; break;
        case 'youtube': {
          const id = parseYoutube(val);
          if (id) song.youtube = id; else warnings.push(`l.${idx + 1} lien YouTube invalide "${val}"`);
          break;
        }
        case 'section': current = newSection('lyrics', val || undefined); break;
        case 'intro': case 'interlude': case 'outro':
          newSection('instrumental', val || undefined, name); current = null; break;
        case 'instrumental':
          for (const c of classifyCue(val)) newSection('instrumental', c.note, c.cue);
          current = null;
          break;
        case 'repeat': {
          const r = Number.parseInt(val, 10);
          if (Number.isFinite(r) && r > 1) pendingRepeat = r; else warnings.push(`l.${idx + 1} répétition invalide "${val}"`);
          stanza = null;
          break;
        }
        case 'voices': {
          if (!current || current.kind !== 'lyrics' || hasContent(current)) current = newSection('lyrics');
          current.voices = parseAssignments(val);
          break;
        }
        default: warnings.push(`l.${idx + 1} directive inconnue {${name}}`);
      }
      return;
    }
    if (!line.trim()) { stanza = null; return; }
    const sec = lyricsSection();
    if (!stanza) {
      stanza = [];
      sec.stanzas.push(stanza);
      if (pendingRepeat > 1) {
        sec.repeats ??= [];
        sec.repeats[sec.stanzas.length - 1] = pendingRepeat;
        pendingRepeat = 1;
      }
    }
    stanza.push(line.replace(/\s+$/, ''));
  });

  // Répétitions : tableau dense (1 par défaut) ; groupes de lignes sous forme canonique
  for (const s of song.sections) {
    s.stanzas = s.stanzas.map(normalizeGroups);
    if (s.repeats) s.repeats = s.stanzas.map((_, i) => s.repeats![i] ?? 1);
  }
  // Sections de paroles vides sans label ni voix = bruit
  song.sections = song.sections.filter((s) => s.kind === 'instrumental' || s.label || s.voices || hasContent(s));
  song.sections.forEach((s, i) => { s.id = `s${i}`; });

  if (!song.title) warnings.push('titre manquant');
  if (!song.artist) warnings.push('artiste manquant');
  return { song, warnings };
}

export function serializeChordPro(song: Song): string {
  const out: string[] = [`{title: ${song.title}}`, ...(song.artist ? [`{artist: ${song.artist}}`] : [])];
  if (song.key) out.push(`{key: ${formatKey(song.key)}}`);
  if (song.capo != null) out.push(`{capo: ${song.capo}}`);
  if (song.tags.length) out.push(`{tags: ${song.tags.join(', ')}}`);
  if (song.medley.length) out.push(`{medley: ${song.medley.join(' | ')}}`);
  if (song.singers.length) out.push(`{singers: ${formatAssignments(song.singers)}}`);
  if (song.musicians.length) out.push(`{musicians: ${formatAssignments(song.musicians)}}`);
  if (song.notes) out.push(`{notes: ${song.notes}}`);
  if (song.youtube) out.push(`{youtube: ${song.youtube}}`);

  let prevKind: Section['kind'] | null = null;
  song.sections.forEach((s, i) => {
    out.push('');
    if (s.kind === 'instrumental') {
      const cue = s.cue ?? 'interlude';
      out.push(s.label ? `{${cue}: ${s.label}}` : `{${cue}}`);
    } else {
      // Une section de paroles qui suit une autre section de paroles est ouverte explicitement.
      // Après un {instrumental} ou en début de morceau, l'ouverture est implicite.
      const needsOpen = !!s.label || (i > 0 && prevKind === 'lyrics');
      if (needsOpen) out.push(s.label ? `{section: ${s.label}}` : '{section}');
      if (s.voices) out.push(`{voices: ${formatAssignments(s.voices)}}`);
      s.stanzas.forEach((st, j) => {
        if (j > 0) out.push('');
        const r = s.repeats?.[j] ?? 1;
        if (r > 1) out.push(`{repeat: ${r}}`);
        out.push(...st);
      });
    }
    prevKind = s.kind;
  });
  return out.join('\n') + '\n';
}
