import { describe, expect, it } from 'vitest';
import { parseChordPro } from '../src/model/chordpro';
import { buildUnits, paginate, type Measure } from '../src/stage/paginate';

const song = parseChordPro('t', `{title: T}
{artist: A}

{intro}

a1
a2

{section: ZOMA}
{voices: Hasina=lead}
b1
b2
b3
`).song;

const m = (lines: number, header = 0): Measure => ({ height: header + lines * 10, header, lines: Array(lines).fill(10) });
const keys = (cols: ReturnType<typeof paginate>) => cols.map((c) => c.units.map((u) => u.key));

describe('buildUnits', () => {
  it('une unité par strophe, en-tête sur la première strophe de section', () => {
    const u = buildUnits(song);
    expect(u.map((x) => [x.key, x.header, x.cue?.type ?? x.lines?.length])).toEqual([
      ['s0', false, 'intro'], ['s1.0', false, 2], ['s2.0', true, 3]]);
  });
});

describe('paginate', () => {
  const units = buildUnits(song);
  const cue: Measure = { height: 10, header: 0, lines: [] }; // un repère n'a pas de ligne de paroles
  const ms = [cue, m(2), m(3, 5)]; // hauteurs 10, 20, 35
  it('tout tient sur une colonne', () => expect(paginate(units, ms, 200, 10)).toHaveLength(1));
  it('ne coupe pas une strophe qui tient sur une colonne', () => {
    expect(keys(paginate(units, ms, 40, 5))).toEqual([['s0', 's1.0'], ['s2.0']]);
  });
  it('un repère instrumental ne reste jamais seul en bas de colonne', () => {
    const u = buildUnits(parseChordPro('x', '{title: a}\n{artist: b}\nl1\nl2\n\n{interlude}\n\nl3\nl4\n').song);
    // colonne de 35 : [l1 l2]=20 + cue 10 tiendraient, mais la strophe suivante non → le repère part avec elle
    expect(keys(paginate(u, [m(2), cue, m(2)], 35, 0))).toEqual([['s0.0'], ['s1', 's2.0']]);
  });
  it('resserre l\'espacement pour faire entrer une strophe de plus', () => {
    // 10 + 20 + 35 = 65 ; colonne 75 ; espacement nominal 10 (×2 = 20 → 85, trop) ; minimum 4 (×2 = 8 → 73, ok)
    const cols = paginate(units, ms, 75, 10, { minGap: 4 });
    expect(cols).toHaveLength(1);
    expect(cols[0].gap).toBe(5);
  });
  it('garde l\'espacement nominal quand il y a la place', () => expect(paginate(units, ms, 200, 10, { minGap: 4 })[0]).toMatchObject({ gap: 10, scale: 1 }));
  it('resserre l\'interligne en dernier recours, sans descendre sous le minimum', () => {
    // fixe 10 (repère) + 5 (en-tête) ; lignes 20 + 30 = 50 ; espacements 2 × 2 = 4 → 69 > 65 ; interligne 0.9 → 45 + 19 = 64 ≤ 65
    const cols = paginate(units, ms, 65, 10, { minGap: 2, minScale: 0.9 });
    expect(cols).toHaveLength(1);
    expect(cols[0].gap).toBe(2);
    expect(cols[0].scale).toBeCloseTo((65 - 15 - 4) / 50);
    expect(paginate(units, ms, 60, 10, { minGap: 2, minScale: 0.9 })).toHaveLength(2);
  });
  it('découpe une strophe plus haute qu\'une colonne en gardant l\'en-tête en tête', () => {
    const parts = paginate(units, ms, 22, 0).flatMap((c) => c.units).filter((u) => u.key.startsWith('s2.0'));
    expect(parts.map((u) => [u.header, u.lines])).toEqual([[true, ['b1']], [false, ['b2', 'b3']]]);
  });
  it('colonne vide si aucun contenu', () => expect(keys(paginate([], [], 100, 0))).toEqual([[]]));
});
