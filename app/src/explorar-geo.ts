// «Explorar aquí» (2026-10-25), geometría pura: dónde pintar sobre la cámara una celda del modelo según hacia dónde
// mira el teléfono, qué celdas llevan marca, rumbos del barrido de 8 fotos y cuándo disparar. Sin DOM (explorar-geo.test.ts);
// explorar-ui.ts pinta y escucha los sensores.
//  - AR ligera, no anclada: no hay seguimiento visual (Safari de iPhone no tiene WebXR). Las marcas se colocan solo con
//    la brújula y la inclinación, así que se mueven con el error de la brújula (±10–20° en monte). Sirven para «hacia allí».
//  - El campo de visión de la cámara trasera NO está medido: FOV_H/FOV_V son valores provisionales a medir en el iPhone
//    (fase 0, stages/02_pwa/explorar-fase0-iphone.md). La UI no los presenta como medidos.
import { normalizar } from './brujula';

export const DIST_MIN_MARCA_M = 50;
export const DENTRO_M = 80;
export const PASO_BARRIDO = 45;
export const TOLERANCIA_RUMBO = 10;
export const BETA_MIN = 70, BETA_MAX = 110;
export const PRECISION_BRUJULA_MAX = 25;
/** Campo de visión horizontal (°) en vertical y apaisado. PENDIENTE medir en iPhone (fase 0). */
export const FOV_H = { vertical: 52, apaisado: 68 };
export const FOV_V = { vertical: 68, apaisado: 52 };

/** Lecturas de brújula que hacen falta para decir que el teléfono está quieto, y desviación máxima (°). */
const LECTURAS_QUIETO = 5;
const DESVIACION_QUIETO = 3;
const rad = Math.PI / 180;

export interface Marca { x: number; y: number; visible: boolean; lado: 'izq' | 'der' | null; dist_m: number; desnivel: number | null }

/** a − b llevado a (−180, 180]. */
export const deltaAngulo = (a: number, b: number): number => {
  const d = normalizar(a - b);
  return d > 180 ? d - 360 : d;
};

/**
 * Posición en pantalla de una celda. Δ = rumbo de la celda − rumbo del teléfono; visible si |Δ| < fovH/2;
 * x = w/2 + tan(Δ)/tan(fovH/2)·w/2 (fuera del encuadre: pegada al borde con su lado). Elevación e = atan2(desnivel, dist)
 * (desnivel null → 0), pitch = beta − 90; y = h/2 − tan(e − pitch)/tan(fovV/2)·h/2, recortada a [0, h].
 */
export function proyectar(c: { rumbo: number; dist_m: number; desnivel: number | null }, rumboTel: number, beta: number,
  fov: { h: number; v: number }, pantalla: { w: number; h: number }): Marca {
  const d = deltaAngulo(c.rumbo, rumboTel);
  const visible = Math.abs(d) < fov.h / 2;
  const lado: Marca['lado'] = visible ? null : d < 0 ? 'izq' : 'der';
  const x = visible ? pantalla.w / 2 + (Math.tan(d * rad) / Math.tan((fov.h / 2) * rad)) * (pantalla.w / 2) : lado === 'izq' ? 0 : pantalla.w;
  const e = c.desnivel === null ? 0 : Math.atan2(c.desnivel, c.dist_m) / rad;
  const pitch = beta - 90;
  const yBruta = pantalla.h / 2 - (Math.tan((e - pitch) * rad) / Math.tan((fov.v / 2) * rad)) * (pantalla.h / 2);
  const y = Math.min(pantalla.h, Math.max(0, yBruta));
  return { x, y, visible, lado, dist_m: c.dist_m, desnivel: c.desnivel };
}

/** Media circular (vectores unitarios) en grados [0, 360); null con la lista vacía o resultante ~0 (p. ej. 0° y 180°). */
export function mediaCircular(angulos: number[]): number | null {
  if (!angulos.length) return null;
  let s = 0, c = 0;
  for (const a of angulos) { s += Math.sin(a * rad); c += Math.cos(a * rad); }
  if (Math.hypot(s, c) / angulos.length < 1e-9) return null;
  return normalizar(Math.atan2(s, c) / rad);
}

/** Celdas con marca (dist ≥ DIST_MIN_MARCA_M); `dentro` = alguna celda a menos de DENTRO_M («Estás en una zona buena»). */
export function celdasMarca<T extends { dist_m: number }>(cs: T[]): { marcas: T[]; dentro: boolean } {
  return { marcas: cs.filter((c) => c.dist_m >= DIST_MIN_MARCA_M), dentro: cs.some((c) => c.dist_m < DENTRO_M) };
}

/** 8 rumbos del barrido, en sentido horario, empezando por el múltiplo de 45° más cercano a `inicio`. */
export function rumbosBarrido(inicio: number): number[] {
  const i = Math.round(normalizar(inicio) / PASO_BARRIDO);
  return Array.from({ length: 360 / PASO_BARRIDO }, (_, k) => ((i + k) * PASO_BARRIDO) % 360);
}

/** Listo para disparar: rumbo a ±TOLERANCIA_RUMBO del objetivo, teléfono casi vertical y quieto. */
export function listoParaDisparar(objetivo: number, actual: number | null, beta: number | null, quieto: boolean): boolean {
  if (actual === null || beta === null || !quieto) return false;
  return Math.abs(deltaAngulo(objetivo, actual)) <= TOLERANCIA_RUMBO && beta >= BETA_MIN && beta <= BETA_MAX;
}

/** Quieto: desviación circular de las últimas lecturas (≥ 5) < 3°. */
export function estaQuieto(ultimas: number[]): boolean {
  if (ultimas.length < LECTURAS_QUIETO) return false;
  const m = mediaCircular(ultimas);
  if (m === null) return false;
  const v = ultimas.reduce((s, a) => s + deltaAngulo(a, m) ** 2, 0) / ultimas.length;
  return Math.sqrt(v) < DESVIACION_QUIETO;
}

/** Celdas del sector de 45° centrado en `rumbo` (|Δ| ≤ 22,5°). */
export function enSector<T extends { rumbo: number }>(cs: T[], rumbo: number): T[] {
  return cs.filter((c) => Math.abs(deltaAngulo(c.rumbo, rumbo)) <= PASO_BARRIDO / 2);
}
