import { EDITION } from '../edition';
/** Listes fermées des rôles : définies par l'édition (editions/<id>/edition.json). */
export const VOICE_ROLES: readonly string[] = EDITION.voices;
export const INSTRUMENT_ROLES: readonly string[] = EDITION.instruments;

export type RoleKind = 'voice' | 'inst';
export const rolesFor = (k: RoleKind): readonly string[] => (k === 'voice' ? VOICE_ROLES : INSTRUMENT_ROLES);

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').toLowerCase().trim();

/**
 * Conversion des anciennes valeurs libres vers la liste fermée.
 * Retourne undefined si aucune correspondance (le rôle est alors retiré).
 */
export function mapLegacyVoice(raw: string): string | undefined {
  const v = mapVoice(fold(raw));
  return v && VOICE_ROLES.includes(v) ? v : undefined;
}

function mapVoice(r: string): string | undefined {
  const exact = VOICE_ROLES.find((v) => fold(v) === r);
  if (exact) return exact;
  if (r.startsWith('lead')) return 'Lead';
  if (r === 'haut' || r.startsWith('sopra')) return 'Soprano';
  if (r === 'bas' || r.startsWith('alto')) return 'Alto';
  if (r.startsWith('tenor')) return 'Ténor';
  if (r === 'bass' || r.startsWith('basse')) return 'Basse';
  if (r.startsWith('choeur') || /^\d+ voix$/.test(r)) return 'Chœur';
  return undefined;
}

export function mapLegacyInstrument(raw: string): string | undefined {
  const v = mapInstrument(fold(raw));
  return v && INSTRUMENT_ROLES.includes(v) ? v : undefined;
}

function mapInstrument(r: string): string | undefined {
  const exact = INSTRUMENT_ROLES.find((v) => fold(v) === r);
  if (exact) return exact;
  if (r === 'basse') return 'Guitare basse';
  if (r.startsWith('guitare basse')) return 'Guitare basse';
  if (r.startsWith('guitare')) return 'Guitare';
  if (/^(batterie|percu|djemb|conga|cajon|bongo|tambour|darbouka|kayamb)/.test(r)) return 'Percussion';
  if (/^(clavier|piano|synth|orgue|keyboard|keys)/.test(r)) return 'Clavier';
  if (r.startsWith('sax')) return 'Sax';
  if (r.startsWith('korintsana')) return 'Korintsana';
  return undefined;
}
