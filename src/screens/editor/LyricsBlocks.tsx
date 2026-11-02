import { CUE_LABEL, CUE_TYPES } from '../../model/cues';
import {
  insertAt, keyed, mergeWithPrevious, move, removeAt, removeLine, replaceAt, splitStanza, type Item, type Keyed,
} from '../../model/edit';
import { formatLine, groupLines, HL_COLORS, parseLine, setGroup, ungroupWhere, viewLines } from '../../model/repeat';
import type { Assignment, CueType } from '../../model/types';
import { Chips } from '../Stage';
import { RoleRows, fromRows, toRows } from './RoleRows';
import { useState } from 'preact/hooks';
import { DraftInput } from '../../ui/DraftInput';

type KItem = Keyed<Item>;
const REPEATS = [1, 2, 3, 4, 5, 6, 8];
const nextTimes = (n: number) => (n >= 4 ? 1 : n + 1);

/** Focus d'une ligne après rendu (création / suppression au clavier). */
function focusLine(uid: number, line: number, atEnd = true) {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLInputElement>(`[data-line="${uid}:${line}"]`);
    if (!el) return;
    el.focus();
    if (atEnd) el.setSelectionRange(el.value.length, el.value.length);
  });
}

export function LyricsBlocks({ items, onChange }: { items: KItem[]; onChange: (i: KItem[]) => void }) {
  const [voicesOpen, setVoicesOpen] = useState<number | null>(null);
  /** Sélection de lignes à répéter : paragraphe concerné et 1re ligne touchée. */
  const [pick, setPick] = useState<{ uid: number; start: number | null; mode: 'repeat' | 'note' } | null>(null);
  const [notesOpen, setNotesOpen] = useState<Set<string>>(new Set());
  const toggleNote = (k: string) => setNotesOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const set = (i: number, it: Item) => onChange(replaceAt(items, i, { ...it, uid: items[i].uid }));
  const mk = (it: Item) => keyed(it);
  let para = 0;

  const Insert = ({ at }: { at: number }) => (
    <div class="ins-bar">
      <button onClick={() => { const it = keyed({ kind: 'stanza', lines: [''], repeat: 1 }); onChange(insertAt(items, at, it)); focusLine(it.uid, 0); }}>+ Paragraphe</button>
      <button onClick={() => onChange(insertAt(items, at, keyed({ kind: 'cue', cue: at === 0 ? 'intro' : at >= items.length ? 'outro' : 'interlude', note: '' })))}>+ Intro / Interlude / Outro</button>
      <button onClick={() => onChange(insertAt(items, at, keyed({ kind: 'section', label: '', voices: [] })))}>+ Section</button>
    </div>
  );

  const Tools = ({ i }: { i: number }) => (
    <span class="blk-tools">
      <button class="mini" disabled={i === 0} onClick={() => onChange(move(items, i, -1))} aria-label="Monter">↑</button>
      <button class="mini" disabled={i === items.length - 1} onClick={() => onChange(move(items, i, 1))} aria-label="Descendre">↓</button>
      <button class="mini red" onClick={() => onChange(removeAt(items, i))} aria-label="Supprimer">✕</button>
    </span>
  );

  return (
    <div class="blocks">
      <Insert at={0} />
      {items.map((it, i) => {
        const block = (() => {
          if (it.kind === 'cue') {
            return (
              <div class={`blk cue ${it.cue}`}>
                <span class="blk-ico">♪</span>
                <select class="in sel" value={it.cue} aria-label="Catégorie"
                  onChange={(e) => set(i, { ...it, cue: (e.target as HTMLSelectElement).value as CueType })}>
                  {CUE_TYPES.map((t) => <option value={t} key={t}>{CUE_LABEL[t]}</option>)}
                </select>
                <input class="in" value={it.note} placeholder="Commentaire (ex. guitare, ×4)" maxLength={60} aria-label="Commentaire"
                  onInput={(e) => set(i, { ...it, note: (e.target as HTMLInputElement).value })} />
                <Tools i={i} />
              </div>
            );
          }
          if (it.kind === 'section') {
            const open = voicesOpen === it.uid;
            return (
              <div class="blk sec">
                <div class="blk-row">
                  <span class="blk-ico">§</span>
                  <input class="in sec-name" value={it.label} placeholder="Nouvelle section (nom facultatif)" aria-label="Nom de la section"
                    onInput={(e) => set(i, { ...it, label: (e.target as HTMLInputElement).value })} />
                  <button class={`mini${open ? ' on' : ''}`} onClick={() => setVoicesOpen(open ? null : it.uid)}>Voix{it.voices.length ? ` (${it.voices.length})` : ''}</button>
                  <Tools i={i} />
                </div>
                {!open && it.voices.length > 0 && <div class="blk-chips"><Chips list={it.voices} kind="voice" /></div>}
                {open && <SectionVoices voices={it.voices} onChange={(voices) => set(i, { ...it, voices })} />}
              </div>
            );
          }
          para += 1;
          const prevIsStanza = items[i - 1]?.kind === 'stanza';
          return (
            <div class={`blk st${it.repeat > 1 ? ' rep' : ''}`}>
              <div class="blk-row head">
                <span class="blk-n">Paragraphe {para}</span>
                <label class="rep-sel">
                  <span>↻</span>
                  <select value={it.repeat} aria-label="Répéter le paragraphe"
                    onChange={(e) => set(i, { ...it, repeat: Number((e.target as HTMLSelectElement).value) })}>
                    {REPEATS.map((n) => <option value={n} key={n}>{n === 1 ? '×1' : `×${n}`}</option>)}
                  </select>
                </label>
                {it.lines.length > 1 && (
                  <button class={`mini${pick?.uid === it.uid ? ' on' : ''}`} onClick={() => setPick(pick?.uid === it.uid ? null : { uid: it.uid, start: null, mode: 'repeat' })}
                    title="Répéter ou commenter quelques lignes de ce paragraphe" aria-label="Répéter des lignes">⟦⟧<span class="lbl-wide"> Lignes</span></button>
                )}
                {prevIsStanza && <button class="mini" onClick={() => onChange(mergeWithPrevious(items, i, mk))} title="Fusionner avec le paragraphe précédent" aria-label="Fusionner avec le paragraphe précédent">⤒<span class="lbl-wide"> Fusionner</span></button>}
                <Tools i={i} />
              </div>
              {pick?.uid === it.uid && (
                <div class="pick-bar">
                  <div class="pick-modes" role="radiogroup" aria-label="Action sur les lignes">
                    <button role="radio" aria-checked={pick.mode === 'repeat'} class={`chip-btn${pick.mode === 'repeat' ? ' on' : ''}`}
                      onClick={() => setPick({ ...pick, mode: 'repeat' })}>↻ Répéter</button>
                    <button role="radio" aria-checked={pick.mode === 'note'} class={`chip-btn${pick.mode === 'note' ? ' on' : ''}`}
                      onClick={() => setPick({ ...pick, mode: 'note' })}>🖍 Surligner / commenter</button>
                  </div>
                  <p class="pick-hint">{pick.start == null
                    ? `Touche la 1re ligne ${pick.mode === 'repeat' ? 'à répéter' : 'à surligner'}…`
                    : '…puis la dernière (la même ligne = cette ligne seule).'}</p>
                </div>
              )}
              {pick?.uid === it.uid && viewLines(it.lines).map((v, l) => {
                const a = pick.start;
                return (
                  <button class={`ln-pick${a === l ? ' on' : ''}`} key={l} onClick={() => {
                    if (a == null) { setPick({ ...pick, start: l }); return; }
                    if (pick.mode === 'note') {
                      set(i, { ...it, lines: groupLines(it.lines, a, l, 1) });
                      requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-grp-note="${it.uid}:${Math.min(a, l)}"]`)?.focus());
                    } else set(i, { ...it, lines: groupLines(it.lines, a, l) });
                    setPick(null);
                  }}>{v.text || '…'}</button>
                );
              })}
              {pick?.uid !== it.uid && it.lines.map((raw, l) => {
                const lp = parseLine(raw);
                const view = viewLines(it.lines)[l];
                const g = view.group;
                const gHead = g?.first ? (
                  <div class={`grp-head${g.times <= 1 ? ' note-only' : ''}`}>
                    {g.times > 1 ? (
                      <>
                        <span>⟦ Lignes répétées</span>
                        <select value={g.times} aria-label="Répétitions du groupe de lignes"
                          onChange={(e) => set(i, { ...it, lines: setGroup(it.lines, l, { times: Number((e.target as HTMLSelectElement).value) }) })}>
                          {REPEATS.filter((n) => n > 1).map((n) => <option value={n} key={n}>×{n}</option>)}
                        </select>
                      </>
                    ) : (
                      <span class="hl-swatches" role="radiogroup" aria-label="Couleur du surlignage">
                        {HL_COLORS.map((c) => (
                          <button key={c} role="radio" aria-checked={g.color === c} aria-label={c} title={c}
                            class={`swatch hl-${c}${g.color === c ? ' on' : ''}`}
                            onClick={() => set(i, { ...it, lines: setGroup(it.lines, l, { color: c }) })} />
                        ))}
                      </span>
                    )}
                    <DraftInput class="in grp-note-in" value={g.note} maxLength={60} data-grp-note={`${it.uid}:${l}`}
                      placeholder={g.times > 1 ? 'Commentaire (ex. chœur seul)' : 'Commentaire facultatif (ex. Misa seule)'}
                      aria-label={g.times > 1 ? 'Commentaire du groupe' : 'Commentaire des lignes'}
                      onValue={(x) => set(i, { ...it, lines: setGroup(it.lines, l, { note: x }) })} />
                    <button class="mini red" onClick={() => set(i, { ...it, lines: ungroupWhere(it.lines, (id) => id === g.id) })}
                      aria-label={g.times > 1 ? 'Ne plus répéter ces lignes' : 'Retirer le surlignage'}>✕</button>
                  </div>
                ) : null;
                const { text, times, note } = lp;
                const nk = `${it.uid}:${l}`;
                const showNote = !!note || notesOpen.has(nk);
                const setLine = (patch: Partial<typeof lp>) => set(i, { ...it, lines: replaceAt(it.lines, l, formatLine({ ...lp, ...patch })) });
                return (
                  <div class={`ln-wrap${g ? (g.times > 1 ? ' in-grp' : ` in-hl hl-${g.color}`) : ''}${g?.last ? ' grp-end' : ''}`} key={l}>
                    {gHead}
                    <div class="ln-row">
                      <DraftInput class="ln-in" value={text} data-line={`${it.uid}:${l}`} aria-label={`Ligne ${l + 1}`}
                        onValue={(x) => setLine({ text: x })}
                        onKeyDown={(e: KeyboardEvent) => {
                          const el = e.target as HTMLInputElement;
                          if (e.key === 'Enter' && !text.trim() && l > 0) {
                            // Entrée sur une ligne vide : nouveau paragraphe à partir d'ici (comme une ligne vide en mode Texte)
                            e.preventDefault();
                            const before = it.lines.slice(0, l);
                            const after = it.lines.slice(l + 1);
                            const next = keyed({ kind: 'stanza', lines: after.length ? after : [''], repeat: 1 });
                            onChange([...items.slice(0, i), { ...it, lines: before }, next, ...items.slice(i + 1)]);
                            focusLine(next.uid, 0, false);
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            // Entrée : nouvelle ligne (le texte après le curseur y part ; répétition et commentaire restent sur la 1re)
                            const cut = el.selectionStart ?? text.length;
                            const lines = [...it.lines];
                            lines.splice(l, 1, formatLine({ ...lp, text: text.slice(0, cut), close: undefined }),
                              formatLine({ text: text.slice(cut), times: 1, note: '', close: lp.close }));
                            set(i, { ...it, lines });
                            focusLine(it.uid, l + 1, false);
                          } else if (e.key === 'Backspace' && el.selectionStart === 0 && el.selectionEnd === 0 && l > 0) {
                            // Retour arrière en début de ligne : fusion avec la ligne précédente
                            e.preventDefault();
                            const prev = parseLine(it.lines[l - 1]);
                            const lines = [...it.lines];
                            lines.splice(l - 1, 2, formatLine({ ...prev, text: prev.text + text, note: [prev.note, note].filter(Boolean).join(' · '),
                              open: prev.open ?? lp.open, close: lp.close ?? prev.close }));
                            set(i, { ...it, lines });
                            focusLine(it.uid, l - 1);
                          }
                        }} />
                      <button class={`rep-btn${times > 1 ? ' on' : ''}`} onClick={() => setLine({ times: nextTimes(times) })}
                        aria-label={`Répéter la ligne (actuellement ×${times})`}>×{times}</button>
                      <button class={`note-btn${note ? ' on' : ''}`} onClick={() => { toggleNote(nk); if (!showNote) requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-note="${nk}"]`)?.focus()); }}
                        aria-label={note ? 'Modifier le commentaire de la ligne' : 'Ajouter un commentaire à la ligne'} aria-pressed={showNote}>💬</button>
                      <span class="ln-tools">
                        {l < it.lines.length - 1 && (
                          <button class="mini" onClick={() => onChange(splitStanza(items, i, l, mk))} title="Couper le paragraphe après cette ligne">⏎</button>
                        )}
                        <button class="mini red" onClick={() => {
                          if (it.lines.length === 1) onChange(removeAt(items, i));
                          else set(i, { ...it, lines: removeLine(it.lines, l) });
                        }} aria-label="Supprimer la ligne">✕</button>
                      </span>
                    </div>
                    {showNote && (
                      <DraftInput class="ln-note-in" value={note} data-note={nk} maxLength={80} placeholder="Commentaire de la ligne (ex. Misa seule, piano)"
                        aria-label={`Commentaire de la ligne ${l + 1}`} onValue={(x) => setLine({ note: x.replace(/\/\//g, '/') })} />
                    )}
                  </div>
                );
              })}
              <button class="add-line" onClick={() => { set(i, { ...it, lines: [...it.lines, ''] }); focusLine(it.uid, it.lines.length); }}>+ ligne</button>
            </div>
          );
        })();
        return (
          <div key={it.uid}>
            {block}
            <Insert at={i + 1} />
          </div>
        );
      })}
    </div>
  );
}

/** Voix d'une section : lignes brutes gardées localement (une ligne vide doit survivre le temps de la saisie). */
function SectionVoices({ voices, onChange }: { voices: Assignment[]; onChange: (v: Assignment[]) => void }) {
  const [rows, setRows] = useState(() => toRows(voices));
  return (
    <RoleRows rows={rows} kind="voice" addLabel="Ajouter une voix"
      onChange={(r) => { setRows(r); onChange(fromRows(r)); }} />
  );
}
