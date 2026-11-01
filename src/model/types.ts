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

/**
 * Affectation d'un membre à un rôle : voix ("lead", "1ère voix", "ténor")
 * ou instrument ("guitare basse", "guitare classique").
 * member = prénom ("Hasina") ou "*" pour "tous / le reste". role = texte libre, affiché tel quel.
 * Format .cho : "Hasina=lead, Misa=1ère voix, *=chœur"
 */
export interface Assignment {
  member: string;
  role?: string;
}

export type SectionKind = 'lyrics' | 'instrumental';

export interface Section {
  /** Stable dans un morceau : "s0", "s1"… (référencé par les annotations). */
  id: string;
  kind: SectionKind;
  /** "ZOMA", "INTERLUDE GUITARE"… */
  label?: string;
  /** Voix pour cette section (priment sur Song.singers pendant la section). */
  voices?: Assignment[];
  /** Strophes : tableau de lignes. Une strophe = un bloc insécable pour la pagination. */
  stanzas: string[][];
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  key?: Key;
  /** Hérité : fusionné dans notes par scripts/migrate/normalize.ts. */
  capo?: number;
  tags: string[];
  /** Sous-titres d'un medley, ex. "O DARLING (RE)". */
  medley: string[];
  /** Répartition vocale du morceau. */
  singers: Assignment[];
  /** Instruments du morceau. Un membre peut apparaître plusieurs fois. */
  musicians: Assignment[];
  /** Commentaire court affiché à côté de la tonalité (ex. « Capo 5 · Intro sax »). */
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
