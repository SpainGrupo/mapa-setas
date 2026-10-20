// Hoy «Por sitio»: zonas donde se concentran varias setas el día elegido. Puro, sin DOM (zonas.test.ts).
//
// 1. Cada sitio candidato de cada especie se puntúa con el ranking del día (ranking.ts: puntuar, mismos filtros de
//    dificultad y montes públicos). Los sitios en rojo ese día no cuentan (como el top general): no son «posibles».
// 2. Agrupación voraz, de mayor a menor puntuación: una entrada entra en la primera zona cuyo punto ancla (la entrada
//    con la que se abrió, la mejor) esté a ≤ RADIO_ZONA_M (400 m); si no, abre zona. De cada especie se queda solo su
//    mejor sitio dentro de la zona (los demás sitios de esa especie a ≤ 400 m quedan absorbidos).
// 3. Puntuación de la zona = Σ score_i × ½^i (entradas de la zona de mayor a menor score, i = 0, 1, 2…) × factor_verde
//      · la mejor seta cuenta entera, la segunda la mitad, la tercera un cuarto…: concentrar setas suma, pero una zona
//        nunca vale más del doble de su mejor sitio (no gana una zona de diez setas flojas a una de una seta buena).
//      · factor_verde = 1 si alguna seta de la zona está en verde ese día, 0,5 si ninguna: las zonas con verdes van
//        delante (además del factor del semáforo que ya lleva cada score).
//    En 0–100 contra el mismo máximo teórico que un sitio (puntuacion100), topada en 100.
// 4. Se listan las MAX_ZONAS (15) mejores. Distancia, dificultad, titularidad y enlace son los del punto ancla.
import { distanciaM, puntuacion100, puntuar, type Entrada, type Opciones, type SitiosJson } from './ranking';

export const RADIO_ZONA_M = 400;
export const MAX_ZONAS = 15;
export const DECAIMIENTO = 0.5;
export const FACTOR_SIN_VERDE = 0.5;

export interface Zona {
  /** La mejor entrada de la zona: su punto es el de la zona (distancia, dificultad, titularidad, enlace). */
  principal: Entrada;
  /** Una entrada por especie, de mayor a menor score (la primera es la principal). */
  entradas: Entrada[];
  score: number;
  puntuacion: number;
  verdes: number;
  /** Distancia máxima (m) del ancla a los demás sitios de la zona. */
  extension_m: number;
}

/** Puntuación de una zona a partir de los scores de sus entradas (ya ordenadas de mayor a menor) y si hay verde. */
export function scoreZona(scores: readonly number[], hayVerde: boolean): number {
  const base = scores.reduce((t, s, i) => t + s * DECAIMIENTO ** i, 0);
  return base * (hayVerde ? 1 : FACTOR_SIN_VERDE);
}

const porScore = (a: Entrada, b: Entrada) => b.score - a.score || a.sitio.id - b.sitio.id || a.especie.localeCompare(b.especie);

/** Agrupa entradas ya puntuadas en zonas (paso 2–3), sin cortar. */
export function agruparZonas(entradas: readonly Entrada[], radio = RADIO_ZONA_M): Zona[] {
  const grupos: Entrada[][] = [];
  for (const e of [...entradas].sort(porScore)) {
    const g = grupos.find((x) => distanciaM(x[0].sitio, e.sitio) <= radio);
    if (!g) grupos.push([e]);
    else if (!g.some((x) => x.especie === e.especie)) g.push(e);
  }
  return grupos.map((g) => {
    const verdes = g.filter((e) => e.estado === 'verde').length;
    const score = scoreZona(g.map((e) => e.score), verdes > 0);
    return { principal: g[0], entradas: g, score, puntuacion: puntuacion100(score), verdes,
      extension_m: Math.max(0, ...g.map((e) => distanciaM(g[0].sitio, e.sitio))) };
  });
}

/**
 * Zonas del día con las especies dadas (todas las de la región o las de un grupo). Con `requerida`, solo las zonas
 * donde está esa especie. Ordenadas por puntuación de zona y cortadas a `max`.
 */
export function zonasDelDia(datos: SitiosJson, especies: readonly string[], op: Opciones,
  { radio = RADIO_ZONA_M, max = MAX_ZONAS, requerida }: { radio?: number; max?: number; requerida?: string } = {}): Zona[] {
  const o: Opciones = { ...op, factorCitas: op.factorCitas ?? datos.factor_citas === true };
  const todas: Entrada[] = [];
  for (const id of especies) for (const s of datos.especies[id] ?? []) {
    const e = puntuar(id, s, o);
    if (e && e.estado !== 'rojo') todas.push(e);
  }
  return agruparZonas(todas, radio)
    .filter((z) => !requerida || z.entradas.some((e) => e.especie === requerida))
    .sort((a, b) => b.score - a.score || a.principal.sitio.id - b.principal.sitio.id)
    .slice(0, max);
}
