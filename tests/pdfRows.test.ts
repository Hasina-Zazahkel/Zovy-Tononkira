import { describe, expect, it } from 'vitest';
import { parseChordPro } from '../src/model/chordpro';
import { pdfFileName, pdfRows, voicesText } from '../src/model/pdfRows';

const CHO = `{title: OH HAPPY DAY}
{key: SOL}

{section: COUPLET 1}
{voices: *=Tous}
Oh happy day [×2]
When Jesus washed // tout doux
[jaune «Sopranos seules» Oh when he washed
When my Jesus washed]
[×3 He washed
my sins away]

{section: REFRAIN}
{repeat: 2}
He taught me how to watch
And live rejoicing every day

{outro: a cappella}
`;

describe('PDF des paroles', () => {
  const song = parseChordPro('oh-happy-day', CHO).song;
  const rows = pdfRows(song);
  const lines = rows.filter((r) => r.kind === 'line');

  it('sections, voix et repères', () => {
    expect(rows[0]).toEqual({ kind: 'section', text: 'COUPLET 1', voices: 'Tous' });
    expect(rows.some((r) => r.kind === 'section' && r.text === 'REFRAIN')).toBe(true);
    expect(rows[rows.length - 1]).toEqual({ kind: 'cue', text: 'OUTRO — a cappella' });
  });
  it('répétitions, commentaires et couleurs', () => {
    expect(lines[0]).toMatchObject({ text: 'Oh happy day', times: 2 });
    expect(lines[1]).toMatchObject({ text: 'When Jesus washed', note: 'tout doux' });
    expect(lines[2]).toMatchObject({ color: 'jaune', note: 'Sopranos seules' });
    expect(lines[3]).toMatchObject({ color: 'jaune' });
    expect(lines[4]).toMatchObject({ bar: true });
    expect(lines[5]).toMatchObject({ bar: true, blockTimes: 3 });
  });
  it('paragraphe répété : barre + ×N en fin', () => {
    const ref = lines.slice(-2);
    expect(ref[0]).toMatchObject({ bar: true });
    expect(ref[0].kind === 'line' && ref[0].blockTimes).toBeFalsy();
    expect(ref[1]).toMatchObject({ bar: true, blockTimes: 2 });
  });
  it('majuscules comme à l\'écran', () => {
    expect(pdfRows(song, { uppercase: true }).find((r) => r.kind === 'line')).toMatchObject({ text: 'OH HAPPY DAY' });
  });
  it('voix et nom de fichier', () => {
    expect(voicesText([{ member: 'Misa', role: 'Soprano' }, { member: '*', role: 'Chœur' }])).toBe('Misa : Soprano · Chœur');
    expect(pdfFileName('Éternel est bon !')).toBe('eternel-est-bon.pdf');
  });
});
