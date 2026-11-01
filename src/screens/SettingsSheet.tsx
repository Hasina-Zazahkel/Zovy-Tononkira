import { useState } from 'preact/hooks';
import { catalog } from '../lib/catalog';
import { dropOverride, markPublished, overrides, unpublished } from '../lib/overrides';
import { canEdit, checkToken, getToken, publish, PublishError, REPO, setToken } from '../lib/publish';
import { dropSetlistOverride, markSetlistPublished, setlistOverride, setlistUnpublished } from '../lib/setlistEdit';
import { bumpFont, FONT_MAX, FONT_MIN, settings, update } from '../lib/settings';
import { wakeState } from '../lib/wakeLock';
import { IconClose } from '../ui/icons';

const TOKEN_URL = `https://github.com/settings/personal-access-tokens/new?name=Zovy+Tononkira&description=Publication+depuis+la+tablette&target_name=${REPO.owner}&contents=write`;

/** Bandeau d'accueil : modifs locales en attente. */
export function PendingBar({ onOpen }: { onOpen: () => void }) {
  const n = unpublished.value.length + (setlistUnpublished.value ? 1 : 0);
  const sent = Object.values(overrides.value).length + (setlistOverride.value ? 1 : 0) - n;
  if (!n && !sent) return null;
  return (
    <button class="pending" onClick={onOpen}>
      {n > 0
        ? <><b>{n}</b> modification{n > 1 ? 's' : ''} sur cet appareil<span class="go">PUBLIER</span></>
        : <>Publié · mise en ligne en cours ({sent})<span class="go ghost">DÉTAILS</span></>}
    </button>
  );
}

function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button class="set-row" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span class="set-l">{label}{hint && <small>{hint}</small>}</span>
      <span class={`switch${on ? ' on' : ''}`}><i /></span>
    </button>
  );
}

/** Roue crantée : affichage (tous), puis modifications / publication / mode éditeur (éditeur seulement). */
export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const st = settings.value;
  const [token, setTok] = useState('');
  const hasToken = canEdit.value;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string; url?: string } | null>(null);
  const songs = catalog.value!.songs;
  const all = Object.values(overrides.value);
  const pending = unpublished.value;
  const slOv = setlistOverride.value;
  const slPending = setlistUnpublished.value;
  const nPending = pending.length + (slPending ? 1 : 0);

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
    if (nPending > 0
      && !confirm('Des modifications ne sont pas publiées : elles resteront sur cet appareil sans pouvoir être envoyées. Continuer ?')) return;
    await setToken(''); setMsg(null);
  };

  const run = async () => {
    setBusy(true); setMsg(null);
    try {
      const t = await getToken();
      if (!t) throw new PublishError('aucun jeton configuré');
      const r = await publish(t, pending, slPending ? slOv!.setlist : undefined);
      await markPublished(pending.map((o) => o.songId));
      if (slPending) await markSetlistPublished();
      setMsg({
        kind: 'ok',
        text: r.files
          ? `Publié (${r.files} fichier${r.files > 1 ? 's' : ''}). Les tablettes verront « Mettre à jour » d'ici 2 à 3 minutes.${r.warnings.length ? ` Attention : ${r.warnings.join(' ; ')}` : ''}`
          : 'Rien de nouveau : ces modifications sont déjà en ligne.',
        url: r.commitUrl || undefined,
      });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof PublishError ? `Échec : ${e.message}.` : 'Pas de connexion : tes modifications restent enregistrées sur cet appareil, réessaie avec du réseau.' });
    } finally { setBusy(false); }
  };

  return (
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Réglages">
      <header class="sheet-head">
        <div class="sheet-title"><div class="t">Réglages</div><div class="a">{hasToken ? 'Mode éditeur' : 'Lecture seule'}</div></div>
        <button class="icon-btn" onClick={onClose} aria-label="Fermer"><IconClose /></button>
      </header>
      <div class="sheet-body">
        <h3 class="sheet-h">Affichage</h3>
        <div class="set-row static">
          <span class="set-l">Taille du texte<small>Paroles en vue scène</small></span>
          <span class="stepper">
            <button class="font-btn" onClick={() => bumpFont(-1)} disabled={st.fontSize <= FONT_MIN} aria-label="Réduire le texte"><small>A</small>−</button>
            <b>{st.fontSize}</b>
            <button class="font-btn" onClick={() => bumpFont(1)} disabled={st.fontSize >= FONT_MAX} aria-label="Agrandir le texte">A+</button>
          </span>
        </div>
        <div class={`preview${st.uppercase ? ' upper' : ''}`} style={{ fontSize: `${Math.min(st.fontSize, 44)}px` }}>Ilay tsiky avy aminao</div>
        <Toggle label="Écran toujours allumé" hint={wakeState.value === 'unsupported' ? 'Non pris en charge par ce navigateur' : 'Empêche la mise en veille'}
          on={st.keepAwake} onChange={(v) => update({ keepAwake: v })} />
        {hasToken && <Toggle label="Paroles en majuscules" on={st.uppercase} onChange={(v) => update({ uppercase: v })} />}

        {hasToken && <h3 class="sheet-h voice">Modifications à publier</h3>}
        {hasToken && !all.length && !slOv && <p class="hint">Aucune modification en attente.</p>}
        {hasToken && slOv && (
          <div class="mod">
            <a href="#/repertoire" onClick={onClose} class="mod-t">Répertoire</a>
            <span class={`mod-s${slPending ? '' : ' sent'}`}>{slPending ? 'à publier' : 'envoyé'}</span>
            <button class="icon-btn del" aria-label="Annuler les modifications du répertoire"
              onClick={() => { if (confirm('Annuler les modifications du répertoire sur cet appareil ?')) void dropSetlistOverride(); }}>
              <IconClose size={24} />
            </button>
          </div>
        )}
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
            <button class="btn primary wide" disabled={busy || !nPending} onClick={run}>
              {busy ? 'Publication…' : nPending ? `PUBLIER POUR TOUT LE GROUPE (${nPending})` : 'Tout est publié'}
            </button>
            {msg && <p class={`msg ${msg.kind}`}>{msg.text} {msg.url && <a href={msg.url} target="_blank" rel="noopener">Voir sur GitHub</a>}</p>}
            <h3 class="sheet-h">Mode éditeur</h3>
            <p class="hint">Cet appareil peut modifier et publier (jeton GitHub enregistré).</p>
            <button class="btn ghost" onClick={forget}>Repasser cet appareil en lecture seule</button>
          </>
        ) : (
          <>
            {msg && <p class={`msg ${msg.kind}`}>{msg.text}</p>}
            <h3 class="sheet-h">Mode éditeur</h3>
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
