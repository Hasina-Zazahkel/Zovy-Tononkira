import { describe, expect, it } from 'vitest';
import { parseChordPro, serializeChordPro } from '../src/model/chordpro';
import { cleanupSong } from '../src/model/cleanup';
import { formatLine, groupLines, normalizeGroups, parseLine, setGroup, splitLineRepeat, trailingMarker, ungroupWhere, viewLines, wholeLineMarker, withLineRepeat } from '../src/model/repeat';

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

describe('groupe de lignes répété', () => {
  const st = ['A', '[×2 «chœur seul» B', 'C] [×3] // doux', 'D'];
  it('lecture', () => {
    const v = viewLines(st);
    expect(v.map((x) => x.text)).toEqual(['A', 'B', 'C', 'D']);
    expect(v[1].group).toEqual({ id: 0, times: 2, note: 'chœur seul', first: true, last: false });
    expect(v[2]).toMatchObject({ times: 3, note: 'doux', group: { last: true } });
    expect(v[0].group).toBeUndefined();
    expect(v[3].group).toBeUndefined();
  });
  it('écriture stable', () => {
    expect(st.map((l) => formatLine(parseLine(l)))).toEqual(st);
    expect(formatLine(parseLine('[x2 B'))).toBe('[×2 B');
  });
  it('crochets du texte non pris pour un groupe', () => {
    expect(viewLines(['MAMA (MANAMBITAMBY E]'])[0].text).toBe('MAMA (MANAMBITAMBY E]');
    expect(normalizeGroups(['MAMA (MANAMBITAMBY E]'])).toEqual(['MAMA (MANAMBITAMBY E]']);
    expect(parseLine('[(Very any) x 3] [×4]')).toMatchObject({ text: '[(Very any) x 3]', times: 4 });
  });
  it('normalisation : non refermé, imbriqué, une seule ligne', () => {
    expect(normalizeGroups(['[×2 A', 'B', 'C'])).toEqual(['[×2 A', 'B', 'C]']);
    expect(normalizeGroups(['[×2 A', '[×3 B', 'C]'])).toEqual(['[×2 A', 'B', 'C]']);
    expect(normalizeGroups(['[×2 «x» A]', 'B'])).toEqual(['A [×2] // x', 'B']);
  });
  it('créer / modifier / retirer', () => {
    let l = groupLines(['A', 'B', 'C', 'D'], 1, 2);
    expect(l).toEqual(['A', '[×2 B', 'C]', 'D']);
    l = setGroup(l, 1, { times: 3, note: 'piano' });
    expect(l).toEqual(['A', '[×3 «piano» B', 'C]', 'D']);
    expect(groupLines(l, 0, 1)).toEqual(['[×2 A', 'B]', 'C', 'D']);
    expect(ungroupWhere(l, () => true)).toEqual(['A', 'B', 'C', 'D']);
  });
  it('parseChordPro canonise', () => {
    const { song } = parseChordPro('t', '{title: T}\n{artist: A}\n\nA\n[x2 B\nC\n');
    expect(song.sections[0].stanzas[0]).toEqual(['A', '[×2 B', 'C]']);
  });
});

describe('surlignage (groupe sans répétition)', () => {
  it('lecture / écriture', () => {
    const st = ['A', '[vert «Misa seule» B', 'C]', 'D'];
    expect(st.map((l) => formatLine(parseLine(l)))).toEqual(st);
    const v = viewLines(st);
    expect(v[1].group).toEqual({ id: 0, times: 1, note: 'Misa seule', color: 'vert', first: true, last: false });
    expect(formatLine(parseLine('[«x» B'))).toBe('[bleu «x» B');
    expect(formatLine(parseLine('[Rose B'))).toBe('[rose B');
    expect(parseLine('[vertigo]').open).toBeUndefined();
  });
  it('création, une seule ligne, sans commentaire', () => {
    expect(groupLines(['A', 'B', 'C'], 0, 1, 1)).toEqual(['[bleu A', 'B]', 'C']);
    expect(groupLines(['A', 'B'], 1, 1, 1, '', 'rose')).toEqual(['A', '[rose B]']);
    expect(normalizeGroups(['[bleu A', 'B]', 'C'])).toEqual(['[bleu A', 'B]', 'C']);
    expect(normalizeGroups(['[rose «piano» A]', 'B'])).toEqual(['[rose «piano» A]', 'B']);
    expect(normalizeGroups(['[vert A', 'B'])).toEqual(['[vert A', 'B]']);
    expect(setGroup(['[bleu A', 'B]'], 0, { note: 'Misa seule', color: 'violet' })).toEqual(['[violet «Misa seule» A', 'B]']);
  });
  it('import', async () => {
    const { parseImport } = await import('../src/model/importText');
    const [r] = parseImport('Titre : A\nArtiste : B\n\nl1\n[vert «Misa seule» l2\nl3]\n[rose l4]\n');
    expect(r.song.sections[0].stanzas[0]).toEqual(['l1', '[vert «Misa seule» l2', 'l3]', '[rose l4]']);
    expect(r.found).toContain('2 surlignages');
  });
});
