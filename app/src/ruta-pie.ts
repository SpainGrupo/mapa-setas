// Ruta a pie por el terreno en el Modo campo (2026-10-20). Puro, sin DOM ni red (ruta-pie.test.ts).
// El 18/10/26, en campo, un sitio se descartó por la bajada y la subida que pedía: la micronavegación tiene que mirar
// cotas y laderas, no solo la línea recta.
//  - A* con 8 vecinos sobre una rejilla de cotas (mdt.ts: MDT25 a 25 m o, de respaldo, la altitud de 100 m).
//  - Coste por paso = tiempo de Tobler (6·e^(−3.5·|s + 0,05|) km/h, s = Δz / distancia con signo).
//    «Más directa»: Tobler puro. «Mínimo desnivel»: Tobler × penalización por pendiente fuerte + PESO_SUBIDA min por
//    metro subido + PESO_BAJADA min por metro bajado (prefiere rodear por la misma cota a bajar y volver a subir).
//    En los dos modos, un paso con pendiente > PEND_MAX_GRADOS es intransitable, igual que una celda sin cota.
//  - Heurística admisible y consistente: distancia en línea recta a la velocidad máxima de Tobler (6 km/h) y, en
//    «mínimo desnivel», además el desnivel neto que falta (hay que subirlo o bajarlo sí o sí) por su peso.
//  - Límite de nodos explorados (MAX_NODOS) para que en el móvil nunca se quede colgado; si se agota: 'limite'.
//  - Aproximado: la rejilla no ve caminos, vallas ni cortados más pequeños que la celda. La UI lo dice.
import { perfil, type Perfil } from './ruta';
import { aUtm30 } from './acceso';
import { celdaLatLon, centroLonLat, cota, cotaEn, type CeldaR, type Rejilla } from './mdt';

export type ModoRuta = 'minimo_desnivel' | 'directa';
export const NOMBRE_MODO: Record<ModoRuta, string> = { minimo_desnivel: 'Mínimo desnivel', directa: 'Más directa' };
/** Pendiente (°) a partir de la cual un paso es intransitable a pie fuera de camino. */
export const PEND_MAX_GRADOS = 30;
/** Pendiente (°) desde la que «mínimo desnivel» empieza a penalizar. */
export const PEND_SUAVE_GRADOS = 15;
/** Penalización máxima (× tiempo) justo antes de PEND_MAX_GRADOS. */
export const PENALIZACION_MAX = 3;
/** «Mínimo desnivel»: minutos de coste extra por metro subido / bajado. */
export const PESO_SUBIDA = 0.5;
export const PESO_BAJADA = 0.3;
export const VELOCIDAD_MAX_KMH = 6;
/** Nodos explorados como máximo (una ventana de 1,6 km a 25 m son ~4 100 celdas). */
export const MAX_NODOS = 60000;

const MIN_POR_M_MIN = 60 / (VELOCIDAD_MAX_KMH * 1000);
const RAD = Math.PI / 180;

/** Velocidad de Tobler (km/h) con pendiente s = Δz / distancia horizontal (con signo). */
export const toblerKmh = (s: number) => 6 * Math.exp(-3.5 * Math.abs(s + 0.05));

/** Minutos para recorrer `d` m en horizontal con `dz` m de desnivel. */
export const tiempoPasoMin = (d: number, dz: number) => (d / 1000 / toblerKmh(dz / d)) * 60;

/** Coste de un paso (minutos equivalentes); Infinity si la pendiente lo hace intransitable. */
export function costePaso(d: number, dz: number, modo: ModoRuta): number {
  if (!Number.isFinite(dz)) return Infinity;
  const ang = Math.atan(Math.abs(dz) / d) / RAD;
  if (ang > PEND_MAX_GRADOS) return Infinity;
  const t = tiempoPasoMin(d, dz);
  if (modo === 'directa') return t;
  const x = Math.max(0, (ang - PEND_SUAVE_GRADOS) / (PEND_MAX_GRADOS - PEND_SUAVE_GRADOS));
  return t * (1 + (PENALIZACION_MAX - 1) * x * x) + PESO_SUBIDA * Math.max(dz, 0) + PESO_BAJADA * Math.max(-dz, 0);
}

// ---------------------------------------------------------------- A*

const VEC: [number, number][] = [[-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1]];

export interface OpcionesBusqueda { modo: ModoRuta; maxNodos?: number; /** false = Dijkstra (para los tests). */ heuristica?: boolean }
export type Busqueda =
  | { estado: 'ok'; celdas: CeldaR[]; coste: number; nodos: number }
  | { estado: 'sin_ruta' | 'limite' | 'sin_datos'; nodos: number };

/** Montículo binario mínimo de (clave, nodo). */
class Monticulo {
  k: number[] = []; v: number[] = [];
  get n() { return this.k.length; }
  meter(k: number, v: number) {
    let i = this.k.length; this.k.push(k); this.v.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= k) break;
      this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p;
    }
    this.k[i] = k; this.v[i] = v;
  }
  sacar(): number {
    const top = this.v[0], k = this.k.pop()!, v = this.v.pop()!;
    if (this.k.length) {
      let i = 0; const n = this.k.length;
      for (;;) {
        const a = 2 * i + 1, b = a + 1;
        let m = i, km = k;
        if (a < n && this.k[a] < km) { m = a; km = this.k[a]; }
        if (b < n && this.k[b] < km) { m = b; km = this.k[b]; }
        if (m === i) break;
        this.k[i] = this.k[m]; this.v[i] = this.v[m]; i = m;
      }
      this.k[i] = k; this.v[i] = v;
    }
    return top;
  }
}

/** Ruta de menor coste entre dos celdas de la rejilla. */
export function buscarRuta(r: Rejilla, ini: CeldaR, fin: CeldaR, o: OpcionesBusqueda): Busqueda {
  const { ancho, alto, alt, res } = r;
  const max = o.maxNodos ?? MAX_NODOS, conH = o.heuristica !== false, modo = o.modo;
  const dentro = (c: CeldaR) => c.fila >= 0 && c.col >= 0 && c.fila < alto && c.col < ancho;
  if (!dentro(ini) || !dentro(fin)) return { estado: 'sin_datos', nodos: 0 };
  const i0 = ini.fila * ancho + ini.col, i1 = fin.fila * ancho + fin.col;
  if (!Number.isFinite(alt[i0]) || !Number.isFinite(alt[i1])) return { estado: 'sin_datos', nodos: 0 };
  const zf = alt[i1];
  const h = (i: number) => {
    if (!conH) return 0;
    const f = Math.floor(i / ancho), c = i - f * ancho;
    const base = Math.hypot(f - fin.fila, c - fin.col) * res * MIN_POR_M_MIN;
    if (modo === 'directa') return base;
    const dz = zf - alt[i];
    return base + (dz > 0 ? PESO_SUBIDA * dz : -PESO_BAJADA * dz);
  };
  const n = ancho * alto;
  const g = new Float64Array(n).fill(Infinity), padre = new Int32Array(n).fill(-1), cerrado = new Uint8Array(n);
  const abiertos = new Monticulo();
  g[i0] = 0; abiertos.meter(h(i0), i0);
  let nodos = 0;
  while (abiertos.n) {
    const i = abiertos.sacar();
    if (cerrado[i]) continue;
    if (i === i1) {
      const celdas: CeldaR[] = [];
      for (let k = i; k >= 0; k = padre[k]) celdas.push({ fila: Math.floor(k / ancho), col: k % ancho });
      return { estado: 'ok', celdas: celdas.reverse(), coste: g[i], nodos };
    }
    if (nodos >= max) return { estado: 'limite', nodos };
    cerrado[i] = 1; nodos++;
    const f = Math.floor(i / ancho), c = i - f * ancho, z = alt[i];
    for (const [df, dc] of VEC) {
      const ff = f + df, cc = c + dc;
      if (ff < 0 || cc < 0 || ff >= alto || cc >= ancho) continue;
      const j = ff * ancho + cc;
      if (cerrado[j]) continue;
      const zj = alt[j];
      if (!Number.isFinite(zj)) continue;
      const paso = costePaso(df && dc ? res * Math.SQRT2 : res, zj - z, modo);
      if (paso === Infinity) continue;
      const gj = g[i] + paso;
      if (gj < g[j]) { g[j] = gj; padre[j] = i; abiertos.meter(gj + h(j), j); }
    }
  }
  return { estado: 'sin_ruta', nodos };
}

// ---------------------------------------------------------------- ruta completa

export interface RutaPie {
  estado: 'ok';
  modo: ModoRuta;
  celdas: CeldaR[];
  /** [lon, lat] de tu posición al destino (centros de celda). */
  linea: [number, number][];
  perfil: Perfil;
  distancia_m: number;
  subida_m: number;
  bajada_m: number;
  /** Tiempo de Tobler a lo largo de la ruta (sin paradas). */
  tiempo_min: number;
  nodos: number;
  /** Resolución de la rejilla usada (m). */
  res: number;
}
export type ResultadoRuta = RutaPie | { estado: 'sin_ruta' | 'limite' | 'sin_datos' | 'fuera'; modo: ModoRuta; nodos: number; res: number };

/** Ruta a pie de `desde` a `hasta` (lat/lon) sobre la rejilla. */
export function rutaPie(r: Rejilla, desde: { lat: number; lon: number }, hasta: { lat: number; lon: number }, modo: ModoRuta,
  maxNodos = MAX_NODOS): ResultadoRuta {
  const a = celdaLatLon(r, desde.lat, desde.lon), b = celdaLatLon(r, hasta.lat, hasta.lon);
  if (!a || !b) return { estado: 'fuera', modo, nodos: 0, res: r.res };
  const x = buscarRuta(r, a, b, { modo, maxNodos });
  if (x.estado !== 'ok') return { estado: x.estado, modo, nodos: x.nodos, res: r.res };
  const alts = x.celdas.map((c) => cota(r, c));
  const per = perfil(x.celdas, alts, r.res);
  let t = 0;
  for (let i = 1; i < x.celdas.length; i++) {
    const p = x.celdas[i - 1], q = x.celdas[i];
    t += tiempoPasoMin(p.fila !== q.fila && p.col !== q.col ? r.res * Math.SQRT2 : r.res, alts[i] - alts[i - 1]);
  }
  return { estado: 'ok', modo, celdas: x.celdas, linea: x.celdas.map((c) => centroLonLat(r, c)), perfil: per,
    distancia_m: per.total_m, subida_m: per.subida_m, bajada_m: per.bajada_m, tiempo_min: t, nodos: x.nodos, res: r.res };
}

// ---------------------------------------------------------------- microzonas: desnivel y filtro («seguir la curva de nivel»)

/** Desniveles máximos que puede elegir el usuario (null = sin límite). */
export const DESNIVELES_MAX: (number | null)[] = [null, 100, 60, 30];
/** Puntos de idoneidad que resta cada metro de desnivel al ordenar con filtro (40 m de desnivel = −10 puntos). */
export const PESO_DESNIVEL = 0.25;
/** Cuántas candidatas (las mejores por idoneidad) se miran antes de filtrar por desnivel. */
export const CANDIDATAS = 40;

export interface DesnivelMicro {
  /** Cota de la microzona (m) y diferencia con la tuya. */
  cota_m: number | null;
  dCota_m: number | null;
  /** Subida + bajada de la ruta de mínimo desnivel (ida; a la vuelta se sube lo que se bajó). null sin calcular. */
  desnivel_m: number | null;
  subida_m: number | null;
  bajada_m: number | null;
  /** Por qué no hay desnivel de ruta: la criba de cota ya la descarta, no hay ruta o no hay cotas. */
  motivo: 'cota' | 'sin_ruta' | 'sin_datos' | null;
}

/** |Δcota| redondeado al metro, o null. */
const dif = (a: number, b: number) => (Number.isFinite(a) && Number.isFinite(b) ? Math.round(Math.abs(a - b)) : null);

/**
 * Anota a cada microzona su desnivel desde `desde`. Primero la criba por |Δcota| (la ruta nunca puede tener menos
 * desnivel que la diferencia de cota): si ya pasa de `max`, no se busca la ruta.
 */
export function desnivelMicrozonas<T extends { lat: number; lon: number }>(cands: T[], r: Rejilla, desde: { lat: number; lon: number },
  max: number | null, maxNodos = MAX_NODOS): (T & DesnivelMicro)[] {
  const z0 = cotaEn(r, desde.lat, desde.lon);
  return cands.map((c) => {
    const z = cotaEn(r, c.lat, c.lon);
    const d = dif(z, z0);
    const base = { cota_m: Number.isFinite(z) ? Math.round(z) : null, dCota_m: d, desnivel_m: null, subida_m: null, bajada_m: null };
    if (d === null) return { ...c, ...base, motivo: 'sin_datos' as const };
    if (max !== null && d > max) return { ...c, ...base, motivo: 'cota' as const };
    const ruta = rutaPie(r, desde, c, 'minimo_desnivel', maxNodos);
    if (ruta.estado !== 'ok') return { ...c, ...base, motivo: ruta.estado === 'sin_datos' || ruta.estado === 'fuera' ? 'sin_datos' as const : 'sin_ruta' as const };
    return { ...c, ...base, desnivel_m: ruta.subida_m + ruta.bajada_m, subida_m: ruta.subida_m, bajada_m: ruta.bajada_m, motivo: null };
  });
}

export const puntuacionMicro = (idon: number, desnivel_m: number) => idon - PESO_DESNIVEL * desnivel_m;

/**
 * Con límite: solo las que tienen ruta con desnivel ≤ max, ordenadas por idoneidad − PESO_DESNIVEL·desnivel (a igualdad,
 * la más cercana). Sin límite: todas, por idoneidad (como siempre). Devuelve también cuántas se ocultan.
 */
export function filtrarPorDesnivel<T extends { idon: number; dist_m: number } & Pick<DesnivelMicro, 'desnivel_m'>>(xs: T[], max: number | null,
  n = Infinity): { visibles: T[]; ocultas: number } {
  if (max === null) return { visibles: [...xs].sort((a, b) => b.idon - a.idon || a.dist_m - b.dist_m).slice(0, n), ocultas: 0 };
  const ok = xs.filter((x) => x.desnivel_m !== null && x.desnivel_m <= max);
  ok.sort((a, b) => puntuacionMicro(b.idon, b.desnivel_m!) - puntuacionMicro(a.idon, a.desnivel_m!) || a.dist_m - b.dist_m);
  return { visibles: ok.slice(0, n), ocultas: xs.length - ok.length };
}

/** «12 min», «1 h 05 min». */
export function textoMinutos(min: number): string {
  const m = Math.max(1, Math.round(min));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** Nota de resolución que la UI enseña junto a la ruta. */
export const notaResolucion = (res: number) =>
  `Ruta aproximada sobre una rejilla de ${Math.round(res)} m: no ve caminos, vallas ni cortados más pequeños que la celda.`;

/** Rectángulo UTM que cubre `pos` y un radio con margen (para pedir la ventana de cotas). */
export function cajaAlrededor(pos: { lat: number; lon: number }, radio: number): [number, number, number, number] {
  const [x, y] = aUtm30(pos.lat, pos.lon);
  return [x - radio, y - radio, x + radio, y + radio];
}
