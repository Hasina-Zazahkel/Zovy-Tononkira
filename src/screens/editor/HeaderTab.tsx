import type { Accidental, Key, NoteRoot } from '../../model/types';
import { parseYoutube, youtubeUrl } from '../../model/youtube';
import { FEATURES } from '../../edition';
import { RoleRows, type Row } from './RoleRows';
import { AudioTracks } from './AudioTracks';

export interface HeaderDraft {
  title: string;
  artist: string;
  key?: Key;
  notes: string;
  /** Lien YouTube tel que saisi (validé à l'enregistrement). */
  youtube: string;
  singers: Row[];
  musicians: Row[];
}

const ROOTS: { v: NoteRoot; l: string }[] = [
  { v: 'DO', l: 'DO' }, { v: 'RE', l: 'RÉ' }, { v: 'MI', l: 'MI' }, { v: 'FA', l: 'FA' }, { v: 'SOL', l: 'SOL' }, { v: 'LA', l: 'LA' }, { v: 'SI', l: 'SI' },
];
const ACC: { v?: Accidental; l: string; a: string }[] = [{ v: 'b', l: '♭', a: 'bémol' }, { v: undefined, l: '♮', a: 'naturel' }, { v: '#', l: '♯', a: 'dièse' }];

export function HeaderTab({ d, set, songId }: { d: HeaderDraft; set: (p: Partial<HeaderDraft>) => void; songId?: string }) {
  const k = d.key;
  return (
    <div class="ed-form">
      <label class="ed-l" for="ed-title">Titre</label>
      <input id="ed-title" class="in" value={d.title} onInput={(e) => set({ title: (e.target as HTMLInputElement).value })} />
      {FEATURES.artist && <>
        <label class="ed-l" for="ed-artist">Artiste{FEATURES.artistRequired ? '' : ' (facultatif)'}</label>
        <input id="ed-artist" class="in" value={d.artist} list="zovy-artists" onInput={(e) => set({ artist: (e.target as HTMLInputElement).value })} />
      </>}

      <div class="ed-l">Tonalité</div>
      <div class="key-pick" role="group" aria-label="Tonalité">
        {ROOTS.map((r) => (
          <button key={r.v} class={`kk${k?.root === r.v ? ' on' : ''}`} aria-pressed={k?.root === r.v}
            onClick={() => set({ key: k?.root === r.v ? undefined : { root: r.v, ...(k?.accidental ? { accidental: k.accidental } : {}) } })}>{r.l}</button>
        ))}
        <span class="kk-sep" />
        {ACC.map((a) => (
          <button key={a.l} class={`kk${k && k.accidental === a.v ? ' on' : ''}`} disabled={!k} aria-label={a.a}
            onClick={() => k && set({ key: a.v ? { root: k.root, accidental: a.v } : { root: k.root } })}>{a.l}</button>
        ))}
      </div>
      <p class="ed-hint">{k ? 'Toucher la note sélectionnée pour retirer la tonalité.' : 'Aucune tonalité renseignée.'}</p>

      <label class="ed-l" for="ed-notes">Commentaire</label>
      <input id="ed-notes" class="in" value={d.notes} maxLength={80} placeholder="Ex. Capo 5 · Intro sax · Tempo lent"
        onInput={(e) => set({ notes: (e.target as HTMLInputElement).value })} />

      {FEATURES.youtube && <>
      <label class="ed-l" for="ed-yt">Original (lien YouTube)</label>
      <input id="ed-yt" class="in" value={d.youtube} inputMode="url" autoCapitalize="none" spellcheck={false}
        placeholder="https://youtu.be/…  ou  https://www.youtube.com/watch?v=…"
        onInput={(e) => set({ youtube: (e.target as HTMLInputElement).value })} />
      <p class={`ed-hint${d.youtube.trim() && !parseYoutube(d.youtube) ? ' bad' : ''}`}>
        {!d.youtube.trim() ? 'Facultatif : ajoute un lecteur ▶ sur la page de lecture pour répéter.'
          : parseYoutube(d.youtube) ? <>Vidéo reconnue : <a href={youtubeUrl(parseYoutube(d.youtube)!)} target="_blank" rel="noopener">vérifier sur YouTube</a></>
          : 'Lien non reconnu : colle l\'adresse d\'une vidéo YouTube.'}
      </p>
      </>}

      <h3 class="sheet-h voice">Chanteurs</h3>
      <RoleRows rows={d.singers} kind="voice" onChange={(singers) => set({ singers })} addLabel="Ajouter un chanteur" />
      {FEATURES.instruments && <>
        <h3 class="sheet-h inst">Musiciens</h3>
        <RoleRows rows={d.musicians} kind="inst" onChange={(musicians) => set({ musicians })} addLabel="Ajouter un musicien" />
      </>}
      {FEATURES.audio && <AudioTracks songId={songId} />}
    </div>
  );
}
