/**
 * Configuration de l'app (editions/zovy/edition.json) : nom, dépôt, adresse, thème, rôles, fonctions.
 */
import zovy from '../editions/zovy/edition.json';

export interface Edition {
  id: string;
  name: string;
  shortName: string;
  description: string;
  basePath: string;
  publicDir: string;
  repo: { owner: string; repo: string; branch: string };
  /** Nom de la base IndexedDB et préfixe localStorage : deux éditions sur le même domaine ne se mélangent pas. */
  storage: string;
  logo: { src: string; alt: string; width: number; height: number };
  loginImage?: string;
  theme: { gold: string; goldDim: string; goldRgb: string; goldHi: string; goldLo: string };
  /** Couleur de la barre système / écran de lancement (manifest). */
  themeColor: string;
  /** Identifiant écrit dans les exports de notes. */
  appId: string;
  /** Identifiant d'app du manifeste (installation). Ne jamais changer une fois l'app installée chez les membres. */
  manifestId?: string;
  /** Page d'ouverture de l'app : artistes (défaut) ou répertoire. */
  startPage?: string;
  admin: string;
  groupWord: string;
  searchPlaceholder: string;
  sampleLine: string;
  voices: string[];
  instruments: string[];
  features: { musicianView: boolean; instruments: boolean; youtube: boolean };
}

declare const __EDITION_ID__: string | undefined;

export const EDITIONS: Record<string, Edition> = { zovy };

function currentId(): string {
  if (typeof __EDITION_ID__ !== 'undefined' && __EDITION_ID__) return __EDITION_ID__;
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.EDITION;
  return env && env in EDITIONS ? env : 'zovy';
}

export const EDITION: Edition = EDITIONS[currentId()];
export const FEATURES = EDITION.features;

/** Couleurs de l'édition appliquées au document (variables CSS). */
export function applyTheme(root: HTMLElement = document.documentElement) {
  const t = EDITION.theme;
  root.style.setProperty('--gold', t.gold);
  root.style.setProperty('--gold-dim', t.goldDim);
  root.style.setProperty('--gold-rgb', t.goldRgb);
  root.style.setProperty('--gold-hi', t.goldHi);
  root.style.setProperty('--gold-lo', t.goldLo);
  root.dataset.edition = EDITION.id;
  document.title = EDITION.name;
}
