import { describe, expect, it } from 'vitest';
import { parseChordPro, serializeChordPro } from '../src/model/chordpro';
import { cleanupSong } from '../src/model/cleanup';

const clean = (body: string) => serializeChordPro(cleanupSong(parseChordPro('t', `{title: T}\n{artist: A}\n\n${body}`).song)).split('\n').slice(3).join('\n');

describe('cleanupSong', () => {
  it('rattache un repère isolé à la strophe précédente', () => expect(clean('l1\nl2\n\n(BIS)\n\nl3\n')).toBe('l1\nl2\n(BIS)\n\nl3\n'));
  it('ou à la suivante s\'il ouvre la section', () => expect(clean('(X2)\n\nl1\n')).toBe('(X2)\nl1\n'));
  it('...MUSIQUE... devient un repère instrumental', () => expect(clean('l1\n\n...MUSIQUE...\n\nl2\n')).toBe('l1\n\n{instrumental: MUSIQUE}\n\nl2\n'));
  it('voix posées avant une intro → section suivante', () =>
    expect(clean('{voices: Toky=Lead}\n\n{instrumental: INTRO}\n\nl1\n')).toBe('{instrumental: INTRO}\n\n{voices: Toky=Lead}\nl1\n'));
  it('fusionne les repères consécutifs', () =>
    expect(clean('{instrumental: A}\n\n{instrumental: B}\n\nl1\n')).toBe('{instrumental: A · B}\n\nl1\n'));
  it('idempotent', () => {
    const once = cleanupSong(parseChordPro('t', '{title: T}\n{artist: A}\nl1\n\n(BIS)\n\n...MUSIQUE...\n\nl2\n').song);
    expect(serializeChordPro(cleanupSong(once))).toBe(serializeChordPro(once));
  });
});
