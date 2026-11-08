import { createHash } from 'node:crypto';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Content-Security-Policy por <meta> (GitHub Pages no deja poner cabeceras). Solo en el build: en `vite` (dev) el
 * HMR necesita ws: y scripts que no queremos permitir en producción. Los <script> en línea (el del tema) entran por
 * su hash, calculado aquí, así que editar ese script no rompe nada. Lo que protege de verdad es script-src: sin
 * 'unsafe-inline' ni 'unsafe-eval', una inyección de HTML no puede ejecutar código. Clarity (tras aceptar cookies)
 * necesita clarity.ms; onnxruntime, 'wasm-unsafe-eval'; MapLibre, workers blob:. connect-src e img-src quedan en
 * https: porque el mapa pide teselas (IGN, Open-Meteo, Worker…) a varios dominios.
 * Auditoría de seguridad 2026-11-08 (docs/investigacion/2026-11-08-auditoria-seguridad.md).
 */
export function politicaCsp(hashes: string[]): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval' ${hashes.join(' ')} https://www.clarity.ms https://*.clarity.ms`.replace(/\s+/g, ' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: data: blob:",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "media-src 'self' data: blob:",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

function cspMeta(): Plugin {
  return {
    name: 'setas-csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
          .map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
        const meta = `<meta http-equiv="Content-Security-Policy" content="${politicaCsp(hashes)}" />`;
        return html.replace(/(<meta charset="utf-8" \/>)/i, `$1\n  ${meta}`);
      },
    },
  };
}

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
  // El reconocedor (onnxruntime-web) hace import() dinámico de su arranque .mjs: workers como módulos ES.
  worker: { format: 'es' },
  plugins: [
    cspMeta(),
    VitePWA({
      // «prompt»: una versión nueva queda en espera y es src/main.ts quien la activa (skipWaiting) en cuanto puede: al
      // arrancar, al volver a primer plano y cada 30 min busca versión y, si hay, guarda el estado de navegación y recarga.
      // Si hay una grabación de ruta, el Modo campo o «Navegar aquí» en marcha, espera (con aviso) a que terminen. No se
      // usa «autoUpdate» porque activaría la versión nueva a ciegas, también en mitad de una grabación.
      // Registro: el plugin no deja pasar `updateViaCache: 'none'`; el valor por defecto ('imports') ya revalida sw.js en
      // cada comprobación (no sale de la caché HTTP) y index.html lo sirve el precache del SW, no la red.
      registerType: 'prompt',
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
        background_color: '#eef1ec',
        theme_color: '#eef1ec',
        icons: [
          { src: 'iconos/icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'iconos/icono-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'iconos/icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,pbf,json,webmanifest,woff2}', 'guia/miniaturas/*.jpg'],
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
        skipWaiting: false,   // la activa main.ts cuando no hay nada en marcha (mensaje SKIP_WAITING del modo «prompt»)
      },
    }),
  ],
});
