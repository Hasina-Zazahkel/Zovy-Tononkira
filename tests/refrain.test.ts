import { describe, expect, it } from 'vitest';
import { parseChordPro, serializeChordPro } from '../src/model/chordpro';
import { textToItems, itemsToBody } from '../src/model/edit';
import { parseImport } from '../src/model/importText';
import { applyRefrains, refrainMarker } from '../src/model/refrain';

const song = (body: string) => parseChordPro('t', `{title: T}\n{artist: A}\n\n${body}`).song;
const body = (s: ReturnType<typeof song>) => serializeChordPro(s).split('\n').slice(3).join('\n');

describe('refrain', () => {
  it.each([['REF:', undefined, ''], ['Ref.1:', 1, ''], ['REF.2 :', 2, ''], ['ref: Iza re,', undefined, 'Iza re,'], ['(refrain)', undefined, ''], ['REF…', undefined, ''], ['Ref', undefined, ''], ['RefRain :', undefined, ''], ['FIV:', undefined, ''], ['Fiv: Tsapako', undefined, 'Tsapako'], ['FIV:ka tsara....', undefined, ''], ['CHORUS', undefined, '']])(
    '%s', (l, num, rest) => expect(refrainMarker(l)).toMatchObject({ ...(num ? { num } : {}), rest }));
  it('pas un marqueur', () => {
    expect(refrainMarker('Refesy aho')).toBeNull();
    expect(refrainMarker('Refrain bis en La la la')).toBeNull();
    expect(refrainMarker('Ilay ref')).toBeNull();
    expect(refrainMarker('Fivoarana')).toBeNull();
  });
  it('paragraphe, reprise recopiée, section suivante sans nom', () => {
    const { song: s, report } = applyRefrains(song('c1\n\nREF:\nr1\nr2\n\nc2\n\nREF…\n'));
    expect(report).toHaveLength(2);
    expect(body(s)).toBe('c1\n\n{section: REFRAIN}\nr1\nr2\n\n{section}\nc2\n\n{section: REFRAIN}\nr1\nr2\n');
  });
  it('texte sur la ligne du marqueur, numéros, marqueur au milieu d\'un paragraphe', () => {
    const { song: s } = applyRefrains(song('c1\nRef.1: Satria [×2]\nr2\n'));
    expect(body(s)).toBe('c1\n\n{section: REFRAIN 1}\nSatria [×2]\nr2\n');
  });
  it('reprise sans refrain connu : titre seul (avec ×N)', () => {
    expect(body(applyRefrains(song('c1\n\nREFRAIN [×2]\n')).song)).toBe('c1\n\n{section: REFRAIN ×2}\n');
  });
  it('mode Texte et import', () => {
    const t = textToItems(song('x\n'), 'c1\n\nREF:\nr1\n\nc2\n');
    expect(itemsToBody(t.items)).toBe('c1\n\n{section: REFRAIN}\nr1\n\n{section}\nc2\n');
    const [r] = parseImport('Titre : A\nArtiste : B\n\nc1\n\nREF: r1\nr2\n\nc2\n\nREF\n');
    expect(r.song.sections.map((x) => x.label ?? '')).toEqual(['', 'REFRAIN', '', 'REFRAIN']);
    expect(r.found).toContain('2 refrains (REF) reconnus');
  });
});
