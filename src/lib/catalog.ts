import { FEATURES } from '../edition';
import { signal } from '@preact/signals';
import type { Catalog, Setlist, Song } from '../model/types';
import { normalize } from './text';
import { viewLines } from '../model/repeat';

export interface IndexedSong {
  song: Song;
  nTitle: string;
  nArtist: string;
  /** Lignes de paroles normalisées (pour l'extrait de résultat). */
  nLines: string[];
  lines: string[];
}

export interface ArtistGroup {
  name: string;
  songs: Song[];
}

export interface CatalogState {
  songs: Map<string, Song>;
  index: IndexedSong[];
  artists: ArtistGroup[];
  setlists: Setlist[];
  /** Date de construction de la version publiée (ms), si connue. */
  builtAt?: number;
}

/** Catalogue publié (tel que reçu). L'affichage utilise `liveCatalog` (publié + modifs locales). */
export const catalog = signal<CatalogState | null>(null);
export const catalogError = signal<string | null>(null);

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

export function buildState(list: Song[], setlists: Setlist[]): CatalogState {
  const songs = new Map(list.map((s) => [s.id, s]));
  const index = list.map((song) => {
    const lines = song.sections.flatMap((s) => s.stanzas.flatMap((st) => viewLines(st).map((v) => v.text)));
    return { song, nTitle: normalize(song.title), nArtist: normalize(song.artist), lines, nLines: lines.map(normalize) };
  });
  const byArtist = new Map<string, Song[]>();
  for (const s of list) {
    const list = byArtist.get(s.artist) ?? [];
    list.push(s);
    byArtist.set(s.artist, list);
  }
  const artists = [...byArtist]
    .map(([name, list]) => ({ name, songs: list.sort((a, b) => collator.compare(a.title, b.title)) }))
    .sort((a, b) => collator.compare(a.name, b.name));
  return { songs, index, artists, setlists };
}

export async function loadCatalog(): Promise<void> {
  try {
    const base = import.meta.env.BASE_URL;
    const [c, s] = await Promise.all([
      fetch(`${base}data/songs.json`).then((r) => r.json() as Promise<Catalog>),
      fetch(`${base}data/setlists.json`).then((r) => r.json() as Promise<Setlist[]>),
    ]);
    catalog.value = { ...buildState(c.songs, s), builtAt: Date.parse(c.builtAt) || undefined };
  } catch (e) {
    catalogError.value = e instanceof Error ? e.message : String(e);
  }
}

export interface SearchHit {
  song: Song;
  /** Extrait de paroles si la correspondance n'est pas dans le titre/artiste. */
  excerpt?: string;
  score: number;
}

export function search(state: CatalogState, query: string): SearchHit[] {
  const q = normalize(query);
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const it of state.index) {
    let score = 0;
    let excerpt: string | undefined;
    if (it.nTitle.startsWith(q)) score = 100;
    else if (it.nTitle.includes(q)) score = 80;
    else if (FEATURES.artist && it.nArtist.includes(q)) score = 60;
    else {
      const i = it.nLines.findIndex((l) => l.includes(q));
      if (i >= 0) { score = 30; excerpt = it.lines[i].trim(); }
    }
    if (score) hits.push({ song: it.song, excerpt, score });
  }
  return hits
    .sort((a, b) => b.score - a.score || collator.compare(a.song.title, b.song.title));
}

/** Ordre de lecture d'une setlist, toutes parties confondues. */
export function flattenSetlist(sl: Setlist): { songId: string; part: string }[] {
  return sl.parts.flatMap((p) => p.songIds.map((songId) => ({ songId, part: p.name })));
}
