# Stage 02_pwa — Contract (ICM Layer 2)

The control point for this stage. Define exactly what it reads, does, and writes. The **Inputs table is the most important part** — name the specific files (and sections) to load, nothing more.

## Inputs
- Layer 4 (working):   ../01_terreno/output/ (capas)
- Layer 3 (reference): ../../knowledge/index.md (solo los conceptos pertinentes)
- Layer 3 (reference): ../../_config/conventions.md

## Process
Construir la PWA con MapLibre y PMTiles offline, capas, GPS y mis sitios (IndexedDB). TODO: plan detallado se escribe al cerrar la Fase 1.

## Outputs
- app desplegable en GitHub Pages

## Verify
Puerta de revisión: code-review (high) + prueba e2e en modo avión. Antes de dar la etapa por hecha, verification-before-completion.

## «Explorar aquí» y «Mis observaciones» (2026-10-25)
Spec: `../../docs/specs/2026-10-20-explorar-aqui-design.md`. Plan: `../../docs/superpowers/plans/2026-10-25-explorar-aqui.md`. Prueba manual en iPhone: `explorar-fase0-iphone.md` (nada de esto se puede automatizar).

- **Inputs:** `app/src/explorar-geo.ts` (geometría pura: marcas AR, barrido, FOV provisional), `observaciones-datos.ts` (tipo, validación, GeoJSON), `explorar.ts` (puntuación y mejor dirección, pura), `explorar-red.ts` (petición y respuesta de `POST /explorar`), `explorar-resultado.ts` (aviso de privacidad, cola de pendientes, lista de direcciones), `observaciones-resumen.ts`; la UI en `explorar-ui.ts`, `camara.ts`, `observaciones-ui.ts`. Datos de microzonas y cotas de la región (`micro.json`, MDT) ya descargados.
- **Outputs:** observaciones en IndexedDB (base `setas-observaciones`; fotos JPEG ≤ 400 KB sin EXIF, dentro del registro), nota enlazada en la ruta que se graba (waypoint en el GPX), sitio en Mis sitios, exportación `observaciones-AAAA-MM-DD.geojson` (sin fotos). El pipeline (`01_terreno`) **no** consume los hallazgos todavía: decisión aparte.
- **Verify:** `cd app && npm test && npx tsc --noEmit && npm run build` y `npm run e2e` completo (el de «Explorar aquí» es `e2e/explorar.e2e.mjs`: cámara y brújula falsas, Worker simulado con `route`). Ninguna razón ni texto de pantalla contiene «comest».
- **Reglas:**
  - Nada sale a la red sin pulsar «Analizar» y aceptar el aviso de privacidad (la primera vez; `localStorage` con try/catch). Sin conexión la observación queda `pendiente` y se analiza al volver la red.
  - Coordenadas enviadas a 0,01°; fotos de 1024 px, JPEG 0,8 (bajando a 0,7/0,6 si pasa de 400 KB), re-codificadas en canvas.
  - Lo desconocido se muestra «sin dato»; ningún componente sin dato (`no_se_ve`, confianza baja, sin perfil) suma ni resta en la puntuación.
  - La mejor dirección la decide la app (`explorar.ts`: pesos árbol 0,5 / copas 0,2 / humedad 0,2 / sotobosque 0,1; total = 0,5·observado + 0,5·modelo); Gemini solo describe.
  - En apaisado **no hay disparo automático** del barrido (`beta` cambia de eje): queda el botón «Foto ahora». El campo de visión (`FOV_H`/`FOV_V`) es **provisional**, sin medir en iPhone (fase 0).
