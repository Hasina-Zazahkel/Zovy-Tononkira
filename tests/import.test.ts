import { describe, expect, it } from 'vitest';
import { serializeChordPro } from '../src/model/chordpro';
import { IMPORT_TEMPLATE, parseImport, parseKeyLoose } from '../src/model/importText';

const numbered = `1 - Mila tsiky
2 - Ma'zik'
3 - Misa - Soprano / Hasina - Lead / Toky - Ténor / Ke - haut
4 - Haja - Guitare / Toky - Guitare classique / Manitra - Djembé
5 - Ré / Capo 5
6 - Parole de la chanson
Intro - guitare seule

ligne 1 - Misa seule
ligne 2
ligne 3 x2\tx2

ligne 4
ligne 5 - doucement x2
ligne 6\tx2

Interlude - guitare

ligne 7
ligne 8
ligne 9

Outro - comme l'intro
`;

describe('format numéroté (celui de Hasina)', () => {
  const [r] = parseImport(numbered);
  const cho = serializeChordPro(r.song);
  it('en-tête', () => {
    expect(r.song.title).toBe('MILA TSIKY');
    expect(r.song.artist).toBe("MA'ZIK'");
    expect(r.song.key).toEqual({ root: 'RE' });
    expect(r.song.notes).toBe('Capo 5');
    expect(r.song.singers).toEqual([{ member: 'Misa', role: 'Soprano' }, { member: 'Hasina', role: 'Lead' }, { member: 'Toky', role: 'Ténor' }, { member: 'Ke', role: 'Soprano' }]);
    expect(r.song.musicians).toEqual([{ member: 'Haja', role: 'Guitare' }, { member: 'Toky', role: 'Guitare' }, { member: 'Manitra' }]);
  });
  it('corps', () => {
    expect(cho.split('\n\n').slice(1).join('\n\n')).toBe(`{intro: Guitare seule}

{repeat: 2}
ligne 1 // Misa seule
ligne 2
ligne 3 [×2]

{repeat: 2}
ligne 4
ligne 5 [×2] // doucement
ligne 6

{interlude: Guitare}

ligne 7
ligne 8
ligne 9

{outro: Comme l'intro}
`);
  });
  it('compte rendu', () => {
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([
      '« haut » (Ke) compris comme « Soprano »',
      '« Guitare classique » (Toky) compris comme « Guitare »',
      'Instrument « Djembé » (Manitra) non reconnu : à choisir dans l\'éditeur',
    ]);
    expect(r.found).toContain('2 paragraphes répétés');
    expect(r.found).toContain('3 intro / interlude / outro');
  });
});

describe('format à étiquettes + améliorations', () => {
  it('modèle fourni : valide après remplissage', () => {
    const t = IMPORT_TEMPLATE.replace('Titre :', 'Titre : Test').replace('Artiste :', 'Artiste : Zovy');
    const [r] = parseImport(t);
    expect(r.errors).toEqual([]);
    expect(r.song.sections.find((s) => s.label === 'REFRAIN')?.voices).toEqual([{ member: '*', role: 'Chœur' }]);
    expect(r.song.sections[1].repeats).toEqual([2]);
  });
  it('x2 seul sous le paragraphe = paragraphe répété ; [x3] aussi', () => {
    const [r] = parseImport('Titre : A\nArtiste : B\n\nl1\nl2\nx2\n\nl3\n[x3]\n');
    expect(r.song.sections[0].repeats).toEqual([2, 3]);
  });
  it('ordre libre, lignes facultatives, sans tonalité', () => {
    const [r] = parseImport('Artiste : B\nTitre : A\n\nla\n');
    expect([r.song.title, r.song.artist, r.song.key]).toEqual(['A', 'B', undefined]);
  });
  it('erreurs bloquantes', () => expect(parseImport('juste une ligne')[0].errors).toEqual(['Titre manquant', 'Artiste manquant']));
  it('plusieurs chansons séparées par ---, identifiants uniques, doublon détecté', () => {
    const existing = [{ id: 'a', title: 'A', artist: 'B', tags: [], medley: [], singers: [], musicians: [], sections: [] }];
    const rs = parseImport('Titre : A\nArtiste : B\n\nx\n---\nTitre : A\nArtiste : C\n\ny\n', existing);
    expect(rs.map((r) => r.song.id)).toEqual(['a-2', 'a-3']);
    expect(rs[0].duplicateOf).toBe('a');
    expect(rs[1].duplicateOf).toBeUndefined();
  });
});

describe('tonalité', () => {
  it.each([['Ré', 'RE'], ['RE', 'RE'], ['Sib', 'SIb'], ['Si b', 'SIb'], ['Do#', 'DO#'], ['Fa dièse', 'FA#'], ['la mineur', 'LA'], ['Mi bémol', 'MIb']])('%s', (raw, k) => {
    const key = parseKeyLoose(raw)!;
    expect(key.root + (key.accidental ?? '')).toBe(k);
  });
  it('inconnue', () => expect(parseKeyLoose('capo 5')).toBeUndefined());
});

describe('exemple affiché dans la case', () => {
  it('se lit sans erreur', async () => {
    const { IMPORT_EXAMPLE } = await import('../src/model/importText');
    const [r] = parseImport(IMPORT_EXAMPLE.replace('(morceau suivant…)', ''));
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.song.sections.find((s) => s.label === 'REFRAIN')?.voices).toEqual([{ member: '*', role: 'Chœur' }]);
    expect(serializeChordPro(r.song)).toContain('{repeat: 2}\nIlay tsiky avy aminao // Misa seule\nNo mba zavatra tsy foiko [×2]');
  });
});
