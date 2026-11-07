// Comodidad del terreno (2026-11-07): «terreno cómodo», «algo de sube y baja» o «quebrado». Puro, sin DOM
// (comodidad.test.ts). Alexander no quiere zonas de «monte para arriba, monte para abajo sin parar»: pesa en la
// puntuación del día (ranking.ts) y se dice en Hoy, en la tarjeta de cada sitio y en el aviso diario (razones.ts).
//
// Los números salen del pipeline (pipeline/setas_pipeline/terreno.py, campo opcional `terreno` de sitios.json v5): en
// los 300 m alrededor del punto, con el MDT25, recorriendo el círculo en línea recta N–S, E–O y en diagonal;
// desnivel_km = (subida + bajada) por km con histéresis de 4 m (la del track del GPS, grabacion.ts).
// Umbrales PROVISIONALES (docs/investigacion/2026-11-07-navegador-wikiloc-vs-campo.md §4 y decisión de Alexander del
// 2026-11-07), a calibrar con salidas reales: < 40 m/km cómodo · 40–80 algo de sube y baja · > 80 quebrado.
// Factor de la puntuación: ×1 · ×0,85 · ×0,65 (sin dato, ×1: datos viejos sin el campo no se castigan).

export interface Terreno {
  /** (Subida + bajada) por km en el entorno de búsqueda (m/km). */
  desnivel_km: number;
  /** Pendiente media de los recorridos (%). */
  pendiente_media?: number;
  /** Pendiente sostenida (50 m) que solo supera el 10 % de los tramos (%). */
  pendiente_max?: number;
  /** Tiempo de Tobler ÷ tiempo en llano (1 = llano). */
  esfuerzo?: number;
  /** (Subida + bajada) por km del camino a pie desde el aparcamiento (solo si mide ≥ 300 m). */
  acceso_desnivel_km?: number;
}

export type ClaseTerreno = 'comodo' | 'medio' | 'quebrado';
export const UMBRAL_COMODO_M_KM = 40;
export const UMBRAL_QUEBRADO_M_KM = 80;
export const FACTOR_TERRENO: Record<ClaseTerreno, number> = { comodo: 1, medio: 0.85, quebrado: 0.65 };
export const NOMBRE_TERRENO: Record<ClaseTerreno, string> = { comodo: 'Terreno cómodo', medio: 'Algo de sube y baja', quebrado: 'Terreno quebrado' };
export const AYUDA_TERRENO = 'Cuánto sube y baja el terreno en los 300 m alrededor del punto, cruzándolos en línea recta (MDT de 25 m del IGN). '
  + `Umbrales provisionales: menos de ${UMBRAL_COMODO_M_KM} m de desnivel por km, cómodo; hasta ${UMBRAL_QUEBRADO_M_KM}, algo de sube y baja; `
  + 'más, quebrado. Aproximado: las cuestas cortas se suavizan.';

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const fmt = (n: number) => Math.round(n).toLocaleString('es-ES');

export const claseTerreno = (desnivelKm: number): ClaseTerreno =>
  desnivelKm < UMBRAL_COMODO_M_KM ? 'comodo' : desnivelKm <= UMBRAL_QUEBRADO_M_KM ? 'medio' : 'quebrado';

/** Factor de comodidad de la puntuación del día (1 sin dato). */
export const factorTerreno = (t: Terreno | null | undefined) => (t && num(t.desnivel_km) ? FACTOR_TERRENO[claseTerreno(t.desnivel_km)] : 1);

/** Etiqueta corta («Terreno cómodo»), o '' sin dato. */
export const textoCortoTerreno = (t: Terreno | null | undefined) => (t && num(t.desnivel_km) ? NOMBRE_TERRENO[claseTerreno(t.desnivel_km)] : '');

/** Frase para la razón del sitio y el aviso diario, o '' sin dato. */
export function textoTerreno(t: Terreno | null | undefined): string {
  if (!t || !num(t.desnivel_km)) return '';
  const c = claseTerreno(t.desnivel_km);
  const pm = num(t.pendiente_media) ? ` (pendiente media ${fmt(t.pendiente_media)} %)` : '';
  let f = c === 'comodo' ? `Terreno cómodo · ${fmt(t.desnivel_km)} m de desnivel por km.`
    : c === 'medio' ? `Algo de sube y baja · ${fmt(t.desnivel_km)} m de desnivel por km${pm}, lo que baja algo la puntuación.`
      : `Terreno quebrado · ${fmt(t.desnivel_km)} m/km: mucho sube y baja${pm}, lo que baja la puntuación.`;
  if (num(t.acceso_desnivel_km)) f += ` El camino desde el coche: ${fmt(t.acceso_desnivel_km)} m/km.`;
  return f;
}

/** Valida el campo `terreno` de un sitio (null si falta o es raro; los opcionales raros se quitan). */
export function parsearTerreno(x: unknown): Terreno | null {
  const o = x as Record<string, unknown> | null | undefined;
  if (!o || typeof o !== 'object' || !num(o.desnivel_km) || o.desnivel_km < 0) return null;
  const t: Terreno = { desnivel_km: o.desnivel_km };
  for (const k of ['pendiente_media', 'pendiente_max', 'esfuerzo', 'acceso_desnivel_km'] as const) if (num(o[k])) t[k] = o[k] as number;
  return t;
}
