import { describe, expect, it } from 'vitest';
import { parseChordPro } from '../src/model/chordpro';
import { flatLines, makeNote, mergeBooks, parseNotesExport, parseNotesFile, resolveNotes } from '../src/model/personal';

const song = (body: string) => parseChordPro('t', `{title: T}\n{artist: A}\n\n${body}`).song;
const S1 = song('Ilay tsiky\nNo mba zavatra\n\n{section: REFRAIN}\nKa ny zavatra ataoko\nToa manjary\n\nKa ny zavatra ataoko\nToa manjary\n');

describe('notes personnelles', () => {
  it('lignes à plat (clé de strophe + index)', () => {
    expect(flatLines(S1).map((f) => `${f.key}:${f.line}`)).toEqual(['s0.0:0', 's0.0:1', 's1.0:0', 's1.0:1', 's1.1:0', 's1.1:1']);
  });
  it('rattachée au texte : refrain répété départagé par la position', () => {
    const n = makeNote(S1, 's1.1', 0, 1, 'vert', 'respirer', 'x')!;
    expect(n.lines).toEqual(['Ka ny zavatra ataoko', 'Toa manjary']);
    const r = resolveNotes(S1, [n]);
    expect([...r.marks.keys()]).toEqual(['s1.1']);
    expect(r.marks.get('s1.1')!.get(0)).toMatchObject({ first: true, last: false, note: 'respirer', color: 'vert' });
  });
  it('suit les lignes si le morceau change ; sinon « à replacer »', () => {
    const n = makeNote(S1, 's0.0', 1, 1, 'rose', '', 'y')!;
    const moved = song('Nouveau couplet\n\nIlay tsiky\nNO MBA ZAVATRA !\n');
    expect(resolveNotes(moved, [n]).marks.get('s0.1')?.get(1)?.id).toBe('y');
    const gone = song('Autre chose\n');
    expect(resolveNotes(gone, [n]).orphans.map((o) => o.id)).toEqual(['y']);
  });
  it('les groupes publiés n\'empêchent pas le rattachement', () => {
    const withGroup = song('[vert «Misa» Ilay tsiky\nNo mba zavatra]\n');
    const n = makeNote(S1, 's0.0', 0, 1, 'bleu', '', 'z')!;
    expect(resolveNotes(withGroup, [n]).orphans).toEqual([]);
  });
  it('export / import', () => {
    const n = makeNote(S1, 's0.0', 0, 0, 'bleu', 'a', 'k')!;
    const book = parseNotesExport(JSON.parse(JSON.stringify({ notes: { t: [n] } }))).chanteur;
    expect(book.t[0].id).toBe('k');
    expect(parseNotesExport({ notes: { chanteur: {}, musicien: { t: [n] } } }).musicien.t[0].id).toBe('k');
    expect(mergeBooks({ t: [{ ...n, note: 'vieux', updatedAt: 1 }] }, book).t[0].note).toBe('a');
    expect(() => parseNotesFile({ t: [{ id: 1 }] })).toThrow();
  });
});
