// Acceso a pie desde el coche (pipeline/setas_pipeline/acceso.py). Puro, sin DOM: se prueba en acceso.test.ts.
//
// acceso.bin: rejilla EPSG:25830 a 100 m, planar little-endian, cada capa alineada a 4 bytes (offsets en
// acceso.json): origen_id u32 (aparcamiento), tiempo_pie_min u16, subida_m u16, direccion u8 (0 = celda de
// aparcamiento, 1..8 = N, NE, E, SE, S, SW, W, NW hacia el paso anterior camino del coche; 255 = sin dato).
// La app no carga el archivo entero: lee los pocos bytes de una celda y, para el trazado, bloques de filas de
// la capa direccion (Blob.slice sobre el archivo de OPFS o peticiones Range por HTTP).
// Versión 2 (2026-10-14) añade al final la capa altitud (u16, m; nodata 0xFFFF) para el perfil de la ruta a pie.
// La app lee las dos versiones; con la 1 no hay perfil.
import type { Manifest } from './tipos';

export type Capa = 'origen_id' | 'tiempo_pie_min' | 'subida_m' | 'direccion';
const TAM: Record<Capa, number> = { origen_id: 4, tiempo_pie_min: 2, subida_m: 2, direccion: 1 };
const DTYPE: Record<Capa, string> = { origen_id: 'uint32', tiempo_pie_min: 'uint16', subida_m: 'uint16', direccion: 'uint8' };

export interface Cabecera {
  res: number;
  x0: number;          // borde oeste (m, EPSG:25830)
  y1: number;          // borde norte
  ancho: number;
  alto: number;
  bytes: number;
  capas: Record<Capa, { offset: number; nodata: number }>;
  /** Solo en la versión 2. */
  altitud?: { offset: number; nodata: number };
  version: 1 | 2;
}

/** Valida acceso.json; lanza si el formato no es el que la app sabe leer. */
export function parsearCabecera(j: any): Cabecera {
  const mal = (m: string) => { throw new Error(`acceso.json: ${m}`); };
  if (!j || typeof j !== 'object') mal('no es un objeto');
  if (j.version !== 1 && j.version !== 2) mal(`versión ${j.version} no soportada`);
  if (j.crs !== 'EPSG:25830') mal(`CRS ${j.crs} no soportado`);
  if (j.endianness !== 'little') mal('se espera little-endian');
  const { ancho, alto, res_m: res } = j;
  if (!Number.isInteger(ancho) || !Number.isInteger(alto) || ancho <= 0 || alto <= 0) mal('dimensiones inválidas');
  if (!(res > 0)) mal('resolución inválida');
  const [x0, y1] = Array.isArray(j.origen_xy) ? j.origen_xy : [];
  if (!Number.isFinite(x0) || !Number.isFinite(y1)) mal('origen inválido');
  const capa = (c: string, dtype: string, tam: number) => {
    const d = j.capas?.[c];
    if (!d) mal(`falta la capa ${c}`);
    if (d.dtype !== dtype) mal(`${c}: dtype ${d.dtype}`);
    if (d.offset % 4 !== 0) mal(`${c}: offset no alineado`);
    if (d.bytes !== ancho * alto * tam) mal(`${c}: ${d.bytes} bytes`);
    if (d.offset + d.bytes > j.bytes) mal(`${c}: fuera del archivo`);
    return { offset: d.offset as number, nodata: d.nodata as number };
  };
  const capas = {} as Cabecera['capas'];
  for (const c of Object.keys(TAM) as Capa[]) capas[c] = capa(c, DTYPE[c], TAM[c]);
  const cab: Cabecera = { res, x0, y1, ancho, alto, bytes: j.bytes, capas, version: j.version };
  if (j.version === 2) cab.altitud = capa('altitud', 'uint16', 2);
  return cab;
}

// ---------------------------------------------------------------- UTM huso 30 (ETRS89 ≈ WGS84 al cm)

const A = 6378137, F = 1 / 298.257222101, K0 = 0.9996, LON0 = (-3 * Math.PI) / 180, FE = 500000;
const E2 = F * (2 - F), EP2 = E2 / (1 - E2);
const M1 = 1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256;
const M2 = (3 * E2) / 8 + (3 * E2 ** 2) / 32 + (45 * E2 ** 3) / 1024;
const M3 = (15 * E2 ** 2) / 256 + (45 * E2 ** 3) / 1024;
const M4 = (35 * E2 ** 3) / 3072;
const meridiano = (p: number) => A * (M1 * p - M2 * Math.sin(2 * p) + M3 * Math.sin(4 * p) - M4 * Math.sin(6 * p));

/** (lat, lon) en grados → [x, y] EPSG:25830 (Snyder, error < 1 cm en el huso). */
export function aUtm30(lat: number, lon: number): [number, number] {
  const p = (lat * Math.PI) / 180, l = (lon * Math.PI) / 180;
  const s = Math.sin(p), c = Math.cos(p), t = Math.tan(p);
  const N = A / Math.sqrt(1 - E2 * s * s), T = t * t, C = EP2 * c * c, Aa = (l - LON0) * c;
  const x = FE + K0 * N * (Aa + ((1 - T + C) * Aa ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * Aa ** 5) / 120);
  const y = K0 * (meridiano(p) + N * t * (Aa ** 2 / 2 + ((5 - T + 9 * C + 4 * C * C) * Aa ** 4) / 24
    + ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * Aa ** 6) / 720));
  return [x, y];
}

/** [x, y] EPSG:25830 → [lat, lon] en grados. */
export function deUtm30(x: number, y: number): [number, number] {
  const mu = y / K0 / (A * M1);
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const p1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) + ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
    + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const s = Math.sin(p1), c = Math.cos(p1), t = Math.tan(p1);
  const C1 = EP2 * c * c, T1 = t * t, N1 = A / Math.sqrt(1 - E2 * s * s), R1 = (A * (1 - E2)) / (1 - E2 * s * s) ** 1.5;
  const D = (x - FE) / (N1 * K0);
  const p = p1 - ((N1 * t) / R1) * (D ** 2 / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4) / 24
    + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D ** 6) / 720);
  const l = LON0 + (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D ** 5) / 120) / c;
  return [(p * 180) / Math.PI, (l * 180) / Math.PI];
}

// ---------------------------------------------------------------- celdas

export interface Celda { fila: number; col: number }

/** Celda que contiene el punto, o null si cae fuera de la rejilla. */
export function celdaDe(cab: Cabecera, lat: number, lon: number): Celda | null {
  const [x, y] = aUtm30(lat, lon);
  const col = Math.floor((x - cab.x0) / cab.res), fila = Math.floor((cab.y1 - y) / cab.res);
  return col < 0 || fila < 0 || col >= cab.ancho || fila >= cab.alto ? null : { fila, col };
}

/** Centro de una celda en [lon, lat] (orden GeoJSON). */
export function centroCelda(cab: Cabecera, { fila, col }: Celda): [number, number] {
  const [lat, lon] = deUtm30(cab.x0 + (col + 0.5) * cab.res, cab.y1 - (fila + 0.5) * cab.res);
  return [lon, lat];
}

/** Lee `n` bytes desde `offset` del archivo (Blob.slice, Range HTTP…). */
export interface Lector { leer(offset: number, n: number): Promise<ArrayBuffer> }

/** acceso.bin.gz → Blob descomprimido (DecompressionStream; el navegador puede llevar el Blob a disco). */
export const descomprimir = (s: ReadableStream<Uint8Array>) =>
  new Response(s.pipeThrough(new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)).blob();

/** Nombre del binario: el del manifest (acceso.datos) o, si no lo dice, el que esté en la lista de archivos. */
export function nombreBinario(m: Pick<Manifest, 'acceso' | 'archivos'>): string {
  if (m.acceso?.datos) return m.acceso.datos;
  return m.archivos.some((a) => a.nombre === 'acceso.bin.gz') ? 'acceso.bin.gz' : 'acceso.bin';
}

export function lectorBlob(b: Blob): Lector {
  return { leer: (o, n) => b.slice(o, o + n).arrayBuffer() };
}

const valor = (buf: ArrayBuffer, tam: number) => {
  const v = new DataView(buf);
  return tam === 4 ? v.getUint32(0, true) : tam === 2 ? v.getUint16(0, true) : v.getUint8(0);
};

export type Consulta =
  | { estado: 'fuera' }
  | { estado: 'sin_dato'; celda: Celda }
  | { estado: 'ok'; celda: Celda; origen: number; tiempo_min: number; subida_m: number; direccion: number };

/** Los cuatro valores de la celda del punto (9 bytes en cuatro lecturas). */
export async function consultar(cab: Cabecera, lector: Lector, lat: number, lon: number): Promise<Consulta> {
  const celda = celdaDe(cab, lat, lon);
  if (!celda) return { estado: 'fuera' };
  const i = celda.fila * cab.ancho + celda.col;
  const [origen, tiempo_min, subida_m, direccion] = await Promise.all((Object.keys(TAM) as Capa[]).map(async (c) =>
    valor(await lector.leer(cab.capas[c].offset + i * TAM[c], TAM[c]), TAM[c])));
  const sin = origen === cab.capas.origen_id.nodata || tiempo_min === cab.capas.tiempo_pie_min.nodata
    || direccion === cab.capas.direccion.nodata || direccion > 8;
  if (sin) return { estado: 'sin_dato', celda };
  return { estado: 'ok', celda, origen, tiempo_min, subida_m: subida_m === cab.capas.subida_m.nodata ? 0 : subida_m, direccion };
}

/** dfila, dcol de cada código 1..8 (N, NE, E, SE, S, SW, W, NW), como VECINOS en acceso.py. */
export const VECINOS: [number, number][] = [[-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1]];
export const FILAS_BLOQUE = 32;
export const MAX_PASOS = 500;   // 50 km a 100 m: de sobra (el tiempo máximo exportado es < 3 h)

export interface Traza { celdas: Celda[]; completa: boolean; bloquesLeidos: number }

/**
 * Sigue los punteros de `direccion` desde la celda hasta el aparcamiento (código 0). Lee bloques de
 * FILAS_BLOQUE filas de la capa (32 × 2451 B ≈ 78 KB) y los guarda mientras dura la traza. Se corta si llega a
 * una celda sin dato, sale de la rejilla, repite celda o supera `maxPasos`; entonces `completa` es false.
 */
export async function trazar(cab: Cabecera, lector: Lector, inicio: Celda, maxPasos = MAX_PASOS): Promise<Traza> {
  const bloques = new Map<number, Uint8Array>();
  const { offset } = cab.capas.direccion;
  const dir = async (f: number, c: number) => {
    const b = Math.floor(f / FILAS_BLOQUE);
    let u = bloques.get(b);
    if (!u) {
      const f0 = b * FILAS_BLOQUE, nf = Math.min(FILAS_BLOQUE, cab.alto - f0);
      u = new Uint8Array(await lector.leer(offset + f0 * cab.ancho, nf * cab.ancho));
      bloques.set(b, u);
    }
    return u[(f - b * FILAS_BLOQUE) * cab.ancho + c];
  };
  const celdas: Celda[] = [inicio];
  const vistas = new Set([inicio.fila * cab.ancho + inicio.col]);
  let { fila, col } = inicio;
  for (let paso = 0; paso <= maxPasos; paso++) {
    const d = await dir(fila, col);
    if (d === 0) return { celdas, completa: true, bloquesLeidos: bloques.size };
    if (d < 1 || d > 8 || paso === maxPasos) break;
    const [df, dc] = VECINOS[d - 1];
    fila += df; col += dc;
    const k = fila * cab.ancho + col;
    if (fila < 0 || col < 0 || fila >= cab.alto || col >= cab.ancho || vistas.has(k)) break;
    vistas.add(k);
    celdas.push({ fila, col });
  }
  return { celdas, completa: false, bloquesLeidos: bloques.size };
}

/**
 * Altitud (m) de cada celda, de la capa altitud (versión 2); NaN donde no hay dato o si la cabecera es v1.
 * Lee bloques de FILAS_BLOQUE filas, como trazar().
 */
export async function altitudes(cab: Cabecera, lector: Lector, celdas: Celda[]): Promise<number[]> {
  const capa = cab.altitud;
  if (!capa) return celdas.map(() => NaN);
  const bloques = new Map<number, DataView>();
  const out: number[] = [];
  for (const { fila, col } of celdas) {
    if (fila < 0 || col < 0 || fila >= cab.alto || col >= cab.ancho) { out.push(NaN); continue; }
    const b = Math.floor(fila / FILAS_BLOQUE);
    let v = bloques.get(b);
    if (!v) {
      const f0 = b * FILAS_BLOQUE, nf = Math.min(FILAS_BLOQUE, cab.alto - f0);
      v = new DataView(await lector.leer(capa.offset + f0 * cab.ancho * 2, nf * cab.ancho * 2));
      bloques.set(b, v);
    }
    const a = v.getUint16(((fila - b * FILAS_BLOQUE) * cab.ancho + col) * 2, true);
    out.push(a === capa.nodata ? NaN : a);
  }
  return out;
}

/** Celda de un índice plano (fila·ancho + col), el `id` de los sitios de sitios.json. */
export const celdaDeIndice = (cab: Pick<Cabecera, 'ancho'>, i: number): Celda => ({ fila: Math.floor(i / cab.ancho), col: i % cab.ancho });

/** Quita los vértices intermedios de los tramos rectos (misma dirección). */
export function simplificar(celdas: Celda[]): Celda[] {
  if (celdas.length < 3) return celdas;
  const out = [celdas[0]];
  for (let i = 1; i < celdas.length - 1; i++) {
    const a = celdas[i - 1], b = celdas[i], c = celdas[i + 1];
    if (b.fila - a.fila !== c.fila - b.fila || b.col - a.col !== c.col - b.col) out.push(b);
  }
  out.push(celdas[celdas.length - 1]);
  return out;
}

// ---------------------------------------------------------------- aparcamientos

export interface AparcamientosCompactos { vias: [string | null, string | null, string][]; datos: [number, number, number][] }
export interface Aparcamiento { id: number; lat: number; lon: number; nombre: string | null; ref: string | null; tipo: string }

export function aparcamiento(a: AparcamientosCompactos, id: number): Aparcamiento | null {
  const d = a.datos[id];
  const v = d && a.vias[d[2]];
  if (!v) return null;
  return { id, lat: d[0], lon: d[1], nombre: v[0], ref: v[1], tipo: v[2] };
}

const SIN_NOMBRE: Record<string, string> = {
  track: 'pista sin nombre', unclassified: 'pista sin nombre', service: 'camino de servicio sin nombre',
  residential: 'calle sin nombre',
};
/** «Nombre (REF)», el que haya de los dos o «pista sin nombre» y parecidos según el tipo de vía. */
export function nombreVia(a: Pick<Aparcamiento, 'nombre' | 'ref' | 'tipo'>): string {
  if (a.nombre && a.ref) return `${a.nombre} (${a.ref})`;
  return a.nombre || a.ref || SIN_NOMBRE[a.tipo] || 'carretera sin nombre';
}

// ---------------------------------------------------------------- textos y enlaces

export function textoTiempo(min: number): string {
  if (min < 1) return 'menos de 1 min';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}
export const textoSubida = (m: number) => `+${Math.round(m)} m`;

const c5 = (v: number) => v.toFixed(5);
export const urlGoogleCoche = (lat: number, lon: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${c5(lat)},${c5(lon)}&travelmode=driving`;
/** geo: URI (RFC 5870 + q= de Android) para OsmAnd, Organic Maps y otras. */
export const urlGeo = (lat: number, lon: number, etiqueta: string) =>
  `geo:${c5(lat)},${c5(lon)}?q=${c5(lat)},${c5(lon)}(${encodeURIComponent(etiqueta)})`;
export const urlAppleMaps = (lat: number, lon: number, etiqueta: string) =>
  `https://maps.apple.com/?daddr=${c5(lat)},${c5(lon)}&dirflg=d&q=${encodeURIComponent(etiqueta)}`;
/** iPhone/iPad (también el iPad que se presenta como Mac): ahí geo: no lo abre nadie. */
export const esIOS = (ua: string, puntosToque = 0) => /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && puntosToque > 1);
export const urlOtraApp = (lat: number, lon: number, etiqueta: string, ios: boolean) =>
  (ios ? urlAppleMaps : urlGeo)(lat, lon, etiqueta);
