import { useEffect, useRef, useState } from 'preact/hooks';
import { settings, update } from '../lib/settings';
import { IconClose } from './icons';

/* Lecteur YouTube officiel (IFrame API) : lecture / pause, ±10 s. Nécessite le réseau. */

interface YTPlayer {
  playVideo(): void; pauseVideo(): void; seekTo(s: number, allow: boolean): void;
  getCurrentTime(): number; getDuration(): number; getPlayerState(): number; destroy(): void;
}
declare global {
  interface Window { YT?: { Player: new (el: HTMLElement, o: object) => YTPlayer }; onYouTubeIframeAPIReady?: () => void }
}

let apiPromise: Promise<void> | null = null;
function loadApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  apiPromise ??= new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => { apiPromise = null; reject(new Error('youtube')); };
    document.head.appendChild(s);
  });
  return apiPromise;
}

const fmt = (t: number) => {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function YoutubePlayer({ id, onClose }: { id: string; onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'offline'>(navigator.onLine ? 'loading' : 'offline');
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState({ cur: 0, dur: 0 });

  useEffect(() => {
    if (!navigator.onLine) return;
    let alive = true;
    loadApi().then(() => {
      if (!alive || !host.current) return;
      const el = document.createElement('div');
      host.current.appendChild(el);
      player.current = new window.YT!.Player(el, {
        videoId: id, width: '100%', height: '100%',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => { if (alive) setState('ready'); },
          onStateChange: (e: { data: number }) => setPlaying(e.data === 1),
          onError: () => { if (alive) setState('offline'); },
        },
      });
    }).catch(() => { if (alive) setState('offline'); });
    const tick = window.setInterval(() => {
      const p = player.current;
      if (p?.getCurrentTime) setT({ cur: p.getCurrentTime() || 0, dur: p.getDuration() || 0 });
    }, 500);
    return () => { alive = false; clearInterval(tick); try { player.current?.destroy(); } catch { /* déjà détruit */ } player.current = null; };
  }, [id]);

  const seek = (d: number) => {
    const p = player.current;
    if (!p) return;
    const to = Math.max(0, Math.min((p.getDuration() || Infinity) - 1, p.getCurrentTime() + d));
    p.seekTo(to, true);
    setT((x) => ({ ...x, cur: to }));
  };
  const toggle = () => { const p = player.current; if (!p) return; if (playing) p.pauseVideo(); else p.playVideo(); };

  const { ytMini: mini, ytBottom: bottom } = settings.value;
  return (
    <div class={`yt-panel${mini ? ' mini' : ''}${bottom ? ' bottom' : ''}`} role="region" aria-label="Lecteur de l'original">
      <div class="yt-video" ref={host}>
        {state !== 'ready' && (
          <div class="yt-msg">{state === 'offline' ? 'Pas de connexion : le lecteur a besoin du réseau.' : 'Chargement…'}</div>
        )}
      </div>
      <div class="yt-ctl">
        <button class="yt-btn" onClick={() => seek(-10)} disabled={state !== 'ready'} aria-label="Reculer de 10 secondes">−10 s</button>
        <button class="yt-btn play" onClick={toggle} disabled={state !== 'ready'} aria-label={playing ? 'Pause' : 'Lecture'}>{playing ? '❚❚' : '▶'}</button>
        <button class="yt-btn" onClick={() => seek(10)} disabled={state !== 'ready'} aria-label="Avancer de 10 secondes">+10 s</button>
        <span class="yt-time">{fmt(t.cur)}{t.dur ? <span class="yt-dur"> / {fmt(t.dur)}</span> : null}</span>
        <button class="yt-mini-btn" onClick={() => update({ ytBottom: !bottom })} aria-label={bottom ? 'Placer le lecteur en haut' : 'Placer le lecteur en bas'}
          title={bottom ? 'En haut' : 'En bas'}>{bottom ? '⤒' : '⤓'}</button>
        <button class="yt-mini-btn" onClick={() => update({ ytMini: !mini })} aria-label={mini ? 'Agrandir le lecteur' : 'Réduire le lecteur'}
          title={mini ? 'Agrandir' : 'Réduire'}>{mini ? '⤢' : '⤡'}</button>
        <button class="icon-btn yt-close" onClick={onClose} aria-label="Fermer le lecteur"><IconClose size={22} /></button>
      </div>
    </div>
  );
}
