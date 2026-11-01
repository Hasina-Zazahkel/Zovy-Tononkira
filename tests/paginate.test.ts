import { describe, expect, it } from 'vitest';
import { parseChordPro } from '../src/model/chordpro';
import { buildUnits, paginate, type Measure } from '../src/stage/paginate';

const song = parseChordPro('t', `{title: T}
{artist: A}

{instrumental: Intro}

a1
a2

{section: ZOMA}
{voices: Hasina=lead}
b1
b2
b3
`).song;

const m = (lines: number, header = 0): Measure => ({ height: header + lines * 10, header, lines: Array(lines).fill(10) });

describe('buildUnits', () => {
  it('une unité par strophe, en-tête sur la première strophe de section', () => {
    const u = buildUnits(song);
    expect(u.map((x) => [x.key, x.header, x.cue ?? x.lines?.length])).toEqual([
      ['s0', false, 'Intro'], ['s1.0', false, 2], ['s2.0', true, 3]]);
  });
});

describe('paginate', () => {
  const units = buildUnits(song);
  it('tout tient sur une page', () => {
    expect(paginate(units, [m(1), m(2), m(3, 5)], 200, 10)).toHaveLength(1);
  });
  it('ne coupe pas une strophe qui tient sur une page', () => {
    const pages = paginate(units, [m(1), m(2), m(3, 5)], 40, 5);
    expect(pages.map((p) => p.map((u) => u.key))).toEqual([['s0', 's1.0'], ['s2.0']]);
  });
  it('découpe une strophe plus haute qu\'une page en gardant l\'en-tête en tête', () => {
    const pages = paginate(units, [m(1), m(2), m(3, 5)], 22, 0);
    const last = pages.flat().filter((u) => u.key.startsWith('s2.0'));
    expect(last.map((u) => [u.header, u.lines])).toEqual([[true, ['b1']], [false, ['b2', 'b3']]]);
  });
  it('page vide si aucun contenu', () => expect(paginate([], [], 100, 0)).toEqual([[]]));
});
