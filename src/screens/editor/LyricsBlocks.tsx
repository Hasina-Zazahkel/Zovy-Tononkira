import { CUE_LABEL, CUE_TYPES } from '../../model/cues';
import {
  insertAt, keyed, mergeWithPrevious, move, removeAt, replaceAt, splitStanza, type Item, type Keyed,
} from '../../model/edit';
import { splitLineRepeat, withLineRepeat } from '../../model/repeat';
import type { Assignment, CueType } from '../../model/types';
import { Chips } from '../Stage';
import { RoleRows, fromRows, toRows } from './RoleRows';
import { useState } from 'preact/hooks';

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
                {prevIsStanza && <button class="mini" onClick={() => onChange(mergeWithPrevious(items, i, mk))} title="Fusionner avec le paragraphe précédent">⤒ Fusionner</button>}
                <Tools i={i} />
              </div>
              {it.lines.map((raw, l) => {
                const { text, times } = splitLineRepeat(raw);
                const setLine = (t: string, n = times) => set(i, { ...it, lines: replaceAt(it.lines, l, withLineRepeat(t, n)) });
                return (
                  <div class="ln-row" key={l}>
                    <input class="ln-in" value={text} data-line={`${it.uid}:${l}`} aria-label={`Ligne ${l + 1}`}
                      onInput={(e) => setLine((e.target as HTMLInputElement).value)}
                      onKeyDown={(e) => {
                        const el = e.target as HTMLInputElement;
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          // Entrée : nouvelle ligne (le texte après le curseur y part)
                          const cut = el.selectionStart ?? text.length;
                          const lines = [...it.lines];
                          lines.splice(l, 1, withLineRepeat(text.slice(0, cut), times), text.slice(cut));
                          set(i, { ...it, lines });
                          focusLine(it.uid, l + 1, false);
                        } else if (e.key === 'Backspace' && el.selectionStart === 0 && el.selectionEnd === 0 && l > 0) {
                          // Retour arrière en début de ligne : fusion avec la ligne précédente
                          e.preventDefault();
                          const prev = splitLineRepeat(it.lines[l - 1]);
                          const lines = [...it.lines];
                          lines.splice(l - 1, 2, withLineRepeat(prev.text + text, prev.times));
                          set(i, { ...it, lines });
                          focusLine(it.uid, l - 1);
                        }
                      }} />
                    <button class={`rep-btn${times > 1 ? ' on' : ''}`} onClick={() => setLine(text, nextTimes(times))}
                      aria-label={`Répéter la ligne (actuellement ×${times})`}>×{times}</button>
                    <span class="ln-tools">
                      {l < it.lines.length - 1 && (
                        <button class="mini" onClick={() => onChange(splitStanza(items, i, l, mk))} title="Couper le paragraphe après cette ligne">⏎</button>
                      )}
                      <button class="mini red" onClick={() => {
                        if (it.lines.length === 1) onChange(removeAt(items, i));
                        else set(i, { ...it, lines: removeAt(it.lines, l) });
                      }} aria-label="Supprimer la ligne">✕</button>
                    </span>
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
