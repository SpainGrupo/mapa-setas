# Fase 8: acceso, rutas, satélite, más especies y mejoras del modelo

Aprobado por Alexander el 2026-10-14 ("adelante con todo"). La publicación en GitHub Pages **no** está incluida y sigue necesitando su sí explícito.

## Tanda A (en paralelo)
1. **Pipeline acceso** (`pipeline/setas_pipeline/acceso.py`):
   - Coste a pie con la función de Tobler sobre la pendiente del MDT25, más rápido por sendero o pista (OSM `path`/`track`/`footway`/`bridleway`) y con penalización campo a través.
   - Las fuentes son los puntos de vía transitable en coche (`tertiary`…`unclassified`, `residential`, `service`, `track` con `tracktype=grade1/2` o sin restricción `motor_vehicle=no`).
   - Salidas: tiempo a pie (min), desnivel acumulado de subida, id del aparcamiento de origen y raster de dirección para reconstruir el trazado, con `aparcamientos.json` (lat, lon y nombre de la vía).
   - Binario compacto para la app, descargable sin cobertura.
2. **Pipeline rutas**:
   - Relaciones OSM `route=hiking/foot` (GR/PR/SL con `ref`, `name`, `network`) y senderos de uso público de REDIAM (WFS; verificar URL y licencia).
   - Todo se convierte en `rutas.pmtiles` y entra en el manifest.
3. **Guía**: fichas nuevas para *Amanita ponderosa* (gurumelo), *Pleurotus eryngii* (seta de cardo) y *Terfezia* (criadillas), con fotos CC y "No confundir con" (gurumelo frente a *A. verna*/*phalloides*), más alias de *L. sanguifluus*. Validador en verde.
4. **App, parte 1**:
   - Capa satélite con la ortofoto PNOA del IGN (WMTS, CC BY 4.0) como alternativa al mapa base, solo con cobertura.
   - Foto de cada seta en el selector de especie.

## Tanda B (cuando terminen la investigación y la Tanda A)
5. **Modelo**:
   - Se aplican las mejoras priorizadas de `docs/investigacion/2026-10-14-factores-y-trucos.md` (TWI, distancia a arroyos, cubierta de copa, incendios…).
   - Especies nuevas en `especies.yaml`: níscalo, níscalo de sangre, rebozuelo, gurumelo, y parasol, cardo y criadillas con la capa de pastizal y matorral de SIOSE.
   - Recalibración con GBIF y exportación.
6. **App, parte 2**:
   - Pulsación larga → ficha "Acceso" (aparcamiento, tiempo y desnivel a pie, trazado aproximado, "Cómo llegar en coche" en Google Maps, "Abrir en otra app", "Guardar sitio").
   - Capa "Rutas y caminos".
   - "Cómo llegar" en Mis sitios.
7. **Reconocedor**: vocabulario y reglas de seguridad para las especies nuevas (gurumelo → mortales amanitoides).

## Puertas
`code-review` high en cada tanda, `max` en la seguridad del reconocedor, e2e en verde e `impeccable` rápido al final.
