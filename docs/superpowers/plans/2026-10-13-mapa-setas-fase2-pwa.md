# Mapa de setas — Plan Fase 2: PWA offline

> **For agentic workers:** ejecutar tarea a tarea (executor Opus). Este plan fija las decisiones de arquitectura y los criterios de aceptación. El código lo escribe el ejecutor con TDD donde haya lógica pura.

**Goal:** Web app instalable en el móvil que muestra el mapa topográfico de la zona y las capas de idoneidad por especie, con filtro "lejos del acceso", GPS y "mis sitios". Debe funcionar sin cobertura una vez descargados los datos.

**Spec:** `docs/specs/2026-10-13-mapa-setas-design.md` (§9, §10). Entradas: `pipeline/data/out/*.tif` de la Fase 1.

## Decisiones (cerradas)

- **Stack:** Vite + TypeScript sin framework, MapLibre GL JS, `pmtiles` (protocolo), `vite-plugin-pwa` (Workbox) para el app shell, `idb-keyval` para IndexedDB y Vitest para la lógica pura. Versiones fijadas exactas en `package.json`.
- **Estructura:** `app/` (frontend) y `pipeline/setas_pipeline/exportar.py` (genera los datos de la app).
- **Mapa base:** extracto de Protomaps (`pmtiles extract` del build diario público) recortado al bbox de la zona, con zoom máximo 15. Se le añaden **curvas de nivel cada 20 m** (de `altitud`, IGN) como capa vectorial propia y un **sombreado (hillshade)** raster de 100 m. Antes de fijarlo hay que medir el tamaño total: el objetivo es menos de 600 MB y el límite 1 GB. Si se pasa, el zoom máximo baja a 14.
- **Capas de idoneidad:** teselas raster PNG en PMTiles, una por especie y umbral de distancia (0, 200, 400, 600, 800 y 1000 m). Las celdas por debajo del umbral salen transparentes. Zooms 8–13, con colormap secuencial verde y 0 transparente. El control deslizante de la app cambia de una capa a otra, así que va en saltos de 200 m (cambio aceptado respecto al spec, que hablaba de 0–1000 continuo).
- **Espacios protegidos:** capa vectorial de contornos (PMTiles) con su nombre en el popup.
- **Offline:**
  - El app shell va por Workbox.
  - Los `.pmtiles` grandes **no** van por la caché del service worker, porque usan peticiones de rango. Hay un botón **"Descargar mapas para uso sin cobertura (X MB)"** que los guarda en **OPFS** (`navigator.storage.getDirectory()`) y pide `navigator.storage.persist()`.
  - La instancia PMTiles usa una `Source` propia que lee del Blob de OPFS si existe y, si no, hace fetch por HTTP.
  - La app muestra el estado: descargado, tamaño y fecha.
- **Mis sitios:**
  - En IndexedDB se guarda `{id, lat, lon, estrellas 1–3, nota, especie, fecha, fotoBlob?}`.
  - Se crean con "aquí" (GPS) o con una pulsación larga en el mapa.
  - Lista con filtro por especie, edición y borrado.
  - Exportación e importación en GPX (puntos `wpt` con `name`/`desc`) y JSON (con las fotos en base64).
- **GPS:** `watchPosition` con el punto y el círculo de precisión, y un botón "centrar en mí".
- **Pantallas v1:** Mapa (selector de especie, control de distancia, capas, GPS) · Mis sitios · Ajustes/Descargas. La Zona (semáforo), la Guía y Reconocer quedan como pestañas deshabilitadas con el texto "próximamente": son las fases 3–5.
- **Aviso de seguridad:** banda fija en Ajustes y en el primer arranque: "No consumas ninguna seta sin confirmación de un experto". Lleva la atribución de datos (IGN CC BY 4.0, © MITECO MFE, IGME, REDIAM CC BY 4.0, © OpenStreetMap ODbL, Protomaps).
- **Alojamiento:** de momento solo en local (`php -S 127.0.0.1:8765 -t app/dist`). **Publicar en GitHub Pages requiere la confirmación explícita de Alexander** (repositorio y URL públicos), así que no se hace en esta fase sin preguntar.
- **Herramientas nuevas:** `tippecanoe` y `pmtiles` (Homebrew). Antes de instalarlas hay que leer `Z.Funciones Base/README.md` y añadirlas a su inventario y a `setup.sh`.

## Tareas

1. **exportar.py**: genera las teselas de idoneidad por especie y umbral (PNG → MBTiles/PMTiles), las curvas de nivel (GeoJSON → tippecanoe → PMTiles), el sombreado, los espacios protegidos y un `manifest.json` con archivos, tamaños, fecha y lista de especies. Tests: colormap (0 transparente, 100 = color máximo) y máscara por umbral de distancia.
2. **Mapa base**: extracto de Protomaps y medición del tamaño. **Se para y se informa** si supera 1 GB.
3. **Esqueleto de la app**: Vite, MapLibre con el estilo base, pmtiles, manifest PWA, iconos e instalación.
4. **Capas**: selector de especie, control de distancia, leyenda y contornos protegidos con popup.
5. **Offline**: descarga a OPFS, Source desde OPFS, `persist()` y estado. Test unitario de la Source con un Blob (lectura de rango correcta).
6. **GPS y Mis sitios**: CRUD en IndexedDB y exportación/importación GPX y JSON. Tests: ida y vuelta GPX y JSON (con caracteres especiales en las notas).
7. **e2e** (Playwright, viewport móvil): carga → descarga de mapas → **modo offline** (`context.setOffline(true)`) → recarga → el mapa base y la capa de caesarea se ven → crear un sitio → exportar GPX. Guardar capturas en `app/e2e/capturas/`.
8. **Puerta**: `code-review` high y prueba e2e en verde.

## Criterios de aceptación

- `npm run build` sin errores y `npx vitest run` en verde.
- e2e offline en verde con capturas.
- Tamaño total de los datos offline medido e indicado en el manifest y en Ajustes.
- Ningún secreto en el repositorio.
