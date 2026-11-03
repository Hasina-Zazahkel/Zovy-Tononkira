/**
 * Pistes audio par pupitre (édition chorale) : un fichier par piste, rangé dans le dépôt sous
 * `data/audio/<idMorceau>/<pupitre>.<ext>` (ex. data/audio/amazing-grace/tenor.mp3).
 * Fonctions pures : partagées par le script de build et l'app.
 */

export const AUDIO_EXT = ['mp3', 'm4a', 'aac', 'ogg', 'opus', 'wav'] as const;

export interface AudioTrack {
  /** Libellé affiché : Tous, Soprano, Alto, Ténor, Basse. */
  track: string;
  /** Chemin relatif à la racine du site (et du dépôt) : data/audio/<id>/<slug>.<ext>. */
  file: string;
  /** Taille en octets. */
  size: number;
  /** Empreinte courte du contenu : change à chaque remplacement (invalide le cache hors ligne). */
  v: string;
}

/** Pistes possibles, dans l'ordre d'affichage : liste de l'édition, sinon une par pupitre. */
export const trackNames = (voices: readonly string[], tracks?: readonly string[]): string[] => [...(tracks?.length ? tracks : voices)];

/** « Ténor » → « tenor » (nom de fichier sans accent ni espace). */
export function trackSlug(label: string): string {
  return label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const audioPath = (songId: string, label: string, ext: string) => `data/audio/${songId}/${trackSlug(label)}.${ext}`;

/** Extension acceptée (en minuscules) d'un nom de fichier, sinon null. */
export function audioExt(name: string): string | null {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  const e = m?.[1].toLowerCase();
  return e && (AUDIO_EXT as readonly string[]).includes(e) ? e : null;
}

/** « tenor.mp3 » → { track: 'Ténor', ext: 'mp3' } si la piste existe dans `names`. */
export function parseTrackFile(name: string, names: readonly string[]): { track: string; ext: string } | null {
  const ext = audioExt(name);
  if (!ext) return null;
  const slug = trackSlug(name.slice(0, -(ext.length + 1)));
  const track = names.find((n) => trackSlug(n) === slug);
  return track ? { track, ext } : null;
}

/** Tri dans l'ordre d'affichage des pistes. */
export function sortTracks<T extends { track: string }>(list: T[], names: readonly string[]): T[] {
  return [...list].sort((a, b) => names.indexOf(a.track) - names.indexOf(b.track));
}

/** Taille lisible : « 2,4 Mo ». */
export function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}

/** Au-delà : avertissement (réencoder en MP3 mono 64–96 kbit/s). */
export const AUDIO_WARN_BYTES = 12 * 1024 * 1024;
/** Au-delà : refus (limite pratique de publication depuis l'app). */
export const AUDIO_MAX_BYTES = 40 * 1024 * 1024;
