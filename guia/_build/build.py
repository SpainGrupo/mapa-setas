# Genera guia/especies.json a partir de los datos de abajo + meta/fotos.json
import json, sys

FOTOS = json.load(open(sys.argv[1]))
OUT = sys.argv[2]

# Aviso de las fichas que se buscan para recolectar. Decisión de Alexander (2026-10-15): fuera «Considerada comestible
# por la bibliografía»; etiqueta neutra del grupo, sin la palabra «comestible». AV es un marcador: se sustituye al final
# por el texto de AV_GRUPO según el grupo de cada ficha.
AV = "§AV§"
EXPERTO = "No la consumas sin la confirmación de un experto (micólogo, sociedad micológica o farmacia)."
AV_GRUPO = {"apreciada": "Apreciada en la bibliografía micológica. " + EXPERTO,
            "comestible_menor": "Poco valorada en la bibliografía micológica. " + EXPERTO}
# Decisión 2 de Alexander (2026-10-15): especies buscables sin parecida tóxica documentada en las fuentes.
# Ampliada por Alexander el 2026-10-20 a craterellus_cornucopioides y pleurotus_ostreatus (Marbella); lista en
# app/src/seguridad-regiones.test.ts (EXCEPCIONES_APROBADAS).
SIN_CONF = "Las fuentes consultadas no citan una seta tóxica concreta con la que se confunda; el reconocedor sigue listando las peligrosas de su grupo. Eso no garantiza nada: confírmalo con un experto."

# ---------- fuentes ----------
def ac(slug, nombre):
    return {"titulo": f"AmanitaCesarea.com (J. Cuesta y J. Jiménez), ficha de {nombre}", "url": f"https://www.amanitacesarea.com/{slug}.html"}
def fn(slug, nombre):
    return {"titulo": f"First Nature (P. O'Reilly), ficha de {nombre}", "url": f"https://www.first-nature.com/fungi/{slug}.php"}
def sf(rid, nombre):
    return {"titulo": f"Species Fungorum / Index Fungorum, registro de {nombre}", "url": f"https://www.speciesfungorum.org/Names/NamesRecord.asp?RecordID={rid}"}
def wp(lang, page, nombre):
    return {"titulo": f"Wikipedia ({lang}), {nombre} (fuente secundaria)", "url": f"https://{lang}.wikipedia.org/wiki/{page}"}

GUIA = {"titulo": "Moreno Arroyo, Gómez Fernández y Pulido Calmaestra, Setas comestibles de Andalucía (2.ª ed.)", "url": "https://www.forestales.net/contenidos/adjuntos/1968/guia_setas_comestibles_de_andalucia_pdf.pdf"}
LEI = {"titulo": "Leiva Morales, J. A., Introducción al orden Boletales en la provincia de Cádiz (Rev. Soc. Gaditana Hist. Nat. 3)", "url": "https://sociedadgaditanahistorianatural.com/wp-content/uploads/2012/02/15-Leiva-SGHN-Rev-Vol3.pdf"}
SOG = {"titulo": "Hongos del Parque Natural Los Alcornocales y Campo de Gibraltar, ampliación (Instituto de Estudios Campogibraltareños)", "url": "https://institutoecg.es/wp-content/uploads/2019/06/HONGOS-DEL-PARQUE-NATURAL-LOS-ALCORNOCALES-Y-CAMPO-DE-GIBRALTAR-AMPLIACI%C3%93N.pdf"}
ALV = {"titulo": "Alvarado et al. (2022), Amanita sect. Phalloideae en el Mediterráneo, Biology 11:770", "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC9138314"}
DON = {"titulo": "Hospital Donostia, protocolo IT-114 Intoxicaciones por setas (alojado en Fungipedia)", "url": "https://www.fungipedia.org/media/kunena/attachments/267/IT-114_Intoxicaciones_por_Setas_v01.pdf"}
TOX = {"titulo": "Toxicidad de las setas: tabla por especies y síndromes (alojado en Fungipedia)", "url": "https://fungipedia.org/media/kunena/attachments/267/TOXICIDADDELASSETAS_v004.pdf"}
EFI = {"titulo": "Enciclopedia dei Funghi Italiani, glosario: Caesarea (corte del huevo)", "url": "https://enciclopedia.funghiitaliani.it/termine.php?show=299"}
NAT = {"titulo": "Naturnext, Ovolo buono (Amanita caesarea): guía micológica (fuente secundaria)", "url": "https://www.naturnext.eu/it/ovolo-buono-amanita-caesarea-guida-micologica-completa"}
BEATY = {"titulo": "Beaty Biodiversity Museum (UBC), Amanita phalloides", "url": "https://explore.beatymuseum.ubc.ca/mushroomsup/A_phalloides.html"}
FUNG = {"titulo": "Fungipedia (Asociación Micológica Fungipedia), Amanita phalloides", "url": "https://www.fungipedia.org/hongos/amanita-phalloides.html"}
IECT = {"titulo": "Tardío, J., Terfezia arenaria, en Inventario Español de los Conocimientos Tradicionales relativos a la Biodiversidad (MITECO)", "url": "https://www.miteco.gob.es/content/dam/miteco/es/biodiversidad/temas/inventarios-nacionales/iect_terfezia_arenaria_tcm30-164132.pdf"}
AND19 = {"titulo": "Andrino et al. (2019), The crop of desert truffle depends on agroclimatic parameters during two key annual periods (Agron. Sustain. Dev.)", "url": "https://hal.science/hal-02995102/document"}
RLTC = {"titulo": "Global Fungal Red List Initiative, Terfezia claveryi", "url": "https://redlist.info/iucn/species_view/144803"}
CYS = {"titulo": "Cesta y Setas, Las criadillas de tierra (confusiones con falsas trufas blancas; fuente secundaria)", "url": "https://www.cestaysetas.com/las-criadillas-de-tierra-unas-de-las-setas-mas-buscadas-de-la-primavera/"}
# Fase D1 (Alicante): docs/investigacion/2026-10-15-fichas-alicante.md
def gbif(key, nombre):
    return {"titulo": f"GBIF, {nombre}: registros, también en la zona de Alicante (consulta 14-10-2026)", "url": f"https://www.gbif.org/species/{key}"}
NEJM = {"titulo": "Bedry et al. (2001), Wild-mushroom intoxication as a cause of rhabdomyolysis, N Engl J Med 345:798-802", "url": "https://pubmed.ncbi.nlm.nih.gov/11556299/"}
MORCH = {"titulo": "Saviuc et al. (2010), Can morels (Morchella sp.) induce a toxic neurological syndrome?, Clin Toxicol 48:365-372", "url": "https://pubmed.ncbi.nlm.nih.gov/20507248/"}
YIN = {"titulo": "Yin et al. (2014), Chemical and toxicological investigations of a previously unknown poisonous European mushroom Tricholoma terreum, Chem Eur J 20:7001-7009", "url": "https://pubmed.ncbi.nlm.nih.gov/24753190/"}
DAVOLI = {"titulo": "Davoli et al. (2016), Comment on «Chemical and toxicological investigations… Tricholoma terreum», Chem Eur J 22:5786-5788", "url": "https://pubmed.ncbi.nlm.nih.gov/26969909/"}
IECT_LD = {"titulo": "MITECO, Inventario Español de los Conocimientos Tradicionales relativos a la Biodiversidad: Lactarius deliciosus (incl. L. sanguifluus)", "url": "https://www.miteco.gob.es/content/dam/miteco/es/biodiversidad/temas/inventarios-nacionales/iect_lactarius_deliciosus_tcm30-164130.pdf"}
RIOJA_H = {"titulo": "Gobierno de La Rioja (A. Caballero, Grupo Cultural Micológico Verpa), Llenega gris, Hygrophorus latitabundus", "url": "https://www.larioja.org/medio-ambiente/es/reserva-biosfera/valores/naturaleza/valores-naturales/45_setaslocalizacion.ficheros/633897-451899_HydrophorusLimacinus.pdf"}
ALIC = " Con registros en GBIF en la zona de Alicante."
# 2026-10-18: especies nuevas de Marbella
def GBM(key, nombre):
    return {"titulo": f"GBIF, {nombre}: registros en la zona de Marbella (consulta 18-10-2026)", "url": f"https://www.gbif.org/species/{key}"}

E = []
def sp(**k):
    E.append(k)

# ================= APRECIADAS =================
sp(id="boletus_edulis", nombre_cientifico="Boletus edulis Bull.", nombres_comunes=["calabaza", "seta de calabaza", "hongo blanco"],
   grupo="apreciada", toxicidad_nota=AV,
   sombrero="Hasta 25-30 cm. Marrón claro, pardo o canela, más oscuro en el centro y con el borde más pálido, casi blanco. Cutícula algo viscosa con humedad.",
   himenio="Tubos y poros blancos en ejemplares jóvenes, luego amarillos y al final verdosos. No azulean al roce.",
   pie="Robusto, a menudo panzudo. Retículo blanco y fino en la parte alta sobre fondo color avellana.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Blanca y gruesa. No cambia de color al corte; bajo la cutícula puede ser algo rojiza.",
   olor_sabor="Olor y sabor agradables, que recuerdan a la avellana.",
   esporada="Ocre olivácea.",
   habitat="Bajo frondosas o coníferas, prefiere suelos ácidos. En Cádiz se cita en la sierra norte o en suelos calizos, asociado sobre todo a Quercus. La guía andaluza no da localidades concretas.",
   temporada="Finales de verano a finales de otoño.",
   rasgos_clave=["Poros blancos a amarillo verdosos que no azulean", "Carne blanca que no cambia al corte", "Retículo blanco en la parte alta del pie", "Borde del sombrero más claro que el centro"],
   no_confundir_con=[
     {"id": "boletus_aereus", "diferencias": ["B. aereus tiene el sombrero mucho más oscuro, casi negro, seco y aterciopelado", "Retículo del pie del mismo color que el fondo, no blanco"]},
     {"id": "boletus_reticulatus", "diferencias": ["B. reticulatus tiene el sombrero de color avellana uniforme, sin borde claro", "Retículo muy marcado hasta abajo, pardo claro"]},
     {"id": "boletus_pinophilus", "diferencias": ["B. pinophilus tiene el sombrero rojizo, caoba, de color uniforme", "Carne algo vinosa bajo la cutícula; prefiere pinares viejos"]},
     {"id": "tylopilus_felleus", "diferencias": ["Tylopilus felleus tiene los poros rosados, no blanco amarillentos", "Retículo pardo oscuro en el pie", "Sabor muy amargo"]},
     {"id": "rubroboletus_satanas", "diferencias": ["R. satanas tiene poros rojos o anaranjados", "Pie rojo, bulboso", "Carne que azulea al corte; sombrero blanquecino"]},
     {"id": "caloboletus_calopus", "diferencias": ["C. calopus tiene poros amarillos que azulean al tocarlos", "Pie amarillo arriba y rojo hacia la base", "Carne amarilla pálida que azulea; sabor muy amargo"]},
     {"id": "caloboletus_radicans", "diferencias": ["C. radicans tiene el sombrero blanquecino y los poros amarillos que azulean", "Pie amarillo y radicante", "Carne que azulea al corte; muy amarga"]}],
   fuentes=[ac("boletus-edulis", "Boletus edulis"), GUIA, LEI, fn("boletus-edulis", "Boletus edulis"), sf(356530, "Boletus edulis")])

sp(id="boletus_aereus", nombre_cientifico="Boletus aereus Bull.", nombres_comunes=["tentullo", "tontullo", "hongo negro"],
   grupo="apreciada", toxicidad_nota=AV,
   sombrero="De 10-15 cm (hasta 35). Casi negro de joven, luego pardo oscuro con zonas ocres. Cutícula seca y aterciopelada; con tiempo seco se agrieta.",
   himenio="Tubos y poros blancos de jóvenes, luego amarillentos y verdosos. No cambian de color al roce.",
   pie="Duro y macizo, más claro que el sombrero, con un retículo fino del mismo tono que el fondo.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Blanca, firme y compacta. No cambia al corte, ni siquiera bajo la cutícula.",
   olor_sabor="Agradables.",
   esporada="Amarillo ocrácea a amarillo olivácea.",
   habitat="Alcornocales y castañares de Andalucía occidental; asociado a robles, encinas, alcornoques y castaños en suelos ácidos. En Cádiz es frecuente en los bosques de Quercus." + ALIC,
   temporada="Otoño en Andalucía. First Nature indica octubre a febrero en zonas del sur de Europa.",
   rasgos_clave=["Sombrero casi negro y aterciopelado", "Poros blancos a amarillo verdosos que no azulean", "Carne blanca que no cambia, también bajo la cutícula", "Bajo alcornoques, encinas y castaños"],
   no_confundir_con=[
     {"id": "boletus_edulis", "diferencias": ["B. edulis tiene el sombrero más pálido, algo viscoso y con borde claro", "Retículo blanco sobre fondo crema"]},
     {"id": "boletus_reticulatus", "diferencias": ["B. reticulatus es de color ocre claro, menos aterciopelado", "Pie mucho más reticulado"]},
     {"id": "boletus_pinophilus", "diferencias": ["B. pinophilus tiene tonos granate rojizos y prefiere pinares"]},
     {"id": "tylopilus_felleus", "diferencias": ["Tylopilus felleus tiene los poros rosados", "Retículo oscuro y sabor muy amargo"]},
     {"id": "rubroboletus_satanas", "diferencias": ["R. satanas tiene sombrero blanquecino, poros rojos y pie rojo bulboso", "Su carne azulea al corte"]},
     {"id": "caloboletus_calopus", "diferencias": ["C. calopus tiene sombrero claro, poros amarillos que azulean y pie rojo en la base", "Sabor muy amargo"]},
     {"id": "caloboletus_radicans", "diferencias": ["C. radicans tiene sombrero blanquecino, poros y pie amarillos", "Carne que azulea; muy amarga"]}],
   fuentes=[ac("boletus-aereus", "Boletus aereus"), GUIA, LEI, fn("boletus-aereus", "Boletus aereus"), sf(159051, "Boletus aereus"), gbif(8733688, "Boletus aereus")])

sp(id="boletus_reticulatus", nombre_cientifico="Boletus reticulatus Schaeff. (= B. aestivalis)", nombres_comunes=["boleto reticulado", "boleto estival"],
   grupo="apreciada", toxicidad_nota=AV,
   sombrero="Hasta 25 cm. Marrón claro o avellana, de color uniforme y sin borde más claro. Superficie de lisa a afieltrada; con sequedad se cuartea en placas.",
   himenio="Tubos y poros blancos, luego amarillentos. No azulean al roce.",
   pie="Panzudo en ejemplares jóvenes, marrón claro, cubierto por una red (retículo) bien marcada que baja casi hasta la base.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Blanca, también bajo la cutícula. No cambia al corte; solo amarillea junto a los tubos.",
   olor_sabor="Agradables, ligeramente dulces.",
   esporada="Ocre olivácea.",
   habitat="Sobre todo bajo frondosas (robles, castaños, hayas, encinas), en suelos silíceos. En Cádiz es frecuente en bosques de Quercus; es termófilo y necesita lluvias abundantes.",
   temporada="Finales de primavera a finales de verano; en Cádiz puede salir en otoño y en primavera.",
   rasgos_clave=["Retículo muy marcado en todo el pie", "Sombrero avellana uniforme, sin borde claro", "Poros blancos a amarillentos que no azulean", "Carne blanca que no cambia"],
   no_confundir_con=[
     {"id": "boletus_edulis", "diferencias": ["B. edulis tiene el borde del sombrero más claro y la cutícula algo viscosa", "Retículo blanco solo en la parte alta"]},
     {"id": "boletus_aereus", "diferencias": ["B. aereus es mucho más oscuro y su retículo es menos evidente"]},
     {"id": "boletus_pinophilus", "diferencias": ["B. pinophilus es granate rojizo y suele salir en pinares"]},
     {"id": "tylopilus_felleus", "diferencias": ["Tylopilus felleus tiene los poros rosados y el retículo oscuro", "Sabor muy amargo"]},
     {"id": "rubroboletus_satanas", "diferencias": ["R. satanas tiene poros rojos, pie rojo y carne que azulea"]},
     {"id": "caloboletus_calopus", "diferencias": ["C. calopus tiene poros amarillos que azulean y pie rojo en la base", "Sabor muy amargo"]},
     {"id": "caloboletus_radicans", "diferencias": ["C. radicans tiene poros y pie amarillos y carne que azulea", "Pie radicante; sabor muy amargo"]}],
   fuentes=[ac("boletus-reticulatus", "Boletus reticulatus"), LEI, fn("boletus-reticulatus", "Boletus reticulatus"), wp("es", "Boletus_reticulatus", "Boletus reticulatus"), sf(200521, "Boletus reticulatus")])

sp(id="boletus_pinophilus", nombre_cientifico="Boletus pinophilus Pilát & Dermek", nombres_comunes=["hongo de pino", "boleto pinícola"],
   grupo="apreciada", toxicidad_nota=AV,
   sombrero="Hasta 30 cm. Marrón rojizo o caoba, de color uniforme y liso.",
   himenio="Tubos blancos, luego amarillentos y pronto amarillo verde oliva. Poros del mismo color.",
   pie="Muy grueso y panzudo hacia la base, de color parecido al sombrero pero más claro, con retículo crema a rojizo en el ápice.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Blanca, consistente; de tono vinoso bajo la cutícula. No se describe cambio de color al corte.",
   olor_sabor="Agradables, dulces y perfumados.",
   esporada="Ocre olivácea.",
   habitat="Pinares viejos, a veces hayedos. En Cádiz, Leiva lo considera difícil de localizar (como B. pinicola). La guía andaluza no lo recoge: su presencia en la zona está por confirmar.",
   temporada="Primavera y verano con lluvia, y sobre todo otoño.",
   rasgos_clave=["Sombrero rojo caoba uniforme", "Pie muy grueso con retículo rojizo arriba", "Carne blanca, vinosa bajo la cutícula", "Asociado a pinos grandes"],
   no_confundir_con=[
     {"id": "boletus_edulis", "diferencias": ["B. edulis es más pálido, con el borde casi blanco y retículo blanco"]},
     {"id": "boletus_aereus", "diferencias": ["B. aereus es casi negro y sale con Quercus y castaños"]},
     {"id": "boletus_reticulatus", "diferencias": ["B. reticulatus es ocre claro y tiene el pie mucho más reticulado"]},
     {"id": "tylopilus_felleus", "diferencias": ["Tylopilus felleus tiene el himenio rosa, no blanco amarillento", "Sabor muy amargo"]},
     {"id": "rubroboletus_satanas", "diferencias": ["R. satanas tiene poros rojos, pie rojo y carne que azulea"]},
     {"id": "caloboletus_calopus", "diferencias": ["C. calopus tiene poros amarillos que azulean y sabor muy amargo"]},
     {"id": "caloboletus_radicans", "diferencias": ["C. radicans tiene sombrero blanquecino, poros amarillos que azulean y sabor muy amargo"]}],
   fuentes=[ac("boletus-pinophilus", "Boletus pinophilus"), LEI, fn("boletus-pinophilus", "Boletus pinophilus"), wp("es", "Boletus_pinophilus", "Boletus pinophilus"), sf(309751, "Boletus pinophilus")])

sp(id="amanita_caesarea", nombre_cientifico="Amanita caesarea (Scop.) Pers.", nombres_comunes=["oronja", "tana", "yema", "amanita de los césares"],
   grupo="apreciada",
   toxicidad_nota=AV + " En fase de huevo no debe consumirse nunca sin confirmación experta: cerrada puede confundirse con la oronja verde (Amanita phalloides), mortal.",
   sombrero="De 8 a 25 cm. Naranja vivo, a veces con placas blancas de la volva. Liso, algo viscoso y brillante, con el margen estriado.",
   himenio="Láminas libres, amarillo pálido al principio y luego amarillo dorado.",
   pie="Amarillo, del mismo color que las láminas y el anillo, con la base engrosada.",
   volva="Blanca o algo grisácea, membranosa, amplia y en forma de saco. De joven envuelve toda la seta como un huevo.",
   anillo="Amarillo, amplio, colgante, frágil y estriado por arriba.",
   carne_y_corte="Blanca, amarillenta bajo la cutícula. Al cortar el pie se ve amarillo por fuera y blanco en el centro.",
   olor_sabor="Olor suave; sabor agradable, a nuez.",
   esporada="Blanca, a veces algo amarillenta.",
   habitat="Alcornocales y castañares de Andalucía occidental. Muy abundante en el P. N. Los Alcornocales (Cádiz-Málaga); menos frecuente en el resto de Málaga y casi ausente en Andalucía oriental. Bajo encinas, alcornoques, robles y castaños.",
   temporada="Principios de otoño o pleno verano, siempre tras tormentas abundantes. Es termófila y desaparece cuando el otoño enfría.",
   fase_huevo="El huevo cerrado es blanco por fuera, igual que el de la oronja verde o el de Amanita verna. Cortado de arriba abajo, el de A. caesarea deja ver ya el sombrero naranja y las láminas y el pie amarillos dentro de una volva blanca, amplia y en forma de saco. El de A. phalloides y A. verna es blanco por dentro, sin naranja ni amarillo. Aun así, un huevo nunca debe consumirse sin la confirmación de un experto.",
   rasgos_clave=["Láminas, pie y anillo amarillos", "Volva blanca, membranosa y en forma de saco", "Sombrero naranja liso con margen estriado", "En huevo: al cortarlo, interior naranja y amarillo"],
   no_confundir_con=[
     {"id": "amanita_muscaria", "diferencias": ["A. muscaria tiene láminas, pie y anillo blancos, nunca amarillos", "Su volva se reduce a verrugas en anillos incompletos, no forma un saco", "Sombrero rojo con muchas verrugas blancas; la lluvia o el sol pueden quitarlas o decolorarlo"]},
     {"id": "amanita_phalloides", "diferencias": ["En huevo, A. phalloides es blanca o verdosa por dentro al cortarla; A. caesarea muestra naranja y amarillo", "Adulta: sombrero verde amarillento a oliváceo y láminas blanco puro", "Pie blanco con dibujo en zigzag; anillo blanco"]},
     {"id": "amanita_verna", "diferencias": ["En huevo, A. verna es blanca por dentro al cortarla", "Adulta: toda blanca, láminas blancas y volva en saco", "Sale sobre todo en primavera"]}],
   fuentes=[ac("amanita-caesarea", "Amanita caesarea"), GUIA, EFI, NAT, fn("amanita-caesarea", "Amanita caesarea"), wp("es", "Amanita_caesarea", "Amanita caesarea"), sf(208468, "Amanita caesarea")])

sp(id="lactarius_deliciosus", nombre_cientifico="Lactarius deliciosus (L.) Gray", nombres_comunes=["níscalo", "mízcalo", "guíscano", "nízcalo"],
   grupo="apreciada", toxicidad_nota=AV + " Especies próximas: L. sanguifluus (carne y látex que viran a rojo vino) y L. semisanguifluus. L. vinosus es para Index Fungorum sinónimo de L. sanguifluus.",
   sombrero="De 4 a 20 cm (hasta 25). Naranja con círculos concéntricos más claros y más oscuros, margen enrollado. Con la edad se hunde en embudo y aparecen manchas verdes.",
   himenio="Láminas naranjas, apretadas, que se vuelven verdes donde se dañan.",
   pie="Corto, hueco con la edad, quebradizo, con hoyuelos o manchas más oscuras.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Blanca o zanahoria, que al corte vira enseguida a naranja y luego a verde. Látex naranja que mantiene su color.",
   olor_sabor="Olor agradable, algo resinoso; sabor dulce, ligeramente acre.",
   esporada="Crema a ocre clara.",
   habitat="Pinares de suelos ácidos; también bosques mixtos de pino y roble. Muy frecuente en toda Andalucía. En la zona de Alicante domina L. sanguifluus, que prefiere el suelo calizo: en la Comunitat Valenciana meridional es la especie más buscada.",
   temporada="Otoño y principios de invierno; abundante en años lluviosos.",
   rasgos_clave=["Látex naranja que no cambia a blanco ni a amarillo", "Manchas verdes en láminas y sombrero", "Sombrero naranja con zonas concéntricas", "Bajo pinos"],
   no_confundir_con=[
     {"id": "lactarius_torminosus", "diferencias": ["L. torminosus tiene el borde del sombrero muy lanoso, con pelos blancos", "Látex blanco y sabor muy acre", "Láminas crema rosadas, no naranjas; crece con abedules"]},
     {"id": "lactarius_chrysorrheus", "diferencias": ["L. chrysorrheus da un látex blanco que se vuelve amarillo azufre en segundos", "Es más pequeño y sale con robles y alcornoques, no con pinos"]}],
   fuentes=[ac("lactarius-deliciosus", "Lactarius deliciosus"), GUIA, fn("lactarius-deliciosus", "Lactarius deliciosus"), wp("es", "Lactarius_sanguifluus", "Lactarius sanguifluus"), sf(224737, "Lactarius deliciosus"), sf(229103, "Lactarius sanguifluus"), sf(456055, "Lactarius vinosus"), IECT_LD, gbif(5248648, "Lactarius sanguifluus"), gbif(5248629, "Lactarius deliciosus")])

sp(id="cantharellus_cibarius", nombre_cientifico="Cantharellus cibarius Fr.", nombres_comunes=["rebozuelo", "cabrilla", "chantarela"],
   grupo="apreciada", toxicidad_nota=AV + " La guía andaluza trata el rebozuelo local como C. subpruinosus (hoy C. pallens), muy parecido.",
   sombrero="De 3 a 10 cm. Amarillo de pálido a yema de huevo, irregular, en forma de embudo con el margen ondulado.",
   himenio="Sin láminas verdaderas: pliegues gruesos, bifurcados y muy decurrentes por el pie, del color del sombrero.",
   pie="Del mismo amarillo, lleno, se estrecha hacia abajo.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Firme, blanquecina, algo amarillenta en los bordes.",
   olor_sabor="Olor afrutado, a albaricoque; sabor dulzón.",
   esporada="Crema clara a blanco amarillenta.",
   habitat="Suelos ácidos bajo coníferas, frondosas y jarales. Frecuente en años lluviosos en Cádiz, Córdoba, Huelva y Málaga, y especialmente abundante en el P. N. Los Alcornocales.",
   temporada="Otoño y finales de primavera. First Nature indica octubre a marzo en el sur de Europa.",
   rasgos_clave=["Pliegues gruesos y bifurcados en vez de láminas", "Todo amarillo yema, sin tonos naranja intenso", "Olor a albaricoque", "Crece en el suelo, no en matas sobre raíces o tocones"],
   no_confundir_con=[
     {"id": "omphalotus_olearius", "diferencias": ["Omphalotus tiene láminas verdaderas, finas y apretadas, no pliegues", "Color naranja a pardo anaranjado más intenso", "Crece en matas al pie de olivos u otros árboles, sobre raíces o tocones", "Olor y sabor desagradables según AmanitaCesarea.com"]},
     {"id": "hydnum_repandum", "diferencias": ["Hydnum tiene aguijones bajo el sombrero en lugar de pliegues", "Sombrero crema a ocre, más pálido"]}],
   fuentes=[ac("cantharellus-cibarius", "Cantharellus cibarius"), GUIA, fn("cantharellus-cibarius", "Cantharellus cibarius"), sf(200345, "Cantharellus cibarius")])

sp(id="macrolepiota_procera", nombre_cientifico="Macrolepiota procera (Scop.) Singer", nombres_comunes=["parasol", "paraguas", "gallipierno", "apagador"],
   grupo="apreciada", toxicidad_nota=AV + " La guía andaluza advierte que no deben recogerse lepiotas de menos de 10 cm: algunas son mortales.",
   sombrero="De 10 a 30 cm. Ovalado de joven (como un palillo de tambor), luego plano con un mamelón central. Escamas pardas sobre fondo blanco sucio.",
   himenio="Láminas libres, blanco cremosas, apretadas.",
   pie="Muy largo (15-40 cm), hueco, fibroso, con bandas en zigzag pardo grisáceas (dibujo de piel de serpiente) y bulbo en la base.",
   volva="No tiene volva verdadera; solo un bulbo en la base del pie.",
   anillo="Doble, grande, blanco por arriba y crema por abajo; se desliza por el pie.",
   carne_y_corte="Blanquecina; vira solo un poco a rosa tostado. No enrojece claramente.",
   olor_sabor="Suaves y agradables, a nuez.",
   esporada="Blanquecina.",
   habitat="Claros herbosos de bosques de coníferas y de Quercus, pastizales y bordes de camino. Muy frecuente y abundante en toda Andalucía." + ALIC,
   temporada="Otoño.",
   rasgos_clave=["Pie con dibujo de piel de serpiente", "Anillo doble que se desliza", "Sombrero grande, de más de 10 cm", "Carne que no enrojece al corte"],
   no_confundir_con=[
     {"id": "chlorophyllum_rhacodes", "diferencias": ["Chlorophyllum tiene el pie liso, sin dibujo de serpiente", "Su carne enrojece al corte, sobre todo en el pie", "C. brunneum tiene bulbo brusco y marginado"]},
     {"id": "lepiota_brunneoincarnata", "diferencias": ["Lepiota brunneoincarnata es pequeña: sombrero de 2 a 6 cm", "Escamas pardas sobre fondo rosado y carne rosa vinosa en la base del pie", "Anillo reducido a un rodete fugaz"]},
     {"id": "amanita_pantherina", "diferencias": ["A. pantherina tiene verrugas blancas sobre sombrero pardo y margen estriado", "Volva con reborde y anillos en la base del pie", "Anillo membranoso simple, no doble"]}],
   fuentes=[ac("macrolepiota-procera", "Macrolepiota procera"), GUIA, fn("macrolepiota-procera", "Macrolepiota procera"), sf(287857, "Macrolepiota procera"), gbif(8914748, "Macrolepiota procera")])

# ================= COMESTIBLES MENORES =================
sp(id="suillus_bellinii", nombre_cientifico="Suillus bellinii (Inzenga) Kuntze", nombres_comunes=[],
   grupo="comestible_menor", toxicidad_nota=AV + " Se aconseja retirar la cutícula viscosa. " + SIN_CONF,
   sombrero="Hasta 15 cm. Pardo, con zonas blanquecinas hacia el borde, muy viscoso. S. collinitus, frecuente en los pinares de Alicante, tiene el sombrero pardo amarillento, de 4 a 12 cm, también viscoso. S. luteus lo tiene pardo castaño oscuro, de 5 a 10 cm, y S. granulatus, canela a pardo anaranjado, de 4 a 10 cm; los dos viscosos.",
   himenio="Tubos cortos; poros pequeños, blanquecinos a beige y luego amarillentos. En S. luteus y S. granulatus, amarillo limón; S. granulatus suelta gotitas lechosas en los poros que oscurecen al secarse.",
   pie="Corto y robusto, blanquecino, con granulaciones rojizas. En S. collinitus el pie es amarillo, con granulaciones pardo rojizas y la base rosada por su micelio rosa.",
   volva="No tiene.", anillo="S. bellinii, S. collinitus y S. granulatus no tienen. S. luteus tiene un anillo grande y colgante, blanco y luego violáceo por debajo.",
   carne_y_corte="Blanquecina y firme, amarillenta en la base. No se describe cambio de color al corte.",
   olor_sabor="Sin dato en las fuentes consultadas.",
   esporada="Parda.",
   habitat="Pinares mediterráneos litorales y de interior, con Pinus halepensis, P. pinaster y P. pinea. Frecuente en Andalucía. S. collinitus y S. bellinii tienen registros en GBIF en la zona de Alicante y en la de Marbella. S. luteus (sitios húmedos y sombríos de pinar) y S. granulatus (bajo pinos de dos acículas) también tienen registros en GBIF en la zona de Marbella.",
   temporada="Las fuentes andaluzas citan las especies próximas en otoños y primaveras lluviosas; sin dato específico para S. bellinii. S. collinitus sale de octubre a febrero en el sur de Europa. First Nature da S. luteus de agosto a noviembre y S. granulatus de julio a noviembre en Gran Bretaña, más tarde en el sur de Europa.",
   rasgos_clave=["Sombrero muy viscoso, pardo con borde claro", "Siempre bajo pinos", "Sin anillo, salvo S. luteus", "S. collinitus: base del pie rosada", "S. granulatus: gotitas lechosas en los poros"],
   no_confundir_con=[],
   fuentes=[GUIA, LEI, wp("en", "Suillus_bellinii", "Suillus bellinii"), sf(324328, "Suillus bellinii"), fn("suillus-collinitus", "Suillus collinitus"), sf(306571, "Suillus collinitus"), gbif(9104622, "Suillus collinitus"), gbif(7552504, "Suillus bellinii"), fn("suillus-luteus", "Suillus luteus"), fn("suillus-granulatus", "Suillus granulatus"), GBM(7777157, "Suillus luteus"), GBM(8146046, "Suillus granulatus")])

sp(id="hydnum_repandum", nombre_cientifico="Hydnum repandum L.", nombres_comunes=["lengua de gato", "lengua de oveja", "lengua de vaca"],
   grupo="comestible_menor", toxicidad_nota=AV + " Sabor algo amargo, más en ejemplares viejos. " + SIN_CONF,
   sombrero="De 3 a 15 cm. Crema, blanquecino o amarillento, irregular y lobulado, aterciopelado y seco.",
   himenio="Aguijones (pinchos) crema, apretados, que se desprenden con facilidad. No tiene láminas ni poros.",
   pie="Corto, macizo, a veces descentrado, del color del sombrero o más claro.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Blanca, luego crema amarillenta; dura pero frágil. Sin cambio de color descrito.",
   olor_sabor="Olor muy suave; sabor algo amargo.",
   esporada="Crema blanquecina.",
   habitat="Sobre todo encinares, más raramente pinares. En Andalucía no es muy frecuente; la guía la cita en las sierras de Jaén y Córdoba en otoños lluviosos." + ALIC + " También en la zona de Marbella (GBIF, consulta 18-10-2026).",
   temporada="Otoño avanzado; aguanta el frío y es de las últimas en desaparecer.",
   rasgos_clave=["Aguijones bajo el sombrero en vez de láminas", "Sombrero crema e irregular", "Pie corto y macizo", "Carne blanca, dura pero frágil"],
   no_confundir_con=[
     {"id": "cantharellus_cibarius", "diferencias": ["El rebozuelo tiene pliegues decurrentes, no aguijones", "Es amarillo yema y huele a albaricoque"]}],
   fuentes=[ac("hydnum-repandum", "Hydnum repandum"), GUIA, fn("hydnum-repandum", "Hydnum repandum"), sf(225014, "Hydnum repandum"), gbif(2554716, "Hydnum repandum")])

sp(id="lepista_nuda", nombre_cientifico="Lepista nuda (Bull.) Cooke (Index Fungorum: Collybia nuda)", nombres_comunes=["pie azul"],
   grupo="comestible_menor", toxicidad_nota=AV + " " + SIN_CONF + " AmanitaCesarea.com y First Nature avisan de que se puede confundir con Cortinarius de tonos violetas, que tienen cortina en el pie y esporada marrón herrumbre.",
   sombrero="De 5 a 15 cm. Violeta, azul violeta o marrón violáceo; con la edad o la sequedad pasa a crema u ocre. Liso, sin estrías.",
   himenio="Láminas lila violáceas, apretadas, un poco decurrentes en adultos; se separan fácilmente del sombrero.",
   pie="Violáceo, fibroso, con la base algo bulbosa y micelio blanco violáceo pegado a hojas y tierra.",
   volva="No tiene.", anillo="No tiene. Sin cortina (tela de araña) en el pie.",
   carne_y_corte="Blanca con reflejos violetas; tierna. Sin cambio de color descrito.",
   olor_sabor="Olor afrutado característico; sabor suave y dulce.",
   esporada="Rosa suave.",
   habitat="Prados y bosques de pinos y encinas, a menudo en corros de brujas. Muy frecuente en toda Andalucía." + ALIC + " También en la zona de Marbella (GBIF, consulta 18-10-2026).",
   temporada="Otoño, principios de invierno y primaveras lluviosas.",
   rasgos_clave=["Toda la seta violeta, también láminas y pie", "Esporada rosa, no marrón", "Sin cortina ni anillo", "Olor afrutado"],
   no_confundir_con=[],
   fuentes=[ac("lepista-nuda", "Lepista nuda"), GUIA, fn("lepista-nuda", "Lepista nuda"), sf(356735, "Lepista nuda / Collybia nuda"), gbif(5242048, "Lepista nuda")])

sp(id="russula_cyanoxantha", nombre_cientifico="Russula cyanoxantha (Schaeff.) Fr.", nombres_comunes=["carbonera", "seta de cerdos"],
   grupo="comestible_menor", toxicidad_nota=AV,
   sombrero="De 5 a 16 cm. Color muy variable: violeta, gris violeta, con manchas gris verdosas o verde lila, nunca rojo. Se hunde en el centro con la edad.",
   himenio="Láminas blancas a blanco cremosas, apretadas, flexibles y de tacto graso: no se rompen al rozarlas, a diferencia de otras rúsulas.",
   pie="Blanco, robusto, sin anillo; se vuelve esponjoso.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Blanca y quebradiza; grisácea suave al corte, algo violácea bajo la cutícula.",
   olor_sabor="Sabor suave y dulce; olor casi inapreciable, a avellana.",
   esporada="Blanca.",
   habitat="Alcornocales, encinares y castañares. Muy abundante en Andalucía occidental y más escasa en la oriental. Con registros en GBIF en la zona de Marbella (consulta 18-10-2026).",
   temporada="Desde verano hasta octubre o primeros de noviembre; es sensible al frío.",
   rasgos_clave=["Láminas blancas flexibles, que no se rompen al rozarlas", "Sombrero violeta o verdoso, nunca rojo", "Pie blanco sin anillo ni volva", "Sabor suave"],
   no_confundir_con=[
     {"id": "amanita_phalloides", "diferencias": ["A. phalloides tiene anillo blanco colgante y volva blanca en saco: hay que desenterrar la base del pie", "Pie con dibujo en zigzag oliváceo", "La bibliografía cita su confusión con rúsulas de sombrero verde"]}],
   fuentes=[ac("russula-cyanoxantha", "Russula cyanoxantha"), GUIA, ac("amanita-phalloides", "Amanita phalloides"), fn("russula-cyanoxantha", "Russula cyanoxantha"), sf(190250, "Russula cyanoxantha")])

sp(id="agaricus_campestris", nombre_cientifico="Agaricus campestris L.", nombres_comunes=["champiñón de campo", "hongo"],
   grupo="comestible_menor", toxicidad_nota=AV + " Se desaconseja recoger ejemplares viejos con láminas negras.",
   sombrero="De 3 a 12 cm. Blanco, a veces con escamas gris crema; el margen sobresale de las láminas.",
   himenio="Láminas libres, blanco rosadas o rosa vivo de jóvenes, luego marrón oscuro y negras. Nunca blancas en el adulto.",
   pie="Blanco, corto, sin bulbo marcado.",
   volva="No tiene.",
   anillo="Simple, fino y fugaz, en la parte alta del pie.",
   carne_y_corte="Blanca, que al corte toma un tono rosado suave, sobre todo entre pie y sombrero. No amarillea.",
   olor_sabor="AmanitaCesarea.com los describe como agradables; la guía andaluza, como desagradables.",
   esporada="Marrón oscuro, pardo púrpura.",
   habitat="Prados y pastizales, sobre todo los abonados por ganado. Muy frecuente en toda Andalucía." + ALIC + " También en la zona de Marbella (GBIF, consulta 18-10-2026).",
   temporada="Primavera y otoño.",
   rasgos_clave=["Láminas rosas que pasan a marrón y negro", "Sin volva en la base", "Carne que rosea, no amarillea", "En prados, no dentro del bosque"],
   no_confundir_con=[
     {"id": "amanita_phalloides", "diferencias": ["Las amanitas mortales tienen láminas blancas siempre, no rosas ni marrones", "Tienen volva blanca en saco en la base: hay que sacar la seta entera", "La forma blanca de A. phalloides comparte hábitat a veces"]},
     {"id": "amanita_verna", "diferencias": ["A. verna es toda blanca, con láminas blancas y volva en saco", "Sale en primavera, como el champiñón"]},
     {"id": "clitocybe_dealbata", "diferencias": ["Clitocybe dealbata es más pequeña (1 a 6 cm), blanca y como escarchada", "Sus láminas son blancas, pegadas al pie o algo decurrentes; con la edad, como mucho rosado grisáceas, nunca marrones", "No tiene anillo"]}],
   fuentes=[ac("agaricus-campestris", "Agaricus campestris"), GUIA, fn("agaricus-campestris", "Agaricus campestris"), sf(356498, "Agaricus campestris"), fn("clitocybe-rivulosa", "Clitocybe rivulosa (= C. dealbata)"), gbif(5243458, "Agaricus campestris")])

# ================= MORTALES =================
sp(id="amanita_phalloides", nombre_cientifico="Amanita phalloides (Vaill. ex Fr.) Link", nombres_comunes=["oronja verde", "cicuta verde", "oronja mortal"],
   grupo="mortal",
   toxicidad_nota="MORTAL. Síndrome faloidiano (hepatotóxico, por amatoxinas). Latencia larga, de 6 a 24 h: los primeros síntomas llegan cuando el hígado ya está dañado. Causa la mayoría de las muertes por setas. Las toxinas no se destruyen al cocinar ni al congelar. Si se sospecha una intoxicación, hay que ir a urgencias aunque no haya síntomas.",
   sombrero="De 6 a 15 cm. Verde amarillento, más oliváceo y oscuro en el centro, con fibrillas radiales; existe una forma blanca. Margen no estriado.",
   himenio="Láminas libres, apretadas, blanco puro.",
   pie="Blanco con un jaspeado oliváceo en zigzag, terminado en bulbo.",
   volva="Blanca, membranosa, amplia, en forma de saco, a veces verdosa por dentro.",
   anillo="Blanco, colgante como una faldita, persistente, estriado por arriba.",
   carne_y_corte="Blanca, sin cambio de color.",
   olor_sabor="Olor dulce o a rosas de joven, desagradable al envejecer. No se debe probar.",
   esporada="Blanca.",
   habitat="Micorrícica de Quercus: encinares, alcornocales y robledales; también castaños. Citada en el P. N. Los Alcornocales (Jimena de la Frontera) bajo alcornoque y quejigo." + ALIC,
   temporada="Otoño.",
   fase_huevo="El huevo es blanco por fuera, como el de la oronja (A. caesarea). Cortado a lo largo es blanco por dentro y deja ver la silueta del pie y las láminas en blanco. No tiene naranja ni amarillo.",
   rasgos_clave=["Volva blanca en saco: sacar siempre la seta entera", "Láminas blanco puro", "Anillo blanco colgante", "Sombrero verde oliváceo con fibrillas radiales (puede ser blanco)"],
   no_confundir_con=[
     {"id": "amanita_caesarea", "diferencias": ["A. caesarea tiene láminas, pie y anillo amarillos", "En huevo, al cortarla, la oronja muestra naranja y amarillo; la oronja verde es blanca por dentro"]},
     {"id": "russula_cyanoxantha", "diferencias": ["Las rúsulas no tienen anillo ni volva", "Sus láminas son blanco cremosas y la carne, quebradiza"]},
     {"id": "agaricus_campestris", "diferencias": ["El champiñón tiene láminas rosas a marrones, nunca blanco puro", "No tiene volva"]},
     {"id": "amanita_verna", "diferencias": ["A. verna es igual de mortal; es toda blanca y sale en primavera"]},
     {"id": "amanita_ponderosa", "diferencias": ["La guía andaluza cita la confusión del gurumelo con la forma blanca de A. phalloides", "La oronja verde sale en otoño; el gurumelo, a finales de invierno y en primavera", "A. phalloides tiene la carne blanca que no cambia y un anillo blanco colgante y persistente; el gurumelo tiene un anillo frágil que se pierde pronto y su carne toma tonos rosados al corte", "El gurumelo sale medio enterrado, con la volva gruesa y manchada de tierra, y huele a tierra mojada"]},
     {"id": "tricholoma_portentosum", "diferencias": ["La capuchina no tiene anillo ni volva: eso descarta la confusión (AmanitaCesarea.com)", "A. phalloides tiene láminas blancas, anillo blanco colgante y volva blanca en saco: saca la seta entera"]}],
   fuentes=[ac("amanita-phalloides", "Amanita phalloides"), ALV, DON, TOX, EFI, BEATY, FUNG, fn("amanita-phalloides", "Amanita phalloides"), sf(178962, "Amanita phalloides"), gbif(5240325, "Amanita phalloides")])

sp(id="amanita_verna", nombre_cientifico="Amanita verna Bull. ex Lam.", nombres_comunes=["amanita de primavera", "cicuta blanca"],
   grupo="mortal",
   toxicidad_nota="MORTAL. Síndrome faloidiano, igual que A. phalloides (amatoxinas), latencia de 8 a 24 h. Taxonomía en revisión: Alvarado et al. (2022) describen como A. vidua la especie primaveral mediterránea que antes se llamaba A. verna o A. decipiens.",
   sombrero="De 5 a 10 cm. Blanco puro.",
   himenio="Láminas libres, blancas.",
   pie="Blanco, con bulbo en la base.",
   volva="Blanca, grande, en forma de saco.",
   anillo="Blanco y membranoso.",
   carne_y_corte="Blanca, sin cambio de color.",
   olor_sabor="Sin dato fiable en las fuentes consultadas. No se debe probar.",
   esporada="Blanca.",
   habitat="Suelos ácidos, probablemente con encina, rebollo y alcornoque. Holotipo de A. vidua en Galaroza (Huelva) bajo encina; los casos andaluces de primavera se concentran en el oeste." + ALIC,
   temporada="Primavera: abril a principios de junio.",
   fase_huevo="Huevo blanco por fuera y blanco por dentro al cortarlo. Puede confundirse con el huevo de la oronja, con un champiñón joven o con un gurumelo (A. ponderosa) que aún no ha abierto. A. verna y A. vidua salen en los mismos sitios y en la misma época que el gurumelo.",
   rasgos_clave=["Toda blanca", "Volva blanca en saco", "Láminas blancas siempre", "Sale en primavera"],
   no_confundir_con=[
     {"id": "amanita_caesarea", "diferencias": ["En huevo la oronja cortada muestra naranja y amarillo; A. verna es toda blanca", "La oronja adulta tiene sombrero naranja y láminas amarillas"]},
     {"id": "agaricus_campestris", "diferencias": ["El champiñón tiene láminas rosas o marrones y no tiene volva"]},
     {"id": "amanita_phalloides", "diferencias": ["A. phalloides suele tener el sombrero verde oliváceo y sale en otoño; igual de mortal"]},
     {"id": "amanita_ponderosa", "diferencias": ["El gurumelo sale en los mismos sitios y en la misma época: es la confusión primaveral más peligrosa", "A. verna sigue blanca toda su vida y su carne no cambia de color; en el gurumelo el sombrero se vuelve ocre rojizo y la carne toma tonos rosados al corte", "A. verna tiene el pie liso y un anillo colgante, estriado y persistente; el del gurumelo es frágil y se pierde pronto", "El gurumelo huele a tierra mojada y sale medio enterrado, con la volva gruesa manchada de tierra", "Un ejemplar joven y cerrado de A. verna puede parecer un gurumelo: en ese estado ningún rasgo basta sin un experto"]}],
   fuentes=[ALV, TOX, DON, ac("agaricus-campestris", "Agaricus campestris"), wp("es", "Amanita_verna", "Amanita verna"), sf(163667, "Amanita verna"), gbif(5240320, "Amanita verna")])

sp(id="lepiota_brunneoincarnata", nombre_cientifico="Lepiota brunneoincarnata Chodat & C. Martín", nombres_comunes=[],
   grupo="mortal",
   toxicidad_nota="MORTAL. Síndrome faloidiano (amatoxinas), latencia de 6 a 24 h. Hay intoxicaciones atribuidas a esta especie en España.",
   sombrero="De 2 a 6 cm. Escamas concéntricas pardo ocráceas, más oscuras y juntas en el centro, sobre fondo blanquecino rosado.",
   himenio="Láminas libres, densas, blancas a crema.",
   pie="De 2 a 4 cm, blanquecino rosado y pardo vinoso en la base, con escamas bajo el anillo.",
   volva="No tiene.",
   anillo="Reducido a un rodete irregular y fugaz.",
   carne_y_corte="Blanca y rosa vinosa en la base del pie.",
   olor_sabor="Olor algo afrutado. No se debe probar.",
   esporada="Blanca.",
   habitat="Quejigales y alcornocales; citada en el P. N. Los Alcornocales (Cádiz-Málaga). También zonas herbosas bajo frondosas." + ALIC,
   temporada="Otoño.",
   rasgos_clave=["Parece un parasol en miniatura (menos de 6 cm)", "Escamas pardas sobre fondo rosado", "Base del pie rosa vinosa", "Anillo casi inexistente"],
   no_confundir_con=[
     {"id": "macrolepiota_procera", "diferencias": ["El parasol mide más de 10 cm, tiene anillo doble deslizante y pie con dibujo de serpiente", "La guía andaluza aconseja no recoger lepiotas de menos de 10 cm"]}],
   fuentes=[SOG, TOX, ALV, fn("lepiota-brunneoincarnata", "Lepiota brunneoincarnata"), wp("es", "Lepiota_brunneoincarnata", "Lepiota brunneoincarnata"), sf(247927, "Lepiota brunneoincarnata"), gbif(2535390, "Lepiota brunneoincarnata")])

# ================= TÓXICAS =================
sp(id="amanita_muscaria", nombre_cientifico="Amanita muscaria (L.) Lam.", nombres_comunes=["matamoscas", "falsa oronja", "oronja pintada"],
   grupo="toxica",
   toxicidad_nota="TÓXICA. Síndrome micoatropínico o panterínico (ácido iboténico y muscimol): confusión, agitación, alucinaciones y vómitos entre 0,5 y 3 h después. Rara vez mortal.",
   sombrero="De 10 a 25 cm. Rojo escarlata que pasa a naranja con la edad, cubierto de verrugas blancas algodonosas en círculos; la lluvia puede quitarlas.",
   himenio="Láminas libres, blanco puro.",
   pie="Blanco, con la base engrosada.",
   volva="No forma saco: queda como verrugas blancas en anillos incompletos alrededor del bulbo.",
   anillo="Blanco, amplio, membranoso, con el borde algo amarillo.",
   carne_y_corte="Blanca, anaranjada bajo la cutícula.",
   olor_sabor="Casi sin olor ni sabor. No se debe probar.",
   esporada="Blanca.",
   habitat="Micorrícica de coníferas y caducifolios en suelos ácidos. Sin datos de abundancia en la zona en las fuentes consultadas." + ALIC,
   temporada="Finales de verano a finales de otoño.",
   rasgos_clave=["Láminas y pie blancos", "Verrugas blancas sobre sombrero rojo o naranja", "Base del pie con anillos de verrugas, sin volva en saco"],
   no_confundir_con=[
     {"id": "amanita_caesarea", "diferencias": ["La oronja tiene láminas, pie y anillo amarillos", "Volva blanca en saco, no verrugas", "Sombrero naranja liso y estriado. Ojo: un matamoscas descolorido o sin verrugas (var. aureola) se parece más"]}],
   fuentes=[ac("amanita-muscaria", "Amanita muscaria"), ac("amanita-caesarea", "Amanita caesarea"), TOX, DON, fn("amanita-muscaria", "Amanita muscaria"), wp("es", "Amanita_muscaria", "Amanita muscaria"), sf(161267, "Amanita muscaria"), gbif(8168319, "Amanita muscaria")])

sp(id="amanita_pantherina", nombre_cientifico="Amanita pantherina (DC.) Krombh.", nombres_comunes=["pantera", "amanita pantera", "falso galipierno"],
   grupo="toxica",
   toxicidad_nota="MUY TÓXICA. Síndrome micoatropínico o panterínico, más grave que el de A. muscaria y excepcionalmente mortal. Síntomas entre 0,5 y 4 h: excitación, delirio, convulsiones, vómitos; pueden durar hasta 3 días.",
   sombrero="De 4 a 12 cm. Pardo grisáceo a marrón claro, con verrugas blanco puro dispuestas con regularidad. Margen muy estriado.",
   himenio="Láminas libres, blancas.",
   pie="Blanco sucio, harinoso, terminado en bulbo redondeado.",
   volva="Circuncisa: termina en un reborde neto sobre el bulbo, con dos o tres anillos (burletes) por encima.",
   anillo="Blanco, tipo faldita, membranoso y persistente, algo estriado por arriba; a media altura del pie.",
   carne_y_corte="Blanca, tierna, sin cambio de color.",
   olor_sabor="Olor débil. No se debe probar.",
   esporada="Blanca.",
   habitat="Bajo coníferas y caducifolios; First Nature la fotografía en alcornocales y pinares mixtos del Algarve y la señala más común en el sur de Europa." + ALIC,
   temporada="Verano y otoño; en el extremo sur puede salir hasta tres meses más tarde.",
   rasgos_clave=["Verrugas blanco puro sobre sombrero pardo", "Margen del sombrero estriado", "Bulbo con reborde neto y anillos encima", "Láminas blancas"],
   no_confundir_con=[
     {"id": "macrolepiota_procera", "diferencias": ["El parasol tiene escamas pardas sobre fondo blanco, no verrugas blancas sobre fondo pardo", "Anillo doble que se desliza y pie con dibujo de serpiente", "Sin volva ni reborde en el bulbo"]}],
   fuentes=[ac("amanita-pantherina", "Amanita pantherina"), ac("macrolepiota-procera", "Macrolepiota procera"), TOX, fn("amanita-pantherina", "Amanita pantherina"), wp("es", "Amanita_pantherina", "Amanita pantherina"), sf(156565, "Amanita pantherina"), gbif(8961574, "Amanita pantherina")])

def bol_lookalikes(dif):
    return [{"id": b, "diferencias": dif} for b in ["boletus_edulis", "boletus_aereus", "boletus_reticulatus", "boletus_pinophilus"]]

sp(id="rubroboletus_satanas", nombre_cientifico="Rubroboletus satanas (Lenz) Kuan Zhao & Zhu L. Yang", nombres_comunes=[],
   grupo="toxica",
   toxicidad_nota="TÓXICA. Síndrome gastrointestinal (resinoide): gastroenteritis violenta entre 0,5 y 4 h después; peor en crudo.",
   sombrero="De 6 a 30 cm. Blanco tiza a gris muy claro, a veces con tonos oliva o rojizos; aterciopelado.",
   himenio="Poros amarillos de muy jóvenes, luego naranjas y rojos.",
   pie="Grueso y bulboso, rojo intenso con retículo rojo sobre fondo amarillo anaranjado.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Blanca a amarillenta; azulea al corte (azul verdoso) y luego se desvanece.",
   olor_sabor="Olor desagradable en ejemplares viejos. No se debe probar.",
   esporada="Pardo olivácea.",
   habitat="Suelos calizos, con encinas y otros Quercus; en Cádiz a veces en alcornocales." + ALIC,
   temporada="Finales de verano y otoño.",
   rasgos_clave=["Poros rojos o anaranjados", "Pie rojo, bulboso, con retículo", "Sombrero blanquecino", "Carne que azulea al corte"],
   no_confundir_con=bol_lookalikes(["Los boletus de la sección edulis tienen poros blancos a amarillo verdosos, nunca rojos", "Su carne es blanca y no azulea", "Su pie es pardo o avellana, no rojo"]),
   fuentes=[fn("rubroboletus-satanas", "Rubroboletus satanas"), LEI, TOX, ac("caloboletus-calopus", "Caloboletus calopus"), ac("caloboletus-radicans", "Caloboletus radicans"), sf(809241, "Rubroboletus satanas"), gbif(7722553, "Rubroboletus satanas")])

sp(id="caloboletus_calopus", nombre_cientifico="Caloboletus calopus (Pers.) Vizzini", nombres_comunes=["boleto amargo"],
   grupo="toxica",
   toxicidad_nota="NO SE DEBE CONSUMIR. Muy amargo; el amargor no desaparece al cocinar. Puede que no sea tóxico; se incluye por su parecido con los boletus.",
   sombrero="Hasta 20 cm. Ocre claro, gamuza o café con leche casi blanco, afieltrado de joven.",
   himenio="Tubos y poros amarillos que azulean al dañarlos; nunca rojizos.",
   pie="Amarillento en el ápice y rojo púrpura hacia la base, con retículo blanco arriba y rojo pardo y marcado en el medio.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Amarilla pálida, dura; azulea al corte, sobre todo en ejemplares jóvenes.",
   olor_sabor="Olor desagradable, entre afrutado y harinoso; sabor muy amargo.",
   esporada="Amarillenta olivácea.",
   habitat="Bosques caducifolios, micorrícico de castaños y robles. En Cádiz, poco frecuente en bosques de Quercus.",
   temporada="Principios de verano a otoño.",
   rasgos_clave=["Poros amarillos que azulean", "Pie amarillo arriba y rojo abajo", "Carne que azulea al corte", "Sabor muy amargo"],
   no_confundir_con=bol_lookalikes(["Los boletus de la sección edulis tienen poros blancos a amarillo verdosos que no azulean", "Su carne es blanca y no cambia de color", "Su pie no tiene tonos rojos"]),
   fuentes=[ac("caloboletus-calopus", "Caloboletus calopus"), LEI, fn("caloboletus-calopus", "Caloboletus calopus"), sf(550547, "Caloboletus calopus")])

sp(id="caloboletus_radicans", nombre_cientifico="Caloboletus radicans (Pers.) Vizzini", nombres_comunes=["hongo blanco", "boleto blanco"],
   grupo="toxica",
   toxicidad_nota="NO SE DEBE CONSUMIR. Muy amargo; en crudo puede ser purgante y se cita que causa vómitos y diarrea intensos.",
   sombrero="Hasta 20 cm. Blanco, beige o crema muy claro, pardusco en el centro; seco y cuarteado con la edad. Margen muy enrollado de joven.",
   himenio="Tubos y poros amarillos que pasan a verde; azulean al dañarlos.",
   pie="Robusto, amarillo claro, con retículo fino casi invisible; la base se hunde en el suelo como una raíz y tiene manchas rojizas.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Blanco amarillenta; azulea al corte en toda la seta y la base del pie se vuelve pardo rojiza. El azul desaparece en minutos.",
   olor_sabor="Olor suave pero desagradable; sabor dulce al principio y luego muy amargo.",
   esporada="Pardo olivácea.",
   habitat="Planifolios, sobre todo robles, encinas y quejigos. En Cádiz, poco frecuente y termófilo en bosques de Quercus.",
   temporada="Veranos lluviosos y principios de otoño.",
   rasgos_clave=["Sombrero blanquecino", "Poros y pie amarillos", "Carne que azulea al corte", "Pie radicante; sabor muy amargo"],
   no_confundir_con=bol_lookalikes(["Los boletus de la sección edulis tienen la carne blanca que no azulea", "Sus poros son blancos de jóvenes, no amarillo limón", "Su pie es pardo o avellana con retículo visible"]),
   fuentes=[ac("caloboletus-radicans", "Caloboletus radicans"), LEI, wp("en", "Caloboletus_radicans", "Caloboletus radicans"), sf(550548, "Caloboletus radicans")])

sp(id="tylopilus_felleus", nombre_cientifico="Tylopilus felleus (Bull.) P. Karst.", nombres_comunes=["boleto amargo"],
   grupo="toxica",
   toxicidad_nota="NO SE DEBE CONSUMIR. Probablemente no es tóxico, pero su sabor es extremadamente amargo. Se incluye por su parecido con los boletus.",
   sombrero="De 6 a 12 cm. Pardo aterciopelado con tonos oliva.",
   himenio="Poros blanco crema de jóvenes y luego rosados o color coral; se manchan de pardo al tocarlos.",
   pie="Con un retículo pardo oscuro, más oscuro que el fondo.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Blanca, sin cambio de color al corte.",
   olor_sabor="Olor poco marcado; sabor muy amargo.",
   esporada="Rosa arcilla.",
   habitat="Bajo robles, hayas y otras frondosas, raramente coníferas. Las fuentes andaluzas consultadas no lo citan en la zona; su presencia está por confirmar.",
   temporada="Agosto a noviembre (dato de Gran Bretaña).",
   rasgos_clave=["Poros rosados", "Retículo pardo oscuro en el pie", "Sabor muy amargo", "Carne blanca que no cambia"],
   no_confundir_con=bol_lookalikes(["Los boletus de la sección edulis tienen poros blancos a amarillo verdosos, nunca rosados", "Su retículo es claro o del color del pie, no pardo oscuro", "Su sabor es suave, no amargo"]),
   fuentes=[ac("boletus-edulis", "Boletus edulis"), ac("boletus-pinophilus", "Boletus pinophilus"), fn("tylopilus-felleus", "Tylopilus felleus"), sf(122480, "Tylopilus felleus")])

sp(id="omphalotus_olearius", nombre_cientifico="Omphalotus olearius (DC.) Singer", nombres_comunes=["seta de olivo"],
   grupo="toxica",
   toxicidad_nota="TÓXICA. Síndrome gastrointestinal con síntomas nerviosos (vértigo, mareo, hormigueos), entre 0,5 y 4 h después de comerla. La guía andaluza la cita como causa de graves trastornos digestivos.",
   sombrero="De 7 a 20 cm. Naranja vivo a pardo anaranjado, convexo y luego hundido, con el margen ondulado.",
   himenio="Láminas verdaderas, finas, apretadas, muy decurrentes, del color del sombrero.",
   pie="Naranja, oscureciendo hacia la base; los pies salen unidos en matas.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Naranja por dentro y por fuera; no cambia de color.",
   olor_sabor="Desagradables según AmanitaCesarea.com (First Nature describe un olor fuerte agradable). No se debe probar.",
   esporada="Blanco crema.",
   habitat="Al pie de olivos o sobre tocones y raíces de otros árboles (encinas, castaños). Crece en matas densas." + ALIC,
   temporada="Verano a otoño; First Nature indica septiembre a enero en el sur de Europa.",
   rasgos_clave=["Láminas verdaderas, no pliegues", "Crece en matas sobre raíces o tocones", "Naranja intenso por fuera y por dentro", "Sale sobre todo al pie de olivos"],
   no_confundir_con=[
     {"id": "cantharellus_cibarius", "diferencias": ["El rebozuelo tiene pliegues gruesos y bifurcados, no láminas finas", "Es amarillo yema, crece en el suelo y no en matas sobre madera", "Huele a albaricoque"]}],
   fuentes=[ac("cantharellus-cibarius", "Cantharellus cibarius"), GUIA, TOX, fn("omphalotus-olearius", "Omphalotus olearius"), wp("es", "Omphalotus_olearius", "Omphalotus olearius"), sf(288943, "Omphalotus olearius"), gbif(2538088, "Omphalotus olearius")])

sp(id="lactarius_torminosus", nombre_cientifico="Lactarius torminosus (Schaeff.) Pers.", nombres_comunes=["falso níscalo", "níscalo de cabra"],
   grupo="toxica",
   toxicidad_nota="TÓXICA. Síndrome gastrointestinal (resinoide), entre 0,5 y 4 h después. Sabor muy acre.",
   sombrero="De 4 a 12 cm. Naranja claro con círculos rojos, rosas y blancos; el borde, enrollado, está cubierto de pelos blanquecinos largos (aspecto lanoso).",
   himenio="Láminas blanco rosado cremoso, apretadas.",
   pie="Crema blanquecino, hueco con la edad.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Blanco cremosa; látex blanco que no cambia (algo amarillento sobre papel blanco).",
   olor_sabor="Olor suave a fruta; sabor muy acre.",
   esporada="Crema.",
   habitat="Asociado casi siempre al abedul. Las fuentes andaluzas consultadas no lo citan en la zona.",
   temporada="Otoño y finales de verano tormentosos.",
   rasgos_clave=["Borde del sombrero lanoso, con pelos", "Látex blanco", "Láminas crema rosadas, no naranjas", "Con abedules"],
   no_confundir_con=[
     {"id": "lactarius_deliciosus", "diferencias": ["El níscalo no tiene pelos en el borde", "Su látex y sus láminas son naranjas, con manchas verdes", "Crece bajo pinos"]}],
   fuentes=[ac("lactarius-torminosus", "Lactarius torminosus"), ac("lactarius-deliciosus", "Lactarius deliciosus"), TOX, fn("lactarius-torminosus", "Lactarius torminosus"), sf(228133, "Lactarius torminosus")])

sp(id="lactarius_chrysorrheus", nombre_cientifico="Lactarius chrysorrheus Fr.", nombres_comunes=["falso níscalo"],
   grupo="toxica",
   toxicidad_nota="TÓXICA. Síndrome gastrointestinal (resinoide); tóxica también cocinada. Látex muy acre.",
   sombrero="De 3 a 8 cm. Rosa salmón con zonas más oscuras, algo grasiento.",
   himenio="Láminas crema anaranjado.",
   pie="Claro.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Látex blanco que se vuelve amarillo azufre en pocos segundos al aire.",
   olor_sabor="Sabor suave y luego amargo y picante. No se debe probar.",
   esporada="Blanco crema con tinte salmón.",
   habitat="Casi siempre con robles y otros Quercus. Sin cita concreta en la zona en las fuentes consultadas, aunque la guía andaluza la menciona como posible confusión del níscalo." + ALIC,
   temporada="Otoño; First Nature indica que en países mediterráneos llega hasta febrero.",
   rasgos_clave=["Látex blanco que amarillea en segundos", "Bajo Quercus, no bajo pinos", "Más pequeño que el níscalo", "Sin manchas verdes"],
   no_confundir_con=[
     {"id": "lactarius_deliciosus", "diferencias": ["El níscalo tiene látex naranja que no amarillea", "Tiene manchas verdes y sale bajo pinos"]}],
   fuentes=[GUIA, fn("lactarius-chrysorrheus", "Lactarius chrysorrheus"), TOX, wp("en", "Lactarius_chrysorrheus", "Lactarius chrysorrheus"), sf(233874, "Lactarius chrysorrheus"), gbif(5248610, "Lactarius chrysorrheus")])

sp(id="chlorophyllum_rhacodes", nombre_cientifico="Chlorophyllum rhacodes (Vittad.) Vellinga y C. brunneum (Farl. & Burt) Vellinga", nombres_comunes=["apagador menor"],
   grupo="toxica",
   toxicidad_nota="TÓXICA O DUDOSA. C. brunneum se considera tóxica (gastroenteritis). Sobre C. rhacodes hay dudas, porque resulta indigesta para algunas personas y su clasificación es confusa. C. molybdites, de láminas verdosas, también es tóxica.",
   sombrero="Hasta 20 cm. Globoso y luego extendido, sin mamelón o con uno muy leve. Escamas grandes pardo grisáceas sobre fondo blanco rosado.",
   himenio="Láminas libres, blancas, luego ocres; color herrumbre donde se dañan.",
   pie="Liso, sin dibujo de piel de serpiente, blanquecino arriba y ocre óxido abajo. Base engrosada poco a poco (C. rhacodes) o bruscamente bulbosa y marginada (C. brunneum).",
   volva="No tiene.",
   anillo="Doble y deslizante en C. rhacodes; simple, pardo por debajo, en C. brunneum.",
   carne_y_corte="Blanquecina, enrojece poco a poco al corte, sobre todo en el pie.",
   olor_sabor="Olor agradable. No se debe probar.",
   esporada="Blanquecina (verde en C. molybdites).",
   habitat="Claros de bosque, pastizales, bordes de caminos y zonas ricas en materia orgánica.",
   temporada="Otoño.",
   rasgos_clave=["Carne que enrojece al corte", "Pie liso, sin dibujo de serpiente", "Bulbo brusco y marginado en C. brunneum", "Escamas gruesas sobre el sombrero"],
   no_confundir_con=[
     {"id": "macrolepiota_procera", "diferencias": ["El parasol tiene el pie con bandas en zigzag (piel de serpiente)", "Su carne no enrojece al corte", "Sombrero con mamelón marcado, de 10 a 30 cm"]}],
   fuentes=[ac("chlorophyllum-rhacodes", "Chlorophyllum rhacodes"), ac("macrolepiota-procera", "Macrolepiota procera"), fn("chlorophyllum-rhacodes", "Chlorophyllum rhacodes"), wp("en", "Shaggy_parasol", "Chlorophyllum rhacodes"), sf(374433, "Chlorophyllum rhacodes"), sf(374393, "Chlorophyllum brunneum")])

# ================= AMPLIACIÓN (gurumelo, seta de cardo, criadillas) =================
sp(id="amanita_ponderosa", nombre_cientifico="Amanita ponderosa Malençon & R. Heim", nombres_comunes=["gurumelo", "grumelo", "falsa patata"],
   grupo="apreciada",
   toxicidad_nota=AV + " ATENCIÓN: las amanitas mortales A. verna y A. vidua salen en los mismos sitios y en la misma época que el gurumelo, y de jóvenes, aún cerradas, se le parecen mucho. Alvarado et al. (2022) relacionan esta confusión con el número anormalmente alto de intoxicaciones por amanitas mortales en primavera en Andalucía y Extremadura. También se ha confundido con A. boudieri, que causa insuficiencia renal y no tiene volva membranosa ni anillo. La guía andaluza aconseja que los principiantes no lo recojan fuera de las provincias donde se conoce bien. Amanita curtipes, parecida pero más pequeña (hasta 8 cm) y de otoño, tiene poco valor culinario.",
   sombrero="De 4 a 20 cm. Hemisférico de joven, luego convexo y casi plano. Cutícula gruesa, blanca de joven, que pasa a ocre rosado y con la edad a tonos casi rojizos. Margen no estriado, a veces con placas del velo. Suele estar manchado de tierra.",
   himenio="Láminas libres, apretadas, blanquecinas a crema rosado, con la arista algo dentada o flocosa.",
   pie="Robusto y macizo, blanco a crema rosado, de 6 a 13 cm. Enrojece un poco al dañarlo.",
   volva="Grande, gruesa, membranosa y en forma de saco, muy persistente. Por fuera ocre rosada y manchada de tierra; por dentro blanca.",
   anillo="Frágil y fugaz: desaparece pronto o queda en jirones pegados al pie.",
   carne_y_corte="Blanca y compacta. Al corte o al aire toma tonos rosados; según AmanitaCesarea.com, en los adultos enrojece un poco.",
   olor_sabor="Olor suave a tierra mojada, muy característico. Sabor dulce y suave.",
   esporada="Blanca.",
   habitat="Micorrícico de encinas y alcornoques, en bosques mediterráneos con jaras y tomillos. Nace medio enterrado. Abundante en Huelva, Sevilla y Cádiz; hay algunos ejemplares en Córdoba y Málaga.",
   temporada="Primavera, a veces desde enero si el tiempo es suave. La Wikipedia en español da de finales de enero a finales de abril, según la zona.",
   fase_huevo="El gurumelo joven sale medio enterrado, blanco, con el sombrero cerrado dentro de una volva gruesa manchada de tierra. Así se parece mucho a un ejemplar joven de A. verna o A. vidua, mortales, que salen en los mismos sitios y en la misma época. Un gurumelo cerrado o a medio salir no debe consumirse nunca sin la confirmación de un experto.",
   rasgos_clave=["Sale medio enterrado, en primavera, bajo encinas y alcornoques", "Volva gruesa en saco, manchada de tierra", "Carne que toma tonos rosados al corte", "Olor a tierra mojada", "Anillo frágil que se pierde pronto"],
   no_confundir_con=[
     {"id": "amanita_verna", "diferencias": ["A. verna, mortal, sale en los mismos sitios y en la misma época que el gurumelo", "A. verna sigue blanca toda su vida y su carne no cambia de color; el gurumelo se vuelve ocre rojizo y su carne toma tonos rosados al corte", "A. verna tiene el pie liso y un anillo colgante, estriado y persistente", "De jóvenes y cerradas son muy difíciles de separar: ningún rasgo basta sin un experto"]},
     {"id": "amanita_phalloides", "diferencias": ["La forma blanca de A. phalloides, mortal, se ha citado como posible confusión", "A. phalloides sale en otoño y tiene la carne blanca que no cambia", "Su anillo es blanco, colgante y persistente; el del gurumelo se pierde pronto"]}],
   fuentes=[ac("amanita-ponderosa", "Amanita ponderosa"), GUIA, ALV, wp("es", "Amanita_ponderosa", "Amanita ponderosa"), sf(284068, "Amanita ponderosa")])

sp(id="pleurotus_eryngii", nombre_cientifico="Pleurotus eryngii (DC.) Quél.", nombres_comunes=["seta de cardo", "seta de cardo corredor"],
   grupo="apreciada",
   toxicidad_nota=AV + " La guía andaluza la considera difícil de confundir con setas tóxicas; AmanitaCesarea.com cita como posible confusión algunas Clitocybe tóxicas, de cutícula más clara, pie más central, láminas menos decurrentes y otro olor. La seta de cañaheja (P. eryngii var. ferulae) es muy parecida y crece sobre otra umbelífera.",
   sombrero="De 4 a 12 cm. Convexo, luego plano y algo hundido en el centro, con el borde enrollado de joven. Color variable: de crema a beige, pardo rojizo, pardo grisáceo o marrón oscuro. Cutícula algo afieltrada o escamosa de joven, lisa después.",
   himenio="Láminas muy decurrentes, que bajan por el pie. Blancas de joven, luego crema u ocráceas.",
   pie="Excéntrico, a veces central, blanquecino, macizo y sin anillo. Si se desentierra se ve que nace de la raíz podrida del cardo corredor.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Blanca, compacta y algo elástica. Las fuentes no describen cambio de color al corte.",
   olor_sabor="Olor suave y agradable; sabor dulce y suave.",
   esporada="Blanca a blanco crema.",
   habitat="Pastizales, praderas y claros de bosque con cardo corredor (Eryngium campestre), sobre sus raíces en descomposición. Muy frecuente en Andalucía." + ALIC,
   temporada="Sobre todo en otoño; también en primavera si ha llovido y hace templado.",
   rasgos_clave=["Láminas muy decurrentes, que bajan por el pie", "Pie excéntrico, sin anillo ni volva", "Nace de las raíces del cardo corredor, en pastizales", "Sombrero pardo de tono variable, con el borde enrollado de joven"],
   no_confundir_con=[
     {"id": "clitocybe_dealbata", "diferencias": ["AmanitaCesarea.com cita como posible confusión algunas Clitocybe tóxicas, de cutícula más clara, pie más central, láminas menos decurrentes y otro olor", "Clitocybe dealbata es pequeña (1 a 6 cm), blanca y como escarchada"]}],
   fuentes=[ac("pleurotus-eryngii", "Pleurotus eryngii"), GUIA, wp("es", "Pleurotus_eryngii", "Pleurotus eryngii"), sf(170772, "Pleurotus eryngii"), gbif(9075265, "Pleurotus eryngii")])

sp(id="craterellus_cornucopioides", nombre_cientifico="Craterellus cornucopioides (L.) Pers. y C. lutescens (Fr.) Fr.", nombres_comunes=["trompeta de los muertos", "trompeta negra", "angula de monte", "trompeta amarilla"],
   grupo="apreciada",
   toxicidad_nota=AV + " Las fuentes no dan ninguna confusión peligrosa de la trompeta de los muertos; para la angula de monte AmanitaCesarea.com dice que las confusiones peligrosas son difíciles y solo cita la parecida C. tubaeformis. " + SIN_CONF,
   sombrero="De 4 a 8 cm en la trompeta de los muertos y de 2 a 6 cm en la angula de monte. En forma de embudo profundo, con el borde enrollado y ondulado. En la trompeta de los muertos, gris pardo a casi negro, con estrías en el margen; en la angula de monte, pardo amarillento con líneas radiales.",
   himenio="Casi liso, con pliegues longitudinales muy discretos a modo de vetas, sin láminas. Gris ceniciento y como con polvillo en la trompeta de los muertos; amarillo con tonos anaranjados o rosados en la angula de monte.",
   pie="Hueco hasta la base, sin separarse del sombrero: toda la seta es una trompeta. Gris y arrugado en la trompeta de los muertos; amarillo rojizo y de base casi blanca en la angula de monte.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Escasa, fibrosa y elástica. En la angula de monte, amarillenta.",
   olor_sabor="Sin olor ni sabor característicos en la trompeta de los muertos (First Nature); olor afrutado y sabor suave en la angula de monte (AmanitaCesarea.com).",
   esporada="Blanca.",
   habitat="Bajo frondosas, sobre todo haya y robles, la trompeta de los muertos; sobre todo en bosques de coníferas y, bajo la hojarasca de zonas húmedas, también en robles, la angula de monte. GBIF tiene registros de la trompeta de los muertos en Los Alcornocales y de la angula de monte en la zona de Marbella (consulta 18-10-2026).",
   temporada="De otoño al invierno. First Nature dice que en la Península Ibérica se encuentra hasta bien entrado el año nuevo.",
   rasgos_clave=["Toda la seta es un embudo hueco hasta la base del pie", "Sin láminas: himenio casi liso, con vetas muy discretas", "Trompeta de los muertos gris oscura o negra; angula de monte pardo amarillenta por arriba y amarilla por abajo", "Esporada blanca"],
   no_confundir_con=[],
   fuentes=[fn("craterellus-cornucopioides", "Craterellus cornucopioides"), ac("craterellus-lutescens", "Craterellus lutescens"), GBM(2554662, "Craterellus cornucopioides"), GBM(8871787, "Craterellus lutescens")])

sp(id="pleurotus_ostreatus", nombre_cientifico="Pleurotus ostreatus (Jacq.) P. Kumm.", nombres_comunes=["seta de ostra", "seta de chopo", "orellana"],
   grupo="apreciada",
   toxicidad_nota=AV + " AmanitaCesarea.com solo cita confusiones con otros Pleurotus (P. pulmonarius, P. cornucopiae), que no son tóxicos, y dice que se confunde a veces con la seta de cardo; recoge que alguna bibliografía considera ligeramente purgante la variedad columbinus. " + SIN_CONF,
   sombrero="De 5 a 15 cm, a veces mucho más; en forma de ostra o de concha, de convexo a plano y algo hundido. Color muy variable, de gris claro a marrón oscuro, a veces con reflejos azulados. Margen fino y enrollado.",
   himenio="Láminas apretadas y muy decurrentes, blancas al principio y crema con la edad.",
   pie="Corto, a veces casi ausente, de modo que el sombrero nace directamente de la madera. Blanco o crema, algo lanoso en la base, sin anillo.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Blanca, con tonos crema cuando está mojada. Correosa y dura en el pie y en los ejemplares viejos.",
   olor_sabor="Olor y sabor agradables, sin nada característico.",
   esporada="Blanca cremosa o gris lila pálida.",
   habitat="Casi siempre en troncos y tocones de frondosas en descomposición, a veces como parásita: choperas cortadas, hayedos, álamos, fresnos y olmos. Crece en grupos apretados, con los ejemplares unidos o solapados. GBIF tiene registros en la zona de Marbella (consulta 18-10-2026).",
   temporada="Verano, otoño y principio del invierno; en el sur de Europa, a veces hasta enero o febrero (First Nature).",
   rasgos_clave=["Nace de madera de frondosas, no del suelo", "En grupos solapados, con forma de ostra", "Láminas muy decurrentes y pie corto o ausente, sin anillo", "Esporada blanca cremosa o gris lila pálida"],
   no_confundir_con=[],
   fuentes=[ac("pleurotus-ostreatus", "Pleurotus ostreatus"), fn("pleurotus-ostreatus", "Pleurotus ostreatus"), GBM(2526530, "Pleurotus ostreatus")])

sp(id="terfezia_arenaria", nombre_cientifico="Terfezia arenaria (Moris) Trappe y T. claveryi Chatin", nombres_comunes=["criadilla de tierra", "turma", "turma de tierra", "patata de tierra"],
   grupo="apreciada",
   toxicidad_nota=AV + " Crece bajo tierra y se reconoce peor que una seta con sombrero. Según Cesta y Setas, la confusión más peligrosa es con las falsas trufas blancas del género Choiromyces (C. meandriformis es tóxica y tiene la carne con venas blancas en forma de meandro). La criadilla jarera (Choiromyces magnusii), asociada a las jaras, es otra especie parecida. Las Scleroderma, tóxicas, también se han confundido con trufas.",
   sombrero="No tiene sombrero ni pie. Cuerpo redondeado como una patata, de 3 a 10 cm (hasta 14 según el MITECO). Piel (peridio) blanco amarillenta de joven, luego rojiza y al final parda; lisa al principio y agrietada con la edad, a veces con manchas negras.",
   himenio="No tiene láminas ni poros: las esporas se forman dentro de la carne (gleba).",
   pie="No tiene.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Gleba crema rosada, con vetas o tabiques más claros. Al corte, T. arenaria forma un anillo blanquecino junto a la piel; T. leptoderma, de piel más fina, no suele formarlo.",
   olor_sabor="Olor suave, fúngico, que el MITECO describe como afrutado. Sabor dulce.",
   esporada="Ocrácea.",
   habitat="T. arenaria: suelos sueltos y arenosos, ácidos, en dehesas y bosques claros de encina y alcornoque. Vive asociada a la hierba Tuberaria guttata, la madre de la criadilla o hierba turmera. En Andalucía se conoce sobre todo en Sierra Morena (Córdoba y Jaén). T. claveryi prefiere suelos calizos de la mitad oriental y se asocia a especies de Helianthemum.",
   temporada="Primavera, de marzo a junio según el tiempo. En T. claveryi la cosecha depende sobre todo de la lluvia del otoño anterior (finales de septiembre y octubre) y, en menor medida, de la de primavera.",
   rasgos_clave=["Forma de patata, bajo tierra; se delata porque agrieta y abulta el suelo", "Interior crema rosado con vetas más claras, nunca negro violáceo", "Junto a Tuberaria guttata (T. arenaria) o Helianthemum (T. claveryi)", "Sale en primavera"],
   no_confundir_con=[
     {"id": "scleroderma_citrinum", "diferencias": ["Scleroderma tiene la piel dura y gruesa, con escamas o verrugas, amarillenta o parda", "Su interior pasa pronto de blanco a negro violáceo y acaba en polvo pardo; el de la criadilla es crema rosado", "Crece sobre el suelo, unido por cordones blancos o un falso pie, sobre todo en verano y otoño", "S. citrinum huele mal, a gas"]}],
   fuentes=[GUIA, IECT, AND19, RLTC, CYS, wp("en", "Scleroderma_citrinum", "Scleroderma citrinum"), sf(324472, "Terfezia arenaria"), sf(144803, "Terfezia claveryi")])

sp(id="scleroderma_citrinum", nombre_cientifico="Scleroderma citrinum Pers. y S. verrucosum (Bull.) Pers.", nombres_comunes=["escleroderma", "escleroderma verrugoso"],
   grupo="toxica",
   toxicidad_nota="TÓXICA. Hay informes contradictorios sobre su gravedad, pero se considera como mínimo sospechosa; puede causar trastornos gastrointestinales. First Nature recomienda no comer ninguna especie del género. Se ha confundido con trufas.",
   sombrero="No tiene sombrero: cuerpo redondeado o en forma de pera, de 3 a 10 cm. Piel (peridio) dura y gruesa. En S. citrinum es amarillo ocre, con escamas gruesas e irregulares; en S. verrucosum, pardo rojiza a ocre, con escamitas pequeñas. Al madurar se rompe por arriba de forma irregular.",
   himenio="No tiene láminas ni poros: las esporas se forman dentro (gleba).",
   pie="S. citrinum no tiene pie y se une al suelo con cordones blancos. S. verrucosum tiene un falso pie surcado, con cordones blancos en la base.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Interior blanco y firme al principio. Pronto se vuelve pardo púrpura o negro violáceo, con vetas blancas, y al final es un polvo pardo oscuro.",
   olor_sabor="Olor desagradable; a gas en S. citrinum. No se debe probar.",
   esporada="Pardo oscura.",
   habitat="Micorrícico. S. citrinum en suelos arenosos bien drenados, bordes de pistas y taludes de bosque. S. verrucosum en bosques variados, sobre todo con castaños, encinas y robles; también en pinares y jardines. Las fuentes consultadas no dan citas concretas en Andalucía.",
   temporada="Verano y otoño. First Nature da de julio a diciembre en Gran Bretaña; AmanitaCesarea.com sitúa S. verrucosum en otoño.",
   rasgos_clave=["Piel dura, gruesa y escamosa", "Interior que se vuelve pronto negro violáceo", "Unido al suelo por cordones blancos o un falso pie", "Olor desagradable"],
   no_confundir_con=[
     {"id": "terfezia_arenaria", "diferencias": ["La criadilla crece enterrada y sale en primavera", "Su interior es crema rosado con vetas claras, nunca negro violáceo ni pulverulento", "Su piel es fina o lisa al principio, blanquecina a rojiza, sin escamas duras"]}],
   fuentes=[fn("scleroderma-citrinum", "Scleroderma citrinum"), fn("scleroderma-verrucosum", "Scleroderma verrucosum"), ac("scleroderma-verrucosum", "Scleroderma verrucosum"), wp("en", "Scleroderma_citrinum", "Scleroderma citrinum"), sf(181865, "Scleroderma citrinum"), sf(211519, "Scleroderma verrucosum")])

# ================= ALICANTE (fase D1): docs/investigacion/2026-10-15-fichas-alicante.md =================
sp(id="hygrophorus_latitabundus", nombre_cientifico="Hygrophorus latitabundus Britzelm.", nombres_comunes=["llenega negra", "llenega gris", "mocosa"],
   grupo="apreciada", toxicidad_nota=AV + " " + SIN_CONF,
   sombrero="De 3 a 12 cm (hasta 13). Gris pardo a pardo negruzco, más oscuro en el centro. Muy viscoso con humedad y pegajoso mucho tiempo después. Borde enrollado y mamelón ancho y bajo.",
   himenio="Láminas blancas, gruesas y céreas, algo decurrentes y medianamente separadas; con la edad se manchan de pardo.",
   pie="Blanco, más grueso hacia la mitad y viscoso, con fibrillas pardas arriba; abajo lo oscurecen los restos de mucílago.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Blanca y firme.",
   olor_sabor="Olor débil a seta y sabor suave.",
   esporada="Blanca.",
   habitat="Bajo pinos, en suelo calizo. En La Rioja sale en pinares de Pinus nigra y P. halepensis, junto al níscalo." + ALIC,
   temporada="Otoño e invierno; de noviembre a enero en el sur de Portugal.",
   rasgos_clave=["Sombrero gris oscuro a negruzco y muy viscoso", "Pie viscoso, oscurecido abajo por el mucílago", "Láminas blancas, gruesas y céreas", "Bajo pinos, en suelo calizo"],
   no_confundir_con=[],
   fuentes=[fn("hygrophorus-latitabundus", "Hygrophorus latitabundus"), RIOJA_H, sf(167748, "Hygrophorus latitabundus"), gbif(2538733, "Hygrophorus latitabundus")])

sp(id="morchella_spp", nombre_cientifico="Morchella esculenta (L.) Pers. y especies próximas (M. elata, M. conica)", nombres_comunes=["colmenilla", "cagarria", "morilla", "múrgula"],
   grupo="apreciada",
   toxicidad_nota=AV + " Es tóxica: cruda o poco cocinada causa trastornos digestivos, y Saviuc et al. (2010) describen además un síndrome neurológico (temblor, mareo, falta de equilibrio) en personas que la habían comido.",
   sombrero="De 3 a 8 cm de ancho y de 5 a 12 de alto; globoso, ovalado o cónico. Celdas hundidas e irregulares separadas por costillas, como un panal. De crema a ocre o pardo. M. elata es más oscura y puntiaguda, con las celdas en columnas.",
   himenio="No tiene láminas ni poros: la superficie fértil está dentro de las celdas.",
   pie="Blanco cremoso, granuloso, hueco y engrosado en la base. El borde del sombrero se une a él.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Cerosa y frágil. Cortada de arriba abajo, el sombrero y el pie forman una sola cavidad hueca.",
   olor_sabor="Olor poco característico según First Nature; agradable según AmanitaCesarea.com.",
   esporada="Blanco crema a ocre pálido.",
   habitat="Sitios húmedos: riberas de ríos y arroyos, bajo álamos y chopos. También suelos calizos y removidos. Con registros en GBIF de M. esculenta y M. elata en la zona de Alicante y en la de Marbella.",
   temporada="Primavera, desde finales de marzo.",
   rasgos_clave=["Sombrero con celdas hundidas, como un panal", "Hueca de arriba abajo, en una sola cavidad", "Borde del sombrero unido al pie", "Sale en primavera"],
   no_confundir_con=[
     {"id": "gyromitra_esculenta", "diferencias": ["Gyromitra tiene el sombrero con pliegues como un cerebro, sin celdas", "Por dentro tiene cámaras irregulares; la colmenilla es una sola cavidad", "Su sombrero suele ser pardo rojizo (G. gigas, más clara)"]}],
   fuentes=[ac("morchella-esculenta", "Morchella esculenta"), fn("morchella-esculenta", "Morchella esculenta"), MORCH, sf(247978, "Morchella esculenta"), gbif(2594602, "Morchella esculenta"), gbif(2594626, "Morchella elata")])

sp(id="tricholoma_terreum", nombre_cientifico="Tricholoma terreum (Schaeff.) P. Kumm.", nombres_comunes=["negrilla", "fredolic", "ratonera"],
   grupo="toxica",
   toxicidad_nota="TÓXICA. Durante mucho tiempo se ha recolectado, pero Yin et al. (2014) aislaron en ella dos compuestos que en ratones dañan el músculo, y la relacionan con la rabdomiólisis. Otros micólogos lo discuten (Davoli et al., 2016). Por precaución, esta guía la trata como tóxica. Además se confunde con otros Tricholoma grises que también lo son.",
   sombrero="De 2 a 7 cm según AmanitaCesarea.com (hasta 10 según First Nature). Gris ratón a gris pardo, más oscuro en el centro, como de fieltro, con fibras o escamillas finas que salen del centro. Convexo y luego plano, con un mamelón suave.",
   himenio="Láminas escotadas, anchas, separadas y frágiles; blanco plata de jóvenes y luego gris claro, a veces amarillentas al envejecer.",
   pie="De 2 a 6 cm, blanco grisáceo, cilíndrico y algo fibroso.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Blanca o algo grisácea, escasa y muy frágil.",
   olor_sabor="Olor suave a harina según AmanitaCesarea.com; poco característico según First Nature. No se debe probar.",
   esporada="Blanca.",
   habitat="Bosques de coníferas, sobre todo pinares, en suelo calizo o neutro. Sale en grupos numerosos, a veces en corros." + ALIC,
   temporada="Otoño y principios del invierno; aguanta las heladas.",
   rasgos_clave=["Sombrero gris ratón, como de fieltro, de 2 a 7 cm", "Láminas blanquecinas o grises, nunca amarillo oro", "Carne fina y muy frágil", "En grupos numerosos bajo pinos"],
   no_confundir_con=[
     {"id": "tricholoma_pardinum", "diferencias": ["T. pardinum es más grande (5 a 15 cm) y carnoso, con escamas oscuras y gruesas en círculos sobre fondo claro", "Es menos frágil", "Algunas formas huelen a harina"]},
     {"id": "tricholoma_equestre", "diferencias": ["T. equestre tiene las láminas y el pie amarillos", "Su sombrero es amarillento, con fibras pardas u oliva en el centro"]}],
   fuentes=[ac("tricholoma-terreum", "Tricholoma terreum"), fn("tricholoma-terreum", "Tricholoma terreum"), YIN, DAVOLI, sf(216171, "Tricholoma terreum"), gbif(5241808, "Tricholoma terreum")])

sp(id="tricholoma_portentosum", nombre_cientifico="Tricholoma portentosum (Fr.) Quél.", nombres_comunes=["capuchina", "ratón"],
   grupo="apreciada", toxicidad_nota=AV + " Varios Tricholoma tóxicos se le parecen (T. pardinum, T. virgatum, T. sejunctum): no recojas tricolomas grises sin un experto.",
   sombrero="De 5 a 15 cm; cónico campanulado, luego plano con un mamelón suave. Gris verdoso oscuro con reflejos amarillentos y fibrillas radiales gris violáceas oscuras; algo viscoso con humedad.",
   himenio="Láminas escotadas, ventrudas, frágiles y algo separadas; blanco grisáceas muy claras, con reflejos amarillos en los adultos cerca del pie.",
   pie="De 5 a 15 cm por 0,8 a 2 cm; blanco grisáceo con un reflejo amarillo característico, algo fibroso, a menudo muy enterrado.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Blanca, algo grisácea en los adultos, frágil.",
   olor_sabor="Olor harinoso suave y sabor dulce.",
   esporada="Blanquecina.",
   habitat="Bosques de coníferas, menos en hayedos; en grupos o matas. GBIF tiene pocos registros en la zona de Marbella (Serranía de Ronda y Grazalema).",
   temporada="Otoño y principio del invierno; aguanta bien las heladas y es de las más tardías.",
   rasgos_clave=["Sombrero gris con fibrillas negras radiales", "Reflejo amarillo en el pie y en las láminas", "Sin anillo ni volva", "Olor harinoso suave", "Bajo pinos, al final del otoño"],
   no_confundir_con=[
     {"id": "tricholoma_pardinum", "diferencias": ["T. pardinum, tóxico, es más robusto, con el borde enrollado y grandes escamas negruzcas redondeadas sobre fondo pardo claro", "No tiene el reflejo amarillo del pie de la capuchina"]},
     {"id": "amanita_phalloides", "diferencias": ["A. phalloides, mortal, puede tener un sombrero parecido", "Tiene anillo y volva blanca en saco; la capuchina no tiene ninguno de los dos: saca la seta entera"]}],
   fuentes=[ac("tricholoma-portentosum", "Tricholoma portentosum"), GBM(5241860, "Tricholoma portentosum")])

sp(id="tricholoma_pardinum", nombre_cientifico="Tricholoma pardinum (Pers.) Quél.", nombres_comunes=[],
   grupo="toxica",
   toxicidad_nota="TÓXICA. Intoxicación digestiva (náuseas, vómitos, dolor de vientre y diarrea) que empieza entre media hora y 4 horas después de comerla. La tabla de toxicidad cita casos graves, con lesiones en el hígado, shock y hemorragias digestivas.",
   sombrero="De 5 a 15 cm; hemisférico y luego extendido, con un mamelón bajo. Fondo blanquecino con escamas pardas oscuras o grises en círculos concéntricos, mayores hacia el centro.",
   himenio="Láminas blancas que amarillean, a veces con tono verdoso.",
   pie="Blanco o pardo grisáceo claro, fibroso, con la base engrosada.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Firme, menos frágil que la de la negrilla.",
   olor_sabor="Algunas formas huelen a harina. No se debe probar.",
   esporada="Blanca.",
   habitat="First Nature la describe bajo frondosas en Gran Bretaña; las fuentes consultadas no dan su hábitat en el levante. GBIF tiene un registro en la zona de Alicante.",
   temporada="Final del verano y otoño.",
   rasgos_clave=["Escamas oscuras y gruesas en círculos sobre fondo claro", "Sombrero grande, de hasta 15 cm", "Base del pie engrosada", "Láminas blancas que amarillean"],
   no_confundir_con=[
     {"id": "tricholoma_terreum", "diferencias": ["La negrilla es más pequeña (2 a 7 cm) y muy frágil", "Su sombrero es como de fieltro, sin escamas gruesas"]},
     {"id": "tricholoma_portentosum", "diferencias": ["La capuchina tiene el sombrero gris con fibrillas negras radiales, sin escamas oscuras en círculos", "Su pie tiene un reflejo amarillo que falta en T. pardinum (AmanitaCesarea.com)", "T. pardinum es más robusto, con borde enrollado y grandes escamas negruzcas sobre fondo pardo claro"]}],
   fuentes=[fn("tricholoma-pardinum", "Tricholoma pardinum"), ac("tricholoma-terreum", "Tricholoma terreum (cita T. pardinum)"), TOX, sf(356853, "Tricholoma pardinum"), gbif(7242174, "Tricholoma pardinum")])

sp(id="tricholoma_equestre", nombre_cientifico="Tricholoma equestre (L.) P. Kumm. (incluye T. auratum y T. flavovirens)", nombres_comunes=["seta de los caballeros", "verderón", "limonera"],
   grupo="mortal",
   toxicidad_nota="MORTAL. Comerla varias veces seguidas ha causado rabdomiólisis (destrucción del músculo): en Francia, 12 casos y 3 muertes (Bedry et al., 2001). La debilidad, el dolor muscular y la orina oscura aparecen entre 24 y 60 horas después.",
   sombrero="De 5 a 12 cm. Amarillo, con fibrillas radiales pardas u oliváceas más densas en el centro; algo viscoso con lluvia. Con la edad pasa a ocre.",
   himenio="Láminas amarillo oro, escotadas y apretadas, que siguen amarillas toda la vida.",
   pie="De 5 a 10 cm, amarillo, algo más claro que el sombrero, con fibrillas a lo largo.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Blanca, amarillenta bajo la cutícula; firme.",
   olor_sabor="Olor suave, algo harinoso según AmanitaCesarea.com; sin olor marcado según First Nature. No se debe probar.",
   esporada="Blanca.",
   habitat="Bosques de coníferas, mejor en suelo arenoso; a veces bajo frondosas. GBIF tiene registros en la zona de Alicante.",
   temporada="Otoño e invierno.",
   rasgos_clave=["Láminas amarillo oro", "Pie amarillo", "Sombrero amarillo con el centro más oscuro", "Sin anillo ni volva"],
   no_confundir_con=[
     {"id": "tricholoma_terreum", "diferencias": ["La negrilla tiene las láminas blanquecinas o grises, nunca amarillo oro", "Su sombrero es gris ratón, como de fieltro"]}],
   fuentes=[ac("tricholoma-equestre", "Tricholoma equestre"), fn("tricholoma-equestre", "Tricholoma equestre"), NEJM, TOX, sf(176119, "Tricholoma equestre"), gbif(3324883, "Tricholoma equestre")])

sp(id="gyromitra_esculenta", nombre_cientifico="Gyromitra esculenta (Pers.) Fr. (incluye G. gigas)", nombres_comunes=["falsa colmenilla", "bonete"],
   grupo="mortal",
   toxicidad_nota="MORTAL. Contiene giromitrina. Entre 6 y 24 horas después de comerla aparecen vómitos y diarrea y, en los casos graves, daño en el sistema nervioso, el hígado y el riñón; puede causar la muerte a los pocos días. Ni secarla ni cocinarla elimina el riesgo. La tabla de toxicidad incluye también G. gigas.",
   sombrero="De 3 a 10 cm (hasta 15). Irregular y lobulado, con pliegues como un cerebro; pardo rojizo oscuro a casi negro. G. gigas es más grande y más clara, de rojiza a avellana. No tiene celdas.",
   himenio="No tiene láminas ni poros: la superficie fértil es la del sombrero.",
   pie="Corto, blanco rosado o crema, con surcos y frágil.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Por dentro tiene cámaras huecas irregulares; no es una sola cavidad como la colmenilla. Carne frágil y cérea.",
   olor_sabor="Olor suave. No se debe probar.",
   esporada="Amarillenta pálida.",
   habitat="Bosques de coníferas con humus, en suelo arenoso bajo pinos; prefiere más de 800 m de altitud. GBIF no tiene registros en la zona de Alicante: la ficha está porque se confunde con la colmenilla.",
   temporada="Primavera, como las colmenillas. AmanitaCesarea.com sitúa G. gigas en otoño.",
   rasgos_clave=["Sombrero como un cerebro, sin celdas", "Por dentro tiene cámaras; no está hueca de arriba abajo", "Color pardo rojizo; G. gigas, más clara", "Puede salir a la vez que las colmenillas"],
   no_confundir_con=[
     {"id": "morchella_spp", "diferencias": ["La colmenilla tiene celdas hundidas como un panal, no pliegues", "Cortada de arriba abajo, la colmenilla es una sola cavidad"]}],
   fuentes=[ac("gyromitra-esculenta", "Gyromitra esculenta"), fn("gyromitra-esculenta", "Gyromitra esculenta"), TOX, DON, sf(236690, "Gyromitra esculenta")])

sp(id="clitocybe_dealbata", nombre_cientifico="Clitocybe dealbata (Sowerby) P. Kumm. (incluye C. rivulosa)", nombres_comunes=[],
   grupo="mortal",
   toxicidad_nota="MORTAL. Síndrome muscarínico entre 20 minutos y 2 horas después de comerla: sudor abundante, lagrimeo, salivación, vómitos, diarrea y visión borrosa. Casi siempre se cura, pero la tabla de toxicidad cita muertes, y First Nature advierte de que el riesgo es mayor con problemas de corazón o respiratorios.",
   sombrero="De 1 a 6 cm. Blanco, con un tono beige al envejecer; harinoso o sedoso, como escarchado. Convexo y luego plano o algo hundido; con la edad aparecen anillos concéntricos tenues.",
   himenio="Láminas blancas y apretadas, pegadas al pie o algo decurrentes; con la edad toman un tono rosado grisáceo.",
   pie="De 3 a 4 cm, blanco, liso y harinoso o sedoso.",
   volva="No tiene.", anillo="No tiene.",
   carne_y_corte="Blanca y fina.",
   olor_sabor="Olor dulce, poco característico. No se debe probar.",
   esporada="Blanca.",
   habitat="Prados, cunetas, parques y dunas, a menudo en corros, donde también se buscan la senderuela y la seta de San Jorge. GBIF tiene registros en la zona de Alicante.",
   temporada="De julio a diciembre en Gran Bretaña; las fuentes consultadas no dan fechas para el levante.",
   rasgos_clave=["Seta pequeña y blanca, como escarchada", "Láminas blancas o, ya viejas, rosado grisáceas; nunca marrones", "Sin anillo", "En prados, a menudo en corros"],
   no_confundir_con=[
     {"id": "agaricus_campestris", "diferencias": ["El champiñón tiene las láminas libres, rosa vivo y luego marrón oscuro", "Tiene anillo en el pie", "Su esporada es marrón oscura"]},
     {"id": "pleurotus_eryngii", "diferencias": ["La seta de cardo tiene la cutícula más oscura, el pie más excéntrico y las láminas más decurrentes (AmanitaCesarea.com)", "Nace de las raíces del cardo corredor"]}],
   fuentes=[fn("clitocybe-rivulosa", "Clitocybe rivulosa (= C. dealbata)"), TOX, DON, sf(216184, "Clitocybe dealbata"), gbif(2531052, "Clitocybe rivulosa (= C. dealbata)")])

# ---------- fotos ----------
import re as _re
def limpia_autor(a):
    m = _re.match(r"This image was created by user (.+?) \((.+?)\) at Mushroom Observer", a)
    if m: return f"{m.group(1)} ({m.group(2)}), Mushroom Observer"
    a = a.replace("Björn S...", "Björn S. (Flickr)")
    a = a.replace("No machine-readable author provided. Rigolithe assumed (based on copyright claims).", "Rigolithe")
    a = a.replace("Russule_charbonniere.jpg: MediAtta derivative work: Ak ccm (talk)", "MediAtta; recorte de Ak ccm")
    a = a.replace(" (the sole owner and copyright holder of this image)", "")
    a = a.replace("Santos-Silva C, Louro R, Natário B, Nobre T (2021) Lack of knowledge on ecological determinants and cryptic lifestyles hinder our understanding of Terfezia diversity. MycoKeys 84: 1-14.", "Santos-Silva C., Louro R., Natário B. y Nobre T. (MycoKeys 84, 2021)")
    return a.strip()
DESC = {
 "fotos/amanita_caesarea_1.jpg": "Láminas amarillas y volva blanca en saco",
 "fotos/amanita_caesarea_2.jpg": "Huevos abriéndose: sombrero naranja dentro de la volva blanca",
 "fotos/amanita_caesarea_3.jpg": "Huevos y ejemplares jóvenes",
 "fotos/amanita_phalloides_1.jpg": "Sombrero verde oliváceo y volva blanca en saco",
 "fotos/amanita_phalloides_2.jpg": "Huevos de oronja verde cortados: interior blanco",
 "fotos/amanita_phalloides_3.jpg": "Serie de desarrollo, de huevo a adulto",
 "fotos/boletus_edulis_1.jpg": "Corte: carne blanca que no cambia",
 "fotos/boletus_edulis_3.jpg": "Sección: poros amarillentos",
 "fotos/lactarius_deliciosus_1.jpg": "Corte con látex naranja",
 "fotos/caloboletus_calopus_1.jpg": "Corte: la carne azulea",
 "fotos/caloboletus_radicans_2.jpg": "Corte: la carne azulea",
 "fotos/rubroboletus_satanas_2.jpg": "Corte: carne que azulea",
 "fotos/tylopilus_felleus_1.jpg": "Poros rosados",
 "fotos/omphalotus_olearius_1.jpg": "Mata al pie de un olivo",
 "fotos/cantharellus_cibarius_1.jpg": "Pliegues decurrentes, no láminas",
 "fotos/macrolepiota_procera_2.jpg": "Pie con dibujo de piel de serpiente",
 "fotos/lactarius_torminosus_1.jpg": "Ejemplares jóvenes de borde lanoso",
 "fotos/lactarius_chrysorrheus_1.jpg": "Látex amarillo sobre las láminas",
 "fotos/hydnum_repandum_1.jpg": "Aguijones bajo el sombrero",
 "fotos/agaricus_campestris_1.jpg": "Láminas rosas, sin volva",
 "fotos/amanita_ponderosa_1.jpg": "Volva gruesa manchada de tierra y láminas blanquecinas",
 "fotos/amanita_ponderosa_2.jpg": "Saliendo medio enterrado de la tierra",
 "fotos/terfezia_arenaria_1.jpg": "Varias especies de Terfezia de Portugal (lámina de MycoKeys)",
 "fotos/terfezia_arenaria_2.jpg": "Abierta: carne clara, crema rosada",
 "fotos/terfezia_arenaria_3.jpg": "T. claveryi y Tirmania nivea en un mercado de Marruecos",
 "fotos/craterellus_cornucopioides_2.jpg": "Trompeta de los muertos: embudo hueco y oscuro",
 "fotos/craterellus_cornucopioides_3.jpg": "C. lutescens: pie amarillo anaranjado y sombrero pardo",
 "fotos/pleurotus_ostreatus_3.jpg": "Láminas decurrentes sobre madera",
 "fotos/scleroderma_citrinum_1.jpg": "Ejemplar maduro abierto: interior pardo y pulverulento",
 "fotos/scleroderma_citrinum_2.jpg": "Corte: interior negro violáceo",
 "fotos/scleroderma_citrinum_3.jpg": "S. verrucosum: interior oscuro al corte",
 "fotos/morchella_spp_1.jpg": "Entera y cortada de arriba abajo: una sola cavidad",
 "fotos/gyromitra_esculenta_1.jpg": "Cortadas de arriba abajo: pliegues y cámaras por dentro",
 "fotos/tricholoma_equestre_1.jpg": "Láminas y pie amarillos",
 "fotos/tricholoma_pardinum_1.jpg": "Escamas oscuras en círculos sobre fondo claro",
 "fotos/tricholoma_terreum_3.jpg": "Láminas blanquecinas y grises",
 "fotos/suillus_bellinii_3.jpg": "S. collinitus: micelio rosado en la base del pie",
 "fotos/lactarius_deliciosus_3.jpg": "L. sanguifluus: láminas y carne del pie de tono rojo vino",
}
for e in E:
    if e["toxicidad_nota"].startswith(AV):
        e["toxicidad_nota"] = AV_GRUPO[e["grupo"]] + e["toxicidad_nota"][len(AV):]
    assert AV not in e["toxicidad_nota"], e["id"]
    fs = []
    for f in FOTOS[e["id"]]:
        g = {"archivo": f["archivo"], "autor": limpia_autor(f["autor"]), "licencia": f["licencia"], "url_fuente": f["url_fuente"]}
        if f["archivo"] in DESC: g["descripcion"] = DESC[f["archivo"]]
        fs.append(g)
    e["fotos"] = fs
# orden de campos
ORDER = ["id","nombre_cientifico","nombres_comunes","grupo","toxicidad_nota","sombrero","himenio","pie","volva","anillo","carne_y_corte","olor_sabor","esporada","habitat","temporada","fase_huevo","rasgos_clave","no_confundir_con","fotos","fuentes"]
E2 = [{k: e[k] for k in ORDER if k in e} for e in E]
json.dump(E2, open(OUT, "w"), ensure_ascii=False, indent=2)
print(len(E2), "especies")
