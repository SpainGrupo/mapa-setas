# Mapa de setas multi-región: Marbella + Alicante (diseño)

Fecha: 2026-10-15 · Rama: `region-alicante` · Decisión de base: opción A de Alexander (14-10): una app con selector de región y una descarga offline por región.
Entradas: `HANDOFF-ALICANTE.md`, `docs/investigacion/2026-10-14-region-alicante.md` (abreviada «INV»), spec original `docs/specs/2026-10-13-mapa-setas-design.md` (abreviada «SPEC»).
Alcance pedido por Alexander el 15-10: todo hasta completarlo, reutilizando lo aprendido en Marbella.

## 1. Objetivo y criterios de éxito
1. La misma PWA sirve Marbella y Alicante. El usuario elige región, y cada región se descarga por separado para usarla sin cobertura.
2. Marbella no cambia. Sus salidas del pipeline son idénticas antes y después del refactor (§7.1), y sus e2e siguen en verde.
3. Alicante tiene el catálogo que sirve allí: rovellón (*L. sanguifluus*), llenega, *Suillus*, *Lepista*, *Agaricus*, *Hydnum*, *P. eryngii*, colmenilla y turma. Las especies de alcornocal salen como «sin hábitat en esta zona» y no como puntuaciones bajas.
4. Toda comestible nueva llega con sus confusiones peligrosas en la guía y en el reconocedor (*T. pardinum*, *T. equestre*, *Gyromitra*, *Clitocybe dealbata*). La regla SPEC §2 no se toca: nunca se afirma comestibilidad.
5. La normativa sale por comunidad autónoma del punto. Lo que no se ha cotejado en fuente oficial dice «pendiente de verificar» y nunca da un cupo inventado.
6. Se publica solo con las puertas en verde (§8).

## 2. Enfoque elegido
Una configuración por región (`pipeline/regiones/<id>.yaml`), un flag `--region` en los CLIs y directorios separados por región en todas las capas: caché, salida, publicación, OPFS y claves de almacenamiento. El código es uno solo. Las fuentes de datos distintas se resuelven con **adaptadores** declarados en la config, no con ramas `if region == …`.

Descartados: copiar el pipeline por región (duplica mantenimiento) y una sola malla que cubra las dos zonas (Marbella y Alicante están a 500 km: la malla sería casi toda vacía).

## 3. Pipeline

### 3.1 Configuración
- `pipeline/regiones/marbella.yaml` recoge exactamente los valores que hoy están en el código: ORIGEN, radio 220 km, OSRM, `andalucia` en Geofabrik, REDIAM, PORN, texto legal de `exportar.py:429-436` y las 12 especies.
- `pipeline/regiones/alicante.yaml` sigue el esquema de INV §5, con las correcciones de este documento.
- `setas_pipeline/region.py` carga la config, la valida (claves obligatorias, adaptadores conocidos) y expone `Region` con: `id`, `origen`, `zona`, `osm_extractos`, `capas`, `especies` (activas y sin_habitat), `overrides_especies`, `legal`, `atribuciones` y rutas `raw`, `out` y `app`.
- `fuentes.yaml` se queda con lo nacional y compartido: DEM, IGME, MFE IEPNB, EFFIS, GBIF y parámetros de acceso a pie. Lo regional sale de él y pasa a la config de cada región.
- `especies.yaml` sigue siendo el catálogo común de perfiles. La región elige qué especies están activas y puede sobrescribir campos de un perfil con `overrides_especies.<id>`, por ejemplo la ventana de lluvia en clima semiárido. El perfil base no se toca.

### 3.2 Rutas
- `pipeline/data/<region>/raw/` y `pipeline/data/<region>/out/` (con `out/app/` dentro). Las constantes `BASE/RAW/OUT/APP` repetidas en 5 módulos se sustituyen por `region.raw`, `region.out` y `region.app`.
- Caché compartida solo donde la clave ya identifica el contenido: `pipeline/data/_comun/gbif/` (hash del WKT).
- Migración en el checkout principal: `pipeline/data/raw` pasa a `pipeline/data/marbella/raw` y `out` a `marbella/out`, ambos con `mv`. `enlazar-datos.mjs` pasa a enlazar `app/public/data/<region>`.
- En el worktree, los datos de Marbella se copian con `cp -c` (clon APFS, sin coste de disco) desde el checkout principal para la prueba de regresión.

### 3.3 Adaptadores de fuente
Hay una interfaz común por tipo de capa (`protegidos`, `restricciones`, `montes_publicos`, `incendios`, `senderos`, `mfe`). Cada adaptador devuelve GeoDataFrames normalizados en EPSG:25830 con columnas fijas (por ejemplo, incendios: `anio`, `fecha`, `geometry`). Todos usan `descargas.py`, que ya resuelve paginación, reintentos y caché.
| Adaptador | Uso |
|---|---|
| `rediam_*` (lo de hoy, movido) | Marbella |
| `arcgis` (REST `query`, `resultOffset`, `maxRecordCount`) | ICV: MFE capa 41, ENP, montes, senderos 50–52; IGME ya lo usa |
| `arcgis_por_anio` | incendios ICV por capa-año |
| `wfs` (GeoServer, paginado `startIndex`, `srsName=EPSG:25830`) | IDERM: ENP, MONTES, USOS_VEGETACION; MFE IEPNB ya lo usa |
| `zip_geojson` | MITECO BDN: ENP y Natura 2000 (Albacete) |
| `effis` (lo de hoy) | todas |
| `osm_relaciones` (rutas OSM, lo de hoy) | todas |

OSM con varios extractos: se descargan y se recortan con `osmium extract -b <bbox zona>`, luego se fusionan con `osmium merge` en `raw/zona.osm.pbf`. `accesos`, `acceso` y `rutas` leen ese archivo.

### 3.4 Vegetación y suelo
- El enum `ARBOL` (`malla.py:12`) gana `sabina` (*Juniperus*), **añadido al final** sin renumerar, para que `arbol.tif` de Marbella siga idéntico. `pino` no se divide: la altitud del perfil ya separa carrasco de negral (YAGNI; si la calibración lo pide, se hace luego).
- MFE: primero el WFS del IEPNB, nacional, que da el mismo esquema en las tres CCAA. Si está caído, CV sale del ICV (capa 41) y Murcia de IDERM `USOS_VEGETACION`, con el contenido por verificar en la ejecución. Si una zona se queda sin fuente, sus celdas se marcan NODATA (255) y la app las pinta «sin datos de vegetación». Nunca «baja idoneidad».
- Suelo: `mapeo_suelo` añade los `DESC_UNIT` de la zona (Keuper, yesos, dolomías, Buntsandstein/rodeno). La clase ácida queda para rodeno y cuarcitas.

### 3.5 Especies (Alicante)
- Perfiles nuevos según INV §2 (sin `tricholoma_terreum`: decisión de Alexander del 15-10, ficha tóxica sin capa): `hygrophorus_latitabundus`, `suillus_collinitus`, `lepista_nuda`, `agaricus_campestris`, `hydnum_repandum`, `morchella_spp` y `terfezia_claveryi`. Se ajusta `lactarius_sanguifluus`.
- `morchella_spp`: sin bonus por quemado en esta entrega (PENDIENTE de diseño, INV §2). `penaliza_fuego: false`.
- Calibración GBIF con hold-out por bloques cuando n≥10, igual que en Marbella. Con n<10, el perfil queda heurístico y la app lo marca como «modelo sin calibrar en esta zona».
- `sin_habitat`: no se exportan sus pmtiles (ahorra espacio, §6). El manifest las lista con `sin_habitat: true`.

### 3.6 Normativa y restricciones
- Capa nueva `ccaa.pmtiles` con los polígonos de comunidad autónoma recortados a la zona (IGN, límites administrativos). Sirve para mirar el texto legal de un punto.
- En el manifest, `legal.ccaa[]` lleva `{id, nombre, norma, cupo_kg_dia|null, texto, verificado: bool, fuente_url}`. Marbella tiene una sola entrada (AND), con el texto actual.
- Las restricciones de Alicante salen solo de lo que tiene un mapeo verificado. Las zonificaciones del ICV, con esquema distinto por parque, se mapean a mano solo cuando el PRUG está leído. Mientras tanto, el espacio protegido sale como tipo `espacio_protegido` con el texto «puede haber limitaciones propias; consulta su PRUG». Nunca se dice «permitido».
- Texto legal: se intenta cotejar en fuente primaria (DOGV consolidado con navegador, PDF del DOCM, PRUG de Mariola y Font Roja, BOE de la Orden SCO/3303/2006). Lo que no se coteje se queda en `verificado: false` y la app muestra «pendiente de verificar».

### 3.7 Exportación
- `exportar.py --region <id>` escribe en `data/<region>/out/app/`. El manifest gana `region: {id, nombre, origen, etiqueta_origen}`, `legal` y `especies[].sin_habitat`. Las atribuciones salen de la config de la región.
- Nuevo `exportar regiones` escribe `pipeline/data/regiones.json`: `[{id, nombre, origen, bbox, total_bytes, generado}]`. Es el índice que lee la app.

## 4. App

### 4.1 Datos y región activa
- Publicación: `data/regiones.json`, `data/<region>/manifest.json` y `data/<region>/<archivos>`. El modelo del reconocedor pasa a `data/modelo/`, compartido.
- `region.ts` (nuevo) gestiona la región activa: `localStorage['setas:region']`. La primera vez se elige la región por GPS (la más cercana a su origen); sin GPS, se pregunta. `baseDatos()` devuelve `data/<region>/`.
- Al cambiar de región se recarga el mapa con su manifest (bbox, especies, capas). Las claves que dependen de la región se nombran `setas:<clave>:<region>` (`capa`, `punto-meteo`, `mapas-descargados`, `mapas-nuevo-generado`). La caché de meteo en IndexedDB se guarda con la clave `datos:<region>`.
- Mis sitios siguen siendo globales: son coordenadas y valen en cualquier región.

### 4.2 Selector
- Va en Ajustes y en la cabecera del mapa, como un chip con el nombre de la región. Con una sola región en `regiones.json`, el selector no se muestra.
- Cada región enseña su estado de descarga y su tamaño. Se pueden tener varias descargadas a la vez.

### 4.3 OPFS
- Directorios `mapas/<region>` y `mapas-nuevo/<region>`. El modelo se queda en `modelo`.
- Migración en el primer arranque: si existe el `mapas` plano antiguo y `setas:mapas-descargados`, se mueve a `mapas/marbella` y se renombra la clave. Lleva test.

### 4.4 Lo que deja de depender de Marbella
- `ranking.ts` y `hoy-ui.ts`: el origen y la etiqueta («de Alicante») salen de `manifest.region`.
- Las atribuciones de `mapa.ts`, `index.html` y `restricciones.ts` salen del manifest (`ORIENTATIVO` deja de citar el BOJA fijo).
- Normativa: el texto por CCAA del punto (consulta a `ccaa.pmtiles`). Si no hay punto, se muestran todas las CCAA de la región.
- Especies `sin_habitat`: en gris en el selector, con el texto «Sin hábitat en esta zona», sin capa. La guía sigue mostrando su ficha.
- Worker de Gemini: el prompt recibe la región («en la Comunitat Valenciana / Región de Murcia…») como parámetro validado contra una lista cerrada. Por defecto, Andalucía.
- PWA: nombre y descripción neutros, «Mapa de setas».

### 4.5 Guía y reconocedor
- Fichas nuevas en `guia/especies.json`: comestibles (*T. terreum*, *H. latitabundus*, *Morchella*; *S. collinitus* y *L. vinosus*/*semisanguifluus* como variantes dentro de las fichas existentes) y tóxicas (*T. pardinum*, *T. equestre*, *Gyromitra*, *Clitocybe dealbata*/*rivulosa*). Cada una con fotos de licencia libre, fuentes y «no confundir con». `habitat` deja de citar solo Cádiz cuando la especie esté en las dos regiones.
- `seguridad.ts`: reglas nuevas de confusión (negrilla ↔ *T. pardinum*/*T. equestre*; colmenilla ↔ *Gyromitra*; *Agaricus*/senderuela ↔ *Clitocybe*) y las mortales listadas siempre hasta que se descarten. La cobertura del 100 % sigue exigida.
- Riesgos abiertos del traspaso que se cierran aquí, porque las especies nuevas los agravan: la respuesta «láminas amarillas» ya no descarta sola las amanitas mortales y el umbral de «no reconocido» (0,27) se revisa con la referencia del modelo. La pregunta de Alexander sobre «Considerada comestible por la bibliografía» sigue abierta: no se cambia sin su respuesta.
- Vocabulario del reconocedor: se comprueba que los taxones nuevos están en `df20_especies.txt`/`extra.txt` y se añaden con su alias. Si el vocabulario cambia, se regenera el modelo y se actualiza `modelo/referencia.json`.

## 5. Datos compartidos y tamaño publicado
GitHub Pages limita el sitio publicado a 1 GB. Hoy Marbella ocupa unos 453 MB de datos y el modelo 100 MB. Alicante tendrá un orden parecido, así que el total rondaría o superaría el límite.
Palancas en este orden, medidas en la fase de datos de Alicante:
1. No exportar las especies `sin_habitat` (ya en §3.5).
2. Publicar solo `acceso.bin.gz` si la app ya lee ese formato. Si no, dejar uno solo de los dos.
3. Bajar el zoom máximo de `base.pmtiles` en las zonas sin especies activas.
4. Si sigue por encima, se para y se pregunta a Alexander: mover los datos a Cloudflare R2, cuya cuenta está pendiente.
`publicar.sh` comprueba el total (≤ 950 MB) además del límite de 95 MB por archivo.

## 6. Errores y casos límite
- Fuente caída en la ejecución: el adaptador lo reintenta. Si falla, la capa se marca NODATA y el manifest lleva `avisos[]`, que la app muestra en Ajustes. Nunca hay datos inventados.
- Región en `localStorage` que ya no existe en `regiones.json`: se vuelve a elegir.
- Punto fuera de las dos regiones: se aplica la regla actual de fuera de zona.
- `setas:capa` con una especie que no existe en la nueva región: se toma la primera activa, como ya hace `main.ts:159`.

## 7. Pruebas
1. **Regresión de Marbella.** Antes del refactor se genera `pipeline/tests/dorado/marbella.json` con el hash de los píxeles de cada `.tif` de `out/` y los JSON de `out/app` normalizados (sin `generado`). También guarda la lista y el tamaño de los pmtiles, con un ±1 % de tolerancia porque tippecanoe mete metadatos. Después del refactor se regenera sin red (todo menos `zona` y `base`, que no tienen caché) con `--region marbella` sobre la caché clonada, y tiene que dar el mismo dorado (plan A, tareas 2 y 10). El test se salta si no hay datos.
2. Tests unitarios de `region.py` (validación), de cada adaptador (con respuestas grabadas como fixtures) y de que NODATA (255) no se lea como `sabina`.
3. App, con vitest: `region.ts`, migración OPFS, claves por región, `sin_habitat`, normativa por CCAA y origen desde el manifest. Los tests que usan Marbella siguen igual. Se añaden casos de Alicante.
4. e2e: el actual con Marbella sin cambios, más un e2e de Alicante (punto en Mariola, especie activa, especie sin hábitat, normativa CV, descarga offline, cambio de región).
5. Seguridad: los tests de `seguridad.ts` se amplían a las reglas nuevas, con cobertura del 100 %. Hay un test que comprueba que cada comestible activa en una región tiene al menos una confusión tóxica con ficha.

## 8. Puertas antes de publicar
- `code-review` high en cada fase, y max en `seguridad.ts`, el reconocedor y las fichas nuevas.
- `security-review` del Worker si cambia el prompt.
- Todo `pytest`, `vitest` y los dos e2e en verde. Capturas regeneradas.
- `verification-before-completion`: se abre la app publicada en local (`npm run servir`) con las dos regiones.
- Luego: fusionar en `main`, `publicar.sh`, comprobar la URL pública y quitar el worktree.

## 9. Fuera de alcance
Bonus de colmenilla por quemado reciente, ampliar la isócrona más allá de 2 h (Alcaraz y Segura) y una tercera región. El esquema las permite, pero no se hacen ahora.
