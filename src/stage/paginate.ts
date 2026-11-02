import { viewLines, type LineView } from '../model/repeat';
import type { CueType, Section, Song } from '../model/types';

/**
 * Unité de mise en page : une strophe (avec l'en-tête de sa section si c'est la première)
 * ou un repère instrumental. Une strophe n'est jamais coupée, sauf si elle dépasse une page.
 */
export interface Unit {
  key: string;
  section: Section;
  /** Afficher l'en-tête de section (label / voix) au-dessus. */
  header: boolean;
  /** Repère instrumental : catégorie + commentaire discret. */
  cue?: { type: CueType; note?: string };
  lines?: string[];
  /** Lignes lues dans le contexte du paragraphe (groupes répétés), découpées avec `lines`. */
  views?: LineView[];
  /** Index de la 1re ligne dans la strophe (strophe découpée sur plusieurs pages). */
  start?: number;
  /** Vrai pour une strophe découpée qui continue sur la page suivante. */
  continued?: boolean;
  /** Paragraphe répété N fois (barre + pastille). */
  repeat?: number;
}

export function buildUnits(song: Song): Unit[] {
  const units: Unit[] = [];
  for (const s of song.sections) {
    if (s.kind === 'instrumental') {
      units.push({ key: `${s.id}`, section: s, header: false, cue: { type: s.cue ?? 'interlude', note: s.label } });
      continue;
    }
    const hasHeader = !!(s.label || s.voices?.length);
    if (!s.stanzas.length && hasHeader) {
      units.push({ key: `${s.id}`, section: s, header: true, lines: [] });
      continue;
    }
    s.stanzas.forEach((st, j) => {
      const repeat = s.repeats?.[j] ?? 1;
      units.push({ key: `${s.id}.${j}`, section: s, header: hasHeader && j === 0, lines: st, views: viewLines(st), ...(repeat > 1 ? { repeat } : {}) });
    });
  }
  return units;
}

export interface Measure {
  /** Hauteur totale de l'unité. */
  height: number;
  /** Hauteur de l'en-tête (0 si absent). */
  header: number;
  /** Hauteur de chaque ligne (pour découper une strophe trop longue). */
  lines: number[];
}

export interface Column {
  units: Unit[];
  /** Espacement réellement appliqué entre les blocs de cette colonne (≤ espacement nominal). */
  gap: number;
  /** Facteur d'interligne appliqué aux lignes de paroles (1 = nominal, ≥ minScale). */
  scale: number;
}

export interface FitOptions {
  /** Espacement minimal entre strophes. */
  minGap?: number;
  /** Interligne minimal relatif (ex. 0.92 = −8 %). */
  minScale?: number;
}

/**
 * Remplit les colonnes en glouton, sans jamais couper une strophe (sauf si elle dépasse une colonne).
 * - Un repère instrumental reste collé au bloc qui le suit (jamais seul en bas de page).
 * - L'espacement entre strophes peut se resserrer jusqu'à `minGap` pour faire entrer une strophe de plus.
 */
export function paginate(units: Unit[], measures: Measure[], pageHeight: number, gap: number, opts: FitOptions = {}): Column[] {
  const minGap = opts.minGap ?? gap;
  const minScale = opts.minScale ?? 1;
  type Block = { unit: Unit; h: number; l: number };
  const blocks: Block[] = [];
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  units.forEach((u, i) => {
    const m = measures[i];
    if (m.height <= pageHeight || !u.lines || u.lines.length <= 1) {
      blocks.push({ unit: u, h: m.height, l: sum(m.lines) });
      return;
    }
    let start = 0;
    let h = u.header ? m.header : 0;
    let part = 0;
    for (let l = 0; l < u.lines.length; l++) {
      if (h + m.lines[l] > pageHeight && l > start) {
        blocks.push({
          unit: { ...u, key: `${u.key}#${part++}`, header: u.header && start === 0, lines: u.lines.slice(start, l), views: u.views?.slice(start, l), start, continued: true },
          h, l: sum(m.lines.slice(start, l)),
        });
        start = l;
        h = 0;
      }
      h += m.lines[l];
    }
    blocks.push({ unit: { ...u, key: `${u.key}#${part}`, header: u.header && start === 0, lines: u.lines.slice(start), views: u.views?.slice(start), start }, h, l: sum(m.lines.slice(start)) });
  });

  // Groupes insécables : repère instrumental + bloc suivant
  const groups: Block[][] = [];
  for (let i = 0; i < blocks.length; i++) {
    const g = [blocks[i]];
    while (g[g.length - 1].unit.cue != null && i + 1 < blocks.length) g.push(blocks[++i]);
    groups.push(g);
  }

  // Tient si : parties fixes + lignes × interligne minimal + espacements minimaux ≤ hauteur
  const fits = (bs: Block[]) =>
    sum(bs.map((b) => b.h - b.l)) + sum(bs.map((b) => b.l)) * minScale + Math.max(0, bs.length - 1) * minGap <= pageHeight + 0.5;

  const cols: Block[][] = [];
  let cur: Block[] = [];
  for (const g of groups) {
    if (cur.length && !fits([...cur, ...g])) { cols.push(cur); cur = []; }
    if (!cur.length && g.length > 1 && !fits(g)) {
      // Groupe trop haut même seul : placé bloc par bloc
      for (const b of g) {
        if (cur.length && !fits([...cur, b])) { cols.push(cur); cur = []; }
        cur.push(b);
      }
      continue;
    }
    cur.push(...g);
  }
  if (cur.length) cols.push(cur);
  if (!cols.length) return [{ units: [], gap, scale: 1 }];

  // Réglage par colonne : on resserre d'abord l'espacement, puis l'interligne, juste ce qu'il faut
  return cols.map((c) => {
    const n = c.length;
    const fixed = sum(c.map((b) => b.h - b.l));
    const lines = sum(c.map((b) => b.l));
    const gaps = Math.max(0, n - 1);
    if (fixed + lines + gaps * gap <= pageHeight) return { units: c.map((b) => b.unit), gap, scale: 1 };
    if (fixed + lines + gaps * minGap <= pageHeight) {
      return { units: c.map((b) => b.unit), gap: gaps ? (pageHeight - fixed - lines) / gaps : gap, scale: 1 };
    }
    const scale = lines ? Math.max(minScale, Math.min(1, (pageHeight - fixed - gaps * minGap) / lines)) : 1;
    return { units: c.map((b) => b.unit), gap: minGap, scale };
  });
}
