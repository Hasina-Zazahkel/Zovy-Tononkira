import { computed, signal } from '@preact/signals';
import { parseChordPro } from '../model/chordpro';
import { applyOverride, isNoop, isPending, prune, type SongOverride } from '../model/overrides';
import type { Song } from '../model/types';
import { buildState, catalog, type CatalogState } from './catalog';
import { kvGet, kvSet } from './store';

const KEY = 'overrides.v1';

/** Modifications locales, par id de morceau. */
export const overrides = signal<Record<string, SongOverride>>({});
export const overridesReady = signal(false);


/** Modifs pas encore envoyées sur GitHub. */
export const unpublished = computed(() => Object.values(overrides.value).filter(isPending));

/**
 * Catalogue affiché : version publiée + modifs locales (morceaux modifiés, créés, supprimés).
 * C'est ce que voient l'accueil, la recherche, le répertoire et la scène.
 */
export const liveCatalog = computed<CatalogState | null>(() => {
  const cat = catalog.value;
  if (!cat) return null;
  const ovs = overrides.value;
  if (!Object.keys(ovs).length) return cat;
  const list: Song[] = [];
  for (const s of cat.songs.values()) {
    const o = ovs[s.id];
    if (o?.deleted) continue;
    list.push(o ? applyOverride(s, o).song : s);
  }
  for (const o of Object.values(ovs)) {
    if (o.created && !o.deleted && o.cho && !cat.songs.has(o.songId)) list.push(parseChordPro(o.songId, o.cho).song);
  }
  return buildState(list, cat.setlists);
});

async function persist() {
  await kvSet(KEY, overrides.value);
}

/** À appeler une fois le catalogue chargé : retire les modifs déjà intégrées à la version publiée. */
export async function loadOverrides() {
  const stored = (await kvGet<Record<string, SongOverride>>(KEY)) ?? {};
  overrides.value = prune(stored, catalog.value?.songs ?? new Map(), catalog.value?.builtAt);
  if (Object.keys(overrides.value).length !== Object.keys(stored).length) await persist();
}

export async function saveOverride(ov: SongOverride) {
  const base = catalog.value?.songs.get(ov.songId);
  const next = { ...overrides.value };
  if (base && isNoop(base, ov)) delete next[ov.songId];
  else next[ov.songId] = ov;
  overrides.value = next;
  await persist();
}

/** Enregistre plusieurs morceaux créés d'un coup (import multiple). */
export async function saveCreated(songs: { id: string; cho: string }[]) {
  const now = Date.now();
  const next = { ...overrides.value };
  for (const s of songs) next[s.id] = { songId: s.id, cho: s.cho, created: true, updatedAt: now };
  overrides.value = next;
  await persist();
}

export async function dropOverride(songId: string) {
  const next = { ...overrides.value };
  delete next[songId];
  overrides.value = next;
  await persist();
}

/**
 * Supprime un morceau. Créé ici et jamais envoyé : il disparaît simplement.
 * Sinon la suppression est enregistrée et sera publiée avec PUBLIER.
 */
export async function deleteSong(songId: string) {
  const o = overrides.value[songId];
  const published = catalog.value?.songs.has(songId);
  if (!published && o?.created && !o.publishedAt) return dropOverride(songId);
  const next = { ...overrides.value, [songId]: { songId, deleted: true, updatedAt: Date.now() } };
  overrides.value = next;
  await persist();
}

/** Version affichée d'un morceau : publiée + modifs locales. */
export function effectiveSong(base: Song): Song {
  return applyOverride(base, overrides.value[base.id]).song;
}

export async function markPublished(ids: string[], at = Date.now()) {
  const next = { ...overrides.value };
  for (const id of ids) if (next[id]) next[id] = { ...next[id], publishedAt: at };
  overrides.value = next;
  await persist();
}
