/**
 * Contenu imprimable d'un chant (PDF) : suite de lignes à poser de haut en bas.
 * Fonction pure, indépendante de la bibliothèque PDF (testable).
 */
import { buildUnits } from '../stage/paginate';
import { CUE_LABEL } from './cues';
import type { HlColor } from './repeat';
import type { Assignment, Song } from './types';

export type PdfRow =
  | { kind: 'section'; text: string; voices?: string }
  | { kind: 'cue'; text: string }
  | { kind: 'gap' }
  | {
      kind: 'line';
      text: string;
      /** Ligne répétée (pastille ×N après le texte). */
      times?: number;
      /** Commentaire discret après le texte. */
      note?: string;
      /** Couleur posée par l'administrateur. */
      color?: HlColor;
      /** Ligne d'un bloc répété (barre verticale à gauche). */
      bar?: boolean;
      /** Dernière ligne d'un bloc répété : ×N du bloc. */
      blockTimes?: number;
    };

export function voicesText(list?: Assignment[]): string | undefined {
  if (!list?.length) return undefined;
  return list.map((a) => (a.member === '*' ? a.role || 'Tous' : a.role ? `${a.member} : ${a.role}` : a.member)).join(' · ');
}

export function pdfRows(song: Song, opts: { uppercase?: boolean } = {}): PdfRow[] {
  const up = (s: string) => (opts.uppercase ? s.toUpperCase() : s);
  const rows: PdfRow[] = [];
  for (const u of buildUnits(song)) {
    if (rows.length) rows.push({ kind: 'gap' });
    if (u.cue) {
      rows.push({ kind: 'cue', text: [CUE_LABEL[u.cue.type].toUpperCase(), u.cue.note].filter(Boolean).join(' — ') });
      continue;
    }
    if (u.header) rows.push({ kind: 'section', text: (u.section.label ?? '').toUpperCase(), voices: voicesText(u.section.voices) });
    const views = u.views ?? [];
    const stanzaRep = u.repeat ?? 1;
    views.forEach((v, i) => {
      const g = v.group;
      const inRepGroup = !!g && g.times > 1;
      const row: PdfRow = { kind: 'line', text: up(v.text) };
      if (v.times > 1) row.times = v.times;
      const notes = [v.note, g && g.first && g.note && g.times <= 1 ? g.note : '', g && g.last && g.note && g.times > 1 ? g.note : ''].filter(Boolean);
      if (notes.length) row.note = notes.join(' · ');
      if (g?.color) row.color = g.color;
      if (stanzaRep > 1 || inRepGroup) row.bar = true;
      if (inRepGroup && g!.last) row.blockTimes = g!.times;
      if (stanzaRep > 1 && i === views.length - 1) row.blockTimes = Math.max(row.blockTimes ?? 0, stanzaRep);
      rows.push(row);
    });
  }
  return rows;
}

/** Nom de fichier : « oh-happy-day.pdf ». */
export function pdfFileName(title: string): string {
  const slug = title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'chant'}.pdf`;
}
