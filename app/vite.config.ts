import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
  // El reconocedor (onnxruntime-web) hace import() dinámico de su arranque .mjs: workers como módulos ES.
  worker: { format: 'es' },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['iconos/*.png', 'fonts/**/*.pbf', 'sprites/*'],
      manifest: {
        name: 'Mapa de setas',
        short_name: 'Setas',
        description: 'Mapa offline de idoneidad para setas en la zona.',
        lang: 'es',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f4f1ea',
        theme_color: '#1b4332',
        icons: [
          { src: 'iconos/icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'iconos/icono-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'iconos/icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,pbf,json,webmanifest}', 'guia/miniaturas/*.jpg'],
        // La guía: especies.json e indice.json van en el precache; las fotos (~18 MB), en su propia caché
        // «guia-fotos», que rellena la página (ver src/guia-ui.ts) y aquí se sirve con CacheFirst.
        globIgnores: ['data/**', 'guia/fotos/**'],
        // Las miniaturas se piden con ?v=<hash> (como las fotos); el precache ya versiona por su cuenta.
        ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^v$/],
        runtimeCaching: [{
          urlPattern: /\/guia\/fotos\/[^/]+\.jpg(\?.*)?$/,
          handler: 'CacheFirst',
          options: { cacheName: 'guia-fotos', cacheableResponse: { statuses: [200] } },
        }, {
          // Ortofoto PNOA (vista Satélite, solo con conexión): guarda las ~500 teselas más recientes para que
          // al volver a una zona vista no se pidan otra vez. No sustituye a la descarga de mapas.
          urlPattern: /^https:\/\/www\.ign\.es\/wmts\/pnoa-ma\?/,
          handler: 'CacheFirst',
          options: { cacheName: 'pnoa-teselas', cacheableResponse: { statuses: [200] },
            expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 90 } },
        }],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\/data\//, /\/guia\/fotos\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
});
