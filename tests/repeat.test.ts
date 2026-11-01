import { describe, expect, it } from 'vitest';
import { parseChordPro, serializeChordPro } from '../src/model/chordpro';
import { cleanupSong } from '../src/model/cleanup';
import { splitLineRepeat, trailingMarker, wholeLineMarker, withLineRepeat } from '../src/model/repeat';

describe('marqueurs de fin de ligne', () => {
  it.each([
    ['TE HO ANY AHO FA TSY AFAKA E X2', 'TE HO ANY AHO FA TSY AFAKA E', 2],
    ['TSOFIKO RANO RAHA MATAHOTRA E (X2)', 'TSOFIKO RANO RAHA MATAHOTRA E', 2],
    ['rasombiniaina (2)', 'rasombiniaina', 2],
    ['fa raha fahavaratra (bis)', 'fa raha fahavaratra', 2],
    ['RAHA HO AVY IANAO KA HO AVY (INDROA).', 'RAHA HO AVY IANAO KA HO AVY', 2],
    ['salama tsara be (in-2)', 'salama tsara be', 2],
    ['ALAKO O! X4', 'ALAKO O!', 4],
    ['zaho tia x 3', 'zaho tia', 3],
  ])('%s', (line, text, times) => expect(trailingMarker(line)).toEqual({ text, times }));
  it.each(['(AOKA E X2)', 'MALAHELO (ANAREO) ANAREO', 'TOY NY RANO 2', 'BOX', 'ATAO X'])('ignore « %s »', (l) => expect(trailingMarker(l)).toBeNull());
});

describe('marqueur seul', () => {
  it.each([['X2', 2], ['(BIS)', 2], ['BIS', 2], ['(2*)', 2], ['(X4)', 4], ['X6', 6], ['BIS X4', 4], ['BIS [×3]', 3]])('%s', (l, n) => expect(wholeLineMarker(l)).toBe(n));
  it('texte ordinaire', () => expect(wholeLineMarker('OLO JIABY')).toBeNull());
});

describe('conversion et format', () => {
  const run = (body: string) => serializeChordPro(cleanupSong(parseChordPro('t', `{title: T}\n{artist: A}\n\n${body}`).song)).split('\n').slice(3).join('\n');
  it('ligne répétée', () => expect(run('l1 X2\nl2\n')).toBe('l1 [×2]\nl2\n'));
  it('marqueur en dernière ligne → paragraphe répété', () => expect(run('l1\nl2\nX2\n\nl3\n')).toBe('{repeat: 2}\nl1\nl2\n\nl3\n'));
  it('marqueur isolé sous un paragraphe', () => expect(run('l1\nl2\n\nBIS\n\nl3\n')).toBe('{repeat: 2}\nl1\nl2\n\nl3\n'));
  it('round-trip {repeat}', () => {
    const src = '{title: T}\n{artist: A}\n\n{section: Z}\n{repeat: 3}\nl1 [×2]\nl2\n\nl3\n';
    const s = parseChordPro('t', src).song;
    expect(s.sections[0].repeats).toEqual([3, 1]);
    expect(splitLineRepeat(s.sections[0].stanzas[0][0])).toEqual({ text: 'l1', times: 2 });
    expect(serializeChordPro(s)).toBe(src);
  });
});

import { formatLine, parseLine } from '../src/model/repeat';
describe('commentaire de ligne', () => {
  it.each([
    ['AU ZOMA OUI [×4] // Misa seule', { text: 'AU ZOMA OUI', times: 4, note: 'Misa seule' }],
    ['AU ZOMA // piano', { text: 'AU ZOMA', times: 1, note: 'piano' }],
    ['AU ZOMA [×2]', { text: 'AU ZOMA', times: 2, note: '' }],
    ['JE NE SUIS / PAS UN RICHISSIME', { text: 'JE NE SUIS / PAS UN RICHISSIME', times: 1, note: '' }],
  ])('%s', (raw, parts) => {
    expect(parseLine(raw)).toEqual(parts);
    expect(formatLine(parts)).toBe(raw);
  });
  it('withLineRepeat conserve le commentaire', () => expect(withLineRepeat('A [×2] // x', 3)).toBe('A [×3] // x'));
  it('ligne avec commentaire : aller-retour .cho', () => {
    const src = '{title: T}\n{artist: A}\n\nl1 [×2] // Misa seule\nl2 // piano\n';
    expect(serializeChordPro(parseChordPro('t', src).song)).toBe(src);
  });
});
