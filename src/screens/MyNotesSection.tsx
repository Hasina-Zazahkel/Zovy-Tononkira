import { useRef, useState } from 'preact/hooks';
import { exportNotes, importNotes, personalBooks } from '../lib/personal';
import { settings, update } from '../lib/settings';
import { EDITION, FEATURES } from '../edition';

const NOTES_HINT = FEATURES.musicianView
  ? `Surlignages et commentaires personnels (séparés pour la vue chanteur et la vue musicien) et lignes masquées en vue musicien. Ils restent sur cet appareil et ne sont jamais envoyés ${EDITION.groupWord === 'chorale' ? 'à la chorale' : 'au groupe'} ; l'export les sauvegarde tous.`
  : `Passages en couleur et commentaires personnels. Ils restent sur cet appareil et ne sont jamais envoyés ${EDITION.groupWord === 'chorale' ? 'à la chorale' : 'au groupe'} ; l'export les sauvegarde tous.`;
import { countNotes, parseNotesExport } from '../model/personal';
import type { PersonalHide } from '../model/hide';

/** Réglages → Mes notes : affichage, sauvegarde et restauration (fichier). Pour tous les membres. */
export function MyNotesSection() {
  const nc = countNotes(personalBooks.value.chanteur);
  const nm = countNotes(personalBooks.value.musicien);
  const n = nc + nm;
  const on = settings.value.showPersonal;
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [href, setHref] = useState<{ url: string; name: string } | null>(null);

  const doExport = () => {
    const { name, json } = exportNotes();
    if (href) URL.revokeObjectURL(href.url);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    setHref({ url, name });
    // Téléchargement direct ; le lien reste affiché si le navigateur l'a bloqué
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setMsg({ kind: 'ok', text: `${n} note${n > 1 ? 's' : ''} exportée${n > 1 ? 's' : ''} : garde le fichier (Drive, mail, clé…) pour les restaurer sur un autre appareil.` });
  };

  const doImport = async (f: File) => {
    try {
      const raw = JSON.parse(await f.text());
      const books = parseNotesExport(raw);
      const hidden = raw && typeof raw === 'object' && raw.hidden && typeof raw.hidden === 'object' ? (raw.hidden as Record<string, PersonalHide>) : undefined;
      await importNotes(books, hidden);
      setMsg({ kind: 'ok', text: `Notes importées (${countNotes(books.chanteur) + countNotes(books.musicien)}). Les notes déjà présentes sont conservées.` });
    } catch {
      setMsg({ kind: 'err', text: `Fichier non reconnu : choisis un fichier « ${EDITION.storage}-notes-….json ».` });
    }
  };

  return (
    <>
      <h3 class="sheet-h">Mes notes</h3>
      <p class="hint">
        {NOTES_HINT}
      </p>
      <button class="set-row" role="switch" aria-checked={on} onClick={() => update({ showPersonal: !on })}>
        <span class="set-l">Afficher mes notes<small>{!n ? 'Aucune note pour l\'instant' : FEATURES.musicianView ? `Vue chanteur : ${nc} · vue musicien : ${nm}` : `${n} note${n > 1 ? 's' : ''} sur cet appareil`}</small></span>
        <span class={`switch${on ? ' on' : ''}`}><i /></span>
      </button>
      <div class="row notes-io">
        <button class="btn small" disabled={!n} onClick={doExport}>Exporter mes notes</button>
        <button class="btn small" onClick={() => file.current?.click()}>Importer</button>
        <input ref={file} type="file" accept="application/json,.json" hidden
          onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void doImport(f); (e.target as HTMLInputElement).value = ''; }} />
      </div>
      {href && <p class="hint">Si le téléchargement n'a pas démarré : <a href={href.url} download={href.name}>{href.name}</a></p>}
      {msg && <p class={`msg ${msg.kind}`}>{msg.text}</p>}
    </>
  );
}
