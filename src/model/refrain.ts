/**
 * Marqueurs de refrain écrits dans les paroles (« REF: », « Ref.1 », « REFRAIN », « (refrain) », « REF… », « FIV: », « CHORUS »)
 * → section REFRAIN (REFRAIN 1, REFRAIN 2…).
 * - marqueur suivi de paroles (sur la même ligne ou les lignes suivantes du paragraphe) : ce paragraphe devient la section ;
 * - marqueur seul dans son paragraphe (« on rechante le refrain ici ») : le refrain correspondant est recopié en entier ;
 * - le paragraphe qui suit le refrain repart dans une section sans nom.
 */
import { toItems, withItems, type Item } from './edit';
import { formatLine, parseLine } from './repeat';
import type { Song } from './types';

// REF / REFRAIN, FIV (« fiverenana », refrain en malgache), CHORUS
const RE = /^\(?\s*(?:ref(?:rain)?|fiv(?:erenana)?|chorus)(?![a-zà-ÿ])\s*\.?\s*(\d+)?\s*\)?\s*[:.…]*\s*(.*)$/i;

export interface RefrainMarker { num?: number; rest: string; times: number; note: string }

/** Ligne de paroles qui est un marqueur de refrain, ou null. « Refrain bis en la la la » (consigne) est ignoré. */
export function refrainMarker(line: string): RefrainMarker | null {
  const p = parseLine(line);
  if (p.open || p.close) return null;
  const m = RE.exec(p.text.trim());
  if (!m) return null;
  let rest = m[2].trim();
  if (/^bis\b/i.test(rest)) return null;
  // « FIV: ka tsara.... » : début du refrain abrégé = reprise
  if (/(\.{2,}|…)\s*$/.test(rest)) rest = '';
  return { ...(m[1] ? { num: Number(m[1]) } : {}), rest, times: p.times, note: p.note };
}

export const refrainLabel = (m: RefrainMarker) => (m.num ? `REFRAIN ${m.num}` : 'REFRAIN');

type Stanza = Item & { kind: 'stanza' };

/** Applique la conversion à une liste d'éléments (paragraphes, repères, sections). */
export function convertRefrainItems(input: Item[]): { items: Item[]; report: string[] } {
  // 1. Un marqueur au milieu d'un paragraphe le coupe en deux
  const items: Item[] = [];
  for (const it of input) {
    if (it.kind !== 'stanza') { items.push(it); continue; }
    let cur: string[] = [];
    let first = true;
    for (const l of it.lines) {
      if (cur.length && refrainMarker(l)) {
        items.push({ kind: 'stanza', lines: cur, repeat: first ? it.repeat : 1 });
        first = false;
        cur = [];
      }
      cur.push(l);
    }
    items.push({ kind: 'stanza', lines: cur, repeat: first ? it.repeat : 1 });
  }

  // 2. Refrains connus (pour les reprises), y compris ceux écrits plus loin
  const known = new Map<string, Stanza>();
  const content = (s: Stanza, m: RefrainMarker) => {
    const lines = [...(m.rest ? [formatLine({ text: m.rest, times: m.times, note: m.note })] : []), ...s.lines.slice(1)];
    return lines.length ? { kind: 'stanza' as const, lines, repeat: Math.max(s.repeat, m.rest ? 1 : m.times) } : null;
  };
  for (const it of items) {
    const m = it.kind === 'stanza' ? refrainMarker(it.lines[0]) : null;
    if (!m) continue;
    const c = content(it as Stanza, m);
    if (c && !known.has(refrainLabel(m))) known.set(refrainLabel(m), c);
  }
  const last = new Map<string, Stanza>();

  // 3. Conversion
  const out: Item[] = [];
  const report: string[] = [];
  let close = false;
  for (const it of items) {
    if (it.kind !== 'stanza') { close = false; out.push(it); continue; }
    const m = refrainMarker(it.lines[0]);
    if (!m) {
      if (close) out.push({ kind: 'section', label: '', voices: [] });
      close = false;
      out.push(it);
      continue;
    }
    const label = refrainLabel(m);
    let st = content(it, m);
    if (st) {
      last.set(label, st);
      report.push(`« ${parseLine(it.lines[0]).text.trim()} » → section ${label} (${st.lines.length} ligne${st.lines.length > 1 ? 's' : ''})`);
    } else {
      const src = last.get(label) ?? known.get(label) ?? last.get('REFRAIN') ?? known.get('REFRAIN') ?? [...last.values()].pop();
      if (src) {
        st = { kind: 'stanza', lines: [...src.lines], repeat: m.times > 1 ? m.times : src.repeat };
        report.push(`« ${parseLine(it.lines[0]).text.trim()} » seul → ${label} recopié (${st.lines.length} ligne${st.lines.length > 1 ? 's' : ''})`);
      } else {
        report.push(`« ${parseLine(it.lines[0]).text.trim()} » seul, aucun refrain marqué à recopier → titre ${label} sans paroles (à compléter)`);
      }
    }
    out.push({ kind: 'section', label: !st && m.times > 1 ? `${label} ×${m.times}` : label, voices: [] });
    if (st) out.push(st);
    close = true;
  }
  return { items: out, report };
}

export function applyRefrains(song: Song): { song: Song; report: string[] } {
  const { items, report } = convertRefrainItems(toItems(song.sections));
  if (!report.length) return { song, report };
  return { song: withItems(song, items).song, report };
}
