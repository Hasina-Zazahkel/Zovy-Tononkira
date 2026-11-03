import { computed, effect, signal } from '@preact/signals';
import type { HideBook, HideRange, PersonalHide } from '../model/hide';
import { parseHideBook, serializeHideBook } from '../model/hide';
import { countNotes, mergeBooks, type NotesBook, type NotesByView, type PersonalNote, type StageMode } from '../model/personal';
import { authReady, session } from './members';
import { kvDel, kvGet, kvSet } from './store';
import { EDITION } from '../edition';

/**
 * Données personnelles de l'utilisateur connecté (ou de l'appareil sans connexion) — jamais publiées :
 * notes par vue (chanteur / musicien) et lignes masquées en vue musicien.
 */
export const personalBooks = signal<NotesByView>({ chanteur: {}, musicien: {} });
export const personalHides = signal<Record<string, PersonalHide>>({});
const owner = () => session.value?.id ?? 'appareil';
const notesKey = (v: StageMode) => (v === 'chanteur' ? `personal.v1.${owner()}` : `personal.${v}.v1.${owner()}`);
const hideKey = () => `mhide.v1.${owner()}`;
let loadedFor: string | null = null;

effect(() => {
  if (!authReady.value) return;
  const who = owner();
  if (who === loadedFor) return;
  loadedFor = who;
  void Promise.all([kvGet<NotesBook>(notesKey('chanteur')), kvGet<NotesBook>(notesKey('musicien')), kvGet<Record<string, PersonalHide>>(hideKey())])
    .then(([c, m, h]) => {
      if (loadedFor !== who) return;
      personalBooks.value = { chanteur: c ?? {}, musicien: m ?? {} };
      personalHides.value = h ?? {};
    });
});

const keep = async () => { try { await navigator.storage?.persist?.(); } catch { /* facultatif */ } };

async function persistNotes(view: StageMode, book: NotesBook) {
  personalBooks.value = { ...personalBooks.value, [view]: book };
  await kvSet(notesKey(view), book);
  await keep();
}

/** Enregistre une note ; les notes qui touchent les mêmes lignes (ids dans `replace`) sont retirées. */
export function saveNote(view: StageMode, songId: string, note: PersonalNote, replace: string[] = []) {
  const book = personalBooks.value[view];
  const list = (book[songId] ?? []).filter((n) => n.id !== note.id && !replace.includes(n.id));
  return persistNotes(view, { ...book, [songId]: [...list, note] });
}

export function deleteNote(view: StageMode, songId: string, id: string) {
  const book = { ...personalBooks.value[view] };
  const list = (book[songId] ?? []).filter((n) => n.id !== id);
  if (list.length) book[songId] = list; else delete book[songId];
  return persistNotes(view, book);
}

/* ---------- Lignes masquées (vue musicien) ---------- */

export async function setPersonalHide(songId: string, h: PersonalHide) {
  const next = { ...personalHides.value };
  if (h.hide.length || h.show.length) next[songId] = h; else delete next[songId];
  personalHides.value = next;
  await kvSet(hideKey(), next);
  await keep();
}

/** Masquage par défaut publié (data/musician.json) + modifications locales de l'admin avant PUBLIER. */
export const publishedHides = signal<HideBook>({});
export interface HidesOverride { book: HideBook; updatedAt: number; publishedAt?: number }
export const hidesOverride = signal<HidesOverride | null>(null);
export const currentDefaultHides = computed<HideBook>(() => hidesOverride.value?.book ?? publishedHides.value);
export const hidesUnpublished = computed(() => {
  const o = hidesOverride.value;
  return !!o && (!o.publishedAt || o.updatedAt > o.publishedAt);
});
const OV_KEY = 'musicianOverride.v1';

export async function loadMusicianDefaults() {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}data/musician.json`);
    publishedHides.value = r.ok ? parseHideBook(await r.json()) : {};
  } catch { publishedHides.value = {}; }
  const o = await kvGet<HidesOverride>(OV_KEY);
  if (o && serializeHideBook(o.book) !== serializeHideBook(publishedHides.value)) hidesOverride.value = o;
  else if (o) await kvDel(OV_KEY);
}

export async function saveDefaultHides(songId: string, ranges: HideRange[]) {
  const book = { ...currentDefaultHides.value };
  if (ranges.length) book[songId] = ranges; else delete book[songId];
  if (serializeHideBook(book) === serializeHideBook(publishedHides.value)) {
    hidesOverride.value = null;
    await kvDel(OV_KEY);
    return;
  }
  hidesOverride.value = { book, updatedAt: Date.now(), publishedAt: hidesOverride.value?.publishedAt };
  await kvSet(OV_KEY, hidesOverride.value);
}

export async function dropHidesOverride() {
  hidesOverride.value = null;
  await kvDel(OV_KEY);
}

export async function markHidesPublished(at = Date.now()) {
  const o = hidesOverride.value;
  if (!o) return;
  hidesOverride.value = { ...o, publishedAt: at };
  await kvSet(OV_KEY, hidesOverride.value);
}

/* ---------- Sauvegarde ---------- */

export const notesCount = () => countNotes(personalBooks.value.chanteur) + countNotes(personalBooks.value.musicien);

export function exportNotes(): { name: string; json: string } {
  const d = new Date().toISOString().slice(0, 10);
  return {
    name: `${EDITION.storage}-notes-${owner()}-${d}.json`,
    json: JSON.stringify({
      app: EDITION.appId, kind: 'notes', version: 2, owner: owner(), exportedAt: new Date().toISOString(),
      notes: personalBooks.value, hidden: personalHides.value,
    }, null, 2),
  };
}

export async function importNotes(books: NotesByView, hidden?: Record<string, PersonalHide>) {
  await persistNotes('chanteur', mergeBooks(personalBooks.value.chanteur, books.chanteur));
  await persistNotes('musicien', mergeBooks(personalBooks.value.musicien, books.musicien));
  if (hidden) {
    const next = { ...personalHides.value };
    for (const [id, h] of Object.entries(hidden)) {
      const cur = next[id] ?? { hide: [], show: [] };
      const ids = new Set(cur.hide.map((r) => r.id));
      next[id] = { hide: [...cur.hide, ...h.hide.filter((r) => !ids.has(r.id))], show: [...new Set([...cur.show, ...h.show])] };
    }
    personalHides.value = next;
    await kvSet(hideKey(), next);
  }
}
