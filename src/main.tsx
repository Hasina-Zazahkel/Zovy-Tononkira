import { render } from 'preact';
import { App } from './app';
import { loadCatalog } from './lib/catalog';
import { initWakeLock } from './lib/wakeLock';
import './styles.css';

initWakeLock();
void loadCatalog();
render(<App />, document.getElementById('app')!);
