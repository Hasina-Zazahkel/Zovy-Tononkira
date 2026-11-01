import type { Section, Song } from '../model/types';

/**
 * Unité de mise en page : une strophe (avec l'en-tête de sa section si c'est la première)
 * ou un repère instrumental. Une strophe n'est jamais coupée, sauf si elle dépasse une page.
 */
export interface Unit {
  key: string;
  section: Section;
  /** Afficher l'en-tête de section (label / voix) au-dessus. */
  header: boolean;
  cue?: string;
  lines?: string[];
  /** Vrai pour une strophe découpée qui continue sur la page suivante. */
  continued?: boolean;
}

export function buildUnits(song: Song): Unit[] {
  const units: Unit[] = [];
  for (const s of song.sections) {
    if (s.kind === 'instrumental') {
      units.push({ key: `${s.id}`, section: s, header: false, cue: s.label ?? 'INSTRUMENTAL' });
      continue;
    }
    const hasHeader = !!(s.label || s.voices?.length);
    if (!s.stanzas.length && hasHeader) {
      units.push({ key: `${s.id}`, section: s, header: true, lines: [] });
      continue;
    }
    s.stanzas.forEach((st, j) => units.push({ key: `${s.id}.${j}`, section: s, header: hasHeader && j === 0, lines: st }));
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

/**
 * Découpe les unités trop hautes en morceaux de lignes, puis remplit les pages en glouton.
 * Garde l'en-tête de section collé à la strophe qui suit.
 */
export function paginate(units: Unit[], measures: Measure[], pageHeight: number, gap: number): Unit[][] {
  const blocks: { unit: Unit; h: number }[] = [];
  units.forEach((u, i) => {
    const m = measures[i];
    if (m.height <= pageHeight || !u.lines || u.lines.length <= 1) {
      blocks.push({ unit: u, h: m.height });
      return;
    }
    let start = 0;
    let h = u.header ? m.header : 0;
    let part = 0;
    for (let l = 0; l < u.lines.length; l++) {
      if (h + m.lines[l] > pageHeight && l > start) {
        blocks.push({
          unit: { ...u, key: `${u.key}#${part++}`, header: u.header && start === 0, lines: u.lines.slice(start, l), continued: true },
          h,
        });
        start = l;
        h = 0;
      }
      h += m.lines[l];
    }
    blocks.push({ unit: { ...u, key: `${u.key}#${part}`, header: u.header && start === 0, lines: u.lines.slice(start) }, h });
  });

  const pages: Unit[][] = [];
  let cur: Unit[] = [];
  let used = 0;
  for (const b of blocks) {
    const need = cur.length ? used + gap + b.h : b.h;
    if (cur.length && need > pageHeight) {
      pages.push(cur);
      cur = [b.unit];
      used = b.h;
    } else {
      cur.push(b.unit);
      used = need;
    }
  }
  if (cur.length) pages.push(cur);
  return pages.length ? pages : [[]];
}
