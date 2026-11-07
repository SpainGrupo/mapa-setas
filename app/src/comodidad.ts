// Comodidad del terreno (2026-11-07): «terreno cómodo», «algo de sube y baja» o «quebrado». Puro, sin DOM
// (comodidad.test.ts). Alexander no quiere zonas de «monte para arriba, monte para abajo sin parar»: pesa en la
// puntuación del día (ranking.ts) y se dice en Hoy, en la tarjeta de cada sitio y en el aviso diario (razones.ts).
//
// Los números salen del pipeline (pipeline/setas_pipeline/terreno.py, campo opcional `terreno` de sitios.json v5): en
// los 300 m alrededor del punto, con el MDT25, recorriendo el círculo en línea recta N–S, E–O y en diagonal;
// desnivel_km = (subida + bajada) por km con histéresis de 4 m (la del track del GPS, grabacion.ts).
// Umbrales RELATIVOS A LA REGIÓN (decisión de Alexander, 2026-11-07): con 40/80 m/km fijos el 95 % de los sitios salía
// «quebrado». El pipeline guarda en sitios.json el metadato `terreno_umbrales` {comodo: p33, quebrado: p67, metodo:
// "terciles"} (redondeados a 5 m/km; cada sitio una vez, aunque salga en varias especies): < p33 cómodo (el tercio más
// llano de los sitios de la región) · p33–p67 algo de sube y baja · > p67 quebrado (el tercio más movido). Sin metadato
// (datos viejos) valen los de antes, 40/80. TODO: calibrar con salidas reales (grabacion.ts) si Alexander lo pide; los
// m/km del pipeline son aproximados (MDT25) y no son comparables, tal cual, con los del GPS.
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
  /** Umbrales de la región (terciles) con los que se etiqueta; los pone parsearSitios. Sin ellos, 40/80. */
  umbrales?: UmbralesTerreno;
}

/** Terciles del desnivel por km de los sitios de la región (sitios.json `terreno_umbrales`). */
export interface UmbralesTerreno { comodo: number; quebrado: number }

export type ClaseTerreno = 'comodo' | 'medio' | 'quebrado';
/** Respaldo sin metadato de región (los umbrales absolutos de antes). */
export const UMBRALES_RESPALDO: UmbralesTerreno = { comodo: 40, quebrado: 80 };
export const FACTOR_TERRENO: Record<ClaseTerreno, number> = { comodo: 1, medio: 0.85, quebrado: 0.65 };
export const NOMBRE_TERRENO: Record<ClaseTerreno, string> = { comodo: 'Terreno cómodo', medio: 'Algo de sube y baja', quebrado: 'Terreno quebrado' };
const PARA_LA_ZONA = ' para la zona';

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const fmt = (n: number) => Math.round(n).toLocaleString('es-ES');

/** Clase de un desnivel por km con los umbrales de la región (por defecto, el respaldo 40/80): < comodo, comodo–quebrado, > quebrado. */
export const claseTerreno = (desnivelKm: number, u: UmbralesTerreno = UMBRALES_RESPALDO): ClaseTerreno =>
  desnivelKm < u.comodo ? 'comodo' : desnivelKm <= u.quebrado ? 'medio' : 'quebrado';

/** Clase de un terreno con los umbrales de su región. */
export const claseDeTerreno = (t: Terreno): ClaseTerreno => claseTerreno(t.desnivel_km, t.umbrales);

/** Factor de comodidad de la puntuación del día (1 sin dato). */
export const factorTerreno = (t: Terreno | null | undefined) => (t && num(t.desnivel_km) ? FACTOR_TERRENO[claseDeTerreno(t)] : 1);

/** Etiqueta corta («Terreno cómodo para la zona · 150 m/km»), o '' sin dato. Relativa a la región. */
export const textoCortoTerreno = (t: Terreno | null | undefined) =>
  (t && num(t.desnivel_km) ? `${NOMBRE_TERRENO[claseDeTerreno(t)]}${PARA_LA_ZONA} · ${fmt(t.desnivel_km)} m/km` : '');

/** Explicación de la etiqueta (ayuda al mantener pulsado): qué mide y entre qué tercio cae, con los umbrales de la región. */
export function ayudaTerreno(t?: Terreno | null): string {
  const u = t?.umbrales;
  const base = 'Cuánto sube y baja el terreno en los 300 m alrededor del punto, cruzándolos en línea recta (MDT de 25 m del IGN). ';
  const fin = ' Aproximado: las cuestas cortas se suavizan.';
  if (!u) return `${base}Umbrales fijos (sin datos de la región): menos de ${UMBRALES_RESPALDO.comodo} m de desnivel por km, cómodo; hasta ${UMBRALES_RESPALDO.quebrado}, algo de sube y baja; más, quebrado.${fin}`;
  return `${base}Es relativo a la región. Cómodo: entre el tercio más llano de sus sitios (menos de ${fmt(u.comodo)} m/km). `
    + `Algo de sube y baja: el tercio del medio (hasta ${fmt(u.quebrado)}). Quebrado: el tercio más movido (más).${fin}`;
}

/** Frase para la razón del sitio y el aviso diario, o '' sin dato. */
export function textoTerreno(t: Terreno | null | undefined): string {
  if (!t || !num(t.desnivel_km)) return '';
  const c = claseDeTerreno(t);
  const pm = num(t.pendiente_media) ? ` (pendiente media ${fmt(t.pendiente_media)} %)` : '';
  let f = c === 'comodo' ? `Terreno cómodo${PARA_LA_ZONA} · ${fmt(t.desnivel_km)} m de desnivel por km.`
    : c === 'medio' ? `Algo de sube y baja${PARA_LA_ZONA} · ${fmt(t.desnivel_km)} m de desnivel por km${pm}, lo que baja algo la puntuación.`
      : `Terreno quebrado${PARA_LA_ZONA} · ${fmt(t.desnivel_km)} m/km: mucho sube y baja${pm}, lo que baja la puntuación.`;
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

/** Valida el metadato `terreno_umbrales` de sitios.json (null si falta o es raro: entonces valen los de respaldo). */
export function parsearUmbrales(x: unknown): UmbralesTerreno | null {
  const o = x as Record<string, unknown> | null | undefined;
  if (!o || typeof o !== 'object' || !num(o.comodo) || !num(o.quebrado) || o.comodo < 0 || o.quebrado < o.comodo) return null;
  return { comodo: o.comodo, quebrado: o.quebrado };
}
