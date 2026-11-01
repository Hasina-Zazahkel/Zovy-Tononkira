import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseChordPro, serializeChordPro, parseKey } from '../src/model/chordpro';

const DIR = join(__dirname, '../data/songs');

describe('parseKey', () => {
  it.each([['RE', { root: 'RE' }], ['SIb', { root: 'SI', accidental: 'b' }], ['FA#', { root: 'FA', accidental: '#' }]])(
    '%s', (raw, k) => expect(parseKey(raw)).toEqual(k));
  it('rejette les valeurs invalides', () => expect(parseKey('re')).toBeUndefined());
});

describe('parseChordPro', () => {
  const src = `{title: T}
{artist: A}
{key: SIb}
{singers: Hasina=lead, Misa=1ère voix, Ke=2ème voix, Toky=ténor}
{musicians: Haja=guitare basse, Toky=guitare classique}

{instrumental: Intro}

l1
l2

l3

{section}
{voices: Hasina=lead, *=choeur}
l4

{section: ZOMA}
l5
`;
  const { song, warnings } = parseChordPro('t', src);
  it('sans avertissement', () => expect(warnings).toEqual([]));
  it('métadonnées', () => {
    expect(song.key).toEqual({ root: 'SI', accidental: 'b' });
    expect(song.singers).toEqual([
      { member: 'Hasina', role: 'lead' }, { member: 'Misa', role: '1ère voix' },
      { member: 'Ke', role: '2ème voix' }, { member: 'Toky', role: 'ténor' }]);
    expect(song.musicians).toEqual([{ member: 'Haja', role: 'guitare basse' }, { member: 'Toky', role: 'guitare classique' }]);
  });
  it('sections et strophes', () => {
    expect(song.sections.map((s) => [s.id, s.kind, s.label ?? null])).toEqual([
      ['s0', 'instrumental', 'Intro'], ['s1', 'lyrics', null], ['s2', 'lyrics', null], ['s3', 'lyrics', 'ZOMA']]);
    expect(song.sections[1].stanzas).toEqual([['l1', 'l2'], ['l3']]);
    expect(song.sections[2].voices).toEqual([{ member: 'Hasina', role: 'lead' }, { member: '*', role: 'choeur' }]);
  });
  it('{voices} après des paroles ouvre une nouvelle section', () => {
    const r = parseChordPro('x', '{title: a}\n{artist: b}\nl1\n{voices: Ke=bas}\nl2\n').song;
    expect(r.sections.map((s) => s.stanzas)).toEqual([[['l1']], [['l2']]]);
  });
  it('round-trip canonique', () => expect(serializeChordPro(song)).toBe(src));
});

describe('catalogue réel', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.cho'));
  it('contient les 236 morceaux', () => expect(files.length).toBe(236));
  it.each(files)('%s : canonique, sans avertissement', (f) => {
    const raw = readFileSync(join(DIR, f), 'utf8');
    const { song, warnings } = parseChordPro(f.slice(0, -4), raw);
    expect(warnings).toEqual([]);
    expect(serializeChordPro(song)).toBe(raw);
    expect(parseChordPro(song.id, serializeChordPro(song)).song).toEqual(song);
  });
});
