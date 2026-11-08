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
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, autoplay: 1 },
        events: {
          onReady: (e: { target: YTPlayer }) => {
            if (!alive) return;
            setState('ready');
            // Lancement immédiat : l'ouverture vient d'un geste (bouton ▶ Original). Si le navigateur refuse, ▶ reste disponible.
            try { e.target.playVideo(); } catch { /* lecture manuelle */ }
          },
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

  const video = settings.value.ytVideo || state === 'offline';
  // Barre fine collée en bas (comme le lecteur audio) ; la vidéo n'est affichée que sur demande (🎬)
  return (
    <div class="au-bar yt-bar" role="region" aria-label="Lecteur de l'original">
      <div class={`yt-dock${video ? ' show' : ''}`} ref={host} aria-hidden={!video}>
        {state !== 'ready' && video && (
          <div class="yt-msg">{state === 'offline' ? 'Pas de connexion : le lecteur a besoin du réseau.' : 'Chargement…'}</div>
        )}
      </div>
      <input class="au-seek" type="range" min={0} max={t.dur || 0} step={1} value={t.cur} disabled={!t.dur} aria-label="Position"
        style={{ '--p': t.dur ? `${(t.cur / t.dur) * 100}%` : '0%' }}
        onInput={(e) => { const p = player.current; const v = Number((e.target as HTMLInputElement).value); if (p) { p.seekTo(v, true); setT((x) => ({ ...x, cur: v })); } }} />
      <div class="au-row">
        <button class={`au-btn yt-vid${settings.value.ytVideo ? ' on' : ''}`} onClick={() => update({ ytVideo: !settings.value.ytVideo })}
          aria-pressed={settings.value.ytVideo} aria-label={settings.value.ytVideo ? 'Masquer la vidéo' : 'Afficher la vidéo'} title="Vidéo">🎬</button>
        <button class="au-btn" onClick={() => seek(-10)} disabled={state !== 'ready'} aria-label="Reculer de 10 secondes">−10</button>
        <button class="au-btn play" onClick={toggle} disabled={state !== 'ready'} aria-label={playing ? 'Pause' : 'Lecture'}>{playing ? '❚❚' : '▶'}</button>
        <button class="au-btn" onClick={() => seek(10)} disabled={state !== 'ready'} aria-label="Avancer de 10 secondes">+10</button>
        <span class="au-time">{state === 'loading' ? '…' : fmt(t.cur)}{t.dur ? <span class="au-dur"> / {fmt(t.dur)}</span> : null}</span>
        <button class="au-btn au-x" onClick={onClose} aria-label="Fermer le lecteur"><IconClose size={20} /></button>
      </div>
      {state === 'offline' && <div class="au-msg">Pas de connexion : l'original a besoin du réseau.</div>}
    </div>
  );
}
