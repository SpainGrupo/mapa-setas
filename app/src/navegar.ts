// Modo «Navegar aquí» (2026-10-18, «a lo Wikiloc»): estado de la navegación hacia un destino con el GPS y, si la app
// tiene el acceso a pie (acceso.bin → ruta.ts), siguiendo el sendero aparcamiento → sitio. Puro, sin DOM
// (navegar.test.ts); ir-sitio.ts pinta la vista.
//  - Llegada: a menos de LLEGADA_M (30 m) del destino en línea recta.
//  - Sendero: mientras no te hayas acercado a él (≤ FUERA_SENDERO_M) no se avisa de nada: vas en coche o vienes de
//    otro lado. Una vez en el sendero, salirte más de FUERA_SENDERO_M (50 m) da el aviso «fuera del sendero».
//  - Distancia restante: por el sendero si vas en él; si no, en línea recta.
//  - Desnivel restante: por el sendero, la subida que queda en su perfil (modelo del terreno, celdas de 100 m); si no,
//    altitud del sitio − altitud del GPS; sin datos, null (PENDIENTE).
import { distanciaM, rumbo } from './brujula';
import { seguir } from './ruta';

export const LLEGADA_M = 30;
export const FUERA_SENDERO_M = 50;

export interface Sendero {
  /** Del aparcamiento al sitio, [lon, lat]. */
  linea: [number, number][];
  /** Distancia acumulada (m) y altitud (m, NaN sin dato) por vértice de `linea`; opcional. */
  dist?: number[];
  alt?: number[];
}

export interface EstadoNav {
  directa_m: number;
  restante_m: number;
  rumbo: number;
  llegado: boolean;
  /** ¿Has estado ya en el sendero? (se mantiene entre lecturas). */
  unido: boolean;
  /** Fuera del sendero tras haber estado en él (null sin sendero). */
  fuera: boolean | null;
  /** Distancia al sendero (m), null sin sendero. */
  aSendero_m: number | null;
  /** Por dónde se mide lo que queda. */
  medida: 'sendero' | 'recta';
  /** Subida que queda por el sendero (m), null si no se puede calcular. */
  subidaSendero_m: number | null;
}

/** Subida acumulada del perfil desde `recorrido_m` hasta el final (interpolando la altitud del punto de partida). */
export function subidaRestante(dist: number[], alt: number[], recorrido_m: number): number | null {
  if (dist.length !== alt.length || dist.length < 2) return null;
  const pts: number[] = [];
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] < recorrido_m) {
      const j = i + 1;
      if (j < dist.length && dist[j] > recorrido_m && Number.isFinite(alt[i]) && Number.isFinite(alt[j])) {
        const t = (recorrido_m - dist[i]) / (dist[j] - dist[i]);
        pts.push(alt[i] + t * (alt[j] - alt[i]));
      }
      continue;
    }
    if (Number.isFinite(alt[i])) pts.push(alt[i]);
  }
  if (pts.length < 2) return pts.length === 1 ? 0 : null;
  let s = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i] > pts[i - 1]) s += pts[i] - pts[i - 1];
  return Math.round(s);
}

/** Estado de la navegación con la posición `pos`; `unidoAntes` = si ya habías estado en el sendero. */
export function estadoNavegacion(pos: { lat: number; lon: number }, destino: { lat: number; lon: number },
  sendero: Sendero | null, unidoAntes = false): EstadoNav {
  const directa = distanciaM(pos, destino);
  const base = { directa_m: directa, rumbo: rumbo(pos, destino), llegado: directa < LLEGADA_M };
  if (!sendero || sendero.linea.length < 2) {
    return { ...base, restante_m: directa, unido: false, fuera: null, aSendero_m: null, medida: 'recta', subidaSendero_m: null };
  }
  const s = seguir(sendero.linea, pos);
  const cerca = s.aRuta_m <= FUERA_SENDERO_M;
  const unido = unidoAntes || cerca;
  const fuera = unido && !cerca && !base.llegado;
  const enSendero = unido && cerca;
  const sub = enSendero && sendero.dist && sendero.alt ? subidaRestante(sendero.dist, sendero.alt, s.recorrido_m) : null;
  return { ...base, restante_m: enSendero ? s.restante_m : directa,
    unido, fuera, aSendero_m: s.aRuta_m, medida: enSendero ? 'sendero' : 'recta', subidaSendero_m: sub };
}

/** Cambios que merecen aviso entre dos estados: llegar al destino o salirse del sendero. */
export function avisosNavegacion(antes: EstadoNav | null, ahora: EstadoNav): ('llegada' | 'fuera' | 'vuelta')[] {
  const a: ('llegada' | 'fuera' | 'vuelta')[] = [];
  if (ahora.llegado && !antes?.llegado) a.push('llegada');
  if (ahora.fuera && !antes?.fuera) a.push('fuera');
  if (antes?.fuera && ahora.fuera === false && !ahora.llegado) a.push('vuelta');
  return a;
}
