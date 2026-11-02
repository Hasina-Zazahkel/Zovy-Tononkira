/**
 * Modèle d'édition des paroles : une liste plate d'éléments, dans l'ordre de lecture.
 * C'est la même structure que le corps d'un fichier .cho, ce qui rend les conversions triviales :
 *   Song.sections ⇄ Item[] ⇄ corps .cho ⇄ notation « texte » de l'éditeur.
 */
import { formatAssignments, parseChordPro, serializeChordPro } from './chordpro';
import { collapseGroup, formatLine, parseLine, viewLines } from './repeat';
import { convertRefrainItems } from './refrain';
import type { Assignment, CueType, Section, Song } from './types';

export type Item =
  | { kind: 'cue'; cue: CueType; note: string }
  | { kind: 'section'; label: string; voices: Assignment[] }
  | { kind: 'stanza'; lines: string[]; repeat: number };

let seq = 0;
/** Identifiant stable côté interface (clé de rendu), jamais sérialisé. */
export type Keyed<T> = T & { uid: number };
export const keyed = <T extends Item>(i: T): Keyed<T> => ({ ...i, uid: ++seq });

export function toItems(sections: Section[]): Item[] {
  const out: Item[] = [];
  let prev: Section['kind'] | null = null;
  for (const s of sections) {
    if (s.kind === 'instrumental') {
      out.push({ kind: 'cue', cue: s.cue ?? 'interlude', note: s.label ?? '' });
    } else {
      // Une section de paroles est ouverte explicitement si elle a un nom/des voix, ou si elle suit une autre section de paroles
      if (s.label || s.voices?.length || prev === 'lyrics') out.push({ kind: 'section', label: s.label ?? '', voices: s.voices ?? [] });
      s.stanzas.forEach((st, j) => out.push({ kind: 'stanza', lines: [...st], repeat: s.repeats?.[j] ?? 1 }));
    }
    prev = s.kind;
  }
  return out;
}

/** Corps .cho (sans en-tête) à partir des éléments. Lignes vides et paragraphes vides ignorés. */
export function itemsToBody(items: Item[]): string {
  const out: string[] = [];
  for (const it of items) {
    if (it.kind === 'cue') out.push(`{${it.cue}${it.note.trim() ? `: ${it.note.trim()}` : ''}}`, '');
    else if (it.kind === 'section') {
      // L'en-tête de section reste collé à son premier paragraphe
      out.push(it.label.trim() ? `{section: ${it.label.trim()}}` : '{section}');
      if (it.voices.length) out.push(`{voices: ${formatAssignments(it.voices)}}`);
    } else {
      const lines = it.lines.map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim());
      if (!lines.length) continue;
      if (it.repeat > 1) out.push(`{repeat: ${it.repeat}}`);
      out.push(...lines, '');
    }
  }
  return out.join('\n');
}

/** Applique des éléments à un morceau (passage par le format canonique : ce qui est enregistré = ce qui est affiché). */
export function withItems(song: Song, items: Item[]): { song: Song; warnings: string[] } {
  const head = serializeChordPro({ ...song, sections: [] });
  const { song: parsed, warnings } = parseChordPro(song.id, `${head}\n${itemsToBody(items)}`);
  return { song: parsed, warnings };
}

/* ---------- Notation « texte » (mode Texte) ---------- */

export const TEXT_HELP = [
  ['Ligne vide', 'nouveau paragraphe'],
  ['… [×4]', 'en fin de ligne : ligne répétée'],
  ['… // commentaire', 'en fin de ligne : commentaire discret pour cette ligne'],
  ['[×2]', 'seul, avant un paragraphe : paragraphe répété'],
  ['[×2 … ]', 'quelques lignes répétées : « [×2 » au début de la 1re, « ] » à la fin de la dernière ; commentaire : [×2 «chœur seul» …'],
  ['[vert «…» … ]', 'lignes surlignées (jaune, vert, bleu, rose, violet) + commentaire facultatif : [vert «Misa seule» 1re ligne … dernière ligne]'],
  ['[intro: …] [interlude: …] [outro: …]', 'repère instrumental + commentaire'],
  ['[section: NOM]', 'nouvelle section'],
  ['REF: (ou Ref.1, REFRAIN)', 'en tête de paragraphe : section REFRAIN ; seul dans son paragraphe : le refrain est recopié'],
  ['[voix: Hasina=Lead, Misa=Soprano]', 'voix de la section'],
] as const;

export function bodyToText(body: string): string {
  return body
    .split('\n')
    .map((l) => {
      const d = /^\{\s*([a-z]+)\s*(?::\s*(.*?))?\s*\}$/i.exec(l.trim());
      if (!d) return l;
      const [, name, val = ''] = d;
      if (name === 'repeat') return `[×${val}]`;
      if (name === 'voices') return `[voix: ${val}]`;
      if (name === 'section') return val ? `[section: ${val}]` : '[section]';
      if (name === 'intro' || name === 'interlude' || name === 'outro') return val ? `[${name}: ${val}]` : `[${name}]`;
      return l;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}

export function textToBody(text: string): { body: string; warnings: string[] } {
  const warnings: string[] = [];
  const body = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((raw, i) => {
      const l = raw.trim();
      let m = /^\[\s*[x×]\s*(\d+)\s*\]$/i.exec(l);
      if (m) return `{repeat: ${m[1]}}`;
      m = /^\[\s*(intro|interlude|outro)\s*(?::\s*(.*?))?\s*\]$/i.exec(l);
      if (m) return m[2] ? `{${m[1].toLowerCase()}: ${m[2]}}` : `{${m[1].toLowerCase()}}`;
      m = /^\[\s*section\s*(?::\s*(.*?))?\s*\]$/i.exec(l);
      if (m) return m[1] ? `{section: ${m[1]}}` : '{section}';
      m = /^\[\s*voix\s*:\s*(.*?)\s*\]$/i.exec(l);
      if (m) return `{voices: ${m[1]}}`;
      if (/^\[[^\]]*\]$/.test(l)) warnings.push(`ligne ${i + 1} : « ${l} » non reconnu (gardé comme parole)`);
      // « [x4] » / « [X 4] » en fin de ligne → forme canonique « [×4] » ; « // » sépare le commentaire ;
      // accolades interdites dans les paroles
      const clean = raw.replace(/[{}]/g, '');
      const cut = clean.search(/\s*\/\//);
      const main = (cut >= 0 ? clean.slice(0, cut) : clean).replace(/\s*\[\s*[x×]\s*(\d+)\s*\]\s*$/i, ' [×$1]');
      const note = cut >= 0 ? clean.slice(cut).replace(/^\s*\/\/\s*/, '').trim() : '';
      return note ? `${main.replace(/\s+$/, '')} // ${note}` : main;
    })
    .join('\n');
  return { body, warnings };
}

export const sectionsToText = (song: Song) => bodyToText(itemsToBody(toItems(song.sections)));

/** Lit le texte du mode Texte et produit les éléments (via le parseur .cho). */
export function textToItems(song: Song, text: string): { items: Item[]; warnings: string[] } {
  const { body, warnings } = textToBody(text);
  const head = serializeChordPro({ ...song, sections: [] });
  const { song: parsed, warnings: w2 } = parseChordPro(song.id, `${head}\n${body}`);
  // « REF: », « Ref.1 », « REFRAIN »… tapés en mode Texte → section REFRAIN
  return { items: convertRefrainItems(toItems(parsed.sections)).items, warnings: [...warnings, ...w2.filter((w) => !/manquant/.test(w))] };
}

/* ---------- Opérations (immuables) ---------- */

export function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const n = [...list];
  [n[i], n[j]] = [n[j], n[i]];
  return n;
}

export const removeAt = <T>(list: T[], i: number): T[] => list.filter((_, k) => k !== i);
export const insertAt = <T>(list: T[], i: number, item: T): T[] => [...list.slice(0, i), item, ...list.slice(i)];
export const replaceAt = <T>(list: T[], i: number, item: T): T[] => list.map((x, k) => (k === i ? item : x));

/** Coupe un paragraphe après la ligne `line` : la suite devient un nouveau paragraphe. */
export function splitStanza<T extends Item>(list: T[], i: number, line: number, make: (it: Item) => T): T[] {
  const it = list[i];
  if (it.kind !== 'stanza' || line >= it.lines.length - 1) return list;
  const { first, second } = cutLines(it.lines, line);
  const a = make({ kind: 'stanza', lines: first, repeat: it.repeat });
  const b = make({ kind: 'stanza', lines: second, repeat: 1 });
  return [...list.slice(0, i), a, b, ...list.slice(i + 1)];
}

/** Fusionne un paragraphe avec le paragraphe qui le précède immédiatement. */
export function mergeWithPrevious<T extends Item>(list: T[], i: number, make: (it: Item) => T): T[] {
  const it = list[i];
  const prev = list[i - 1];
  if (it?.kind !== 'stanza' || prev?.kind !== 'stanza') return list;
  const merged = make({ kind: 'stanza', lines: [...prev.lines, ...it.lines], repeat: prev.repeat });
  return [...list.slice(0, i - 1), merged, ...list.slice(i + 1)];
}

/** Coupe des lignes après `line` ; un groupe répété coupé en deux devient deux groupes. */
export function cutLines(lines: string[], line: number): { first: string[]; second: string[] } {
  const first = lines.slice(0, line + 1);
  const second = lines.slice(line + 1);
  const g = viewLines(lines)[line]?.group;
  if (g && !g.last) {
    const a = parseLine(first[first.length - 1]);
    first[first.length - 1] = formatLine(a.open ? collapseGroup(a, a.open) : { ...a, close: true });
    const b = parseLine(second[0]);
    second[0] = formatLine(b.close ? collapseGroup(b, g) : { ...b, open: { times: g.times, note: g.note } });
  }
  return { first, second };
}

/** Supprime une ligne en gardant les bornes de son groupe sur les lignes voisines. */
export function removeLine(lines: string[], l: number): string[] {
  const p = parseLine(lines[l]);
  const out = [...lines];
  if (p.open && l + 1 < out.length) {
    const n = parseLine(out[l + 1]);
    out[l + 1] = formatLine(n.close ? collapseGroup(n, p.open) : { ...n, open: p.open });
  } else if (p.close && l > 0 && viewLines(lines)[l].group) {
    const q = parseLine(out[l - 1]);
    out[l - 1] = formatLine(q.open ? collapseGroup(q, q.open) : { ...q, close: true });
  }
  out.splice(l, 1);
  return out;
}
