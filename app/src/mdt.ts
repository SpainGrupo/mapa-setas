// Cotas del terreno para la ruta a pie del Modo campo (2026-10-20). Puro, sin DOM ni red (mdt.test.ts).
//  - mdt_campo.bin / .json (pipeline mdt_campo.py): MDT25 del IGN a 25 m en teselas gzip alineadas con micro.bin.
//    Cada bloque: residuo del predictor 2D (izq + arriba − diagonal) en zigzag, plano de bytes bajos y luego altos.
//  - Rejilla: ventana rectangular de cotas (m; NaN = sin dato) alrededor de tu posición, sobre la que ruta-pie.ts busca.
//    La misma estructura sirve para la rejilla de 100 m de acceso.bin (respaldo si la región no tiene el MDT fino).
import { aUtm30, deUtm30 } from './acceso';

export interface CabeceraMdt {
  version: 1;
  res: number;
  x0: number;
  y1: number;
  ancho: number;
  alto: number;
  tesela: number;
  bytes: number;
  nodata: number;
  /** "fila_t,col_t" → [offset, bytes] del bloque gzip. */
  indice: Map<string, [number, number]>;
}

/** Valida mdt_campo.json; lanza si el formato no es el que la app sabe leer. */
export function parsearCabeceraMdt(j: any): CabeceraMdt {
  const mal = (m: string): never => { throw new Error(`mdt_campo.json: ${m}`); };
  if (!j || typeof j !== 'object') mal('no es un objeto');
  if (j.version !== 1) mal(`versión ${j.version} no soportada`);
  if (j.crs !== 'EPSG:25830') mal(`CRS ${j.crs} no soportado`);
  if (j.codificacion !== 'pred2d-zigzag-planos-gzip') mal(`codificación ${j.codificacion} no soportada`);
  const { ancho, alto, res_m: res, tesela } = j;
  if (!Number.isInteger(ancho) || !Number.isInteger(alto) || ancho <= 0 || alto <= 0) mal('dimensiones inválidas');
  if (!(res > 0) || !Number.isInteger(tesela) || tesela <= 0) mal('resolución o tesela inválidas');
  const [x0, y1] = Array.isArray(j.origen_xy) ? j.origen_xy : [];
  if (!Number.isFinite(x0) || !Number.isFinite(y1)) mal('origen inválido');
  if (!Array.isArray(j.indice)) mal('falta el índice');
  const indice = new Map<string, [number, number]>();
  for (const e of j.indice) {
    if (!Array.isArray(e) || e.length !== 4 || !e.every(Number.isInteger)) mal('entrada del índice inválida');
    if (e[2] < 0 || e[2] + e[3] > j.bytes) mal('bloque fuera del archivo');
    indice.set(`${e[0]},${e[1]}`, [e[2], e[3]]);
  }
  return { version: 1, res, x0, y1, ancho, alto, tesela, bytes: j.bytes, nodata: j.nodata ?? 0, indice };
}

/** Bloque descomprimido (2·t² bytes) → cotas u16 (m; 0 = sin dato), fila a fila. */
export function decodificarTesela(b: Uint8Array, t: number): Uint16Array {
  const n = t * t;
  if (b.length !== 2 * n) throw new Error(`mdt_campo.bin: bloque de ${b.length} bytes (se esperaban ${2 * n})`);
  const u = new Uint16Array(n);
  for (let f = 0; f < t; f++) {
    for (let c = 0; c < t; c++) {
      const i = f * t + c;
      const zz = b[i] | (b[n + i] << 8);
      const r = zz & 1 ? -((zz + 1) >> 1) : zz >> 1;
      const p = f === 0 ? (c ? u[i - 1] : 0) : c === 0 ? u[i - t] : u[i - 1] + u[i - t] - u[i - t - 1];
      u[i] = p + r;
    }
  }
  return u;
}

// ---------------------------------------------------------------- rejilla de cotas

export interface Rejilla {
  /** Lado de la celda (m). */
  res: number;
  /** Esquina NO de la ventana (EPSG:25830). */
  x0: number;
  y1: number;
  ancho: number;
  alto: number;
  /** Cota (m) por celda, fila a fila desde el norte; NaN sin dato. */
  alt: Float32Array;
}

export interface CeldaR { fila: number; col: number }

/** Celda de la rejilla que contiene el punto UTM, o null fuera. */
export function celdaXY(r: Pick<Rejilla, 'res' | 'x0' | 'y1' | 'ancho' | 'alto'>, x: number, y: number): CeldaR | null {
  const col = Math.floor((x - r.x0) / r.res), fila = Math.floor((r.y1 - y) / r.res);
  return col < 0 || fila < 0 || col >= r.ancho || fila >= r.alto ? null : { fila, col };
}
export const celdaLatLon = (r: Pick<Rejilla, 'res' | 'x0' | 'y1' | 'ancho' | 'alto'>, lat: number, lon: number) => celdaXY(r, ...aUtm30(lat, lon));

/** Centro de la celda en [lon, lat] (orden GeoJSON). */
export function centroLonLat(r: Pick<Rejilla, 'res' | 'x0' | 'y1'>, c: CeldaR): [number, number] {
  const [lat, lon] = deUtm30(r.x0 + (c.col + 0.5) * r.res, r.y1 - (c.fila + 0.5) * r.res);
  return [lon, lat];
}

/** Cota de la celda (NaN sin dato o fuera). */
export function cota(r: Rejilla, c: CeldaR | null): number {
  if (!c || c.fila < 0 || c.col < 0 || c.fila >= r.alto || c.col >= r.ancho) return NaN;
  return r.alt[c.fila * r.ancho + c.col];
}
export const cotaEn = (r: Rejilla, lat: number, lon: number) => cota(r, celdaLatLon(r, lat, lon));

/** Ventana de celdas de una rejilla global (cabecera) que cubre el rectángulo UTM, recortada a la rejilla. */
export function ventanaGlobal(cab: Pick<CabeceraMdt, 'res' | 'x0' | 'y1' | 'ancho' | 'alto'>, xmin: number, ymin: number, xmax: number, ymax: number) {
  const c0 = Math.max(0, Math.floor((xmin - cab.x0) / cab.res)), c1 = Math.min(cab.ancho, Math.ceil((xmax - cab.x0) / cab.res));
  const f0 = Math.max(0, Math.floor((cab.y1 - ymax) / cab.res)), f1 = Math.min(cab.alto, Math.ceil((cab.y1 - ymin) / cab.res));
  return { f0, c0, f1: Math.max(f0, f1), c1: Math.max(c0, c1) };
}

/** Teselas (fila_t, col_t) que tocan una ventana. */
export function teselasVentana(t: number, v: { f0: number; c0: number; f1: number; c1: number }): [number, number][] {
  const out: [number, number][] = [];
  for (let ft = Math.floor(v.f0 / t); ft <= Math.floor((v.f1 - 1) / t); ft++)
    for (let ct = Math.floor(v.c0 / t); ct <= Math.floor((v.c1 - 1) / t); ct++) out.push([ft, ct]);
  return out;
}

/** Compone la rejilla de la ventana con las teselas ya decodificadas (null = tesela sin datos → NaN). */
export function componerRejilla(cab: Pick<CabeceraMdt, 'res' | 'x0' | 'y1' | 'tesela' | 'nodata'>, v: { f0: number; c0: number; f1: number; c1: number },
  tesela: (ft: number, ct: number) => Uint16Array | null): Rejilla {
  const ancho = v.c1 - v.c0, alto = v.f1 - v.f0, t = cab.tesela;
  const alt = new Float32Array(ancho * alto).fill(NaN);
  for (let f = v.f0; f < v.f1; f++) {
    for (let c = v.c0; c < v.c1; c++) {
      const b = tesela(Math.floor(f / t), Math.floor(c / t));
      if (!b) continue;
      const z = b[(f % t) * t + (c % t)];
      if (z !== cab.nodata) alt[(f - v.f0) * ancho + (c - v.c0)] = z;
    }
  }
  return { res: cab.res, x0: cab.x0 + v.c0 * cab.res, y1: cab.y1 - v.f0 * cab.res, ancho, alto, alt };
}

/** Rectángulo UTM [xmin, ymin, xmax, ymax] que cubre los puntos con un margen (m). */
export function cajaUtm(puntos: { lat: number; lon: number }[], margen: number): [number, number, number, number] {
  const xy = puntos.map((p) => aUtm30(p.lat, p.lon));
  return [Math.min(...xy.map((p) => p[0])) - margen, Math.min(...xy.map((p) => p[1])) - margen,
    Math.max(...xy.map((p) => p[0])) + margen, Math.max(...xy.map((p) => p[1])) + margen];
}
