import { useState } from 'preact/hooks';
import { catalog } from '../lib/catalog';
import { dropOverride, markPublished, overrides, unpublished } from '../lib/overrides';
import { canEdit, checkToken, getToken, publish, PublishError, REPO, setToken } from '../lib/publish';
import { IconClose } from '../ui/icons';

const TOKEN_URL = `https://github.com/settings/personal-access-tokens/new?name=Zovy+Tononkira&description=Publication+depuis+la+tablette&target_name=${REPO.owner}&contents=write`;

/** Bandeau d'accueil : modifs locales en attente. */
export function PendingBar({ onOpen }: { onOpen: () => void }) {
  const n = unpublished.value.length;
  const sent = Object.values(overrides.value).length - n;
  if (!n && !sent) return null;
  return (
    <button class="pending" onClick={onOpen}>
      {n > 0
        ? <><b>{n}</b> morceau{n > 1 ? 'x' : ''} modifié{n > 1 ? 's' : ''} sur cet appareil<span class="go">PUBLIER</span></>
        : <>Publié · mise en ligne en cours ({sent})<span class="go ghost">DÉTAILS</span></>}
    </button>
  );
}

export function PublishSheet({ onClose }: { onClose: () => void }) {
  const [token, setTok] = useState('');
  const hasToken = canEdit.value;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string; url?: string } | null>(null);
  const songs = catalog.value!.songs;
  const all = Object.values(overrides.value);
  const pending = unpublished.value;

  const saveToken = async () => {
    setBusy(true); setMsg(null);
    try {
      await checkToken(token.trim());
      await setToken(token);
      setTok('');
      setMsg({ kind: 'ok', text: 'Mode éditeur activé sur cet appareil.' });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof PublishError ? `Jeton refusé : ${e.message}` : 'Pas de connexion : réessaie avec du réseau.' });
    } finally { setBusy(false); }
  };

  const forget = async () => {
    if (all.some((o) => !o.publishedAt || o.updatedAt > o.publishedAt)
      && !confirm('Des modifications ne sont pas publiées : elles resteront sur cet appareil sans pouvoir être envoyées. Continuer ?')) return;
    await setToken(''); setMsg(null);
  };

  const run = async () => {
    setBusy(true); setMsg(null);
    try {
      const t = await getToken();
      if (!t) throw new PublishError('aucun jeton configuré');
      const r = await publish(t, pending);
      await markPublished(pending.map((o) => o.songId));
      setMsg({
        kind: 'ok',
        text: r.files
          ? `Publié (${r.files} morceau${r.files > 1 ? 'x' : ''}). Les tablettes verront « Mettre à jour » d'ici 2 à 3 minutes.${r.warnings.length ? ` Attention : ${r.warnings.join(' ; ')}` : ''}`
          : 'Rien de nouveau : ces modifications sont déjà en ligne.',
        url: r.commitUrl || undefined,
      });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof PublishError ? `Échec : ${e.message}.` : 'Pas de connexion : tes modifications restent enregistrées sur cet appareil, réessaie avec du réseau.' });
    } finally { setBusy(false); }
  };

  return (
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Publication">
      <header class="sheet-head">
        <div class="sheet-title"><div class="t">{hasToken ? 'Modifications & publication' : 'Mode éditeur'}</div></div>
        <button class="icon-btn" onClick={onClose} aria-label="Fermer"><IconClose /></button>
      </header>
      <div class="sheet-body">
        {hasToken && <h3 class="sheet-h voice">Modifié sur cet appareil</h3>}
        {hasToken && !all.length && <p class="hint">Aucune modification en attente.</p>}
        {hasToken && all.map((o) => {
          const sent = o.publishedAt && o.updatedAt <= o.publishedAt;
          return (
            <div class="mod" key={o.songId}>
              <a href={`#/song/${o.songId}`} onClick={onClose} class="mod-t">{songs.get(o.songId)?.title ?? o.songId}</a>
              <span class={`mod-s${sent ? ' sent' : ''}`}>{sent ? 'envoyé' : 'à publier'}</span>
              <button class="icon-btn del" aria-label="Annuler cette modification"
                onClick={() => { if (confirm('Annuler cette modification sur cet appareil ?')) void dropOverride(o.songId); }}>
                <IconClose size={24} />
              </button>
            </div>
          );
        })}

        {hasToken ? (
          <>
            <button class="btn primary wide" disabled={busy || !pending.length} onClick={run}>
              {busy ? 'Publication…' : pending.length ? `PUBLIER POUR TOUT LE GROUPE (${pending.length})` : 'Tout est publié'}
            </button>
            {msg && <p class={`msg ${msg.kind}`}>{msg.text} {msg.url && <a href={msg.url} target="_blank" rel="noopener">Voir sur GitHub</a>}</p>}
            <h3 class="sheet-h">Mode éditeur</h3>
            <p class="hint">Cet appareil peut modifier et publier (jeton GitHub enregistré).</p>
            <button class="btn ghost" onClick={forget}>Repasser cet appareil en lecture seule</button>
          </>
        ) : (
          <>
            {msg && <p class={`msg ${msg.kind}`}>{msg.text}</p>}
            <p class="hint">
              Cet appareil est en <b>lecture seule</b>. La modification est réservée à l'éditeur du groupe :
              pour l'activer, colle ici ton jeton GitHub (accès « Contents : Read and write » au dépôt {REPO.repo}).{' '}
              <a href={TOKEN_URL} target="_blank" rel="noopener">Créer le jeton</a>
            </p>
            <div class="row token">
              <input class="in" type="password" placeholder="github_pat_…" value={token} autoComplete="off"
                onInput={(e) => setTok((e.target as HTMLInputElement).value)} aria-label="Jeton GitHub" />
              <button class="btn primary" disabled={busy || !token.trim()} onClick={saveToken}>{busy ? '…' : 'Vérifier'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
