# Fichas de Alicante: fuentes y decisiones (2026-10-15)

Dosier de la fase D1 (plan `docs/superpowers/plans/2026-10-15-multi-region-fase-d1-guia-seguridad.md`, Task 1).
Cada URL se comprobó el 2026-10-16 con `curl` (código 200 salvo donde se indica). Las páginas se leyeron enteras;
los textos de las fichas salen de aquí. Abreviaturas de `guia/_build/build.py`: TOX (tabla de toxicidad, Fungipedia),
DON (Hospital Donostia, IT-114), AC (AmanitaCesarea.com), FN (First Nature), SF (Species Fungorum).

Decisiones de Alexander del 2026-10-15 (final del plan) aplicadas aquí: *T. terreum* = ficha `toxica` sin capa;
excepción aprobada para las buscables sin parecida tóxica documentada; se quita «Considerada comestible por la
bibliografía».

URLs comprobadas: AC `tricholoma-terreum`, `tricholoma-equestre`, `morchella-esculenta`, `gyromitra-esculenta`
(200); AC `tricholoma-pardinum`, `hygrophorus-latitabundus`, `clitocybe-dealbata`, `suillus-collinitus` (404; tampoco
existen `tricholoma-tigrinum`, `clitocybe-rivulosa`, `hygrophorus-limacinus`: **no se citan**). FN
`tricholoma-terreum`, `tricholoma-pardinum`, `tricholoma-equestre`, `morchella-esculenta`, `gyromitra-esculenta`,
`clitocybe-rivulosa`, `suillus-collinitus`, `hygrophorus-latitabundus` (200); FN `clitocybe-dealbata` (404, no se cita).
NEJM devuelve 403 a `curl`: se cita PubMed. La Rioja (llenega) y MITECO IECT *L. deliciosus* (200).

## 1. Clasificación (grupo) con cita

Regla del plan: `mortal` si una fuente toxicológica citada documenta muertes o un síndrome potencialmente mortal.

| id | grupo | síndrome y latencia | fuente |
|---|---|---|---|
| `tricholoma_terreum` | `toxica` (decisión de Alexander) | Rabdomiólisis (daño muscular) en ratones con dos compuestos aislados de la seta (saponaceólidos B y M), que suben la creatina cinasa. Sin casos humanos documentados en el artículo. Discutido por Davoli et al. (2016). | Yin et al. 2014, Chem. Eur. J. 20:7001-9, PMID 24753190 `https://pubmed.ncbi.nlm.nih.gov/24753190/`; comentario Davoli et al. 2016, PMID 26969909 `https://pubmed.ncbi.nlm.nih.gov/26969909/`; FN (recomienda no recogerla) |
| `tricholoma_equestre` | `mortal` | Rabdomiólisis tras varias comidas seguidas; latencia 24-60 h (TOX); 12 casos en Francia, 3 muertos (Bedry et al.). | Bedry et al. 2001, N Engl J Med 345:798-802, PMID 11556299 `https://pubmed.ncbi.nlm.nih.gov/11556299/` (el resumen no está en PubMed; las cifras 12/3 se cotejaron con el resumen de NEJM vía Perplexity); TOX («puede llegar a producir la muerte»); AC |
| `gyromitra_esculenta` | `mortal` | Síndrome giromitriano, 6-24 h; trastornos nerviosos, hepáticos y renales; «es posible la muerte a los 2 o 4 días» (TOX). DON lo clasifica como latencia prolongada (síndrome giromítrico). | TOX, DON, FN («deadly poisonous»), AC («pueden provocar la muerte») |
| `tricholoma_pardinum` | `toxica` | Gastrointestinal, 0,5-4 h; TOX añade que causa «lesiones hepáticas, uremia, shock y hemorragias digestivas». No documenta muertes. | TOX |
| `clitocybe_dealbata` | **`mortal`** (desvío del plan, que suponía `toxica`) | Muscarínico, de 20 min a 2 h. TOX: «raramente es grave, excepto en algunos casos debidos a Inocybe patouillardii y Clitocybe dealbata que han llegado a producir la muerte». FN: «deadly poisonous… deaths… very rare». La regla del plan obliga a `mortal`. | TOX, FN `clitocybe-rivulosa` |

Otros puntos:
- *Morchella*: Saviuc et al. 2010, Clin Toxicol 48:365-72, PMID 20507248 `https://pubmed.ncbi.nlm.nih.gov/20507248/`:
  129 casos de síndrome neurológico (mediana 12 h) y 146 gastrointestinales (5 h) en Francia 1976-2006, más con
  cantidades grandes; se descartó la confusión con *Gyromitra*. AC: tóxica en crudo (hemolisinas que desaparecen a
  80 °C) y neurotoxina («síndrome cerebeloso»). FN: hay que cocinarla siempre.
- *G. gigas*: TOX la lista en el síndrome giromitriano junto a *G. esculenta*. AC: más grande, más clara, de otoño.
- Orden SCO/3303/2006: derogada (RD 30/2009). No se cita en ninguna ficha.

## 2. Hechos por ficha

Ids de taxón (Index Fungorum `RECORD_NUMBER` del nombre aceptado; GBIF `usageKey` de `species/match`):

| taxón | IF | GBIF | registros GBIF zona Alicante (INV §2, 14-10) |
|---|---|---|---|
| Tricholoma terreum | 216171 | 5241808 | 51 |
| Hygrophorus latitabundus | 167748 | 2538733 | 11 |
| Morchella esculenta | 247978 | 2594602 | 30 (y *M. elata* 7, GBIF 2594626) |
| Tricholoma pardinum | 356853 | 7242174 | 1 |
| Tricholoma equestre | 176119 | 3324883 | 4 |
| Gyromitra esculenta | 236690 | 5258510 | 0 |
| Clitocybe dealbata | 216184 | 2531056 (sinónimo de *C. rivulosa* 2531052) | 5 |
| Suillus collinitus | 306571 | 9104622 | 67 |
| Lactarius sanguifluus | 229103 | 5248648 | 85 |
| Lepista nuda | — | 5242048 | 52 |
| Agaricus campestris | — | 5243458 | 45 |
| Hydnum repandum | — | 2554716 | 16 |
| Pleurotus eryngii | — | 9075265 | 16 |
| Macrolepiota procera | — | 8914748 | 7 |
| Boletus aereus | — | 8733688 | 6 |
| Lactarius deliciosus | — | 5248629 | 16 |
| Amanita phalloides | — | 5240325 | 16 |
| Amanita verna | — | 5240320 | 3 |
| Lepiota brunneoincarnata | — | 2535390 | 21 |
| Omphalotus olearius | — | 2538088 | 14 |
| Rubroboletus satanas | — | 7722553 | 15 |
| Lactarius chrysorrheus | — | 5248610 | 14 |
| Amanita pantherina | — | 8961574 | 8 |
| Amanita muscaria | — | 8168319 | 4 |

### tricholoma_terreum
| campo | texto | fuente |
|---|---|---|
| sombrero | 2-7 cm (AC); 3-10 cm (FN). Gris oscuro, centro más oscuro; afieltrado, sedoso, con escamillas radiales finas («piel de ratón»); convexo, luego plano con mamelón suave. | AC, FN |
| himenio | Láminas escotadas, anchas, separadas, frágiles; blanco plata y luego gris claro (FN: a veces con tono amarillo al envejecer). | AC, FN |
| pie | 2-6 cm, cilíndrico, blanco grisáceo, algo fibroso; sin anillo. | AC, FN |
| carne | Blanca algo grisácea, escasa, muy frágil. | AC |
| olor/sabor | Olor suavemente harinoso (AC); «no distintivo» (FN). | AC, FN |
| esporada | Blanca. | FN |
| hábitat | Bosques de coníferas, sobre todo pinares; suelo calizo a neutro; en grupos numerosos o corros. | AC, FN |
| temporada | Otoño y principios del invierno; aguanta las heladas. | AC |
| confusiones | *T. pardinum*: más grande, menos frágil, escamas mayores (AC); olor harinoso (FN). *T. equestre*: láminas amarillas. | AC, FN |

### hygrophorus_latitabundus
| campo | texto | fuente |
|---|---|---|
| sombrero | 3-12 cm (FN), 6-13 cm (La Rioja). Gris pardo a pardo negruzco, más oscuro en el centro; muy viscoso con humedad; margen enrollado, mamelón ancho y bajo. | FN, La Rioja |
| himenio | Láminas céreas, gruesas, blancas, algo decurrentes, moderadamente espaciadas. | FN, La Rioja |
| pie | Blanco, engrosado en la mitad; cubierto de mucílago que lo oscurece abajo. | FN, La Rioja |
| carne | Blanca y firme. | FN |
| olor/sabor | Olor débil a seta; sabor suave. | FN |
| esporada | Blanca. | FN |
| hábitat | Bajo pinos, en suelo calizo; en La Rioja en pinares de *P. nigra* y *P. halepensis*, junto al níscalo. | FN, La Rioja |
| temporada | Otoño; de noviembre a enero en el sur de Portugal. | FN |
| confusiones | *H. hypothejus* (láminas amarillas, sin ficha). Ninguna tóxica citada → excepción aprobada. | FN |
| grupo | `apreciada`: el PDF del Gobierno de La Rioja dice que «es una seta muy apreciada en Cataluña» (code-review D1). | La Rioja |

### morchella_spp
| campo | texto | fuente |
|---|---|---|
| sombrero | 3-8 cm de ancho y 5-12 de alto (FN); globoso u ovalado a cónico; celdas (alveolos) irregulares y profundas separadas por costillas; crema a ocre o pardo. *M. elata*: más oscura y puntiaguda, celdas en columnas. | AC, FN |
| himenio | La superficie fértil está dentro de las celdas. | AC, FN |
| pie | Blanco cremoso, granuloso (furfuráceo), hueco, engrosado en la base. | AC, FN |
| carne/corte | Todo el conjunto es hueco: una sola cavidad (FN, en la ficha de *Gyromitra*: «a single hollow chamber»). | AC, FN |
| olor/sabor | No distintivo (FN); agradable (AC). | FN, AC |
| esporada | Blanco crema u ocre pálido. | FN |
| hábitat | Sitios húmedos, riberas, bajo álamos y chopos (AC); suelos calcáreos, también suelos removidos (FN). | AC, FN |
| temporada | Primavera; desde finales de marzo (AC); marzo a junio (FN). | AC, FN |
| toxicidad | Tóxica en crudo; síndrome neurológico (Saviuc 2010). | AC, FN, Saviuc |

### tricholoma_pardinum
| campo | texto | fuente |
|---|---|---|
| sombrero | 5-15 cm; fondo blanquecino con escamas pardas oscuras o grises en círculos concéntricos, mayores hacia el centro. | FN, AC (en la ficha de *T. terreum*) |
| himenio | Láminas blancas que amarillean, a veces con tono verdoso. | FN |
| pie | Blanco o pardo grisáceo claro, fibroso, base engrosada; sin anillo. | FN |
| olor/sabor | Harinoso (FN en la ficha de *T. terreum*; «formas con olor harinoso», FN *T. pardinum*). | FN |
| esporada | Blanca. | FN |
| hábitat | FN da frondosas (abedul) en Gran Bretaña: **no se usa** para Alicante. Hábitat local PENDIENTE; la ficha dice solo el registro de GBIF. | — |
| temporada | Final del verano y otoño. | FN |

### tricholoma_equestre
| campo | texto | fuente |
|---|---|---|
| sombrero | 5-12 cm (AC); amarillo con fibrillas radiales pardas u oliva más densas en el centro; algo viscoso con lluvia. | AC, FN |
| himenio | Láminas escotadas, apretadas, amarillo oro durante toda la vida. | AC |
| pie | Amarillo, algo más claro que el sombrero, con fibrillas; 5-10 cm. | AC, FN |
| carne | Blanca, amarillenta bajo la cutícula. | AC |
| olor | Suavemente harinoso (AC); sin olor significativo (FN). | AC, FN |
| esporada | Blanca. | FN |
| hábitat | Coníferas, preferiblemente en suelo arenoso; a veces frondosas. | AC, FN |
| temporada | Otoño e invierno (AC); más tarde en el sur de Europa (FN). | AC, FN |

### gyromitra_esculenta
| campo | texto | fuente |
|---|---|---|
| sombrero | 3-10 cm (AC), 5-15 (FN); cerebriforme, lobulado, pardo rojizo oscuro a casi negro. | AC, FN |
| interior | Cámaras huecas irregulares (FN); hueco, cavernoso (AC). | AC, FN |
| pie | Blanco rosado o crema, con surcos, frágil. | AC, FN |
| olor | Suave (AC); no distintivo (FN). | AC, FN |
| esporada | Amarillento pálido (FN). | FN |
| hábitat | Coníferas con humus, suelo arenoso bajo pinos; prefiere más de 800 m. | AC, FN |
| temporada | Primavera. *G. gigas*, en otoño según AC. | AC, FN |

### clitocybe_dealbata (incluye *C. rivulosa*)
| campo | texto | fuente |
|---|---|---|
| sombrero | 1-6 cm, convexo y luego plano o algo hundido; blanco, harinoso o sedoso, como escarchado; con la edad, anillos concéntricos tenues. | FN |
| himenio | Láminas adnadas o algo decurrentes, apretadas, blancas, luego rosado grisáceas. | FN |
| pie | 3-4 cm, blanco, sin anillo. | FN |
| olor | Dulce pero no distintivo. | FN |
| esporada | Blanca. | FN |
| hábitat | Prados, cunetas, parques, dunas; a menudo en corros, donde se buscan la senderuela (*Marasmius oreades*) y la seta de San Jorge. | FN |
| temporada | Julio a diciembre en Gran Bretaña. | FN |

### Variantes
- *S. collinitus* (FN): sombrero 4-12 cm, pardo amarillento, viscoso; poros crema que amarillean; pie amarillo con
  granulaciones pardo rojizas y **base rosada por el micelio rosa** (lo separa de *S. granulatus*); esporada pardo
  ocre; bajo pinos; de octubre a febrero en el sur de Europa. El plan proponía «sombrero pardo rojizo, más
  uniforme»: FN dice «various shades of yellowish brown». Se usa lo de FN.
- *L. sanguifluus* (IECT): calcícola, en Cuenca con *P. nigra* subsp. *salzmannii*; en la Comunitat Valenciana
  meridional es la especie más buscada. Látex rojo vino: ya en la ficha (`toxicidad_nota` anterior). *L. vinosus*
  y *L. semisanguifluus*: sin rasgo nuevo en las fuentes consultadas.

## 3. Confusiones

| comestible | tóxica o mortal con ficha | diferencias | fuente |
|---|---|---|---|
| morchella_spp | gyromitra_esculenta | sombrero cerebriforme sin celdas; cámaras por dentro frente a una sola cavidad | FN (ambas fichas), AC |
| agaricus_campestris | clitocybe_dealbata | láminas rosas y luego marrones frente a blancas; anillo | Spec §4.5 e INV §2. **Ninguna fuente nombra el par**: FN (*C. rivulosa*) avisa a quien recoja setas blancas de corro y de prado. Ya tenía amanitas mortales enlazadas. |
| pleurotus_eryngii | clitocybe_dealbata | cutícula más clara, pie más central, láminas menos decurrentes y otro olor | AC `pleurotus-eryngii`: «algunos Clitocybes tóxicos» (género, no especie). Se enlaza la única *Clitocybe* tóxica con ficha. |
| tricholoma_terreum (tóxica) | tricholoma_pardinum, tricholoma_equestre | tamaño, escamas, color de láminas | AC, FN |

### Sin confusión tóxica documentada (excepción aprobada por Alexander el 2026-10-15)
- `hydnum_repandum`: AC solo cita *H. rufescens*; la guía andaluza dice que no tiene confusión con setas venenosas.
- `suillus_bellinii` (y *S. collinitus*): FN cita *S. granulatus* y *S. luteus*; ninguna tóxica.
- `lepista_nuda`: AC y FN citan *Cortinarius* violetas (sin ficha; las fuentes no los dan como tóxicos concretos).
  Ninguna fuente la enlaza con *C. dealbata*. El grupo morfológico `clitociboide` sí trae *C. dealbata* en el reconocedor.
- `hygrophorus_latitabundus`: FN cita *H. hypothejus*; ninguna tóxica.

Texto fijo en esas fichas (decisión 2, tras humanizer): ver `build.py` (`SIN_CONF`).

## 4. Fotos elegidas
| ficha | n | título Commons | licencia | autor | por qué |
|---|---|---|---|---|---|
| tricholoma_terreum | 1 | File:Erd-Ritterling_Tricholoma_terreum.jpg | CC BY 3.0 | Holger Krisp | gris como de fieltro; otro ejemplar tumbado enseña láminas y pie |
| tricholoma_terreum | 2 | File:Tricholoma_terreum_(Haute-Loire,_France).jpg | CC BY-SA 4.0 | Adrien BENOIT à la GUILLAUME | un ejemplar en musgo y acículas |
| tricholoma_terreum | 3 | File:Tricholoma_terreum_-_lamelles_et_pied_(Haute-Loire,_France).jpg | CC BY-SA 4.0 | Adrien BENOIT à la GUILLAUME | láminas blanquecinas y grises y pie blanco |
| hygrophorus_latitabundus | 1 | File:Hygrophorus_latitabundus1a.JPG | CC BY 3.0 | Benutzer:Paffka | sombreros brillantes y viscosos entre acículas |
| hygrophorus_latitabundus | 2 | File:Hygrophorus_latitabundus2.JPG | CC BY-SA 3.0 | Paffka | dos ejemplares, centro del sombrero más oscuro |
| hygrophorus_latitabundus | 3 | File:Hygrophorus_latitabundus.JPG | CC BY-SA 3.0 | Pau Cabot | ejemplar volcado (Mallorca): láminas blancas |
| morchella_spp | 1 | File:Morchella_esculenta_9622.jpg | CC BY-SA 3.0 | Amada44 | entera y cortada: una sola cavidad (rasgo que decide) |
| morchella_spp | 2 | File:Morchella_esculenta_270408.jpg | CC BY-SA 3.0 | Bernd Haynold | en hierba: sombrero de celdas, pie blanco |
| morchella_spp | 3 | File:2026-04-04_Z5-3750E_Achim-Lammerts_Morchella-esculenta.jpg | CC BY-SA 4.0 | Achim Lammerts (Syntaxys) | detalle de las celdas y la unión con el pie |
| tricholoma_pardinum | 1 | File:Tricholoma_pardinum_112561_cropped.jpg | CC BY-SA 3.0 | Sava Krstic (sava) | escamas oscuras en círculos sobre fondo claro (rasgo que decide; ejemplar norteamericano) |
| tricholoma_pardinum | 2 | File:Tricholoma_pardinum_(1).JPG | CC BY-SA 3.0 | Jerzy Opioła | sombrero escamoso en musgo |
| tricholoma_pardinum | 3 | File:Tricholoma_pardinum_a1.JPG | CC BY-SA 3.0 | Jerzy Opioła | láminas blanquecinas de cerca (Europa) |
| tricholoma_equestre | 1 | File:Tricholoma_equestre_G6.JPG | CC BY-SA 3.0 | Jerzy Opioła | láminas y pie amarillo azufre (rasgo que decide) |
| tricholoma_equestre | 2 | File:Zaldun_ziza.jpg | CC BY-SA 4.0 | Jose Angel Urquia Goitia | grupo en pinar: sombreros oliva, láminas amarillas |
| tricholoma_equestre | 3 | File:Tricholoma_equestre_97146631.jpg | CC BY 4.0 | Viktoria Bilous | láminas y pie amarillos de cerca (foto muy saturada) |
| gyromitra_esculenta | 1 | File:Gyromitra_esculenta_vertical_cut.jpg | CC BY 4.0 | virn | cortadas a lo largo: pliegues y cámaras (rasgo que decide) |
| gyromitra_esculenta | 2 | File:Fr%C3%BChjahrs-Giftlorchel,_LSG_Seppenser_Bach,_2019-04.jpg | CC0 | ChristianSW | sombrero como un cerebro, pardo rojizo |
| gyromitra_esculenta | 3 | File:Gyromitra_esculenta_RPN1_(2).jpg | CC BY-SA 4.0 | Jerzy Opioła | detalle del sombrero y del pie irregular |
| clitocybe_dealbata | 1 | File:Clitocybe_dealbata_(32275792405).jpg | CC BY 2.0 | Dick Culbert from Gibsons, B.C., Canada | grupo de sombreros blancos como escarchados (Canadá) |
| clitocybe_dealbata | 2 | File:2007-08-29_Clitocybe_rivulosa.jpg | CC BY-SA 3.0 | Andreas Kunze | C. rivulosa: cuatro ejemplares, láminas decurrentes crema |
| suillus_bellinii | 3 | File:Suillus_collinitus_pink_mycelium.jpg | CC0 | danielhartley | S. collinitus: micelio rosa en la base del pie (rasgo que decide) |
| lactarius_deliciosus | 3 | File:Lactarius_sanguifluus_186490.jpg | CC BY-SA 3.0 | zaca | L. sanguifluus: láminas y carne del pie rojo vino (Lisboa) |

Todas se miraron una a una (miniatura de 400 px por el agente de búsqueda y hoja de contacto de los JPEG finales de
1200 px en la ejecución). *C. dealbata* se queda con 2 fotos: Commons solo tiene una de *C. dealbata* y una válida de
*C. rivulosa*; la de iNaturalist (Kurt Miller, CC BY-SA, obs. 62173562) no se usa porque el script solo baja de Commons.
Fotos descartadas: *T. equestre* 5771554 (un ejemplar de pie blanco), *L. sanguifluus* «Veririisikas1» (carne naranja,
identificación dudosa), *H. latitabundus* de Krisp (sombrero tapado de barro).

## 5. PENDIENTE
- Hábitat de *T. pardinum* en el levante: FN describe Gran Bretaña (frondosas); sin fuente local.
- `clitocybe_dealbata` como `mortal`: la regla del plan lo exige (TOX documenta muertes). Confirmar con Alexander.
- Par *Agaricus* ↔ *C. dealbata*: viene de la spec y de INV, sin fuente primaria que lo nombre.
