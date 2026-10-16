// Spec §2 (no negociable): nunca afirmar comestibilidad, listar siempre los parecidos peligrosos
// y forzar el aviso. Todo esto se aplica en el servidor aunque el prompt ya lo pida.
import { ErrorHttp } from "./http";

export const AVISO = "No consumas ninguna seta sin la confirmación de un experto.";

// Misma lista que guia/validar.py (PROHIBIDO). Si cambia allí, cambiarla aquí.
export const PROHIBIDO_GUIA = /se puede comer|apta para el consumo|comestible segur|sin peligro/i;
// Ampliación para texto libre de un modelo: cualquier afirmación directa de que algo se come.
export const PROHIBIDO_EXTRA =
  /\b(?:es|son|muy|buen[ao]?s?|excelente|exquisit[ao]s?|apreciad[ao]s?)\s+comestibles?\b|\bse\s+pueden\s+comer\b|\bpuedes\s+comer(?:la|lo|las|los)?\b|\bsegur[ao]s?\s+(?:para|de)\s+comer\b|\bapt[ao]s?\s+para\s+(?:comer|el\s+consumo)\b|\binofensiv[ao]s?\b/i;

export const SUSTITUTO = "[Afirmación sobre consumo eliminada. " + AVISO + "]";

export type Confianza = "baja" | "media" | "alta";

export interface Candidato {
  nombre_cientifico: string;
  nombre_comun?: string;
  confianza: Confianza;
  rasgos_observados: string[];
  rasgos_que_faltan_ver: string[];
}

export interface Peligrosa {
  nombre_cientifico: string;
  motivo: string;
}

export interface Resultado {
  candidatos: Candidato[];
  peligrosas_posibles: Peligrosa[];
  fotos_recomendadas: string[];
  aviso: string;
}

const MAX_ITEMS = 12;
const MAX_LARGO = 400;

const malFormada = (m: string) =>
  new ErrorHttp(502, "respuesta_invalida", `El modelo devolvió una respuesta con formato inesperado (${m}).`);

function esObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function cad(v: unknown, campo: string, obligatoria = true): string | undefined {
  if (v === undefined || v === null) {
    if (obligatoria) throw malFormada(`falta ${campo}`);
    return undefined;
  }
  if (typeof v !== "string") throw malFormada(`${campo} no es texto`);
  const t = v.trim().slice(0, MAX_LARGO);
  if (obligatoria && !t) throw malFormada(`${campo} vacío`);
  return t || undefined;
}

function listaCad(v: unknown, campo: string): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw malFormada(`${campo} no es lista`);
  return v
    .slice(0, MAX_ITEMS)
    .map((x, i) => cad(x, `${campo}[${i}]`, false))
    .filter((x): x is string => !!x);
}

/** Valida y normaliza la salida JSON de Gemini contra el esquema de la app. Lanza 502 si no encaja. */
export function validarSalida(bruto: unknown): Resultado {
  if (!esObj(bruto)) throw malFormada("no es un objeto");
  if (!Array.isArray(bruto.candidatos)) throw malFormada("candidatos no es lista");
  if (!Array.isArray(bruto.peligrosas_posibles)) throw malFormada("peligrosas_posibles no es lista");

  const candidatos = bruto.candidatos.slice(0, MAX_ITEMS).map((c, i): Candidato => {
    if (!esObj(c)) throw malFormada(`candidatos[${i}] no es objeto`);
    const confianza = c.confianza;
    if (confianza !== "baja" && confianza !== "media" && confianza !== "alta") {
      throw malFormada(`candidatos[${i}].confianza no válida`);
    }
    const out: Candidato = {
      nombre_cientifico: cad(c.nombre_cientifico, `candidatos[${i}].nombre_cientifico`)!,
      confianza,
      rasgos_observados: listaCad(c.rasgos_observados, `candidatos[${i}].rasgos_observados`),
      rasgos_que_faltan_ver: listaCad(c.rasgos_que_faltan_ver, `candidatos[${i}].rasgos_que_faltan_ver`),
    };
    const comun = cad(c.nombre_comun, `candidatos[${i}].nombre_comun`, false);
    if (comun) out.nombre_comun = comun;
    return out;
  });

  const peligrosas = bruto.peligrosas_posibles.slice(0, MAX_ITEMS).map((p, i): Peligrosa => {
    if (!esObj(p)) throw malFormada(`peligrosas_posibles[${i}] no es objeto`);
    return {
      nombre_cientifico: cad(p.nombre_cientifico, `peligrosas_posibles[${i}].nombre_cientifico`)!,
      motivo: cad(p.motivo, `peligrosas_posibles[${i}].motivo`)!,
    };
  });

  return {
    candidatos,
    peligrosas_posibles: peligrosas,
    fotos_recomendadas: listaCad(bruto.fotos_recomendadas, "fotos_recomendadas"),
    aviso: AVISO,
  };
}

/** Sustituye la frase entera que contenga una afirmación de comestibilidad. */
export function limpiarTexto(t: string): string {
  if (!PROHIBIDO_GUIA.test(t) && !PROHIBIDO_EXTRA.test(t)) return t;
  const frases = t.split(/(?<=[.;!?\n])\s*/);
  return frases
    .map((f) => (PROHIBIDO_GUIA.test(f) || PROHIBIDO_EXTRA.test(f) ? SUSTITUTO : f))
    .join(" ")
    .trim();
}

// Red de seguridad determinista: géneros candidatos -> peligrosas que el servidor añade siempre
// si el modelo no las ha listado (la foto nunca basta para descartarlas con certeza).
interface Regla {
  si: RegExp;
  añadir: Peligrosa[];
}

const REGLAS: Regla[] = [
  {
    si: /^amanita\b/i,
    añadir: [
      { nombre_cientifico: "Amanita phalloides", motivo: "Mortal. Cualquier Amanita (sobre todo en huevo o de color blanco/verdoso) puede confundirse con ella; exige ver volva, anillo y el interior del huevo cortado en vertical." },
      { nombre_cientifico: "Amanita verna", motivo: "Mortal. Amanita blanca con volva y anillo; indistinguible por foto de otras amanitas blancas o de huevos jóvenes." },
      { nombre_cientifico: "Amanita virosa", motivo: "Mortal. Amanita blanca; no se puede descartar por foto." },
    ],
  },
  {
    si: /^(lepiota|macrolepiota|chlorophyllum|leucoagaricus)\b/i,
    añadir: [
      { nombre_cientifico: "Lepiota brunneoincarnata", motivo: "Mortal. Las lepiotas pequeñas (sombrero < 10 cm) contienen amatoxinas y se confunden con parasoles jóvenes." },
    ],
  },
  {
    si: /^(cantharellus|craterellus|hygrophoropsis)\b/i,
    añadir: [
      { nombre_cientifico: "Omphalotus olearius", motivo: "Tóxica. Anaranjada, crece en grupos sobre madera o raíces; tiene láminas verdaderas, no pliegues." },
    ],
  },
  {
    si: /^(boletus|suillellus|neoboletus|rubroboletus|imperator|caloboletus|butyriboletus)\b/i,
    añadir: [
      { nombre_cientifico: "Rubroboletus satanas", motivo: "Tóxica. Boletos de poros rojos o que azulean al corte pueden ser tóxicos; hay que ver poros, pie y reacción al corte." },
    ],
  },
  // Alicante (fase D1, mismas confusiones que app/src/seguridad.ts y la guía).
  {
    si: /^tricholoma\b/i,
    añadir: [
      { nombre_cientifico: "Tricholoma equestre", motivo: "Mortal. Láminas y pie amarillos; comerla varias veces ha causado intoxicaciones musculares (rabdomiólisis) con muertes." },
      { nombre_cientifico: "Tricholoma pardinum", motivo: "Tóxica. Tricholoma grande con escamas oscuras y gruesas sobre fondo claro; intoxicación digestiva intensa." },
      { nombre_cientifico: "Tricholoma terreum", motivo: "Tóxica. La negrilla se trata como tóxica: un estudio la relaciona con daño muscular; se parece a otros Tricholoma grises." },
    ],
  },
  {
    si: /^(morchella|mitrophora|gyromitra|verpa|helvella|disciotis)\b/i,
    añadir: [
      { nombre_cientifico: "Gyromitra esculenta", motivo: "Mortal. La falsa colmenilla tiene el sombrero como un cerebro y cámaras por dentro; hay que cortarla de arriba abajo." },
    ],
  },
  {
    si: /^(clitocybe|infundibulicybe|marasmius|lepista|collybia|agaricus|pleurotus)\b/i,
    añadir: [
      { nombre_cientifico: "Clitocybe dealbata", motivo: "Mortal. Clitocybe blanca de prado, a veces en corros con la senderuela o el champiñón; hay que ver el color de las láminas y si tiene anillo." },
    ],
  },
];

function normaliza(n: string): string {
  return n.trim().toLowerCase().replace(/\s+/g, " ");
}

export function aplicarRedSeguridad(r: Resultado, respuestas: Record<string, unknown>): Resultado {
  const presentes = new Set(r.peligrosas_posibles.map((p) => normaliza(p.nombre_cientifico)));
  const extra: Peligrosa[] = [];
  const añade = (p: Peligrosa) => {
    const k = normaliza(p.nombre_cientifico);
    if (!presentes.has(k)) {
      presentes.add(k);
      extra.push(p);
    }
  };
  for (const c of r.candidatos) {
    for (const regla of REGLAS) if (regla.si.test(c.nombre_cientifico)) regla.añadir.forEach(añade);
  }
  // Si la persona marcó volva o un huevo, las amanitas mortales van siempre.
  const v = respuestas.volva;
  if (v === true || (typeof v === "string" && /^s[ií]/i.test(v)) || respuestas.interior_huevo != null) {
    REGLAS[0]!.añadir.forEach(añade);
  }
  return { ...r, peligrosas_posibles: [...r.peligrosas_posibles, ...extra] };
}

/** Pasa la limpieza a todos los textos y fuerza el aviso. */
export function postProcesar(r: Resultado, respuestas: Record<string, unknown>): Resultado {
  const conRed = aplicarRedSeguridad(r, respuestas);
  const l = limpiarTexto;
  return {
    candidatos: conRed.candidatos.map((c) => ({
      ...c,
      nombre_cientifico: l(c.nombre_cientifico),
      ...(c.nombre_comun ? { nombre_comun: l(c.nombre_comun) } : {}),
      rasgos_observados: c.rasgos_observados.map(l),
      rasgos_que_faltan_ver: c.rasgos_que_faltan_ver.map(l),
    })),
    peligrosas_posibles: conRed.peligrosas_posibles.map((p) => ({
      nombre_cientifico: l(p.nombre_cientifico),
      motivo: l(p.motivo),
    })),
    fotos_recomendadas: conRed.fotos_recomendadas.map(l),
    aviso: AVISO,
  };
}
