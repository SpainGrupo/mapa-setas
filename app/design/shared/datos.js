/*
 * Shared content for the three direction prototypes. Same content, different design.
 * Species facts and months: guia/especies.json and public/data/manifest.json (real).
 * Places, scores, minutes and the recognizer session are SAMPLE values for the mock-up
 * (marked muestra: true) — not real forecasts.
 * Photos: guia/fotos (licences in guia/CREDITOS.md), resized copies in shared/fotos.
 * UI copy is Spanish (the product is Spanish). Never claim edibility anywhere.
 */
window.SETAS = {
  hoy: { fecha: 'mar 14 oct', confianza: 'alta', confianzaTexto: 'Previsión fiable: a 3 días o menos suele acertar.' },
  dias: [
    { k: 'hoy', d: 'mar 14', conf: 'alta' }, { k: 'mañana', d: 'mié 15', conf: 'alta' },
    { k: 'jue 16', conf: 'alta' }, { k: 'vie 17', conf: 'media' }, { k: 'sáb 18', conf: 'media' },
    { k: 'dom 19', conf: 'media' }, { k: 'lun 20', conf: 'baja' }, { k: '+15 días', conf: 'baja' },
  ],
  especies: [
    { id: 'boletus_aereus', comun: 'Tentullo', cientifico: 'Boletus aereus', meses: [5, 6, 9, 10, 11, 12], foto: 'boletus_aereus_1', estado: 'sale', texto: 'Ya sale · aguanta hasta ~17/10' },
    { id: 'boletus_aestivalis', comun: 'Boleto reticulado', cientifico: 'Boletus aestivalis / reticulatus', meses: [5, 6, 9, 10, 11], foto: 'boletus_reticulatus_1', estado: 'sale', texto: 'Ya sale · aguanta hasta ~15/10' },
    { id: 'boletus_edulis', comun: 'Calabaza', cientifico: 'Boletus edulis', meses: [9, 10, 11, 12], foto: 'boletus_edulis_1', estado: 'sale', texto: 'Ya sale · aguanta hasta ~18/10' },
    { id: 'boletus_pinophilus', comun: 'Hongo de pino', cientifico: 'Boletus pinophilus', meses: [9, 10, 11, 12], foto: 'boletus_pinophilus_1', estado: 'pronto', texto: 'Empieza en ~4 días' },
    { id: 'amanita_caesarea', comun: 'Oronja', cientifico: 'Amanita caesarea', meses: [7, 8, 9, 10, 11], foto: 'amanita_caesarea_3', estado: 'sale', texto: 'Puede salir · aguanta hasta ~20/10' },
    { id: 'lactarius_deliciosus', comun: 'Níscalo', cientifico: 'Lactarius deliciosus', meses: [10, 11, 12, 1], foto: 'lactarius_deliciosus_3', estado: 'pronto', texto: 'Empieza en ~6 días' },
    { id: 'lactarius_sanguifluus', comun: 'Níscalo de sangre', cientifico: 'Lactarius sanguifluus', meses: [10, 11, 12, 1], foto: null, estado: 'pronto', texto: 'Empieza en ~6 días' },
    { id: 'cantharellus_cibarius', comun: 'Rebozuelo', cientifico: 'Cantharellus cibarius', meses: [10, 11, 12], foto: 'cantharellus_cibarius_1', estado: 'temporada', texto: 'En temporada, falta lluvia' },
    { id: 'amanita_ponderosa', comun: 'Gurumelo', cientifico: 'Amanita ponderosa', meses: [2, 3, 4], foto: null, estado: 'fuera', texto: 'Fuera de temporada: empieza en ~109 días' },
    { id: 'macrolepiota_procera', comun: 'Parasol', cientifico: 'Macrolepiota procera', meses: [9, 10, 11, 12], foto: null, estado: 'sale', texto: 'Puede salir · aguanta hasta ~19/10' },
    { id: 'pleurotus_eryngii', comun: 'Seta de cardo', cientifico: 'Pleurotus eryngii', meses: [10, 11, 12], foto: null, estado: 'temporada', texto: 'En temporada, falta lluvia' },
    { id: 'terfezia_arenaria', comun: 'Criadilla de tierra', cientifico: 'Terfezia arenaria', meses: [3, 4, 5], foto: null, estado: 'fuera', texto: 'Fuera de temporada: empieza en ~140 días' },
  ],
  mesActual: 10,
  // SAMPLE ranking (top general). Score 0–100 = how good the forest is today, not whether there are mushrooms.
  top: [
    { n: 1, especie: 'boletus_aereus', sitio: 'Valle del Genal · Benalauría', punt: 88, estado: 'Buen momento', min: 22, sube: 64, dif: 'Fácil', km: 41, aparcar: 'pista forestal de Benalauría', muestra: true },
    { n: 2, especie: 'amanita_caesarea', sitio: 'Sierra Bermeja · Los Reales', punt: 84, estado: 'Buen momento', min: 36, sube: 138, dif: 'Moderada', km: 18, aparcar: 'camino de servicio sin nombre', muestra: true },
    { n: 3, especie: 'boletus_edulis', sitio: 'Sierra de las Nieves · Tolox', punt: 81, estado: 'Buen momento', min: 56, sube: 44, dif: 'Moderada', km: 56, aparcar: 'área recreativa Río Grande', muestra: true },
    { n: 4, especie: 'boletus_aestivalis', sitio: 'Benamaya · Monda', punt: 77, estado: 'Puede salir', min: 14, sube: 30, dif: 'Fácil', km: 33, aparcar: 'carril de Benamaya', muestra: true },
    { n: 5, especie: 'macrolepiota_procera', sitio: 'Montes de Málaga · Colmenar', punt: 72, estado: 'Puede salir', min: 41, sube: 210, dif: 'Difícil', km: 69, aparcar: 'pista de la Fuente de la Reina', muestra: true },
  ],
  // SAMPLE access card (from the current app screenshot acceso-online.png / ruta-perfil.png)
  acceso: {
    coords: '36.61084, -5.24579', aparcar: 'camino de servicio sin nombre', min: 36, sube: 138, baja: 61, dist: '920 m', dif: 'Moderada',
    perfil: [413, 404, 398, 397, 405, 412, 431, 440, 446, 462, 488, 512, 545, 516], // m, every ~70 m
    aviso: 'Estimación: puede haber fincas privadas, vallas o barrancos.',
  },
  // Recognizer session (SAMPLE): the user photographed two young specimens emerging from white sacs.
  // Photo stand-in: amanita_caesarea_2 (Louis Aureglia, CC BY 4.0) shown as "Tu foto (ejemplo)".
  reconocer: {
    tuFoto: 'amanita_caesarea_2',
    top: { id: 'amanita_caesarea', comun: 'Oronja', cientifico: 'Amanita caesarea', parecido: 'Se parece mucho a tu foto', foto: 'amanita_caesarea_1' },
    otros: [
      { cientifico: 'Amanita muscaria', parecido: 'Algo parecida' },
      { cientifico: 'Amanita vaginata', parecido: 'Poco parecida', sinFicha: true },
    ],
    respuestas: [
      { p: '¿Cómo es la base (volva)?', r: 'Saco blanco' },
      { p: '¿De qué color son las láminas?', r: 'No sé (aún cerrada)' },
      { p: '¿Has cortado un huevo de arriba abajo?', r: 'No' },
    ],
    // Pairs: top candidate vs EACH dangerous lookalike (from no_confundir_con of A. caesarea).
    pares: [
      {
        id: 'amanita_phalloides', comun: 'Oronja verde', cientifico: 'Amanita phalloides', gravedad: 'mortal', estado: 'NO DESCARTADA',
        porQue: 'Tus respuestas no separan aún: volva en saco en las dos y láminas sin ver.',
        fotos: ['amanita_phalloides_1', 'amanita_phalloides_2'],
        rasgos: [
          { rasgo: 'Sombrero', cand: 'Naranja, liso, margen estriado', pelig: 'Verde oliva (existe forma blanca), sin estrías', tu: 'Se ve naranja en tu foto', separa: 'orienta', dib: null },
          { rasgo: 'Láminas', cand: 'Amarillas', pelig: 'Blanco puro', tu: 'No sé (aún cerrada)', separa: 'clave', dib: 'himenio-laminas' },
          { rasgo: 'Pie', cand: 'Amarillo', pelig: 'Blanco con jaspeado verdoso en zigzag', tu: 'Sin responder', separa: 'clave', dib: 'pie-jaspeado' },
          { rasgo: 'Anillo', cand: 'Amarillo, colgante', pelig: 'Blanco, colgante', tu: 'Sin responder', separa: 'clave', dib: 'anillo-falda' },
          { rasgo: 'Volva', cand: 'Blanca, en saco', pelig: 'Blanca, en saco', tu: 'Saco blanco', separa: 'no', dib: 'volva-saco' },
          { rasgo: 'Huevo cortado', cand: 'Naranja y amarillo dentro', pelig: 'Todo blanco (a veces verdoso)', tu: 'No lo has cortado', separa: 'clave', dib: 'huevo' },
        ],
        falsoPositivo: {
          parecido: 'Misma silueta de Amanita: volva blanca en saco y anillo colgante. En huevo, por fuera, son casi iguales.',
          separa: 'El color de láminas, pie y anillo (amarillo frente a blanco) y, en huevo, el corte de arriba abajo.',
          fiabilidad: 'Alta si ves láminas amarillas en un ejemplar fresco. Baja en huevo sin cortar o con láminas descoloridas por lluvia o edad.',
          nivel: 'baja', // with the current answers
          foto: 'Corta un huevo de arriba abajo y haz una foto del interior con luz de día. Si ya abrió, foto de las láminas desde abajo.',
        },
      },
      {
        id: 'amanita_verna', comun: 'Cicuta blanca', cientifico: 'Amanita verna', gravedad: 'mortal', estado: 'NO DESCARTADA',
        porQue: 'Mortal: sigue en la lista hasta que el color la descarte.',
        fotos: ['amanita_verna_2'],
        rasgos: [
          { rasgo: 'Sombrero', cand: 'Naranja', pelig: 'Blanco puro', tu: 'Se ve naranja en tu foto', separa: 'orienta', dib: null },
          { rasgo: 'Láminas', cand: 'Amarillas', pelig: 'Blancas siempre', tu: 'No sé (aún cerrada)', separa: 'clave', dib: 'himenio-laminas' },
          { rasgo: 'Volva', cand: 'Blanca, en saco', pelig: 'Blanca, grande, en saco', tu: 'Saco blanco', separa: 'no', dib: 'volva-saco' },
          { rasgo: 'Huevo cortado', cand: 'Naranja y amarillo dentro', pelig: 'Todo blanco', tu: 'No lo has cortado', separa: 'clave', dib: 'huevo' },
          { rasgo: 'Época', cand: 'Verano y otoño', pelig: 'Sobre todo primavera', tu: 'Hoy: octubre', separa: 'orienta', dib: null },
        ],
        falsoPositivo: {
          parecido: 'En huevo, las dos son un bulto blanco que sale de un saco blanco.',
          separa: 'Dentro del huevo y en el adulto: A. verna es blanca entera; la oronja muestra naranja y amarillo.',
          fiabilidad: 'Alta con el corte del huevo o un adulto abierto. La época sola no descarta nada.',
          nivel: 'baja',
          foto: 'La misma que arriba: interior del huevo cortado, con luz de día.',
        },
      },
      {
        id: 'amanita_muscaria', comun: 'Matamoscas', cientifico: 'Amanita muscaria', gravedad: 'toxica', estado: 'DESCARTADA POR TU RESPUESTA',
        porQue: 'Respondiste «saco blanco»: la matamoscas no forma saco. Compruébalo sacando la seta entera.',
        fotos: ['amanita_muscaria_1'],
        rasgos: [
          { rasgo: 'Sombrero', cand: 'Naranja liso', pelig: 'Rojo con verrugas blancas (la lluvia las quita)', tu: 'Liso en tu foto', separa: 'orienta', dib: null },
          { rasgo: 'Volva', cand: 'Saco membranoso', pelig: 'Sin saco: verrugas en anillos sobre el bulbo', tu: 'Saco blanco', separa: 'clave', dib: 'volva-verrugas' },
          { rasgo: 'Láminas y pie', cand: 'Amarillos', pelig: 'Blancos', tu: 'No sé (aún cerrada)', separa: 'clave', dib: 'himenio-laminas' },
        ],
        falsoPositivo: {
          parecido: 'Una matamoscas descolorida o sin verrugas se vuelve naranja y lisa, como la oronja.',
          separa: 'La base: saco membranoso (oronja) frente a verrugas en anillos sin saco (matamoscas).',
          fiabilidad: 'Alta si sacas la seta entera con la base. Baja si la cortaste a ras de suelo.',
          nivel: 'media',
          foto: 'La base completa, desenterrada, de lado.',
        },
      },
    ],
    avisoExperto: 'No consumas ninguna seta sin la confirmación de un experto (micólogo, sociedad micológica o farmacia).',
    nota: 'El reconocedor propone parecidos. No confirma nada y nunca dice si una seta se come.',
  },
  creditos: {
    amanita_caesarea_1: 'Gobrona · CC BY-SA 4.0', amanita_caesarea_2: 'Louis Aureglia · CC BY 4.0', amanita_caesarea_3: 'Nikolay Kashpor · CC BY 4.0',
    amanita_phalloides_1: 'Björn S. · CC BY-SA 2.0', amanita_phalloides_2: 'David Whyte · CC BY-SA 4.0', amanita_phalloides_3: 'Justin Pierce · CC BY-SA 3.0',
    amanita_verna_2: 'Sinisa Radic · CC BY-SA 4.0', amanita_muscaria_1: 'Scott Darbey · CC BY 2.0', amanita_muscaria_2: 'Rob Swystun · CC BY 2.0',
    boletus_aereus_1: 'Nacionalni park Una · CC BY-SA 4.0', boletus_edulis_1: 'Ernie · dominio público', boletus_pinophilus_1: 'Mariia Goncharskaia · CC BY-SA 4.0',
    boletus_reticulatus_1: 'Björn S. · CC BY-SA 2.0', cantharellus_cibarius_1: 'Jose Angel Urquia Goitia · CC BY-SA 4.0', lactarius_deliciosus_3: 'Retama · CC BY-SA 3.0',
  },
};
