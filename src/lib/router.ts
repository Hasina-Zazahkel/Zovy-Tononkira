import { signal } from '@preact/signals';
import { EDITION } from '../edition';

/** Page d'accueil de l'édition (ouverture de l'app, retour par défaut). */
export const HOME_HASH = EDITION.startPage === 'repertoire' ? '#/repertoire' : '#/';
// Ouverture sans adresse précise : page d'accueil de l'édition
if (!location.hash.replace(/^#\/?/, '') && HOME_HASH !== '#/') history.replaceState(null, '', HOME_HASH);

/**
 * Routeur par hash (compatible GitHub Pages, aucun rewrite serveur).
 *   #/                       accueil (artistes)
 *   #/repertoire             répertoire
 *   #/nouveau                nouveau morceau (collage / page vide, mode éditeur)
 *   #/song/<id>              vue scène
 *   #/song/<id>?sl=<id>&pos=<n>  vue scène dans le contexte d'une setlist
 */
export type Route =
  | { name: 'home' }
  | { name: 'setlist' }
  | { name: 'new' }
  | { name: 'song'; id: string; setlistId?: string; pos?: number };

function parse(hash: string): Route {
  const [path, qs = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const q = new URLSearchParams(qs);
  if (parts[0] === 'song' && parts[1]) {
    const pos = q.get('pos');
    return {
      name: 'song',
      id: decodeURIComponent(parts[1]),
      setlistId: q.get('sl') ?? undefined,
      pos: pos != null && pos !== '' ? Number(pos) : undefined,
    };
  }
  if (parts[0] === 'repertoire') return { name: 'setlist' };
  if (parts[0] === 'nouveau') return { name: 'new' };
  return { name: 'home' };
}

export const route = signal<Route>(parse(location.hash));
/** Vrai dès qu'une navigation interne a eu lieu : history.back() reste alors dans l'app. */
let hasInAppHistory = false;
window.addEventListener('hashchange', () => {
  hasInAppHistory = true;
  route.value = parse(location.hash);
});

export function songHref(id: string, setlistId?: string, pos?: number): string {
  return `#/song/${encodeURIComponent(id)}` + (setlistId != null && pos != null ? `?sl=${setlistId}&pos=${pos}` : '');
}

/** Remplace l'entrée d'historique (morceau suivant/précédent : le bouton retour ramène à la liste). */
export function replaceHash(hash: string) {
  history.replaceState(null, '', hash);
  route.value = parse(hash);
}

export function goBack(fallback: string) {
  if (hasInAppHistory) history.back();
  else replaceHash(fallback);
}
