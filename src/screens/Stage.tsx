import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { catalog, flattenSetlist } from '../lib/catalog';
import { goBack, replaceHash, songHref } from '../lib/router';
import { bumpFont, FONT_MAX, FONT_MIN, settings, update } from '../lib/settings';
import { isCueLine } from '../lib/text';
import { wakeState } from '../lib/wakeLock';
import { displayKey } from '../model/chordpro';
import type { Section, Song } from '../model/types';
import { buildUnits, paginate, type Measure, type Unit } from '../stage/paginate';
import { IconBack, IconMoon, IconNext, IconPrev, IconSun } from '../ui/icons';

interface Props { id: string; setlistId?: string; pos?: number }

export function Stage({ id, setlistId, pos }: Props) {
  const state = catalog.value!;
  const song = state.songs.get(id);
  const fallback = setlistId ? '#/repertoire' : '#/';

  // Contexte setlist : morceau précédent / suivant
  const nav = useMemo(() => {
    const sl = setlistId ? state.setlists.find((s) => s.id === setlistId) : undefined;
    if (!sl || pos == null) return null;
    const flat = flattenSetlist(sl);
    const at = (i: number) => {
      const e = flat[i];
      const s = e && state.songs.get(e.songId);
      return s ? { song: s, href: songHref(s.id, sl.id, i) } : null;
    };
    return { total: flat.length, pos, part: flat[pos]?.part, prev: at(pos - 1), next: at(pos + 1) };
  }, [state, setlistId, pos]);

  if (!song) {
    return (
      <div class="stage">
        <div class="stage-head"><div class="stage-row">
          <button class="icon-btn" onClick={() => goBack(fallback)} aria-label="Retour"><IconBack /></button>
          <div class="stage-title"><div class="t">Morceau introuvable</div></div>
        </div></div>
      </div>
    );
  }
  return <StageView song={song} nav={nav} fallback={fallback} />;
}

type Nav = {
  total: number; pos: number; part?: string;
  prev: { song: Song; href: string } | null;
  next: { song: Song; href: string } | null;
} | null;

function StageView({ song, nav, fallback }: { song: Song; nav: Nav; fallback: string }) {
  const { fontSize, uppercase, keepAwake } = settings.value;
  const units = useMemo(() => buildUnits(song), [song]);

  const bodyRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [pages, setPages] = useState<Unit[][]>([]);
  const [page, setPage] = useState(0);
  const target = useRef(0);

  // Taille réelle de la zone de paroles
  useLayoutEffect(() => {
    const el = bodyRef.current!;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Mesure puis pagination ; conserve la strophe affichée en haut de page lors d'un recalcul
  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root || !box.h) return;
    const cs = getComputedStyle(root);
    const pageH = box.h - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const gap = parseFloat(cs.rowGap) || 0;
    const measures: Measure[] = [...root.children].map((el) => {
      const height = el.getBoundingClientRect().height;
      const lines = [...el.querySelectorAll<HTMLElement>('.ln')].map((l) => l.getBoundingClientRect().height);
      return { height, lines, header: Math.max(0, height - lines.reduce((a, b) => a + b, 0)) };
    });
    const anchor = pages[target.current]?.[0]?.key.split('#')[0];
    const next = paginate(units, measures, pageH, gap);
    let idx = anchor ? next.findIndex((p) => p.some((u) => u.key.split('#')[0] === anchor)) : 0;
    if (idx < 0) idx = 0;
    setPages(next);
    target.current = idx;
    setPage(idx);
    requestAnimationFrame(() => {
      const sc = pagesRef.current;
      if (sc) sc.scrollTo({ left: idx * sc.clientWidth, behavior: 'instant' as ScrollBehavior });
    });
  }, [units, fontSize, uppercase, box.w, box.h]);

  const count = pages.length;
  const goTo = useCallback((i: number) => {
    const sc = pagesRef.current;
    if (!sc) return;
    const c = Math.max(0, Math.min(count - 1, i));
    target.current = c;
    setPage(c);
    sc.scrollTo({ left: c * sc.clientWidth, behavior: 'smooth' });
  }, [count]);

  const onScroll = () => {
    const sc = pagesRef.current!;
    const i = Math.round(sc.scrollLeft / Math.max(1, sc.clientWidth));
    if (Math.abs(sc.scrollLeft - i * sc.clientWidth) < 2) { target.current = i; setPage(i); }
  };

  const atStart = page <= 0;
  const atEnd = page >= count - 1;
  const prev = () => { if (!atStart) goTo(target.current - 1); else if (nav?.prev) replaceHash(nav.prev.href); };
  const next = () => { if (!atEnd) goTo(target.current + 1); else if (nav?.next) replaceHash(nav.next.href); };

  // Clavier (et pédaliers type clavier Bluetooth)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
      if (['ArrowRight', 'PageDown', ' ', 'ArrowDown'].includes(e.key)) { e.preventDefault(); next(); }
      else if (['ArrowLeft', 'PageUp', 'ArrowUp'].includes(e.key)) { e.preventDefault(); prev(); }
      else if (e.key === 'Escape') goBack(fallback);
      else if (e.key === '+' || e.key === '=') bumpFont(1);
      else if (e.key === '-') bumpFont(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const style = { '--lyric-size': `${fontSize}px`, '--stanza-gap': `${Math.round(fontSize * 0.75)}px` };
  const lyricsCls = `lyrics${uppercase ? ' upper' : ''}`;

  return (
    <div class="stage" style={style}>
      <header class="stage-head">
        <div class="stage-row">
          <button class="icon-btn" onClick={() => goBack(fallback)} aria-label="Retour"><IconBack /></button>
          <div class="stage-title">
            <div class="t">{song.title}</div>
            <div class="a">{song.artist}{nav?.part ? ` · ${nav.part} · ${nav.pos + 1}/${nav.total}` : ''}</div>
          </div>
          {song.key && <span class="key" aria-label="Tonalité">{displayKey(song.key)}</span>}
          <button class="font-btn" onClick={() => bumpFont(-1)} disabled={fontSize <= FONT_MIN} aria-label="Réduire le texte"><small>A</small>−</button>
          <button class="font-btn" onClick={() => bumpFont(1)} disabled={fontSize >= FONT_MAX} aria-label="Agrandir le texte">A+</button>
          <button class="case-btn" onClick={() => update({ uppercase: !uppercase })} aria-label="Majuscules">{uppercase ? 'AA' : 'Aa'}</button>
          <button class={`icon-btn${wakeState.value === 'on' ? ' on' : ''}`} onClick={() => update({ keepAwake: !keepAwake })}
            aria-label="Écran toujours allumé" title={`Écran allumé : ${wakeState.value}`}>
            {keepAwake ? <IconSun size={28} /> : <IconMoon size={28} />}
          </button>
        </div>
        <Meta song={song} />
      </header>

      <div class="stage-body" ref={bodyRef}>
        <div class={`measure ${lyricsCls}`} ref={measureRef} aria-hidden="true">
          {units.map((u) => <UnitView u={u} key={u.key} />)}
        </div>
        <div class="pages" ref={pagesRef} onScroll={onScroll}>
          {pages.map((p, i) => (
            <div class={`page ${lyricsCls}`} key={i} aria-hidden={i !== page}>
              {p.map((u) => <UnitView u={u} key={u.key} />)}
            </div>
          ))}
        </div>
      </div>

      <footer class="stage-foot">
        {atStart && nav?.prev ? (
          <button class="nav-btn song" onClick={prev}><IconPrev /><span class="lbl">{nav.prev.song.title}</span></button>
        ) : (
          <button class="nav-btn" onClick={prev} disabled={atStart} aria-label="Page précédente"><IconPrev size={40} /></button>
        )}
        <div class="pager" aria-live="polite">
          <span class="p">{count ? page + 1 : 0} / {count}</span>
          {count > 1 && count <= 12 && <span class="dots">{pages.map((_, i) => <span class={`dot${i === page ? ' on' : ''}`} key={i} />)}</span>}
        </div>
        {atEnd && nav?.next ? (
          <button class="nav-btn song" onClick={next}><span class="lbl">{nav.next.song.title}</span><IconNext /></button>
        ) : (
          <button class="nav-btn" onClick={next} disabled={atEnd} aria-label="Page suivante"><IconNext size={40} /></button>
        )}
      </footer>
    </div>
  );
}

function Meta({ song }: { song: Song }) {
  const items: preact.ComponentChildren[] = [];
  if (song.singers.length) items.push(<span key="s"><b>Voix</b> {song.singers.join(' · ')}</span>);
  if (song.musicians.length) items.push(<span key="m"><b>Musiciens</b> {song.musicians.join(' · ')}</span>);
  if (song.capo != null) items.push(<span key="c" class="g">Capo {song.capo}</span>);
  if (song.medley.length) items.push(<span key="md"><b>Medley</b> {song.medley.join(' → ')}</span>);
  if (song.notes) items.push(<span key="n" class="g">{song.notes}</span>);
  return items.length ? <div class="meta">{items}</div> : null;
}

function SectionHead({ s }: { s: Section }) {
  return (
    <div class="sec-head">
      {s.label && <span class="sec-label">{s.label}</span>}
      {s.voices?.length ? (
        <span class="voices">
          {s.voices.map((v, i) => (
            <span class="voice" key={i}>{v.member === '*' ? 'Reste' : v.member}{v.part && <i>{v.part}</i>}</span>
          ))}
        </span>
      ) : null}
    </div>
  );
}

function UnitView({ u }: { u: Unit }) {
  if (u.cue != null) return <div class="unit cue-unit">♪ {u.cue}</div>;
  return (
    <div class="unit">
      {u.header && <SectionHead s={u.section} />}
      {u.lines?.map((l, i) => <div class={isCueLine(l) ? 'ln cue' : 'ln'} key={i}>{l}</div>)}
    </div>
  );
}
