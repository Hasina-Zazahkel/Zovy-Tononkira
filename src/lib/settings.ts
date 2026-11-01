import { effect, signal } from '@preact/signals';

export interface Settings {
  /** Taille des paroles en px. */
  fontSize: number;
  uppercase: boolean;
  /** Maintenir l'écran allumé tant que l'app est au premier plan. */
  keepAwake: boolean;
  /** En-tête de la page de lecture replié (plein écran paroles). */
  headerCollapsed: boolean;
}

export const FONT_MIN = 22;
export const FONT_MAX = 52;
export const FONT_STEP = 2;

const KEY = 'zovy.settings.v1';
// Téléphone : texte plus petit par défaut (ajustable avec A-/A+)
const narrow = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 600;
const DEFAULTS: Settings = { fontSize: narrow ? 24 : 34, uppercase: true, keepAwake: true, headerCollapsed: false };

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

export function bumpFont(dir: 1 | -1) {
  const v = settings.value.fontSize + dir * FONT_STEP;
  update({ fontSize: Math.min(FONT_MAX, Math.max(FONT_MIN, v)) });
}
