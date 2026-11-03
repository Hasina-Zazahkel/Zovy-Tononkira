/**
 * Publication des modifications locales vers GitHub, en UN commit atomique (Git Data API).
 * Chaque modif est réappliquée sur la version distante du fichier : on n'écrase jamais
 * des paroles modifiées entre-temps depuis un autre poste.
 */
import { parseChordPro, serializeChordPro } from '../model/chordpro';
import { applyOverride, type SongOverride } from '../model/overrides';
import { serializeSetlist } from '../model/setlist';
import type { Setlist } from '../model/types';
import { computed, signal } from '@preact/signals';
import { hasAdmin, serializeMembers, type Member } from '../model/members';
import { serializeHideBook, type HideBook } from '../model/hide';
import { adminSession } from './members';
import { DEMO } from './demo';
import { EDITION } from '../edition';
import { settings, update } from './settings';
import { kvDel, kvGet, kvSet } from './store';

export const REPO = EDITION.repo;
const API = 'https://api.github.com';
const TOKEN_KEY = 'github.token';

/**
 * Mode éditeur : seul un appareil qui détient le jeton GitHub (ceux de Hasina) peut modifier.
 * Tous les autres sont en lecture seule.
 */
export const hasToken = signal(false);
/**
 * Mode éditeur = jeton sur l'appareil + session admin (ou aucune liste de membres publiée)
 * + interrupteur « Mode éditeur » des Réglages (lecture seule sans oublier le jeton).
 */
export const canEdit = computed(() => hasToken.value && adminSession.value && settings.value.editorOn);

export const getToken = () => kvGet<string>(TOKEN_KEY);
export async function setToken(t: string) {
  if (t.trim()) { await kvSet(TOKEN_KEY, t.trim()); update({ editorOn: true }); }
  else await kvDel(TOKEN_KEY);
  hasToken.value = !!t.trim();
}
export async function initEditor() {
  hasToken.value = !!(await getToken());
}

export class PublishError extends Error {}

async function gh<T>(token: string, path: string, init?: RequestInit, allow404 = false): Promise<T> {
  const res = await fetch(`${API}/repos/${REPO.owner}/${REPO.repo}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (allow404 && res.status === 404) return null as T;
  if (!res.ok) {
    const msg = res.status === 401 ? 'jeton invalide ou expiré'
      : res.status === 403 || res.status === 404 ? 'le jeton n\'a pas le droit d\'écrire sur le dépôt'
      : res.status === 409 || res.status === 422 ? 'conflit : réessaie dans quelques secondes'
      : `erreur GitHub ${res.status}`;
    throw new PublishError(msg);
  }
  return res.json() as Promise<T>;
}

function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Vérifie que le jeton peut écrire sur le dépôt. */
export async function checkToken(token: string): Promise<void> {
  if (DEMO) return;
  const r = await gh<{ permissions?: { push?: boolean } }>(token, '');
  if (!r.permissions?.push) throw new PublishError('le jeton n\'a pas le droit d\'écrire sur le dépôt');
}

export interface PublishResult {
  commitUrl: string;
  files: number;
  /** Modifs de sections ignorées car la structure distante a changé. */
  warnings: string[];
}

export interface AudioUpload { path: string; blob?: Blob; label: string; remove: string[] }

/** Contenu binaire en base64 (sans l'en-tête data:). */
function blobBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

export async function publish(token: string, list: SongOverride[], setlist?: Setlist, members?: Member[], musician?: HideBook,
  audio: AudioUpload[] = []): Promise<PublishResult> {
  if (!list.length && !setlist && !members && !musician && !audio.length) throw new PublishError('rien à publier');
  if (DEMO) {
    const files = list.length + (setlist ? 1 : 0) + (members ? 1 : 0) + (musician ? 1 : 0) + audio.length;
    return { commitUrl: '', files, warnings: ['démo : rien n\'a été envoyé sur GitHub'] };
  }
  if (members && !hasAdmin(members)) throw new PublishError('la liste des membres doit contenir au moins un admin');
  const ref = await gh<{ object: { sha: string } }>(token, `/git/ref/heads/${REPO.branch}`);
  const head = ref.object.sha;
  const commit = await gh<{ tree: { sha: string } }>(token, `/git/commits/${head}`);

  const warnings: string[] = [];
  const tree: { path: string; mode: '100644'; type: 'blob'; content?: string; sha?: string | null }[] = [];
  const labels: string[] = [];
  for (const ov of list) {
    const path = `data/songs/${ov.songId}.cho`;
    const file = await gh<{ content: string } | null>(token, `/contents/${path}?ref=${head}`, undefined, true);
    const remote = file ? decodeBase64Utf8(file.content) : null;
    if (ov.deleted) {
      if (remote !== null) { tree.push({ path, mode: '100644', type: 'blob', sha: null }); labels.push(`− ${ov.songId}`); }
      continue;
    }
    if (remote === null) {
      // Nouveau morceau
      if (!ov.cho) { warnings.push(`${ov.songId} : introuvable sur le dépôt, modification ignorée`); continue; }
      tree.push({ path, mode: '100644', type: 'blob', content: serializeChordPro(parseChordPro(ov.songId, ov.cho).song) });
      labels.push(`+ ${ov.songId}`);
      continue;
    }
    const { song } = parseChordPro(ov.songId, remote);
    // Éditeur complet : la version de l'éditeur (seul à modifier) remplace le fichier
    const { song: next, skipped } = applyOverride(song, ov);
    skipped.forEach((s) => warnings.push(`${song.title} : section ${s} restructurée, voix non publiées`));
    const content = serializeChordPro(next);
    if (content !== remote) { tree.push({ path, mode: '100644', type: 'blob', content }); labels.push(ov.songId); }
  }
  if (setlist) {
    // Éditeur unique : le répertoire local remplace le fichier distant.
    tree.push({ path: `data/setlists/${setlist.id}.json`, mode: '100644', type: 'blob', content: serializeSetlist(setlist) });
  }
  if (musician) {
    tree.push({ path: 'data/musician.json', mode: '100644', type: 'blob', content: serializeHideBook(musician) });
    labels.push('vue musicien');
  }
  if (members) {
    tree.push({ path: 'data/members.json', mode: '100644', type: 'blob', content: serializeMembers(members) });
    labels.push('membres');
  }
  // Liste d'un dossier distant (noms seulement : pas de téléchargement des fichiers audio)
  const dirs = new Map<string, Set<string>>();
  const existsRemote = async (path: string) => {
    const dir = path.slice(0, path.lastIndexOf('/'));
    if (!dirs.has(dir)) {
      const ls = await gh<{ path: string }[] | null>(token, `/contents/${dir}?ref=${head}`, undefined, true);
      dirs.set(dir, new Set(Array.isArray(ls) ? ls.map((f) => f.path) : []));
    }
    return dirs.get(dir)!.has(path);
  };
  for (const a of audio) {
    for (const old of a.remove) if ((old !== a.path || !a.blob) && await existsRemote(old)) tree.push({ path: old, mode: '100644', type: 'blob', sha: null });
    if (a.blob) {
      // Fichier binaire : créé d'abord comme blob Git, puis référencé dans l'arbre
      const b = await gh<{ sha: string }>(token, '/git/blobs', { method: 'POST', body: JSON.stringify({ content: await blobBase64(a.blob), encoding: 'base64' }) });
      tree.push({ path: a.path, mode: '100644', type: 'blob', sha: b.sha });
    }
    labels.push(a.label);
  }
  if (!tree.length) return { commitUrl: '', files: 0, warnings };

  const newTree = await gh<{ sha: string }>(token, '/git/trees', {
    method: 'POST', body: JSON.stringify({ base_tree: commit.tree.sha, tree }),
  });
  const titles = [...labels, ...(setlist ? ['répertoire'] : [])].join(', ');
  const newCommit = await gh<{ sha: string; html_url: string }>(token, '/git/commits', {
    method: 'POST',
    body: JSON.stringify({
      message: `Mise à jour depuis l'app (${tree.length} fichier${tree.length > 1 ? 's' : ''})\n\n${titles}`,
      tree: newTree.sha, parents: [head],
    }),
  });
  await gh(token, `/git/refs/heads/${REPO.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: newCommit.sha }) });
  return { commitUrl: newCommit.html_url, files: tree.length, warnings };
}
