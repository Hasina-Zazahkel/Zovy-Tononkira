import { useSignal } from '@preact/signals';
import { useMemo, useState } from 'preact/hooks';
import { catalog, search } from '../lib/catalog';
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

export function Home() {
  const q = useSignal('');
  const open = useSignal<string | null>(null);
  const state = catalog.value;
  const hits = useMemo(() => (state ? search(state, q.value) : []), [state, q.value]);

  if (!state) return null;

  return (
    <>
      <div class="search">
        <IconSearch size={26} />
        <input
          type="search" inputMode="search" enterKeyHint="search" autoComplete="off" spellcheck={false}
          placeholder="Hira tianao… (titre, artiste, paroles)"
          value={q.value} onInput={(e) => { q.value = (e.target as HTMLInputElement).value; }}
          aria-label="Rechercher"
        />
        {q.value && <button class="clear" onClick={() => { q.value = ''; }} aria-label="Effacer"><IconClose size={26} /></button>}
      </div>
      {q.value.trim() ? (
        <SearchResults hits={hits} />
      ) : (
        <ArtistList open={open.value} onToggle={(n) => { open.value = open.value === n ? null : n; }} />
      )}
    </>
  );
}

function SearchResults({ hits }: { hits: ReturnType<typeof search> }) {
  if (!hits.length) return <div class="state">Aucun résultat</div>;
  return (
    <div>
      <div class="count">{hits.length} résultat{hits.length > 1 ? 's' : ''}</div>
      {hits.map((h) => (
        <SongLine song={h.song} sub={h.excerpt ? `« ${h.excerpt} »` : h.song.artist} key={h.song.id} />
      ))}
    </div>
  );
}

function ArtistList({ open, onToggle }: { open: string | null; onToggle: (name: string) => void }) {
  const state = catalog.value!;
  return (
    <div>
      <div class="count">{state.artists.length} artistes · {state.songs.size} morceaux</div>
      {state.artists.map((a) => (
        <div class={`artist${open === a.name ? " is-open" : ""}`} key={a.name}>
          <button onClick={() => onToggle(a.name)} aria-expanded={open === a.name}>
            <IconChevron size={24} />
            <span>{a.name}</span>
            <span class="n">{a.songs.length}</span>
          </button>
          {open === a.name && a.songs.map((s) => <SongLine song={s} key={s.id} />)}
        </div>
      ))}
    </div>
  );
}
