/**
 * Publication des modifications locales vers GitHub, en UN commit atomique (Git Data API).
 * Chaque modif est réappliquée sur la version distante du fichier : on n'écrase jamais
 * des paroles modifiées entre-temps depuis un autre poste.
 */
import { parseChordPro, serializeChordPro } from '../model/chordpro';
import { applyOverride, type SongOverride } from '../model/overrides';
import { kvDel, kvGet, kvSet } from './store';

export const REPO = { owner: 'Hasina-Zazahkel', repo: 'Zovy-Tononkira', branch: 'main' };
const API = 'https://api.github.com';
const TOKEN_KEY = 'github.token';

export const getToken = () => kvGet<string>(TOKEN_KEY);
export const setToken = (t: string) => (t.trim() ? kvSet(TOKEN_KEY, t.trim()) : kvDel(TOKEN_KEY));

export class PublishError extends Error {}

async function gh<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/repos/${REPO.owner}/${REPO.repo}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
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
  const r = await gh<{ permissions?: { push?: boolean } }>(token, '');
  if (!r.permissions?.push) throw new PublishError('le jeton n\'a pas le droit d\'écrire sur le dépôt');
}

export interface PublishResult {
  commitUrl: string;
  files: number;
  /** Modifs de sections ignorées car la structure distante a changé. */
  warnings: string[];
}

export async function publish(token: string, list: SongOverride[]): Promise<PublishResult> {
  if (!list.length) throw new PublishError('rien à publier');
  const ref = await gh<{ object: { sha: string } }>(token, `/git/ref/heads/${REPO.branch}`);
  const head = ref.object.sha;
  const commit = await gh<{ tree: { sha: string } }>(token, `/git/commits/${head}`);

  const warnings: string[] = [];
  const tree: { path: string; mode: '100644'; type: 'blob'; content: string }[] = [];
  for (const ov of list) {
    const path = `data/songs/${ov.songId}.cho`;
    const file = await gh<{ content: string }>(token, `/contents/${path}?ref=${head}`);
    const remote = decodeBase64Utf8(file.content);
    const { song } = parseChordPro(ov.songId, remote);
    const { song: next, skipped } = applyOverride(song, ov);
    skipped.forEach((s) => warnings.push(`${song.title} : section ${s} restructurée, voix non publiées`));
    const content = serializeChordPro(next);
    if (content !== remote) tree.push({ path, mode: '100644', type: 'blob', content });
  }
  if (!tree.length) return { commitUrl: '', files: 0, warnings };

  const newTree = await gh<{ sha: string }>(token, '/git/trees', {
    method: 'POST', body: JSON.stringify({ base_tree: commit.tree.sha, tree }),
  });
  const titles = list.map((o) => o.songId).join(', ');
  const newCommit = await gh<{ sha: string; html_url: string }>(token, '/git/commits', {
    method: 'POST',
    body: JSON.stringify({
      message: `Voix et musiciens mis à jour depuis l'app (${tree.length} morceau${tree.length > 1 ? 'x' : ''})\n\n${titles}`,
      tree: newTree.sha, parents: [head],
    }),
  });
  await gh(token, `/git/refs/heads/${REPO.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: newCommit.sha }) });
  return { commitUrl: newCommit.html_url, files: tree.length, warnings };
}
