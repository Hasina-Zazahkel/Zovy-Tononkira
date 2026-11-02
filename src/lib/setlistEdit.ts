import { computed, signal } from '@preact/signals';
import { addSong, findSong, removeSong, sameSetlist } from '../model/setlist';
import type { Setlist } from '../model/types';
import { catalog } from './catalog';
import { kvDel, kvGet, kvSet } from './store';

const KEY = 'setlistOverride.v1';

export interface SetlistOverride {
  setlist: Setlist;
  updatedAt: number;
  publishedAt?: number;
}

/** Répertoire modifié sur cet appareil, pas encore reçu dans la version publiée. */
export const setlistOverride = signal<SetlistOverride | null>(null);

export const setlistUnpublished = computed(() => {
  const o = setlistOverride.value;
  return !!o && (!o.publishedAt || o.updatedAt > o.publishedAt);
});

/** Répertoire publié (le seul du groupe). */
export const baseSetlist = (): Setlist | undefined => catalog.value?.setlists[0];

/** Répertoire affiché : version locale si elle existe. */
export const currentSetlist = computed<Setlist | undefined>(() => {
  const base = catalog.value?.setlists[0];
  const o = setlistOverride.value;
  return o && base && o.setlist.id === base.id ? o.setlist : base;
});

export async function loadSetlistOverride() {
  const o = await kvGet<SetlistOverride>(KEY);
  const base = baseSetlist();
  const sentAndBuilt = !!o?.publishedAt && o.updatedAt <= o.publishedAt && (catalog.value?.builtAt ?? 0) > o.publishedAt;
  if (o && base && o.setlist.id === base.id && !sameSetlist(o.setlist, base) && !sentAndBuilt) setlistOverride.value = o;
  else if (o) await kvDel(KEY);
}

/** Enregistre une nouvelle version du répertoire (appelé à chaque action d'édition). */
export async function saveSetlist(next: Setlist) {
  const base = baseSetlist();
  if (base && sameSetlist(next, base)) {
    setlistOverride.value = null;
    await kvDel(KEY);
    return;
  }
  const o: SetlistOverride = { setlist: next, updatedAt: Date.now(), publishedAt: setlistOverride.value?.publishedAt };
  setlistOverride.value = o;
  await kvSet(KEY, o);
}

export async function dropSetlistOverride() {
  setlistOverride.value = null;
  await kvDel(KEY);
}

export async function markSetlistPublished(at = Date.now()) {
  const o = setlistOverride.value;
  if (!o) return;
  setlistOverride.value = { ...o, publishedAt: at };
  await kvSet(KEY, setlistOverride.value);
}

/** Retire un morceau du répertoire (suppression du morceau). */
export async function removeFromSetlist(songId: string) {
  let sl = currentSetlist.value;
  if (!sl) return;
  for (let at = findSong(sl, songId); at; at = findSong(sl, songId)) sl = removeSong(sl, at.part, at.index);
  if (sl !== currentSetlist.value) await saveSetlist(sl);
}

/** Ajoute des morceaux à une partie du répertoire (création). */
export async function addToSetlist(part: number, songIds: string[]) {
  let sl = currentSetlist.value;
  if (!sl || part < 0) return;
  for (const id of songIds) sl = addSong(sl, part, id);
  if (sl !== currentSetlist.value) await saveSetlist(sl);
}
