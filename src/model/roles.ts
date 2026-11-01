/** Listes fermées des rôles (validées par Hasina, 2026-11-01). */
export const VOICE_ROLES = ['Soprano', 'Alto', 'Ténor', 'Basse', 'Lead', 'Chœur'] as const;
export const INSTRUMENT_ROLES = ['Guitare', 'Guitare basse', 'Percussion', 'Korintsana', 'Clavier', 'Sax'] as const;

export type RoleKind = 'voice' | 'inst';
export const rolesFor = (k: RoleKind): readonly string[] => (k === 'voice' ? VOICE_ROLES : INSTRUMENT_ROLES);

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').toLowerCase().trim();

/**
 * Conversion des anciennes valeurs libres vers la liste fermée.
 * Retourne undefined si aucune correspondance (le rôle est alors retiré).
 */
export function mapLegacyVoice(raw: string): string | undefined {
  const r = fold(raw);
  const exact = VOICE_ROLES.find((v) => fold(v) === r);
  if (exact) return exact;
  if (r.startsWith('lead')) return 'Lead';
  if (r === 'haut' || r.startsWith('sopra')) return 'Soprano';
  if (r === 'bas' || r.startsWith('alto')) return 'Alto';
  if (r.startsWith('tenor')) return 'Ténor';
  if (r.startsWith('choeur') || /^\d+ voix$/.test(r)) return 'Chœur';
  return undefined;
}

export function mapLegacyInstrument(raw: string): string | undefined {
  const r = fold(raw);
  const exact = INSTRUMENT_ROLES.find((v) => fold(v) === r);
  if (exact) return exact;
  if (r === 'basse') return 'Guitare basse';
  if (r.startsWith('guitare basse')) return 'Guitare basse';
  if (r.startsWith('guitare')) return 'Guitare';
  if (r.startsWith('batterie') || r.startsWith('percu')) return 'Percussion';
  if (r.startsWith('clavier')) return 'Clavier';
  if (r.startsWith('sax')) return 'Sax';
  if (r.startsWith('korintsana')) return 'Korintsana';
  return undefined;
}
