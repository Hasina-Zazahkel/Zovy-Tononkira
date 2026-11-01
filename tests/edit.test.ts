import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseChordPro, serializeChordPro } from '../src/model/chordpro';
import { bodyToText, itemsToBody, mergeWithPrevious, sectionsToText, splitStanza, textToItems, toItems, withItems, type Item } from '../src/model/edit';

const src = `{title: T}
{artist: A}

{intro: guitare}

l1
l2 [×2]

{section: ZOMA}
{voices: Hasina=Lead}
{repeat: 2}
l3

{section}
l4

{outro}
`;
const song = parseChordPro('t', src).song;
const id = <T extends Item>(x: Item) => x as T;

describe('éléments', () => {
  it('toItems', () => {
    expect(toItems(song.sections).map((i) => i.kind)).toEqual(['cue', 'stanza', 'section', 'stanza', 'section', 'stanza', 'cue']);
  });
  it('aller-retour sans perte', () => expect(serializeChordPro(withItems(song, toItems(song.sections)).song)).toBe(src));
  it('paragraphes vides ignorés', () => {
    const items: Item[] = [{ kind: 'stanza', lines: ['a', '  '], repeat: 1 }, { kind: 'stanza', lines: [''], repeat: 3 }];
    expect(itemsToBody(items)).toBe('a\n');
  });
  it('couper / fusionner', () => {
    const items: Item[] = [{ kind: 'stanza', lines: ['a', 'b', 'c'], repeat: 2 }];
    const cut = splitStanza(items, 0, 0, id);
    expect(cut).toEqual([{ kind: 'stanza', lines: ['a'], repeat: 2 }, { kind: 'stanza', lines: ['b', 'c'], repeat: 1 }]);
    expect(mergeWithPrevious(cut, 1, id)).toEqual(items);
  });
});

describe('mode texte', () => {
  const text = sectionsToText(song);
  it('notation lisible', () => {
    expect(text).toBe('[intro: guitare]\n\nl1\nl2 [×2]\n\n[section: ZOMA]\n[voix: Hasina=Lead]\n[×2]\nl3\n\n[section]\nl4\n\n[outro]\n');
  });
  it('texte → éléments → même morceau', () => {
    const { items, warnings } = textToItems(song, text);
    expect(warnings).toEqual([]);
    expect(serializeChordPro(withItems(song, items).song)).toBe(src);
  });
  it('saisie libre tolérée : [x4], [X2], majuscules', () => {
    const { items } = textToItems(song, '[INTERLUDE: solo]\n\nla la [x4]\n[X2]\nho ho\n');
    expect(itemsToBody(items)).toBe('{interlude: solo}\n\nla la [×4]\n\n{repeat: 2}\nho ho\n');
  });
  it('balise inconnue signalée', () => expect(textToItems(song, '[refrain]\nla\n').warnings[0]).toContain('[refrain]'));
  it('bodyToText inverse', () => expect(bodyToText('{interlude: x}\n{repeat: 3}\nl\n')).toBe('[interlude: x]\n[×3]\nl\n'));
});

describe('catalogue réel : Blocs et Texte sans perte', () => {
  const DIR = join(__dirname, '../data/songs');
  it.each(readdirSync(DIR).filter((f) => f.endsWith('.cho')))('%s', (f) => {
    const raw = readFileSync(join(DIR, f), 'utf8');
    const s = parseChordPro(f.slice(0, -4), raw).song;
    expect(serializeChordPro(withItems(s, toItems(s.sections)).song)).toBe(raw);
    expect(serializeChordPro(withItems(s, textToItems(s, sectionsToText(s)).items).song)).toBe(raw);
  });
});

describe('mode texte : commentaire de ligne', () => {
  it('« // » et [x4] combinés', () => {
    const { items } = textToItems(song, 'la la [x4] // Misa seule\nho ho //  piano \n');
    expect(itemsToBody(items)).toBe('la la [×4] // Misa seule\nho ho // piano\n');
  });
});
