import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages sert le site sous /Zovy-Tononkira/
const base = process.env.BASE_PATH ?? '/Zovy-Tononkira/';
// Démo (artefact) : pas de service worker (interdit dans le cadre de l'artefact)
const demo = process.env.VITE_DEMO === '1';

export default defineConfig({
  base,
  plugins: [
    preact(),
    VitePWA({
      // 'prompt' : jamais de rechargement automatique (risque en plein morceau).
      registerType: 'prompt',
      disable: demo,
      manifest: {
        name: 'Zovy Tononkira',
        short_name: 'Tononkira',
        description: 'Paroles du groupe Zovy — scène et répétition',
        lang: 'fr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#121212',
        theme_color: '#121212',
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
