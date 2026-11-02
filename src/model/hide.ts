/**
 * Lignes masquées en vue musicien. Une plage = une ligne, rattachée à son TEXTE (comme les notes perso) :
 * le masquage suit les lignes si le morceau change ; une ligne disparue est simplement ignorée.
 *  - masquage par défaut (admin) : publié dans data/musician.json, visible par tous les musiciens ;
 *  - masquage personnel : local ; chacun peut aussi réafficher une ligne masquée par défaut.
 */
import { flatLines, normText } from './personal';
import type { Song } from './types';

export interface HideRange { id: string; text: string; at: number }
/** Masquage par défaut, par morceau. */
export type HideBook = Record<string, HideRange[]>;
/** Masquage personnel d'un morceau : lignes masquées en plus, lignes par défaut réaffichées. */
export interface PersonalHide { hide: HideRange[]; show: string[] }

export const hideId = () => `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Lignes (clé de strophe → index de ligne → id de la plage) visées par des plages. */
export function resolveHide(song: Song, ranges: HideRange[]): Map<string, Map<number, string>> {
  const flat = flatLines(song);
  const n = flat.map((f) => normText(f.text));
  const out = new Map<string, Map<number, string>>();
  const taken = new Set<number>();
  for (const r of [...ranges].sort((a, b) => a.at - b.at)) {
    const want = normText(r.text);
    let best = -1;
    n.forEach((t, i) => { if (t === want && !taken.has(i) && (best < 0 || Math.abs(i - r.at) < Math.abs(best - r.at))) best = i; });
    if (best < 0) continue;
    taken.add(best);
    const f = flat[best];
    if (!out.has(f.key)) out.set(f.key, new Map());
    out.get(f.key)!.set(f.line, r.id);
  }
  return out;
}

/** Plage pour une ligne précise. */
export function rangeFor(song: Song, key: string, line: number, id = hideId()): HideRange | null {
  const flat = flatLines(song);
  const at = flat.findIndex((f) => f.key === key && f.line === line);
  return at < 0 ? null : { id, text: flat[at].text, at };
}

export interface HiddenView {
  /** Lignes masquées (clé de strophe → index de ligne). */
  hidden: Map<string, Set<number>>;
  /** Origine de chaque ligne masquée : défaut (admin) ou perso. */
  source: Map<string, Map<number, 'default' | 'personal'>>;
}

/** Masquage effectif : (défaut − réaffichées) ∪ perso. */
export function effectiveHidden(song: Song, defaults: HideRange[], mine: PersonalHide | undefined): HiddenView {
  const hidden = new Map<string, Set<number>>();
  const source = new Map<string, Map<number, 'default' | 'personal'>>();
  const add = (k: string, l: number, s: 'default' | 'personal') => {
    if (!hidden.has(k)) { hidden.set(k, new Set()); source.set(k, new Map()); }
    hidden.get(k)!.add(l); source.get(k)!.set(l, s);
  };
  const shown = new Set(mine?.show ?? []);
  resolveHide(song, defaults).forEach((m, k) => m.forEach((id, l) => { if (!shown.has(id)) add(k, l, 'default'); }));
  resolveHide(song, mine?.hide ?? []).forEach((m, k) => m.forEach((_, l) => add(k, l, 'personal')));
  return { hidden, source };
}

/** Lecture de data/musician.json (validation stricte). */
export function parseHideBook(raw: unknown): HideBook {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('musician.json : objet attendu');
  const out: HideBook = {};
  for (const [songId, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) throw new Error(`musician.json : ${songId} invalide`);
    out[songId] = list.map((r) => {
      if (!r || typeof r.id !== 'string' || typeof r.text !== 'string') throw new Error(`musician.json : ${songId} invalide`);
      return { id: r.id, text: r.text, at: Number(r.at) || 0 };
    });
  }
  return out;
}

export function serializeHideBook(b: HideBook): string {
  const sorted = Object.fromEntries(Object.entries(b).filter(([, l]) => l.length).sort(([a], [c]) => a.localeCompare(c)));
  return JSON.stringify(sorted, null, 2) + '\n';
}
