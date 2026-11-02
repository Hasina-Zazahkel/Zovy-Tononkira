/**
 * Format d'une ligne de paroles :  « [×G «note» texte] [×N] // commentaire »
 * - « [×N] » : ligne répétée N fois (facultatif)
 * - « // commentaire » : note discrète pour cette ligne (facultatif)
 * - Groupe de lignes (dans un paragraphe) : « [×G » au début de la 1re ligne (avec un commentaire
 *   facultatif entre « »), « ] » à la fin du texte de la dernière.
 *   Surlignage (sans répétition) : « [couleur «commentaire» » au début de la 1re ligne (commentaire facultatif),
 *   couleurs : jaune, vert, bleu (défaut), rose, violet. Peut ne viser qu'une seule ligne.
 * Paragraphe répété : directive {repeat: N} avant la strophe (Section.repeats).
 */
export const HL_COLORS = ['jaune', 'vert', 'bleu', 'rose', 'violet'] as const;
export type HlColor = (typeof HL_COLORS)[number];
export const HL_DEFAULT: HlColor = 'bleu';

/** Ouverture d'un groupe : times > 1 = lignes répétées ; times = 1 = surlignage (couleur + commentaire). */
export interface GroupOpen { times: number; note: string; color?: HlColor }

export interface LineParts {
  text: string;
  times: number;
  note: string;
  /** Début d'un groupe de lignes (times = 1 : commentaire seul, sans répétition). */
  open?: GroupOpen;
  /** Fin d'un groupe de lignes (le « ] » est retiré du texte). */
  close?: boolean;
}

const NOTE_SEP = /\s*\/\/\s*/;
const LINE_TOKEN = /\s*\[×(\d+)\]\s*$/;
const OPEN_TOKEN = /^\s*\[\s*[x×]\s*(\d+)(?:\s*«([^»]*)»)?\s+(?=\S)/i;
const HL_TOKEN = /^\s*\[\s*(?:(jaune|vert|bleu|rose|violet)\b\s*)?(?:«([^»]*)»)?\s*(?=\S)/i;

export function parseLine(raw: string): LineParts {
  const i = raw.search(NOTE_SEP);
  let main = i >= 0 ? raw.slice(0, i) : raw;
  const note = i >= 0 ? raw.slice(i).replace(NOTE_SEP, '').trim() : '';
  let open: LineParts['open'];
  const o = OPEN_TOKEN.exec(main);
  const h = o ? null : HL_TOKEN.exec(main);
  const c = h && (h[1] || h[2] != null) ? h : null;
  if (o && Number(o[1]) > 1) {
    open = { times: Number(o[1]), note: (o[2] ?? '').trim() };
    main = main.slice(o[0].length);
  } else if (c) {
    open = { times: 1, note: (c[2] ?? '').trim(), color: (c[1]?.toLowerCase() as HlColor | undefined) ?? HL_DEFAULT };
    main = main.slice(c[0].length);
  }
  let times = 1;
  const m = LINE_TOKEN.exec(main);
  if (m) { times = Number(m[1]); main = main.slice(0, m.index); }
  main = main.replace(/\s+$/, '');
  // « ] » final = fin de groupe, sauf si la ligne contient elle-même un « [ » (texte entre crochets)
  let close: boolean | undefined;
  if (main.endsWith(']') && !main.slice(0, -1).includes('[')) { close = true; main = main.slice(0, -1).replace(/\s+$/, ''); }
  return { text: main, times, note, ...(open ? { open } : {}), ...(close ? { close } : {}) };
}

export function formatLine({ text, times, note, open, close }: LineParts): string {
  const t = text.replace(/\s*\/\/.*$/, '').replace(/\s+$/, '');
  const n = (open?.note ?? '').trim().replace(/[«»{}]/g, '');
  const o = !open ? '' : open.times > 1 ? `[×${open.times}${n ? ` «${n}»` : ''} ` : `[${open.color ?? HL_DEFAULT}${n ? ` «${n}»` : ''} `;
  return `${o}${t}${close ? ']' : ''}${times > 1 ? ` [×${times}]` : ''}${note.trim() ? ` // ${note.trim().replace(/[{}]/g, '')}` : ''}`;
}

/** Ligne telle qu'affichée, avec son éventuel groupe (calculé dans le contexte du paragraphe). */
export interface LineView {
  text: string;
  times: number;
  note: string;
  group?: { id: number; times: number; note: string; color?: HlColor; first: boolean; last: boolean };
}

/** Lit les lignes d'un paragraphe ; un « ] » sans groupe ouvert reste du texte. */
export function viewLines(lines: string[]): LineView[] {
  const out: LineView[] = [];
  let g: { id: number; times: number; note: string; color?: HlColor } | null = null;
  let id = 0;
  lines.forEach((raw) => {
    const p = parseLine(raw);
    let first = false;
    if (p.open && !g) {
      g = { id: id++, times: p.open.times, note: p.open.note, ...(p.open.times <= 1 ? { color: p.open.color ?? HL_DEFAULT } : {}) };
      first = true;
    }
    const text = p.close && !g ? `${p.text}]` : p.text;
    const v: LineView = { text, times: p.times, note: p.note };
    if (g) v.group = { ...g, first, last: !!p.close };
    out.push(v);
    if (p.close && g) g = null;
  });
  // Groupe non refermé : jusqu'à la fin du paragraphe
  const last = out[out.length - 1];
  if (last?.group) last.group.last = true;
  return out;
}

/**
 * Forme canonique des groupes d'un paragraphe : groupe non refermé fermé à la fin, groupe imbriqué retiré,
 * groupe d'une seule ligne converti en ligne répétée. Les lignes sans groupe ne sont pas réécrites.
 */
/** Groupe réduit à une ligne : répétition et commentaire passent sur la ligne. */
export function collapseGroup(p: LineParts, o: GroupOpen): LineParts {
  if (o.times <= 1) return { ...p, open: { ...o, color: o.color ?? HL_DEFAULT }, close: true };
  const q: LineParts = { ...p, times: Math.max(p.times, o.times), note: o.note ? [o.note, p.note].filter(Boolean).join(' · ') : p.note };
  delete q.open; delete q.close;
  return q;
}

export function normalizeGroups(lines: string[]): string[] {
  const parts = lines.map(parseLine);
  const touched = new Set<number>();
  let openAt = -1;
  parts.forEach((p, i) => {
    if (p.open) {
      touched.add(i);
      if (openAt >= 0) { delete p.open; }
      else openAt = i;
    }
    if (p.close && openAt >= 0) {
      touched.add(i);
      if (openAt === i) parts[i] = collapseGroup(p, p.open!); // groupe répété d'une ligne = ligne répétée
      openAt = -1;
    }
  });
  if (openAt >= 0) {
    const last = parts.length - 1;
    touched.add(last);
    if (last === openAt) parts[last] = collapseGroup(parts[last], parts[last].open!);
    else parts[last].close = true;
  }
  return lines.map((l, i) => (touched.has(i) ? formatLine(parts[i]) : l));
}

/** Crée un groupe répété sur les lignes from..to (les groupes qui chevauchent sont retirés). */
export function groupLines(lines: string[], from: number, to: number, times = 2, note = '', color: HlColor = HL_DEFAULT): string[] {
  const [a, b] = from <= to ? [from, to] : [to, from];
  const views = viewLines(lines);
  const drop = new Set(views.filter((v, i) => v.group && i >= a && i <= b).map((v) => v.group!.id));
  let cur = ungroupWhere(lines, (id) => drop.has(id));
  const open: GroupOpen = times > 1 ? { times, note } : { times: 1, note, color };
  if (a === b) {
    const p = parseLine(cur[a]);
    return cur.map((l, i) => (i === a ? formatLine(times > 1 ? { ...p, times: Math.max(times, p.times) } : { ...p, open, close: true }) : l));
  }
  return cur.map((l, i) => {
    if (i !== a && i !== b) return l;
    const p = parseLine(l);
    return formatLine(i === a ? { ...p, open } : { ...p, close: true });
  });
}

/** Modifie le nombre de répétitions / le commentaire du groupe qui commence à la ligne `first`. */
export function setGroup(lines: string[], first: number, patch: Partial<GroupOpen>): string[] {
  const p = parseLine(lines[first]);
  if (!p.open) return lines;
  return lines.map((l, i) => (i === first ? formatLine({ ...p, open: { ...p.open!, ...patch } }) : l));
}

/** Retire le groupe dont l'id (ordre d'apparition) vérifie `pred` : les lignes restent, sans répétition de groupe. */
export function ungroupWhere(lines: string[], pred: (id: number) => boolean): string[] {
  const views = viewLines(lines);
  return lines.map((l, i) => {
    const g = views[i].group;
    if (!g || !pred(g.id) || (!g.first && !g.last)) return l;
    const p = parseLine(l);
    if (g.first) delete p.open;
    if (g.last && p.close) delete p.close;
    return formatLine(p);
  });
}

/** Compatibilité : texte + répétition (le commentaire est conservé). */
export function splitLineRepeat(line: string): { text: string; times: number } {
  const { text, times, close } = parseLine(line);
  return { text: close ? `${text}]` : text, times };
}

export const withLineRepeat = (line: string, times: number) => {
  const p = parseLine(line);
  return formatLine({ ...p, times });
};

const WORDS: Record<string, number> = { BIS: 2, INDROA: 2, 'IN-2': 2, INTELO: 3, 'IN-3': 3 };

/** Nombre lu dans un marqueur libre (« X2 », « (x 4) », « BIS », « (2) », « (INDROA) », « (2*) »), ou null. */
function markerTimes(raw: string): number | null {
  const t = raw.trim().replace(/[.!…]+$/, '').toUpperCase();
  let m = /^\(?\s*[X×]\s*(\d+)\s*\)?$/.exec(t) ?? /^\(?\s*(\d+)\s*[X×*]\s*\)?$/.exec(t) ?? /^\((\d)\)$/.exec(t);
  if (m) return Number(m[1]) > 1 && Number(m[1]) <= 16 ? Number(m[1]) : null;
  m = /^\(?\s*(BIS|INDROA|IN-2|INTELO|IN-3)\s*\)?$/.exec(t);
  return m ? WORDS[m[1]] : null;
}

/**
 * Ligne entièrement constituée d'un marqueur (« X2 », « (BIS) », « (2*) », « BIS X4 ») → nombre de répétitions.
 * Combinaison « BIS X4 » : le plus grand nombre l'emporte.
 */
export function wholeLineMarker(line: string): number | null {
  const direct = markerTimes(line);
  if (direct) return direct;
  const { text, times } = splitLineRepeat(line);
  const t = text.trim();
  if (times > 1 && t) {
    const inner = markerTimes(t);
    return inner ? Math.max(inner, times) : null;
  }
  const parts = t.split(/\s+/);
  if (parts.length === 2 && markerTimes(parts[0]) && markerTimes(parts[1])) return Math.max(markerTimes(parts[0])!, markerTimes(parts[1])!);
  return null;
}

/**
 * Marqueur en fin de ligne (« … E X2 », « … (X4) », « … (bis) », « … (2) », « … (INDROA). »).
 * Retourne le texte nettoyé et le nombre, ou null si la ligne n'en contient pas.
 */
export function trailingMarker(line: string): { text: string; times: number } | null {
  if (LINE_TOKEN.test(line)) return null;
  const m = /^(.*\S)\s+(\(?\s*(?:[x×]\s*\d+|\d+\s*[x×*]|bis|indroa|in-2|intelo|in-3)\s*\)?|\(\d\))\s*[.!…]*$/i.exec(line)
    ?? /^(.*\S)(\((?:[x×]\s*\d+|\d|bis|indroa|in-2|intelo|in-3)\))\s*[.!…]*$/i.exec(line);
  if (!m) return null;
  const times = markerTimes(m[2]);
  if (!times) return null;
  // Ligne entièrement entre parenthèses (« (AOKA E X2) ») : on ne touche pas
  if (/^\(/.test(m[1]) && !m[1].includes(')')) return null;
  return { text: m[1].replace(/[\s,;:–-]+$/, ''), times };
}
