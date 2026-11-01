import { computed, signal } from '@preact/signals';
import { applyOverride, isNoop, type SongOverride } from '../model/overrides';
import type { Song } from '../model/types';
import { catalog } from './catalog';
import { kvGet, kvSet } from './store';

const KEY = 'overrides.v1';

/** Modifications locales, par id de morceau. */
export const overrides = signal<Record<string, SongOverride>>({});
export const overridesReady = signal(false);

/** Modifs pas encore envoyées sur GitHub. */
export const unpublished = computed(() =>
  Object.values(overrides.value).filter((o) => !o.publishedAt || o.updatedAt > o.publishedAt));

async function persist() {
  await kvSet(KEY, overrides.value);
}

/** À appeler une fois le catalogue chargé : retire les modifs déjà intégrées à la version publiée. */
export async function loadOverrides() {
  const stored = (await kvGet<Record<string, SongOverride>>(KEY)) ?? {};
  const cat = catalog.value;
  const kept: Record<string, SongOverride> = {};
  for (const [id, ov] of Object.entries(stored)) {
    const base = cat?.songs.get(id);
    if (base && !isNoop(base, ov)) kept[id] = ov;
  }
  overrides.value = kept;
  overridesReady.value = true;
  if (Object.keys(kept).length !== Object.keys(stored).length) await persist();
}

export async function saveOverride(ov: SongOverride) {
  const base = catalog.value?.songs.get(ov.songId);
  const next = { ...overrides.value };
  if (base && isNoop(base, ov)) delete next[ov.songId];
  else next[ov.songId] = ov;
  overrides.value = next;
  await persist();
}

export async function dropOverride(songId: string) {
  const next = { ...overrides.value };
  delete next[songId];
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
