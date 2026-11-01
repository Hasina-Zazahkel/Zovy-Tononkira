/**
 * Membres autorisés à ouvrir l'app (protection simple : le site et le dépôt restent publics).
 * Seule une empreinte salée du mot de passe est publiée (PBKDF2-SHA256), jamais le mot de passe.
 */
export interface Member {
  /** Identifiant, en minuscules. */
  id: string;
  admin?: boolean;
  /** Sel et empreinte en base64. */
  salt: string;
  hash: string;
  iter: number;
}

export interface Session {
  id: string;
  admin: boolean;
  /** Date de connexion (ms). */
  at: number;
}

export const ITERATIONS = 210_000;
export const SESSION_DAYS = 30;
export const PASSWORD_MIN = 6;

export const normalizeId = (s: string) => s.trim().toLowerCase().normalize('NFC');

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iter: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
  return b64(new Uint8Array(bits));
}

export async function makeMember(id: string, password: string, admin = false, iter = ITERATIONS): Promise<Member> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const m: Member = { id: normalizeId(id), salt: b64(salt), hash: await derive(password, salt, iter), iter };
  return admin ? { ...m, admin: true } : m;
}

/** Vérifie identifiant + mot de passe ; renvoie le membre ou null. */
export async function verify(members: Member[], id: string, password: string): Promise<Member | null> {
  const m = members.find((x) => x.id === normalizeId(id));
  if (!m) {
    // Même durée de calcul qu'un identifiant existant
    await derive(password, new Uint8Array(16), ITERATIONS);
    return null;
  }
  const h = await derive(password, unb64(m.salt), m.iter);
  return h === m.hash ? m : null;
}

/** Session encore valable : non expirée et membre toujours présent dans la liste publiée. */
export function sessionValid(s: Session | null | undefined, members: Member[], now = Date.now()): boolean {
  if (!s) return false;
  if (now - s.at > SESSION_DAYS * 86_400_000 || now < s.at - 86_400_000) return false;
  return members.some((m) => m.id === s.id);
}

/** Droits admin de la session, relus dans la liste publiée (un retrait du drapeau s'applique). */
export const isAdmin = (s: Session | null | undefined, members: Member[]) =>
  !!s && !!members.find((m) => m.id === s.id)?.admin;

export function validateId(id: string, members: Member[]): string | null {
  const n = normalizeId(id);
  if (!n) return "L'identifiant est obligatoire.";
  if (!/^[\p{L}\p{N}._-]{2,32}$/u.test(n)) return 'Identifiant : 2 à 32 caractères, lettres, chiffres, . _ - (sans espace).';
  if (members.some((m) => m.id === n)) return `« ${n} » existe déjà.`;
  return null;
}

export const validatePassword = (p: string) =>
  p.length < PASSWORD_MIN ? `Mot de passe : au moins ${PASSWORD_MIN} caractères.` : null;

/** Il doit toujours rester au moins un admin dès qu'il y a des membres. */
export const hasAdmin = (members: Member[]) => !members.length || members.some((m) => m.admin);

export function serializeMembers(members: Member[]): string {
  const sorted = [...members].sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(sorted.map(({ id, admin, salt, hash, iter }) => (admin ? { id, admin, salt, hash, iter } : { id, salt, hash, iter })), null, 2) + '\n';
}

export const sameMembers = (a: Member[], b: Member[]) => serializeMembers(a) === serializeMembers(b);

export function parseMembers(raw: unknown): Member[] {
  if (!Array.isArray(raw)) throw new Error('members.json : tableau attendu');
  return raw.map((m, i) => {
    if (!m || typeof m.id !== 'string' || typeof m.salt !== 'string' || typeof m.hash !== 'string' || typeof m.iter !== 'number') {
      throw new Error(`members.json : entrée ${i} invalide`);
    }
    return m.admin ? { id: m.id, admin: true, salt: m.salt, hash: m.hash, iter: m.iter } : { id: m.id, salt: m.salt, hash: m.hash, iter: m.iter };
  });
}
