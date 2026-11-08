import { Fragment } from 'preact';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { catalog, flattenSetlist } from '../lib/catalog';
import { liveCatalog, overrides } from '../lib/overrides';
import { canEdit } from '../lib/publish';
import { currentSetlist } from '../lib/setlistEdit';
import { SongEditor } from './editor/SongEditor';
import { goBack, replaceHash, songHref, HOME_HASH } from '../lib/router';
import { bumpFont, FONT_MAX, FONT_MIN, settings, update } from '../lib/settings';
import { isCueLine } from '../lib/text';
import { wakeState } from '../lib/wakeLock';
import { displayKey } from '../model/chordpro';
import { CUE_LABEL } from '../model/cues';
import { viewLines, wholeLineMarker, type LineView } from '../model/repeat';
import type { Assignment, Section, Song } from '../model/types';
import { buildUnits, paginate, type Column, type Measure, type Unit } from '../stage/paginate';
import {
  currentDefaultHides, deleteNote, personalBooks, personalHides, saveDefaultHides, saveNote, setPersonalHide,
} from '../lib/personal';
import { effectiveHidden, rangeFor, resolveHide, type HideRange } from '../model/hide';
import { saveOverride } from '../lib/overrides';
import { serializeChordPro } from '../model/chordpro';
import { makeNote, resolveNotes, type PersonalNote, type PnMark } from '../model/personal';
import { groupLines, HL_COLORS, HL_DEFAULT, ungroupWhere, type HlColor } from '../model/repeat';
import { DraftInput } from '../ui/DraftInput';
import { YoutubePlayer } from '../ui/YoutubePlayer';
import { AudioPlayer } from '../ui/AudioPlayer';
import { tracksFor } from '../lib/audio';
import { downloadSongPdf } from '../lib/pdfButton';
import { FEATURES } from '../edition';
import { IconBack, IconPlay, IconGuitar, IconMic, IconNote, IconEyeOff, IconCollapse, IconEdit, IconExpand, IconInfo, IconMoon, IconNext, IconPrev, IconSun, IconDownload } from '../ui/icons';

interface Props { id: string; setlistId?: string; pos?: number }

export function Stage({ id, setlistId, pos }: Props) {
  const state = liveCatalog.value!;
  // Version affichée (publiée + modifs locales) ; objet stable tant que les modifs ne changent pas
  const song = state.songs.get(id);
  const ov = overrides.value[id];
  // Base de l'éditeur : version publiée, ou le morceau lui-même s'il a été créé ici
  const base = catalog.value!.songs.get(id) ?? song;
  const fallback = setlistId ? '#/repertoire' : HOME_HASH;

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
  const { uppercase, keepAwake, headerCollapsed, structureOnly } = settings.value;
  // Vue musicien : seulement si l'édition la propose
  const mode = FEATURES.musicianView ? settings.value.view : 'chanteur';
  const musician = mode === 'musicien';
  const fontSize = musician ? settings.value.fontSizeM : settings.value.fontSize;
  const [editing, setEditing] = useState<false | 'header' | 'lyrics'>(false);
  const press = useRef<number | undefined>(undefined);
  const [infoOpen, setInfoOpen] = useState(false);
  const [ytOpen, setYtOpen] = useState(false);
  const [auOpen, setAuOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const units = useMemo(() => buildUnits(song), [song]);

  // Notes personnelles (locales) : mode annotation, sélection, panneau
  const [annot, setAnnot] = useState(false);
  const [pick, setPick] = useState<{ key: string; line: number } | null>(null);
  const [replacing, setReplacing] = useState<PersonalNote | null>(null);
  const [panel, setPanel] = useState<{ key: string; from: number; to: number; id?: string; color: HlColor; note: string; forAll: boolean; official?: number } | null>(null);
  const myNotes = personalBooks.value[mode][song.id];
  const resolved = useMemo(() => resolveNotes(song, myNotes ?? []), [song, myNotes]);
  const showPn = settings.value.showPersonal || annot;
  /** Groupes publiés d'une strophe (surlignages / répétitions), pour l'admin. */
  const stanzaViews = (key: string) => {
    const [sid, j] = key.split('.');
    const st = song.sections.find((x) => x.id === sid)?.stanzas[Number(j)];
    return st ? viewLines(st) : [];
  };
  const tapLine = (key: string, line: number) => {
    const g = stanzaViews(key)[line]?.group;
    if (canEdit.value && g && g.times <= 1 && !pick && !replacing && !resolved.marks.get(key)?.get(line)) {
      const vs = stanzaViews(key);
      const ls = vs.map((v, i) => (v.group?.id === g.id ? i : -1)).filter((i) => i >= 0);
      setPanel({ key, from: Math.min(...ls), to: Math.max(...ls), color: g.color ?? HL_DEFAULT, note: g.note, forAll: true, official: g.id });
      return;
    }
    const m = resolved.marks.get(key)?.get(line);
    if (m && !pick && !replacing) {
      const lines = [...resolved.marks.get(key)!].filter(([, x]) => x.id === m.id).map(([l]) => l);
      setPanel({ key, from: Math.min(...lines), to: Math.max(...lines), id: m.id, color: m.color, note: m.note, forAll: false });
      return;
    }
    if (!pick || pick.key !== key) { setPick({ key, line }); return; }
    const src = replacing;
    setPanel({ key, from: Math.min(pick.line, line), to: Math.max(pick.line, line), id: src?.id, color: src?.color ?? HL_DEFAULT, note: src?.note ?? '', forAll: false });
    setPick(null);
  };
  const pnFor = (u: Unit, live = true): PnProps | undefined => {
    if (u.cue != null) return undefined;
    const k = stanzaKey(u);
    return {
      marks: showPn ? resolved.marks.get(k) : undefined,
      ...(live && annot ? { pick: pick?.key === k ? pick.line : null, onLine: (l: number) => tapLine(k, l) } : {}),
    };
  };
  /** Surlignage publié (pour tout le groupe) : modifie le morceau, envoyé avec PUBLIER. */
  const applyOfficial = async (key: string, edit: (lines: string[]) => string[]) => {
    const [sid, j] = key.split('.');
    const next = { ...song, sections: song.sections.map((x) => (x.id !== sid ? x : { ...x, stanzas: x.stanzas.map((st, k) => (k === Number(j) ? edit(st) : st)) })) };
    const ov = overrides.value[song.id];
    await saveOverride({ songId: song.id, cho: serializeChordPro(next), updatedAt: Date.now(), ...(ov?.created ? { created: true } : {}) });
  };
  /** Un surlignage publié ne peut pas recouvrir une répétition de lignes (à faire dans l'éditeur). */
  const blocksOfficial = (p: NonNullable<typeof panel>) =>
    stanzaViews(p.key).some((v, i) => i >= p.from && i <= p.to && v.group && v.group.times > 1);
  const savePanel = async () => {
    if (!panel) return;
    if (panel.forAll) {
      if (blocksOfficial(panel)) return;
      const { key, from, to, color, note, official } = panel;
      await applyOfficial(key, (st) => groupLines(official != null ? ungroupWhere(st, (id) => id === official) : st, from, to, 1, note.trim(), color));
      setPanel(null); setReplacing(null);
      return;
    }
    const n = makeNote(song, panel.key, panel.from, panel.to, panel.color, panel.note, panel.id);
    if (!n) return;
    // Les notes perso qui touchent ces lignes sont remplacées (jamais de chevauchement entre notes perso)
    const marks = resolved.marks.get(panel.key);
    const replace = new Set<string>();
    for (let l = panel.from; l <= panel.to; l++) { const m = marks?.get(l); if (m && m.id !== panel.id) replace.add(m.id); }
    await saveNote(mode, song.id, n, [...replace]);
    setPanel(null); setReplacing(null);
  };

  // Vue musicien : lignes masquées (défaut admin + perso), mode masquage
  const [hideMode, setHideMode] = useState(false);
  const [hideForAll, setHideForAll] = useState(false);
  const defaults = currentDefaultHides.value[song.id] ?? NO_RANGES;
  const mine = personalHides.value[song.id];
  const hiddenView = useMemo(() => effectiveHidden(song, defaults, mine), [song, defaults, mine]);
  const hiddenFor = (k: string, n: number): Set<number> | undefined => {
    if (!musician) return undefined;
    const set = new Set(hiddenView.hidden.get(k) ?? []);
    if (structureOnly && !hideMode) for (let l = 1; l < n; l++) set.add(l);
    return set.size ? set : undefined;
  };
  /** Masque / réaffiche des lignes d'une strophe (perso, ou par défaut pour tous si l'admin l'a choisi). */
  const setHidden = async (key: string, lines: number[], hide: boolean) => {
    if (hideForAll && canEdit.value) {
      const map = resolveHide(song, defaults).get(key) ?? new Map<number, string>();
      let next = [...defaults];
      for (const l of lines) {
        const id = map.get(l);
        if (hide && !id) { const r = rangeFor(song, key, l); if (r) next.push(r); }
        if (!hide && id) next = next.filter((r) => r.id !== id);
      }
      await saveDefaultHides(song.id, next);
      return;
    }
    const dmap = resolveHide(song, defaults).get(key) ?? new Map<number, string>();
    const pmap = resolveHide(song, mine?.hide ?? []).get(key) ?? new Map<number, string>();
    let hideList: HideRange[] = [...(mine?.hide ?? [])];
    let show = [...(mine?.show ?? [])];
    for (const l of lines) {
      const d = dmap.get(l), p = pmap.get(l);
      if (hide) {
        if (d && show.includes(d)) show = show.filter((x) => x !== d);
        else if (!d && !p) { const r = rangeFor(song, key, l); if (r) hideList.push(r); }
      } else {
        if (p) hideList = hideList.filter((r) => r.id !== p);
        if (d && !show.includes(d)) show.push(d);
      }
    }
    await setPersonalHide(song.id, { hide: hideList, show });
  };
  const hideFor = (u: Unit, live = true): HideProps | undefined => {
    if (!musician || u.cue != null || !u.lines) return undefined;
    const k = stanzaKey(u);
    const total = song.sections.find((x) => `${x.id}` === k.split('.')[0])?.stanzas[Number(k.split('.')[1])]?.length ?? u.lines.length;
    const set = hiddenFor(k, total);
    const all = Array.from({ length: total }, (_, i) => i);
    const rest = all.slice(1);
    return {
      set, mode: hideMode,
      ...(live && hideMode ? {
        onToggle: (l: number) => void setHidden(k, [l], !set?.has(l)),
        collapsed: rest.length > 0 && rest.every((l) => set?.has(l)),
        onCollapse: () => void setHidden(k, rest, !rest.every((l) => set?.has(l))),
      } : {}),
    };
  };

  const bodyRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  /** Un écran = 1 colonne (smartphone, tablette portrait) ou 2 colonnes (PC). */
  const [pages, setPages] = useState<Column[][]>([]);
  const [page, setPage] = useState(0);
  const target = useRef(0);
  // Vue musicien : autant de colonnes que la largeur le permet (tout le morceau d'un coup d'œil)
  const cols = musician ? Math.max(1, Math.floor((box.w + 40) / (fontSize * 15 + 40))) : box.w >= 1100 ? 2 : 1;

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
  }, [units, fontSize, uppercase, geo, cols, resolved, showPn, musician, hiddenView, hideMode, structureOnly]);

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
  const sub = [FEATURES.artist ? song.artist : '', nav?.part ? `${nav.part} · ${nav.pos + 1}/${nav.total}` : ''].filter(Boolean).join(' · ');

  const keyBadge = song.key ? <span class="key" aria-label="Tonalité">{displayKey(song.key)}</span> : null;
  const commentEl = note
    ? (canEdit.value
      ? <button class="comment" onClick={() => setEditing('header')} aria-label={`Commentaire : ${note}`}>{note}</button>
      : <button class="comment" onClick={() => setInfoOpen(true)} aria-label={`Commentaire : ${note}`}>{note}</button>)
    : canEdit.value ? <button class="comment add-comment" onClick={() => setEditing('header')}>+ Commentaire</button> : null;

  return (
    <div class={`stage${headerCollapsed ? ' collapsed' : ''}${musician ? ' musicien' : ''}`} style={style}>
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
            {FEATURES.youtube && song.youtube && (
              <button class={`pill-btn yt-open${ytOpen ? ' on' : ''}`} onClick={() => setYtOpen(!ytOpen)} aria-pressed={ytOpen} aria-label="Écouter l'original">
                <IconPlay size={20} /><span>Original</span>
              </button>
            )}
            {FEATURES.audio && tracksFor(song.id).length > 0 && (
              <button class={`pill-btn au-open${auOpen ? ' on' : ''}`} onClick={() => setAuOpen(!auOpen)} aria-pressed={auOpen} aria-label="Écouter les pistes audio">
                <IconPlay size={20} /><span>Écouter</span>
              </button>
            )}
            {FEATURES.pdf && (
              <button class={`pill-btn pdf-btn${pdfBusy ? ' on' : ''}`} disabled={pdfBusy} aria-label="Télécharger les paroles en PDF"
                onClick={async () => { setPdfBusy(true); try { await downloadSongPdf(song, { uppercase }); } catch { alert('PDF impossible à créer.'); } setPdfBusy(false); }}>
                <IconDownload size={20} /><span>PDF</span>
              </button>
            )}
            {FEATURES.musicianView && <button class="pill-btn view-btn" onClick={() => { update({ view: musician ? 'chanteur' : 'musicien' }); setHideMode(false); setPanel(null); setPick(null); }}
              aria-label={`Vue ${mode} (changer)`} title="Changer de vue">
              {musician ? <IconGuitar size={22} /> : <IconMic size={22} />}<span>{musician ? 'Musicien' : 'Chanteur'}</span>
            </button>}
            <button class={`pill-btn pn-btn${annot ? ' on' : ''}`} onClick={() => { setAnnot(!annot); setHideMode(false); setPick(null); setReplacing(null); setInfoOpen(false); }}
              aria-pressed={annot} aria-label="Mes notes">
              <IconNote size={22} /><span class="pn-lbl">Mes notes</span>
            </button>
            <span class="spacer">{commentEl && <span class="ctl-comment">{commentEl}</span>}</span>
            <button class="font-btn" onClick={() => bumpFont(-1)} disabled={fontSize <= FONT_MIN} aria-label="Réduire le texte"><small>A</small>−</button>
            <button class="font-btn" onClick={() => bumpFont(1)} disabled={fontSize >= FONT_MAX} aria-label="Agrandir le texte">A+</button>
            {canEdit.value && (
              <button class="case-btn" onClick={() => update({ uppercase: !uppercase })} aria-label="Majuscules">{uppercase ? 'AA' : 'Aa'}</button>
            )}
            <button class={`icon-btn wake-btn${wakeState.value === 'on' ? ' on' : ''}`} onClick={() => update({ keepAwake: !keepAwake })}
              aria-label="Écran toujours allumé" title={`Écran allumé : ${wakeState.value}`}>
              {keepAwake ? <IconSun size={26} /> : <IconMoon size={26} />}
            </button>
            {canEdit.value && (
              <button class="icon-btn" onClick={() => setEditing('lyrics')} aria-label="Modifier le morceau"><IconEdit size={26} /></button>
            )}
            <button class="icon-btn" onClick={() => { setInfoOpen(false); update({ headerCollapsed: true }); }} aria-label="Masquer l'en-tête"><IconCollapse size={26} /></button>
          </div>
          {musician && (
            <div class="m-tools">
              <button class={`chip-btn${structureOnly ? ' on' : ''}`} aria-pressed={structureOnly} onClick={() => update({ structureOnly: !structureOnly })}>Structure seule</button>
              <button class={`chip-btn${hideMode ? ' on' : ''}`} aria-pressed={hideMode}
                onClick={() => { setHideMode(!hideMode); setAnnot(false); setPick(null); setPanel(null); }}>
                <IconEyeOff size={18} /> Masquer des lignes
              </button>
              {hideMode && canEdit.value && (
                <label class="m-forall"><input type="checkbox" checked={hideForAll} onChange={(e) => setHideForAll((e.target as HTMLInputElement).checked)} />
                  Par défaut pour tous les musiciens</label>
              )}
            </div>
          )}
          {infoOpen && <InfoPanel song={song} note={note} onClose={() => setInfoOpen(false)} />}
        </header>
      )}

      <div class="stage-body" ref={bodyRef}>
        <div class={`measure ${lyricsCls}`} ref={measureRef} aria-hidden="true" style={geo ? { width: `${geo.colW}px` } : undefined}>
          {units.map((u) => <UnitView u={u} key={u.key} pn={pnFor(u, false)} hide={hideFor(u, false)} />)}
        </div>
        <div class="pages" ref={pagesRef} onScroll={onScroll} onClick={() => infoOpen && setInfoOpen(false)}>
          {pages.map((p, i) => (
            <div class={`page ${lyricsCls}${cols > 1 ? ' two' : ''}`} key={i} aria-hidden={i !== page}>
              {p.map((c, j) => <div class="col" key={j} style={{ gap: `${c.gap}px`, '--lh': c.scale }}>{c.units.map((u) => <UnitView u={u} key={u.key} pn={pnFor(u)} hide={hideFor(u)} />)}</div>)}
            </div>
          ))}
        </div>
      </div>

      {hideMode && (
        <div class="pn-bar" role="status">
          <div class="pn-bar-row">
            <span class="pn-hint">{hideForAll && canEdit.value
              ? 'Par défaut pour tous : touche une ligne pour la masquer / réafficher (envoyé avec PUBLIER)'
              : 'Touche une ligne pour la masquer / réafficher ; « Replier » garde la 1re ligne du paragraphe'}</span>
            <button class="chip-btn on" onClick={() => setHideMode(false)}>Terminer</button>
          </div>
        </div>
      )}
      {annot && !panel && (
        <div class="pn-bar" role="status">
          <div class="pn-bar-row">
            <span class="pn-hint">👤 {replacing ? 'Replacer : ' : ''}{pick ? '…puis la dernière ligne (la même = une seule)' : 'Touche la 1re ligne à surligner, ou une note pour la modifier'}</span>
            <button class="chip-btn on" onClick={() => { setAnnot(false); setPick(null); setReplacing(null); }}>Terminer</button>
          </div>
          {resolved.orphans.length > 0 && !replacing && (
            <details class="pn-orphans">
              <summary>{resolved.orphans.length} note{resolved.orphans.length > 1 ? 's' : ''} à replacer (paroles modifiées)</summary>
              {resolved.orphans.map((o) => (
                <div class="pn-orphan" key={o.id}>
                  <span class={`pn-dot pn-${o.color}`} />
                  <span class="t">« {o.lines[0]}{o.lines.length > 1 ? ' …' : ''} »{o.note && <i> — {o.note}</i>}</span>
                  <button class="chip-btn" onClick={() => { setReplacing(o); setPick(null); }}>Replacer</button>
                  <button class="icon-btn del" aria-label="Supprimer cette note" onClick={() => void deleteNote(mode, song.id, o.id)}>✕</button>
                </div>
              ))}
            </details>
          )}
        </div>
      )}
      {panel && (
        <div class="pn-panel" role="dialog" aria-label="Ma note">
          <div class="pn-panel-head">
            <b>{panel.forAll ? '👥 Note du groupe' : '👤 Ma note'}</b>
            <span>{panel.to > panel.from ? `${panel.to - panel.from + 1} lignes` : '1 ligne'} · {panel.forAll ? 'visible par tous après PUBLIER' : `vue ${mode}, seulement sur cet appareil`}</span>
          </div>
          <span class="hl-swatches" role="radiogroup" aria-label="Couleur">
            {HL_COLORS.map((c) => (
              <button key={c} role="radio" aria-checked={panel.color === c} aria-label={c} title={c}
                class={`swatch hl-${c}${panel.color === c ? ' on' : ''}`} onClick={() => setPanel({ ...panel, color: c })} />
            ))}
          </span>
          <DraftInput key={`${panel.key}:${panel.from}:${panel.id ?? ""}`} class="in" value={panel.note} maxLength={80} placeholder="Commentaire facultatif (ex. respirer ici)" aria-label="Mon commentaire"
            onValue={(x) => setPanel((p) => (p ? { ...p, note: x } : p))} />
          {canEdit.value && panel.official == null && !replacing && (
            <label class="pn-forall">
              <input type="checkbox" checked={panel.forAll} onChange={(e) => setPanel({ ...panel, forAll: (e.target as HTMLInputElement).checked })} />
              Pour tout le monde (surlignage du groupe, envoyé avec PUBLIER)
            </label>
          )}
          {panel.forAll && blocksOfficial(panel) && <p class="msg err">Ces lignes sont dans une répétition de lignes : surligne-les depuis l'éditeur.</p>}
          <div class="pn-panel-foot">
            {panel.official != null && <button class="btn ghost small" onClick={async () => { await applyOfficial(panel.key, (st) => ungroupWhere(st, (id) => id === panel.official)); setPanel(null); }}>Retirer</button>}
            {panel.id && !replacing && !panel.forAll && <button class="btn ghost small" onClick={async () => { await deleteNote(mode, song.id, panel.id!); setPanel(null); }}>Supprimer</button>}
            <button class="btn small" onClick={() => { setPanel(null); setPick(null); }}>Annuler</button>
            <button class="btn primary small" disabled={panel.forAll && blocksOfficial(panel)} onClick={savePanel}>Enregistrer</button>
          </div>
        </div>
      )}

      {ytOpen && song.youtube && FEATURES.youtube && <YoutubePlayer key={song.youtube} id={song.youtube} onClose={() => setYtOpen(false)} />}
      {auOpen && FEATURES.audio && tracksFor(song.id).length > 0 && <AudioPlayer key={song.id} song={song} onClose={() => setAuOpen(false)} />}
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

/** Notes personnelles d'une strophe : marques par ligne + sélection en cours (mode « Mes notes »). */
export interface PnProps { marks?: Map<number, PnMark>; pick?: number | null; onLine?: (line: number) => void }

/** Vue musicien : lignes masquées d'une strophe + mode masquage. */
export interface HideProps { set?: Set<number>; mode: boolean; onToggle?: (line: number) => void; collapsed?: boolean; onCollapse?: () => void }

export function UnitView({ u, pn, hide }: { u: Unit; pn?: PnProps; hide?: HideProps }) {
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
      {hide?.onCollapse && !u.continued && (u.lines?.length ?? 0) > 1 && (
        <button class="collapse-btn" onClick={(e) => { e.stopPropagation(); hide.onCollapse!(); }}>{hide.collapsed ? '⤓ Déplier' : '⤒ Replier'}</button>
      )}
      {groupRuns(u.views ?? viewLines(u.lines ?? [])).map((run, r, all) => {
        const before = all.slice(0, r).reduce((n, x) => n + x.lines.length, 0);
        const lines = run.lines.map((v, i) => {
          const cue = isCueLine(v.text) || wholeLineMarker(v.text) != null;
          const g = v.group;
          const idx = (u.start ?? 0) + before + i;
          const hid = !!hide?.set?.has(idx);
          if (hid && !hide!.mode) {
            // Masquée : seule la 1re d'une suite affiche « ⋯ n lignes » ; les autres ont une hauteur nulle
            if (hide!.set!.has(idx - 1) && idx > (u.start ?? 0)) return <div class="ln hid" key={i} />;
            let n = 0;
            while (hide!.set!.has(idx + n)) n++;
            return <div class="ln hid-ph" key={i}>⋯ {n} ligne{n > 1 ? 's' : ''}</div>;
          }
          const m = pn?.marks?.get(idx);
          const cls = `${cue ? 'ln cue' : 'ln'}${g?.last && g.times > 1 ? ' grp-last' : ''}`
            + (m ? ` pn pn-${m.color}${m.first ? ' pn-first' : ''}${m.last ? ' pn-last' : ''}` : '')
            + (pn?.onLine || hide?.onToggle ? ' pickable' : '') + (pn?.pick === idx ? ' picked' : '') + (hid ? ' hid-on' : '');
          return (
            <div class={cls} key={i} onClick={hide?.onToggle ? (e) => { e.stopPropagation(); hide.onToggle!(idx); }
              : pn?.onLine ? (e) => { e.stopPropagation(); pn.onLine!(idx); } : undefined}>
              {m?.first && m.note && <span class="pn-note">👤 {m.note}</span>}
              <span class="ln-t">{v.text}</span>{v.times > 1 && <span class="rep-pill" aria-label={`répéter ${v.times} fois`}>×{v.times}</span>}
              {v.note && <span class="ln-note">{v.note}</span>}
              {g && g.times <= 1 && g.first && g.note && <span class="ln-note grp-note">{g.note}</span>}
              {g && g.times > 1 && g.last && g.note && <span class="ln-note grp-note">{g.note}</span>}
              {g && g.times > 1 && g.last && <span class="rep-pill para" aria-label={`lignes répétées ${g.times} fois`}>×{g.times}</span>}
            </div>
          );
        });
        const g0 = run.lines[0].group;
        return g0 ? <div class={g0.times > 1 ? 'grp' : `hl hl-${g0.color ?? 'bleu'}`} key={r}>{lines}</div> : <Fragment key={r}>{lines}</Fragment>;
      })}
      {rep && !u.continued && <span class="rep-pill para" aria-label={`paragraphe répété ${u.repeat} fois`}>×{u.repeat}</span>}
    </div>
  );
}

/** Clé de strophe d'une unité (sans le suffixe de découpage « #n »). */
const stanzaKey = (u: Unit) => u.key.split('#')[0];
const NO_RANGES: HideRange[] = [];


/** Regroupe les lignes consécutives d'un même groupe répété (barre dorée commune). */
function groupRuns(views: LineView[]): { group: number | null; lines: LineView[] }[] {
  const runs: { group: number | null; lines: LineView[] }[] = [];
  for (const v of views) {
    const g = v.group?.id ?? null;
    const last = runs[runs.length - 1];
    if (last && last.group === g && !(g != null && v.group!.first)) last.lines.push(v);
    else runs.push({ group: g, lines: [v] });
  }
  return runs;
}
