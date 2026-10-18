---
type: Reference
title: Especies modeladas y grupos
description: Qué especies tiene cada región, sus nombres comunes (ES/RU), su grupo en la app y candidatas aún sin modelar.
tags: [especies, grupos, regiones, app]
timestamp: 2026-10-18T12:00:00Z
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
| Suillus collinitus (`suillus_collinitus`) | babosillo, boleto granulado (PENDIENTE verificar) | маслёнок (маслята; especie: PENDIENTE) | Babosillos (Suillus) | no modelada | sí (150) |
| Hygrophorus latitabundus (`hygrophorus_latitabundus`) | llenega negra, mocosa | гигрофор (especie: PENDIENTE) | Llenegas | no modelada | sí (150) |
| Lepista nuda (`lepista_nuda`) | pie azul | рядовка фиолетовая | Pie azul | no modelada | sí (150) |
| Agaricus campestris (`agaricus_campestris`) | champiñón de campo | шампиньон обыкновенный (луговой) | Champiñones | no modelada | sí (150) |
| Hydnum repandum (`hydnum_repandum`) | lengua de gato, lengua de vaca | ежовик жёлтый (выемчатый) | Lenguas de gato (Hydnum) | no modelada | sí (150) |
| Morchella spp. (`morchella_spp`) | colmenilla, cagarria | сморчок (сморчки) | Colmenillas | no modelada | sí (5) |

Resumen: Marbella 12 especies modeladas (todas con sitios). Alicante 11 activas (boletus_aereus con 1 sitio, morchella con 5) y 6 «sin hábitat» en gris (aestivalis, edulis, pinophilus, caesarea, cantharellus, ponderosa).

## Candidatas no modeladas aún

No están en el modelo; NO añadir sin el proceso de especies.yaml (ficha, confusión tóxica con ficha en Alicante, citas). Presencia y nombres por verificar salvo indicación.

| Especie | ES | RU | Grupo previsto | Región candidata | Estado |
|---|---|---|---|---|---|
| Suillus bellinii / S. collinitus / S. granulatus | babosillo | маслята | Babosillos | Marbella (pinares) | PENDIENTE: comprobar citas GBIF en el área; S. bellinii ya tiene ficha en la guía |
| Tuber melanosporum | trufa negra | чёрный (перигорский) трюфель | Criadillas y trufas | Alicante (interior, encinar calizo) | PENDIENTE: presencia y normativa (cultivo/propiedad) |
| Tuber aestivum | trufa de verano | летний трюфель | Criadillas y trufas | Alicante / Andalucía | PENDIENTE |
| Craterellus cornucopioides / C. lutescens | trompeta de los muertos / angula de monte | вороночник рожковидный | Rebozuelos | Marbella (alcornocal, castañar) | PENDIENTE |
| Cantharellus en Alicante | rebozuelo | лисички | Rebozuelos | Alicante | hoy «sin hábitat» (INV §2); revisar solo con citas nuevas |
| Hygrophorus russula / H. latitabundus en Marbella | llenega, hongo rosado | гигрофор | Llenegas | Marbella | PENDIENTE |
| Tricholoma terreum | negrilla | рядовка землистая | Tricholoma | Alicante | Excluida a propósito (spec §1.3/§3.5: ficha tóxica por decisión de Alexander). No proponer |
| Tricholoma portentosum | capuchina | рядовка серая | Tricholoma | Andalucía oriental | PENDIENTE |
| Macrolepiota procera en Alicante | parasol | гриб-зонтик | Parasoles | Alicante | PENDIENTE |
| Amanita caesarea en Alicante | oronja | цезарский гриб | Amanitas | Alicante | hoy «sin hábitat»; no proponer sin citas |
| Russula cyanoxantha | carbonera | сыроежка сине-жёлтая | (nuevo) | Marbella | PENDIENTE (ficha ya en la guía) |
| Calocybe gambosa | perrechico, seta de San Jorge | рядовка майская | (nuevo) | Andalucía (sierras) | PENDIENTE |
| Pleurotus ostreatus | seta de ostra | вёшенка обыкновенная | Setas de cardo (o nuevo) | ambas | PENDIENTE |

# Citations

- app/src/grupos.ts
- pipeline/regiones/marbella.yaml, pipeline/regiones/alicante.yaml
- pipeline/data/marbella/out/app/sitios.json, pipeline/data/alicante/out/app/sitios.json
- app/public/guia/especies.json (nombres comunes ES)
