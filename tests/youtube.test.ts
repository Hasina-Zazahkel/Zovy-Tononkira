import { describe, expect, it } from 'vitest';
import { parseChordPro, serializeChordPro } from '../src/model/chordpro';
import { parseImport } from '../src/model/importText';
import { parseYoutube } from '../src/model/youtube';

describe('lien YouTube', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
    ['youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=x', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('%s', (raw, id) => expect(parseYoutube(raw)).toBe(id));
  it('invalide', () => {
    expect(parseYoutube('https://vimeo.com/123')).toBeUndefined();
    expect(parseYoutube('pas un lien')).toBeUndefined();
  });
  it('directive .cho', () => {
    const src = '{title: A}\n{artist: B}\n{youtube: dQw4w9WgXcQ}\n\nla\n';
    const { song, warnings } = parseChordPro('a', src);
    expect(warnings).toEqual([]);
    expect(song.youtube).toBe('dQw4w9WgXcQ');
    expect(serializeChordPro(song)).toBe(src);
    expect(parseChordPro('a', '{title: A}\n{artist: B}\n{youtube: https://youtu.be/dQw4w9WgXcQ}\n\nla\n').song.youtube).toBe('dQw4w9WgXcQ');
  });
  it('import', () => {
    const [r] = parseImport('Titre : A\nArtiste : B\nYouTube : https://youtu.be/dQw4w9WgXcQ\n\nla\n');
    expect(r.song.youtube).toBe('dQw4w9WgXcQ');
    expect(r.found).toContain('Lien YouTube');
  });
});
