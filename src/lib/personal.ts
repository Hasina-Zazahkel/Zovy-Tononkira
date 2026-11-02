import { effect, signal } from '@preact/signals';
import { countNotes, mergeBooks, type NotesBook, type PersonalNote } from '../model/personal';
import { authReady, session } from './members';
import { kvGet, kvSet } from './store';

/** Notes personnelles de l'utilisateur connecté (ou de l'appareil s'il n'y a pas de connexion). Jamais publiées. */
export const personalNotes = signal<NotesBook>({});
const owner = () => session.value?.id ?? 'appareil';
const key = () => `personal.v1.${owner()}`;
let loadedFor: string | null = null;

effect(() => {
  if (!authReady.value) return;
  const k = key();
  if (k === loadedFor) return;
  loadedFor = k;
  void kvGet<NotesBook>(k).then((b) => { if (loadedFor === k) personalNotes.value = b ?? {}; });
});

async function persist(next: NotesBook) {
  personalNotes.value = next;
  await kvSet(key(), next);
  // Demande au navigateur de ne pas effacer ces données en cas de manque de place
  try { await navigator.storage?.persist?.(); } catch { /* facultatif */ }
}

/** Enregistre une note ; les notes qui touchent les mêmes lignes (ids dans `replace`) sont retirées. */
export function saveNote(songId: string, note: PersonalNote, replace: string[] = []) {
  const list = (personalNotes.value[songId] ?? []).filter((n) => n.id !== note.id && !replace.includes(n.id));
  return persist({ ...personalNotes.value, [songId]: [...list, note] });
}

export function deleteNote(songId: string, id: string) {
  const list = (personalNotes.value[songId] ?? []).filter((n) => n.id !== id);
  const next = { ...personalNotes.value };
  if (list.length) next[songId] = list; else delete next[songId];
  return persist(next);
}

export const notesCount = () => countNotes(personalNotes.value);

export function exportNotes(): { name: string; json: string } {
  const d = new Date().toISOString().slice(0, 10);
  return {
    name: `zovy-notes-${owner()}-${d}.json`,
    json: JSON.stringify({ app: 'zovy-tononkira', kind: 'notes', owner: owner(), exportedAt: new Date().toISOString(), notes: personalNotes.value }, null, 2),
  };
}

export function importNotes(book: NotesBook) {
  return persist(mergeBooks(personalNotes.value, book));
}
