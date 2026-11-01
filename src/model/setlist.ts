import type { Setlist } from './types';

/** Opérations pures sur un répertoire (retournent une copie). */

const clone = (sl: Setlist): Setlist => ({ ...sl, parts: sl.parts.map((p) => ({ ...p, songIds: [...p.songIds] })) });

export function findSong(sl: Setlist, songId: string): { part: number; index: number } | null {
  for (let p = 0; p < sl.parts.length; p++) {
    const i = sl.parts[p].songIds.indexOf(songId);
    if (i >= 0) return { part: p, index: i };
  }
  return null;
}

export function addSong(sl: Setlist, part: number, songId: string): Setlist {
  if (findSong(sl, songId) || !sl.parts[part]) return sl;
  const n = clone(sl);
  n.parts[part].songIds.push(songId);
  return n;
}

export function removeSong(sl: Setlist, part: number, index: number): Setlist {
  const n = clone(sl);
  n.parts[part]?.songIds.splice(index, 1);
  return n;
}

/**
 * Déplace d'un cran. En haut d'une partie, ↑ passe à la fin de la partie précédente ;
 * en bas, ↓ passe au début de la partie suivante.
 */
export function moveSong(sl: Setlist, part: number, index: number, dir: -1 | 1): Setlist {
  const n = clone(sl);
  const list = n.parts[part].songIds;
  const target = index + dir;
  if (target >= 0 && target < list.length) {
    [list[index], list[target]] = [list[target], list[index]];
    return n;
  }
  const other = n.parts[part + dir];
  if (!other) return sl;
  const [id] = list.splice(index, 1);
  if (dir === -1) other.songIds.push(id);
  else other.songIds.unshift(id);
  return n;
}

export const canMove = (sl: Setlist, part: number, index: number, dir: -1 | 1): boolean =>
  dir === -1 ? part > 0 || index > 0 : part < sl.parts.length - 1 || index < sl.parts[part].songIds.length - 1;

export function addPart(sl: Setlist, name: string): Setlist {
  const n = clone(sl);
  n.parts.push({ name: name.trim() || `Partie ${n.parts.length + 1}`, songIds: [] });
  return n;
}

export function renamePart(sl: Setlist, part: number, name: string): Setlist {
  const n = clone(sl);
  if (n.parts[part] && name.trim()) n.parts[part].name = name.trim();
  return n;
}

export function deletePart(sl: Setlist, part: number): Setlist {
  const n = clone(sl);
  n.parts.splice(part, 1);
  return n;
}

/** Forme canonique du fichier data/setlists/<id>.json. */
export function serializeSetlist(sl: Setlist): string {
  const { id, name, parts } = sl;
  return JSON.stringify({ id, name, parts: parts.map((p) => ({ name: p.name, songIds: p.songIds })) }, null, 2) + '\n';
}

export const sameSetlist = (a: Setlist, b: Setlist) => serializeSetlist(a) === serializeSetlist(b);
