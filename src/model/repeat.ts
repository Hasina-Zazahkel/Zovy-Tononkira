/**
 * Répétitions.
 * - Ligne répétée : suffixe canonique « [×N] » en fin de ligne (ex. « AU ZOMA OUI OUI OUI [×4] »).
 * - Paragraphe répété : directive {repeat: N} avant la strophe (Section.repeats).
 */
const LINE_TOKEN = /\s*\[×(\d+)\]\s*$/;

export function splitLineRepeat(line: string): { text: string; times: number } {
  const m = LINE_TOKEN.exec(line);
  return m ? { text: line.slice(0, m.index), times: Number(m[1]) } : { text: line, times: 1 };
}

export const withLineRepeat = (text: string, times: number) => (times > 1 ? `${text.replace(LINE_TOKEN, '')} [×${times}]` : text.replace(LINE_TOKEN, ''));

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
