# Factores de fructificación, trucos de campo y datos abiertos — investigación 2026-10-14

Alcance: sierras a ≤2 h de Marbella. Contrasta el modelo actual (`especies.yaml`, `idoneidad.py`,
`semaforo.ts`, `calibracion.md`) con foros, literatura y datos abiertos. No se ha tocado código.
Etiquetas de evidencia: **[E]** estudio revisado por pares · **[G]** guía técnica/manual oficial ·
**[F]** foro/recolector/vídeo · **[X]** folclore. Referencias numeradas al final.

## 0. Resumen del modelo actual (para situar las mejoras)
- Idoneidad = árbol × rampa de altitud × orientación (umbría/solana ±15 %) × penalización de
  pendiente (>35° → ×0,5) × suelo. Orientación y pendiente son factores **independientes**.
- Semáforo: un episodio ≥X mm en ≤3 días abre una ventana de 8–20 días si las medias de 10 días de
  Tmin/Tmax están en rango. No mira la humedad acumulada, el nº de días de lluvia, el viento seco
  ni la estación del año.
- La calibración GBIF da lift 2,3–3,5 en aereus y caesarea; el resto tiene n<10 y no se puede juzgar.

## 1. Conocimiento de campo (foros, recolectores, guías locales)

**Momento tras la lluvia**
- "Dos semanas tras la lluvia" es la regla popular, pero un recolector de Cádiz/Sevilla matiza que,
  con la temporada ya en marcha, "un par de días de lluvia y posterior calor" bastan y no hay que
  esperar 15 días [F, 1]. Esto encaja con la literatura: el primer brote necesita recargar el suelo;
  los siguientes responden antes (§2).
- Plazos que da un recolector en prensa: seta de cardo ~15 d, boletus 20–25 d, níscalo 30–40 d
  [F, 2]. Una ficha de níscalo dice 3–4 semanas tras una lluvia que empape [G, 3]. Para *A. caesarea*
  circulan "15–20 mm y esperar 18–22 días" [F, 4], dato sin estudio detrás.
- La mejor brotada que recuerda el mismo forero (2017) vino así: tormentas tempranas, luego varios
  días seguidos de lluvia abundante y, al final, dos semanas de **levante flojo anticiclónico, cálido
  y húmedo**. Si a la lluvia le siguen vientos fríos de N–NW, "la cosa cambia mucho" [F, 1]. Otro
  forero: lo que piden casi todas es humedad, temperatura y "que no haya viento demasiado seco" [F, 1].
- Altitud a lo largo de la temporada: "al empezar la temporada las busco en más altura; cuando va
  avanzando voy bajando" [F, 1]. Es coherente con un umbral térmico que baja de cota con el otoño.

**Microhábitat por especie**
- *B. aereus*: un árbol grande y bien micorrizado puede dar una cesta entera, mientras que los de
  alrededor no dan nada [F, 5]. Es un hongo temprano: hay brote de primavera (mayo–junio) si la
  primavera es lluviosa, y el principal en otoño [F, 6][G, 7]. Es abundante en Aracena y Los
  Alcornocales y menos frecuente en Málaga y Sevilla [G, 7]. Primer brote con calor = muchas larvas
  de mosca [F, 5].
- *A. caesarea*: encinar, alcornocal, quejigar y castañar. Se usa el **brezo** (*Erica*) como planta
  indicadora y es tardía tras la lluvia [F, 8]. Los huevos salen semienterrados.
- *A. ponderosa* (gurumelo): febrero–abril con pico en marzo, bajo encina o alcornoque **con jara**
  (*Cistus ladanifer/crispus/monspeliensis*), en suelos pobres, compactos y pedregosos de esquisto o
  granito, pH ~6. Necesita luz y sale en el borde de los "calos" (rodales productivos). Con poca
  reserva de agua en el suelo responde a ~15 mm cada 15–21 días. El huevo tarda 3–7 días en abrirse
  [G, 9]. Zonas locales citadas: Ubrique, Jimena, Gaucín, Genalguacil [G, 10].
- *Cantharellus*: alcornocal, quejigar y masas mixtas con pino en Los Alcornocales [G, 11]. Mejor en
  enclaves frescos (vaguadas, canutos).
- Níscalos: *L. deliciosus* en pinar de suelo ácido o bien drenado; *L. sanguifluus*/*vinosus* en
  pinar sobre caliza [G, 3][G, 12]. En Málaga la temporada va de septiembre a enero [G, 3]. Aguanta
  más frío que *Boletus* y releva a los boletus termófilos al avanzar el otoño [G, 13].
- *Macrolepiota procera*: claros, bordes, pastizal; no en bosque cerrado [G].
- *Pleurotus eryngii*: raíces de *Eryngium campestre* en pastizales, cunetas y caminos ganaderos [G, 2].
- *Terfezia*: bajo *Helianthemum* en primavera (abril–mayo) [E, 14].
- Incendios: un recolector dice que en las zonas quemadas de los últimos veranos no sale ningún
  micorrícico [F, 5]. Lo confirma un estudio: 134 kg/ha sin quemar, 36 kg/ha al año del fuego y
  109 kg/ha a los 5 años [E, 15].
- Niebla de levante: en Los Alcornocales las nieblas que forma el levante al chocar con las sierras
  del Aljibe mantienen la humedad incluso en verano, sobre todo en los **canutos** [G, 11]. Es un
  argumento físico (menos evaporación); no hay estudio que lo ligue a la producción de setas.

**Cómo encuentran sitios intactos** (tácticas, no factores del modelo): buscar lejos de aparcamientos y
pistas, ya que el vídeo de El Pedroso muestra lo contrario, aereus "a 200 m del coche" en día de
estreno [F, 16]. También repasar árboles concretos ya conocidos, porque el rodal se repite año tras año
[F, 5][G, 9]. La capa `distancia_acceso.tif` sirve para esto como filtro opcional, no como factor.

## 2. Literatura científica: relaciones cuantitativas utilizables

| Fuente | Resultado | Uso en nuestro modelo |
|---|---|---|
| Karavani et al. 2018, *Agric. For. Meteorol.* 248 [E, 17] | *P. pinaster*, 28 parcelas, 2008–15. La producción depende del tiempo **del mismo mes**, salvo la lluvia, que actúa con **~1 mes de retraso**. El **nº de días de lluvia** sep+oct+nov predice mejor que los mm. La humedad del suelo de octubre es el mejor predictor microclimático (AUC 0,93–1,0). Tmax alta en sep–oct frena el inicio y Tmin baja en nov–dic cierra la temporada. | Semáforo: añadir días de lluvia y humedad del suelo acumuladas en 30 días; no fiarse solo de un episodio de 3 días. |
| Martínez de Aragón et al. 2007, *Ann. For. Sci.* [E, 18] | La producción anual de micorrícicos y comestibles se explica por **P − ETP de septiembre y octubre** y por la Tmin del suelo de agosto. | Índice de balance hídrico P − ET0 en 30 días; ET0 ya viene en Open-Meteo. |
| Bonet et al. 2008, *Ann. For. Sci.* / 2010, *CJFR* 40:347 [E, 19] | *P. sylvestris* (24 parcelas): la producción es máxima con un **área basimétrica de ~20 m²/ha** y aumenta con la altitud y la orientación norte. La variación entre años sigue a la lluvia de otoño. | Factor de densidad del dosel con un óptimo intermedio (ver §3, FCC). |
| de-Miguel et al. 2014, *For. Ecol. Manage.* 330:218 [E, 20] | La probabilidad de que salgan setas sube con la **orientación norte** y baja en solana, y **la diferencia norte/sur crece con la pendiente**. En umbría la producción sube un poco con la pendiente y en solana baja claramente (datos con pendiente ≤38 %). Óptimo de área basimétrica: 10–15 m²/ha en *P. halepensis* y 35–40 m²/ha en *P. pinaster*. La altitud cuenta dentro de cada tipo de pinar (positiva en los pinares bajos, con un óptimo en los altos). | Sustituir orientación × pendiente independientes por una interacción. |
| Collado et al. 2019, *Sci. Total Environ.* 689:602 [E, 21] | Solo en sitios mediterráneos secos, la producción de micorrícicos va con el crecimiento de la madera tardía, y ambos responden a la lluvia de verano y otoño. | Refuerza el peso de la lluvia de verano y otoño en el sur. |
| Salerni, Paoli & Perini 2023, *Ital. J. Mycol.* 52:76 [E, 22] | *B. edulis* bajo *Abies alba*: los días con ≥20 mm (R20) influyen en la producción de los 21 días siguientes. Un **golpe de calor de ~+8 °C** sobre la media frena la producción en parcelas sin aclarar. | Episodio de 20–25 mm y ventana de hasta 21 días (ya están bien). Añadir una regla de golpe de calor. |
| Tahvanainen 2020 (tesis, Finlandia, pícea) [E, 23] | *B. edulis*: óptimo con ~25 m²/ha y masa de 25–30 años. La lluvia de agosto suma; la de julio y la integral térmica de agosto restan. | Solo como analogía. **Ojo:** Perplexity atribuyó estas cifras a Martínez-Peña 2012 (España) y es un error. |
| Terfezia: huerto *H. almeriense* × *T. claveryi*, 15 años, *Agron. Sustain. Dev.* 2019 [E, 24] | Hay dos periodos clave: **septiembre–octubre** (índice de aridez) y **finales de marzo**. El potencial hídrico del suelo de otoño a primavera es el factor dominante. En campo natural, la cosecha va con la lluvia acumulada de octubre a diciembre. | Semáforo de criadillas: antecedente de otoño más marzo, no un episodio de 3 días. |
| Manual Baixo Alentejo (gurumelo) [G, 9] | ~15 mm cada 15–21 días. Un buen año fue ~20 mm cada 15 días de mediados de febrero a finales de abril. Por debajo de 12 °C de media la producción se alarga. | Regla de gurumelo: lluvias periódicas, no un episodio aislado. |
| Incendio, 7.º CFE [E, 15] | −73 % de producción al año 1 y −19 % al año 5. | Penalizar las celdas quemadas en ≤5 años para las especies micorrícicas. |

Lectura de conjunto: con lluvia de otoño suficiente, lo que más explica qué sitios producen es la
humedad del suelo que se mantiene (cuántos días llueve, P − ETP, retención). Detrás van la densidad
del dosel con un óptimo intermedio y la orientación, que pesa más cuanto más pendiente hay. Ningún
estudio da un umbral universal en mm. El episodio de 20–25 mm es razonable como disparador, pero
debería ir acompañado de una condición de humedad acumulada.

## 3. Datos abiertos para incorporar estos factores

- **MFE ya descargado (WFS IEPNB `foto_fija_mfe:ff_tipo_bosque`)**: sus atributos incluyen
  `nm_fccarb` (fracción de cabida cubierta arbolada, %), `nom_e1` (estado de masa: Monte bravo /
  Latizal / Fustal), `nm_o1` (ocupación de la especie 1), `nb_evento` + `fc_evento` ("Procede de
  incendio con/sin fecha", cortas) y `nb_tipestr` ("Superficies arboladas quemadas"). En una muestra
  de 20×20 km en la Serranía, unos 16 % de los polígonos vienen de incendio. Licencia: MITECO,
  reutilización con atribución. Coste: ninguna descarga nueva.
  https://geoserver.iepnb.es/geoserver/wfs
- **TWI, acumulación de flujo y vaguadas**: se derivan del MDT25 que ya tenemos (pysheds, richdem o
  WhiteboxTools). Licencia IGN/CNIG CC BY 4.0. https://centrodedescargas.cnig.es
- **Distancia a cauces**: red hidrográfica IGN (BTN25 o "Red hidrográfica") o REDIAM/DERA hidrografía,
  ambas CC BY 4.0. https://centrodedescargas.cnig.es · https://portalrediam.cica.es/descargas
- **Humedad y temperatura del suelo y ET0 diarias**: **Open-Meteo**, la misma API que usa el
  semáforo. Comprobado hoy: `soil_moisture_3_to_9cm`, `soil_moisture_9_to_27cm`,
  `soil_temperature_6cm`, `et0_fao_evapotranspiration`, `relative_humidity_2m` y `visibility`, con
  `past_days=30`. Licencia CC BY 4.0. https://open-meteo.com/en/docs
- **Lluvia observada en rejilla**: AEMET OpenData (requiere API key gratuita, reutilización con
  atribución) y ERA5-Land de Copernicus (licencia Copernicus, libre con atribución). Solo harían falta
  si el reanálisis de Open-Meteo falla en la sierra. https://opendata.aemet.es ·
  https://cds.climate.copernicus.eu
- **Incendios**: perímetros REDIAM 2008–2022 por WFS (catálogo geonetwork, id
  933fa6f2-1316-4e99-9baa-49c86d0cfc0c; licencia por confirmar en la ficha, REDIAM suele usar
  CC BY 4.0) y EFFIS burnt areas (CC BY 4.0) para años recientes. https://effis.jrc.ec.europa.eu
- **Altura y densidad del dosel con LiDAR**: nubes PNOA-LiDAR Andalucía 2020-21 (1,5 pt/m², teselas
  LAZ de 2×2 km) en REDIAM e IGN; el CHM se calcula como MDS − MDT. Es más preciso que el MFE pero
  pesado de procesar. CC BY 4.0.
- **Coberturas abiertas** (parasol, cardo, criadillas): SIOSE Andalucía (REDIAM) / SIOSE-CNIG,
  clases pastizal, matorral y mosaicos, CC BY 4.0. El MFE `nb_tipestr` (Herbazal-Pastizal,
  Matorral con arbolado disperso) sirve como primera aproximación sin descargar nada.
- **Niebla**: frecuencia de nubes MODIS a 1 km (EarthEnv, Wilson & Jetz 2016, licencia por confirmar,
  uso académico/no comercial) [25]; en tiempo real, humedad relativa y visibilidad de Open-Meteo.
- **Ganado**: no hay capa abierta útil a escala de celda (REGA no es espacial). Se descarta.
- **Zonificación de espacios protegidos (Zonas de Reserva, PORN)**: REDIAM, "Zonificación de
  espacios naturales protegidos". Complementa `protegido.tif`.

## 4. Normativa de recolección vigente (zona del mapa)
- **No hay decreto autonómico.** El "Proyecto de Decreto por el que se regula el aprovechamiento de
  setas y trufas silvestres en Andalucía" está en elaboración desde 2015 [26]. Lo que rige son
  **resoluciones provinciales** de las Delegaciones Territoriales, basadas en el art. 31.2 de la
  Ley 8/2003 de Flora y Fauna y en el Reglamento Forestal (Decreto 208/1997). Desde 2026 se basan
  también en la nueva **Ley 3/2026 de Montes de Andalucía**.
- **Málaga**: Resolución de 23-09-2026, BOJA n.º 196 de 08-10-2026, **vigente hasta el
  31-05-2027** [27], leída en el texto íntegro. Sin autorización para autoconsumo con estas
  condiciones: **≤3 kg/persona/día**; nada de rastrillos, escardillas ni azadas, ni remover el
  mantillo; no coger setas inmaduras y respetar las no comestibles o pasadas; **prohibido de noche**
  (orto y ocaso según el IGN, sin linternas); cesta de mimbre o similar. Gratuita en montes públicos
  de la Junta, **salvo en las Zonas de Reserva de los ENP**, que exigen autorización previa, y salvo
  aviso en contra del Plan Anual de Aprovechamientos. En fincas privadas hace falta permiso del
  propietario. Los montes con aprovechamiento micológico adjudicado se rigen por su propia norma. La
  Delegación puede cerrar montes temporalmente (incendios, caza, obras). Prohibido circular a motor
  campo a través, por cortafuegos o por vías pecuarias. El incumplimiento supone sanción y decomiso.
- **Cádiz** (Grazalema, Los Alcornocales): la última que he encontrado es la Resolución de
  13-11-2019 (BOJA 222, de 18-11-2019) [28]. Mismo condicionado: 3 kg, de día, sin herramientas,
  Zonas de Reserva con autorización y carteles. **No he podido confirmar si hay una resolución
  2025/26 para Cádiz**: hay que verificarlo antes de mostrarlo como vigente. En Grazalema, el acceso a
  la Zona de Reserva (Pinsapar) ya exige un permiso del Centro de Visitantes de El Bosque.
- **Granada** (vertiente de Tejeda-Almijara-Alhama): fuentes secundarias dan 5 kg/día; **sin
  verificar en BOJA**.
- **Parque Nacional Sierra de las Nieves** (Ley 9/2021, BOE-A-2021-10958) [29]: la ley tipifica como
  infracción leve "la recolección sin autorización de especies de la flora silvestre". No nombra los
  hongos, pero lo prudente es tratarla como **recolección con autorización**, a falta de un PRUG que
  diga otra cosa. La app debería marcar el parque nacional y las Zonas de Reserva como "requiere
  autorización / no recolectar".

## 5. Recomendaciones ordenadas
Impacto: A/M/B. Esfuerzo: S (≤1 día), M (2–4 días), L (>1 semana).

| # | Mejora | Impacto | Evidencia | Datos / licencia | Esfuerzo |
|---|---|---|---|---|---|
| 1 | **Humedad acumulada en el semáforo**: exigir, además del episodio, P − ET0 a 30 días > umbral **o** `soil_moisture_9_to_27cm` por encima de su percentil local, y contar los días de lluvia ≥1 mm en 30 días. Así un otoño seco con una sola tormenta no se pone en verde. | A | E (Karavani, Martínez de Aragón) | Open-Meteo, CC BY 4.0 (ya integrada) | M |
| 2 | **Densidad y edad del dosel desde el MFE**: factor FCC con óptimo intermedio (p. ej. 1,0 entre 40–75 %, 0,6 por debajo de 20 % o en cobertura casi total; ajustar por especie: pino carrasco más claro, pinaster más denso). Factor estado: Fustal 1,0 · Latizal 0,8 · Monte bravo 0,4. | A | E (Bonet, de-Miguel) | MFE WFS ya descargado, MITECO | S |
| 3 | **Penalizar incendios** en micorrícicas: ×0,3 al año 1–2, ×0,6 a los 3–5 años, usando `nb_evento`/`fc_evento` del MFE, más perímetros REDIAM/EFFIS para fuegos posteriores a la foto fija. | A en zonas quemadas (Sierra Bermeja 2021) | E + F | MFE; REDIAM WFS; EFFIS CC BY 4.0 | S–M |
| 4 | **Interacción orientación × pendiente**: escalar el ±15 % de orientación con la pendiente (0 en llano, ±25 % a partir de 20°) en lugar de dos factores independientes. Aplicarla también a las "indiferentes" con la mitad de peso. | M | E (de-Miguel 2014) | MDT25 existente | S |
| 5 | **Golpe de calor y viento seco** en el semáforo: Tmax de un día ≥ media de 10 días + 8 °C, o HR mínima < 30 % durante ≥2 días tras la lluvia → amarillo ("el viento seco la quema"). | M | E (Salerni 2023, Karavani) + F | Open-Meteo | S |
| 6 | **Temporada por especie y temperatura por cota**: añadir meses activos (aereus/reticulatus también en mayo–junio; gurumelo febrero–abril; níscalo octubre–enero; criadillas marzo–mayo) y evaluar el semáforo por banda de altitud con un gradiente de −0,65 °C/100 m. Así se reproduce el "empiezo arriba y voy bajando". | A (menos verdes falsos) | E + F | ninguno nuevo | M |
| 7 | **TWI / vaguadas / distancia a cauces** como modulador por tipo de año: si la humedad acumulada (#1) es baja, sumar en vaguadas y umbrías y restar en lomas; si es alta, neutro o ligera ventaja de solana. | M | F + E indirecta (humedad del suelo) | MDT25 + IGN/REDIAM hidrografía, CC BY 4.0 | M |
| 8 | **Especies nuevas**, por orden: *Lactarius* (pino × suelo ácido=deliciosus / básico=sanguifluus, FCC media, ventana 20–35 d, frío tolerable); *A. ponderosa* (encina/alcornoque + jaral del MFE/SIOSE, suelo ácido, regla de 15 mm/15 d en febrero–abril); *Cantharellus* (alcornoque/quejigo, umbría + TWI alto); *Macrolepiota* (FCC 10–40 % o borde de bosque y pastizal); *P. eryngii* (pastizal/herbazal SIOSE, sin árbol); *Terfezia* (matorral bajo/pastizal, suelo básico, antecedente de septiembre–octubre + marzo). | A (utilidad) | G/E variable | MFE, SIOSE (CC BY 4.0), MDT | M c/u |
| 9 | **Capa legal**: Zonas de Reserva (zonificación REDIAM) y Parque Nacional Sierra de las Nieves marcados como "requiere autorización"; recordatorio de 3 kg, de día y sin rastrillo en la ficha. | A (legal) | Norma | REDIAM, CC BY 4.0 | S |
| 10 | Niebla de levante (EarthEnv o HR/visibilidad) como bonus de humedad en el Aljibe | B | G (sin estudio de producción) | EarthEnv (licencia por confirmar) | M |
| 11 | CHM LiDAR en lugar del FCC del MFE | B–M | E | PNOA-LiDAR, CC BY 4.0 | L |

Calibración: rehacer el lift GBIF tras #2–#4. Si las observaciones de aereus y caesarea se concentran
en Fustal con FCC media, el factor queda validado. Para las especies con n<10, buscar más registros
(iNaturalist ya entra vía GBIF; Observation.org) o anotar hallazgos propios.

## 6. Folclore que NO debe entrar en el modelo
- **Fase lunar** [X]: los propios foreros no se ponen de acuerdo ("yo no creo en lo de la luna" frente
  a "para mí es relevante") [1] y no hay ningún estudio que la respalde.
- **"La tercera lluvia" como recuento** [X]: lo que hay detrás es la humedad acumulada (#1). Se modela
  con P − ET0 y días de lluvia, no contando episodios.
- **"Siempre dos semanas"** [X]: el plazo depende de la especie y de si el suelo ya estaba cargado.
  Mejor ventanas por especie más la humedad acumulada.
- **El levante es bueno o malo per se** [X]: solo el levante flojo y húmedo tras la lluvia es
  favorable. El viento seco, sea de donde sea, es malo y se modela con HR (#5), no con la dirección
  del viento.
- **Truenos y tormentas eléctricas "que hacen salir setas"**, **cortar frente a arrancar** y
  "**si la dejas, el año que viene habrá más**" [X/F]: no influyen en la idoneidad de una celda.
- **Plantas indicadoras sueltas** (brezo para tanas) [F]: útiles en el campo, pero el MFE no
  cartografía el brezo con fiabilidad. No meterlas como factor salvo que haya una capa de matorral fiable.

## 7. Limitaciones de esta investigación
- Exa y Reddit no estaban activos en agent-reach (doctor: `off`). Se usaron Jina Reader, YouTube vía
  yt-dlp (solo transcripciones), WebSearch y Perplexity. Los vídeos no se han visto con la skill
  `watch` (frames): lo que se cita de ellos es lo que se dice en voz, no lo que se ve.
- No he encontrado hilos de foros específicos de Málaga con cifras de días por especie: la parte [F]
  es en gran medida de Cádiz/Sevilla/Huelva y de ámbito nacional.
- No se han verificado el texto completo de Bonet 2010, de Alday 2017 ni de Martínez-Peña 2012.

## Fuentes
1. Foro Micológico, "Cuando salir a buscar setas" (forero de Cádiz/Sevilla). https://www.foromicologico.es/index.php?topic=32680.0
2. Zamora24horas, "Otoño llega con la cesta de mimbre en la mano". https://www.zamora24horas.com/provincia/otono-llega-cesta-mimbre-mano
3. Micomapa, ficha *Lactarius deliciosus*. https://www.micomapa.com/es/especies/lactarius-deliciosus
4. La Casa de las Setas, *Amanita caesarea*. https://lacasadelassetas.com/blog/en/amanita-caesarea-oufs-de-roi-oronjas-tanas/
5. YouTube, José Núñez Naturaleza, "Los primeros Boletus aereus del otoño 2021". https://www.youtube.com/watch?v=Q83pV-JTVIc
6. Fungipedia foro, "boletus aereus". https://www.fungipedia.org/comunidad/foro/foro-general/69236-boletusaereus.html
7. Universidad de Córdoba, ficha *Boletus aereus*. http://www.uco.es/aerobiologia/hongos/setas/boletus%20aereus.htm
8. YouTube, Aprendiendo Micología 3.0, *Amanita caesarea*. https://www.youtube.com/watch?v=dACYKYcnsTQ
9. Manual para a gestão dos recursos micológicos silvestres do Baixo Alentejo (MICOSYLVA). https://micosylva.pfcyl.es/sites/default/files/documentos/manualparaagestaodosrecursosmicologicossilvestresdobaixoalentejo.pdf
10. Micomapa, *Amanita ponderosa*. https://www.micomapa.com/es/especies/amanita-ponderosa
11. Sur in English, "Autumn mushroom foraging season, Alcornocales" (2024). https://www.surinenglish.com/andalucia/autumn-mushroom-foraging-season-alcornocales-natural-park-20241023065732-nt.html
12. Ecología Verde, tipos de níscalos. https://ecologiaverde.elperiodico.com/tipos-de-niscalos-5500.html
13. MICOCYL, partes micológicos 04-11-2021 y 28-10-2024. https://www.micocyl.es/sites/default/files/editor/parte_mico_20211104.pdf · https://micocyl.es/sites/default/files/editor/parte_mico_20241028.pdf
14. Terfezia/Helianthemum, Persoonia 17 (2002) y estudios UM. https://repository.naturalis.nl/pub/531859/PERS2002017004009.pdf
15. 7.º Congreso Forestal Español, producción micológica tras incendio. https://7cfe.congresoforestal.es/sites/default/files/actas/7CFE01-417.pdf
16. YouTube, Joaquín Milla, "Boletus aereus en alcornocal" (El Pedroso). https://www.youtube.com/watch?v=8-sV7uJl4Zo
17. Karavani A. et al. 2018, Agric. For. Meteorol. 248:432–440, doi:10.1016/j.agrformet.2017.10.024. https://medfor.eu/sites/default/files/editor/karavani_et_al_final.pdf
18. Martínez de Aragón J. et al. 2007, Ann. For. Sci. 64. https://annforsci.biomedcentral.com/articles/10.1051/forest:2007089 · https://hal.science/hal-00930664/document
19. Bonet J.A. et al. 2008 (Ann. For. Sci.) y 2010, Can. J. For. Res. 40:347–356, doi:10.1139/X09-198. https://jukuri.luke.fi/items/3e57d03a-91b4-42e4-b36b-c033c0879214/full
20. de-Miguel S. et al. 2014, For. Ecol. Manage. 330:218–227, doi:10.1016/j.foreco.2014.07.014. https://cris.ctfc.cat/docs/upload/27_431_De-Miguel%20et%20al-%202014.pdf
21. Collado E. et al. 2019, Sci. Total Environ. 689:602–615, doi:10.1016/j.scitotenv.2019.06.471. https://repositori.udl.cat/items/748181eb-3e9e-40f9-a8dd-99e4fc6f8028
22. Salerni E., Paoli L., Perini C. 2023, Ital. J. Mycol. 52:76–88, doi:10.6092/issn.2531-7342/16464. https://italianmycology.unibo.it/article/download/16464/15846/65590
23. Tahvanainen V. 2020, Dissertationes Forestales 291. https://www.dissertationesforestales.fi/pdf/10325
24. "The crop of desert truffle depends on agroclimatic parameters during two key annual periods", Agron. Sustain. Dev. 2019, doi:10.1007/s13593-019-0596-9. https://digitum.um.es/digitum/handle/10201/128131
25. Wilson A.M., Jetz W. 2016, PLoS Biol 14(3):e1002415 (EarthEnv cloud). https://www.earthenv.org/cloud
26. Junta de Andalucía, Proyecto de Decreto de setas y trufas (normativa en elaboración). https://www.juntadeandalucia.es/servicios/normativa/normas-elaboracion/detalle/70787.html
27. BOJA 196, 08-10-2026, Resolución 23-09-2026 DT Sostenibilidad y Medio Ambiente Málaga. https://www.juntadeandalucia.es/boja/2026/196/BOJA26-196-00003-13150-01_00344382.pdf
28. BOJA 222, 18-11-2019, Resolución 13-11-2019 DT Cádiz, recogida de hongos. https://juntadeandalucia.es/boja/2019/222/18
29. Ley 9/2021, de 1 de julio, Parque Nacional de la Sierra de las Nieves. https://www.boe.es/buscar/act.php?id=BOE-A-2021-10958
30. Open-Meteo Forecast API (variables de suelo). https://open-meteo.com/en/docs · MFE WFS IEPNB: https://geoserver.iepnb.es/geoserver/wfs · REDIAM descargas: https://portalrediam.cica.es/descargas · CNIG: https://centrodedescargas.cnig.es · EFFIS: https://effis.jrc.ec.europa.eu
