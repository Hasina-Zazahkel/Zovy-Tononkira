import { effect, signal } from '@preact/signals';
import { EDITION } from '../edition';

export interface Settings {
  /** Taille des paroles en px. */
  fontSize: number;
  uppercase: boolean;
  /** Maintenir l'écran allumé tant que l'app est au premier plan. */
  keepAwake: boolean;
  /** En-tête de la page de lecture replié (plein écran paroles). */
  headerCollapsed: boolean;
  /** Mode éditeur actif (jeton conservé quand on repasse en lecture seule). */
  editorOn: boolean;
  /** Afficher mes notes personnelles en lecture. */
  showPersonal: boolean;
  /** Vue de lecture retenue sur l'appareil. */
  view: 'chanteur' | 'musicien';
  /** Taille du texte en vue musicien (plus petite : tout le morceau d'un coup d'œil). */
  fontSizeM: number;
  /** Vue musicien : seulement la 1re ligne de chaque paragraphe. */
  structureOnly: boolean;
  /** Lecteur de l'original : taille réduite, position haut / bas. */
  ytMini: boolean;
  ytBottom: boolean;
  /** Lecteur YouTube : vidéo affichée au-dessus de la barre (sinon son seul). */
  ytVideo: boolean;
}

export const FONT_MIN = 22;
export const FONT_MAX = 52;
export const FONT_STEP = 2;

const KEY = `${EDITION.storage}.settings.v1`;
// Téléphone : texte plus petit par défaut (ajustable avec A-/A+)
const narrow = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 600;
const DEFAULTS: Settings = { fontSize: narrow ? 24 : 34, uppercase: true, keepAwake: true, headerCollapsed: false, editorOn: true, showPersonal: true,
  view: 'chanteur', fontSizeM: narrow ? 18 : 24, structureOnly: false, ytMini: true, ytBottom: false, ytVideo: false };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export const settings = signal<Settings>(load());

effect(() => {
  try { localStorage.setItem(KEY, JSON.stringify(settings.value)); } catch { /* stockage indisponible */ }
});

export function update(patch: Partial<Settings>) {
  settings.value = { ...settings.value, ...patch };
}

export const FONT_MIN_M = 14;

/** A− / A+ : agit sur la taille de la vue affichée. */
export function bumpFont(dir: 1 | -1, view = settings.value.view) {
  if (view === 'musicien') {
    const v = settings.value.fontSizeM + dir * FONT_STEP;
    update({ fontSizeM: Math.min(FONT_MAX, Math.max(FONT_MIN_M, v)) });
    return;
  }
  const v = settings.value.fontSize + dir * FONT_STEP;
  update({ fontSize: Math.min(FONT_MAX, Math.max(FONT_MIN, v)) });
}
