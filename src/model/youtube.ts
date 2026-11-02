/** Lien YouTube d'un morceau : on ne garde que l'identifiant de la vidéo (11 caractères). */
const ID = /^[A-Za-z0-9_-]{11}$/;

export function parseYoutube(raw: string): string | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  if (ID.test(s)) return s;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    const host = u.hostname.replace(/^(www|m|music)\./, '');
    let id: string | null = null;
    if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? null;
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      id = u.searchParams.get('v');
      const m = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(u.pathname);
      if (!id && m) id = m[1];
    }
    return id && ID.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

export const youtubeUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
