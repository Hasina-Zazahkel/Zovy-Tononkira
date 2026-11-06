/**
 * PDF des paroles d'un chant (A4, fond blanc), généré sur l'appareil : fonctionne hors ligne.
 * Chargé à la demande (bibliothèque jsPDF dans un fichier séparé).
 */
import { jsPDF } from 'jspdf';
import { EDITION } from '../edition';
import { displayKey } from '../model/chordpro';
import { pdfFileName, pdfRows, type PdfRow } from '../model/pdfRows';
import type { HlColor } from '../model/repeat';
import type { Song } from '../model/types';

/** Couleurs foncées, lisibles sur papier blanc. */
const INK: Record<HlColor, [number, number, number]> = {
  jaune: [168, 120, 0], vert: [24, 128, 70], bleu: [28, 92, 190], rose: [190, 44, 118], violet: [104, 64, 190],
};
const BLACK: [number, number, number] = [20, 20, 20];
const GREY: [number, number, number] = [110, 110, 110];

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function buildSongPdf(song: Song, opts: { uppercase?: boolean } = {}): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 18, BOTTOM = H - 16;
  const gold = hexRgb(EDITION.theme.goldDim);
  const X = M + 4; // retrait du texte (place de la barre des blocs répétés)
  const LH = 6.6; // interligne des paroles (pt 13)
  let y = M;

  const newPage = () => { doc.addPage(); y = M; };
  const ensure = (h: number) => { if (y + h > BOTTOM) newPage(); };

  // En-tête
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...BLACK);
  for (const l of doc.splitTextToSize(song.title, W - 2 * M) as string[]) { doc.text(l, M, y + 7); y += 9; }
  if (song.artist) { doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(...GREY); doc.text(song.artist, M, y + 3); y += 6; }
  const meta = [song.key ? `Tonalité : ${displayKey(song.key)}` : '', song.notes ?? ''].filter(Boolean).join('   ·   ');
  if (meta) { doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...GREY); doc.text(meta, M, y + 4); y += 7; }
  doc.setDrawColor(...gold); doc.setLineWidth(0.6); doc.line(M, y + 1, W - M, y + 1); y += 8;

  const rows = pdfRows(song, opts);
  rows.forEach((r: PdfRow, i) => {
    if (r.kind === 'gap') { y += 3.5; return; }
    if (r.kind === 'section') {
      ensure(7 + LH * 2); // jamais un titre de section seul en bas de page
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...gold);
      if (r.text) doc.text(r.text, M, y + 4);
      if (r.voices) { doc.setFont('helvetica', 'italic'); doc.setTextColor(...GREY); doc.text(r.voices, r.text ? M + doc.getTextWidth(r.text) + 4 : M, y + 4); }
      y += 7;
      return;
    }
    if (r.kind === 'cue') {
      ensure(8);
      doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(11); doc.setTextColor(...gold);
      doc.text(r.text, M, y + 4);
      y += 7.5;
      return;
    }
    // Ligne de paroles (retour à la ligne si trop longue)
    const tail = [r.times && r.times > 1 ? `×${r.times}` : '', r.blockTimes ? `×${r.blockTimes}` : ''];
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    const reserve = (r.blockTimes ? 14 : 0) + (r.times ? 12 : 0);
    const parts = doc.splitTextToSize(r.text, W - M - X - reserve) as string[];
    parts.forEach((p, k) => {
      ensure(LH);
      const prev = rows[i - 1];
      if (r.bar) {
        // Barre continue le long d'un bloc répété
        const top = k === 0 && !(prev && prev.kind === 'line' && prev.bar && !prev.blockTimes) ? y + 1 : y - 0.5;
        doc.setDrawColor(...gold); doc.setLineWidth(0.9); doc.line(M + 0.5, top, M + 0.5, y + LH - 0.5);
      }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
      doc.setTextColor(...(r.color ? INK[r.color] : BLACK));
      doc.text(p, X, y + 5);
      let x = X + doc.getTextWidth(p) + 2;
      if (k === parts.length - 1) {
        if (tail[0]) {
          doc.setFontSize(11); doc.setTextColor(...gold); doc.text(tail[0], x, y + 5); x += doc.getTextWidth(tail[0]) + 3;
        }
        if (r.note) {
          doc.setFont('helvetica', 'italic'); doc.setFontSize(10.5); doc.setTextColor(...GREY);
          const room = W - M - x - (r.blockTimes ? 14 : 0);
          const note = doc.splitTextToSize(`— ${r.note}`, Math.max(room, 30)) as string[];
          if (room >= 30) doc.text(note[0], x, y + 5);
          else { y += LH; ensure(LH); doc.text(note[0], X + 4, y + 5); }
        }
        if (tail[1]) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...gold);
          doc.text(tail[1], W - M, y + 5, { align: 'right' });
        }
      }
      y += LH;
    });
  });

  // Pied de page
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GREY);
    doc.text(`${EDITION.name} · ${song.title}`, M, H - 8);
    if (n > 1) doc.text(`${p} / ${n}`, W - M, H - 8, { align: 'right' });
  }
  return doc;
}

/** Télécharge le PDF (dossier Téléchargements de l'appareil). */
export function saveSongPdf(song: Song, opts: { uppercase?: boolean } = {}) {
  buildSongPdf(song, opts).save(pdfFileName(song.title));
}
