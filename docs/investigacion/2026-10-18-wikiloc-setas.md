# Wikiloc como fuente de rutas de setas (zona Marbella), 18/10/2026

Pregunta de Alexander: ¿la gente guarda en Wikiloc rutas de setas en la zona (≤2 h de Marbella) y cuadran con nuestro modelo?

**Respuesta corta:** sí las hay, pero son pocas y la mayoría de títulos no dicen más que «setas». Muchas cuadran con el modelo, aunque la muestra es pequeña (22 rutas de setas dentro de la región modelada). El mejor dato que sale de aquí es un posible hueco del modelo: los níscalos de los pinares de San Roque y del Campo de Gibraltar. Los términos de Wikiloc impiden copiar sus datos a la app; solo podemos enlazar.

## 1. Límites legales y de uso (revisados antes de buscar nada)

- **robots.txt** (www.wikiloc.com, leído el 18/10/2026): permite casi todo a `User-agent: *`, salvo `/wikiloc/map.do` (el buscador), `geocode.do`, login y alta. **Bloquea por completo** a los rastreadores de IA: `AnthropicBot`, `GPTBot`, `CCBot`, `Google-Extended`, `PerplexityBot`, `Diffbot`.
- **Condiciones de uso** (`/wikiloc/terms_en.html`):
  - Prohíben usar «robots, spiders o cualquier otro mecanismo, programa o herramienta» para acceder a la web o copiarla de forma contraria a su uso ordinario y personal sin autorización expresa de Wikiloc.
  - Wikiloc reclama el **derecho *sui generis* sobre su base de datos**. Prohíbe extraer o reutilizar la totalidad o una parte sustancial de sus contenidos, y también extraer de forma repetida o sistemática partes no sustanciales.
  - Solo se permite el uso personal y no comercial. Reproducir, distribuir, transformar o reutilizar contenidos para otros fines está prohibido salvo autorización.
  - La propiedad intelectual de cada ruta (track, waypoints, fotos y texto) es del usuario que la sube.
- **Qué se hizo en consecuencia:**
  - Nada de scraping ni de peticiones con script: un `curl` a robots.txt chocó con el reto de Cloudflare y no se intentó saltarlo.
  - Solo navegación manual con el navegador integrado, sin sesión ni cuenta y a ritmo humano (pausas de 3 s o más entre páginas). En total unas 45 páginas: robots, condiciones, 7 búsquedas y 31 fichas de ruta.
  - No se descargó ningún GPX.
  - Para cada ficha se leyeron título, municipio, fecha, descripción, nombres de waypoints y las coordenadas del punto de inicio y de los waypoints que la propia página muestra.
- **Oferta de usar la cuenta Premium de Alexander (por el coordinador, a mitad de tarea):** no la usé ni descargué los GPX. Las condiciones prohíben expresamente acceder o copiar con «programa o herramienta» sin autorización de Wikiloc, y prohíben la extracción sistemática aunque sea de partes pequeñas. Eso cumple la condición de parada del propio encargo («si los términos prohíben la extracción automatizada incluso para usuarios, solo navegación manual de una muestra menor»). Que Alexander baje a mano algún GPX para uso personal sí entra en lo permitido.
- **Datos personales:** no se guardan nombres de usuario ni autores. Un waypoint llevaba nombres de personas y no se transcribió.

## 2. Cómo clasifica Wikiloc estas rutas

- **No hay actividad «Recolección de setas» ni «Setas».** Hay más de 80 actividades: senderismo, paseo, MTB, coche, observación de flora, de fauna… Las rutas de setas se suben casi siempre como **Senderismo** y a veces como Paseo, Coche, MTB u Observación de flora.
- Tampoco hay un waypoint de tipo «seta». Los hallazgos van como waypoints **Flora**, **Foto** o **Waypoint** genérico, y lo que identifica la especie es el **nombre** que pone el usuario («Chanterella», «Aéreus», «9 proceras», «Boletus», «Lepistas», «Níscalo»).
- **Búsqueda:** el buscador de texto (`map.do?q=…`) acepta un recuadro geográfico. Se usó sw 36,0 −6,0 / ne 37,2 −3,9, que cubre la región sin llegar a Sevilla. Recuentos del 18/10/2026:

| Término | Rutas | Comentario |
|---|---|---|
| setas | 269 | Mezcla de recolección con topónimos («Las Setas» en Ronda/Grazalema y Algodonales). Sin recuadro, lo dominan las Setas de Sevilla |
| micológica | 51 | Jornadas micológicas (Monda, Cortes, Benalup, Montes de Málaga) y senderos micológicos de Granada |
| níscalos | 23 | Sobre todo Pinar del Rey (San Roque) y Los Caños/Barbate |
| boletus | 14 | Campo de Gibraltar (Comares, Bujeo, Palancar, Valdeinfierno), Jimena e Igualeja |
| cesarea | 5 | Arcos/Fuensanta, Ubrique, Manilva |
| gurumelos | 0 | — |
| tanas | — | La búsqueda es difusa y devuelve «Tío Cañas», «Las Cañas»… No sirve |
| tentullo | no buscado | Queda pendiente |

En Cádiz las *Amanita caesarea* también se llaman **«yemas»**, y ese término aparece en una ruta de Valdeinfierno.

## 3. Muestra (31 rutas, sin datos personales)

- **Clase:** «setas» si el título, la descripción o los waypoints indican recolección; «dudosa» si «setas» parece un topónimo o solo aparece en la URL.
- **Grupo modelo:** el ráster con que se cruza. «boletus» es el máximo de aereus, aestivalis, edulis y pinophilus; «lactarius» el máximo de deliciosus y sanguifluus; «cualquiera» el máximo de las 22 especies.
- **Idoneidad:** valor 0–100 en tres medidas: en el píxel de inicio, el máximo en una ventana de 700 m (unos ±300 m) alrededor del inicio, y el máximo sobre inicio más waypoints.
- **Sitio más cercano:** el de `sitios.json` de ese grupo, medido desde el inicio.
- **«Fuera de región»:** el punto cae fuera de `region_base.geojson` (isócrona de 2 h).

| # | Ruta (enlace) | Municipio | Realizada | Especies citadas | Inicio (lat, lon) | Clase | Grupo modelo | Idon. inicio / 700 m / máx. ruta | Sitio más cercano |
|---|---|---|---|---|---|---|---|---|---|
| 1 | [Castañazo boletus Igualeja](https://es.wikiloc.com/rutas-a-pie/castanazo-boletus-igualeja-30164656) | Igualeja | noviembre 2018 | boletus | 36.628, -5.122 | setas | boletus | 0 / 79 / 0 | 1.4 km |
| 2 | [Arcos - Cesarea y Boletus](https://es.wikiloc.com/rutas-senderismo/arcos-cesarea-y-boletus-124131573) | Arcos de la Frontera | enero 2023 | amanita caesarea; boletus | 36.754, -5.720 | setas | amanita caesarea<br>boletus | fuera de región<br>fuera de región | —<br>— |
| 3 | [Jimena setas](https://es.wikiloc.com/rutas-senderismo/jimena-setas-30954209) | Jimena de la Frontera | noviembre 2018 | setas (sin especie) | 36.519, -5.542 | setas | cualquiera | 0 / 94 / 92 | 1.0 km |
| 4 | [Poli-Gays-Humaina-Setas-Reina-Málaga-1-2-22](https://es.wikiloc.com/rutas-mountain-bike/poli-gays-humaina-setas-reina-malaga-1-2-22-91812801) | Málaga (Montes de Málaga) | enero 2022 | — | 36.730, -4.415 | dudosa | cualquiera | 0 / 83 / 0 | 4.1 km |
| 5 | [Paseo de setas y esparragos](https://es.wikiloc.com/rutas-senderismo/paseo-de-setas-y-esparragos-61150137) | Ubrique | noviembre 2020 | setas (sin especie) | 36.653, -5.447 | setas | cualquiera | fuera de región | — |
| 6 | [FYM COIN RUTA LAS SETAS](https://es.wikiloc.com/rutas-senderismo/fym-coin-ruta-las-setas-96484498) | Alhaurín el Grande | febrero 2022 | — | 36.619, -4.730 | dudosa | cualquiera | 86 / 89 / 93 | 0.8 km |
| 7 | [Cómpeta Setas](https://es.wikiloc.com/rutas-senderismo/competa-setas-15638455) | Cómpeta | noviembre 2016 | setas (sin especie) | 36.833, -3.977 | setas | cualquiera | 0 / 94 / 0 | 1.7 km |
| 8 | [Romeral+Setas](https://es.wikiloc.com/rutas-senderismo/romeralsetas-30407590) | Antequera | noviembre 2018 | setas (sin especie) | 37.023, -4.571 | setas | cualquiera | 0 / 0 / 0 | 1.2 km |
| 9 | [Setas en la cancha](https://es.wikiloc.com/rutas-senderismo/setas-en-la-cancha-161551459) | Jimena de la Frontera | febrero 2024 | cantharellus (waypoint «Chanterella») | 36.506, -5.550 | setas | cantharellus cibarius | 64 / 72 / 74 | 1.1 km |
| 10 | [Alcornocales-ruta de setas 2](https://es.wikiloc.com/rutas-senderismo/alcornocales-ruta-de-setas-2-123128885) | Ubrique | enero 2023 | setas (sin especie) | 36.613, -5.428 | setas | cualquiera | 0 / 0 / 83 | 1.3 km |
| 11 | [Setas con papi](https://es.wikiloc.com/rutas-senderismo/setas-con-papi-161279268) | Jimena de la Frontera | febrero 2024 | cantharellus («recogida chantarelles») | 36.486, -5.534 | setas | cantharellus cibarius | 38 / 82 / 48 | 0.7 km |
| 12 | [Setas castellar](https://es.wikiloc.com/rutas-senderismo/setas-castellar-43180979) | Castellar de la Frontera / San Roque | noviembre 2019 | setas (sin especie) | 36.285, -5.393 | setas | cualquiera | 77 / 82 / 77 | 3.3 km |
| 13 | [De setas en sierra Ventas de Zafarraya](https://es.wikiloc.com/rutas-senderismo/de-setas-en-sierra-ventas-de-zafarraya-61911458) | Ventas de Zafarraya (Granada) | noviembre 2020 | setas (sin especie) | 36.956, -4.122 | setas | cualquiera | 0 / 73 / 66 | 1.1 km |
| 14 | [Setas Carratraca](https://es.wikiloc.com/rutas-senderismo/setas-carratraca-21923950) | Carratraca | enero 2018 | setas (sin especie) | 36.868, -4.779 | setas | cualquiera | 49 / 93 / 49 | 0.8 km |
| 15 | [Montes de málaga setas](https://es.wikiloc.com/rutas-senderismo/montes-de-malaga-setas-30193180) | Málaga (Olías, Montes de Málaga) | noviembre 2018 | setas (sin especie) | 36.819, -4.379 | setas | cualquiera | 91 / 94 / 97 | 0.3 km |
| 16 | [Pinar del rey. Níscalos muy grandes y 2 boletus](https://es.wikiloc.com/rutas-senderismo/pinar-del-rey-niscalos-muy-grandes-y-2-boletus-44624221) | San Roque (Pinar del Rey) | diciembre 2019 | lactarius (níscalo); boletus | 36.251, -5.412 | setas | lactarius<br>boletus | 0 / 0 / 0<br>5 / 8 / 5 | 10.3 km<br>5.8 km |
| 17 | [Monte Comares. Boletus. Nov 2020](https://es.wikiloc.com/rutas-senderismo/monte-comares-boletus-nov-2020-60613825) | Algeciras / Tarifa (Pelayo) | noviembre 2020 | boletus aereus; pleurotus; macrolepiota procera | 36.084, -5.508 | setas | boletus | 38 / 42 / 89 | 1.7 km |
| 18 | [Ruta boletus](https://es.wikiloc.com/rutas-senderismo/ruta-boletus-30209631) | Jimena de la Frontera | noviembre 2018 | boletus | 36.390, -5.590 | setas | boletus | 0 / 80 / 0 | 1.0 km |
| 19 | [Primeros. Boletus del año](https://es.wikiloc.com/rutas-senderismo/primeros-boletus-del-ano-240728279) | Algeciras (El Cuartón) | noviembre 2025 | boletus | 36.076, -5.536 | setas | boletus | 79 / 81 / 79 | 2.0 km |
| 20 | [Boletus Menacha](https://es.wikiloc.com/rutas-senderismo/menacha-boletus-44515058) | Algeciras (Rinconcillo) | diciembre 2019 | boletus | 36.163, -5.468 | setas | boletus | 0 / 2 / 2 | 6.0 km |
| 21 | [Cesáreas más frondoso](https://es.wikiloc.com/rutas-senderismo/cesareas-mas-frondoso-124134837) | Arcos de la Frontera (Fuensanta) | enero 2023 | amanita caesarea | 36.755, -5.706 | setas | amanita caesarea | fuera de región | — |
| 22 | [¿Amanita cesarea?](https://es.wikiloc.com/rutas-senderismo/amanita-cesarea-123294784) | Ubrique | enero 2023 | amanita caesarea (con interrogación) | 36.613, -5.469 | setas | amanita caesarea | fuera de región | — |
| 23 | [Ermita de San Adolfo desde Manilva (slug «caesarea-area»)](https://es.wikiloc.com/rutas-senderismo/caesarea-area-155863312) | Manilva | diciembre 2023 | amanita caesarea (solo en el slug) | 36.392, -5.260 | dudosa | amanita caesarea | 0 / 0 / 0 | 9.6 km |
| 24 | [Ruta setera niscalos](https://es.wikiloc.com/rutas-senderismo/ruta-setera-niscalos-31011302) | San Roque | diciembre 2018 | lactarius (níscalo) | 36.274, -5.373 | setas | lactarius | 0 / 0 / 0 | 13.5 km |
| 25 | [Con papi nov. 2024: 2 niscalos 6 champi 1 lepista](https://es.wikiloc.com/rutas-senderismo/con-papi-nov-2024-2-niscalos-6-champi-1-lepista-193059984) | Barbate (Los Caños de Meca) | noviembre 2024 | lactarius (níscalo); agaricus (champi); lepista | 36.205, -5.977 | setas | lepista nuda<br>lactarius | fuera de región<br>fuera de región | —<br>— |
| 26 | [Los manjares 3 niscalos minilepistad](https://es.wikiloc.com/rutas-senderismo/los-manjares-3-niscalos-minilepistad-247353184) | Barbate (Los Caños de Meca) | enero 2026 | lepista nuda; lactarius (níscalo) | 36.194, -5.995 | setas | lepista nuda<br>lactarius | fuera de región<br>fuera de región | —<br>— |
| 27 | [Lagar de Torrijos. Jornada micologica](https://es.wikiloc.com/rutas-senderismo/lagar-de-torrijos-jornada-micologica-61335678) | Málaga (Montes de Málaga, Olías) | noviembre 2020 | varias (pedo de lobo, champiñón…) | 36.826, -4.364 | setas | cualquiera | 0 / 97 / 93 | 0.7 km |
| 28 | [Jornadas micologicas de Monda: El Mojon](https://es.wikiloc.com/rutas-senderismo/jornadas-micologicas-de-monda-el-mojon-154219846) | Monda | noviembre 2023 | setas (pocas: sin lluvia desde mediados de octubre) | 36.618, -4.829 | setas | cualquiera | 90 / 93 / 90 | 0.8 km |
| 29 | [Ruta XXI Jornadas Micológicas Cortes de la Frontera](https://es.wikiloc.com/rutas-senderismo/ruta-xxi-jornadas-micologicas-cortes-de-la-frontera-123887900) | Cortes de la Frontera (El Colmenar) | enero 2023 | setas (sin especie) | 36.571, -5.409 | setas | cualquiera | 80 / 95 / 80 | 0.9 km |
| 30 | [Valdeinfierno cierre temporad](https://es.wikiloc.com/rutas-senderismo/valdeinfierno-cierre-temporad-153883150) | Los Barrios | noviembre 2023 | boletus; amanita caesarea («yemas») | 36.228, -5.587 | setas | amanita caesarea<br>boletus | 0 / 69 / 0<br>0 / 50 / 0 | 1.5 km<br>3.4 km |
| 31 | [Niebla freestyle boletus](https://es.wikiloc.com/rutas-senderismo/niebla-freestyle-boletus-56881298) | Algeciras / Tarifa (El Bujeo) | septiembre 2020 | boletus aereus | 36.087, -5.534 | setas | boletus | 43 / 81 / 86 | 0.8 km |

**Waypoints con especie en el nombre** (los datos más útiles):

| Ruta | Waypoint | Grupo | Idon. punto / 700 m | Sitio más cercano |
|---|---|---|---|---|
| Setas en la cancha (Jimena) | «Chanterella» | cantharellus | 69 / 70 | 1,2 km |
| Setas con papi (Jimena) | «Chantarellas» | cantharellus | 44 / 86 | 0,2 km |
| Monte Comares (Algeciras/Tarifa) | «Aéreus» | boletus aereus | 89 / 90 | 2,9 km |
| Niebla freestyle boletus (El Bujeo) | «Aereus» | boletus aereus | 86 / 91 | 1,4 km |
| Monte Comares | «9 proceras», «Macros» | macrolepiota | 81 y 91 / 94 | 1,6–1,8 km |
| Monte Comares | «Pleurotus» | pleurotus eryngii | 0 / 12 | 2,4 km |
| Boletus Menacha (Algeciras, ~25 m de altitud) | «Boletus» ×2 | boletus | 1–2 / 4 | 5,9 km |
| Ruta setera níscalos (San Roque) | «Níscalos» | lactarius | 0 / 0 | 13,5 km |
| Los manjares (Los Caños, Barbate) | ~33 «Lepistas» y 1 «Níscalo» | lepista / lactarius | fuera de región | — |

## 4. Resultados del cruce

**Proporción base de la zona:** porcentaje de píxeles de la región con idoneidad ≥50. En el píxel: boletus 3,9 %, caesarea 4,1 %, cantharellus 3,5 %, lactarius 1,9 %, cualquiera 23 %. Con la ventana de 700 m: boletus 9,9 %, caesarea 10,4 %, cantharellus 8,6 %, lactarius 7,0 %, cualquiera 51 %.

**Rutas «setas» dentro de la región: 22** (6 caen fuera: Arcos/Fuensanta, Ubrique y Los Caños).

| Grupo | n | % ≥50 en el inicio | lift | % ≥50 en ventana 700 m | lift |
|---|---|---|---|---|---|
| boletus | 8 | 12,5 % | 3,2 | 62,5 % | 6,3 |
| cantharellus | 2 | 50 % | 14 | 100 % | 12 |
| amanita caesarea | 1 | 0 % | — | 100 % | 9,6 |
| lactarius | 2 | 0 % | 0 | 0 % | 0 |
| cualquiera («setas» sin especie) | 11 | 36 % | 1,6 | 82 % | 1,6 |
| waypoints con especie (aereus, cantharellus) | 4 | 75 % | más de 14 | 100 % | más de 10 |

- **Lectura:**
  - El inicio de una ruta suele ser un pueblo o un aparcamiento, y por eso su píxel da 0 a menudo. La ventana de 700 m es la medida justa.
  - Con esa medida, **16 de 22 rutas de setas** tienen idoneidad ≥50 para su grupo cerca del inicio.
  - En boletus, cantharellus y caesarea el lift es de **6 a 12**. Con n de 1 a 8, solo indica que va en la dirección correcta; no tiene valor estadístico.
  - **18 de 24** pares ruta-grupo tienen un sitio nuestro de ese grupo a menos de 2 km.
  - Los cuatro waypoints con especie que cuadran (dos «Aéreus» y dos «Chanterella») caen en idoneidad de 69 a 89, a 0,2–2,9 km de sitios nuestros.

**Posibles huecos del modelo** (rutas de setas en sitios que el modelo puntúa bajo):

1. **Níscalos en el Campo de Gibraltar (San Roque: Pinar del Rey y entorno de Castellar).** Hay 2 rutas con níscalos explícitos y lactarius da 0 en el punto y en la ventana; el sitio de lactarius más cercano está a 10–13,5 km. La búsqueda «níscalos» devuelve unas 5 rutas más en Pinar del Rey y San Roque. Es el hueco más sólido: puede que el modelo de *Lactarius* no reconozca los pinares de *Pinus pinea* y pinaster costeros con alcornoque. **PENDIENTE**: revisar el mapa de árbol y la cubierta en Pinar del Rey.
2. **Pinares costeros de Barbate (Los Caños / La Breña).** Hay 2 rutas con lepistas y níscalos abundantes, y quedan **fuera de la región** de 2 h. No es un fallo del modelo, sino del recorte de la región.
3. **Boletus Menacha (Algeciras, ~25 m, ribera).** Dos waypoints «Boletus» con idoneidad 1–2. Puede ser una identificación genérica (otros boletales de ribera) o un hábitat de galería que el modelo no cubre. Es un caso solo y no basta para cambiar nada.
4. **Pleurotus en Monte Comares (0).** Seguramente no es *P. eryngii*, que vive en pastizal con cardo, sino un *Pleurotus* sobre madera. No es un hueco.
5. **Romeral (Antequera)** da 0 en todas las especies. La ruta no tiene descripción, así que no se puede valorar.

**Sitios top nuestros sin ninguna ruta cerca:** se miró el top 10 por especie y la distancia a la ruta más cercana de la muestra.
- **Boletus edulis, pinophilus y aestivalis** (Sierra de las Nieves, Genal alto, Sierra Bermeja / Los Reales): la mayoría tienen una ruta de la muestra a 2–8 km, que suele ser Igualeja. Algunos pinophilus y edulis quedan a 12–18 km (Tolox/Yunquera, 36,74 −4,96; 36,71 −4,95).
- **Lactarius deliciosus:** sitios top a 9–12 km de cualquier ruta, en el entorno de Alozaina/Yunquera (36,79 −4,87) y Genal (36,56 −5,30) y Sierra Bermeja (36,55 −5,20).
- **Caesarea y aereus:** el top está en Los Alcornocales (Jimena, Castellar, Los Barrios), a 4–8 km de rutas de la muestra. Es coherente.
- Ojo: la búsqueda solo recoge rutas que dicen «setas», «boletus»… en el título, así que la falta de rutas **no indica ausencia de setas**. Indica sobre todo zonas donde la gente no lo publica, entre ellas el Genal y Sierra de las Nieves, con mucho coto privado.

## 5. Recomendación

- **¿Sirve para validar?** Solo como **contraste cualitativo y para encontrar huecos**, no como métrica.
  - n es pequeño: con los términos específicos salen unas 90 rutas en toda la zona, más una parte de las 269 de «setas», y solo unas pocas traen waypoints con especie.
  - Las especies no están verificadas: hay casos de «¿Amanita cesarea?» o de «boletus» genérico.
  - Las fechas son raras: aparecen caesareas en enero.
  - Repetirlo a escala chocaría con las condiciones de uso.
- **¿Podemos usarlo como cita en la app?** **No.**
  - El derecho *sui generis* de Wikiloc sobre su base de datos prohíbe extraer o reutilizar contenidos, incluso de forma sistemática en partes pequeñas.
  - Cada track pertenece a quien lo subió.
  - Meter sus puntos en `citas.geojson` o en la capa de la app sería reutilizar contenido de Wikiloc.
- **¿Como enlace?** **Sí.** Un enlace externo («Ver rutas de setas cerca en Wikiloc») que abra su buscador con el recuadro de la zona es navegación ordinaria y no copia nada. Sin incrustar sus mapas: las condiciones prohíben enlazar directamente a sus teselas.
- **Acciones concretas (no aplicadas; este informe no toca ni el pipeline ni la app):**
  1. Revisar por qué el modelo de *Lactarius* da 0 en Pinar del Rey y el entorno de San Roque. Es el único hueco con dos o más rutas independientes.
  2. Valorar si la región debe incluir los pinares de La Breña / Barbate o dejarlos fuera a propósito.
  3. Para validar en serio, seguir con GBIF/iNaturalist, cuya licencia permite reutilizar los datos con atribución. Wikiloc se puede usar como pista manual: Alexander puede mirar a mano las rutas cercanas antes de una salida.

## Anexo: método reproducible

- Puntos: inicio y waypoints visibles en cada ficha (schema.org y datos de la página), transcritos a mano a un JSONL temporal fuera del repo.
- Cruce con `uv run python` en `pipeline/`:
  - rásteres `pipeline/data/marbella/out/idoneidad_<especie>.tif` (EPSG:25830, 100 m, uint8, 0 = sin hábitat o fuera);
  - máscara de región rasterizada desde `region_base.geojson` (1.753.468 píxeles);
  - ventana de 700 m mediante `maximum_filter(size=7)`;
  - distancias a `pipeline/data/marbella/out/app/sitios.json`, reproyectado a EPSG:25830.
- **Lift** = % de puntos con idoneidad ≥50 dividido entre el % de píxeles de la región con ≥50, usando la misma medida (píxel o ventana) en ambos lados.
- No se guardó ningún GPX ni dato de Wikiloc en el repo.
