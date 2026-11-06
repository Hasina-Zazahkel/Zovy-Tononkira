import { FEATURES } from '../../edition';
import { useMemo, useState } from 'preact/hooks';
import { catalog } from '../../lib/catalog';
import { deleteSong, dropOverride, effectiveSong, liveCatalog, overrides, saveCreated, saveOverride } from '../../lib/overrides';
import { replaceHash, HOME_HASH } from '../../lib/router';
import { addToSetlist, removeFromSetlist } from '../../lib/setlistEdit';
import { slugify } from '../../model/importText';
import { parseYoutube } from '../../model/youtube';
import { PartSelect } from '../AddSheets';
import { parseChordPro, serializeChordPro } from '../../model/chordpro';
import {
  bodyToText, itemsToBody, keyed, TEXT_HELP, textToItems, toItems, withItems, type Item, type Keyed,
} from '../../model/edit';
import { INSTRUMENT_ROLES, VOICE_ROLES } from '../../model/roles';
import type { Song } from '../../model/types';
import { buildUnits } from '../../stage/paginate';
import { IconClose } from '../../ui/icons';
import { UnitView } from '../Stage';
import { HeaderTab, type HeaderDraft } from './HeaderTab';
import { LyricsBlocks } from './LyricsBlocks';
import { fromRows, MembersDatalist, toRows } from './RoleRows';

type Tab = 'header' | 'lyrics' | 'preview';
type Mode = 'blocks' | 'text';
const wide = () => typeof window !== 'undefined' && window.innerWidth >= 1100;

/**
 * Éditeur complet d'un morceau (mode éditeur uniquement) : en-tête, paroles (blocs ou texte), aperçu.
 * Enregistre le morceau entier sur l'appareil ; « Publier » l'envoie au groupe.
 */
export function SongEditor({ base, onClose, tab: initialTab = 'lyrics', create = false, onCreated }: {
  base: Song; onClose: () => void; tab?: Tab;
  /** Nouveau morceau (import ou page vide) : l'identifiant est fixé à l'enregistrement. */
  create?: boolean; onCreated?: (id: string) => void;
}) {
  const current = useMemo(() => (create ? base : effectiveSong(base)), [base, overrides.value[base.id]]);
  const [part, setPart] = useState(-1);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [mode, setMode] = useState<Mode>(wide() ? 'text' : 'blocks');
  const [head, setHead] = useState<HeaderDraft>({
    title: current.title, artist: current.artist, key: current.key, notes: current.notes ?? '', youtube: current.youtube ?? '',
    singers: toRows(current.singers), musicians: toRows(current.musicians),
  });
  const [items, setItems] = useState<Keyed<Item>[]>(() => toItems(current.sections).map(keyed));
  const [text, setText] = useState(() => bodyToText(itemsToBody(toItems(current.sections))));
  const [warnings, setWarnings] = useState<string[]>([]);
  const hasLocal = !create && !!overrides.value[base.id];
  const isNew = create || !!overrides.value[base.id]?.created;

  /** Paroles actuelles, quel que soit le mode. */
  const currentItems = (): { items: Item[]; warnings: string[] } =>
    mode === 'text' ? textToItems(current, text) : { items, warnings: [] };

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    if (m === 'text') setText(bodyToText(itemsToBody(items)));
    else {
      const r = textToItems(current, text);
      setItems(r.items.map(keyed));
      setWarnings(r.warnings);
    }
    setMode(m);
  };

  /** Morceau complet issu du brouillon. */
  const build = (): { song: Song; errors: string[]; warnings: string[] } => {
    const meta: Song = {
      ...current,
      title: head.title.trim().replace(/[{}]/g, ''),
      artist: head.artist.trim().replace(/[{}]/g, '').toUpperCase(),
      notes: head.notes.trim().replace(/[{}]/g, '') || undefined,
      singers: fromRows(head.singers),
      musicians: fromRows(head.musicians),
    };
    if (head.key) meta.key = head.key; else delete meta.key;
    if (!meta.notes) delete meta.notes;
    const yt = parseYoutube(head.youtube);
    if (yt) meta.youtube = yt; else delete meta.youtube;
    delete meta.capo;
    const li = currentItems();
    const { song } = withItems(meta, li.items);
    const errors: string[] = [];
    if (!song.title) errors.push('Le titre est obligatoire.');
    if (head.youtube.trim() && !yt) errors.push('Lien YouTube non reconnu (onglet En-tête).');
    if (!song.artist && FEATURES.artistRequired) errors.push("L'artiste est obligatoire.");
    if (!song.sections.some((s) => s.stanzas.length)) errors.push('Le morceau doit contenir au moins une ligne de paroles.');
    const bad = [...song.singers.filter((a) => a.role && !VOICE_ROLES.includes(a.role as never)),
      ...song.musicians.filter((a) => a.role && !INSTRUMENT_ROLES.includes(a.role as never))];
    if (bad.length) errors.push(`Rôles hors liste : ${bad.map((a) => `${a.member} « ${a.role} »`).join(', ')}.`);
    return { song, errors, warnings: li.warnings };
  };

  const dirty = () => serializeChordPro(build().song) !== serializeChordPro(current);

  const save = async () => {
    const { song, errors, warnings: w } = build();
    if (errors.length) { setWarnings(errors); return; }
    if (w.length && !confirm(`Attention :\n- ${w.join('\n- ')}\n\nEnregistrer quand même ?`)) return;
    const cho = serializeChordPro(song);
    // Contrôle : ce qui est enregistré se relit à l'identique
    if (serializeChordPro(parseChordPro(base.id, cho).song) !== cho) { setWarnings(['Erreur interne de format : enregistrement annulé.']); return; }
    if (create) {
      const live = liveCatalog.value!.songs;
      const fold = (x: string) => slugify(x);
      const dup = [...live.values()].find((s) => fold(s.title) === fold(song.title) && (!FEATURES.artistRequired || fold(s.artist) === fold(song.artist)));
      if (dup && !confirm(`« ${dup.title} »${dup.artist ? ` (${dup.artist})` : ''} existe déjà. Créer quand même un second morceau ?`)) return;
      const taken = (id: string) => live.has(id) || !!catalog.value?.songs.has(id) || !!overrides.value[id];
      const stem = slugify(song.title);
      let id = stem;
      for (let n = 2; taken(id); n++) id = `${stem}-${n}`;
      await saveCreated([{ id, cho }]);
      await addToSetlist(part, [id]);
      onCreated?.(id);
      return;
    }
    await saveOverride({ songId: base.id, cho, updatedAt: Date.now(), ...(overrides.value[base.id]?.created ? { created: true } : {}) });
    onClose();
  };

  const close = () => {
    if (dirty() && !confirm('Abandonner les modifications non enregistrées ?')) return;
    onClose();
  };

  const remove = async () => {
    if (!confirm(`Supprimer « ${current.title} » ?\n\nIl sera aussi retiré du répertoire. ${isNew && !overrides.value[base.id]?.publishedAt ? 'Il n\'a jamais été publié : il disparaît de cet appareil.' : 'La suppression sera envoyée au groupe avec PUBLIER.'}`)) return;
    await removeFromSetlist(base.id);
    await deleteSong(base.id);
    onClose();
    replaceHash(HOME_HASH);
  };

  const revert = async () => {
    if (!confirm('Abandonner toutes les modifications non publiées de ce morceau sur cet appareil ?')) return;
    await dropOverride(base.id);
    onClose();
  };

  const preview = useMemo(() => (tab === 'preview' ? build() : null), [tab]);

  return (
    <div class="sheet editor" role="dialog" aria-modal="true" aria-label={create ? 'Nouveau morceau' : 'Modifier le morceau'}>
      <MembersDatalist />
      <header class="sheet-head ed-head">
        <button class="icon-btn" onClick={close} aria-label="Fermer"><IconClose /></button>
        <div class="sheet-title">
          <div class="t">{create ? 'Nouveau morceau' : 'Modifier le morceau'}</div>
          <div class="a">{head.title || 'Sans titre'}{create ? '' : isNew ? ' · nouveau, non publié' : hasLocal ? ' · non publié' : ''}</div>
        </div>
        <button class="btn primary" onClick={save}>Enregistrer</button>
      </header>
      <nav class="ed-tabs" role="tablist">
        {([['header', 'En-tête'], ['lyrics', 'Paroles'], ['preview', 'Aperçu']] as const).map(([t, l]) => (
          <button key={t} role="tab" aria-selected={tab === t} class={`ed-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>{l}</button>
        ))}
      </nav>
      {tab === 'lyrics' && (
        <div class="ed-mode">
          <span>Saisie :</span>
          <button class={`mini${mode === 'blocks' ? ' on' : ''}`} onClick={() => switchMode('blocks')}>Blocs</button>
          <button class={`mini${mode === 'text' ? ' on' : ''}`} onClick={() => switchMode('text')}>Texte</button>
        </div>
      )}
      {create && <div class="ed-sl"><PartSelect value={part} onChange={setPart} /></div>}
      {warnings.length > 0 && <div class="msg err ed-msg">{warnings.map((w) => <div key={w}>{w}</div>)}</div>}

      <div class="sheet-body ed-body">
        {tab === 'header' && <HeaderTab d={head} set={(p) => setHead((h) => ({ ...h, ...p }))} songId={create ? undefined : base.id} />}
        {tab === 'lyrics' && mode === 'blocks' && <LyricsBlocks items={items} onChange={setItems} />}
        {tab === 'lyrics' && mode === 'text' && (
          <div class="ed-text">
            <textarea class="ed-ta" value={text} spellcheck={false} aria-label="Paroles (mode texte)"
              onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
            <dl class="ed-help">
              {TEXT_HELP.map(([k, v]) => <div key={k}><dt><code>{k}</code></dt><dd>{v}</dd></div>)}
            </dl>
          </div>
        )}
        {tab === 'preview' && preview && (
          <div class="ed-preview lyrics upper" style={{ '--lyric-size': '30px', '--stanza-gap': '20px' }}>
            <div class="pv-head">
              <b>{preview.song.title}</b> <span>{preview.song.artist}</span>
            </div>
            {buildUnits(preview.song).map((u) => <UnitView u={u} key={u.key} />)}
          </div>
        )}
        {hasLocal && !isNew && <button class="btn ghost ed-revert" onClick={revert}>Rétablir la version publiée</button>}
        {!create && tab === 'header' && <button class="btn danger ed-delete" onClick={remove}>Supprimer le morceau</button>}
      </div>
    </div>
  );
}
