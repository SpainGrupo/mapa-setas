// Comparación por pares del reconocedor (sin DOM): la candidata frente a CADA peligrosa de la evaluación.
// Por cada par: tabla rasgo | candidata | peligrosa | tú, con las filas que deciden primero y numeradas (la «marca de
// campo»: el mismo número en la fila, en el dibujo y en la leyenda de las fotos), dibujos de anatomía por rasgo y el
// bloque «Riesgo de falso positivo» (por qué se parecen, qué las separa, cuánto fiarte, qué foto falta).
// Todo sale de la guía (guia/especies.json) y de las reglas de seguridad.ts: aquí no se inventa ningún rasgo.
import { normalizar, type Ficha } from './guia';
import { ALERTAS, DESCARTES, NO_SE, PREGUNTA, type Evaluacion, type Peligrosa, type Respuestas } from './seguridad';

type CampoFicha = 'fase_huevo' | 'himenio' | 'pie' | 'volva' | 'anillo' | 'carne_y_corte' | 'sombrero' | 'habitat';

interface DefRasgo { clave: CampoFicha; titulo: string; preguntas: string[] }
/** Orden de lectura cuando dos filas pesan lo mismo; las que deciden pasan siempre delante. */
export const RASGOS: DefRasgo[] = [
  { clave: 'fase_huevo', titulo: 'Huevo cortado', preguntas: ['interior_huevo'] },
  { clave: 'himenio', titulo: 'Láminas o poros', preguntas: ['laminas_pie_color', 'color_poros', 'himenio_cantarelo'] },
  { clave: 'pie', titulo: 'Pie', preguntas: ['laminas_pie_color', 'color_reticulo', 'pie_serpiente'] },
  { clave: 'volva', titulo: 'Volva (base)', preguntas: ['volva_saco'] },
  { clave: 'anillo', titulo: 'Anillo', preguntas: ['anillo_doble_movil'] },
  { clave: 'carne_y_corte', titulo: 'Carne y corte', preguntas: ['azulea_al_corte', 'carne_enrojece', 'color_latex', 'interior_gleba'] },
  { clave: 'sombrero', titulo: 'Sombrero', preguntas: ['sombrero_mayor_10cm', 'piel_dura_escamosa'] },
  { clave: 'habitat', titulo: 'Dónde crece', preguntas: ['en_matas_madera', 'cordones_base'] },
];

/** Qué foto aporta la respuesta a cada pregunta (instrucción de campo, no un rasgo de especie). */
export const FOTO_PREGUNTA: Record<string, string> = {
  interior_huevo: 'el huevo cortado de arriba abajo, por dentro, con luz de día',
  laminas_pie_color: 'las láminas desde abajo y el pie entero',
  volva_saco: 'la base entera, desenterrada y de lado',
  color_poros: 'los poros, desde abajo',
  azulea_al_corte: 'la carne cortada, un minuto después',
  color_reticulo: 'el pie de cerca, con su red',
  himenio_cantarelo: 'debajo del sombrero, de cerca',
  en_matas_madera: 'dónde crece, con la base y lo que hay debajo',
  sombrero_mayor_10cm: 'el sombrero junto a algo que dé la escala',
  anillo_doble_movil: 'el anillo, de cerca',
  pie_serpiente: 'el pie entero, de cerca',
  carne_enrojece: 'la carne del pie cortada',
  color_latex: 'una lámina cortada con la gota de látex',
  interior_gleba: 'el corte por la mitad',
  piel_dura_escamosa: 'la piel, de cerca',
  cordones_base: 'la base y el suelo donde estaba',
};

export interface Tu { texto: string; falta: boolean }
export interface Dibujos { candidata?: string; peligrosa?: string }
export interface FilaRasgo {
  marca: number;               // número de la marca de campo (1…n en el orden mostrado)
  clave: CampoFicha;
  titulo: string;
  candidata: string;
  peligrosa: string;
  decide: boolean;             // una respuesta a sus preguntas puede descartar o delatar a la peligrosa
  tu: Tu | null;               // null: no hay pregunta para este rasgo (mira tu foto)
  dibujos: Dibujos;
}
export type EstadoPar = 'alerta' | 'no_descartada' | 'descartada';
export interface FalsoPositivo { parecido: string[]; separa: string[]; fiarte: string; fotos: string[] }
export interface Par {
  peligrosa: Peligrosa;
  ficha: Ficha;
  estado: EstadoPar;
  citada: boolean;             // la guía la cita en «No confundir con…» de la candidata (o al revés)
  filas: FilaRasgo[];
  falsoPositivo: FalsoPositivo;
}

const n = (t: string) => normalizar(t);

/** Dibujo de anatomía que corresponde al texto de la guía para ese rasgo (o ninguno). */
export function dibujoDe(clave: CampoFicha, texto: string): string | undefined {
  const t = n(texto);
  if (!t || /^no tiene\b/.test(t)) return clave === 'anillo' ? 'anillo-ausente' : undefined;
  switch (clave) {
    case 'himenio':
      if (/no tiene laminas|aguijones|pinchos/.test(t)) return undefined;
      if (/pliegue/.test(t)) return 'himenio-pliegues';
      if (/poros|tubos/.test(t)) return 'himenio-poros';
      return /lamina/.test(t) ? 'himenio-laminas' : undefined;
    case 'pie':
      if (/sin (dibujo de )?piel de serpiente/.test(t)) return undefined;
      if (/serpiente/.test(t)) return 'pie-serpiente';
      if (/zigzag|jaspead/.test(t)) return 'pie-jaspeado';
      return /reticulo/.test(t) ? 'pie-reticulo' : undefined;
    case 'volva':
      if (/no tiene volva/.test(t)) return undefined;
      if (/verruga/.test(t)) return 'volva-verrugas';
      return /saco/.test(t) ? 'volva-saco' : undefined;
    case 'anillo':
      if (/doble|desliza|movil/.test(t)) return 'anillo-doble';
      if (/fugaz|rodete|desaparece/.test(t)) return 'anillo-ausente';
      return /colgante|falda|membranoso/.test(t) ? 'anillo-falda' : undefined;
    case 'carne_y_corte':
      return /(^|[^o] )azulea/.test(t) && !/no azulea/.test(t) ? 'carne-azulea' : undefined;
    case 'fase_huevo':
      if (/deja ver ya el sombrero naranja/.test(t)) return 'huevo-caesarea';
      return /blanc[oa] por dentro/.test(t) ? 'huevo-mortal' : undefined;
    default:
      return undefined;
  }
}

/** Preguntas cuya respuesta puede descartar a `id` (DESCARTES) o hacerla probable (ALERTAS). */
export function preguntasQueDeciden(id: string): Set<string> {
  const s = new Set<string>();
  for (const r of DESCARTES) if (r.especie === id) Object.keys(r.si).forEach((q) => s.add(q));
  for (const a of ALERTAS) if (a.especies.includes(id)) Object.keys(a.si).forEach((q) => s.add(q));
  return s;
}

function textoRespuesta(q: string, v: string): string {
  const p = PREGUNTA[q];
  return p?.opciones.find((o) => o.v === v)?.t ?? v;
}

function respuestaFila(qs: string[], deciden: Set<string>, r: Respuestas): Tu | null {
  if (!qs.length) return null;
  const dadas = qs.filter((q) => r[q] && r[q] !== NO_SE);
  if (dadas.length) {
    const texto = dadas.map((q) => textoRespuesta(q, r[q]!)).filter((t, i, a) => a.indexOf(t) === i).join(' · ');
    return { texto, falta: !dadas.some((q) => deciden.has(q)) && qs.some((q) => deciden.has(q)) };
  }
  const nose = qs.some((q) => r[q] === NO_SE);
  return { texto: nose ? 'No sé' : 'Sin responder', falta: qs.some((q) => deciden.has(q)) };
}

const binomioCorto = (f: Ficha) => f.nombre_cientifico.split(/\s+/).slice(0, 2).join(' ');

function textoOrigen(o: string): string {
  if (o === 'es uno de los candidatos') return 'El reconocedor también la ve parecida a tu foto.';
  const m = /^se confunde con (.+)$/.exec(o);
  if (m) return `La guía la cita como confusión de ${m[1]}.`;
  const g = /^grupo: (.+)$/.exec(o);
  if (g) return `Es del mismo grupo de formas: ${g[1]}.`;
  if (o === 'no se ha reconocido la seta') return 'No se ha reconocido la seta: las mortales siguen en la lista.';
  return 'Es mortal y el reconocedor puede fallar: sigue en la lista hasta que la descartes.';
}

/**
 * Pares de comparación de la candidata frente a cada peligrosa con ficha (menos ella misma). Orden: primero las no
 * descartadas (mortales antes que tóxicas, las que la guía cita como confusión antes que las del grupo), después las
 * descartadas, que siguen accesibles.
 */
export function construirPares(candidata: Ficha, ev: Evaluacion, fichas: Ficha[], r: Respuestas): Par[] {
  const porId = new Map(fichas.map((f) => [f.id, f]));
  const enEv = new Set(ev.preguntas.map((p) => p.id));
  const citadas = new Set(candidata.no_confundir_con.map((c) => c.id));
  const pares: Par[] = [];
  for (const p of ev.peligrosas) {
    const f = porId.get(p.id);
    if (!f || f.id === candidata.id) continue;
    const deciden = new Set([...preguntasQueDeciden(f.id)].filter((q) => enEv.has(q)));
    const filas: FilaRasgo[] = [];
    for (const d of RASGOS) {
      const a = String(candidata[d.clave] ?? '').trim(), b = String(f[d.clave] ?? '').trim();
      if (!a && !b) continue;
      const qs = d.preguntas.filter((q) => enEv.has(q));
      const decide = qs.some((q) => deciden.has(q));
      if (d.clave === 'habitat' && !decide) continue;      // el hábitat solo entra si decide (textos largos)
      if (d.clave === 'sombrero' && !a && !b) continue;
      const dc = dibujoDe(d.clave, a), dp = dibujoDe(d.clave, b);
      filas.push({ marca: 0, clave: d.clave, titulo: d.titulo, candidata: a || '—', peligrosa: b || '—', decide,
        tu: respuestaFila(qs, deciden, r), dibujos: { ...(dc ? { candidata: dc } : {}), ...(dp ? { peligrosa: dp } : {}) } });
    }
    filas.sort((x, y) => Number(y.decide) - Number(x.decide));
    filas.forEach((x, i) => (x.marca = i + 1));

    const estado: EstadoPar = p.alerta ? 'alerta' : p.descartada ? 'descartada' : 'no_descartada';
    const dif = candidata.no_confundir_con.find((c) => c.id === f.id)?.diferencias
      ?? f.no_confundir_con.find((c) => c.id === candidata.id)?.diferencias ?? f.rasgos_clave;
    const decisivas = filas.filter((x) => x.decide);
    const faltan = decisivas.filter((x) => x.tu?.falta);
    const fiarte = estado === 'descartada'
      ? `Tu respuesta la descarta (${p.motivo}). Vale solo si ese rasgo se ve claro en un ejemplar fresco y entero; confírmalo con un experto.`
      : estado === 'alerta' ? 'Tus respuestas apuntan a esta especie. No la toques más de lo necesario y lávate las manos.'
      : !decisivas.length ? 'La guía no tiene preguntas que la separen de tu seta: solo un experto puede descartarla.'
      : `Todavía nada la separa: faltan ${faltan.length} de ${decisivas.length} ${decisivas.length === 1 ? 'rasgo que decide' : 'rasgos que deciden'}.`;
    const fotos = [...new Set([...deciden].filter((q) => !r[q] || r[q] === NO_SE).map((q) => FOTO_PREGUNTA[q]).filter(Boolean))];
    pares.push({ peligrosa: p, ficha: f, estado, citada: citadas.has(f.id) || f.no_confundir_con.some((c) => c.id === candidata.id), filas,
      falsoPositivo: { parecido: p.origen.map(textoOrigen).filter((t, i, a) => a.indexOf(t) === i), separa: dif, fiarte, fotos } });
  }
  const rango = (x: Par) => (x.estado === 'descartada' ? 4 : 0) + (x.peligrosa.nivel === 'mortal' ? 0 : 2) + (x.citada ? 0 : 1);
  return pares.map((x, i) => [x, i] as const).sort((a, b) => rango(a[0]) - rango(b[0]) || a[1] - b[1]).map(([x]) => x);
}

/** «Amanita phalloides (oronja verde)». */
export function nombreConComun(f: Ficha): string {
  const c = f.nombres_comunes[0];
  return c ? `${binomioCorto(f)} (${c})` : binomioCorto(f);
}
