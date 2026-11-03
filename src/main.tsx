import { render } from 'preact';
import { App } from './app';
import { loadCatalog } from './lib/catalog';
import { loadOverrides, overridesReady } from './lib/overrides';
import { initEditor } from './lib/publish';
import { loadAuth } from './lib/members';
import { loadMusicianDefaults } from './lib/personal';
import { loadSetlistOverride } from './lib/setlistEdit';
import { initWakeLock } from './lib/wakeLock';
import { loadAudioPending } from './lib/audio';
import { FEATURES } from './edition';
import { applyTheme } from './edition';
import './lib/demo';
import './styles.css';
import './themes.css';


applyTheme();
initWakeLock();
void initEditor();
void loadAuth();
void loadMusicianDefaults();
void loadCatalog()
  .then(() => Promise.all([loadOverrides(), loadSetlistOverride(), FEATURES.audio ? loadAudioPending() : undefined]))
  .finally(() => { overridesReady.value = true; });
render(<App />, document.getElementById('app')!);
