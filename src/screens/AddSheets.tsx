import { FEATURES } from '../edition';
import { useMemo, useState } from 'preact/hooks';
import { search } from '../lib/catalog';
import { liveCatalog } from '../lib/overrides';
import { currentSetlist, saveSetlist } from '../lib/setlistEdit';
import { addSong, findSong } from '../model/setlist';
import type { Song } from '../model/types';
import { IconClose, IconSearch } from '../ui/icons';
import { KeyBadge } from './Home';

/** Depuis le répertoire : chercher un morceau et l'ajouter à une partie donnée. */
export function AddSongSheet({ part, onClose }: { part: number; onClose: () => void }) {
  const state = liveCatalog.value!;
  const sl = currentSetlist.value!;
  const [q, setQ] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const hits = useMemo(() => (q.trim() ? search(state, q).map((h) => h.song) : []), [state, q]);

  return (
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Ajouter un titre">
      <header class="sheet-head">
        <div class="sheet-title"><div class="t">Ajouter un titre</div><div class="a">dans « {sl.parts[part]?.name} »</div></div>
        <button class="icon-btn" onClick={onClose} aria-label="Fermer"><IconClose /></button>
      </header>
      <div class="sheet-body">
        <div class="search">
          <IconSearch size={26} />
          <input type="search" autoFocus placeholder="Titre, artiste ou paroles" value={q}
            onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Rechercher un titre" />
        </div>
        {added.length > 0 && <p class="hint">Ajouté : {added.join(', ')}</p>}
        {!q.trim() && <p class="hint">Tape quelques lettres pour trouver le morceau.</p>}
        {hits.map((song) => {
          const at = findSong(currentSetlist.value!, song.id);
          return (
            <div class="song-row edit-row" key={song.id}>
              <span class="t">{song.title}{FEATURES.artist && <span class="sub">{song.artist}</span>}</span>
              <KeyBadge song={song} />
              {at ? (
                <span class="in-sl">{currentSetlist.value!.parts[at.part].name}</span>
              ) : (
                <button class="btn small primary" onClick={() => {
                  void saveSetlist(addSong(currentSetlist.value!, part, song.id));
                  setAdded((a) => [...a, song.title]);
                }}>+ Ajouter</button>
              )}
            </div>
          );
        })}
      </div>
      <footer class="sheet-foot single"><button class="btn primary" onClick={onClose}>Terminé</button></footer>
    </div>
  );
}

/** Depuis l'accueil : choisir la partie où ajouter un morceau. */
export function PickPartSheet({ song, onClose }: { song: Song; onClose: () => void }) {
  const sl = currentSetlist.value!;
  const at = findSong(sl, song.id);
  return (
    <div class="sheet compact" role="dialog" aria-modal="true" aria-label="Ajouter au répertoire">
      <header class="sheet-head">
        <div class="sheet-title"><div class="t">Ajouter au répertoire</div><div class="a">{song.title}</div></div>
        <button class="icon-btn" onClick={onClose} aria-label="Fermer"><IconClose /></button>
      </header>
      <div class="sheet-body">
        {at ? (
          <p class="hint">Déjà dans « {sl.parts[at.part].name} » (n° {at.index + 1}).</p>
        ) : (
          sl.parts.map((p, i) => (
            <button class="part-pick" key={i} onClick={() => { void saveSetlist(addSong(sl, i, song.id)); onClose(); }}>
              <span>{p.name}</span><span class="n">{p.songIds.length} titres</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/** Choix de la partie du répertoire où ranger le(s) nouveau(x) morceau(x). */
export function PartSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const sl = currentSetlist.value;
  return (
    <label class="part-pick">
      <span>Ajouter au répertoire</span>
      <select class="in" value={value} onChange={(e) => onChange(Number((e.target as HTMLSelectElement).value))} aria-label="Ajouter au répertoire">
        <option value={-1}>Non</option>
        {sl?.parts.map((p, i) => <option value={i} key={i}>{p.name}</option>)}
      </select>
    </label>
  );
}
