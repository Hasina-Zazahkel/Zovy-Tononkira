import { catalog } from '../lib/catalog';
import { songHref } from '../lib/router';
import { KeyBadge } from './Home';

export function SetlistView() {
  const state = catalog.value;
  if (!state) return null;
  const sl = state.setlists[0];
  if (!sl) return <div class="state">Aucun répertoire</div>;
  let pos = 0;
  return (
    <div>
      <div class="count">{sl.name}</div>
      {sl.parts.map((part) => (
        <section key={part.name}>
          <h2 class="part-title">{part.name} · {part.songIds.length}</h2>
          {part.songIds.map((id, i) => {
            const song = state.songs.get(id);
            const p = pos++;
            if (!song) return null;
            return (
              <a class="song-row" href={songHref(id, sl.id, p)} key={`${id}-${p}`}>
                <span class="pos">{i + 1}</span>
                <span class="t">{song.title}<span class="sub">{song.artist}</span></span>
                <KeyBadge song={song} />
              </a>
            );
          })}
        </section>
      ))}
    </div>
  );
}
