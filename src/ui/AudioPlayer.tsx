import { useEffect, useRef, useState } from 'preact/hooks';
import { EDITION } from '../edition';
import { downloadSong, offlineSongs, refreshOffline, removeOfflineSong, sourceFor, tracksFor } from '../lib/audio';
import { fmtSize } from '../model/audio';
import type { Song } from '../model/types';
import { IconClose } from './icons';

/*
 * Lecteur des pistes par pupitre : Soprano / Alto / Ténor / Basse.
 * Changer de piste garde la position (on passe d'une voix à l'autre au même endroit).
 * Lecture en arrière-plan + contrôles de l'écran verrouillé (Media Session).
 */

const fmt = (t: number) => {
  const s = Math.max(0, Math.floor(t || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const LAST_TRACK = `${EDITION.storage}.audio.track`;

export function AudioPlayer({ song, onClose }: { song: Song; onClose: () => void }) {
  const tracks = tracksFor(song.id);
  const remembered = (() => { try { return localStorage.getItem(LAST_TRACK) ?? ''; } catch { return ''; } })();
  const [track, setTrack] = useState(() => (tracks.find((t) => t.track === remembered) ?? tracks[0])?.track ?? '');
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState({ cur: 0, dur: 0 });
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [dl, setDl] = useState<number | null>(null);
  const [dlErr, setDlErr] = useState('');
  const resume = useRef<{ at: number; play: boolean } | null>(null);
  const cur = tracks.find((x) => x.track === track);
  const hasPublished = tracks.some((x) => x.published);
  const offline = offlineSongs.value[song.id];
  const total = tracks.filter((x) => x.published).reduce((n, x) => n + x.size, 0);

  useEffect(() => { void refreshOffline(song.id); }, [song.id]);

  // Élément audio unique pour la vie du lecteur
  useEffect(() => {
    const a = new Audio();
    a.preload = 'auto';
    audio.current = a;
    const sync = () => setT({ cur: a.currentTime, dur: Number.isFinite(a.duration) ? a.duration : 0 });
    a.addEventListener('timeupdate', sync);
    a.addEventListener('durationchange', sync);
    a.addEventListener('play', () => setPlaying(true));
    a.addEventListener('pause', () => setPlaying(false));
    a.addEventListener('ended', () => setPlaying(false));
    a.addEventListener('error', () => setState('error'));
    a.addEventListener('loadedmetadata', () => {
      setState('ready');
      const r = resume.current;
      if (r) { a.currentTime = Math.min(r.at, a.duration || r.at); if (r.play) void a.play().catch(() => {}); resume.current = null; }
      sync();
    });
    return () => { a.pause(); a.removeAttribute('src'); a.load(); audio.current = null; };
  }, []);

  // Chargement de la piste choisie (en gardant la position)
  useEffect(() => {
    const a = audio.current;
    if (!a || !cur) return;
    let alive = true;
    let release = () => {};
    resume.current = a.src ? { at: a.currentTime, play: !a.paused } : { at: 0, play: true };
    setState('loading');
    void sourceFor(cur).then((s) => {
      if (!alive) { s.release(); return; }
      release = s.release;
      a.src = s.url;
      a.load();
      if (resume.current?.play) void a.play().catch(() => { /* geste requis : ▶ */ });
    });
    try { localStorage.setItem(LAST_TRACK, track); } catch { /* stockage indisponible */ }
    return () => { alive = false; release(); };
  }, [track, cur?.local, cur?.published?.v]);

  // Écran verrouillé / casque : titre + commandes
  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms) return;
    try {
      ms.metadata = new MediaMetadata({ title: song.title, artist: `${track} · ${EDITION.name}`, album: song.artist || EDITION.name });
      const a = () => audio.current;
      ms.setActionHandler('play', () => void a()?.play());
      ms.setActionHandler('pause', () => a()?.pause());
      ms.setActionHandler('seekbackward', () => seek(-10));
      ms.setActionHandler('seekforward', () => seek(10));
    } catch { /* navigateur partiel */ }
    return () => {
      try { for (const k of ['play', 'pause', 'seekbackward', 'seekforward'] as const) ms.setActionHandler(k, null); ms.metadata = null; } catch { /* idem */ }
    };
  }, [song.id, track]);

  const seek = (d: number) => {
    const a = audio.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min((a.duration || Infinity) - 0.5, a.currentTime + d));
  };
  const toggle = () => { const a = audio.current; if (!a) return; if (a.paused) void a.play().catch(() => setState('error')); else a.pause(); };

  const download = async () => {
    setDlErr(''); setDl(0);
    try { await downloadSong(song.id, setDl); } catch (e) { setDlErr(e instanceof Error ? e.message : 'Échec du téléchargement'); }
    setDl(null);
  };

  const msg = dlErr || (state === 'error'
    ? (navigator.onLine ? 'Lecture impossible : fichier introuvable.' : 'Hors ligne : télécharge ce chant (⬇) quand tu as du réseau.')
    : null);

  // Barre fine collée en bas de l'écran : les paroles restent visibles au-dessus
  return (
    <div class="au-bar" role="region" aria-label="Lecteur audio">
      <input class="au-seek" type="range" min={0} max={t.dur || 0} step={0.5} value={t.cur} disabled={!t.dur} aria-label="Position"
        style={{ '--p': t.dur ? `${(t.cur / t.dur) * 100}%` : '0%' }}
        onInput={(e) => { const a = audio.current; if (a) a.currentTime = Number((e.target as HTMLInputElement).value); }} />
      <div class="au-row">
        <label class="au-voice">
          <span class="sr">Voix</span>
          <select value={track} onChange={(e) => setTrack((e.target as HTMLSelectElement).value)} aria-label="Voix">
            {tracks.map((x) => <option key={x.track} value={x.track}>{x.track}{x.local ? ' ●' : ''}</option>)}
          </select>
        </label>
        <button class="au-btn" onClick={() => seek(-10)} disabled={state !== 'ready'} aria-label="Reculer de 10 secondes">−10</button>
        <button class="au-btn play" onClick={toggle} disabled={state === 'error'} aria-label={playing ? 'Pause' : 'Lecture'}>{playing ? '❚❚' : '▶'}</button>
        <button class="au-btn" onClick={() => seek(10)} disabled={state !== 'ready'} aria-label="Avancer de 10 secondes">+10</button>
        <span class="au-time">{fmt(t.cur)}<span class="au-dur"> / {fmt(t.dur)}</span></span>
        {hasPublished && (
          <button class={`au-btn au-dl${offline ? ' ok' : ''}`} disabled={dl !== null}
            onClick={() => (offline ? confirm('Retirer ce chant du stockage hors ligne ?') && void removeOfflineSong(song.id) : void download())}
            aria-label={offline ? 'Disponible hors ligne (retirer)' : `Télécharger pour écouter hors ligne (${fmtSize(total)})`}
            title={offline ? 'Disponible hors ligne' : `Hors ligne · ${fmtSize(total)}`}>
            {dl !== null ? `${Math.round(dl * 100)}%` : offline ? '✓' : '⬇'}
          </button>
        )}
        <button class="au-btn au-x" onClick={onClose} aria-label="Fermer le lecteur"><IconClose size={20} /></button>
      </div>
      {msg && <div class="au-msg">{msg}</div>}
    </div>
  );
}
