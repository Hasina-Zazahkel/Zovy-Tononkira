import { describe, expect, it } from 'vitest';
import { parseChordPro, serializeChordPro } from '../src/model/chordpro';
import { applyOverride, cleanAssignments, isNoop, prune } from '../src/model/overrides';
import { mapLegacyInstrument, mapLegacyVoice } from '../src/model/roles';

const base = parseChordPro('t', `{title: T}
{artist: A}
{singers: Hasina=Lead}

{section: ZOMA}
{voices: Misa=Soprano}
l1

{section: REFRAIN}
l2
`).song;

describe('applyOverride', () => {
  it('remplace chanteurs, musiciens et voix de section', () => {
    const { song, skipped } = applyOverride(base, {
      songId: 't', updatedAt: 1,
      singers: [{ member: 'Hasina', role: 'Lead' }, { member: 'Toky', role: 'Ténor' }],
      musicians: [{ member: 'Haja', role: 'Guitare basse' }],
      sectionVoices: { s0: [], s1: [{ member: 'Ke', role: 'Alto' }] },
      sectionLabels: { s0: 'ZOMA', s1: 'REFRAIN' },
    });
    expect(skipped).toEqual([]);
    expect(serializeChordPro(song)).toBe(`{title: T}
{artist: A}
{singers: Hasina=Lead, Toky=Ténor}
{musicians: Haja=Guitare basse}

{section: ZOMA}
l1

{section: REFRAIN}
{voices: Ke=Alto}
l2
`);
  });
  it('ignore une section restructurée (label différent)', () => {
    const { song, skipped } = applyOverride(base, {
      songId: 't', updatedAt: 1, sectionVoices: { s1: [{ member: 'Ke' }] }, sectionLabels: { s1: 'AUTRE' },
    });
    expect(skipped).toEqual(['s1']);
    expect(song.sections[1].voices).toBeUndefined();
  });
  it('commentaire : ajout, remplacement, suppression', () => {
    expect(applyOverride(base, { songId: 't', updatedAt: 1, notes: ' Capo 5 ' }).song.notes).toBe('Capo 5');
    const withNote = { ...base, notes: 'Capo 7' };
    expect(applyOverride(withNote, { songId: 't', updatedAt: 1, notes: '' }).song.notes).toBeUndefined();
    expect(applyOverride(withNote, { songId: 't', updatedAt: 1 }).song.notes).toBe('Capo 7');
  });
  it('isNoop détecte une modif déjà publiée', () => {
    expect(isNoop(base, { songId: 't', updatedAt: 1, singers: [{ member: 'Hasina', role: 'Lead' }] })).toBe(true);
    expect(isNoop(base, { songId: 't', updatedAt: 1, singers: [] })).toBe(false);
  });
});

describe('cleanAssignments', () => {
  it('nettoie la saisie', () => {
    expect(cleanAssignments([
      { member: '  misa ', role: 'Soprano' }, { member: '', role: 'Alto' }, { member: 'Tous', role: 'Chœur' },
      { member: 'Misa', role: 'Soprano' }, { member: 'Ke, x=y' },
    ])).toEqual([{ member: 'Misa', role: 'Soprano' }, { member: '*', role: 'Chœur' }, { member: 'Ke x y' }]);
  });
});

describe('listes fermées', () => {
  it.each([['lead 2eme', 'Lead'], ['haut', 'Soprano'], ['bas', 'Alto'], ['tenor refrain', 'Ténor'], ['chœur 3 voix', 'Chœur'], ['5 voix', 'Chœur'], ['taraisy', undefined]])(
    'voix %s → %s', (a, b) => expect(mapLegacyVoice(a)).toBe(b));
  it.each([['basse', 'Guitare basse'], ['batterie', 'Percussion'], ['clavier +6 (fa/re)', 'Clavier'], ['sax', 'Sax'], ['guitare', 'Guitare']])(
    'instrument %s → %s', (a, b) => expect(mapLegacyInstrument(a)).toBe(b));
});

describe('repères instrumentaux', () => {
  const s = parseChordPro('t', '{title: T}\n{artist: A}\n\nl1\n\n{interlude: guitare}\n\nl2\n').song;
  it('change catégorie et commentaire', () => {
    const r = applyOverride(s, { songId: 't', updatedAt: 1, cues: { s1: { cue: 'outro', note: '×2' } }, cueGuards: { s1: 'interlude|guitare' } });
    expect(r.song.sections[1]).toMatchObject({ cue: 'outro', label: '×2' });
    expect(serializeChordPro(r.song)).toContain('{outro: ×2}');
  });
  it('commentaire vidé', () => {
    const r = applyOverride(s, { songId: 't', updatedAt: 1, cues: { s1: { cue: 'interlude', note: '' } }, cueGuards: { s1: 'interlude|guitare' } });
    expect(r.song.sections[1].label).toBeUndefined();
  });
  it('ignoré si le repère a changé entre-temps', () => {
    const r = applyOverride(s, { songId: 't', updatedAt: 1, cues: { s1: { cue: 'outro', note: '' } }, cueGuards: { s1: 'intro|' } });
    expect(r.skipped).toEqual(['s1']);
  });
});

describe('prune : morceaux créés / supprimés', () => {
  const song = (id: string) => ({ id, title: id.toUpperCase(), artist: 'X', tags: [], medley: [], singers: [], musicians: [], sections: [{ id: 's1', kind: 'lyrics' as const, stanzas: [['la']] }] });
  const cho = '{title: N}\n{artist: X}\n\nla\n';
  it('créé absent du catalogue : gardé ; arrivé à l\'identique : retiré', () => {
    const ov = { n: { songId: 'n', cho, created: true, updatedAt: 1, publishedAt: 2 } };
    expect(Object.keys(prune(ov, new Map()))).toEqual(['n']);
    const arrived = new Map([['n', parseChordPro('n', cho).song]]);
    expect(prune(ov, arrived)).toEqual({});
  });
  it('supprimé : gardé tant que le fichier existe ou non envoyé', () => {
    const del = { a: { songId: 'a', deleted: true, updatedAt: 1, publishedAt: 2 } };
    expect(Object.keys(prune(del, new Map([['a', song('a')]])))).toEqual(['a']);
    expect(prune(del, new Map())).toEqual({});
    expect(Object.keys(prune({ a: { songId: 'a', deleted: true, updatedAt: 3 } }, new Map()))).toEqual(['a']);
  });
});

describe('synonymes d\'instruments', () => {
  it.each([['Djembé', 'Percussion'], ['cajón', 'Percussion'], ['Conga', 'Percussion'], ['Piano', 'Clavier'], ['synthé', 'Clavier'], ['Clavier', 'Clavier']])('%s', (raw, role) => {
    expect(mapLegacyInstrument(raw)).toBe(role);
  });
});

describe('prune : copie envoyée périmée', () => {
  it('retirée dès que la version reçue est postérieure à l\'envoi', () => {
    const base = parseChordPro('a', '{title: A}\n{artist: X}\n\nnouveau\n').song;
    const ov = { a: { songId: 'a', cho: '{title: A}\n{artist: X}\n\nancien\n', updatedAt: 100, publishedAt: 200 } };
    expect(Object.keys(prune(ov, new Map([['a', base]]), 150))).toEqual(['a']);
    expect(prune(ov, new Map([['a', base]]), 300)).toEqual({});
    const pending = { a: { ...ov.a, updatedAt: 400 } };
    expect(Object.keys(prune(pending, new Map([['a', base]]), 300))).toEqual(['a']);
  });
});
