import { trailingMarker, wholeLineMarker, withLineRepeat } from './repeat';
import type { Section, Song } from './types';

/**
 * Nettoyage structurel d'un morceau (idempotent), appliqué aux données sources :
 * 1. Sections de paroles vides (voix/label posés avant une intro) → reportées sur la section suivante.
 * 2. Repère isolé en strophe d'une ligne « (BIS) », « (pas d'interlude) » → rattaché à la strophe voisine.
 * 3. Strophe « ...MUSIQUE... » → repère instrumental (interlude).
 * 4. Repères consécutifs de même catégorie → fusionnés (commentaires joints par « · »).
 * 5. Position : un interlude avant toute parole est une intro ; après la dernière parole, une outro.
 * 6. Répétitions écrites dans le texte → données : « … X2 » / « (BIS) » en fin de ligne → ligne [×2] ;
 *    ligne seule « X2 », « BIS », « (2*) » sous un paragraphe → paragraphe répété ({repeat: 2}).
 */
const CUE_LINE = /^\s*\(.*\)\s*$/;
const MUSIC_LINE = /^\s*\.{2,}\s*MUSIQUE\s*\.{2,}\s*$/i;

export function cleanupSong(song: Song, report: (msg: string) => void = () => {}): Song {
  let secs: Section[] = song.sections.map((s) => ({ ...s, stanzas: s.stanzas.map((st) => [...st]), ...(s.repeats ? { repeats: [...s.repeats] } : {}) }));

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

  // 6. Répétitions écrites dans le texte
  for (const s of secs) {
    if (s.kind !== 'lyrics') continue;
    const reps = s.stanzas.map((_, i) => s.repeats?.[i] ?? 1);
    const out: string[][] = [];
    const outReps: number[] = [];
    s.stanzas.forEach((st, i) => {
      let lines = st.map((l) => {
        const t = trailingMarker(l);
        return t ? withLineRepeat(t.text, t.times) : l;
      });
      let r = reps[i];
      // Strophe réduite à un marqueur : s'applique à la strophe précédente (sinon à la suivante)
      if (lines.length === 1 && wholeLineMarker(lines[0])) {
        const n = wholeLineMarker(lines[0])!;
        if (out.length) { outReps[outReps.length - 1] = Math.max(outReps[outReps.length - 1], n); return; }
        if (s.stanzas[i + 1]) { reps[i + 1] = Math.max(reps[i + 1], n); return; }
      }
      // Marqueur en dernière ligne : la strophe est répétée
      const last = lines.length > 1 ? wholeLineMarker(lines[lines.length - 1]) : null;
      if (last) { r = Math.max(r, last); lines = lines.slice(0, -1); }
      // Marqueur en première ligne : vise la strophe précédente si elle existe, sinon celle-ci
      const first = lines.length > 1 ? wholeLineMarker(lines[0]) : null;
      if (first) {
        lines = lines.slice(1);
        if (out.length) outReps[outReps.length - 1] = Math.max(outReps[outReps.length - 1], first);
        else r = Math.max(r, first);
        report(`${song.id} : « ${st[0]} » en tête de paragraphe → appliqué au paragraphe ${out.length ? 'précédent' : 'suivant'}`);
      }
      lines.forEach((l, k) => { if (k > 0 && k < lines.length - 1 && wholeLineMarker(l)) report(`${song.id} : marqueur « ${l} » au milieu d'un paragraphe, laissé tel quel`); });
      out.push(lines);
      outReps.push(r);
    });
    s.stanzas = out;
    if (outReps.some((x) => x > 1)) s.repeats = outReps; else delete s.repeats;
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
