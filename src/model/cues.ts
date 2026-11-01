import type { CueType } from './types';

export const CUE_TYPES: readonly CueType[] = ['intro', 'interlude', 'outro'];
export const CUE_LABEL: Record<CueType, string> = { intro: 'Intro', interlude: 'Interlude', outro: 'Outro' };

/**
 * Lit un ancien libellé libre (« INTERLUDE GUITARE », « INTRO (X4) », « INTERLUDE -- O RILA RE -- (FA) »)
 * et le range dans une catégorie + un commentaire court. Un libellé fusionné « A · B » donne plusieurs repères.
 */
export function classifyCue(raw: string): { cue: CueType; note?: string }[] {
  return raw.split(' · ').map((part) => {
    let t = part.trim();
    let cue: CueType = 'interlude';
    const m = /^(fin\s+intro|intro|interlude|outro)\b/i.exec(t);
    if (m) {
      const w = m[1].toLowerCase();
      // « FIN INTRO » = reprise de l'intro pour finir : interlude (devient outro s'il suit la dernière parole)
      cue = w === 'interlude' || w.startsWith('fin') ? 'interlude' : w === 'outro' ? 'outro' : 'intro';
      t = (w.startsWith('fin') ? 'fin intro ' : '') + t.slice(m[0].length);
    } else if (/^musique$/i.test(t)) {
      t = '';
    }
    return { cue, note: cleanNote(t) };
  });
}

/** Commentaire discret : séparateurs nettoyés, « X4 » → « ×4 », casse phrase. */
export function cleanNote(raw: string): string | undefined {
  let t = raw
    .replace(/[{}]/g, '')
    .replace(/--/g, ' ')
    .replace(/^[\s\-–:·]+|[\s\-–:·]+$/g, '')
    .replace(/\(\s*x\s*(\d+)\s*\)|\bx\s*(\d+)\b/gi, (_, a, b) => `×${a ?? b}`)
    .replace(/\s+-\s+/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^musique$/i.test(t)) t = '';
  if (!t) return undefined;
  t = t.toLowerCase().replace(/\bfolkaka\b/g, 'folaka'); // coquille legacy
  return t.charAt(0).toUpperCase() + t.slice(1);
}
