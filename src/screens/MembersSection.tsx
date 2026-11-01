import { useState } from 'preact/hooks';
import { currentMembers, dropMembersOverride, membersOverride, membersUnpublished, saveMembers, session } from '../lib/members';
import { makeMember, normalizeId, validateId, validatePassword, type Member } from '../model/members';
import { IconClose } from '../ui/icons';

/** Réglages (mode éditeur) : membres autorisés à ouvrir l'app. */
export function MembersSection() {
  const list = currentMembers.value;
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [admin, setAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reset, setReset] = useState<{ id: string; pw: string } | null>(null);
  const first = list.length === 0;
  const admins = list.filter((m) => m.admin).length;
  const me = session.value?.id;

  const add = async () => {
    const e = validateId(id, list) ?? validatePassword(pw);
    if (e) { setErr(e); return; }
    setBusy(true); setErr(null);
    try {
      const m = await makeMember(id, pw, first || admin);
      await saveMembers([...list, m]);
      setId(''); setPw(''); setAdmin(false);
    } finally { setBusy(false); }
  };

  const replace = (m: Member, next: Member | null) =>
    saveMembers(next ? list.map((x) => (x.id === m.id ? next : x)) : list.filter((x) => x.id !== m.id));

  const remove = (m: Member) => {
    if (m.admin && admins <= 1 && list.length > 1) { setErr('Impossible : il doit rester au moins un admin.'); return; }
    const self = m.id === me ? '\n\nC\'est ton compte : après publication, cet appareil reviendra à la page de connexion.' : '';
    if (confirm(`Retirer « ${m.id} » ?${self}`)) void replace(m, null);
  };

  const toggleAdmin = (m: Member) => {
    if (m.admin && admins <= 1) { setErr('Impossible : il doit rester au moins un admin.'); return; }
    void replace(m, m.admin ? { id: m.id, salt: m.salt, hash: m.hash, iter: m.iter } : { ...m, admin: true });
  };

  const doReset = async () => {
    if (!reset) return;
    const e = validatePassword(reset.pw);
    if (e) { setErr(e); return; }
    const m = list.find((x) => x.id === reset.id)!;
    setBusy(true);
    try {
      const fresh = await makeMember(m.id, reset.pw, !!m.admin);
      await replace(m, fresh);
      setReset(null); setErr(null);
    } finally { setBusy(false); }
  };

  return (
    <div class="members">
      <h3 class="sheet-h">Membres{membersUnpublished.value ? ' · à publier' : ''}</h3>
      <p class="hint">
        Identifiant et mot de passe pour ouvrir l'app. Connexion valable 30 jours sur chaque appareil.
        Protection simple : le site reste public, évite les mots de passe trop courts ou réutilisés ailleurs.
      </p>
      {first && <p class="msg warn">Aucun membre : l'app s'ouvre sans connexion. Commence par toi-même (admin).</p>}
      {list.map((m) => (
        <div class="member" key={m.id}>
          <div class="member-row">
            <span class="member-id">{m.id}{m.id === me && <small> (toi)</small>}</span>
            <button class={`chip-btn${m.admin ? ' on' : ''}`} onClick={() => toggleAdmin(m)} aria-pressed={!!m.admin}
              aria-label={`${m.id} : admin`}>admin</button>
            <button class="chip-btn" onClick={() => { setReset(reset?.id === m.id ? null : { id: m.id, pw: '' }); setErr(null); }}>Mot de passe</button>
            <button class="icon-btn del" aria-label={`Retirer ${m.id}`} onClick={() => remove(m)}><IconClose size={24} /></button>
          </div>
          {reset?.id === m.id && (
            <div class="row member-reset">
              <input class="in" type="text" autoComplete="off" autoCapitalize="none" spellcheck={false} placeholder="Nouveau mot de passe"
                value={reset.pw} onInput={(e) => setReset({ id: m.id, pw: (e.target as HTMLInputElement).value })} aria-label={`Nouveau mot de passe pour ${m.id}`} />
              <button class="btn primary small" disabled={busy || !reset.pw} onClick={doReset}>Changer</button>
            </div>
          )}
        </div>
      ))}

      <div class="member-add">
        <input class="in" type="text" autoComplete="off" autoCapitalize="none" spellcheck={false} placeholder="Identifiant"
          value={id} onInput={(e) => setId((e.target as HTMLInputElement).value)} aria-label="Identifiant du nouveau membre" />
        <input class="in" type="text" autoComplete="off" autoCapitalize="none" spellcheck={false} placeholder="Mot de passe"
          value={pw} onInput={(e) => setPw((e.target as HTMLInputElement).value)} aria-label="Mot de passe du nouveau membre" />
        <label class="member-admin">
          <input type="checkbox" checked={first || admin} disabled={first} onChange={(e) => setAdmin((e.target as HTMLInputElement).checked)} />
          Admin {first && <small>(obligatoire pour le premier membre)</small>}
        </label>
        <button class="btn primary" disabled={busy || !id.trim() || !pw} onClick={add}>
          {busy ? '…' : `Ajouter ${normalizeId(id) ? `« ${normalizeId(id)} »` : 'le membre'}`}
        </button>
      </div>
      {err && <p class="msg err">{err}</p>}
      {membersOverride.value && (
        <button class="btn ghost" onClick={() => { if (confirm('Annuler les modifications des membres sur cet appareil ?')) void dropMembersOverride(); }}>
          Annuler les modifications des membres
        </button>
      )}
    </div>
  );
}
