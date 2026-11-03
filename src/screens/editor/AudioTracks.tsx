import { useState } from 'preact/hooks';
import { catalog } from '../../lib/catalog';
import { cancelTrack, pendingFor, removeTrack, setTrackFile, TRACKS } from '../../lib/audio';
import { audioExt, AUDIO_EXT, AUDIO_MAX_BYTES, AUDIO_WARN_BYTES, fmtSize } from '../../model/audio';

/** Pistes audio du morceau (édition chorale). Prises en compte tout de suite, publiées avec PUBLIER. */
export function AudioTracks({ songId }: { songId?: string }) {
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  if (!songId) return (
    <>
      <h3 class="sheet-h">Pistes audio</h3>
      <p class="ed-hint">Enregistre d'abord le morceau, puis rouvre-le pour ajouter les pistes par pupitre.</p>
    </>
  );
  const published = catalog.value?.songs.get(songId)?.audio ?? [];

  const pick = async (track: string, input: HTMLInputElement) => {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    const ext = audioExt(f.name);
    if (!ext) { setMsg({ kind: 'err', text: `Format non pris en charge : ${AUDIO_EXT.join(', ')}.` }); return; }
    if (f.size > AUDIO_MAX_BYTES) { setMsg({ kind: 'err', text: `Fichier trop lourd (${fmtSize(f.size)}). Réencode en MP3 mono 64–96 kbit/s.` }); return; }
    await setTrackFile(songId, track, f, ext);
    setMsg(f.size > AUDIO_WARN_BYTES
      ? { kind: 'err', text: `${track} ajouté, mais lourd (${fmtSize(f.size)}) : en MP3 mono 64–96 kbit/s, une piste de 4 min fait 2 à 3 Mo.` }
      : { kind: 'ok', text: `${track} ajouté sur cet appareil (${fmtSize(f.size)}). PUBLIER l'envoie aux membres.` });
  };

  return (
    <>
      <h3 class="sheet-h">Pistes audio</h3>
      <p class="ed-hint">Un fichier par piste (MP3 conseillé, mono 64–96 kbit/s). Pris en compte immédiatement sur cet appareil, envoyé aux membres avec PUBLIER.</p>
      <div class="au-ed">
        {TRACKS.map((track) => {
          const pub = published.find((t) => t.track === track);
          const p = pendingFor(songId, track);
          const status = p ? (p.blob ? `${fmtSize(p.blob.size)} · ${p.publishedAt ? 'envoyé' : 'à publier'}` : p.publishedAt ? 'retrait envoyé' : 'retrait à publier')
            : pub ? `${fmtSize(pub.size)} · en ligne` : 'aucune';
          const has = p ? !!p.blob : !!pub;
          return (
            <div class="au-ed-row" key={track}>
              <span class="au-ed-t">{track}<small class={p && !p.publishedAt ? 'pend' : ''}>{status}</small></span>
              <label class="mini au-ed-pick">
                {has ? 'Remplacer' : 'Ajouter'}
                <input type="file" accept="audio/*,.mp3,.m4a,.ogg,.opus,.wav" hidden onChange={(e) => void pick(track, e.target as HTMLInputElement)} />
              </label>
              {p && !p.publishedAt
                ? <button class="mini" onClick={() => void cancelTrack(songId, track)}>Annuler</button>
                : has ? <button class="mini" onClick={() => confirm(`Retirer la piste ${track} ?`) && void removeTrack(songId, track)}>Retirer</button>
                : <span />}
            </div>
          );
        })}
      </div>
      {msg && <div class={`msg ${msg.kind} ed-msg`}>{msg.text}</div>}
    </>
  );
}
