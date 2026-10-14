# Región Alicante: zona, especies, fuentes y normativa (investigación 2026-10-14)

Objetivo: adaptar el mapa (hoy Marbella) a todo lo que queda a ≤2 h en coche de Alicante (38.3452, -0.4810).
Solo investigación: no hay cambios de código. Todo lo marcado HEURÍSTICO está por calibrar; lo no confirmado es PENDIENTE.

## 1. Zona (isócrona de 2 h)

**Método.** El mismo de `zona.py`: OSRM demo (`router.project-osrm.org/table/v1/driving`), rejilla de 10 km en un
radio de 230 km, filtro ≤7200 s y ajuste a la red ≤5 km. Se muestrearon 1653 puntos y salen 222 alcanzables, entre
lon -1.97…0.21 y lat 37.44…39.43. Las provincias salen de geocodificación inversa con Nominatim (zoom 8).

**Comunidades y provincias cubiertas:**
| CCAA | Provincias / comarcas alcanzadas | Tiempo máx. |
|---|---|---|
| Comunitat Valenciana | Alicante entera; Valencia sur (Vall d'Albaida, Costera, Safor, Ribera, Canal de Navarrés, Ayora-Cofrentes hasta lat ≈39.35, Horta Sud) | 118–120 min |
| Región de Murcia | Casi toda: Altiplano, Vega del Segura, Campo de Cartagena, Río Mula, Guadalentín, Noroeste (Caravaca/Cehegín, borde) | 110–119 min |
| Castilla-La Mancha | Solo Albacete este (Almansa, Hellín, Chinchilla, hasta lon ≈-1.86) | 115–119 min |
| Andalucía | Ninguna (Sierra de María, Vélez Blanco: 149 min) | — |

**Sierras, tiempo de ruta OSRM (`route/v1/driving`, punto en la sierra):**
| Sierra | Min | km | ¿Dentro? |
|---|---|---|---|
| Carrascal de la Font Roja (lado Ibi) | 40 | 48 | sí |
| Serra de Bernia | 60 | 66 | sí |
| Serra de Mariola (Agres) | 65 | 81 | sí |
| Aitana (Benifato) | 69 | 70 | sí |
| Font Roja (santuario, Alcoi) | 72 | 73 | sí |
| Vall de Gallinera / Vall d'Ebo | 90 | 99 | sí (quemada en 2022, §3) |
| Sierra Espuña (Huerta Espuña) | 104 | 128 | sí |
| Ayora / Sierra de Enguera | 159* | 126 | límite (*la tabla da 116 min en -1.06, 39.34) |
| Revolcadores/Moratalla 157–163 · Alcaraz 178 · Segura/Yeste 174–200 · Calderona/Chera 146–170 · Javalambre, Penyagolosa, Cazorla, Cuenca 228–340 | — | — | no |

Conclusión: entran las sierras béticas prelitorales de Alicante (Mariola, Font Roja, Aitana, Serrella, Bernia,
Montgó, Maigmó, Sierra de Salinas), las del sur de Valencia (Benicadell, Agullent, Serra Grossa, Corbera, Mondúver),
el interior de Murcia (Espuña, Carrascoy, El Carche, La Pila, Ricote, Burete-Cambrón) y el este de Albacete (Almansa,
Hellín). Quedan fuera las grandes masas montanas: Alcaraz, Segura, Cazorla, Javalambre y la Serranía de Cuenca.
El demo de OSRM da más tiempo en pistas de montaña que la tabla, y el ajuste a la red cambia el resultado (caso de
Ayora). La isócrona final debe salir de la tabla con el mismo cierre morfológico que `zona.py`.

Ojo de proyección: la zona cruza el meridiano 0° (huso 31). El WCS del IGN sirve `Elevacion25830_25` también al este
de 0°: se comprobó una tesela en x 770000–780000 (costa de Xàbia), 200 OK, int16, 0–439 m, 36 % mar. Se puede seguir en EPSG:25830 con la distorsión del huso extendido (≈0,3° fuera, despreciable a 100 m).

## 2. Especies

**Hábitat dominante.** Pinar de *Pinus halepensis* sobre caliza, con carrascal (*Q. ilex*) en umbrías y fondos. La capa MFE del ICV (Alicante + sur de Valencia) da 10 784 recintos con *P. halepensis* como especie 1, frente a 394 de *Q. ilex*, 226 de *P. pinaster*, 95 de *Juniperus oxycedrus* y 19 de *J. phoenicea*. La geología IGME es casi toda
básica: 7493 recintos con "dolom", 2172 con "yeso" y 537 de Keuper, frente a solo 2 de "Buntsandstein". El suelo
ácido es marginal: rodeno y cuarcitas de la Ribera/Safor (Serra de Corbera, "El Surar").
El cambio de fondo frente a Marbella: de alcornocal y castañar sobre suelo ácido a pinar calizo semiárido.

**Registros GBIF en la zona** (envolvente convexa de la isócrona, +0,05°; `occurrence/search?taxonKey&geometry`,
consultado el 2026-10-14). Se cuentan registros, no abundancia: los pinares calizos están poco muestreados.

| Especie | GBIF zona / España | ¿En guia/especies.json? | ¿En especies.yaml? | Nota |
|---|---|---|---|---|
| *Lactarius sanguifluus* | 85 / 1180 | dentro de la ficha *L. deliciosus* | sí | **especie estrella** (rovelló, esclata-sang) |
| *L. vinosus* / *L. semisanguifluus* | 9 / 90 · 7 / 204 | no | no | se pueden añadir como variantes de la ficha |
| *L. deliciosus* | 16 / 2538 | sí | sí | escaso: es de suelo ácido |
| *Tricholoma terreum* (negrilla, fredolic) | 51 / 1687 | **no** | no | NUEVA, prioridad alta |
| *Suillus collinitus* / *S. bellinii* / *S. granulatus* | 67 / 36 / 18 | solo *S. bellinii* | no | añadir *S. collinitus* a la ficha |
| *Lepista nuda* | 52 / 1682 | sí | no | perfil nuevo |
| *Agaricus campestris* | 45 / 1167 | sí | no | perfil nuevo (pastizal) |
| *Morchella esculenta* / *M. elata* | 30 / 7 | **no** | no | NUEVA (primavera) |
| *Pleurotus eryngii* | 16 / 723 | sí | sí | perfil vale |
| *Hygrophorus latitabundus* (llenega negra) | 11 / 307 | **no** | no | NUEVA |
| *Hygrophorus russula* | 11 / 525 | no | no | opcional (carrascal) |
| *Hydnum repandum* | 16 / 1672 | sí | no | perfil nuevo (carrascal) |
| *Tricholoma equestre* | 4 / 562 | **no** | no | NUEVA como TÓXICA (abajo) |
| *Boletus aereus* | 6 / 774 | sí | sí | relicto: El Surar / Corbera, Llosar (Valencia sur) |
| *B. edulis*, *B. reticulatus*, *B. pinophilus* | 0 | sí | sí | ausentes de la zona: desactivar o dejar en gris |
| *Cantharellus cibarius* | 0 / 1438 | sí | sí | ausente: desactivar |
| *Amanita caesarea* | 1 / 752 | sí | sí | un solo registro (2008, 38.06,-0.66, coordenada dudosa): "sin datos en la zona" |
| *Macrolepiota procera* | 7 / 2782 | sí | sí | rara |
| *Terfezia claveryi* / *T. arenaria* | 0 / 89 · 0 / 99 | ficha *T. arenaria* (incluye *T. claveryi*) | sí (*T. arenaria*) | GBIF vacío, pero la turma es tradicional en Murcia/Albacete con *Helianthemum* [S12]: rehacer el perfil |
| *Calocybe gambosa* | 0 | no | no | no aplica |

**Tóxicas y confusiones con registro en la zona:** *Amanita phalloides* 16, *A. verna* 3, *Lepiota brunneoincarnata* 21,
*Omphalotus olearius* 14, *Rubroboletus satanas* 15, *Lactarius chrysorrheus* 14, *Amanita pantherina* 8,
*A. muscaria* 4, *Clitocybe dealbata* 5, *Inocybe* (género) 310, *Tricholoma pardinum* 1.
Con 0 en la zona: *Lactarius torminosus*, *Entoloma sinuatum*, *Gyromitra esculenta*, *Cortinarius orellanus*.
La guía ya tiene ficha de casi todas. Faltan y son relevantes aquí:
- ***Tricholoma pardinum***: la gran confusión de *T. terreum*. Imprescindible si entra la negrilla.
- ***Tricholoma equestre*** (y *T. auratum*): rabdomiólisis. Venta prohibida cautelarmente por la Orden SCO/3303/2006 [S10]; vigencia actual PENDIENTE de confirmar en el BOE. Se confunde con negrillas y *Tricholoma* amarillos de pinar.
- ***Clitocybe dealbata / C. rivulosa*** (muscarínicas, prados): confusión con *Agaricus* y la senderuela.
- ***Gyromitra*** (*G. esculenta* / *G. gigas*): confusión de las colmenillas. Aunque GBIF dé 0, la ficha conviene si entra *Morchella*.
- ***Lactarius torminosus***: ya está en la guía. GBIF 0; la confusión local del rovelló es más bien *L. chrysorrheus* y los *Lactarius* de leche blanca.

**Perfiles propuestos** (HEURÍSTICOS; formato de `especies.yaml`; árboles con las clases del mapeo MFE).
Hace falta una clase de árbol nueva, `sabina` (*Juniperus* spp.), y conviene separar `pino_carrasco` (24) de
`pino_negral_salgareno` (25/26) para la altitud. Las fechas de temporada se apoyan en [S6, S7, S8] y en el patrón de
los meses de GBIF (oct–dic). Ninguna cifra viene de un estudio local: sin calibrar.
```yaml
lactarius_sanguifluus:   # ya existe; ajustar: P. halepensis y P. nigra salzmannii, calcícola [S6]
  {arboles: {pino: 1.0}, altitud: {min: 300, opt_min: 600, opt_max: 1300, max: 1600}, suelo: {basico: 1.0, otro: 0.7, acido: 0.4}, tiempo: {meses: [10, 11, 12]}}
tricholoma_terreum:      # tardía, aguanta frío [S8]
  {arboles: {pino: 1.0, sabina: 0.4}, altitud: {min: 300, opt_min: 600, opt_max: 1400, max: 1700}, orientacion: indiferente, suelo: {basico: 1.0, otro: 0.8, acido: 0.6}, dosel: {opt: [30, 70]}, tiempo: {episodio_mm: 20, ventana_dias: [15, 35], tmin_media: [2, 12], tmax_media: [10, 20], dias_lluvia_30d_min: 3, meses: [11, 12, 1, 2]}}
hygrophorus_latitabundus:   # P. halepensis y P. nigra sobre caliza [S8]
  {arboles: {pino: 1.0}, altitud: {min: 400, opt_min: 700, opt_max: 1400, max: 1700}, orientacion: umbria, suelo: {basico: 1.0, otro: 0.7, acido: 0.3}, humedad: 0.1, tiempo: {episodio_mm: 25, ventana_dias: [20, 40], tmin_media: [2, 12], tmax_media: [8, 18], meses: [11, 12, 1]}}
suillus_collinitus:      # ficha en la guía junto a S. bellinii
  {arboles: {pino: 1.0}, altitud: {min: 0, opt_min: 100, opt_max: 1200, max: 1600}, suelo: {basico: 1.0, otro: 0.8, acido: 0.6}, tiempo: {episodio_mm: 15, ventana_dias: [7, 18], tmin_media: [6, 16], tmax_media: [14, 24], meses: [10, 11, 12]}}
morchella_spp:           # quemados de 1–2 años, riberas; bonus por quemado reciente = regla nueva PENDIENTE de diseño
  {arboles: {pino: 0.6, encina: 0.5}, micorrizica: false, penaliza_fuego: false, altitud: {min: 400, opt_min: 700, opt_max: 1400, max: 1800}, tiempo: {episodio_mm: 15, ventana_dias: [10, 25], tmin_media: [3, 10], tmax_media: [14, 22], meses: [3, 4, 5]}}
terfezia_claveryi:       # tomillar/jaral de Helianthemum sobre caliza o yeso, al revés que T. arenaria [S12]
  {arboles: {}, cubierta: {matorral: 1.0, pastizal_matorral: 1.0, pastizal: 0.6}, suelo: {basico: 1.0, otro: 0.8, acido: 0.3}, altitud: {min: 200, opt_min: 400, opt_max: 1000, max: 1200}, humedad: -0.1, tiempo: {episodio_mm: 20, ventana_dias: [20, 45], meses: [2, 3, 4, 5]}}
```
Las especies de alcornocal (*B. aereus*, *A. caesarea*, *Cantharellus*, *A. ponderosa*) se quedan en el catálogo,
pero en esta región deberían salir "sin hábitat en la zona" en vez de mostrar puntuaciones bajas engañosas.

## 3. Fuentes por capa (verificadas el 2026-10-14 con peticiones reales)

| Capa | Fuente / endpoint | Estado | Licencia |
|---|---|---|---|
| Zona | OSRM demo `router.project-osrm.org/table/v1/driving` | OK (1653 puntos en 17 lotes) | ODbL (datos OSM) |
| DEM | IGN WCS `servicios.idee.es/wcs-inspire/mdt`, `Elevacion25830_25` | OK: Aitana 244–1555 m; al este de 0° también | CC BY 4.0 scne.es |
| Geología | IGME GEODE 50 `.../IGME_Geode_50/MapServer/8/query` | OK: 53 395 recintos en la caja de la zona (≈54 páginas) | IGME, condiciones de uso |
| Vegetación MFE (nacional) | `geoserver.iepnb.es/geoserver/wfs` `foto_fija_mfe:ff_tipo_bosque` | **503 "no healthy upstream"** las 4 veces que se probó hoy | © MITECO |
| MFE, respaldo CV | ICV `carto.icv.gva.es/arcgis/rest/services/tm_medio_ambiente/forestal/MapServer/41` | OK: campos `idfotofija`, `fccarb`, `sp1_nom_ifn`, `tipestr_definicion`, `e1_definicion` (mismo esquema que el MFE25) | CC BY 4.0 (dadesobertes.gva.es) |
| MFE, respaldo Murcia | IDERM WFS `PFO_ZOR_DMVP_CARM:USOS_VEGETACION` | capa listada; contenido PENDIENTE | PENDIENTE |
| OSM | Geofabrik `spain/valencia` 141 MB, `spain/murcia` 35 MB, `spain/castilla-la-mancha` 107 MB (`-261013`) | OK (307 → 200) | ODbL 1.0 |
| ENP nacional | MITECO BDN `.../banco-datos-naturaleza/enp/Enp2025_geojson.zip` (66 MB); Natura 2000 `.../3-rn2000/n2000_2025_GeoJson.zip` (195 MB) | OK (200, sin reto anti-bot) | MITECO BDN (licencia PENDIENTE de leer en metadatos) |
| ENP CV | ICV `tm_medio_ambiente/espacios_protegidos/MapServer` (capas 0–30: parques 10, reservas 11, parajes municipales 15/18, paisajes 19/30, Natura 20–24) | OK: query REST por bbox, `maxRecordCount` 1000. Capa 10 → Font Roja, Mariola, Serra Gelada | CC BY 4.0 |
| Zonificación CV | ICV `espacios_protegidos_inst/MapServer` (PORN/PRUG por parque: Mariola 64–66/193–196, Montgó 5–7/102–104, Font Roja 10–13; `Zonificación` 57/166/190/196) y `espacios_protegidos/MapServer/21` (zonificación de las normas de gestión Natura: A/B/D/CE) | servicio OK; **cada parque tiene un esquema distinto**: falta la tabla de "zonas que restringen la recolección" | CC BY 4.0 |
| ENP Murcia | IDERM `mapas-gis-inter.carm.es/geoserver/wfs` `SIG_LUP_SITES_CARM:ENP` (29 recintos: Sierra Espuña, Carrascoy y El Valle, El Carche… con `figura` y `norma`); también `LIC-ZEC`, `ZEPA` | OK (GeoJSON, `srsName=EPSG:25830`) | AccessConstraints/Fees NONE; licencia formal PENDIENTE |
| Montes públicos Murcia | IDERM `PFO_ZOR_DMVP_CARM:MONTES` (239: `propiedad`, `clas_art11` Público/Privado) | OK. Útil para la capa legal (público/privado) | ídem |
| Montes públicos CV | ICV `forestal/MapServer/25` "Montes gestionados por la Conselleria" (5329 recintos en la caja) | OK | CC BY 4.0 |
| ENP Albacete | sin servicio regional encontrado → MITECO BDN nacional | PENDIENTE (franja pequeña) | — |
| Incendios nacional | EFFIS WFS `ms:modis.ba.poly` (mismo patrón que `fuentes.yaml`) | OK: 120 perímetros 2016–2026 en la caja; los mayores: Vall d'Ebo 12 111 ha (13-08-2022), Llutxent 3228 ha (2018), Llocnou de Sant Jeroni 2356 ha (2023), Hellín 2131 ha (2021) | CC BY 4.0 |
| Incendios CV | ICV `tm_medio_ambiente/prevencion_de_incendios/MapServer/{1..28,101,102,120,121}` = años 1993–2024, polígonos con `anyo`, `f_detec`, `sup_f` | OK: 2022 → 152, 2023 → 286, 2024 → 336 en la caja; 2025 sin capa todavía (cubrir con EFFIS) | CC BY 4.0 |
| Incendios Murcia/Albacete | solo EFFIS + MFE | regional PENDIENTE | — |
| Senderos CV | ICV `forestal/MapServer/50` GR (16), `/51` PR-CV (164, algunos sin atributos), `/52` SL-CV (35), `/57` caminos naturales; campos `denominaci`, `nombre`, `longitud`, `dificultad`, `tiempo_est` | OK. Es la red homologada de la Generalitat (matrícula GR/PR-CV/SL-CV). El dataset propio de la FEMECV no se buscó aparte | CC BY 4.0 |
| Senderos Murcia | no hay capa de senderos en IDERM (solo `caminos_amables`, `via_verde` de la DPOT de Mula) → relaciones OSM | PENDIENTE (FMRM) | ODbL |
| GBIF | `api.gbif.org/v1` species/match + occurrence/search (`geometry` WKT) | OK (tabla §2) | por registro |
| Tiempo | Open-Meteo (como hoy) | compartido, sin cambios | — |

## 4. Normativa de recolección

**Comunitat Valenciana. Orden de 16 de septiembre de 1996, de la Conselleria de Agricultura y Medio Ambiente,
que regula la recolección de setas y otros hongos (DOGV nº 2870, 15-11-1996)** [S1, S2]. Base legal: Ley 3/1993
Forestal (art. 30) y su reglamento, el Decreto 98/1995. El tríptico oficial de la Conselleria (nº 03/2018) [S2] resume:
- Autoconsumo **hasta 6 kg por persona y día, sin autorización expresa** de la Administración. Lo recogido no se puede vender. Hay que mirar las ordenanzas municipales.
- Más de 6 kg, venta o trufas: consentimiento expreso del propietario, más una declaración responsable (montes con instrumento de gestión) o una autorización 3 meses antes (silencio negativo).
- Solo navaja de hoja ≤11 cm; cortar por la base; prohibido remover el mantillo y llevar herramientas para levantarlo; cesta de material natural; **prohibida la recolección nocturna**; esperar a que acabe la cacería si coincide; prohibido circular o aparcar fuera de pistas (Decreto 8/2008).
- En espacios protegidos puede haber medidas más estrictas. **Mariola y Font Roja: 4 kg por persona y día según sus PRUG** (fuente secundaria de 2010 [S3]). Texto del PRUG PENDIENTE de comprobar.
- Trufas: Orden 1/2018, de 12 de enero (temporadas por especie de *Tuber*).
- En curso: nueva Ley Forestal valenciana anunciada en agosto de 2026 [S4]; no se sabe si toca las setas. PENDIENTE de seguimiento.
- La ficha del DOGV (`dogv.gva.es/.../resultat-dogv?sig=3008/1996`) responde 200, pero se carga con JavaScript: no se pudo leer la vigencia consolidada. Vigencia PENDIENTE de confirmar en el texto consolidado.

**Región de Murcia: no se encontró ninguna norma autonómica sobre setas.** Búsquedas en BORM, Consejería y prensa
sin resultado [S5]. Rige el régimen general: Ley 43/2003 de Montes (los productos son del titular del monte) y las
ordenanzas municipales. Consta una de Cehegín (2013) para sus montes públicos (Aranzadi, no leída). También hay
fincas privadas con aprovechamiento micológico reservado y señalizado (proyecto MicoPlus, Caravaca, 2016). Régimen
de Sierra Espuña (PORN/PRUG) PENDIENTE. La app debería decir "sin regulación autonómica específica; respeta la
propiedad y los carteles de coto" y no inventar un cupo.

**Castilla-La Mancha (Albacete). Orden de 15/11/2016, de la Consejería de Agricultura, Medio Ambiente y Desarrollo
Rural, por la que se regula la recolección de setas silvestres en los montes de Castilla-La Mancha (DOCM nº 226,
21-11-2016; ELI `docm.jccm.es/docm/eli/es-cm/o/2016/11/15`)** [S9]. Resumen de una transcripción secundaria:
- Recolección libre y ocasional de autoconsumo: **5 kg o 10 litros por persona y día**.
- Las setas son del propietario. Si no permite la recolección, debe señalizarlo.
- Solo navaja; prohibidos rastrillos, azadas y similares; nada de bolsas de plástico ni cubos; **prohibido de noche** (del ocaso al orto).
- En días de caza señalizada no se recoge.
- Los ENP y Natura 2000 pueden ser más estrictos.
- Las ordenanzas municipales pueden pedir permiso y tasa.
Artículos y cifras PENDIENTES de cotejar con el PDF del DOCM.

**Para la capa legal de la app:** el cupo, la nocturnidad y las herramientas dependen de la CCAA del punto. Hace falta
un polígono de CCAA y un texto por CCAA. La "zona de reserva" se calcula como en Andalucía, pero con las
zonificaciones del ICV, cuyos códigos hay que mapear a mano.

## 5. Adaptación del pipeline

**Compartido (no cambia):** malla 100 m EPSG:25830, `relieve.py`, `hidrologia.py`, `idoneidad.py` (motor), GBIF y
calibración, Open-Meteo y semáforo, reconocedor, Gemini, PWA, OPFS y exportación pmtiles. También el DEM IGN y la
geología IGME, que son nacionales: solo cambian la bbox y el número de páginas.

**Específico de la región (hoy está fijo en el código):**
1. `zona.py`: `ORIGEN` (-4.8825, 36.5101) y docstring → leer de la config.
2. `accesos.py:29`, `acceso.py:302`, `rutas.py:114`: `andalucia.osm.pbf` fijo → lista de extractos (valencia + murcia + castilla-la-mancha), fusionados con `osmium merge` o recortados a la zona con `osmium extract -b`.
3. `protegidos.py` y `exportar.py:407–488`: REDIAM RENPA y PORN (`TIPOS_ZONA_RESERVA` "A/ARE/R") → adaptadores por fuente (ArcGIS REST del ICV, GeoServer de IDERM, MITECO por zip) y una tabla de mapeo zona→restricción por región.
4. `incendios.py`: `_rediam` → `_icv` (capas por año con su id en un diccionario) más EFFIS. Murcia y Albacete solo con EFFIS.
5. `rutas.py`: `senderos_rediam` → `senderos_icv` (GR/PR/SL ya traen matrícula). Murcia solo con OSM.
6. `vegetacion.py` y `fuentes.yaml.mfe.mapeo_arbol`: añadir *Juniperus* (sabina/enebro), *Ceratonia*, *Olea*, `Especie desconocida en repoblación` y valorar el corte carrasco/negral. Si sigue caído el WFS del IEPNB, respaldo ICV (capa 41) para la CV y PENDIENTE para Murcia.
7. `suelo.py` / `mapeo_suelo`: revisar con los DESC_UNIT de la zona ("Keuper", "yesos", "Buntsandstein", "rodeno"). La clase ácida casi desaparece.
8. `especies.yaml` y la guía: perfiles §2; activar o desactivar especies por región; fichas nuevas (*T. terreum*, *T. pardinum*, *T. equestre*, *H. latitabundus*, *Morchella*, *Gyromitra*, *Clitocybe dealbata*).
9. Atribuciones: `exportar.py:353`, `respaldo.py:40/346`, `rutas.py:141`, `app/src/mapa.ts:143` (texto "REDIAM").
10. App: `ranking.ts:37 MARBELLA` y `hoy-ui.ts:62–64` ("de Marbella") → origen de la config. Revisar también los tests que usan coordenadas de Marbella (`acceso`, `ruta`, `gps`, `intercambio`, `ranking`).
11. `vista_previa.py:25`: etiqueta "Marbella".
12. Rutas de caché `data/raw/*` y de salida `app/public/data`: separar por región (`data/<region>/…`) para no mezclar mallas.

**Esquema propuesto `regiones/alicante.yaml`:**
```yaml
id: alicante
nombre: "Alicante (≤2 h)"
origen: {lon: -0.4810, lat: 38.3452, etiqueta: "Alicante"}
zona: {max_s: 7200, paso_m: 5000, radio_m: 230000, max_snap_m: 5000, cierre_m: 5000, osrm: "https://router.project-osrm.org/table/v1/driving/"}
crs: "EPSG:25830"
osm_extractos:
  - https://download.geofabrik.de/europe/spain/valencia-latest.osm.pbf
  - https://download.geofabrik.de/europe/spain/murcia-latest.osm.pbf
  - https://download.geofabrik.de/europe/spain/castilla-la-mancha-latest.osm.pbf
capas:                       # cada entrada: {adaptador, url, capa/ids, campos, licencia, atribucion}
  dem: {ref: fuentes.dem}                     # nacional, compartido
  geologia: {ref: fuentes.geologia}
  mfe: [{adaptador: wfs_iepnb, ref: fuentes.mfe}, {adaptador: arcgis, url: ".../forestal/MapServer/41", respaldo: true, ambito: CV}]
  protegidos:
    - {adaptador: zip_geojson, url: ".../enp/Enp2025_geojson.zip", ambito: ES}
    - {adaptador: arcgis, url: ".../espacios_protegidos/MapServer", capas: [10, 11, 15, 19], ambito: CV}
    - {adaptador: wfs, url: "https://mapas-gis-inter.carm.es/geoserver/wfs", capa: "SIG_LUP_SITES_CARM:ENP", ambito: MU}
  zonas_restriccion:
    - {adaptador: arcgis, url: ".../espacios_protegidos_inst/MapServer", capas: [196], mapeo: {}}   # PENDIENTE
  montes_publicos:
    - {adaptador: arcgis, url: ".../forestal/MapServer/25", ambito: CV}
    - {adaptador: wfs, url: "https://mapas-gis-inter.carm.es/geoserver/wfs", capa: "PFO_ZOR_DMVP_CARM:MONTES", ambito: MU}
  incendios:
    - {adaptador: arcgis_por_anio, url: ".../prevencion_de_incendios/MapServer", capas_anio: {2021: 101, 2022: 102, 2023: 120, 2024: 121}, ambito: CV}
    - {ref: fuentes.incendios.effis_url, ambito: ES}
  senderos:
    - {adaptador: arcgis, url: ".../forestal/MapServer", capas: {GR: 50, PR: 51, SL: 52}, ambito: CV}
    - {adaptador: osm_relaciones}
mapeo_arbol_extra: {sabina: [J. oxycedrus, J. phoenicea, J. thurifera]}   # códigos MFE PENDIENTES
especies: {activas: [lactarius_sanguifluus, lactarius_deliciosus, tricholoma_terreum, hygrophorus_latitabundus, suillus_collinitus, pleurotus_eryngii, lepista_nuda, morchella_spp, terfezia_claveryi, agaricus_campestris, hydnum_repandum, boletus_aereus], sin_habitat: [boletus_edulis, boletus_reticulatus, boletus_pinophilus, cantharellus_cibarius, amanita_caesarea, amanita_ponderosa]}
legal:                       # texto mostrado por CCAA del punto
  CV: {norma: "Orden de 16-09-1996 (DOGV 2870, 15-11-1996)", cupo_kg_dia: 6, nocturna: prohibida, herramienta: "navaja ≤11 cm", parques: {Mariola: "4 kg (PRUG, PENDIENTE)", Font Roja: "4 kg (PRUG, PENDIENTE)"}}
  MU: {norma: null, texto: "Sin norma autonómica específica (PENDIENTE). Las setas son del titular del monte (Ley 43/2003); respeta cotos y ordenanzas."}
  CM: {norma: "Orden de 15/11/2016 (DOCM 226, 21-11-2016)", cupo_kg_dia: 5, cupo_litros: 10, nocturna: prohibida}
```

## 6. Riesgos principales
1. **El WFS del MFE (IEPNB) está caído** (503 durante toda la sesión). La CV tiene respaldo en el ICV; Murcia no tiene respaldo verificado. Es la capa central del modelo.
2. **El catálogo actual no encaja**: 4 de las 6 especies "de cabecera" (boletus y A. caesarea) tienen 0–1 registros. El valor de la región está en rovellón, negrilla, llenega, *Suillus*, colmenilla y turma, y casi todas necesitan perfil nuevo. Las nuevas comestibles traen confusiones graves (*T. pardinum*, *T. equestre*, *Gyromitra*), con fichas que aún no existen.
3. **Clima semiárido**: los umbrales de lluvia y balance (`balance_30d_min_mm`) están pensados para Marbella. En Alicante el episodio de otoño (DANA) es corto e intenso. Hay que recalibrar con GBIF, que aquí tiene pocos datos (n<20 en casi todas).
4. **Capa legal heterogénea**: 3 CCAA, Murcia sin norma, zonificaciones del ICV con esquemas distintos por parque y el PRUG de Mariola/Font Roja (4 kg) sin texto primario. Riesgo de afirmar un cupo erróneo.
5. **Isócrona**: el demo de OSRM y el ajuste a la red dan diferencias de hasta 40 min en sierras de borde (Ayora). Alcaraz y Segura, la mejor zona micológica cercana, quedan fuera por 1 h.

## Fuentes
- [S1] Orden 16-09-1996 CV, ficha DOGV: https://dogv.gva.es/dogv-portal-frontend/es/resultat-dogv?sig=3008/1996&url_lista= · copia antigua cma.gva.es (no responde el 2026-10-14)
- [S2] Tríptico oficial GVA "Recolección de setas y trufas en terrenos forestales" (03/2018): https://mediambient.gva.es/documents/20551003/164641274/Recolecci%C3%B3n+de+setas+y+trufas+en+terrenos+forestales+(tr%C3%ADptico).pdf/241479dc-3615-4ae8-8790-c27e665735bf
- [S3] Ecoticias (2010), cupo de 4 kg en Mariola y Font Roja: https://www.ecoticias.com/naturaleza/35016_medio-ambiente-regula-la-recogida-sostenible-de-setas-en-los-parques-naturales-de-mariola-y-la-font-roja
- [S4] Nueva Ley Forestal CV (ago. 2026): https://www.esdiario.com/comunidad-valenciana/castellon/260831/196599/perez-llorca-anuncia-nueva-ley-forestal-comunidad-valenciana.html
- [S5] Murcia, MicoPlus y cotos privados: https://www.ecoticias.com/medio-ambiente/127828_murcia-arranca-proyecto-micoplus-regularizar-recoleccion-setas · ordenanza de Cehegín (Aranzadi): https://www.aranzadilaley.es/ordenanzas-municipales/documento.php?d=LE0000514276_20130712.HTML
- [S6] MITECO, Inventario Español de Conocimientos Tradicionales, *L. deliciosus* (sanguifluus calcícola): https://www.miteco.gob.es/content/dam/miteco/es/biodiversidad/temas/inventarios-nacionales/iect_lactarius_deliciosus_tcm30-164130.pdf
- [S7] *L. vinosus* / *L. sanguifluus* (Mycocharentes): https://www.mycocharentes.fr/pdf1/1272.pdf
- [S8] *H. latitabundus* en pinares calizos de *P. nigra* y *P. halepensis* (La Rioja): https://www.larioja.org/medio-ambiente/es/reserva-biosfera/valores/naturaleza/valores-naturales/45_setaslocalizacion.ficheros/633897-451899_HydrophorusLimacinus.pdf · llenegues: https://beteve.cat/medi-ambient/llenegues-bolets-llenega-negra-blanca/
- [S9] Orden 15/11/2016 CLM: https://docm.jccm.es/docm/eli/es-cm/o/2016/11/15 · resumen: https://serraniadeguadalajara.com/regulacion-de-la-recoleccion-de-setas-silvestres-en-los-montes-de-la-comunidad-autonoma-de-castilla-la-mancha/ · https://vlex.es/vid/orden-15-11-2016-774565357
- [S10] Prohibición cautelar de *T. equestre* (Orden SCO/3303/2006): https://www.consumer.es/?p=196814
- [S11] OSRM demo: https://router.project-osrm.org · Nominatim: https://nominatim.openstreetmap.org
- [S12] Turmas (*T. claveryi*) y *Helianthemum*, Univ. de Murcia: https://digitum.um.es/xmlui/bitstream/10201/51390/1/Las_Trufas_del_Desierto_o_Turmas.pdf (403 desde curl; citado por el buscador) · https://link.springer.com/10.1007/s13593-019-0596-9
- Datos: ICV ArcGIS https://carto.icv.gva.es/arcgis/rest/services/tm_medio_ambiente · CKAN https://dadesobertes.gva.es · IDERM https://mapas-gis-inter.carm.es/geoserver/wfs · MITECO BDN https://www.miteco.gob.es/es/biodiversidad/servicios/banco-datos-naturaleza/informacion-disponible/enp_descargas.html · EFFIS, IGN, IGME y GBIF como en `pipeline/fuentes.yaml` · Geofabrik https://download.geofabrik.de/europe/spain.html
