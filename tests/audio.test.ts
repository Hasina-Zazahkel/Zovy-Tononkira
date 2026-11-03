import { describe, expect, it } from 'vitest';
import { audioExt, audioPath, fmtSize, parseTrackFile, sortTracks, trackNames, trackSlug } from '../src/model/audio';

const NAMES = trackNames(['Soprano', 'Alto', 'Ténor', 'Basse']);

describe('pistes audio', () => {
  it('une piste par pupitre', () => {
    expect(NAMES).toEqual(['Soprano', 'Alto', 'Ténor', 'Basse']);
  });
  it('noms de fichiers sans accent', () => {
    expect(trackSlug('Ténor')).toBe('tenor');
    expect(audioPath('amazing-grace', 'Ténor', 'mp3')).toBe('data/audio/amazing-grace/tenor.mp3');
  });
  it('reconnaît les fichiers du dépôt', () => {
    expect(parseTrackFile('tenor.mp3', NAMES)).toEqual({ track: 'Ténor', ext: 'mp3' });
    expect(parseTrackFile('Ténor.M4A', NAMES)).toEqual({ track: 'Ténor', ext: 'm4a' });
    expect(parseTrackFile('basse.ogg', NAMES)).toEqual({ track: 'Basse', ext: 'ogg' });
    expect(parseTrackFile('lead.mp3', NAMES)).toBeNull();
    expect(parseTrackFile('tutti.mp3', NAMES)).toBeNull();
    expect(parseTrackFile('alto.txt', NAMES)).toBeNull();
    expect(audioExt('x.flac')).toBeNull();
  });
  it('ordre d\'affichage', () => {
    const l = sortTracks([{ track: 'Basse' }, { track: 'Soprano' }, { track: 'Alto' }], NAMES);
    expect(l.map((t) => t.track)).toEqual(['Soprano', 'Alto', 'Basse']);
  });
  it('tailles lisibles', () => {
    expect(fmtSize(500)).toBe('1 Ko');
    expect(fmtSize(2.5 * 1024 * 1024)).toBe('2,5 Mo');
  });
});
