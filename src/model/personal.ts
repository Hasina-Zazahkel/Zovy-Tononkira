/**
 * Notes personnelles (surlignage + commentaire) : gardées sur l'appareil, jamais publiées.
 * Elles sont rattachées au TEXTE des lignes (pas à leur position) : si le morceau publié change,
 * la note retrouve ses lignes ; si elles ont disparu, elle passe dans « Notes à replacer ».
 */
import { HL_DEFAULT, viewLines, type HlColor } from './repeat';
import type { Song } from './types';

export interface PersonalNote {
  id: string;
  /** Texte des lignes visées (dans l'ordre). */
  lines: string[];
  /** Position (index de ligne dans tout le morceau) au moment de la création : départage les refrains répétés. */
  at: number;
  color: HlColor;
  note: string;
  updatedAt: number;
}

/** Notes d'un utilisateur, par morceau. */
export type NotesBook = Record<string, PersonalNote[]>;

/** Vue de lecture : chaque vue a ses propres notes perso. */
export type StageMode = 'chanteur' | 'musicien';
export type NotesByView = Record<StageMode, NotesBook>;

export interface FlatLine { key: string; line: number; text: string }

/** Marque d'une ligne (rendu). */
export interface PnMark { id: string; color: HlColor; note: string; first: boolean; last: boolean }

export const normText = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Toutes les lignes de paroles du morceau, avec la strophe (clé d'unité « sectionId.j ») et l'index de ligne. */
export function flatLines(song: Song): FlatLine[] {
  const out: FlatLine[] = [];
  for (const s of song.sections) {
    if (s.kind !== 'lyrics') continue;
    s.stanzas.forEach((st, j) => viewLines(st).forEach((v, line) => out.push({ key: `${s.id}.${j}`, line, text: v.text })));
  }
  return out;
}

export function resolveNotes(song: Song, notes: PersonalNote[]): { marks: Map<string, Map<number, PnMark>>; orphans: PersonalNote[] } {
  const flat = flatLines(song);
  const n = flat.map((f) => normText(f.text));
  const taken = new Set<number>();
  const marks = new Map<string, Map<number, PnMark>>();
  const orphans: PersonalNote[] = [];
  for (const note of [...notes].sort((a, b) => a.at - b.at)) {
    const want = note.lines.map(normText);
    let best = -1;
    for (let i = 0; i + want.length <= flat.length; i++) {
      let ok = true;
      for (let k = 0; k < want.length && ok; k++) {
        ok = n[i + k] === want[k] && flat[i + k].key === flat[i].key && !taken.has(i + k);
      }
      if (ok && (best < 0 || Math.abs(i - note.at) < Math.abs(best - note.at))) best = i;
    }
    if (best < 0 || !want.length) { orphans.push(note); continue; }
    want.forEach((_, k) => {
      const f = flat[best + k];
      taken.add(best + k);
      if (!marks.has(f.key)) marks.set(f.key, new Map());
      marks.get(f.key)!.set(f.line, { id: note.id, color: note.color, note: note.note, first: k === 0, last: k === want.length - 1 });
    });
  }
  return { marks, orphans };
}

/** Nouvelle note sur les lignes from..to d'une strophe. */
export function makeNote(song: Song, key: string, from: number, to: number, color: HlColor = HL_DEFAULT, note = '', id?: string): PersonalNote | null {
  const flat = flatLines(song);
  const [a, b] = from <= to ? [from, to] : [to, from];
  const start = flat.findIndex((f) => f.key === key && f.line === a);
  if (start < 0) return null;
  const lines = flat.slice(start, start + (b - a) + 1).filter((f) => f.key === key).map((f) => f.text);
  return { id: id ?? `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, lines, at: start, color, note: note.trim(), updatedAt: Date.now() };
}

/** Lecture d'un fichier d'export : { notes: { chanteur, musicien } } (ou ancien format = vue chanteur). */
export function parseNotesExport(raw: unknown): NotesByView {
  const notes = raw && typeof raw === 'object' && 'notes' in raw ? (raw as { notes: unknown }).notes : raw;
  if (notes && typeof notes === 'object' && !Array.isArray(notes) && ('chanteur' in notes || 'musicien' in notes)) {
    const n = notes as Record<string, unknown>;
    return { chanteur: n.chanteur ? parseNotesFile(n.chanteur) : {}, musicien: n.musicien ? parseNotesFile(n.musicien) : {} };
  }
  return { chanteur: parseNotesFile(notes), musicien: {} };
}

/** Lecture d'un carnet de notes (validation stricte). */
export function parseNotesFile(raw: unknown): NotesBook {
  const book = raw as Record<string, unknown>;
  if (!book || typeof book !== 'object' || Array.isArray(book)) throw new Error('fichier de notes invalide');
  const out: NotesBook = {};
  for (const [songId, list] of Object.entries(book)) {
    if (!Array.isArray(list)) throw new Error('fichier de notes invalide');
    out[songId] = list.map((x) => {
      if (!x || typeof x.id !== 'string' || !Array.isArray(x.lines) || typeof x.note !== 'string') throw new Error('fichier de notes invalide');
      return { id: x.id, lines: x.lines.map(String), at: Number(x.at) || 0, color: x.color ?? HL_DEFAULT, note: x.note, updatedAt: Number(x.updatedAt) || Date.now() };
    });
  }
  return out;
}

/** Fusion d'un import : les notes déjà présentes (même id) gardent la version la plus récente. */
export function mergeBooks(a: NotesBook, b: NotesBook): NotesBook {
  const out: NotesBook = { ...a };
  for (const [songId, list] of Object.entries(b)) {
    const cur = new Map((out[songId] ?? []).map((n) => [n.id, n]));
    for (const n of list) { const c = cur.get(n.id); if (!c || n.updatedAt > c.updatedAt) cur.set(n.id, n); }
    out[songId] = [...cur.values()];
  }
  return out;
}

export const countNotes = (b: NotesBook) => Object.values(b).reduce((n, l) => n + l.length, 0);
