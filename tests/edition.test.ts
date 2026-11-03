import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EDITION, EDITIONS } from '../src/edition';

describe('éditions', () => {
  it('Zovy par défaut (tests et build sans EDITION)', () => expect(EDITION.id).toBe('zovy'));
  it.each(Object.values(EDITIONS))('$id : configuration complète et fichiers présents', (e) => {
    expect(e.repo.owner && e.repo.repo && e.storage && e.basePath.startsWith('/')).toBeTruthy();
    expect(e.voices.length).toBeGreaterThan(0);
    for (const f of [e.logo.src, 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', ...(e.loginImage ? [e.loginImage] : [])]) {
      expect(existsSync(`${e.publicDir}/${f}`), `${e.id} : ${f}`).toBe(true);
    }
  });
  it('stockage séparé (même domaine github.io)', () => {
    const s = Object.values(EDITIONS).map((e) => e.storage);
    expect(new Set(s).size).toBe(s.length);
  });
});
