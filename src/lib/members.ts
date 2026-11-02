import { computed, signal } from '@preact/signals';
import {
  isAdmin, parseMembers, sameMembers, sessionValid, verify, type Member, type Session,
} from '../model/members';
import { kvDel, kvGet, kvSet } from './store';

const SESSION_KEY = 'session.v1';
const OVERRIDE_KEY = 'membersOverride.v1';

/** Liste publiée (null = pas encore chargée). Vide = pas de connexion demandée (premier lancement). */
export const publishedMembers = signal<Member[] | null>(null);
export const session = signal<Session | null>(null);
export const authReady = signal(false);

export interface MembersOverride { members: Member[]; updatedAt: number; publishedAt?: number }
/** Liste modifiée sur cet appareil (éditeur), pas encore reçue dans la version publiée. */
export const membersOverride = signal<MembersOverride | null>(null);

export const currentMembers = computed<Member[]>(() => membersOverride.value?.members ?? publishedMembers.value ?? []);
export const membersUnpublished = computed(() => {
  const o = membersOverride.value;
  return !!o && (!o.publishedAt || o.updatedAt > o.publishedAt);
});

/** Connexion exigée : dès qu'une liste de membres est publiée. */
export const loginRequired = computed(() => (publishedMembers.value?.length ?? 0) > 0);
export const loggedIn = computed(() => sessionValid(session.value, publishedMembers.value ?? []));
/** Admin : connecté avec un compte admin, ou aucune liste publiée (mise en place). */
export const adminSession = computed(() => !loginRequired.value || isAdmin(session.value, publishedMembers.value ?? []));

async function fetchMembers(): Promise<Member[]> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}data/members.json`);
    if (!r.ok) return [];
    return parseMembers(await r.json());
  } catch {
    return [];
  }
}

/** Au démarrage : liste publiée, session (expirée ou membre retiré → déconnecté), modifs locales. */
export async function loadAuth() {
  try {
    const members = await fetchMembers();
    publishedMembers.value = members;
    const s = await kvGet<Session>(SESSION_KEY);
    if (s && sessionValid(s, members)) session.value = s;
    else if (s) await kvDel(SESSION_KEY);
    const o = await kvGet<MembersOverride>(OVERRIDE_KEY);
    if (o && !sameMembers(o.members, members)) membersOverride.value = o;
    else if (o) await kvDel(OVERRIDE_KEY);
  } finally {
    authReady.value = true;
  }
}

export async function login(id: string, password: string): Promise<boolean> {
  const m = await verify(publishedMembers.value ?? [], id, password);
  if (!m) return false;
  const s: Session = { id: m.id, admin: !!m.admin, at: Date.now() };
  session.value = s;
  await kvSet(SESSION_KEY, s);
  return true;
}

export async function logout() {
  session.value = null;
  await kvDel(SESSION_KEY);
}

export async function saveMembers(members: Member[]) {
  if (sameMembers(members, publishedMembers.value ?? [])) {
    membersOverride.value = null;
    await kvDel(OVERRIDE_KEY);
    return;
  }
  const o: MembersOverride = { members, updatedAt: Date.now(), publishedAt: membersOverride.value?.publishedAt };
  membersOverride.value = o;
  await kvSet(OVERRIDE_KEY, o);
}

export async function dropMembersOverride() {
  membersOverride.value = null;
  await kvDel(OVERRIDE_KEY);
}

export async function markMembersPublished(at = Date.now()) {
  const o = membersOverride.value;
  if (!o) return;
  membersOverride.value = { ...o, publishedAt: at };
  await kvSet(OVERRIDE_KEY, membersOverride.value);
}
