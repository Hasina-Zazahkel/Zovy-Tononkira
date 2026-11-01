/**
 * Modèle de données Zovy Tononkira — v1
 * Source de vérité : data/songs/*.cho (ChordPro allégé), compilé en public/data/songs.json.
 */

export type NoteRoot = 'DO' | 'RE' | 'MI' | 'FA' | 'SOL' | 'LA' | 'SI';
export type Accidental = 'b' | '#';

/** Tonalité sans mode (majeur/mineur non distingué). Sérialisation : "SIb", "FA#", "RE". */
export interface Key {
  root: NoteRoot;
  accidental?: Accidental;
}

/** member = prénom ("Hasina") ou "*" pour "le reste / chœur". part = valeur libre normalisée en minuscules. */
export interface VoiceAssignment {
  member: string;
  part?: string;
}

export type SectionKind = 'lyrics' | 'instrumental';

export interface Section {
  /** Stable dans un morceau : "s0", "s1"… (référencé par les annotations). */
  id: string;
  kind: SectionKind;
  /** "ZOMA", "INTERLUDE GUITARE"… */
  label?: string;
  /** Voix actives pour cette section (remplace Song.singers à l'affichage). */
  voices?: VoiceAssignment[];
  /** Strophes : tableau de lignes. Une strophe = un bloc insécable pour la pagination. */
  stanzas: string[][];
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  key?: Key;
  capo?: number;
  tags: string[];
  /** Sous-titres d'un medley, ex. "O DARLING (RE)". */
  medley: string[];
  /** Répartition vocale globale, texte d'affichage. Ex. "Lead Toky", "Choeur 3 voix". */
  singers: string[];
  /** Ex. "Guitare Haja", "Basse Toky". */
  musicians: string[];
  notes?: string;
  sections: Section[];
}

export interface SetlistPart {
  name: string;
  songIds: string[];
}

export interface Setlist {
  id: string;
  name: string;
  parts: SetlistPart[];
  updatedAt?: number;
}

export type AnnotationScope = 'personal' | 'group';

/**
 * Annotation ancrée sur (section, strophe, ligne).
 * personal : IndexedDB de la tablette. group : publiée dans data/annotations/<songId>.json par Hasina.
 */
export interface Annotation {
  id: string;
  songId: string;
  sectionId: string;
  stanza: number;
  line: number;
  kind: 'highlight' | 'note';
  color?: 'yellow' | 'orange' | 'cyan' | 'pink';
  text?: string;
  scope: AnnotationScope;
  updatedAt: number;
}

export interface Catalog {
  version: number;
  builtAt: string;
  songs: Song[];
}
