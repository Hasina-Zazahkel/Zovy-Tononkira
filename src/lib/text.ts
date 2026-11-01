/** Normalisation pour la recherche : majuscules, sans accents, apostrophes unifiées, espaces compactés. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`´]/g, "'")
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ligne entièrement entre parenthèses = repère de jeu : "(BIS)", "(X4)", "(pas d'interlude)". */
export const isCueLine = (line: string) => /^\s*\(.*\)\s*$/.test(line);
