---
type: Reference
title: Especies modeladas y grupos
description: Qué especies tiene cada región, sus nombres comunes (ES/RU), su grupo en la app y candidatas aún sin modelar.
tags: [especies, grupos, regiones, app]
timestamp: 2026-10-18T13:00:00Z
---

# Notes

- Taxonomía de grupos: única fuente en `app/src/grupos.ts` (`GRUPOS`). Por región solo salen los grupos con especies en su manifest. La usan el selector «Seta» de Hoy (optgroup + «<grupo>: todo el grupo», top combinado fusionado a 300 m) y los chips de la hoja de especie del mapa (solo filtran la lista; la capa sigue siendo de una especie).
- Fuente de las especies por región: `pipeline/regiones/<region>.yaml` (`especies.activas` / `sin_habitat`) y `pipeline/data/<region>/out/app/sitios.json` (nº de sitios candidatos, a 2026-10-18).
- Los nombres en ruso son solo de referencia (no van a la UI). Los marcados PENDIENTE no están verificados en una fuente.
- Nada de esta tabla afirma comestibilidad (principio-de-seguridad.md).

## Especies modeladas

| Nombre científico (id) | Nombres comunes ES | Nombre común RU | Grupo | Marbella (sitios) | Alicante (sitios) |
|---|---|---|---|---|---|
| Boletus aereus (`boletus_aereus`) | tentullo, hongo negro | бронзовый боровик | Boletus | sí (150) | sí (1; relicto Corbera/El Surar) |
| Boletus aestivalis / reticulatus (`boletus_aestivalis`) | boleto reticulado, boleto estival | боровик сетчатый (летний) | Boletus | sí (150) | sin hábitat |
| Boletus edulis (`boletus_edulis`) | calabaza, hongo blanco | белый гриб | Boletus | sí (20) | sin hábitat |
| Boletus pinophilus (`boletus_pinophilus`) | hongo de pino, boleto pinícola | белый гриб сосновый (боровик сосновый) | Boletus | sí (13) | sin hábitat |
| Amanita caesarea (`amanita_caesarea`) | oronja, tana, yema | цезарский (кесарев) мухомор / гриб | Amanitas | sí (150) | sin hábitat |
| Amanita ponderosa (`amanita_ponderosa`) | gurumelo, grumelo | PENDIENTE (sin nombre ruso establecido conocido) | Amanitas | sí (150) | sin hábitat |
| Lactarius deliciosus (`lactarius_deliciosus`) | níscalo, mízcalo | рыжик настоящий (сосновый) | Níscalos | sí (145) | sí (85) |
| Lactarius sanguifluus (`lactarius_sanguifluus`) | níscalo de sangre, rovellón vinoso (PENDIENTE verificar) | рыжик красный (PENDIENTE verificar) | Níscalos | sí (150) | sí (150) |
| Cantharellus cibarius (`cantharellus_cibarius`) | rebozuelo, cabrilla | лисичка обыкновенная (лисички) | Rebozuelos | sí (150) | sin hábitat |
| Macrolepiota procera (`macrolepiota_procera`) | parasol, galipierno | гриб-зонтик пёстрый | Parasoles | sí (150) | no modelada |
| Pleurotus eryngii (`pleurotus_eryngii`) | seta de cardo | вёшенка степная (королевская) | Setas de cardo | sí (150) | sí (150) |
| Terfezia arenaria (`terfezia_arenaria`) | criadilla de tierra, turma | терфеция, «степной трюфель» | Criadillas y trufas | sí (150) | no modelada |
| Terfezia claveryi (`terfezia_claveryi`) | criadilla, turma | терфеция, «степной трюфель» | Criadillas y trufas | no modelada | sí (150) |
| Suillus collinitus (`suillus_collinitus`) | babosillo, boleto granulado (PENDIENTE verificar) | маслёнок (маслята; especie: PENDIENTE) | Babosillos (Suillus) | sí (150) | sí (150) |
| Hygrophorus latitabundus (`hygrophorus_latitabundus`) | llenega negra, mocosa | гигрофор (especie: PENDIENTE) | Llenegas | no modelada | sí (150) |
| Lepista nuda (`lepista_nuda`) | pie azul | рядовка фиолетовая | Pie azul | sí (150) | sí (150) |
| Agaricus campestris (`agaricus_campestris`) | champiñón de campo | шампиньон обыкновенный (луговой) | Champiñones | sí (150) | sí (150) |
| Hydnum repandum (`hydnum_repandum`) | lengua de gato, lengua de vaca | ежовик жёлтый (выемчатый) | Lenguas de gato (Hydnum) | sí (150) | sí (150) |
| Suillus bellinii (`suillus_bellinii`) | babosillo (PENDIENTE verificar) | маслёнок (especie: PENDIENTE) | Babosillos (Suillus) | sí (150) | no modelada |
| Suillus luteus (`suillus_luteus`) | babosillo con anillo (PENDIENTE verificar) | маслёнок обыкновенный (поздний) | Babosillos (Suillus) | sí (150) | no modelada |
| Suillus granulatus (`suillus_granulatus`) | boleto granulado (PENDIENTE verificar) | маслёнок зернистый | Babosillos (Suillus) | sí (150) | no modelada |
| Russula cyanoxantha (`russula_cyanoxantha`) | carbonera | сыроежка сине-жёлтая | Rúsulas (carbonera) | sí (150) | no modelada |
| Tricholoma portentosum (`tricholoma_portentosum`) | capuchina, ratón | рядовка серая | Capuchinas (Tricholoma) | sí (75) | no modelada |
| Morchella spp. (`morchella_spp`) | colmenilla, cagarria | сморчок (сморчки) | Colmenillas | sí (4) | sí (5) |

Resumen: Marbella 22 especies modeladas (todas con sitios; morchella solo 4). Alicante 11 activas (boletus_aereus con 1 sitio, morchella con 5) y 6 «sin hábitat» en gris (aestivalis, edulis, pinophilus, caesarea, cantharellus, ponderosa).

### Marbella, ampliación del 2026-10-18

Criterio: citas GBIF a ≤200 km de Marbella (consulta 18-10-2026) y ficha de guía con su doble tóxico (o excepción ya aprobada por Alexander). Perfiles en `pipeline/especies.yaml` (bloque «Marbella, especies nuevas») con fuente por línea; lo que no tiene fuente va marcado PENDIENTE. Fiabilidad = validación por bloques de `calibracion.py` (n = citas en tierra dentro de la zona; con n < 10 o lift retenido < 1,3 la app dice «sin validar»).

| Especie | GBIF ≤200 km | n calibración | lift validación | fiabilidad | sitios |
|---|---|---|---|---|---|
| suillus_collinitus | 70 | 35 | 6,88 | buena | 150 |
| lepista_nuda | 158 | 35 | 2,68 | buena | 150 |
| agaricus_campestris | 65 | 24 | 0,97 | baja (sin validar en la app) | 150 |
| hydnum_repandum | 19 | 9 | — (n<10) | sin validar | 150 |
| morchella_spp | 69 (3 especies) | 12 | 0,0 | baja (sin validar) | 4 |
| suillus_bellinii | 78 | 11 | 0,0 (500 m: 3,88) | baja (sin validar) | 150 |
| suillus_luteus | 52 | 2 | — | sin validar | 150 |
| suillus_granulatus | 44 | 9 | — (n<10) | sin validar | 150 |
| russula_cyanoxantha | 44 | 12 | 10,95 | buena | 150 |
| tricholoma_portentosum | 3 | 1 | — | sin validar | 75 |

PENDIENTE de revisar el perfil: S. bellinii (sus citas caen fuera de las celdas buenas a 100 m, no a 500 m) y Morchella (min 400 m y árboles con peso ≤ 0,6: solo un 0,2 % de la zona es «buena»).

Descartadas el 2026-10-18 (no añadidas):
- Tricholoma terreum: decisión de Alexander (ficha tóxica, sin capa).
- Hygrophorus latitabundus: 1 cita GBIF a ≤200 km, en Jaén (fuera de la zona ≤2 h).
- Tuber aestivum (1 cita, Cambil, Jaén), T. melanosporum (0), T. borchii (0): sin evidencia en la zona.
- Calocybe gambosa: 0 citas GBIF a ≤200 km.
- Craterellus cornucopioides (20 citas, Los Alcornocales) y C. lutescens (6): las fuentes no citan doble tóxico (Fichas Micológicas, MicoAragón); entrarían solo con una excepción SIN_CONF aprobada por Alexander. PENDIENTE de su decisión.
- Pleurotus ostreatus (88 citas): AmanitaCesarea.com y First Nature solo citan Pleurotus comestibles; sin doble tóxico documentado. Misma PENDIENTE que Craterellus.
- Con citas pero fuera de este encargo (nueva ficha con dobles tóxicos por documentar): Coprinus comatus (158), Infundibulicybe geotropa (41), Leccinellum lepidum (47), Cantharellus pallens (32), Hygrophorus russula (3). No propuestas: Amanita rubescens (88; doble A. pantherina) y Tricholoma equestre (ficha mortal). Alicante 11 activas (boletus_aereus con 1 sitio, morchella con 5) y 6 «sin hábitat» en gris (aestivalis, edulis, pinophilus, caesarea, cantharellus, ponderosa).

## Candidatas no modeladas aún

No están en el modelo; NO añadir sin el proceso de especies.yaml (ficha, confusión tóxica con ficha en Alicante, citas). Presencia y nombres por verificar salvo indicación.

| Especie | ES | RU | Grupo previsto | Región candidata | Estado |
|---|---|---|---|---|---|
| Tuber melanosporum | trufa negra | чёрный (перигорский) трюфель | Criadillas y trufas | Alicante (interior, encinar calizo) | PENDIENTE: presencia y normativa (cultivo/propiedad) |
| Tuber aestivum | trufa de verano | летний трюфель | Criadillas y trufas | Alicante / Andalucía | PENDIENTE |
| Craterellus cornucopioides / C. lutescens | trompeta de los muertos / angula de monte | вороночник рожковидный | Rebozuelos | Marbella (alcornocal, castañar) | 20 / 6 citas GBIF en la zona; sin doble tóxico documentado: PENDIENTE de excepción de Alexander (ver arriba) |
| Cantharellus en Alicante | rebozuelo | лисички | Rebozuelos | Alicante | hoy «sin hábitat» (INV §2); revisar solo con citas nuevas |
| Hygrophorus russula / H. latitabundus en Marbella | llenega, hongo rosado | гигрофор | Llenegas | Marbella | H. latitabundus: 1 cita (Jaén), descartada; H. russula: 3 (Ronda/Grazalema), PENDIENTE de ficha |
| Tricholoma terreum | negrilla | рядовка землистая | Tricholoma | Alicante | Excluida a propósito (spec §1.3/§3.5: ficha tóxica por decisión de Alexander). No proponer |
| Macrolepiota procera en Alicante | parasol | гриб-зонтик | Parasoles | Alicante | PENDIENTE |
| Amanita caesarea en Alicante | oronja | цезарский гриб | Amanitas | Alicante | hoy «sin hábitat»; no proponer sin citas |
| Calocybe gambosa | perrechico, seta de San Jorge | рядовка майская | (nuevo) | Andalucía (sierras) | 0 citas GBIF a ≤200 km de Marbella (2026-10-18): no se añade |
| Pleurotus ostreatus | seta de ostra | вёшенка обыкновенная | Setas de cardo (o nuevo) | ambas | 88 citas en Marbella; sin doble tóxico documentado: PENDIENTE de excepción de Alexander |
| Tuber aestivum / T. melanosporum / T. borchii | trufa de verano / negra / blanquilla | трюфель | Criadillas y trufas | Marbella | 1 / 0 / 0 citas (la de T. aestivum en Jaén): no se añaden |

# Citations

- app/src/grupos.ts
- pipeline/regiones/marbella.yaml, pipeline/regiones/alicante.yaml
- pipeline/data/marbella/out/app/sitios.json, pipeline/data/alicante/out/app/sitios.json
- app/public/guia/especies.json (nombres comunes ES)
