import { describe, expect, it } from 'vitest';
import { addPart, addSong, canMove, deletePart, findSong, moveSong, removeSong, renamePart, serializeSetlist } from '../src/model/setlist';
import type { Setlist } from '../src/model/types';

const sl: Setlist = { id: 'r', name: 'Répertoire', parts: [{ name: 'P1', songIds: ['a', 'b'] }, { name: 'P2', songIds: ['c'] }] };
const ids = (s: Setlist) => s.parts.map((p) => p.songIds.join(''));

describe('répertoire', () => {
  it('ajoute sans doublon', () => {
    expect(ids(addSong(sl, 1, 'd'))).toEqual(['ab', 'cd']);
    expect(addSong(sl, 1, 'a')).toBe(sl);
  });
  it('retire', () => expect(ids(removeSong(sl, 0, 0))).toEqual(['b', 'c']));
  it('déplace dans une partie', () => expect(ids(moveSong(sl, 0, 0, 1))).toEqual(['ba', 'c']));
  it('↓ en bas de partie → début de la suivante', () => expect(ids(moveSong(sl, 0, 1, 1))).toEqual(['a', 'bc']));
  it('↑ en haut de partie → fin de la précédente', () => expect(ids(moveSong(sl, 1, 0, -1))).toEqual(['abc', '']));
  it('bornes', () => {
    expect(canMove(sl, 0, 0, -1)).toBe(false);
    expect(canMove(sl, 1, 0, 1)).toBe(false);
    expect(moveSong(sl, 0, 0, -1)).toBe(sl);
  });
  it('parties : ajout, renommage, suppression', () => {
    expect(addPart(sl, '  ').parts[2].name).toBe('Partie 3');
    expect(renamePart(sl, 0, 'Ouverture').parts[0].name).toBe('Ouverture');
    expect(renamePart(sl, 0, ' ').parts[0].name).toBe('P1');
    expect(ids(deletePart(sl, 0))).toEqual(['c']);
  });
  it('findSong', () => expect(findSong(sl, 'c')).toEqual({ part: 1, index: 0 }));
  it('immuable', () => { moveSong(sl, 0, 0, 1); expect(ids(sl)).toEqual(['ab', 'c']); });
  it('sérialisation canonique', () => expect(serializeSetlist({ ...sl, updatedAt: 5 })).not.toContain('updatedAt'));
});
