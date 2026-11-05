/** Bouton « PDF » : charge le générateur à la demande (absent du build des éditions sans PDF). */
import type { Song } from '../model/types';

declare const __PDF__: boolean;

export async function downloadSongPdf(song: Song, opts: { uppercase?: boolean } = {}): Promise<void> {
  if (!__PDF__) return;
  const { saveSongPdf } = await import('./pdf');
  saveSongPdf(song, opts);
}
