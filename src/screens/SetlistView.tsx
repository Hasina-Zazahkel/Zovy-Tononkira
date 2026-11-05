import { FEATURES } from '../edition';
import { liveCatalog } from '../lib/overrides';
import { useState } from 'preact/hooks';
import { canEdit } from '../lib/publish';
import { songHref } from '../lib/router';
import { currentSetlist, saveSetlist, setlistUnpublished } from '../lib/setlistEdit';
import { addPart, canMove, deletePart, moveSong, removeSong, renamePart } from '../model/setlist';
import { IconClose } from '../ui/icons';
import { AddSongSheet } from './AddSheets';
import { KeyBadge } from './Home';

export function SetlistView() {
  const state = liveCatalog.value;
  const sl = currentSetlist.value;
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  if (!state) return null;
  if (!sl) return <div class="state">Aucun répertoire</div>;
  const edit = editing && canEdit.value;
  const total = sl.parts.reduce((n, p) => n + p.songIds.length, 0);
  let pos = 0;

  return (
    <div>
      <div class="sl-head">
        <span class="count">{total} titres · {sl.parts.length} parties{setlistUnpublished.value ? ' · modifié ici' : ''}</span>
        {canEdit.value && (
          <button class={`btn small${edit ? ' primary' : ''}`} onClick={() => setEditing(!edit)}>
            {edit ? 'Terminé' : '✎ Modifier'}
          </button>
        )}
      </div>

      <div class="sl-parts">
      {sl.parts.map((part, pi) => (
        <section key={pi} class={edit ? 'part editing' : 'part'}>
          {edit ? (
            <div class="part-edit">
              <input class="in part-name" value={part.name} aria-label="Nom de la partie"
                onChange={(e) => void saveSetlist(renamePart(sl, pi, (e.target as HTMLInputElement).value))} />
              <button class="icon-btn del" aria-label={`Supprimer la partie ${part.name}`}
                onClick={() => {
                  const msg = part.songIds.length
                    ? `Supprimer « ${part.name} » et retirer ses ${part.songIds.length} titres du répertoire ?`
                    : `Supprimer la partie « ${part.name} » ?`;
                  if (confirm(msg)) void saveSetlist(deletePart(sl, pi));
                }}><IconClose size={26} /></button>
            </div>
          ) : (
            <h2 class="part-title">{part.name} · {part.songIds.length}</h2>
          )}

          {part.songIds.map((id, i) => {
            const song = state.songs.get(id);
            const p = pos++;
            if (!song) return null;
            if (!edit) {
              return (
                <a class="song-row" href={songHref(id, sl.id, p)} key={id}>
                  <span class="pos">{i + 1}</span>
                  <span class="t">{song.title}{FEATURES.artist && <span class="sub">{song.artist}</span>}</span>
                  <KeyBadge song={song} />
                </a>
              );
            }
            return (
              <div class="song-row edit-row" key={id}>
                <span class="pos">{i + 1}</span>
                <span class="t">{song.title}{FEATURES.artist && <span class="sub">{song.artist}</span>}</span>
                <button class="mv" disabled={!canMove(sl, pi, i, -1)} aria-label="Monter"
                  onClick={() => void saveSetlist(moveSong(sl, pi, i, -1))}>↑</button>
                <button class="mv" disabled={!canMove(sl, pi, i, 1)} aria-label="Descendre"
                  onClick={() => void saveSetlist(moveSong(sl, pi, i, 1))}>↓</button>
                <button class="icon-btn del" aria-label={`Retirer ${song.title}`}
                  onClick={() => void saveSetlist(removeSong(sl, pi, i))}><IconClose size={24} /></button>
              </div>
            );
          })}

          {edit && <button class="add voice" onClick={() => setAdding(pi)}>+ Ajouter un titre à « {part.name} »</button>}
        </section>
      ))}
      </div>

      {edit && (
        <button class="add inst new-part" onClick={() => {
          const name = prompt('Nom de la nouvelle partie', `Partie ${sl.parts.length + 1}`);
          if (name !== null) void saveSetlist(addPart(sl, name));
        }}>+ Nouvelle partie</button>
      )}

      {adding !== null && edit && <AddSongSheet part={adding} onClose={() => setAdding(null)} />}
    </div>
  );
}
