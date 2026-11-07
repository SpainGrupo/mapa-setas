# Semáforo v3: probabilidad estimada por zona (2026-11-07)

Script: `app/scripts/calibrar-semaforo.mts` (todas las cifras de este informe salen de él). Código: `app/src/semaforo.ts`.
Comparación con v2: copia congelada en `app/scripts/calibracion/semaforo-v2.ts` (la de 282f4e6).

```
node scripts/calibrar-semaforo.mts --rejilla --diag   # citas, controles, rejilla y diagnóstico (desde app/)
node scripts/calibrar-semaforo.mts --campo            # casos de campo con la Forecast API, como la app
node scripts/calibrar-semaforo.mts --ranking          # cuánto cambia el Top 10 de cada especie hoy
```

## Por qué

El semáforo v2 usaba cortes duros. Un día después del fin de la ventana ya era rojo, y 0,2 °C fuera del rango
daba amarillo. Dos hallazgos de campo lo contradecían:

- iNaturalist 412643652: *Amanita caesarea* el 03/11 en Venta Pula (Ojén). El 07/11 los 4 sitios de oronja más
  cercanos salían en amarillo. La ventana del 19/10 se daba por pasada (rojo) y el semáforo caía al «esperar» de la
  lluvia prevista el 09/11. Además, «máximas frías 19,8 °C; favorable 20–30».
- 07/11, pinar junto a la A-355 en Monda (36.6364, −4.8054): *Lactarius sanguifluus* y *Suillus*. Los Suillus
  salían en amarillo en sus 150 sitios.

## Modelo v3

probabilidad = P_MAX × tiempo × temperatura × humedad × estrés × temporada (entera, 0–100; sin ella en gris).

| Factor | Regla | Parámetro elegido |
|---|---|---|
| Techo | ni con todo a favor es seguro | P_MAX 0,9 |
| Tiempo, rampa | sube linealmente los días previos a `ventana_dias[0]`, nunca antes de 0,3 × `ventana_dias[0]` | 10 días; inicio 0,3 |
| Tiempo, meseta | 1 en `[ventana_dias[0], ventana_dias[1]]` | — |
| Tiempo, caída | lineal hasta 0 a fin + max(10, 0,4 × ancho) días | 10 días; 0,4 |
| Temperatura | por cada media de 10 días: max(0, 1 − desvío/6 °C) | 6 °C |
| Humedad acumulada insuficiente | × factor | 0,65 |
| Golpe de calor o aire seco tras el episodio | × factor | 0,7 |
| Fuera de temporada | × factor; con lluvia ≥ 1,5 × episodio y suelo húmedo, × 0,45 (máximo 41 %, amarillo como en v2) | 0,2 / 0,45 |
| Color | verde ≥ 50, amarillo ≥ 20, rojo < 20 | 50 / 20 |

Manda el episodio pasado que más probabilidad da hoy (a igualdad, el más reciente). La lluvia prevista abre otra
ventana, pero no baja la cifra de hoy. Si la ventana aún no ha abierto, la temporada se mira en el mes en que abre.

Lo que cambia en la app: el «esperar» de v2 (ventana sin abrir) ahora es rojo con `desde`, porque hoy la probabilidad
es baja. El calendario lo sigue leyendo como «Empieza en ~X días» y el selector como «su ventana aún no abre». El
amarillo se rotula «Puede salir» (antes «Esperar»). La cifra «≈ 62 %» sale en Hoy (por seta, por sitio y en la
sublista de cada zona), en la tarjeta del mapa, en la lista de Zona, en la tarjeta del mapa de Hoy y en el aviso diario.

## Calibración

Muestra: 281 citas fechadas (oronja 46, boletos 55, níscalos 60, Suillus 60, Pleurotus 60), una por especie, día y
celda de 0,1°, desde 1995, precisión ≤ 5 km. Salen de `pipeline/data/marbella/out/citas.geojson` (generado
2026-11-07, 1.881 registros, sha256 d15bc4f067c9) con la semilla 20261107. Controles: los mismos puntos en 3 fechas
al azar del mismo año (843; a más de 20 días de la cita, meses secos incluidos). «Controles en temporada» son los
que caen en los meses de la especie (254).

Meteo: Open-Meteo Archive API, mismas variables diarias que `app/src/meteo.ts` (30 días antes y 16 después de cada
fecha), temperatura llevada a la cota de la cita (−0,65 °C/100 m). La humedad del suelo del archivo es 7–28 cm (ERA5),
no 9–27 cm. 114 celdas y 552 tramos, en caché en `pipeline/data/marbella/cache/meteo-historica/` (fuera de git).
Reglas por especie: las de la región Marbella, sin tocar.

| Conjunto | n | v2 verde | v2 ≥ amarillo | v3 verde | v3 ≥ amarillo | v3 mediana |
|---|---|---|---|---|---|---|
| Citas | 281 | 27 % | 79 % | 46 % | 63 % | 41 % |
| Controles (todo el año) | 843 | 4 % | 34 % | 8 % | 18 % | 0 % |
| Controles en temporada | 254 | 12 % | 59 % | 25 % | 35 % | 0 % |
| Citas · oronja | 46 | 13 % | 74 % | 35 % | 50 % | 19,5 % |
| Citas · boletos | 55 | 35 % | 76 % | 56 % | 69 % | 72 % |
| Citas · níscalos | 60 | 33 % | 85 % | 47 % | 60 % | 29 % |
| Citas · Suillus | 60 | 27 % | 80 % | 45 % | 67 % | 42,5 % |
| Citas · Pleurotus | 60 | 23 % | 80 % | 47 % | 65 % | 43 % |

AUC citas frente a controles: v2 0,760 y v3 0,763. Solo frente a controles en temporada: v2 0,632 y v3 0,675.

Cómo leerlo:

- v3 pone en verde casi el doble de citas (46 % frente a 27 %). Los controles quedan en rojo en un 82 % (v2: 66 %).
- El «≥ amarillo» de v2 (79 %) parece mejor, pero ese amarillo era sobre todo el «esperar», que también cubría el
  59 % de los controles en temporada. No distinguía. Con v3, en temporada, la cifra separa mejor las citas de los
  días al azar: AUC 0,675 frente a 0,632.
- Diagnóstico (`--diag`): el 21 % de las citas cae entre 7 y 3 días antes del inicio de la ventana (controles en
  temporada: 12 %) y el 11 % en la semana siguiente a su fin (controles: 7 %). Por eso la rampa y la caída son más
  largas que en la propuesta inicial. El 17 % de las citas no tiene ningún episodio en los 30 días de la serie
  (controles en temporada: 46 %).
- Citas en rojo con v3: 105. Por motivo: fuera de temporada 26, seco 22, lluvia reciente aún lejos de su ventana
  21, solo lluvia prevista 17, temperatura muy fuera de rango 12 y ventana terminando 7.
- Humedad y estrés apenas se pueden calibrar con el archivo: solo 3 citas tienen humedad insuficiente y 13 estrés.
  Sus factores (0,65 y 0,7) son los orientativos del diseño. Cambiarlos entre 0,5 y 0,75 no mueve las cifras.

Rejilla (un parámetro cada vez sobre el elegido; tabla completa en la salida de `--rejilla`):

| Variante | citas verde | citas ≥ amarillo | controles ≥ amarillo | ctrl. temporada ≥ amarillo | AUC | AUC temporada |
|---|---|---|---|---|---|---|
| **elegida** | 46 % | 63 % | 18 % | 35 % | 0,763 | 0,675 |
| propuesta inicial (rampa 3, caída 7, escala 4, sin inicio) | 39 % | 53 % | 16 % | 29 % | 0,711 | 0,653 |
| rampa 3 | 43 % | 59 % | 17 % | 32 % | 0,738 | 0,664 |
| inicio de rampa 0 (desde el día de la lluvia) | 47 % | 65 % | 19 % | 37 % | 0,773 | 0,674 |
| caída mín. 7 | 45 % | 60 % | 18 % | 34 % | 0,757 | 0,677 |
| escala temp. 4 | 43 % | 59 % | 17 % | 32 % | 0,745 | 0,663 |
| escala temp. 8 | 49 % | 65 % | 19 % | 37 % | 0,771 | 0,680 |
| fuera con lluvia fuerte 0,6 | 48 % | 63 % | 19 % | 35 % | 0,760 | 0,677 |
| umbrales 45/20 | 49 % | 63 % | 18 % | 35 % | 0,763 | 0,675 |
| umbrales 50/15 | 46 % | 67 % | 23 % | 39 % | 0,763 | 0,675 |

Decisiones: se eligen valores redondos en la zona donde la mejora se aplana (rampa 10, caída 10, escala 6). «Inicio
de rampa 0» y «escala 8» dan algo más, pero darían ~33 % el mismo día de la lluvia (oronja) o casi no penalizarían
3–4 °C fuera de rango. Se renuncia a ese punto. Los umbrales se quedan en 50/20: bajar el amarillo a 15 sube los
controles en amarillo más que las citas.

## Casos de campo (Forecast API, consulta del 2026-11-07 12:34 UTC)

| Caso | Especie | Sitio más cercano (km) | Fecha | v2 | v3 |
|---|---|---|---|---|---|
| Oronja, Venta Pula (Ojén) | *A. caesarea* | 36.6037, −4.8219 (2,7) | 03/11 | amarillo | verde 63 % |
| | | | 07/11 | amarillo | amarillo 43 % |
| | | 36.6395, −4.8932 (6,2) | 03/11 / 07/11 | amarillo / amarillo | verde 63 % / amarillo 39 % |
| | | 36.5208, −4.7585 (11,7) | 03/11 / 07/11 | verde / amarillo | verde 90 % / verde 63 % |
| | | 36.6185, −5.0213 (15,4) | 03/11 / 07/11 | amarillo / amarillo | verde 63 % / amarillo 40 % |
| Monda, A-355 (36.6364, −4.8054) | *L. sanguifluus* | 36.6245, −4.8112 (1,4), y los 2 siguientes | 07/11 | amarillo | amarillo 41 % |
| | *S. collinitus* | 36.6246, −4.8090 (1,4), y los 2 siguientes | 07/11 | amarillo | verde 57 % |
| | *S. bellinii* | 36.6245, −4.8112 (1,4), y los 2 siguientes | 07/11 | amarillo | verde 57 % |

- Oronja el 03/11: verde en los 4 sitios. Hoy, 07/11, queda en amarillo alto (39–43 %) en 3 de ellos y verde en el
  cuarto. La ventana del 19/10 acabó el ~04/11 y la caída va restando. Lo que más pesa es «aire muy seco desde el 25/10»
  (× 0,7). La oronja salió igualmente el 03/11, así que este factor quizá sea demasiado severo. Una sola
  observación no basta para cambiarlo. Las máximas de 19,8 °C ya solo restan un 3 % («casi en rango: resta poco»).
- *L. sanguifluus* hoy: 41 %. Está en plena ventana (lluvia del 18/10, a 20 días), pero resta dos veces: solo 3 días
  de lluvia en 30 (pide 4) y el aire seco.
- *Suillus*: 57 %, verde. La ventana del 19/10 terminó el ~06/11 y el aire seco resta.

Los tres casos quedan en verde o en amarillo alto, y también en los tests (`semaforo.test.ts`, fixture real del punto
meteo 38 en `app/src/__fixtures__/meteo-punto38-2026-11-07.json`).

## Ranking

La puntuación del día usa ahora un factor continuo: 0,1 + 0,9 × min(1, p/90). Con la previsión del 07/11, `--ranking`
da estos resultados:

- Con los mismos estados v3, pasar del factor por estado al factor por probabilidad conserva de media 8,3 de los
  10 primeros sitios. El n.º 1 sigue igual en 15 de las 24 especies.
- El cambio completo v2 → v3 conserva de media 4,3 de 10, y en algunas especies (*B. aereus*, oronja, *Cantharellus*,
  *Lepista*, *Craterellus*…) solo 0–2. El salto viene sobre todo de los estados: muchas especies pasan de rojo o
  amarillo a verde en unos puntos meteo y no en otros, y eso reordena el Top.

## Alicante (2026-11-07)

Medición, no recalibración: **los parámetros del semáforo v3 son los de Marbella y no se tocan.** Se ha ejecutado el mismo script con `node scripts/calibrar-semaforo.mts --region alicante` (citas de `pipeline/data/alicante/out/citas.geojson`, 1241 registros, sha256 `5ff3031bb0d1`; reglas de especie del `manifest.json` de Alicante; caché de meteo histórica en `pipeline/data/alicante/cache/meteo-historica/`; semilla 20261107). Mismo procedimiento que arriba: una cita por especie, día y celda de 0,1°, tres controles al azar del mismo año, Open-Meteo Archive.

Muestra: 205 citas (oronja 12, boletos 13, níscalos 60, Suillus 60, Pleurotus 60) y 615 controles en 112 celdas. Los grupos son los de Marbella; en Alicante oronja y boletos tienen pocas citas fechadas (la zona es «sin hábitat» para ellas), así que esos dos grupos no concluyen nada. Las citas salen del radio de 200 km de la región, no solo de la isócrona de 2 h.

| Conjunto | n | v2 verde | v2 ≥ amarillo | v3 verde | v3 ≥ amarillo | v3 mediana % |
|---|---|---|---|---|---|---|
| Citas | 205 | 19 % | 58 % | 34 % | 46 % | 14 |
| Controles (todo el año) | 615 | 3 % | 26 % | 5 % | 11 % | 0 |
| Controles en temporada | 156 | 11 % | 50 % | 21 % | 27 % | 0 |
| Citas fuera de los meses de la especie | 36 | 0 % | 11 % | 0 % | 11 % | 0 |
| Citas · níscalos | 60 | 13 % | 53 % | 27 % | 33 % | 0 |
| Controles · níscalos | 180 | 2 % | 28 % | 4 % | 13 % | 0 |
| Citas · Suillus | 60 | 28 % | 67 % | 50 % | 65 % | 46 |
| Controles · Suillus | 180 | 3 % | 32 % | 8 % | 15 % | 0 |
| Citas · Pleurotus | 60 | 17 % | 60 % | 27 % | 43 % | 13,5 |
| Controles · Pleurotus | 180 | 4 % | 18 % | 5 % | 9 % | 0 |

**AUC, citas frente a controles:** v2 0,679 y v3 0,690 (Marbella: 0,760 y 0,763). **Solo frente a controles en temporada:** v2 0,556 y v3 0,623 (Marbella: 0,632 y 0,675).

Lectura: v3 mejora a v2 también en Alicante (+0,011 en el AUC global, +0,067 en temporada), pero el modelo discrimina menos que en Marbella (0,69 frente a 0,76; con controles en temporada 0,62 frente a 0,68). Los níscalos son el grupo débil: solo el 33 % de las citas llega a amarillo y la mediana de probabilidad es 0 %; de las 110 citas en rojo, 42 por «seco», 33 por fuera de temporada y 25 por lluvia sin ventana. Es coherente con que las reglas de tiempo de los níscalos están ajustadas a Marbella y que en Alicante el rovellón (*L. sanguifluus*) tiene su propia temporada y sus propios umbrales de lluvia (las reglas de `especies.yaml` para él son heurísticas, sin cifra local). Suillus sale bien (65 % de las citas ≥ amarillo). Con 205 citas de un solo otoño-tipo de meteo y sin intervalos de confianza, la diferencia de 0,01 en el AUC global no es concluyente. Nada de esto cambia el semáforo; queda como punto de partida si se quiere una calibración propia de Alicante.

## Pendiente

- La app pide 30 días pasados a Open-Meteo. Para especies con ventana larga (níscalos y *Tricholoma* 20–40 días,
  *Terfezia* 20–45), un episodio de hace más de 30 días no se ve. Subir `past_days` en `meteo.ts` es un cambio
  aparte y no se ha tocado.
- Humedad y estrés no se pueden calibrar con el archivo ERA5: la serie de humedad del suelo no es la misma y hay pocos
  casos. Conviene revisarlos con más hallazgos de campo fechados.
- Las citas no son ausencias: el porcentaje es una estimación heurística ordenada, no una frecuencia observada de
  «encontrar algo». La calibración mide si separa citas de días al azar, no la probabilidad absoluta.
