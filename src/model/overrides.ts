import { parseChordPro, serializeChordPro } from './chordpro';
import type { Assignment, CueType, Song } from './types';

/**
 * Modification locale d'un morceau (faite sur une tablette, pas encore publiée).
 * Seuls les champs présents remplacent la version publiée.
 */
export interface SongOverride {
  songId: string;
  /** Morceau créé sur cet appareil (absent du catalogue publié) : `cho` contient le morceau entier. */
  created?: boolean;
  /** Morceau supprimé sur cet appareil (fichier retiré à la publication). */
  deleted?: boolean;
  /** Morceau complet édité (éditeur complet) : remplace entièrement la version publiée. */
  cho?: string;
  singers?: Assignment[];
  musicians?: Assignment[];
  /** Commentaire affiché à côté de la tonalité (ex. « Capo 5 »). Chaîne vide = retiré. */
  notes?: string;
  /** Voix par section, indexées par id de section. Liste vide = voix retirées. */
  sectionVoices?: Record<string, Assignment[]>;
  /** Label de la section au moment de l'édition : garde-fou si les paroles ont été restructurées. */
  sectionLabels?: Record<string, string | null>;
  /** Repères instrumentaux modifiés : catégorie + commentaire (chaîne vide = sans commentaire). */
  cues?: Record<string, { cue: CueType; note: string }>;
  /** État d'origine « catégorie|commentaire » : garde-fou si le repère a changé entre-temps. */
  cueGuards?: Record<string, string>;
  updatedAt: number;
  /** Date du dernier envoi sur GitHub (la modif reste affichée jusqu'à réception de la nouvelle version). */
  publishedAt?: number;
}

export interface ApplyResult {
  song: Song;
  /** Sections dont la structure ne correspond plus (modif ignorée pour ces sections). */
  skipped: string[];
}

export function applyOverride(base: Song, ov: SongOverride | undefined): ApplyResult {
  if (!ov) return { song: base, skipped: [] };
  if (ov.cho) return { song: parseChordPro(base.id, ov.cho).song, skipped: [] };
  const skipped: string[] = [];
  const song: Song = {
    ...base,
    singers: ov.singers ?? base.singers,
    musicians: ov.musicians ?? base.musicians,
    sections: base.sections.map((s) => {
      if (s.kind === 'instrumental' && ov.cues && s.id in ov.cues) {
        if (ov.cueGuards?.[s.id] !== undefined && ov.cueGuards[s.id] !== cueKey(s.cue, s.label)) { skipped.push(s.id); return s; }
        const { label: _l, ...rest } = s;
        const c = ov.cues[s.id];
        return c.note.trim() ? { ...rest, cue: c.cue, label: c.note.trim() } : { ...rest, cue: c.cue };
      }
      if (!ov.sectionVoices || !(s.id in ov.sectionVoices)) return s;
      const expected = ov.sectionLabels?.[s.id];
      if (expected !== undefined && (s.label ?? null) !== expected) { skipped.push(s.id); return s; }
      const v = ov.sectionVoices[s.id];
      const { voices: _drop, ...rest } = s;
      return v.length ? { ...rest, voices: v } : rest;
    }),
  };
  if (ov.notes !== undefined) {
    if (ov.notes.trim()) song.notes = ov.notes.trim();
    else delete song.notes;
  }
  if (ov.sectionVoices) {
    for (const id of Object.keys(ov.sectionVoices)) if (!base.sections.some((s) => s.id === id)) skipped.push(id);
  }
  return { song, skipped };
}

export const cueKey = (cue: CueType | undefined, label: string | undefined) => `${cue ?? 'interlude'}|${label ?? ''}`;

/** Vrai si la modification n'apporte plus rien (déjà publiée, ou annulée à la main). */
export function isNoop(base: Song, ov: SongOverride): boolean {
  if (ov.deleted) return false;
  return serializeChordPro(applyOverride(base, ov).song) === serializeChordPro(base);
}

/** Nettoie une liste saisie : noms vides retirés, "Tous"/"Reste" → "*", doublons retirés. */
export function cleanAssignments(list: Assignment[]): Assignment[] {
  const out: Assignment[] = [];
  for (const a of list) {
    let member = a.member.trim().replace(/[,=]/g, ' ').replace(/\s+/g, ' ');
    if (!member) continue;
    if (/^(tous|reste|\*)$/i.test(member)) member = '*';
    else member = member.charAt(0).toUpperCase() + member.slice(1);
    const role = a.role?.trim() || undefined;
    if (!out.some((x) => x.member === member && x.role === role)) out.push(role ? { member, role } : { member });
  }
  return out;
}

export const isPending = (o: SongOverride) => !o.publishedAt || o.updatedAt > o.publishedAt;

/** Modifs encore utiles au regard du catalogue publié reçu. */
export function prune(stored: Record<string, SongOverride>, songs: Map<string, Song>, builtAt?: number): Record<string, SongOverride> {
  const kept: Record<string, SongOverride> = {};
  for (const [id, ov] of Object.entries(stored)) {
    // Déjà envoyée et la version reçue a été construite après l'envoi : c'est la version en ligne qui fait foi
    // (sinon une copie locale périmée masquerait les corrections faites ensuite sur le serveur).
    if (!isPending(ov) && builtAt && ov.publishedAt && builtAt > ov.publishedAt) continue;
    const base = songs.get(id);
    if (ov.deleted) {
      // Suppression : gardée tant que le fichier existe encore ou qu'elle n'est pas envoyée
      if (base || isPending(ov)) kept[id] = ov;
    } else if (!base) {
      if (ov.created && ov.cho) kept[id] = ov;
    } else if (!isNoop(base, ov)) {
      const { created: _c, ...rest } = ov;
      kept[id] = rest;
    }
  }
  return kept;
}
