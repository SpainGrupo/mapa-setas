// Indicador de los tops «≈N× la media · top X % hoy». Puro, sin DOM (indicador.test.ts).
//   N = lift validado por bloques del tramo de puntuación del sitio (pipeline calibracion.lift_tramos, clave `validacion`
//       de sitios.json): hallazgos observados / esperados al azar en zonas que no se usaron para hacer el mapa.
//       Solo si la especie está calibrada (exportar.calibrado) y el tramo tiene ≥ MIN_OBS_TRAMO hallazgos; si no, null
//       («sin validar»). No es una probabilidad: solo hay datos de presencia, no de búsquedas sin éxito.
//   X = puesto del sitio entre TODOS los sitios de la especie en la región ese día (puntuación de ranking.ts sin los
//       filtros del usuario ni la fusión a 300 m), en %: ceil(100 × (mejores + 1) / total).
import { conFactor, puntuar, type Opciones, type SitiosJson } from './ranking';

/** Mínimo de hallazgos en un tramo para enseñar su lift (coincide con calibracion.MIN_OBS_TRAMO del pipeline). */
export const MIN_OBS_TRAMO = 3;

export interface TramoValidacion { desde: number; hasta: number; lift: number | null; obs: number }
export interface ValidacionEspecie { calibrado: boolean; n: number | null; tramos: TramoValidacion[] }
export type Validacion = Record<string, ValidacionEspecie>;

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Valida la clave `validacion` de sitios.json (sin ella o rara, undefined: todo «sin validar»). */
export function parsearValidacion(j: unknown): Validacion | undefined {
  if (!j || typeof j !== 'object') return undefined;
  const out: Validacion = {};
  for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
    const e = v as Partial<ValidacionEspecie> | null;
    if (!e || typeof e !== 'object') continue;
    const tramos = Array.isArray(e.tramos) ? e.tramos.filter((t): t is TramoValidacion => !!t && num(t.desde) && num(t.hasta) && num(t.obs)
      && (t.lift === null || num(t.lift))) : [];
    out[k] = { calibrado: e.calibrado === true, n: num(e.n) ? e.n : null, tramos };
  }
  return out;
}

/** Lift del tramo de `puntMedia` para la especie, o null («sin validar»). */
export function veces(validacion: Validacion | undefined, especie: string, puntMedia: number): number | null {
  const v = validacion?.[especie];
  if (!v || v.calibrado !== true || !num(puntMedia)) return null;
  const t = v.tramos.find((x) => puntMedia >= x.desde && puntMedia < x.hasta);
  return t && t.obs >= MIN_OBS_TRAMO && num(t.lift) ? t.lift : null;
}

/** «Top X %»: X = ceil(100 × (nº con score estrictamente mayor + 1) / total), entre 1 y 100. */
export function percentilTop(scoreSitio: number, scoresTodos: readonly number[]): number {
  const total = scoresTodos.length;
  if (!total) return 100;
  const mejores = scoresTodos.reduce((n, s) => n + (s > scoreSitio ? 1 : 0), 0);
  return Math.min(100, Math.max(1, Math.ceil((100 * (mejores + 1)) / total)));
}

/** Puntuaciones del día de todos los sitios de la especie (la de ranking.puntuar, sin dificultad ni montes públicos). */
export function scoresDia(datos: SitiosJson, especie: string, op: Opciones): number[] {
  const o: Opciones = { ...conFactor(datos, op), maxDificultad: null, soloPublicos: false };
  return (datos.especies[especie] ?? []).map((s) => puntuar(especie, s, o)?.score).filter(num);
}

/** Percentil por especie con caché (una lista de scores por especie para estas opciones, es decir, este día). */
export function crearPercentil(datos: SitiosJson, op: Opciones): (especie: string, score: number) => number {
  const cache = new Map<string, number[]>();
  return (especie, score) => {
    let l = cache.get(especie);
    if (!l) { l = scoresDia(datos, especie, op); cache.set(especie, l); }
    return percentilTop(score, l);
  };
}

/** N con coma decimal: 1 decimal si < 10, entero si ≥ 10 (9,96 redondea a 10: entero). */
export const textoVeces = (n: number) => Math.round(n * 10) / 10 < 10
  ? n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  : Math.round(n).toLocaleString('es-ES');

// Espacio duro entre la cifra y «%» para que no se separen al partir la línea en el móvil.
const pct = (x: number) => `${x}\u00a0%`;

/** «≈3,7× la media · top 2 % hoy» o, sin lift, «sin validar · top 2 % hoy». */
export function textoIndicador(n: number | null, x: number): string {
  return `${n === null ? 'sin validar' : `≈${textoVeces(n)}× la media`} · top ${pct(x)} hoy`;
}

/** Nota de ayuda del indicador con las cifras del sitio (sin lift, sin la frase de «≈N×»). */
export function ayudaIndicador(n: number | null, x: number): string {
  const partes = ['No es un % de probabilidad. Solo sabemos dónde se han encontrado setas, no dónde se buscó y no había nada, así que no se puede calcular la probabilidad de encontrar una.'];
  if (n !== null) {
    const t = textoVeces(n);
    partes.push(`«≈${t}× la media» quiere decir que en zonas con una puntuación como la de este sitio aparecieron unas ${t} veces más hallazgos que si estuvieran repartidos al azar (comprobado en zonas que no se usaron para hacer el mapa).`);
  }
  partes.push(`«Top ${pct(x)} hoy» quiere decir que hoy este sitio está entre el ${pct(x)} mejor puntuado de la región para esta seta.`,
    '«Sin validar»: no hay hallazgos suficientes para comprobarlo.');
  return partes.join(' ');
}
