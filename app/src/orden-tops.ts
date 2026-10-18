// Orden de los listados de sitios top (Hoy «Mejores sitios», «Los 10 mejores por seta», y el Top de la ficha de la guía).
// Puro, sin DOM (orden-tops.test.ts). Un único helper para todos los listados.
//   probabilidad = la puntuación del día del ranking (score), de mayor a menor (el orden por defecto)
//   distancia    = en línea recta desde tu GPS o, sin él, desde el origen de la región (no hay distancia por carretera
//                  en los datos: no se inventa). Sin origen, PENDIENTE y al final.
//   dificultad   = la de ruta.ts (tiempo a pie desde el aparcamiento + subida acumulada); a igual nivel, menos minutos
//                  y menos subida primero. Sin tiempo/subida válidos, PENDIENTE y al final.
import { distanciaM, type Entrada } from './ranking';
import { dificultad, ORDEN_DIFICULTAD, type Dificultad } from './ruta';

export type OrdenTop = 'probabilidad' | 'distancia' | 'dificultad';
export const ORDENES_TOP: OrdenTop[] = ['probabilidad', 'distancia', 'dificultad'];
export const NOMBRE_ORDEN: Record<OrdenTop, string> = { probabilidad: 'Probabilidad', distancia: 'Distancia', dificultad: 'Dificultad a pie' };
export const PENDIENTE = 'PENDIENTE';

export interface ClavesOrden {
  score: number;
  /** Metros en línea recta desde el origen; null = PENDIENTE. */
  distancia_m: number | null;
  /** null = PENDIENTE (sin tiempo a pie o subida). */
  dificultad: { nivel: Dificultad; minutos: number; subida_m: number } | null;
  /** Desempate final estable. */
  id: number;
}

export const esOrdenTop = (v: unknown): v is OrdenTop => typeof v === 'string' && (ORDENES_TOP as string[]).includes(v);

/** Claves de orden de una entrada del ranking. */
export function clavesEntrada(e: Entrada, origen: { lat: number; lon: number } | null): ClavesOrden {
  const s = e.sitio;
  const okDif = Number.isFinite(s.t_pie_min) && Number.isFinite(s.subida_m) && s.t_pie_min >= 0 && s.subida_m >= 0;
  return {
    score: e.score,
    distancia_m: origen && Number.isFinite(s.lat) && Number.isFinite(s.lon) ? distanciaM(origen, s) : null,
    dificultad: okDif ? { nivel: dificultad(s.t_pie_min, s.subida_m), minutos: s.t_pie_min, subida_m: s.subida_m } : null,
    id: s.id,
  };
}

const nulosAlFinal = <T>(a: T | null, b: T | null, cmp: (x: T, y: T) => number) =>
  a === null && b === null ? 0 : a === null ? 1 : b === null ? -1 : cmp(a, b);

function comparar(a: ClavesOrden, b: ClavesOrden, orden: OrdenTop): number {
  const porScore = b.score - a.score;
  let c = 0;
  if (orden === 'distancia') c = nulosAlFinal(a.distancia_m, b.distancia_m, (x, y) => x - y);
  else if (orden === 'dificultad') c = nulosAlFinal(a.dificultad, b.dificultad, (x, y) =>
    ORDEN_DIFICULTAD.indexOf(x.nivel) - ORDEN_DIFICULTAD.indexOf(y.nivel) || x.minutos - y.minutos || x.subida_m - y.subida_m);
  return c || porScore || a.id - b.id;
}

/** Copia ordenada de `xs` según `orden` (no toca el original). */
export function ordenarTops<T>(xs: readonly T[], orden: OrdenTop, claves: (x: T) => ClavesOrden): T[] {
  const k = new Map(xs.map((x) => [x, claves(x)] as const));
  return [...xs].sort((a, b) => comparar(k.get(a)!, k.get(b)!, orden));
}
