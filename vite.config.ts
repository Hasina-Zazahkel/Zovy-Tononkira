import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

// Configuration de l'app (editions/zovy)
const editionId = process.env.EDITION ?? 'zovy';
const edition = JSON.parse(readFileSync(new URL(`./editions/${editionId}/edition.json`, import.meta.url), 'utf8'));
// GitHub Pages sert le site sous /<dépôt>/
const base = process.env.BASE_PATH ?? edition.basePath;
// Démo (artefact) : pas de service worker (interdit dans le cadre de l'artefact)
const demo = process.env.VITE_DEMO === '1';

export default defineConfig({
  base,
  publicDir: edition.publicDir,
  define: { __EDITION_ID__: JSON.stringify(editionId) },
  plugins: [
    preact(),
    { name: 'edition-html', transformIndexHtml: (html: string) => html.replace(/<title>[^<]*<\/title>/, `<title>${edition.name}</title>`).replace(/(<meta name="theme-color" content=")[^"]*/, `$1${edition.themeColor}`) },
    VitePWA({
      // 'prompt' : jamais de rechargement automatique (risque en plein morceau).
      registerType: 'prompt',
      disable: demo,
      manifest: {
        name: edition.name,
        short_name: edition.shortName,
        description: edition.description,
        lang: 'fr',
        // Identifiant d'app explicite par édition (Zovy : identique à l'implicite, donc aucune réinstallation)
        id: edition.manifestId ?? base,
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: edition.themeColor,
        theme_color: edition.themeColor,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,json,webmanifest,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: { target: 'es2022' },
});
