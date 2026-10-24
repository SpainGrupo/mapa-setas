# Zonas de setas documentadas en fuentes abiertas, 25/10/2026

Pregunta de Alexander: más rutas y zonas de setas documentadas públicamente, solo de fuentes cuyo uso lo permita, cruzadas con el modelo. Wikiloc queda fuera (ver `2026-10-18-wikiloc-setas.md`); no se ha tocado.

**Respuesta corta**
- Salen **26 zonas o paradas** de 11 fuentes: 21 dentro de las regiones (7 Marbella, 14 Alicante) y 5 informativas en Alhama de Granada, fuera de las 2 h de Marbella.
- **12 puntos** (los de precisión «punto», «paraje» o «cuadrícula» dentro de región) van al GPX `docs/zonas-setas-documentadas.gpx`. Los 9 de precisión municipal quedan solo en la tabla.
- Es una muestra pequeña. Las fuentes abiertas de verdad (Junta, MITECO, publicación científica) dan pocas paradas con coordenada. El resto son artículos de prensa que nombran sierras, no puntos.
- **Cruce con el modelo** (16 pares zona-especie con precisión de paraje o mejor): 4 dan ≥60 en 700 m, 4 entre 30 y 59, 8 por debajo de 30. En un radio de 3 km sube a 12 de 16, porque la mayoría de coordenadas son el centroide de una sierra, no un rodal.
- **Hueco principal: *Lactarius deliciosus* en Alicante.** Mariola (52/53), Maigmó–Carrasqueta (23/51), Guadalest (25/55), Bernia (41/55) y Onil (19/49) quedan por debajo del umbral 60 incluso en 3 km. Lo cita la prensa local en todas. Solo Font Roja lo confirma (87/95).
- **Confirmación fuerte:** Valdeinfierno (Junta) con *Amanita caesarea* 67 y *Macrolepiota procera* 94; Font Roja con *L. deliciosus* 87 y *L. sanguifluus* 91.

## 1. Método

1. Búsqueda web y OSM, a ritmo humano. Solo se leyó el hecho (nombre del paraje, municipio, especies), nunca texto copiado.
2. Coordenadas: las de la propia fuente cuando existen (Junta: ruta de Valdeinfierno y paradas de Alhama); si no, **Nominatim** con una consulta suelta cada 1,5 s y User-Agent identificable (38 consultas en total, sin descargar nada en bloque). Garganta del Candelar: cuadrícula UTM 1 km de la publicación, convertida al centro de la celda.
3. Precisión: `punto` (coordenada de la fuente o lugar puntual), `paraje` (sierra o parque, centroide aproximado), `cuadrícula` (1 km), `municipio` (centroide del casco; no va al GPX).
4. Cruce con `pipeline/data/<región>/out/idoneidad_<especie>.tif` (EPSG:25830, 100 m): máximo de la ventana de 700 m (7×7 celdas) y de 3 km. Umbral de mancha del pipeline = 60 (`sitios.py`). Distancia al sitio más cercano de la misma especie en `app/sitios.json` (haversine) y nº de citas abiertas de esa especie a ≤2 km (`citas.geojson`).
5. Especies: solo las que la fuente nombra. Denominaciones locales mapeadas por mí: rovelló/llenega/níscalo = *L. deliciosus*; esclata-sang = *L. sanguifluus*; seta de cardo = *P. eryngii*; champiñón de campo = *A. campestris*. Es una inferencia, marcada como tal.
6. Reproducible: `cd pipeline && uv run python scripts/zonas_abiertas.py` (datos de las zonas a mano dentro del script; salida `2026-10-25-zonas-setas-abiertas.tabla.json`).

## 2. Fuentes, robots y condiciones

| Fuente | Qué se tomó | robots.txt / condiciones | Uso |
|---|---|---|---|
| **Junta de Andalucía**, Plan CUSSTA, rutas micológicas (7 PDF; 2 en el entorno: Valdeinfierno y Pantaneta de Alhama) | Coordenadas de inicio y paradas, especies de cada parada | Sin bloqueo de `/medioambiente`. Aviso legal: textos con licencia tipo CC BY 3.0 (citar «Información obtenida del Portal de la Junta de Andalucía», no alterar el sentido). FAQ del portal ambiental: reutilización libre con cita de fuente y fecha | Sí. Leídos 2 PDF (lectura manual, guardados por la herramienta en la caché de sesión) |
| **OpenStreetMap** vía Overpass | Nombres de caminos/rutas con términos micológicos | ODbL 1.0, atribución. Overpass: consultas acotadas con User-Agent; las primeras dieron timeout y se partieron en recuadros pequeños (≈14 consultas) | Sí. Solo 2 caminos útiles (ver §5) |
| **MITECO-CENEAM** (ficha de las Jornadas de Monda) | Lugar y fecha | robots: cierra solo URLs con `?` | Sí, solo el hecho |
| **Sinatur** (programa de las V Jornadas de Monda) | Nombre de la finca La Moheda y del pinsapar de La Sepultura | robots: solo `/wp-admin/` | Sí, solo el hecho |
| **Ayuntamiento de Cortes de la Frontera** (programa 2019) | Salida por los «montes de propios» | Sin robots.txt | Sí, solo el hecho |
| **Becerra, Robles y Gaona 2015** (Soc. Gaditana de Hist. Nat.) | Localidad de *Cantharellus ferruginascens*, 750 m, *Quercus canariensis* | Publicación científica; se cita la localidad, no se copia texto | Sí |
| **El Debate**, **El Español**, **salir.com**, **Diario de Alicante**, **Mancomunitat de l'Alcoià i el Comtat** | Nombres de parajes y especies | robots sin bloqueo total ni reglas contra IA (comprobado 25/10) | Sí, solo hechos; sin copiar texto |
| **ABC**, **La Voz Digital**, **Málaga Hoy** | — | robots.txt cierra el sitio a rastreadores de IA (incl. Claude) | **Descartadas.** Aparecieron en resúmenes de buscador. No se usa nada de ellas (se pierden Picacho, Peguera, Montera del Torero, Jarillo y La Moheda de ABC) |
| Picuco, Yumping, otras ofertas comerciales | — | Actividades de pago | No se usan |
| **Wikiloc** | — | ToS prohíben la extracción automatizada | No tocado |

Sin cuentas ni logins en ninguna. No se descargó ningún GPX ni dataset en bloque.

## 3. Resultados

Columna del modelo: idoneidad máxima en 700 m / en 3 km · km al sitio más cercano de la especie en `sitios.json` · citas abiertas de esa especie a ≤2 km.

### Marbella (≤2 h)

| Id | Zona (municipio) | Coord. aprox. · precisión | Especies citadas | Fuente | Modelo: idon. máx. 700 m / 3 km · km al sitio más cercano · citas abiertas ≤2 km |
|---|---|---|---|---|---|
| M01 | Sendero de Valdeinfierno (monte público) (Los Barrios (Cádiz)) | 36.2276, -5.5856 · punto | Amanita caesarea, Boletus aereus, Macrolepiota procera, Pleurotus ostreatus, Cantharellus subpruinosus, Lactarius chrysorrheus | JA-CUSSTA | amanita_caesarea: 67 / 99 · 1.6 km · 2<br>boletus_aereus: 52 / 95 · 3.4 km · 1<br>macrolepiota_procera: 94 / 100 · 1.4 km · 0<br>pleurotus_ostreatus: 45 / 96 · 6.8 km · 0 |
| M07 | P. N. Montes de Málaga (Málaga / Colmenar (Málaga)) | 36.8210, -4.3802 · paraje | níscalo, rebozuelo, Amanita caesarea | DEBATE | lactarius_deliciosus: 25 / 96 · 1.2 km · 1<br>amanita_caesarea: 12 / 87 · 46.2 km · 0 |
| M08 | Finca La Moheda (alcornocal), salida de campo de las Jornadas de Monda (Monda (Málaga)) | 36.6076, -4.8346 · paraje | — | SINATUR-MONDA | sin especie modelable; máx. del modelo: macrolepiota_procera 95, lepista_nuda 91 |
| M09 | Alpujata (zona recreativa), jornadas de Monda (Monda (Málaga)) | 36.6127, -4.8211 · paraje | — | MITECO-MONDA | sin especie modelable; máx. del modelo: macrolepiota_procera 95, boletus_aereus 93 |
| M10 | P. N. Sierra de las Nieves (zona de pinsapar y castañar) (Sierra de las Nieves (Málaga)) | 36.6764, -4.9793 · paraje | níscalo, boletus (genérico) | DEBATE | lactarius_deliciosus: 0 / 70 · 3.8 km · 0 |
| M11 | Montes de propios de Cortes de la Frontera (Cortes de la Frontera (Málaga)) | 36.6171, -5.3427 · municipio | — | CORTES | sin especie modelable; máx. del modelo: tricholoma_portentosum 0, terfezia_arenaria 0 |
| M12 | Garganta del Candelar (cabecera), bosque de niebla de quejigo moruno (Algeciras (Cádiz)) | 36.1131, -5.5498 · cuadricula | Cantharellus ferruginascens | SGHN | sin especie modelable; máx. del modelo: macrolepiota_procera 96, boletus_aereus 93 |

### Alicante (≤2 h)

| Id | Zona (municipio) | Coord. aprox. · precisión | Especies citadas | Fuente | Modelo: idon. máx. 700 m / 3 km · km al sitio más cercano · citas abiertas ≤2 km |
|---|---|---|---|---|---|
| A01 | Carrascal de la Font Roja (Alcoy / Ibi (Alicante)) | 38.6651, -0.5401 · paraje | rovellons, esclatasangs, bolets | SALIR | lactarius_deliciosus: 87 / 95 · 1.0 km · 1<br>lactarius_sanguifluus: 91 / 100 · 3.0 km · 2 |
| A02 | Serra de Mariola (Agres, Cocentaina, Muro d'Alcoi, Bocairent) (Alcoià / Comtat (Alicante)) | 38.6990, -0.6395 · paraje | níscalo, boletus, rebozuelo | DDA | lactarius_deliciosus: 52 / 53 · 6.5 km · 0 |
| A03 | Maigmó–Carrasqueta (Xixona, Tibi, Agost) (L'Alacantí / Alcoià (Alicante)) | 38.5440, -0.5590 · paraje | níscalo, parasol | DDA | lactarius_deliciosus: 23 / 51 · 12.9 km · 0 |
| A04 | Valle de Guadalest (El Castell de Guadalest (Alicante)) | 38.6755, -0.1996 · paraje | níscalos, setas de cardo | SALIR | lactarius_deliciosus: 25 / 55 · 30.5 km · 0<br>pleurotus_eryngii: 0 / 81 · 24.0 km · 0 |
| A05 | Sierra de Aitana (La Marina Baixa / Comtat (Alicante)) | 38.6486, -0.2478 · paraje | esclata-sang, llenega / níscalo, setas de chopo | SALIR | lactarius_sanguifluus: 0 / 93 · 3.4 km · 0<br>lactarius_deliciosus: 0 / 28 · 26.4 km · 0 |
| A06 | Sierra de Bernia (Altea / Callosa d'en Sarrià (Alicante)) | 38.6592, -0.0415 · paraje | níscalos | ESPANOL | lactarius_deliciosus: 41 / 55 · 44.3 km · 0 |
| A07 | Molí l'Ombria (ruta micològica programada) (Banyeres de Mariola (Alicante)) | 38.7076, -0.6638 · punto | — | MANCOM | sin especie modelable; máx. del modelo: suillus_collinitus 96, lepista_nuda 94 |
| A08 | Sierra de Onil (Onil (Alicante)) | 38.6301, -0.6670 · municipio | llenega / níscalo | ESPANOL | lactarius_deliciosus: 19 / 49 · 7.7 km · 0 |
| A09 | Pinares de Confrides y Alcoleja (Confrides / Alcoleja (Alicante)) | 38.6794, -0.2998 · municipio | — | DDA | sin especie modelable; máx. del modelo: suillus_collinitus 91, lepista_nuda 87 |
| A10 | Foia de Castalla (Castalla (Alicante)) | 38.5957, -0.6703 · municipio | champiñones, setas de cardo | ESPANOL | agaricus_campestris: 62 / 64 · 12.0 km · 0<br>pleurotus_eryngii: 68 / 68 · 12.0 km · 0 |
| A11 | Campos de Villena (Villena (Alicante)) | 38.6361, -0.8660 · municipio | champiñones, setas de cardo | ESPANOL | agaricus_campestris: 0 / 86 · 24.5 km · 0<br>pleurotus_eryngii: 0 / 91 · 24.5 km · 0 |
| A12 | Campos de Beneixama (Beneixama (Alicante)) | 38.7009, -0.7641 · municipio | champiñones, setas de cardo | ESPANOL | agaricus_campestris: 0 / 84 · 25.1 km · 0<br>pleurotus_eryngii: 0 / 81 · 25.1 km · 0 |
| A13 | Río Serpis (ribera de chopos) (Alcoià / Comtat (Alicante)) | 38.8467, -0.3203 · municipio | setas de ostra | ESPANOL | sin especie modelable; máx. del modelo: suillus_collinitus 68, lepista_nuda 67 |
| A14 | Cabecera del Vinalopó (Banyeres de Mariola) (Banyeres de Mariola (Alicante)) | 38.7157, -0.6578 · municipio | setas de ostra | ESPANOL | sin especie modelable; máx. del modelo: suillus_collinitus 85, lepista_nuda 81 |

### Informativas, fuera de la región de Marbella

| Id | Zona (municipio) | Coord. aprox. · precisión | Especies citadas | Fuente | Modelo: idon. máx. 700 m / 3 km · km al sitio más cercano · citas abiertas ≤2 km |
|---|---|---|---|---|---|
| M02 | Alhama: La Fuente / barranco de Tutalán (ruta Pantaneta) (Alhama de Granada (Granada)) | 36.9805, -3.9853 · punto | Pleurotus ostreatus, Tricholoma populinum, Lactarius controversus | JA-CUSSTA | fuera de la región |
| M03 | Alhama: Robledal (ruta Pantaneta) (Alhama de Granada (Granada)) | 36.9272, -3.9949 · punto | Lepista nuda, Tricholoma portentosum, Tricholoma equestre, Coprinus comatus | JA-CUSSTA | fuera de la región |
| M04 | Alhama: zona alta de la ruta (entre Robledal y Loma de Castro, sin coordenada propia) (Alhama de Granada (Granada)) | 36.9320, -3.9894 · paraje | Lactarius deliciosus, Lactarius sanguifluus, Boletus aereus, Boletus aestivalis, Lepista nuda | JA-CUSSTA | fuera de la región |
| M05 | Alhama: Cortijo Loma de Castro (era abandonada) (Alhama de Granada (Granada)) | 36.9369, -3.9840 · punto | Pleurotus eryngii, Agaricus campestris | JA-CUSSTA | fuera de la región |
| M06 | «Sendero Micológico» (camino con ese nombre en OSM) (Granada (por confirmar)) | 36.8800, -3.9159 · punto | — | OSM | fuera de la región |

Notas de lectura:
- «sin especie modelable» = la fuente no nombra especie, o nombra una sin capa (rebozuelo, boletus genérico, *Cantharellus ferruginascens*, *Tricholoma equestre*…). En M12, *Cantharellus cibarius* da 85 en 700 m, pero es otra especie y solo sirve de pista del hábitat.
- Alicante no tiene capa de *A. caesarea*, *P. ostreatus* ni *M. procera*; las setas de ostra del Serpis y del Vinalopó y el parasol de Maigmó no se pueden cruzar.
- A11 y A12 (Villena, Beneixama) dan 0 en 700 m porque el centroide es el casco urbano; en 3 km salen 81-91.

## 4. Huecos del modelo y zonas que lo confirman

**Lo confirman**
- Valdeinfierno, quejigal y alcornocal (Junta): *A. caesarea* 67 y *M. procera* 94 en 700 m (99 y 100 en 3 km); sitios del modelo a 1,4-1,6 km.
- Font Roja: *L. deliciosus* 87 y *L. sanguifluus* 91; sitios a 1 y 3 km, y 1 y 2 citas abiertas a ≤2 km.
- Montes de Málaga y Sierra de las Nieves: en 3 km salen 96 (*L. deliciosus*) y 70; el punto central es poco informativo.

**Huecos probables**
1. ***L. deliciosus* en Alicante interior.** Cinco zonas que la prensa local nombra para níscalo no pasan de 55 ni en 3 km. Es coherente con que Alicante solo tenga 84 sitios de la especie. No se cambia nada: antes habría que mirar el perfil de altitud/pinar en la región (como se hizo con San Roque, `2026-10-18-citas-abiertas.md` §4.1) y contrastar con citas propias. Las fuentes son prensa sin puntos exactos.
2. **Valdeinfierno, riberas y canutos:** *P. ostreatus* 45 y *B. aereus* 52 en 700 m. Puede ser el peso de aliso/quejigo en el hábitat; con n=1 ruta no hay base para tocar perfiles.
3. **Montes de Málaga: *A. caesarea*** 12 en 700 m y 87 en 3 km; el sitio más cercano del modelo está a 46 km. Una sola frase de prensa; contrastar con citas propias antes de concluir.
4. **Setas de cardo y champiñón en campos de Castalla, Villena y Beneixama:** 62-91 en 3 km, pero a 12-25 km del sitio más cercano; el modelo las tiene en la comarca, pero no en la ventana exacta (las fuentes solo dan municipio).

**Qué no se puede decir:** que una zona «no tiene setas» o que el modelo «falla» a partir de estas fuentes. Son 16 pares con coordenada aproximada; la señal es un hueco de níscalo en Alicante y poco más.

## 5. Lo que no dio resultado

- **OSM:** unas 14 consultas con términos micológicos (ruta, camino, turismo) en los dos recuadros de las regiones. Solo aparecen «Sendero Micológico» (36,88; -3,92, Granada, fuera de región) y «Sendero al Museo Micológico» (37,36; -3,47, Sierra Nevada, fuera). El resto son falsos positivos («Caseta», una calle «dels Bolets» en Alicante). Ninguna ruta `route=hiking` con nombre micológico en las regiones.
- **Rutas micológicas oficiales andaluzas** (Junta): de las 7, solo Valdeinfierno está en Marbella ≤2 h y Pantaneta de Alhama queda fuera de la isócrona del pipeline (fuera de la región modelada). No hay ruta micológica señalizada oficial en Sierra de las Nieves, Grazalema ni Sierra Bermeja.
- **Generalitat / parques de Alicante:** sin ruta micológica oficial publicada; solo el curso «Bolets del País Valencià» de la Estación Científica de la Font Roja (UA), que no da parajes.
- **Catálogos científicos:** no se encontraron listados de localidades reutilizables. *Hongos del P. N. Los Alcornocales y del Campo de Gibraltar* (SGHN) y *Setas del P. N. Sierra de las Nieves* son libros, no abiertos. IMBA/REDIAM y BDBCV siguen como en `2026-10-18-citas-abiertas.md` (BDBCV ya entra vía GBIF).
- **Paradas sin geocodificar:** pinsapar de La Sepultura (Monda) y Pantaneta/pinar de Alhama sin especies legibles.

## 6. GPX para «Mis sitios»

`docs/zonas-setas-documentadas.gpx`: 12 `wpt` en el formato de `app/src/intercambio.ts` (GPX 1.1, `setas:sitio` con `id` estable derivado del id de zona, `estrellas="1"`, `especie` = primera especie con capa o vacía). Nota de cada punto: «Zona documentada, no garantía», especies citadas por la fuente, hábitat, precisión, fuente con URL y condiciones. Se verificó que `deGPX` lo importa (12 sitios, ninguna nota con la palabra «comestible»). Los puntos de precisión `paraje` son un centroide: úsalos como «aquí por la sierra», no como lugar de la seta.

Atribución: © colaboradores de OpenStreetMap (ninguna coordenada OSM entra en el GPX); coordenadas de Nominatim (ODbL); «Información obtenida del Portal de la Junta de Andalucía» para Valdeinfierno.

## 7. Siguientes pasos posibles
- Decisión de Alexander: abrir una revisión del perfil de *L. deliciosus* en Alicante con las citas propias antes de tocar nada.
- Si hay presupuesto de tiempo: pedir a los ayuntamientos de Los Barrios, Jimena y Monda las rutas de sus jornadas (correo, no scraping).
