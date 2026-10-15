# Multi-región, fase C: datos de Alicante (plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Pasos con casillas (`- [ ]`).

**Objetivo:** que `--region alicante` produzca todos los datos del pipeline y su exportación, con Marbella intacta.

**Arquitectura:** adaptadores genéricos nuevos (`arcgis`, `arcgis_por_anio`, `wfs`, `zip_geojson`, `arcgis_mfe`, `iepnb_mfe`) registrados como los de REDIAM; un tipo de capa nuevo `mfe` (vegetación normalizada) y otro `ccaa`. Las regiones sin `capas.mfe` (Marbella) siguen por el camino actual de `vegetacion.py`, sin cambiar un píxel. El manifest gana campos del contrato de la fase B (`ccaa`, `avisos`, `especies[].calibrado`, y `atribuciones`/`legal.texto_protegido`/`legal.chip_sitio_restringido` solo si la región los declara); el dorado los trata como claves nuevas permitidas.

**Entradas:** spec `docs/specs/2026-10-15-multi-region-alicante-design.md` §3, §5, §6 · `docs/investigacion/2026-10-14-region-alicante.md` §2–§5 · `docs/investigacion/2026-10-15-sondeo-fuentes-alicante.md` · contrato de datos de `docs/superpowers/plans/2026-10-15-multi-region-fase-b-app.md`.

**Reglas:** TDD en adaptadores con respuestas grabadas (`pipeline/tests/fixtures/`); `git add` con rutas explícitas; solo `pipeline/` y este plan; nunca datos inventados (fuente caída → NODATA + `avisos[]`).

---

### Tarea 1: adaptadores genéricos (TDD)
**Archivos:** `pipeline/setas_pipeline/adaptadores/{generico.py,mfe.py,__init__.py}`, `pipeline/tests/test_adaptadores_genericos.py`, `pipeline/tests/fixtures/*`.
- [ ] `mapear(gdf, cfg, tipo)`: columnas del contrato desde `campos` (columna de la fuente), `valores` (constantes), `clase` (`{campo, valores, defecto}`; filas sin clase fuera), `filtro` (`{campo: [valores]}`), `dedup`. En `senderos`, `tipo` = `rutas.clasificar_ref(ref, name)` si no se da.
- [ ] `arcgis`: ArcGIS REST `query` por teselas (`resultOffset`/`resultRecordCount`, `f=geojson`, `inSR/outSR=25830`), una o varias `capas`; registrado para `protegidos`, `restricciones`, `montes_publicos`, `senderos`, `pasos_publicos`.
- [ ] `arcgis_por_anio`: `capas_anio {año: id}` dentro de la ventana `ctx.desde_anio` → `incendios` (`anio`, `fuente`).
- [ ] `wfs`: GeoServer GetFeature paginado (`startIndex`/`count`, `srsName=EPSG:25830`, GeoJSON) por teselas; o, con `formato: gml`, una petición con filtro FES `PropertyIsEqualTo` (OR) leída con geopandas (IGN, que no sirve JSON). Registrado para los tipos anteriores y `ccaa`.
- [ ] `zip_geojson`: descarga en caché (`raw/<cache>/`), lee el miembro `miembro` del zip, recorta a la zona y mapea.
- [ ] Tipo `ccaa` (`id`, `nombre`) y tipo `mfe` (`id`, `arbol`, `fcc`, `estado`, `cubierta`, `anio_incendio`, `artificial`).
- [ ] `iepnb_mfe`: comprobación de salud (reintentos) y, si responde, el WFS actual (arbolado + desarbolado) normalizado. `arcgis_mfe` (ICV capa 41): `sp1_nom_ifn` por prefijo → clase `ARBOL` (Juniperus → `sabina`), `fccarb`, `e1_definicion`, `tipestr_definicion` → `CUBIERTA`, `usos_general == Artificial`.
- [ ] Commit.

### Tarea 2: vegetación por región con NODATA y avisos (TDD)
**Archivos:** `pipeline/setas_pipeline/vegetacion.py`, `ejecutar.py`, `incendios.py`, `edificado.py`, `avisos.py` (nuevo), tests.
- [ ] `construir_mfe_region(malla, region)`: fuentes de `capas.mfe` en orden; cada una con `ambito` (`zona` o id de CCAA de la capa `ccaa`). Si la primera (`zona`) responde, las `respaldo: true` se saltan. Si falla: aviso y respaldo; las celdas sin ninguna fuente quedan 255 en `arbol/fcc/estado/cubierta` (y −1 en `dist_matorral`). Escribe los 5 tif y `out/avisos.json` (`{"mfe": [...]}`).
- [ ] `ejecutar`: con `capas.mfe`, los pasos vegetación/estructura/cubierta usan ese camino; incendios y edificado toman `anio_incendio`/`artificial` del mismo MFE normalizado. Sin `capas.mfe`, nada cambia.
- [ ] Test: celda NODATA 255 no se puntúa como `sabina` (idoneidad 0).
- [ ] Commit.

### Tarea 3: exportación (ccaa, avisos, calibrado) sin romper Marbella (TDD)
**Archivos:** `exportar.py`, `dorado.py`, `region.py`, `regiones/marbella.yaml`, tests.
- [ ] `exportar ccaa` → `ccaa.pmtiles` (capa `ccaa`, `id`, `nombre`, z 4–10) si la región declara `capas.ccaa`; manifest `ccaa`.
- [ ] Manifest: `avisos` (de `out/avisos.json`), `especies[].calibrado` (n ≥ 10 y lift de validación), `atribuciones` y `legal.texto_protegido`/`chip_sitio_restringido` solo si la región los declara.
- [ ] `legal.ccaa[].id` en la lista cerrada de la fase B (`andalucia`, `comunitat_valenciana`, `region_murcia`, `castilla_la_mancha`) validado en `region.py`; Marbella pasa de `AND` a `andalucia` y `norma` a la sigla `BOJA` (el texto no cambia; `verificado` sigue `false`, decisión pendiente de Alexander).
- [ ] `dorado.MANIFEST_NUEVAS` += `ccaa`, `avisos`, `atribuciones`; `MANIFEST_ESPECIE_NUEVAS` += `calibrado`. Regresión de Marbella en verde.
- [ ] `citas`: taxones extra por región (`citas.taxa`), para no cambiar las citas de Marbella.
- [ ] Commit.

### Tarea 4: `regiones/alicante.yaml` y especies
**Archivos:** `pipeline/regiones/alicante.yaml`, `pipeline/especies.yaml`, `pipeline/fuentes.yaml` (mapeo_suelo), test de carga.
- [ ] Config según INV §5 corregida con el sondeo: origen 38.3452, −0.4810; zona como Marbella (radio 230 km); extractos valencia + murcia + castilla-la-mancha; capas por §3 (ICV, IDERM, MITECO BDN para CLM, EFFIS, OSM); `ccaa` del IGN; legal por CCAA con `verificado` exacto del sondeo (CV 6 kg sin verificar; CLM 5 kg/10 L verificado, vigencia pendiente; Murcia sin norma ni cupo; Mariola 4 kg verificado, Font Roja sin verificar, en el texto); restricciones = espacios protegidos tipo `espacio_protegido` («puede haber limitaciones propias; consulta su PRUG»); montes ICV 25 + IDERM MONTES; edificado 03/46/30/02; citas centradas en Alicante.
- [ ] Especies: activas (sin `tricholoma_terreum`) y `sin_habitat`; perfiles nuevos al final de `especies.yaml` (HEURÍSTICOS, fuentes INV §2); `lactarius_sanguifluus` ajustado solo vía `overrides_especies` (Marbella no cambia).
- [ ] `mapeo_suelo`: Keuper/yesos → básico, rodeno/Buntsandstein → ácido, solo con palabras que no existan en los DESC_UNIT de Marbella (comprobado con su caché).
- [ ] Commit.

### Tarea 5: ejecución completa y presupuesto
- [ ] `ejecutar todo --region alicante` (en primer plano, con sondeo), `citas`, `exportar todo --region alicante`, `exportar regiones`.
- [ ] Medir bytes publicados: Marbella + Alicante + modelo ≤ 950 MB. Si no, palancas 1–3 del spec §5; si sigue por encima, parar e informar.
- [ ] Revisar calibración (n, lift) y marcar `calibrado`; `overrides_especies` solo si GBIF lo justifica.
- [ ] `uv run pytest` (Marbella en verde), `code-review` high y arreglos.
