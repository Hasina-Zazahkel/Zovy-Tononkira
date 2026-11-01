import { useState } from 'preact/hooks';
import { useRegisterSW } from 'virtual:pwa-register/preact';
import { catalog, catalogError } from './lib/catalog';
import { overridesReady } from './lib/overrides';
import { route } from './lib/router';
import { Home } from './screens/Home';
import { SetlistView } from './screens/SetlistView';
import { PendingBar, PublishSheet } from './screens/PublishSheet';
import { Stage } from './screens/Stage';
import { IconGear } from './ui/icons';

const logo = `${import.meta.env.BASE_URL}img/logo-zovy.png`;

export function App() {
  // Enregistrement du service worker en mode "prompt" : aucune mise à jour sans action explicite.
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  const [sheet, setSheet] = useState(false);
  const r = route.value;
  const tab = r.name === 'setlist' ? 'setlist' : 'home';

  if (catalogError.value) return <div class="state">Impossible de charger le catalogue : {catalogError.value}</div>;
  if (!catalog.value || !overridesReady.value) return <div class="state">Chargement…</div>;

  return (
    <>
      {/* Écrans liste toujours montés sous la scène : état et défilement conservés au retour */}
      <div class="screen">
        <div class="top">
          <div class="brand">
            <img class="logo" src={logo} alt="Zovy" width={360} height={111} />
            <button class="icon-btn gear" onClick={() => setSheet(true)} aria-label="Modifications et publication"><IconGear size={28} /></button>
          </div>
          <PendingBar onOpen={() => setSheet(true)} />
          <nav class="tabs">
            <a class="tab" href="#/" aria-current={tab === 'home' ? 'page' : undefined}>ARTISTES</a>
            <a class="tab" href="#/repertoire" aria-current={tab === 'setlist' ? 'page' : undefined}>RÉPERTOIRE</a>
          </nav>
        </div>
        <div class="scroll">
          <div hidden={tab !== 'home'}><Home /></div>
          <div hidden={tab !== 'setlist'}><SetlistView /></div>
        </div>
      </div>

      {r.name === 'song' && <Stage key={`${r.id}-${r.pos ?? ''}`} id={r.id} setlistId={r.setlistId} pos={r.pos} />}

      {sheet && r.name !== 'song' && <PublishSheet onClose={() => setSheet(false)} />}

      {r.name !== 'song' && needRefresh && (
        <div class="update" role="status">
          Nouvelle version disponible
          <button onClick={() => updateServiceWorker(true)}>METTRE À JOUR</button>
        </div>
      )}
    </>
  );
}
