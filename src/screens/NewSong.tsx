import { EDITION } from '../edition';
import { useState } from 'preact/hooks';
import { liveCatalog, saveCreated } from '../lib/overrides';
import { goBack, replaceHash, songHref, HOME_HASH } from '../lib/router';
import { addToSetlist } from '../lib/setlistEdit';
import { PartSelect } from './AddSheets';
import { serializeChordPro } from '../model/chordpro';
import { IMPORT_EXAMPLE as EXAMPLE, IMPORT_TEMPLATE as TEMPLATE, parseImport, trimTemplate, type ImportResult } from '../model/importText';
import { FEATURES } from '../edition';

const TPL_OPTS = { artist: FEATURES.artist, instruments: FEATURES.instruments };
const IMPORT_TEMPLATE = trimTemplate(TEMPLATE, TPL_OPTS);
const IMPORT_EXAMPLE = trimTemplate(EXAMPLE, TPL_OPTS);
import type { Song } from '../model/types';
import { IconClose } from '../ui/icons';
import { SongEditor } from './editor/SongEditor';

const DRAFT_KEY = `${EDITION.storage}.import.draft`;
const readDraft = () => { try { return localStorage.getItem(DRAFT_KEY) ?? ''; } catch { return ''; } };
const writeDraft = (t: string) => { try { if (t) localStorage.setItem(DRAFT_KEY, t); else localStorage.removeItem(DRAFT_KEY); } catch { /* stockage indisponible */ } };

export const emptySong = (): Song => ({ id: '', title: '', artist: '', tags: [], medley: [], singers: [], musicians: [], sections: [] });

/**
 * Nouveau morceau (mode éditeur) : coller le texte → Analyser → compte rendu → éditeur pré-rempli.
 * Rien n'est créé sans validation.
 */
export function NewSong() {
  const [text, setText] = useState(readDraft);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [editing, setEditing] = useState<{ song: Song; index?: number } | null>(null);
  const [saved, setSaved] = useState<Record<number, string>>({});
  const [part, setPart] = useState(-1);
  const [copied, setCopied] = useState(false);

  const input = (t: string) => { setText(t); writeDraft(t); setResults(null); setSaved({}); };
  const analyse = () => setResults(parseImport(text, [...liveCatalog.value!.songs.values()], { artist: FEATURES.artistRequired }));
  const copyTemplate = async () => {
    try { await navigator.clipboard.writeText(IMPORT_TEMPLATE); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { input(IMPORT_TEMPLATE); }
  };

  const ok = (results ?? []).map((r, i) => ({ r, i })).filter(({ r, i }) => !r.errors.length && !saved[i]);
  const saveAll = async () => {
    const dup = ok.filter(({ r }) => r.duplicateOf);
    if (dup.length && !confirm(`Déjà au catalogue : ${dup.map(({ r }) => r.song.title).join(', ')}.\nLes créer quand même ?`)) return;
    await saveCreated(ok.map(({ r }) => ({ id: r.song.id, cho: serializeChordPro(r.song) })));
    await addToSetlist(part, ok.map(({ r }) => r.song.id));
    setSaved((s) => ({ ...s, ...Object.fromEntries(ok.map(({ r, i }) => [i, r.song.id])) }));
    writeDraft('');
  };

  if (editing) {
    return (
      <SongEditor base={editing.song} create tab="lyrics"
        onClose={() => setEditing(null)}
        onCreated={(id) => {
          if (editing.index == null || (results?.length ?? 0) <= 1) { writeDraft(''); replaceHash(songHref(id)); return; }
          setSaved((s) => ({ ...s, [editing.index!]: id }));
          setEditing(null);
        }} />
    );
  }

  return (
    <div class="sheet new-song" role="dialog" aria-modal="true" aria-label="Nouveau morceau">
      <header class="sheet-head">
        <button class="icon-btn" onClick={() => goBack(HOME_HASH)} aria-label="Fermer"><IconClose /></button>
        <div class="sheet-title"><div class="t">Nouveau morceau</div><div class="a">Colle le texte, puis Analyser</div></div>
      </header>
      <div class="sheet-body">
        <div class="ns-actions">
          <button class="btn ghost small" onClick={copyTemplate}>{copied ? 'Modèle copié ✓' : 'Copier le modèle'}</button>
          <button class="btn ghost small" onClick={() => setEditing({ song: emptySong() })}>Partir d'une page vide</button>
        </div>
        <textarea class="ed-ta ns-ta" value={text} spellcheck={false} aria-label="Texte du morceau"
          placeholder={IMPORT_EXAMPLE}
          onInput={(e) => input((e.target as HTMLTextAreaElement).value)} />
        <button class="btn primary wide" disabled={!text.trim()} onClick={analyse}>Analyser</button>

        {results && (
          <div class="ns-results">
            {results.map((r, i) => (
              <div class={`ns-card${r.errors.length ? ' bad' : ''}`} key={i}>
                <div class="ns-title">
                  <b>{r.song.title || 'Sans titre'}</b> {FEATURES.artist && r.song.artist && <span>{r.song.artist}</span>}
                </div>
                {r.found.length > 0 && <ul class="ns-found">{r.found.map((f) => <li key={f}>{f}</li>)}</ul>}
                {r.warnings.length > 0 && <ul class="ns-warn">{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
                {r.errors.length > 0 && <ul class="ns-err">{r.errors.map((w) => <li key={w}>{w}</li>)}</ul>}
                <div class="ns-card-foot">
                  {saved[i]
                    ? <a class="btn small" href={songHref(saved[i])}>Enregistré ✓ · Voir</a>
                    : <button class="btn small primary" onClick={() => setEditing({ song: r.song, index: i })}>Ouvrir dans l'éditeur</button>}
                </div>
              </div>
            ))}
            {results.length > 1 && (
              <div class="ns-all">
                <PartSelect value={part} onChange={setPart} />
                <button class="btn primary wide" disabled={!ok.length} onClick={saveAll}>
                  {ok.length ? `Enregistrer ${ok.length} morceau${ok.length > 1 ? 'x' : ''} tel${ok.length > 1 ? 's' : ''} quel${ok.length > 1 ? 's' : ''}` : 'Tout est enregistré'}
                </button>
                <p class="hint">Les morceaux en erreur doivent passer par l'éditeur. Rien n'est envoyé au groupe avant PUBLIER.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
