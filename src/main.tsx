import { render } from 'preact';
import { App } from './app';
import { loadCatalog } from './lib/catalog';
import { loadOverrides, overridesReady } from './lib/overrides';
import { initEditor } from './lib/publish';
import { loadAuth } from './lib/members';
import { loadSetlistOverride } from './lib/setlistEdit';
import { initWakeLock } from './lib/wakeLock';
import './lib/demo';
import './styles.css';
import './themes.css';


initWakeLock();
void initEditor();
void loadAuth();
void loadCatalog()
  .then(() => Promise.all([loadOverrides(), loadSetlistOverride()]))
  .finally(() => { overridesReady.value = true; });
render(<App />, document.getElementById('app')!);
