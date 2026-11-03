import { EDITION } from '../edition';
/**
 * Clé-valeur IndexedDB minimal (aucune dépendance). Persistant, hors ligne, non limité comme localStorage.
 * Repli en mémoire si IndexedDB est indisponible : l'app ne plante jamais pour une question de stockage.
 */
const DB = EDITION.storage;
const STORE = 'kv';
let dbp: Promise<IDBDatabase> | null = null;
const memory = new Map<string, unknown>();

function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  try { return (await tx('readonly', (s) => s.get(key))) as T | undefined; } catch { return memory.get(key) as T | undefined; }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  memory.set(key, value);
  try { await tx('readwrite', (s) => s.put(value, key)); } catch { /* repli mémoire */ }
}

export async function kvDel(key: string): Promise<void> {
  memory.delete(key);
  try { await tx('readwrite', (s) => s.delete(key)); } catch { /* repli mémoire */ }
}
