import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { catalog, flattenSetlist } from '../lib/catalog';
import { effectiveSong, overrides } from '../lib/overrides';
import { canEdit } from '../lib/publish';
import { currentSetlist } from '../lib/setlistEdit';
import { SongEditor } from './editor/SongEditor';
import { goBack, replaceHash, songHref } from '../lib/router';
import { bumpFont, FONT_MAX, FONT_MIN, settings, update } from '../lib/settings';
import { isCueLine } from '../lib/text';
import { wakeState } from '../lib/wakeLock';
import { displayKey } from '../model/chordpro';
import { CUE_LABEL } from '../model/cues';
import { splitLineRepeat, wholeLineMarker } from '../model/repeat';
import type { Assignment, Section, Song } from '../model/types';
import { buildUnits, paginate, type Column, type Measure, type Unit } from '../stage/paginate';
import { IconBack, IconCollapse, IconEdit, IconExpand, IconInfo, IconMoon, IconNext, IconPrev, IconSun } from '../ui/icons';

interface Props { id: string; setlistId?: string; pos?: number }

export function Stage({ id, setlistId, pos }: Props) {
  const state = catalog.value!;
  const base = state.songs.get(id);
  const ov = overrides.value[id];
  // Mémoïsé : un nouvel objet à chaque rendu relancerait la pagination en boucle
  const song = useMemo(() => (base ? effectiveSong(base) : undefined), [base, ov]);
  const fallback = setlistId ? '#/repertoire' : '#/';

  // Contexte setlist : morceau précédent / suivant
  const nav = useMemo(() => {
    const cur = currentSetlist.value;
    const sl = setlistId && cur?.id === setlistId ? cur : undefined;
    if (!sl || pos == null) return null;
    const flat = flattenSetlist(sl);
    const at = (i: number) => {
      const e = flat[i];
      const s = e && state.songs.get(e.songId);
      return s ? { song: s, href: songHref(s.id, sl.id, i) } : null;
    };
    return { total: flat.length, pos, part: flat[pos]?.part, prev: at(pos - 1), next: at(pos + 1) };
  }, [state, setlistId, pos, currentSetlist.value]);

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
  return <StageView song={song} base={base!} local={!!ov} nav={nav} fallback={fallback} />;
}

type Nav = {
  total: number; pos: number; part?: string;
  prev: { song: Song; href: string } | null;
  next: { song: Song; href: string } | null;
} | null;

function StageView({ song, base, local, nav, fallback }: { song: Song; base: Song; local: boolean; nav: Nav; fallback: string }) {
  const { fontSize, uppercase, keepAwake, headerCollapsed } = settings.value;
  const [editing, setEditing] = useState<false | 'header' | 'lyrics'>(false);
  const press = useRef<number | undefined>(undefined);
  const [infoOpen, setInfoOpen] = useState(false);
  const units = useMemo(() => buildUnits(song), [song]);

  const bodyRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  /** Un écran = 1 colonne (smartphone, tablette portrait) ou 2 colonnes (PC). */
  const [pages, setPages] = useState<Column[][]>([]);
  const [page, setPage] = useState(0);
  const target = useRef(0);
  const cols = box.w >= 1100 ? 2 : 1;

  // Taille réelle de la zone de paroles
  useLayoutEffect(() => {
    const el = bodyRef.current!;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Largeur d'une colonne (la mesure se fait à cette largeur)
  const geo = useMemo(() => {
    const el = bodyRef.current;
    if (!el || !box.w) return null;
    const cs = getComputedStyle(el);
    const padX = parseFloat(cs.getPropertyValue('--pad-x')) || 22;
    const padY = parseFloat(cs.getPropertyValue('--pad-y')) || 14;
    const colGap = parseFloat(cs.getPropertyValue('--col-gap')) || 56;
    return { colW: (box.w - 2 * padX - (cols - 1) * colGap) / cols, colH: box.h - 2 * padY };
  }, [box.w, box.h, cols]);

  // Mesure puis pagination ; conserve la strophe affichée en haut d'écran lors d'un recalcul
  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root || !geo) return;
    const gap = parseFloat(getComputedStyle(root).rowGap) || 0;
    const measures: Measure[] = [...root.children].map((el) => {
      const height = el.getBoundingClientRect().height;
      const lines = [...el.querySelectorAll<HTMLElement>('.ln')].map((l) => l.getBoundingClientRect().height);
      return { height, lines, header: Math.max(0, height - lines.reduce((a, b) => a + b, 0)) };
    });
    const anchor = pages[target.current]?.[0]?.units[0]?.key.split('#')[0];
    const columns = paginate(units, measures, geo.colH, gap, { minGap: gap * 0.4, minScale: 0.92 });
    const next: Column[][] = [];
    for (let i = 0; i < columns.length; i += cols) next.push(columns.slice(i, i + cols));
    let idx = anchor ? next.findIndex((p) => p.some((c) => c.units.some((u) => u.key.split('#')[0] === anchor))) : 0;
    if (idx < 0) idx = 0;
    setPages(next);
    target.current = idx;
    setPage(idx);
    requestAnimationFrame(() => {
      const sc = pagesRef.current;
      if (sc) sc.scrollTo({ left: idx * sc.clientWidth, behavior: 'instant' as ScrollBehavior });
    });
  }, [units, fontSize, uppercase, geo, cols]);

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
      if (editing || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.ctrlKey || e.metaKey || e.altKey) return;
      if (['ArrowRight', 'PageDown', ' ', 'ArrowDown'].includes(e.key)) { e.preventDefault(); next(); }
      else if (['ArrowLeft', 'PageUp', 'ArrowUp'].includes(e.key)) { e.preventDefault(); prev(); }
      else if (e.key === 'Escape') { if (infoOpen) setInfoOpen(false); else goBack(fallback); }
      else if (e.key === '+' || e.key === '=') bumpFont(1);
      else if (e.key === '-') bumpFont(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const style = { '--lyric-size': `${fontSize}px`, '--stanza-gap': `${Math.round(fontSize * 0.7)}px` };
  const lyricsCls = `lyrics${uppercase ? ' upper' : ''}`;
  const note = comment(song);
  const hasInfo = song.singers.length + song.musicians.length + song.medley.length > 0 || !!note;
  const sub = `${song.artist}${nav?.part ? ` · ${nav.part} · ${nav.pos + 1}/${nav.total}` : ''}`;

  const keyBadge = song.key ? <span class="key" aria-label="Tonalité">{displayKey(song.key)}</span> : null;
  const commentEl = note
    ? (canEdit.value
      ? <button class="comment" onClick={() => setEditing('header')} aria-label={`Commentaire : ${note}`}>{note}</button>
      : <button class="comment" onClick={() => setInfoOpen(true)} aria-label={`Commentaire : ${note}`}>{note}</button>)
    : canEdit.value ? <button class="comment add-comment" onClick={() => setEditing('header')}>+ Commentaire</button> : null;

  return (
    <div class={`stage${headerCollapsed ? ' collapsed' : ''}`} style={style}>
      {headerCollapsed ? (
        <header class="stage-head mini">
          <button class="icon-btn" onClick={() => goBack(fallback)} aria-label="Retour"><IconBack size={26} /></button>
          <div class="mini-title">{song.title}</div>
          {keyBadge}
          {note && <span class="comment mini-comment">{note}</span>}
          <button class="icon-btn" onClick={() => update({ headerCollapsed: false })} aria-label="Afficher l'en-tête"><IconExpand size={26} /></button>
        </header>
      ) : (
        <header class="stage-head">
          <div class="head-main">
            <button class="icon-btn" onClick={() => goBack(fallback)} aria-label="Retour"><IconBack /></button>
            <div class="stage-title"
              onPointerDown={() => { if (canEdit.value) press.current = window.setTimeout(() => setEditing('lyrics'), 600); }}
              onPointerUp={() => clearTimeout(press.current)} onPointerLeave={() => clearTimeout(press.current)} onPointerCancel={() => clearTimeout(press.current)}>
              <div class="t">{song.title}</div>
              <div class="a">
                {local && <span class="local" title="Modifié sur cet appareil, pas encore publié">● modifié ici · </span>}
                {sub}
              </div>
            </div>
            {keyBadge}
            <span class="head-comment">{commentEl}</span>
          </div>
          <div class="head-ctl">
            {hasInfo && (
              <button class={`pill-btn${infoOpen ? ' on' : ''}`} onClick={() => setInfoOpen(!infoOpen)} aria-expanded={infoOpen} aria-label="Infos du morceau">
                <IconInfo size={22} /><span>Infos</span>
              </button>
            )}
            <span class="spacer">{commentEl && <span class="ctl-comment">{commentEl}</span>}</span>
            <button class="font-btn" onClick={() => bumpFont(-1)} disabled={fontSize <= FONT_MIN} aria-label="Réduire le texte"><small>A</small>−</button>
            <button class="font-btn" onClick={() => bumpFont(1)} disabled={fontSize >= FONT_MAX} aria-label="Agrandir le texte">A+</button>
            {canEdit.value && (
              <button class="case-btn" onClick={() => update({ uppercase: !uppercase })} aria-label="Majuscules">{uppercase ? 'AA' : 'Aa'}</button>
            )}
            <button class={`icon-btn${wakeState.value === 'on' ? ' on' : ''}`} onClick={() => update({ keepAwake: !keepAwake })}
              aria-label="Écran toujours allumé" title={`Écran allumé : ${wakeState.value}`}>
              {keepAwake ? <IconSun size={26} /> : <IconMoon size={26} />}
            </button>
            {canEdit.value && (
              <button class="icon-btn" onClick={() => setEditing('lyrics')} aria-label="Modifier le morceau"><IconEdit size={26} /></button>
            )}
            <button class="icon-btn" onClick={() => { setInfoOpen(false); update({ headerCollapsed: true }); }} aria-label="Masquer l'en-tête"><IconCollapse size={26} /></button>
          </div>
          {infoOpen && <InfoPanel song={song} note={note} onClose={() => setInfoOpen(false)} />}
        </header>
      )}

      <div class="stage-body" ref={bodyRef}>
        <div class={`measure ${lyricsCls}`} ref={measureRef} aria-hidden="true" style={geo ? { width: `${geo.colW}px` } : undefined}>
          {units.map((u) => <UnitView u={u} key={u.key} />)}
        </div>
        <div class="pages" ref={pagesRef} onScroll={onScroll} onClick={() => infoOpen && setInfoOpen(false)}>
          {pages.map((p, i) => (
            <div class={`page ${lyricsCls}${cols > 1 ? ' two' : ''}`} key={i} aria-hidden={i !== page}>
              {p.map((c, j) => <div class="col" key={j} style={{ gap: `${c.gap}px`, '--lh': c.scale }}>{c.units.map((u) => <UnitView u={u} key={u.key} />)}</div>)}
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
      {editing && canEdit.value && <SongEditor base={base} tab={editing} onClose={() => setEditing(false)} />}
    </div>
  );
}

/** Commentaire affiché à côté de la tonalité (capo hérité inclus). */
function comment(song: Song): string {
  return [song.capo != null ? `Capo ${song.capo}` : '', song.notes ?? ''].filter(Boolean).join(' · ');
}

/** Volet « Infos » : commentaire, chanteurs, musiciens, medley. Superposé : ne change pas la pagination. */
function InfoPanel({ song, note, onClose }: { song: Song; note: string; onClose: () => void }) {
  return (
    <div class="info-pop" role="dialog" aria-label="Infos du morceau">
      {note && <div class="meta-row"><span class="meta-lbl">Note</span><span class="info-note">{note}</span></div>}
      {song.singers.length > 0 && <div class="meta-row"><span class="meta-lbl">Voix</span><Chips list={song.singers} kind="voice" /></div>}
      {song.musicians.length > 0 && <div class="meta-row"><span class="meta-lbl">Musique</span><Chips list={song.musicians} kind="inst" /></div>}
      {song.medley.length > 0 && <div class="meta-row"><span class="meta-lbl">Medley</span><span class="info-note">{song.medley.join(' → ')}</span></div>}
      <button class="btn small" onClick={onClose}>Fermer</button>
    </div>
  );
}

/** Pastilles "Nom rôle" — même composant pour les voix (doré) et les instruments (neutre). */
export function Chips({ list, kind }: { list: Assignment[]; kind: 'voice' | 'inst' }) {
  // "*" = "Reste" s'il y a des membres nommés à côté, sinon "Tous"
  const star = list.some((a) => a.member !== '*') ? 'Reste' : 'Tous';
  return (
    <span class="chips">
      {list.map((a, i) => (
        <span class={`chip ${kind}`} key={i}>
          <b>{a.member === '*' ? star : a.member}</b>{a.role && <i>{a.role}</i>}
        </span>
      ))}
    </span>
  );
}

function SectionHead({ s }: { s: Section }) {
  return (
    <div class="sec-head">
      {s.label && <span class="sec-label">{s.label}</span>}
      {s.voices?.length ? <span class="sec-voices"><Chips list={s.voices} kind="voice" /></span> : null}
    </div>
  );
}

export function UnitView({ u }: { u: Unit }) {
  if (u.cue != null) {
    return (
      <div class={`unit cue-unit ${u.cue.type}`}>
        <span class="cue-type">♪ {CUE_LABEL[u.cue.type]}</span>
        {u.cue.note && <span class="cue-note">{u.cue.note}</span>}
      </div>
    );
  }
  const rep = (u.repeat ?? 1) > 1;
  return (
    <div class={`unit${rep ? ' rep' : ''}${rep && !u.continued ? ' rep-end' : ''}`}>
      {u.header && <SectionHead s={u.section} />}
      {u.lines?.map((l, i) => {
        const { text, times } = splitLineRepeat(l);
        const cue = isCueLine(text) || wholeLineMarker(text) != null;
        return (
          <div class={cue ? 'ln cue' : 'ln'} key={i}>
            {text}{times > 1 && <span class="rep-pill" aria-label={`répéter ${times} fois`}>×{times}</span>}
          </div>
        );
      })}
      {rep && !u.continued && <span class="rep-pill para" aria-label={`paragraphe répété ${u.repeat} fois`}>×{u.repeat}</span>}
    </div>
  );
}
