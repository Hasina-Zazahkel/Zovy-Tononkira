import type { Section, Song } from './types';

/**
 * Nettoyage structurel d'un morceau (idempotent), appliqué aux données sources :
 * 1. Sections de paroles vides (voix/label posés avant une intro) → reportées sur la section suivante.
 * 2. Repère isolé en strophe d'une ligne « (BIS) », « (pas d'interlude) » → rattaché à la strophe voisine.
 * 3. Strophe « ...MUSIQUE... » → repère instrumental (interlude).
 * 4. Repères consécutifs de même catégorie → fusionnés (commentaires joints par « · »).
 * 5. Position : un interlude avant toute parole est une intro ; après la dernière parole, une outro.
 */
const CUE_LINE = /^\s*\(.*\)\s*$/;
const MUSIC_LINE = /^\s*\.{2,}\s*MUSIQUE\s*\.{2,}\s*$/i;

export function cleanupSong(song: Song): Song {
  let secs: Section[] = song.sections.map((s) => ({ ...s, stanzas: s.stanzas.map((st) => [...st]) }));

  // 3. MUSIQUE → instrumental (découpe la section)
  secs = secs.flatMap((s) => {
    if (s.kind !== 'lyrics' || !s.stanzas.some((st) => st.length === 1 && MUSIC_LINE.test(st[0]))) return [s];
    const out: Section[] = [];
    let cur: Section = { ...s, stanzas: [] };
    for (const st of s.stanzas) {
      if (st.length === 1 && MUSIC_LINE.test(st[0])) {
        if (cur.stanzas.length || cur.label || cur.voices) out.push(cur);
        out.push({ id: '', kind: 'instrumental', cue: 'interlude', stanzas: [] });
        cur = { id: '', kind: 'lyrics', stanzas: [] };
      } else cur.stanzas.push(st);
    }
    if (cur.stanzas.length) out.push(cur);
    return out;
  });

  // 2. Repères isolés rattachés
  for (const s of secs) {
    if (s.kind !== 'lyrics') continue;
    const merged: string[][] = [];
    s.stanzas.forEach((st, i) => {
      if (st.length === 1 && CUE_LINE.test(st[0])) {
        if (merged.length) { merged[merged.length - 1].push(st[0]); return; }
        const nextSt = s.stanzas[i + 1];
        if (nextSt) { nextSt.unshift(st[0]); return; }
      }
      merged.push(st);
    });
    s.stanzas = merged;
  }

  // 1. Sections vides : label/voix reportés sur la prochaine section de paroles
  const kept: Section[] = [];
  let carry = null as Pick<Section, 'label' | 'voices'> | null;
  for (const s of secs) {
    if (s.kind === 'lyrics' && !s.stanzas.length) {
      carry = { label: s.label ?? carry?.label, voices: s.voices ?? carry?.voices };
      continue;
    }
    if (carry && s.kind === 'lyrics') {
      if (!s.label && carry.label) s.label = carry.label;
      if (!s.voices && carry.voices) s.voices = carry.voices;
      carry = null;
    }
    kept.push(s);
  }

  // 5. Catégorie selon la position
  const firstLyrics = kept.findIndex((s) => s.kind === 'lyrics');
  const lastLyrics = kept.map((s) => s.kind).lastIndexOf('lyrics');
  kept.forEach((s, i) => {
    if (s.kind !== 'instrumental') return;
    s.cue ??= 'interlude';
    if (s.cue === 'interlude' && firstLyrics >= 0 && i < firstLyrics) s.cue = 'intro';
    if (s.cue === 'interlude' && lastLyrics >= 0 && i > lastLyrics) s.cue = 'outro';
  });

  // 4. Repères consécutifs de même catégorie fusionnés
  const final: Section[] = [];
  for (const s of kept) {
    const prev = final[final.length - 1];
    if (s.kind === 'instrumental' && prev?.kind === 'instrumental' && prev.cue === s.cue) {
      const label = [prev.label, s.label].filter(Boolean).join(' · ');
      if (label) prev.label = label;
      continue;
    }
    final.push(s);
  }
  final.forEach((s, i) => { s.id = `s${i}`; });
  return { ...song, sections: final };
}
