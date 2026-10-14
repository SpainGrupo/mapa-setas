// Ruta a pie del coche al punto (fase 9): distancia, perfil de altura, dificultad y seguimiento con GPS.
// Puro, sin DOM: se prueba en ruta.test.ts. La traza sale de acceso.trazar() (del punto al coche); aquí se le da la
// vuelta para recorrerla del aparcamiento al punto.
import type { Celda } from './acceso';

export type Dificultad = 'facil' | 'moderada' | 'dificil' | 'muy_dificil';
export const ORDEN_DIFICULTAD: Dificultad[] = ['facil', 'moderada', 'dificil', 'muy_dificil'];
export const NOMBRE_DIFICULTAD: Record<Dificultad, string> = { facil: 'Fácil', moderada: 'Moderada', dificil: 'Difícil', muy_dificil: 'Muy difícil' };

/**
 * Dificultad (plan fase 9): fácil ≤30 min y ≤150 m; moderada ≤60 min y ≤350 m; difícil ≤120 min y ≤700 m;
 * muy difícil el resto. Manda el peor de los dos: 25 min con 200 m de subida es moderada.
 */
export function dificultad(tiempoMin: number, subidaM: number): Dificultad {
  if (tiempoMin <= 30 && subidaM <= 150) return 'facil';
  if (tiempoMin <= 60 && subidaM <= 350) return 'moderada';
  if (tiempoMin <= 120 && subidaM <= 700) return 'dificil';
  return 'muy_dificil';
}

/** ¿Cabe la dificultad `d` bajo el máximo elegido? (null = cualquiera). */
export const dentroDeDificultad = (d: Dificultad, max: Dificultad | null) => !max || ORDEN_DIFICULTAD.indexOf(d) <= ORDEN_DIFICULTAD.indexOf(max);

/** Longitud de un paso de la rejilla: `res` en recto y res·√2 en diagonal (100 m / 141 m). */
export const pasoM = (a: Celda, b: Celda, res: number) => (a.fila !== b.fila && a.col !== b.col ? res * Math.SQRT2 : res);

export interface Perfil {
  /** Distancia acumulada (m) desde el aparcamiento, una por celda. */
  dist: number[];
  /** Altitud (m) por celda; NaN sin dato. */
  alt: number[];
  total_m: number;
  /** Suma de subidas y bajadas del perfil (celdas a 100 m: sale algo menor que la del modelo a 50 m). */
  subida_m: number;
  bajada_m: number;
  min: number;
  max: number;
}

/** Perfil a lo largo de las celdas, ya en orden coche → punto, con sus altitudes. */
export function perfil(celdas: Celda[], alt: number[], res: number): Perfil {
  const dist = [0];
  for (let i = 1; i < celdas.length; i++) dist.push(dist[i - 1] + pasoM(celdas[i - 1], celdas[i], res));
  let subida = 0, bajada = 0, prev = NaN;
  for (const a of alt) {
    if (!Number.isFinite(a)) continue;
    if (Number.isFinite(prev)) { if (a > prev) subida += a - prev; else bajada += prev - a; }
    prev = a;
  }
  const v = alt.filter(Number.isFinite);
  return { dist, alt, total_m: dist[dist.length - 1] ?? 0, subida_m: Math.round(subida), bajada_m: Math.round(bajada),
    min: v.length ? Math.min(...v) : NaN, max: v.length ? Math.max(...v) : NaN };
}

/** «850 m» por debajo de 1 km; «1,2 km» por encima. */
export function textoDistancia(m: number): string {
  if (m < 995) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km`;
}

// ---------------------------------------------------------------- seguimiento con GPS

export const FUERA_DE_RUTA_M = 80;
const M_POR_GRADO = 111320;

export interface Seguimiento {
  /** Distancia (m) de la posición a la ruta. */
  aRuta_m: number;
  fuera: boolean;
  recorrido_m: number;
  restante_m: number;
  /** Punto de la ruta más cercano [lon, lat]. */
  cercano: [number, number];
}

/**
 * Proyecta la posición sobre la polilínea `linea` ([lon, lat], del coche al punto) en metros locales
 * (equirectangular: error despreciable en 2–3 km) y da lo que falta hasta el final siguiendo la ruta.
 */
export function seguir(linea: [number, number][], pos: { lat: number; lon: number }): Seguimiento {
  const k = Math.cos((pos.lat * Math.PI) / 180) * M_POR_GRADO;
  const xy = linea.map(([lon, lat]) => [(lon - pos.lon) * k, (lat - pos.lat) * M_POR_GRADO] as const);
  const tramos = xy.slice(1).map((b, i) => Math.hypot(b[0] - xy[i][0], b[1] - xy[i][1]));
  const total = tramos.reduce((a, b) => a + b, 0);
  if (linea.length === 1) return { aRuta_m: Math.hypot(...xy[0]), fuera: Math.hypot(...xy[0]) > FUERA_DE_RUTA_M, recorrido_m: 0, restante_m: 0, cercano: linea[0] };
  let mejor = { d: Infinity, rec: 0, p: linea[0] as [number, number] };
  let acum = 0;
  for (let i = 0; i < tramos.length; i++) {
    const [ax, ay] = xy[i], [bx, by] = xy[i + 1], L = tramos[i];
    // la posición está en (0, 0)
    const t = L > 0 ? Math.max(0, Math.min(1, (-ax * (bx - ax) - ay * (by - ay)) / (L * L))) : 0;
    const px = ax + t * (bx - ax), py = ay + t * (by - ay), d = Math.hypot(px, py);
    if (d < mejor.d) {
      const [lo0, la0] = linea[i], [lo1, la1] = linea[i + 1];
      mejor = { d, rec: acum + t * L, p: [lo0 + t * (lo1 - lo0), la0 + t * (la1 - la0)] };
    }
    acum += L;
  }
  return { aRuta_m: mejor.d, fuera: mejor.d > FUERA_DE_RUTA_M, recorrido_m: mejor.rec, restante_m: Math.max(0, total - mejor.rec), cercano: mejor.p };
}
