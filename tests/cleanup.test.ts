import { describe, expect, it } from 'vitest';
import { parseChordPro, serializeChordPro } from '../src/model/chordpro';
import { cleanupSong } from '../src/model/cleanup';

const clean = (body: string) => serializeChordPro(cleanupSong(parseChordPro('t', `{title: T}\n{artist: A}\n\n${body}`).song)).split('\n').slice(3).join('\n');

describe('cleanupSong', () => {
  it('repère isolé sous un paragraphe → paragraphe répété', () => expect(clean('l1\nl2\n\n(BIS)\n\nl3\n')).toBe('{repeat: 2}\nl1\nl2\n\nl3\n'));
  it('repère isolé non répétitif → rattaché à la strophe précédente', () => expect(clean('l1\nl2\n\n(pas d\'interlude)\n\nl3\n')).toBe('l1\nl2\n(pas d\'interlude)\n\nl3\n'));
  it('en tête de section, il vise la strophe suivante', () => expect(clean('(X2)\n\nl1\n')).toBe('{repeat: 2}\nl1\n'));
  it('...MUSIQUE... devient un repère instrumental', () => expect(clean('l1\n\n...MUSIQUE...\n\nl2\n')).toBe('l1\n\n{interlude}\n\nl2\n'));
  it('voix posées avant une intro → section suivante', () =>
    expect(clean('{voices: Toky=Lead}\n\n{instrumental: INTRO}\n\nl1\n')).toBe('{intro}\n\n{voices: Toky=Lead}\nl1\n'));
  it('fusionne les repères consécutifs de même catégorie', () =>
    expect(clean('l0\n\n{interlude: guitare}\n\n{interlude: ×2}\n\nl1\n')).toBe('l0\n\n{interlude: guitare · ×2}\n\nl1\n'));
  it('catégorie selon la position : interlude avant les paroles = intro, après = outro', () =>
    expect(clean('{interlude: guitare}\n\nl1\n\n{interlude}\n\nl2\n\n{interlude: folaka}\n')).toBe('{intro: guitare}\n\nl1\n\n{interlude}\n\nl2\n\n{outro: folaka}\n'));
  it('idempotent', () => {
    const once = cleanupSong(parseChordPro('t', '{title: T}\n{artist: A}\nl1\n\n(BIS)\n\n...MUSIQUE...\n\nl2\n').song);
    expect(serializeChordPro(cleanupSong(once))).toBe(serializeChordPro(once));
  });
});

import { classifyCue } from '../src/model/cues';
describe('classifyCue (anciens libellés)', () => {
  it.each([
    ['INTERLUDE', [{ cue: 'interlude', note: undefined }]],
    ['INTRO (X4)', [{ cue: 'intro', note: '×4' }]],
    ['INTERLUDE  X4', [{ cue: 'interlude', note: '×4' }]],
    ['INTERLUDE -- O RILA RE -- (FA)', [{ cue: 'interlude', note: 'O rila re (fa)' }]],
    ['INTERLUDE 2 - FOLAKA', [{ cue: 'interlude', note: '2 · folaka' }]],
    ['OUTRO FOLAKA', [{ cue: 'outro', note: 'Folaka' }]],
    ['MUSIQUE', [{ cue: 'interlude', note: undefined }]],
    ['INTERLUDE FOLKAKA', [{ cue: 'interlude', note: 'Folaka' }]],
    ['INTERLUDE BASSE · FIN INTRO', [{ cue: 'interlude', note: 'Basse' }, { cue: 'interlude', note: 'Fin intro' }]],
  ])('%s', (raw, out) => expect(classifyCue(raw)).toEqual(out));
});
