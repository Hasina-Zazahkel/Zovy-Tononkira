import { EDITION, FEATURES } from './edition';
import { useState } from 'preact/hooks';
import { useRegisterSW } from 'virtual:pwa-register/preact';
import { catalog, catalogError } from './lib/catalog';
import { liveCatalog, overridesReady } from './lib/overrides';
import { canEdit } from './lib/publish';
import { authReady, loggedIn, loginRequired } from './lib/members';
import { Login } from './screens/Login';
import { DEMO, demoToast } from './lib/demo';
import { route } from './lib/router';
import { useMemo } from 'preact/hooks';
import { Home, homeQuery, initial } from './screens/Home';
import { AZBar } from './ui/AZBar';
import { SetlistView } from './screens/SetlistView';
import { PendingBar, SettingsSheet } from './screens/SettingsSheet';
import { Stage } from './screens/Stage';
import { NewSong } from './screens/NewSong';
import { IconGear } from './ui/icons';

const logo = `${import.meta.env.BASE_URL}${EDITION.logo.src}`;

export function App() {
  // Enregistrement du service worker en mode "prompt" : aucune mise à jour sans action explicite.
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  const [sheet, setSheet] = useState(false);
  const r = route.value;
  const tab = r.name === 'setlist' ? 'setlist' : 'home';

  const letters = useMemo(() => new Set(!FEATURES.songList
    ? (liveCatalog.value?.artists ?? []).map((a) => initial(a.name))
    : [...(liveCatalog.value?.songs.values() ?? [])].map((s) => initial(s.title))), [liveCatalog.value]);

  if (catalogError.value) return <div class="state">Impossible de charger le catalogue : {catalogError.value}</div>;
  if (!authReady.value) return <div class="state">Chargement…</div>;
  if (loginRequired.value && !loggedIn.value) return <><Login /><DemoLayer /></>;
  if (!catalog.value || !overridesReady.value) return <div class="state">Chargement…</div>;

  return (
    <>
      {/* Écrans liste toujours montés sous la scène : état et défilement conservés au retour */}
      <div class="screen">
        <header class="top">
          <div class="top-row">
            <img class="logo" src={logo} alt={EDITION.logo.alt} width={EDITION.logo.width} height={EDITION.logo.height} />
            <nav class="tabs">
              <a class="tab" href="#/" aria-current={tab === 'home' ? 'page' : undefined}>{FEATURES.songList ? 'LISTE DES CHANTS' : 'ARTISTES'}</a>
              <a class="tab" href="#/repertoire" aria-current={tab === 'setlist' ? 'page' : undefined}>RÉPERTOIRE</a>
            </nav>
            <button class="icon-btn gear" onClick={() => setSheet(true)} aria-label="Réglages"><IconGear size={28} /></button>
          </div>
          {canEdit.value && <PendingBar onOpen={() => setSheet(true)} />}
        </header>
        <div class="list-wrap" hidden={tab !== 'home'}>
          <div class="scroll with-az" id="scroll-home"><Home /></div>
          {!homeQuery.value.trim() && <AZBar available={letters} scrollEl={() => document.getElementById('scroll-home')} />}
        </div>
        <div class="list-wrap" hidden={tab !== 'setlist'}>
          <div class="scroll" id="scroll-setlist"><SetlistView /></div>
        </div>
      </div>

      {r.name === 'song' && <Stage key={`${r.id}-${r.pos ?? ''}`} id={r.id} setlistId={r.setlistId} pos={r.pos} />}

      {r.name === 'new' && canEdit.value && <NewSong />}

      {sheet && r.name !== 'song' && <SettingsSheet onClose={() => setSheet(false)} />}

      <DemoLayer />

      {r.name !== 'song' && r.name !== 'new' && needRefresh && (
        <div class="update" role="status">
          Nouvelle version disponible
          <button onClick={() => updateServiceWorker(true)}>METTRE À JOUR</button>
        </div>
      )}
    </>
  );
}

function DemoLayer() {
  if (!DEMO) return null;
  return (
    <>
      <div class="demo-badge" aria-hidden="true">DÉMO</div>
      {demoToast.value && <div class="demo-toast" role="status">{demoToast.value}</div>}
    </>
  );
}
