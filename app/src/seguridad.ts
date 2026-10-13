// Capa de seguridad del reconocedor (spec §2, no negociable). Pura, sin DOM: se prueba al 100 % en seguridad.test.ts.
//
// Reglas:
// 1. El modelo solo propone. La ausencia de una especie en el top-5 (o en el vocabulario) NO la descarta.
// 2. Cada candidato activa su grupo morfológico (amanitoide, boletoide, cantareloide, lepiotoide, lactarioide, hipogeo).
//    Las peligrosas (mortales y tóxicas de la guía) de cada grupo activo se listan SIEMPRE como «no descartadas»,
//    más las peligrosas que la guía cita en «No confundir con…» de cada candidato.
// 3. Una peligrosa solo sale de la lista cuando las respuestas guiadas cumplen una regla de descarte basada en
//    rasgos explícitos de la guía. «No sé» (o sin responder) nunca descarta.
// 4. Si las respuestas hacen probable una mortal (p. ej. huevo blanco por dentro) hay alerta roja, y esa especie
//    no se puede descartar por otra respuesta contradictoria.
// 5. Las mortales de la guía se listan siempre (con o sin reconocimiento) hasta que las respuestas las descarten.
// 6. Nunca se dice «comestible» ni «se puede comer». El aviso fijo va siempre.
import { genero } from './reconocer-nucleo';

export const AVISO_EXPERTO = 'No consumas ninguna seta sin la confirmación de un experto.';

export type GrupoMorfo = 'amanitoide' | 'boletoide' | 'cantareloide' | 'lepiotoide' | 'lactarioide' | 'hipogeo' | 'otros';
export type Nivel = 'mortal' | 'toxica';

export const NOMBRE_GRUPO: Record<GrupoMorfo, string> = {
  amanitoide: 'Amanitas y parecidas (volva, anillo, huevo)',
  boletoide: 'Boletos (poros bajo el sombrero)',
  cantareloide: 'Rebozuelos y parecidas (pliegues)',
  lepiotoide: 'Parasoles y lepiotas',
  lactarioide: 'Níscalos y otros Lactarius (látex)',
  hipogeo: 'Criadillas, trufas y bolas (sin sombrero ni pie)',
  otros: 'Otras setas',
};

/** Géneros → grupos. Un género puede activar dos grupos (Leucoagaricus: blanco con anillo, parece amanita y lepiota). */
const GENEROS: Record<string, GrupoMorfo[]> = {};
const asignar = (g: GrupoMorfo, generos: string) => generos.split(/\s+/).forEach((x) => (GENEROS[x] = [...(GENEROS[x] ?? []), g]));
asignar('amanitoide', 'Amanita Volvariella Volvopluteus Agaricus Leucoagaricus');
// Bolas blancas y «huevos»: un pedo de lobo o un Phallus cerrado se confunden con el huevo de una amanita (el
// reconocedor propone Calvatia o Phallus para fotos del gurumelo): activan también el grupo amanitoide.
asignar('amanitoide', 'Lycoperdon Bovista Calvatia Handkea Apioperdon Phallus');
asignar('boletoide', 'Boletus Rubroboletus Caloboletus Tylopilus Suillus Leccinum Leccinellum Xerocomus Xerocomellus Imleria '
  + 'Neoboletus Suillellus Hortiboletus Butyriboletus Cyanoboletus Chalciporus Gyroporus Porphyrellus Strobilomyces '
  + 'Aureoboletus Hemileccinum Pulveroboletus Rheubarbariboletus Imperator Lanmaoa Baorangia Boletinus');
asignar('cantareloide', 'Cantharellus Craterellus Pseudocraterellus Omphalotus Hygrophoropsis Hydnum Gomphus Turbinellus');
asignar('lepiotoide', 'Macrolepiota Lepiota Chlorophyllum Leucoagaricus Leucocoprinus Echinoderma Cystolepiota');
asignar('lactarioide', 'Lactarius Lactifluus');
// Bola o trufa, sin sombrero ni pie: criadillas y trufas (bajo tierra), falsas trufas, Scleroderma y los pedos de
// lobo con los que también se confunde. Pleurotus (seta de cardo) no tiene parecidas peligrosas en la guía: «otros».
asignar('hipogeo', 'Terfezia Tirmania Picoa Tuber Choiromyces Balsamia Genea Hydnotrya Elaphomyces Rhizopogon '
  + 'Melanogaster Hymenogaster Scleroderma Pisolithus Lycoperdon Bovista Calvatia Handkea Apioperdon');

export function gruposDe(nombreCientifico: string): GrupoMorfo[] {
  return GENEROS[genero(nombreCientifico)] ?? ['otros'];
}

/** Peligrosas de la guía por grupo (comprobado en el test contra guia/especies.json: todas mortales o tóxicas). */
export const PELIGROSAS_GRUPO: Record<GrupoMorfo, string[]> = {
  amanitoide: ['amanita_phalloides', 'amanita_verna', 'amanita_muscaria', 'amanita_pantherina'],
  boletoide: ['rubroboletus_satanas', 'caloboletus_calopus', 'caloboletus_radicans', 'tylopilus_felleus'],
  cantareloide: ['omphalotus_olearius'],
  lepiotoide: ['lepiota_brunneoincarnata', 'chlorophyllum_rhacodes', 'amanita_pantherina'],
  lactarioide: ['lactarius_torminosus', 'lactarius_chrysorrheus'],
  hipogeo: ['scleroderma_citrinum'],
  otros: [],
};

// ---------------------------------------------------------------- preguntas guiadas

export const NO_SE = 'no_se';
export interface Opcion { v: string; t: string }
export interface Pregunta { id: string; grupo: GrupoMorfo; texto: string; ayuda?: string; opciones: Opcion[] }
const op = (v: string, t: string): Opcion => ({ v, t });
const SI_NO = [op('si', 'Sí'), op('no', 'No'), op(NO_SE, 'No sé')];

export const PREGUNTAS: Pregunta[] = [
  { id: 'interior_huevo', grupo: 'amanitoide', texto: 'Si es un huevo cerrado: córtalo de arriba abajo. ¿De qué color es por dentro?',
    ayuda: 'Haz también una foto del interior. El de la oronja deja ver el sombrero naranja y las láminas y el pie amarillos; el de A. phalloides y A. verna es blanco.',
    opciones: [op('naranja_amarillo', 'Naranja y amarillo'), op('blanco', 'Blanco'), op('no_es_huevo', 'No es un huevo'), op(NO_SE, 'No sé')] },
  { id: 'laminas_pie_color', grupo: 'amanitoide', texto: '¿De qué color son las láminas y el pie?',
    opciones: [op('amarillos', 'Amarillos'), op('blancos', 'Blancos'), op('otro', 'Otro color'), op(NO_SE, 'No sé')] },
  { id: 'volva_saco', grupo: 'amanitoide', texto: '¿Tiene en la base una volva blanca en forma de saco?',
    ayuda: 'Saca la seta entera, sin cortarla: la volva suele quedar enterrada.', opciones: SI_NO },

  { id: 'color_poros', grupo: 'boletoide', texto: '¿De qué color son los poros (debajo del sombrero)?',
    opciones: [op('blanco_amarillo_verdoso', 'Blancos, amarillos o verdosos'), op('rojo_naranja', 'Rojos o naranjas'),
      op('rosado', 'Rosados'), op(NO_SE, 'No sé')] },
  { id: 'azulea_al_corte', grupo: 'boletoide', texto: '¿La carne azulea al cortarla o al apretar los poros?',
    ayuda: 'Corta de arriba abajo y espera un minuto: el azul puede aparecer y desvanecerse.', opciones: SI_NO },
  { id: 'color_reticulo', grupo: 'boletoide', texto: '¿Cómo es la red (retículo) del pie?',
    opciones: [op('claro', 'Blanca o clara, del color del pie'), op('rojo', 'Roja'), op('pardo_oscuro', 'Parda oscura, más que el fondo'),
      op('sin_reticulo', 'No tiene red'), op(NO_SE, 'No sé')] },

  { id: 'himenio_cantarelo', grupo: 'cantareloide', texto: 'Debajo del sombrero, ¿qué hay?',
    opciones: [op('pliegues', 'Pliegues gruesos y bifurcados que bajan por el pie'), op('laminas', 'Láminas finas y apretadas'),
      op('pinchos', 'Pinchos'), op(NO_SE, 'No sé')] },
  { id: 'en_matas_madera', grupo: 'cantareloide', texto: '¿Crece en matas, con los pies unidos, sobre madera, raíces o tocones (p. ej. al pie de un olivo)?', opciones: SI_NO },

  { id: 'sombrero_mayor_10cm', grupo: 'lepiotoide', texto: '¿El sombrero mide más de 10 cm?', opciones: SI_NO },
  { id: 'anillo_doble_movil', grupo: 'lepiotoide', texto: '¿Tiene un anillo doble que se desliza por el pie?', opciones: SI_NO },
  { id: 'pie_serpiente', grupo: 'lepiotoide', texto: '¿El pie tiene un dibujo de piel de serpiente (bandas en zigzag)?', opciones: SI_NO },
  { id: 'carne_enrojece', grupo: 'lepiotoide', texto: '¿La carne enrojece al cortarla, sobre todo en el pie?', opciones: SI_NO },

  { id: 'color_latex', grupo: 'lactarioide', texto: 'Corta una lámina: ¿de qué color es el látex (la gota que sale)?',
    opciones: [op('naranja_zanahoria', 'Naranja zanahoria'), op('rojo_vino', 'Rojo vino'), op('blanco', 'Blanco'),
      op('blanco_amarillea', 'Blanco que amarillea en segundos'), op(NO_SE, 'No sé')] },

  { id: 'interior_gleba', grupo: 'hipogeo', texto: 'Córtala por la mitad, de arriba abajo: ¿cómo es por dentro?',
    ayuda: 'Haz una foto del corte. La criadilla es crema rosada con vetas más claras; la Scleroderma pasa pronto de blanca a negro violácea. Si dentro se ve el dibujo de una seta (sombrero y pie), es un huevo de amanita.',
    opciones: [op('crema_vetas', 'Crema rosado, con vetas más claras'), op('negro_violaceo', 'Negro violáceo o pardo púrpura, o polvo oscuro'),
      op('blanco_liso', 'Blanco y uniforme, sin vetas'), op('silueta_seta', 'Se ve el dibujo de una seta dentro'), op(NO_SE, 'No sé')] },
  { id: 'piel_dura_escamosa', grupo: 'hipogeo', texto: '¿La piel es dura y gruesa, con escamas o verrugas?', opciones: SI_NO },
  { id: 'cordones_base', grupo: 'hipogeo', texto: '¿Estaba sobre el suelo, unida por cordones blancos o por un falso pie?',
    ayuda: 'La criadilla crece enterrada: se nota porque agrieta y abulta el suelo.', opciones: SI_NO },
];
export const PREGUNTA = Object.fromEntries(PREGUNTAS.map((p) => [p.id, p])) as Record<string, Pregunta>;

// ---------------------------------------------------------------- reglas de descarte y de alerta

type Condicion = Record<string, string[]>;   // todas las preguntas deben tener una de esas respuestas
interface Regla { especie: string; si: Condicion; motivo: string }
interface ReglaAlerta { nivel: Nivel; especies: string[]; si: Condicion; texto: string }

/** Basadas en rasgos_clave, fase_huevo y no_confundir_con de guia/especies.json. Varias reglas = cualquiera basta. */
export const DESCARTES: Regla[] = [
  // Amanitas: huevo naranja/amarillo por dentro, o láminas y pie amarillos (oronja) → no es phalloides/verna/pantherina.
  ...['amanita_phalloides', 'amanita_verna', 'amanita_pantherina'].flatMap((especie): Regla[] => [
    { especie, si: { interior_huevo: ['naranja_amarillo'] }, motivo: 'interior del huevo naranja y amarillo' },
    { especie, si: { laminas_pie_color: ['amarillos'] }, motivo: 'láminas y pie amarillos' },
  ]),
  // A. muscaria tiene láminas blancas; el interior del huevo no la distingue de la oronja (sombrero también naranja/rojo).
  { especie: 'amanita_muscaria', si: { laminas_pie_color: ['amarillos'] }, motivo: 'láminas y pie amarillos' },
  // A. pantherina: anillo membranoso fijo, pie sin dibujo de serpiente.
  { especie: 'amanita_pantherina', si: { anillo_doble_movil: ['si'], pie_serpiente: ['si'] }, motivo: 'anillo doble móvil y pie con piel de serpiente' },

  // Boletos tóxicos: los Caloboletus azulean siempre; R. satanas tiene poros rojos, red roja y azulea.
  { especie: 'caloboletus_calopus', si: { azulea_al_corte: ['no'] }, motivo: 'la carne no azulea' },
  { especie: 'caloboletus_radicans', si: { azulea_al_corte: ['no'] }, motivo: 'la carne no azulea' },
  { especie: 'rubroboletus_satanas',
    si: { color_poros: ['blanco_amarillo_verdoso'], azulea_al_corte: ['no'], color_reticulo: ['claro', 'pardo_oscuro', 'sin_reticulo'] },
    motivo: 'poros claros, carne que no azulea y red del pie no roja' },
  // T. felleus: poros blancos de joven y luego rosados, red parda oscura.
  { especie: 'tylopilus_felleus', si: { color_poros: ['blanco_amarillo_verdoso'], color_reticulo: ['claro'] }, motivo: 'poros claros y red clara' },
  { especie: 'tylopilus_felleus', si: { color_poros: ['rojo_naranja'] }, motivo: 'poros rojos (T. felleus nunca los tiene)' },

  // Omphalotus: láminas verdaderas y en matas sobre madera.
  { especie: 'omphalotus_olearius', si: { himenio_cantarelo: ['pliegues', 'pinchos'], en_matas_madera: ['no'] },
    motivo: 'pliegues o pinchos (no láminas) y no crece en matas sobre madera' },

  // Lepiotoides: L. brunneoincarnata es pequeña con anillo fugaz; C. rhacodes tiene pie liso y carne que enrojece.
  { especie: 'lepiota_brunneoincarnata', si: { sombrero_mayor_10cm: ['si'], anillo_doble_movil: ['si'] }, motivo: 'sombrero de más de 10 cm y anillo doble móvil' },
  { especie: 'chlorophyllum_rhacodes', si: { pie_serpiente: ['si'], carne_enrojece: ['no'] }, motivo: 'pie con piel de serpiente y carne que no enrojece' },

  // Lactarius tóxicos: látex blanco (L. chrysorrheus amarillea).
  ...['lactarius_torminosus', 'lactarius_chrysorrheus'].map((especie): Regla => (
    { especie, si: { color_latex: ['naranja_zanahoria', 'rojo_vino'] }, motivo: 'látex naranja o rojo vino' })),

  // Scleroderma frente a criadilla: hacen falta los tres rasgos de la guía (interior, piel y cómo crece).
  { especie: 'scleroderma_citrinum', si: { interior_gleba: ['crema_vetas'], piel_dura_escamosa: ['no'], cordones_base: ['no'] },
    motivo: 'interior crema rosado con vetas claras, piel sin escamas duras y crecía enterrada' },
];

export const ALERTAS: ReglaAlerta[] = [
  { nivel: 'mortal', especies: ['amanita_phalloides', 'amanita_verna'], si: { interior_huevo: ['blanco'] },
    texto: 'Huevo blanco por dentro: es el aspecto de Amanita phalloides o Amanita verna, MORTALES. No la toques más de lo necesario y lávate las manos.' },
  { nivel: 'mortal', especies: ['amanita_phalloides', 'amanita_verna'], si: { laminas_pie_color: ['blancos'], volva_saco: ['si'] },
    texto: 'Láminas blancas y volva en saco: rasgos de Amanita phalloides o Amanita verna, MORTALES.' },
  { nivel: 'mortal', especies: ['lepiota_brunneoincarnata'], si: { sombrero_mayor_10cm: ['no'] },
    texto: 'Parasol pequeño (menos de 10 cm): hay lepiotas pequeñas MORTALES, como Lepiota brunneoincarnata.' },
  { nivel: 'toxica', especies: ['omphalotus_olearius'], si: { himenio_cantarelo: ['laminas'], en_matas_madera: ['si'] },
    texto: 'Láminas finas y en matas sobre madera: rasgos de Omphalotus olearius, TÓXICA.' },
  { nivel: 'mortal', especies: ['amanita_phalloides', 'amanita_verna'], si: { interior_gleba: ['silueta_seta'] },
    texto: 'Dentro se ve el dibujo de una seta: es un huevo de amanita, y puede ser Amanita phalloides o Amanita verna, MORTALES.' },
  { nivel: 'toxica', especies: ['scleroderma_citrinum'], si: { interior_gleba: ['negro_violaceo'] },
    texto: 'Interior negro violáceo o pardo púrpura: rasgo de Scleroderma, TÓXICA.' },
  { nivel: 'toxica', especies: ['scleroderma_citrinum'], si: { piel_dura_escamosa: ['si'], cordones_base: ['si'] },
    texto: 'Piel dura y escamosa y unida al suelo por cordones: rasgos de Scleroderma, TÓXICA.' },
];

// ---------------------------------------------------------------- evaluación

export interface FichaMin { id: string; nombre_cientifico: string; grupo: string; no_confundir_con: { id: string }[] }
export interface CandidatoMin { nombre: string; idGuia?: string }
export type Respuestas = Record<string, string | undefined>;

export interface Peligrosa {
  id: string;
  nivel: Nivel;
  descartada: boolean;
  motivo?: string;          // por qué se descarta (si descartada)
  alerta: boolean;          // una respuesta la hace probable
  origen: string[];         // por qué está en la lista: grupo o «se confunde con X»
}
export interface Alerta { nivel: Nivel; texto: string; especies: string[] }
export interface Evaluacion {
  grupos: GrupoMorfo[];
  preguntas: Pregunta[];
  peligrosas: Peligrosa[];      // no descartadas primero (mortales antes que tóxicas), después las descartadas
  alertas: Alerta[];
  aviso: string;
}

const cumple = (si: Condicion, r: Respuestas) =>
  Object.entries(si).every(([q, vals]) => { const v = r[q]; return v != null && v !== NO_SE && vals.includes(v); });

const nivelDe = (f?: FichaMin): Nivel | null => (f?.grupo === 'mortal' ? 'mortal' : f?.grupo === 'toxica' ? 'toxica' : null);

export function evaluar(candidatos: CandidatoMin[], fichas: FichaMin[], respuestas: Respuestas, noReconocido = false): Evaluacion {
  const porId = new Map(fichas.map((f) => [f.id, f]));
  const grupos = new Set<GrupoMorfo>();
  const origen = new Map<string, Set<string>>();
  const anadir = (id: string, por: string) => {
    if (!nivelDe(porId.get(id))) return;            // solo mortales y tóxicas de la guía
    if (!origen.has(id)) origen.set(id, new Set());
    origen.get(id)!.add(por);
  };

  for (const c of candidatos) {
    const f = c.idGuia ? porId.get(c.idGuia) : undefined;
    for (const g of gruposDe(f?.nombre_cientifico ?? c.nombre)) grupos.add(g);
    if (f) {
      anadir(f.id, 'es uno de los candidatos');
      for (const nc of f.no_confundir_con) anadir(nc.id, `se confunde con ${binomioCorto(f.nombre_cientifico)}`);
    }
  }
  for (const g of grupos) for (const id of PELIGROSAS_GRUPO[g]) anadir(id, `grupo: ${NOMBRE_GRUPO[g]}`);
  // Las mortales salen SIEMPRE: el modelo puede no ver una phalloides (pasó en el spike) y proponer solo
  // géneros «otros». Solo las respuestas guiadas las descartan.
  const porque = noReconocido || !candidatos.length ? 'no se ha reconocido la seta' : 'mortal: el reconocedor puede fallar';
  for (const f of fichas) if (f.grupo === 'mortal') anadir(f.id, porque);

  const alertas: Alerta[] = ALERTAS.filter((a) => cumple(a.si, respuestas) && a.especies.some((e) => origen.has(e)))
    .map((a) => ({ nivel: a.nivel, texto: a.texto, especies: a.especies.filter((e) => origen.has(e)) }));
  const enAlerta = new Set(alertas.flatMap((a) => a.especies));

  const peligrosas: Peligrosa[] = [...origen].map(([id, por]) => {
    const alerta = enAlerta.has(id);
    const regla = alerta ? undefined : DESCARTES.find((r) => r.especie === id && cumple(r.si, respuestas));
    return { id, nivel: nivelDe(porId.get(id))!, descartada: !!regla, motivo: regla?.motivo, alerta, origen: [...por] };
  });
  const rango = (p: Peligrosa) => (p.descartada ? 2 : 0) + (p.nivel === 'mortal' ? 0 : 1);
  peligrosas.sort((a, b) => rango(a) - rango(b) || Number(b.alerta) - Number(a.alerta) || a.id.localeCompare(b.id));

  // Preguntas: las que pueden descartar alguna peligrosa de la lista y las que disparan alertas de sus especies.
  const ids = new Set<string>();
  for (const r of DESCARTES) if (origen.has(r.especie)) Object.keys(r.si).forEach((q) => ids.add(q));
  for (const a of ALERTAS) if (a.especies.some((e) => origen.has(e))) Object.keys(a.si).forEach((q) => ids.add(q));
  const preguntas = PREGUNTAS.filter((p) => ids.has(p.id));

  return { grupos: [...grupos].sort(), preguntas, peligrosas, alertas, aviso: AVISO_EXPERTO };
}

function binomioCorto(n: string) { return n.split(/\s+/).slice(0, 2).join(' '); }

/** Respuestas para el Worker (claves snake_case, valores en texto legible; «no sé» → null). */
export function respuestasParaWorker(preguntas: Pregunta[], r: Respuestas): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const p of preguntas) {
    const v = r[p.id];
    out[p.id] = !v || v === NO_SE ? null : (p.opciones.find((o) => o.v === v)?.t ?? null);
  }
  return out;
}

const PROHIBIDO = /\b(comestibles?|se puede[n]? comer|apta?s? para (el )?consumo|buen comestible|excelente comestible)\b/gi;
/** Defensa en profundidad para textos que vienen de fuera (Gemini): nunca mostrar «comestible». */
export function sinComestible(t: string): string {
  return t.replace(PROHIBIDO, '[consulta a un experto]');
}
