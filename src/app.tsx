import { useRegisterSW } from 'virtual:pwa-register/preact';
import { catalog, catalogError } from './lib/catalog';
import { route } from './lib/router';
import { Home } from './screens/Home';
import { SetlistView } from './screens/SetlistView';
import { Stage } from './screens/Stage';

const logo = `${import.meta.env.BASE_URL}img/logo-zovy.png`;

export function App() {
  // Enregistrement du service worker en mode "prompt" : aucune mise à jour sans action explicite.
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  const r = route.value;
  const tab = r.name === 'setlist' ? 'setlist' : 'home';

  if (catalogError.value) return <div class="state">Impossible de charger le catalogue : {catalogError.value}</div>;
  if (!catalog.value) return <div class="state">Chargement…</div>;

  return (
    <>
      {/* Écrans liste toujours montés sous la scène : état et défilement conservés au retour */}
      <div class="screen">
        <div class="top">
          <img class="logo" src={logo} alt="Zovy" width={360} height={111} />
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

      {r.name !== 'song' && needRefresh && (
        <div class="update" role="status">
          Nouvelle version disponible
          <button onClick={() => updateServiceWorker(true)}>METTRE À JOUR</button>
        </div>
      )}
    </>
  );
}
