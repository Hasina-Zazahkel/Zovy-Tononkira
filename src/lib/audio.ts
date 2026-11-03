/**
 * Pistes audio : fichiers publiés (catalogue), fichiers ajoutés dans l'éditeur (en attente, IndexedDB),
 * et téléchargement hors ligne à la demande (Cache API, par morceau).
 */
import { computed, signal } from '@preact/signals';
import { EDITION } from '../edition';
import { catalog } from './catalog';
import { kvGet, kvSet } from './store';
import { audioPath, sortTracks, trackNames, type AudioTrack } from '../model/audio';

export const TRACKS = trackNames(EDITION.voices, EDITION.audioTracks);
const KEY = 'audio.pending.v1';
const CACHE = `${EDITION.storage}-audio`;
const BASE = import.meta.env.BASE_URL;

export interface PendingAudio {
  songId: string;
  track: string;
  /** Nouveau fichier (absent = suppression de la piste publiée). */
  blob?: Blob;
  ext?: string;
  name?: string;
  at: number;
  publishedAt?: number;
}

/** Piste prête à jouer : publiée (url) ou locale (blob). */
export interface PlayableTrack {
  track: string;
  size: number;
  local?: Blob;
  published?: AudioTrack;
}

const keyOf = (songId: string, track: string) => `${songId}/${track}`;
export const audioPending = signal<Record<string, PendingAudio>>({});
export const audioUnpublished = computed(() => Object.values(audioPending.value).filter((p) => !p.publishedAt));

const published = (songId: string): AudioTrack[] => catalog.value?.songs.get(songId)?.audio ?? [];

export async function loadAudioPending() {
  const stored = (await kvGet<Record<string, PendingAudio>>(KEY)) ?? {};
  const builtAt = catalog.value?.builtAt;
  const kept: Record<string, PendingAudio> = {};
  // Envoyé et la version en ligne a été construite après l'envoi : c'est elle qui fait foi
  for (const [k, p] of Object.entries(stored)) if (!(p.publishedAt && builtAt && builtAt > p.publishedAt)) kept[k] = p;
  audioPending.value = kept;
  if (Object.keys(kept).length !== Object.keys(stored).length) await kvSet(KEY, kept);
}

async function save(next: Record<string, PendingAudio>) {
  audioPending.value = next;
  await kvSet(KEY, next);
}

export async function setTrackFile(songId: string, track: string, file: File, ext: string) {
  await save({ ...audioPending.value, [keyOf(songId, track)]: { songId, track, blob: file, ext, name: file.name, at: Date.now() } });
}

export async function removeTrack(songId: string, track: string) {
  const k = keyOf(songId, track);
  const next = { ...audioPending.value };
  if (published(songId).some((t) => t.track === track)) next[k] = { songId, track, at: Date.now() };
  else delete next[k];
  await save(next);
}

export async function cancelTrack(songId: string, track: string) {
  const next = { ...audioPending.value };
  delete next[keyOf(songId, track)];
  await save(next);
}

export async function markAudioPublished(at = Date.now()) {
  const next: Record<string, PendingAudio> = {};
  for (const [k, p] of Object.entries(audioPending.value)) next[k] = p.publishedAt ? p : { ...p, publishedAt: at };
  await save(next);
}

export const pendingFor = (songId: string, track: string): PendingAudio | undefined => audioPending.value[keyOf(songId, track)];

/** Pistes du morceau, modifications locales comprises, dans l'ordre des pupitres. */
export function tracksFor(songId: string): PlayableTrack[] {
  const map = new Map<string, PlayableTrack>();
  for (const t of published(songId)) map.set(t.track, { track: t.track, size: t.size, published: t });
  for (const p of Object.values(audioPending.value)) {
    if (p.songId !== songId) continue;
    if (p.blob) map.set(p.track, { track: p.track, size: p.blob.size, local: p.blob });
    else map.delete(p.track);
  }
  return sortTracks([...map.values()], TRACKS);
}

/** Entrées à publier (chemin dans le dépôt + contenu ou suppression). */
export function audioPublishList(): { path: string; blob?: Blob; label: string; remove: string[] }[] {
  return audioUnpublished.value.map((p) => {
    // Remplacer une piste par un fichier d'une autre extension : retirer l'ancien
    const old = published(p.songId).find((t) => t.track === p.track);
    const path = p.blob ? audioPath(p.songId, p.track, p.ext ?? 'mp3') : old?.file ?? audioPath(p.songId, p.track, 'mp3');
    const remove = old && (!p.blob || old.file !== path) ? [old.file] : [];
    return { path, blob: p.blob, label: `${p.blob ? '♪' : '− ♪'} ${p.songId}/${p.track}`, remove };
  });
}

/* ---------- Hors ligne (Cache API) ---------- */

const urlOf = (t: AudioTrack) => `${BASE}${t.file}?v=${t.v}`;
const absUrl = (t: AudioTrack) => new URL(urlOf(t), location.href).href;
const cacheOk = () => typeof caches !== 'undefined';

/** Morceaux entièrement disponibles hors ligne (id → vrai). */
export const offlineSongs = signal<Record<string, boolean>>({});

export async function refreshOffline(songId: string): Promise<boolean> {
  const list = published(songId);
  let ok = list.length > 0 && cacheOk();
  if (ok) {
    const c = await caches.open(CACHE);
    for (const t of list) if (!(await c.match(urlOf(t)))) { ok = false; break; }
  }
  offlineSongs.value = { ...offlineSongs.value, [songId]: ok };
  return ok;
}

/** Télécharge toutes les pistes publiées du morceau. `onProgress` reçoit la fraction [0, 1]. */
export async function downloadSong(songId: string, onProgress?: (f: number) => void): Promise<void> {
  if (!cacheOk()) throw new Error('Ce navigateur ne permet pas le stockage hors ligne.');
  const list = published(songId);
  const total = list.reduce((n, t) => n + t.size, 0) || 1;
  const c = await caches.open(CACHE);
  let done = 0;
  for (const t of list) {
    if (await c.match(urlOf(t))) { done += t.size; onProgress?.(done / total); continue; }
    const res = await fetch(urlOf(t), { cache: 'no-store' });
    if (!res.ok) throw new Error(`Téléchargement impossible (${res.status})`);
    const blob = await res.blob();
    await c.put(urlOf(t), new Response(blob, { headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'audio/mpeg', 'Content-Length': String(blob.size) } }));
    done += t.size; onProgress?.(done / total);
  }
  // Anciennes versions de ces pistes : place libérée
  const keep = new Set(list.map(absUrl));
  for (const req of await c.keys()) if (req.url.includes(`/data/audio/${songId}/`) && !keep.has(req.url)) await c.delete(req);
  await refreshOffline(songId);
}

export async function removeOfflineSong(songId: string) {
  if (!cacheOk()) return;
  const c = await caches.open(CACHE);
  for (const req of await c.keys()) if (req.url.includes(`/data/audio/${songId}/`)) await c.delete(req);
  await refreshOffline(songId);
}

/** Place occupée par l'audio hors ligne (octets) et nombre de morceaux. */
export async function offlineUsage(): Promise<{ bytes: number; songs: number }> {
  if (!cacheOk()) return { bytes: 0, songs: 0 };
  const c = await caches.open(CACHE);
  let bytes = 0;
  const ids = new Set<string>();
  for (const req of await c.keys()) {
    const m = /\/data\/audio\/([^/]+)\//.exec(req.url);
    if (m) ids.add(m[1]);
    const res = await c.match(req);
    const len = Number(res?.headers.get('Content-Length'));
    bytes += Number.isFinite(len) && len > 0 ? len : (await res?.blob())?.size ?? 0;
  }
  return { bytes, songs: ids.size };
}

export async function clearOffline() {
  if (cacheOk()) await caches.delete(CACHE);
  offlineSongs.value = {};
}

/**
 * Source jouable : fichier local, sinon copie hors ligne, sinon réseau (lecture en continu).
 * Renvoie une URL et une fonction de libération (blob: URL).
 */
export async function sourceFor(t: PlayableTrack): Promise<{ url: string; offline: boolean; release: () => void }> {
  const blobUrl = (b: Blob) => { const u = URL.createObjectURL(b); return { url: u, release: () => URL.revokeObjectURL(u) }; };
  if (t.local) return { ...blobUrl(t.local), offline: true };
  const p = t.published!;
  if (cacheOk()) {
    try {
      const hit = await (await caches.open(CACHE)).match(urlOf(p));
      if (hit) return { ...blobUrl(await hit.blob()), offline: true };
    } catch { /* lecture réseau */ }
  }
  return { url: urlOf(p), offline: false, release: () => {} };
}
