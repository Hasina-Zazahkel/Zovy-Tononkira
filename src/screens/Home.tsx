import { EDITION, FEATURES } from '../edition';
import { signal } from '@preact/signals';
import { useMemo, useState } from 'preact/hooks';
import { search } from '../lib/catalog';
import { liveCatalog } from '../lib/overrides';
import { canEdit } from '../lib/publish';
import { songHref } from '../lib/router';
import { currentSetlist } from '../lib/setlistEdit';
import { findSong } from '../model/setlist';
import { PickPartSheet } from './AddSheets';
import { displayKey } from '../model/chordpro';
import type { Song } from '../model/types';
import { IconChevron, IconClose, IconSearch } from '../ui/icons';

export function KeyBadge({ song }: { song: Song }) {
  return song.key ? <span class="key">{displayKey(song.key)}</span> : <span class="key empty">–</span>;
}

/** Ligne de morceau : lien vers la scène + (mode éditeur) bouton d'ajout au répertoire. */
function SongLine({ song, sub }: { song: Song; sub?: string }) {
  const [pick, setPick] = useState(false);
  const inSl = canEdit.value && currentSetlist.value ? !!findSong(currentSetlist.value, song.id) : false;
  return (
    <div class="song-line">
      <a class="song-row" href={songHref(song.id)}>
        <span class="t">{song.title}{sub && <span class="sub">{sub}</span>}</span>
        <KeyBadge song={song} />
      </a>
      {canEdit.value && (
        <button class={`plus${inSl ? ' in' : ''}`} onClick={() => setPick(true)}
          aria-label={inSl ? `${song.title} est dans le répertoire` : `Ajouter ${song.title} au répertoire`}>
          {inSl ? '✓' : '+'}
        </button>
      )}
      {pick && <PickPartSheet song={song} onClose={() => setPick(false)} />}
    </div>
  );
}

/** Recherche et artiste ouvert : partagés avec l'en-tête (barre A–Z masquée pendant une recherche). */
export const homeQuery = signal('');
const openArtist = signal<string | null>(null);

/** Initiale normalisée (sans accent) pour l'index A–Z. */
export const initial = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').charAt(0).toUpperCase();

export function Home() {
  const q = homeQuery;
  const open = openArtist;
  const state = liveCatalog.value;
  const hits = useMemo(() => (state ? search(state, q.value) : []), [state, q.value]);

  if (!state) return null;

  return (
    <>
      <div class="search">
        <IconSearch size={26} />
        <input
          type="search" inputMode="search" enterKeyHint="search" autoComplete="off" spellcheck={false}
          placeholder={EDITION.searchPlaceholder}
          value={q.value} onInput={(e) => { q.value = (e.target as HTMLInputElement).value; }}
          aria-label="Rechercher"
        />
        {q.value && <button class="clear" onClick={() => { q.value = ''; }} aria-label="Effacer"><IconClose size={26} /></button>}
      </div>
      {q.value.trim() ? (
        <SearchResults hits={hits} />
      ) : (
        !FEATURES.songList
          ? <ArtistList open={open.value} onToggle={(n) => { open.value = open.value === n ? null : n; }} />
          : <SongList />
      )}
    </>
  );
}

function SearchResults({ hits }: { hits: ReturnType<typeof search> }) {
  if (!hits.length) return <div class="state">Aucun résultat</div>;
  return (
    <div>
      <div class="count">{hits.length} résultat{hits.length > 1 ? 's' : ''}</div>
      <div class="songs-grid">
        {hits.map((h) => (
          <SongLine song={h.song} sub={h.excerpt ? `« ${h.excerpt} »` : FEATURES.artist ? h.song.artist : undefined} key={h.song.id} />
        ))}
      </div>
    </div>
  );
}

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

/** Tous les morceaux par ordre alphabétique du titre (édition sans artiste). */
export function sortedSongs(songs: Iterable<Song>): Song[] {
  return [...songs].sort((a, b) => collator.compare(a.title, b.title));
}

function SongList() {
  const state = liveCatalog.value!;
  const list = useMemo(() => sortedSongs(state.songs.values()), [state]);
  const seen = new Set<string>();
  return (
    <div>
      <div class="count-row">
        <div class="count">{list.length} chant{list.length > 1 ? 's' : ''}</div>
        {canEdit.value && <a class="btn small primary" href="#/nouveau">+ Nouveau chant</a>}
      </div>
      <div class="songs-grid chants">
        {list.flatMap((s) => {
          const l = initial(s.title);
          const nodes = [];
          if (!seen.has(l)) { seen.add(l); nodes.push(<div class="letter-head" id={`az-${l}`} key={`h-${l}`}><span>{l}</span></div>); }
          nodes.push(<SongLine song={s} sub={FEATURES.artist ? s.artist || undefined : undefined} key={s.id} />);
          return nodes;
        })}
      </div>
    </div>
  );
}

function ArtistList({ open, onToggle }: { open: string | null; onToggle: (name: string) => void }) {
  const state = liveCatalog.value!;
  const seen = new Set<string>();
  return (
    <div>
      <div class="count-row">
        <div class="count">{state.artists.length} artistes · {state.songs.size} morceaux</div>
        {canEdit.value && <a class="btn small primary" href="#/nouveau">+ Nouveau morceau</a>}
      </div>
      <div class="artists-grid">
        {state.artists.flatMap((a) => {
          const l = initial(a.name);
          const first = !seen.has(l);
          seen.add(l);
          const isOpen = open === a.name;
          const nodes = [];
          if (first) nodes.push(<div class="letter-head" id={`az-${l}`} key={`h-${l}`}><span>{l}</span></div>);
          nodes.push(
            <div class={`artist${isOpen ? ' is-open' : ''}`} key={a.name}>
              <button onClick={() => onToggle(a.name)} aria-expanded={isOpen}>
                <IconChevron size={24} />
                <span class="name">{a.name}</span>
                <span class="n">{a.songs.length}</span>
              </button>
              {isOpen && <div class="songs-grid">{a.songs.map((s) => <SongLine song={s} key={s.id} />)}</div>}
            </div>,
          );
          return nodes;
        })}
      </div>
    </div>
  );
}
