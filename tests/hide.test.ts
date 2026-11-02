import { describe, expect, it } from 'vitest';
import { parseChordPro } from '../src/model/chordpro';
import { effectiveHidden, parseHideBook, rangeFor, resolveHide, serializeHideBook } from '../src/model/hide';

const song = (body: string) => parseChordPro('t', `{title: T}\n{artist: A}\n\n${body}`).song;
const S = song('A1\nA2\nA3\n\nB1\nB2\n');

describe('lignes masquées (vue musicien)', () => {
  it('plage rattachée au texte', () => {
    const r = rangeFor(S, 's0.0', 1, 'x')!;
    expect(r).toEqual({ id: 'x', text: 'A2', at: 1 });
    const moved = song('Nouveau\n\nA1\nA2\nA3\n');
    expect([...resolveHide(moved, [r]).get('s0.1')!]).toEqual([[1, 'x']]);
  });
  it('défaut − réaffichées + perso', () => {
    const d = [rangeFor(S, 's0.0', 1, 'd1')!, rangeFor(S, 's0.0', 2, 'd2')!];
    const v = effectiveHidden(S, d, { hide: [rangeFor(S, 's0.1', 1, 'p1')!], show: ['d2'] });
    expect([...v.hidden.get('s0.0')!]).toEqual([1]);
    expect(v.source.get('s0.0')!.get(1)).toBe('default');
    expect(v.source.get('s0.1')!.get(1)).toBe('personal');
  });
  it('fichier publié', () => {
    const b = { t: [rangeFor(S, 's0.0', 0, 'a')!], vide: [] };
    expect(parseHideBook(JSON.parse(serializeHideBook(b)))).toEqual({ t: b.t });
    expect(() => parseHideBook([])).toThrow();
  });
});
