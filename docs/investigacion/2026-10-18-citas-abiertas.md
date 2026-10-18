# Citas de fuentes abiertas: inventario y hueco de níscalos en San Roque, 18/10/2026

Pregunta de Alexander: ¿hay más datos abiertos de dónde sale cada seta en Marbella y Alicante, y sirven para validar y afinar el modelo? Wikiloc queda fuera: sus condiciones prohíben el acceso con programas y la extracción sistemática (ver `2026-10-18-wikiloc-setas.md`).

**Respuesta corta:**
- Las fuentes abiertas ya están en el pipeline y al día. Desde la descarga del 15/10, GBIF tiene 0 registros nuevos de nuestras especies en los dos radios. iNaturalist (research y needs_id) suma 2 altas y 3 bajas, y ninguna llega a la calibración. Mushroom Observer no tiene ninguna cita de nuestras especies en las dos regiones. iNaturalist «casual» aporta 1 cita útil.
- **No se integra nada nuevo**: la n no es relevante. La calibración y el dorado no cambian.
- **El hueco de *Lactarius* en Pinar del Rey / San Roque es real y lo confirman los datos abiertos.** El pipeline ya tiene 6 citas de *L. deliciosus* y *L. sanguifluus* a menos de 4 km de Pinar del Rey (iNaturalist y Observation.org), y el modelo les da 0 a todas. **Causa: la altitud.** Los perfiles de *Lactarius* empiezan en 200 m y el pinar está entre 30 y 200 m. El mapa de árbol detecta bien el pino. El suelo resta, pero no es lo que bloquea.
- Es una decisión de modelo, no una corrección de datos. Queda como **propuesta**: un override solo para Marbella, con números abajo. No se ha aplicado.

## 1. Fuentes revisadas (términos, robots y uso)

| Fuente | Acceso automatizado | Licencia | Qué se hizo |
|---|---|---|---|
| **GBIF** (api.gbif.org) | API pública y abierta. robots.txt solo bloquea `/v1/image/unsafe` | Por registro: CC0, CC BY o CC BY-NC | Por especie, recuento con faceta `datasetKey` en el mismo polígono que `citas.py`, comparado con la caché `raw/citas/gbif_*.json` del 15/10 |
| **iNaturalist** API v1 | La documentación de la API dice que está «para desarrollo de aplicaciones, no para scraping»: máximo 100 peticiones/min, pide ≤60/min y <10.000/día. El robots.txt de api.inaturalist.org cierra las URL con `?` a rastreadores; el uso documentado de la API es este. La señal de contenido de la web dice `ai-train=no`, y aquí no se entrena ningún modelo de IA | Por observación (CC0, CC BY, CC BY-NC…). Algunas no tienen licencia (todos los derechos reservados) | Unas 300 peticiones a ~1/s: recuentos por calidad, ids actuales frente a la caché y descarga de las «casual» (pocas) |
| **Mushroom Observer** API2 | GET sin clave. Su README pide no usar la API para extraer datos en bloque (para eso están sus CSV) y limitar a 20 peticiones/min. Su robots.txt cierra la web a rastreadores genéricos | Sus datos van a GBIF como dataset `d714382d…` (CC BY-NC 4.0) | 2 peticiones con recuadro (una por región), `detail=low`, separadas 6 s. No se descargaron los CSV |
| **Observation.org** | Su API v1 pide OAuth con cuenta y la web tiene anti-bot (decisión anterior, sin cambios) | Dataset GBIF `8a863029…`, CC BY-NC 4.0 | Solo vía GBIF, como hasta ahora (0 nuevas) |
| **BDBCV** (Banc de Dades de Biodiversitat de la Comunitat Valenciana) | Ya llega por GBIF (`95e635d4…`, CC BY-NC 4.0). En Alicante es el dataset con más peso (401 citas) | CC BY-NC 4.0 | Sin cambios |
| **IMBA** (Andalucía) | Sin servicio de puntos. Solicitud a REDIAM PENDIENTE desde el 15-16/10 | — | Sin cambios |

## 2. Inventario por región y especie

- **Citas** = registros en `citas.geojson` (radio de 200 km, ya deduplicados).
- **Calibran** = citas en tierra dentro de la zona con precisión ≤1 km o sin declarar (`calibracion.json` → n).
- **Nuevas**: GBIF = recuento actual menos caché; iNat = altas menos bajas en research y needs_id.
- **Casual útiles**: no cautivas, con fecha, foto y licencia CC, precisión ≤1 km y en tierra de la zona.
- **MO** = citas de Mushroom Observer: 0 en todas las especies de las dos regiones. En los recuadros solo hay 27 observaciones, ninguna de nuestras especies.

### Marbella (las 22 especies de `sitios.json`)

| especie | citas | por origen | licencia | calibran | GBIF nuevas | iNat nuevas | iNat casual (todas / útiles) |
|---|---|---|---|---|---|---|---|
| boletus_aereus | 61 | gbif 24, observation 20, inat 11, literatura 4, foro 2 | CC 50, otra 11 | 14 | 0 | 0 | 1 / 1 |
| boletus_aestivalis | 22 | observation 15, gbif 4, literatura 2, inat 1 | CC 20, otra 2 | 3 | 0 | 0 | 1 / 0 (cautiva, exposición en Sevilla) |
| boletus_edulis | 7 | gbif 4, literatura 2, observation 1 | CC 5, otra 2 | 3 | 0 | 0 | 0 |
| boletus_pinophilus | 1 | gbif 1 | CC 1 | 0 | 0 | 0 | 0 |
| amanita_caesarea | 60 | observation 26, inat 15, gbif 9, literatura 8, foro 2 | CC 44, otra 16 | 31 | 0 | 0 | 0 |
| lactarius_deliciosus | 87 | observation 40, inat 34, gbif 13 | CC 78, otra 9 | 24 | 0 | 0 | 0 |
| lactarius_sanguifluus | 33 | gbif 14, inat 10, observation 9 | CC 29, otra 4 | 10 | 0 | 0 | 1 / 0 (sin foto, Doñana) |
| cantharellus_cibarius | 16 | gbif 9, inat 4, observation 3 | CC 16 | 9 | 0 | 0 | 0 |
| amanita_ponderosa | 15 | gbif 7, inat 5, observation 3 | CC 14, otra 1 | 2 | 0 | 0 | 0 |
| macrolepiota_procera | 155 | inat 70, observation 66, gbif 19 | CC 130, otra 25 | 53 | 0 | 0 | 1 / 0 |
| pleurotus_eryngii | 74 | observation 35, inat 25, gbif 14 | CC 65, otra 9 | 20 | 0 | 0 | 0 |
| terfezia_arenaria | 3 | observation 2, inat 1 | CC 2, otra 1 | 0 | 0 | 0 | 0 |
| suillus_collinitus | 76 | inat 41, observation 23, gbif 12 | CC 63, otra 13 | 35 | 0 | 0 | 1 / 0 (sin fecha) |
| lepista_nuda | 164 | inat 75, observation 65, gbif 24 | CC 136, otra 28 | 35 | 0 | 0 | 1 / 0 (cautiva) |
| agaricus_campestris | 94 | inat 55, observation 21, gbif 18 | CC 73, otra 21 | 24 | 0 | +1 | 2 / 0 |
| hydnum_repandum | 20 | gbif 10, observation 6, inat 4 | CC 16, otra 4 | 9 | 0 | 0 | 0 |
| morchella_spp | 62 | gbif 30, inat 16, observation 16 | CC 57, otra 5 | 12 | 0 | 0 | 0 |
| suillus_bellinii | 51 | observation 37, inat 14 | CC 46, otra 5 | 11 | 0 | 0 | 0 |
| suillus_luteus | 34 | observation 20, inat 11, gbif 3 | CC 32, otra 2 | 2 | 0 | 0 | 0 |
| suillus_granulatus | 29 | inat 18, observation 6, gbif 5 | CC 20, otra 9 | 9 | 0 | 0 | 0 |
| russula_cyanoxantha | 42 | gbif 30, inat 8, observation 4 | CC 38, otra 4 | 12 | 0 | 0 | 0 |
| tricholoma_portentosum | 2 | gbif 2 | CC 2 | 1 | 0 | 0 | 0 |

### Alicante (las 11 especies de `sitios.json`)

| especie | citas | por origen | licencia | calibran | GBIF nuevas | iNat nuevas | iNat casual (todas / útiles) |
|---|---|---|---|---|---|---|---|
| boletus_aereus | 16 | inat 8, gbif 7, observation 1 | CC 10, otra 6 | 5 | 0 | 0 | 0 |
| lactarius_deliciosus | 70 | gbif 34, inat 25, observation 11 | CC 60, otra 10 | 18 | 0 | −3 (borradas) | 2 / 0 (mercado de Valencia; sin fecha) |
| lactarius_sanguifluus | 144 | gbif 102, inat 25, observation 17 | CC 135, otra 9 | 65 | 0 | 0 | 0 |
| pleurotus_eryngii | 42 | inat 19, observation 16, gbif 7 | CC 35, otra 7 | 11 | 0 | 0 | 0 |
| hygrophorus_latitabundus | 27 | inat 10, observation 9, gbif 8 | CC 21, otra 6 | 10 | 0 | 0 | 0 |
| suillus_collinitus | 138 | inat 72, gbif 36, observation 30 | CC 123, otra 15 | 78 | 0 | 0 | 1 / 0 (sin fecha ni licencia) |
| lepista_nuda | 76 | observation 43, inat 26, gbif 7 | CC 65, otra 11 | 40 | 0 | 0 | 0 |
| agaricus_campestris | 56 | gbif 45, inat 7, observation 4 | CC 52, otra 4 | 29 | 0 | 0 | 0 |
| hydnum_repandum | 20 | inat 8, observation 8, gbif 4 | CC 19, otra 1 | 11 | 0 | 0 | 0 |
| morchella_spp | 65 | gbif 27, inat 21, observation 17 | CC 60, otra 5 | 32 | 0 | 0 | 0 |
| terfezia_claveryi | 0 | — | — | 0 | 0 | 0 | 0 |

**Lectura:**
- **Cifras nuevas en total**: GBIF 0 y 0; iNat +1 en Marbella (*Agaricus*, needs_id, sin precisión) y −3 en Alicante; MO 0; casual útiles 1 (un *B. aereus* en Málaga, 12/08/2026).
- **Las 3 bajas de Alicante** (*L. deliciosus*, iNat 404476513, 404476606 y 404476752) son observaciones borradas en iNaturalist. Tenían precisión de 2,3 a 4,5 km, así que no calibraban. Siguen en `citas.geojson` y en la capa de citas de la app, y con precisión ≤5 km pueden entrar en `sitios.json` como cita de «paraje». Se corrigen con un simple `uv run python -m setas_pipeline.citas --refrescar --region alicante` y regenerando después. **No se hizo** en este encargo para no rehacer toda la cadena por 3 registros que no calibran. Queda PENDIENTE para el próximo refresco de citas.
- Hay además un *Omphalotus olearius* nuevo en Alicante (iNat 408717461), fuera del inventario porque es una especie de «no confundir».
- **Las «casual» casi nunca sirven** en setas. Son cautivas (exposiciones micológicas, mercados), no tienen fecha o no tienen foto. Añadir `casual` a `citas.py` no compensa: sale 1 cita útil entre las dos regiones.
- **Registros sin licencia:** 225 de 679 observaciones iNat en la caché de Marbella y 121 de 379 en la de Alicante están «todos los derechos reservados». El pipeline las usa porque el uso es personal y no comercial (decisión anterior). Si la app se publicara, habría que filtrarlas.
- **Duplicados en Alicante:** hay celdas que reciben 5 o 6 citas de *L. sanguifluus* en fechas distintas (588 m, 764 m, 1048 m). Parecen pliegos de herbario o visitas repetidas al mismo punto e inflan la n de calibración. Queda solo anotado.

## 3. Hueco de *Lactarius* en Pinar del Rey / San Roque

### 3.1 Las citas abiertas lo confirman

Citas de *Lactarius* a ≤10 km de Pinar del Rey (36,245, −5,405) que ya están en `citas.geojson`:

| especie | fecha | lat, lon | precisión | origen |
|---|---|---|---|---|
| L. sanguifluus | 14/11/2024 | 36,2811, −5,4128 | 2 m | iNat (vía GBIF) |
| L. sanguifluus | 14/11/2024 | 36,2843, −5,4065 | 15 m | iNat (sin licencia) |
| L. sanguifluus | 24/11/2024 | 36,2693, −5,3870 | 146 m | iNat (vía GBIF) |
| L. deliciosus | 09/03/2025 | 36,2697, −5,3966 | 29 m | iNat (vía GBIF) |
| L. deliciosus | 09/02/2025 | 36,2696, −5,3961 | 358 m | iNat (vía GBIF) |
| L. deliciosus | 17/12/2016 | 36,2640, −5,3981 | sin declarar | Observation.org (vía GBIF) |

(Además hay 4 *L. chrysorrheus*, una especie de «no confundir».) Las 6 calibran y el modelo actual les da **0** a todas, también en la ventana de 500 m.

### 3.2 Capa por capa

Valores de las capas en los puntos del informe de Wikiloc y en el centro del pinar:

| punto | árbol (MFE) | cubierta satélite | altitud | suelo (IGME) | idoneidad deliciosus / sanguifluus |
|---|---|---|---|---|---|
| Pinar del Rey, centro (36,245, −5,405) | pino, FCC 60, fustal | 100 | 54 m | básico («Margas azules. Cuenca.») | 0 / 0 |
| Pinar del Rey, inicio ruta (36,251, −5,412) | alcornoque (pino en 154 de 441 celdas a 1 km) | 79 | 80 m | básico («Gravas, arenas y limos. Localmente margas…») | 0 / 0 |
| Ruta setera níscalos (36,274, −5,373) | pino, FCC 65, fustal | 100 | 148 m | básico («Margas azules») | 0 / 0 |

- **Mapa de árbol: bien.** El MFE marca pino y la cubierta satélite da 100. *Suillus bellinii* y *S. collinitus*, también de pino pero con altitud mínima 0, puntúan 45–85 en esas mismas celdas.
- **Altitud: es la causa.** Los dos perfiles tienen `altitud: {min: 200, opt_min: 500}` y `_f_altitud` da 0 por debajo de 200 m. Todo el pino a 1 km de Pinar del Rey está entre 31 y 108 m, y el de la ruta setera entre 99 y 198 m.
  - En toda la zona de Marbella, **9 de las 24** citas de *L. deliciosus* que calibran están por debajo de 200 m (4 bajo pino), y 4 de 10 de *L. sanguifluus*.
  - En la zona hay 7.517 celdas de pino por debajo de 200 m y el modelo da 0 en todas.
- **Suelo: resta, pero no bloquea.** «Margas azules» es marga de verdad: básico es correcto. Eso deja a *L. deliciosus* en ×0,3 y a *L. sanguifluus* en ×1. En cambio, «Gravas, arenas y limos. Localmente margas…» sale básico solo porque contiene «marga», y es ante todo grava y arena. Cubre unas 50.800 ha en Marbella y 7.600 ha en Alicante. Pasarla a «otro» cambiaría el suelo de todas las especies en mucha superficie, y la arena de un abanico deltaico puede ser silícea o calcárea según de dónde venga. Por eso no es una corrección clara de datos: queda como propuesta (§4.2).

### 3.3 Simulación (no aplicada)

Calibración de las dos especies con `calibracion.calibrar` y el perfil cambiado solo en memoria. Lift de ajuste, lift de validación por bloques (5 pliegues) y % de la zona ≥50:

| variante de altitud | región | L. deliciosus: n · ajuste · validación · % zona ≥50 | L. sanguifluus: n · ajuste · validación · % zona ≥50 |
|---|---|---|---|
| actual (min 200, opt_min 500) | Marbella | 24 · 5,79 · **4,36** · 0,7 % | 10 · 11,14 · **10,03** · 1,8 % |
| min 0, opt_min 200 | Marbella | 24 · 6,64 · **5,48** · 1,3 % | 10 · 9,08 · 9,27 · 2,2 % |
| min 0, opt_min 300 | Marbella | 24 · 7,19 · **5,90** · 1,2 % | 10 · 9,33 · 9,32 · 2,1 % |
| min 0, opt_min 100 | Marbella | 24 · 6,27 · 5,22 · 1,3 % | 10 · 13,3 · 24,72 · 2,3 % |
| actual | Alicante | 18 · 13,83 · **11,69** · 0,4 % | 65 · 2,38 · **2,50** · 11,7 % |
| min 0, opt_min 300 | Alicante | 18 · 10,72 · 8,55 · 0,5 % | 65 · 2,03 · 2,01 · 15,2 % |

- **En Marbella mejora *L. deliciosus***: la validación pasa de 4,36 a 5,5–5,9 y el % de citas con ≥50 se duplica (de 1 a 2 de 24). *L. sanguifluus* queda igual, con n = 10 y mucho ruido (la variante opt_min 100 da 24,7, pero no hay que fiarse de ella).
- **En Alicante empeora las dos.** Allí el pino carrasco bajo 200 m (38.064 celdas) es costero y casi no tiene citas. El cambio debe ir **solo en Marbella**.
- **Efecto en Pinar del Rey** con min 0 y opt_min 200 (puntuación en el punto / máximo a ±300 m): ruta setera 15/56 (*deliciosus*) y 52/55 (*sanguifluus*); Pinar del Rey centro 6/7 y 19/25.
  - El centro sigue bajo: a 54 m el factor de altitud vale 0,27, el suelo básico pesa ×0,3 en *L. deliciosus* y la orientación en llano es neutra.
  - Sin cambiar también el suelo o el tramo bajo de la altitud, el pinar central no llega a 50. La ruta setera, en cambio, entra.

## 4. Propuestas (decisión de modelo, para Alexander)

1. **Override de altitud para los *Lactarius* de Marbella** (en `regiones/marbella.yaml` → `overrides_especies`):
   ```yaml
   lactarius_deliciosus: {altitud: {min: 0, opt_min: 300, opt_max: 1500, max: 1900}}
   lactarius_sanguifluus: {altitud: {min: 0, opt_min: 300, opt_max: 1500, max: 1900}}
   ```
   - **Motivo:** el 37 % de las citas de *L. deliciosus* que calibran en la zona están por debajo de 200 m, y en los pinares costeros de pino piñonero y pinaster del Estrecho salen níscalos a nivel del mar (iNat, Observation y Wikiloc coinciden).
   - **Efecto:** la validación de *L. deliciosus* sube de 4,36 a 5,90, y las celdas ≥50 pasan de 9.911 a 15.937.
   - **Alicante no se toca.**
   - Si se aplica: idoneidad → calibración → sitios → export, y actualizar el dorado de Marbella.
2. **Suelo «Gravas, arenas y limos. Localmente margas…»** (~50.800 ha en Marbella y 7.600 ha en Alicante): valorar pasarlo a «otro» con una excepción en `fuentes.yaml → geologia.mapeo_suelo`, como ya se hizo con las «areniscas» genéricas. Afecta a todas las especies; habría que medir antes y después todas las especies de las dos regiones.
3. **Refrescar las citas de Alicante** (`citas --refrescar`) en el próximo ciclo, para quitar las 3 observaciones borradas.
4. **No añadir iNat casual ni Mushroom Observer** a `citas.py`: no aportan.

## 5. Cambios en el repositorio

- `pipeline/setas_pipeline/citas.py`:
  - `_get` reintenta los cortes de conexión pasajeros (`ConnectionError`/`Timeout`). GBIF cortó una petición durante el sondeo y antes eso abortaba `citas.py` entero.
  - El docstring anota Mushroom Observer (solo vía GBIF).
- `pipeline/tests/test_citas.py`: test del reintento.
- Datos: ninguno. `citas.geojson`, `calibracion.*`, `sitios.json` y el dorado no cambian, así que no hacía falta respaldo en `.respaldos/`.
- Verificación: pytest 319 pasan; `npm test` 526 pasan (37 archivos); `npm run build` correcto.

## Anexo: método reproducible

- Scripts temporales fuera del repo (scratchpad de la sesión), ejecutados con `uv run` en `pipeline/` sobre las funciones de `citas.py` y `calibracion.py`:
  - **GBIF:** `occurrence/search` con `limit=0&facet=datasetKey`, en el polígono `citas.poligono_wkt(centro, radio)`, por clave de `gbif_claves`. Se compara con las claves y datasets de la caché.
  - **iNat:** `observations?per_page=0` por `quality_grade` (research, needs_id, casual), y `only_id=true` para comparar ids con la caché. Las casual se descargaron y se filtraron: no cautivas, con fecha, con foto, licencia CC, precisión ≤1 km y en tierra de la zona.
  - **MO:** `api2/observations?north…&detail=low`, una petición por región.
  - **Capas:** valores de `arbol`, `altitud`, `suelo`, `fcc`, `estado`, `arbol_sat` e `idoneidad_*` en la celda de 100 m. La litología se toma del recinto IGME de la caché `raw/geologia` que contiene el punto.
  - **Simulación:** `calibracion.calibrar(out, raw, perfiles)` con el perfil de altitud cambiado en memoria (`region.perfiles`, overrides incluidos). Idoneidad en puntos con `idoneidad.puntuar` y `DESACTIVADOS_POR_DEFECTO`.
- No se guardó nada de Wikiloc ni de Mushroom Observer en el repo.
