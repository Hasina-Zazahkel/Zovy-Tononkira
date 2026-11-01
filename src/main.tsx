import { render } from 'preact';
import { App } from './app';
import { loadCatalog } from './lib/catalog';
import { loadOverrides } from './lib/overrides';
import { initEditor } from './lib/publish';
import { initWakeLock } from './lib/wakeLock';
import './styles.css';

initWakeLock();
void initEditor();
void loadCatalog().then(loadOverrides);
render(<App />, document.getElementById('app')!);
