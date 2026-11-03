import { EDITION } from '../edition';
import { useState } from 'preact/hooks';
import { login } from '../lib/members';
import { DEMO } from '../lib/demo';

const logo = `${import.meta.env.BASE_URL}${EDITION.logo.src}`;
const HINT = `Accès réservé aux membres ${EDITION.groupWord === 'chorale' ? 'de la chorale' : 'du groupe'}. Identifiants fournis par ${EDITION.admin}.`;
const hero = EDITION.loginImage ? `${import.meta.env.BASE_URL}${EDITION.loginImage}` : null;

/** Page de connexion (dès qu'une liste de membres est publiée). Fonctionne hors ligne. */
export function Login() {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!id.trim() || !pw) return;
    setBusy(true); setErr(false);
    const ok = await login(id, pw);
    setBusy(false);
    if (!ok) { setErr(true); setPw(''); }
  };

  return (
    <main class="login">
      <form class="login-box" onSubmit={submit}>
        {hero
          ? <img class="login-banner" src={hero} alt={EDITION.logo.alt} />
          : <img class="login-logo" src={logo} alt={EDITION.logo.alt} width={EDITION.logo.width} height={EDITION.logo.height} />}
        <label class="login-f">
          <span>Identifiant</span>
          <input class="in" type="text" name="username" autoComplete="username" autoCapitalize="none" spellcheck={false}
            value={id} onInput={(e) => setId((e.target as HTMLInputElement).value)} autoFocus />
        </label>
        <label class="login-f">
          <span>Mot de passe</span>
          <span class="login-pw">
            <input class="in" type={(show ? 'text' : 'password') as 'password'} name="password" autoComplete="current-password"
              value={pw} onInput={(e) => setPw((e.target as HTMLInputElement).value)} />
            <button type="button" class="chip-btn" onClick={() => setShow(!show)} aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
              {show ? 'Masquer' : 'Voir'}
            </button>
          </span>
        </label>
        {err && <p class="msg err" role="alert">Identifiant ou mot de passe incorrect.</p>}
        <button class="btn primary wide" type="submit" disabled={busy || !id.trim() || !pw}>{busy ? 'Vérification…' : 'SE CONNECTER'}</button>
        <p class="login-hint">{HINT}</p>
        {DEMO && <p class="msg warn">Démo : <b>hasina</b> / <b>zovy2026</b> (admin) ou <b>misa</b> / <b>zovy2026</b> (membre). En mode éditeur, n'importe quel jeton est accepté et rien n'est envoyé.</p>}
      </form>
    </main>
  );
}
