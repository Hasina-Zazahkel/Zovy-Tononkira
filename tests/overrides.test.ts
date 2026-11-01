import { describe, expect, it } from 'vitest';
import { parseChordPro, serializeChordPro } from '../src/model/chordpro';
import { applyOverride, cleanAssignments, isNoop } from '../src/model/overrides';
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
