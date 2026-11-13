// Minutos en coche hasta un sitio (2026-11-13). Puro, sin DOM: se prueba en coche.test.ts. La parte con DOM (botón
// «Usar mi ubicación», las cifras de las tarjetas) está en coche-ui.ts.
//
// Origen: la ubicación del móvil, redondeada a una rejilla de ~500 m (CELDA_GRADOS): la cifra no cambia por moverse
// unos metros, la caché se aprovecha y al servicio de rutas solo viaja el centro de esa celda, no tu posición exacta.
// Destino: el aparcamiento del sitio si se conoce; si no, el propio punto.
// Cálculo: OSRM público (servicio table: una petición por lista, troceada si son muchas). Si falla (sin red, tiempo
// agotado, respuesta rara), estimación en línea recta × 1,4 a 50 km/h, siempre rotulada «estimado».
// Nada de esto dice nada sobre si una seta se puede comer: solo cuánto se tarda en llegar en coche.

export interface Punto { lat: number; lon: number }
export interface Minutos { min: number; estimado: boolean }

export const OSRM_BASE = 'https://router.project-osrm.org';
/** El servidor público de OSRM admite 100 coordenadas por petición: 1 de origen y 99 de destino. */
export const MAX_COORDENADAS = 100;
/** Rejilla del origen: 0,005° ≈ 550 m de latitud. */
export const CELDA_GRADOS = 0.005;
export const FACTOR_RECTA = 1.4;
export const VELOCIDAD_KMH = 50;
export const TIMEOUT_MS = 6000;

const R_TIERRA_KM = 6371;
const rad = (g: number) => (g * Math.PI) / 180;

/** Distancia en línea recta (km, haversine). */
export function distanciaRectaKm(a: Punto, b: Punto): number {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Estimación sin red: línea recta × 1,4 a 50 km/h, redondeada y de 1 min como mínimo. */
export function estimarMinutos(a: Punto, b: Punto): number {
  return Math.max(1, Math.round(((distanciaRectaKm(a, b) * FACTOR_RECTA) / VELOCIDAD_KMH) * 60));
}

/** Centro de la celda de ~500 m que contiene `p` (a 4 decimales, sin ruido de coma flotante). */
export function celdaOrigen(p: Punto): Punto {
  const f = (x: number) => +(Math.round(x / CELDA_GRADOS) * CELDA_GRADOS).toFixed(4);
  return { lat: f(p.lat), lon: f(p.lon) };
}
export const claveOrigen = (p: Punto): string => { const c = celdaOrigen(p); return `${c.lat.toFixed(4)},${c.lon.toFixed(4)}`; };
export const claveDestino = (p: Punto): string => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;

/** «🚗 25 min»; por encima de 60 min, «🚗 1 h 10 min»; estimado, «🚗 ≈ 25 min (estimado)». */
export function formatoMinutos(min: number, estimado = false): string {
  const m = Math.max(1, Math.round(min));
  const texto = m > 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
  return estimado ? `🚗 ≈ ${texto} (estimado)` : `🚗 ${texto}`;
}

/** Parte `xs` en trozos de como mucho `n` (n ≥ 1). */
export function trocear<T>(xs: readonly T[], n: number): T[][] {
  const t = Math.max(1, Math.floor(n)), out: T[][] = [];
  for (let i = 0; i < xs.length; i += t) out.push(xs.slice(i, i + t));
  return out;
}

const c5 = (x: number) => x.toFixed(5);
/** URL de la tabla de duraciones: el origen primero (índice 0) y los destinos detrás; solo la fila del origen. */
export function urlTabla(origen: Punto, destinos: readonly Punto[], base = OSRM_BASE): string {
  const coords = [origen, ...destinos].map((p) => `${c5(p.lon)},${c5(p.lat)}`).join(';');
  return `${base}/table/v1/driving/${coords}?sources=0&annotations=duration`;
}

/** Minutos de cada destino a partir de la respuesta de OSRM (null = sin ruta). Lanza si la respuesta no es la esperada. */
export function parsearTabla(json: unknown, n: number): (number | null)[] {
  const j = json as { code?: unknown; durations?: unknown } | null;
  if (!j || j.code !== 'Ok') throw new Error(`OSRM: código ${String(j?.code)}`);
  const fila = Array.isArray(j.durations) ? j.durations[0] : null;
  if (!Array.isArray(fila) || fila.length !== n + 1) throw new Error('OSRM: la tabla no trae una duración por destino');
  return fila.slice(1).map((s) => (typeof s === 'number' && Number.isFinite(s) && s >= 0 ? Math.max(1, Math.round(s / 60)) : null));
}

/** Caché de resultados reales de OSRM por celda de origen y destino (los estimados no se guardan: se reintentan). */
export class CacheMinutos {
  private m = new Map<string, number>();
  private k = (o: Punto, d: Punto) => `${claveOrigen(o)}|${claveDestino(d)}`;
  get(o: Punto, d: Punto): number | undefined { return this.m.get(this.k(o, d)); }
  set(o: Punto, d: Punto, min: number) { this.m.set(this.k(o, d), min); }
  get tamano() { return this.m.size; }
  vaciar() { this.m.clear(); }
}

export interface OpcionesMinutos {
  fetch?: typeof fetch;
  cache?: CacheMinutos;
  timeoutMs?: number;
  /** false = sin conexión: ni se intenta la red, todo estimado. */
  enLinea?: boolean;
  base?: string;
}

async function pedirTrozo(origen: Punto, destinos: Punto[], o: OpcionesMinutos): Promise<(number | null)[]> {
  const f = o.fetch ?? globalThis.fetch.bind(globalThis);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? TIMEOUT_MS);
  try {
    const r = await f(urlTabla(origen, destinos, o.base), { signal: ctl.signal });
    if (!r.ok) throw new Error(`OSRM: HTTP ${r.status}`);
    return parsearTabla(await r.json(), destinos.length);
  } finally { clearTimeout(timer); }
}

/**
 * Minutos en coche del origen a cada destino, en el mismo orden. Primero la caché; lo que falte, a OSRM en trozos de
 * como mucho 99 destinos distintos; si un trozo falla (o no hay ruta, o no hay conexión), sus destinos salen estimados.
 * El origen se usa redondeado a su celda de ~500 m.
 */
export async function minutosEnCoche(origen: Punto, destinos: readonly Punto[], o: OpcionesMinutos = {}): Promise<Minutos[]> {
  const centro = celdaOrigen(origen);
  const res: Minutos[] = new Array(destinos.length);
  const faltan = new Map<string, { p: Punto; idx: number[] }>();   // destino único → posiciones que lo piden
  destinos.forEach((d, i) => {
    const c = o.cache?.get(centro, d);
    if (c !== undefined) { res[i] = { min: c, estimado: false }; return; }
    const k = claveDestino(d), e = faltan.get(k);
    if (e) e.idx.push(i); else faltan.set(k, { p: d, idx: [i] });
  });
  const unicos = [...faltan.values()];
  for (const trozo of trocear(unicos, MAX_COORDENADAS - 1)) {
    let mins: (number | null)[] | null = null;
    if (o.enLinea !== false) {
      try { mins = await pedirTrozo(centro, trozo.map((t) => t.p), o); } catch { mins = null; }
    }
    trozo.forEach((t, j) => {
      const real = mins?.[j] ?? null;
      const r: Minutos = real !== null ? { min: real, estimado: false } : { min: estimarMinutos(centro, t.p), estimado: true };
      if (real !== null) o.cache?.set(centro, t.p, real);
      for (const i of t.idx) res[i] = r;
    });
  }
  return res;
}

// ---------------------------------------------------------------- última posición guardada

export interface PosicionGuardada extends Punto { t: number }
export const CLAVE_POSICION = 'setas:ultima-ubicacion';

export function serializarPosicion(p: PosicionGuardada): string { return JSON.stringify({ lat: p.lat, lon: p.lon, t: p.t }); }
/** La posición guardada, o null si el texto no es una posición válida. */
export function parsearPosicion(texto: string | null): PosicionGuardada | null {
  if (!texto) return null;
  try {
    const j = JSON.parse(texto) as Partial<PosicionGuardada>;
    const ok = typeof j.lat === 'number' && typeof j.lon === 'number' && typeof j.t === 'number'
      && Math.abs(j.lat) <= 90 && Math.abs(j.lon) <= 180 && Number.isFinite(j.t);
    return ok ? { lat: j.lat!, lon: j.lon!, t: j.t! } : null;
  } catch { return null; }
}
/** «hace 5 min», «hace 3 h», «hace 2 días». */
export function textoHace(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}
