import { describe, expect, it } from 'vitest';
import {
  hasAdmin, isAdmin, makeMember, parseMembers, serializeMembers, sessionValid, validateId, validatePassword, verify,
} from '../src/model/members';

describe('membres', () => {
  it('empreinte : bon / mauvais mot de passe, identifiant insensible à la casse', async () => {
    const m = await makeMember(' Hasina ', 'Tsiky-2026', true, 1000);
    expect(m.id).toBe('hasina');
    expect(JSON.stringify(m)).not.toContain('Tsiky');
    expect(await verify([m], 'HASINA', 'Tsiky-2026')).toEqual(m);
    expect(await verify([m], 'hasina', 'tsiky-2026')).toBeNull();
    expect(await verify([m], 'misa', 'Tsiky-2026')).toBeNull();
  });
  it('deux membres au même mot de passe : empreintes différentes (sel)', async () => {
    const [a, b] = await Promise.all([makeMember('a1', 'secret1', false, 1000), makeMember('b1', 'secret1', false, 1000)]);
    expect(a.hash).not.toBe(b.hash);
  });
  it('session : 30 jours, membre retiré, admin relu', async () => {
    const m = await makeMember('hasina', 'secret1', true, 1000);
    const now = Date.now();
    const s = { id: 'hasina', admin: true, at: now - 29 * 86_400_000 };
    expect(sessionValid(s, [m], now)).toBe(true);
    expect(sessionValid({ ...s, at: now - 31 * 86_400_000 }, [m], now)).toBe(false);
    expect(sessionValid(s, [], now)).toBe(false);
    expect(isAdmin(s, [{ ...m, admin: undefined }])).toBe(false);
    expect(isAdmin({ ...s, admin: false }, [m])).toBe(true);
  });
  it('validations', async () => {
    const m = await makeMember('misa', 'secret1', false, 1000);
    expect(validateId('Misa', [m])).toMatch(/existe déjà/);
    expect(validateId('a b', [])).toMatch(/sans espace/);
    expect(validateId('Toky', [m])).toBeNull();
    expect(validatePassword('12345')).toMatch(/6/);
    expect(hasAdmin([m])).toBe(false);
    expect(hasAdmin([])).toBe(true);
  });
  it('sérialisation stable', async () => {
    const list = [await makeMember('toky', 'secret1', false, 1000), await makeMember('hasina', 'secret1', true, 1000)];
    const s = serializeMembers(list);
    expect(parseMembers(JSON.parse(s)).map((m) => m.id)).toEqual(['hasina', 'toky']);
    expect(() => parseMembers([{ id: 'x' }])).toThrow();
  });
});
