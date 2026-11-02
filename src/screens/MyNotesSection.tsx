import { useRef, useState } from 'preact/hooks';
import { exportNotes, importNotes, personalNotes } from '../lib/personal';
import { settings, update } from '../lib/settings';
import { countNotes, parseNotesFile } from '../model/personal';

/** Réglages → Mes notes : affichage, sauvegarde et restauration (fichier). Pour tous les membres. */
export function MyNotesSection() {
  const n = countNotes(personalNotes.value);
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
      const book = parseNotesFile(JSON.parse(await f.text()));
      await importNotes(book);
      setMsg({ kind: 'ok', text: `Notes importées (${countNotes(book)}). Les notes déjà présentes sont conservées.` });
    } catch {
      setMsg({ kind: 'err', text: 'Fichier non reconnu : choisis un fichier « zovy-notes-….json ».' });
    }
  };

  return (
    <>
      <h3 class="sheet-h">Mes notes</h3>
      <p class="hint">
        Surlignages et commentaires personnels, ajoutés avec <b>👤 Mes notes</b> sur la page de lecture.
        Ils restent sur cet appareil et ne sont jamais envoyés au groupe.
      </p>
      <button class="set-row" role="switch" aria-checked={on} onClick={() => update({ showPersonal: !on })}>
        <span class="set-l">Afficher mes notes<small>{n ? `${n} note${n > 1 ? 's' : ''} sur cet appareil` : 'Aucune note pour l\'instant'}</small></span>
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
