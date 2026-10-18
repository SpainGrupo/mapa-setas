// Modo campo (2026-10-18): microzonas a ~500 m de tu posición con los valores por celda de micro.bin (pipeline micro.py).
// Puro, sin DOM ni red (micro.test.ts); micro-datos.ts lee las teselas y campo-ui.ts pinta.
//  - Idoneidad de la celda = la del modelo (idoneidad.py), que ya combina árbol, dosel, cubierta, orientación ×
//    pendiente, humedad (TWI / cauce), suelo, altitud, incendios y edificado. Aquí solo se ordena y se explica.
//  - Resolución 100 m: una celda es una hectárea, no un árbol. La UI lo dice.
//  - Selección: celdas con idoneidad ≥ UMBRAL_BUENA, de mayor a menor (a igualdad, la más cercana), aceptando una si
//    está a ≥ SEPARACION_M de todas las ya elegidas (sin vecinas en cruz: nunca dos iconos pegados), máx. MAX_MICROZONAS.
//  - Aviso «te sales de la zona buena» con histéresis: se entra con ≥ UMBRAL_BUENA; se sale tras LECTURAS_SALIDA lecturas
//    seguidas < UMBRAL_BAJA (entre las dos, nada cambia); solo avisa si antes estuviste dentro, y no cuentan las
//    lecturas con precisión del GPS peor que PRECISION_MAX_M.
import { aUtm30, deUtm30 } from './acceso';
import { cardinal, rumbo } from './brujula';
import { densidad } from './razones';

export const RADIO_M = 500;
export const UMBRAL_BUENA = 50;
export const UMBRAL_BAJA = 35;
export const SEPARACION_M = 120;
export const MAX_MICROZONAS = 10;
export const LECTURAS_SALIDA = 2;
export const PRECISION_MAX_M = 40;
/** Al alejarte esto del centro de la última búsqueda, se recalculan las microzonas. */
export const RECALCULAR_M = 150;
export const NODATA = 255;
export const LLANO = 254;

export interface CapaMicro { id: string; nodata: number | null; escala?: number; llano?: number; max?: number }
export interface PerfilMicro {
  arboles?: Record<string, number>;
  orientacion?: 'umbria' | 'solana' | 'indiferente';
  humedad?: number;
  dosel?: { opt: [number, number]; peso?: number };
  altitud?: { min: number; opt_min: number; opt_max: number; max: number };
  cubierta?: Record<string, number>;
  matorral_cerca?: { radio_m: number; fuera: number };
  suelo?: Record<string, number>;
  /** false = saprófita (sin penalización por incendio); penaliza_fuego manda si está. */
  micorrizica?: boolean;
  penaliza_fuego?: boolean;
}
export interface CabeceraMicro {
  version: 1;
  res: number;
  x0: number;
  y1: number;
  ancho: number;
  alto: number;
  tesela: number;
  bytes: number;
  capas: CapaMicro[];
  especies: string[];
  perfiles: Record<string, PerfilMicro>;
  /** "fila_t,col_t" → [offset, bytes] del bloque gzip. */
  indice: Map<string, [number, number]>;
}

/** Valida micro.json; lanza si el formato no es el que la app sabe leer. */
export function parsearCabeceraMicro(j: any): CabeceraMicro {
  const mal = (m: string): never => { throw new Error(`micro.json: ${m}`); };
  if (!j || typeof j !== 'object') mal('no es un objeto');
  if (j.version !== 1) mal(`versión ${j.version} no soportada`);
  if (j.crs !== 'EPSG:25830') mal(`CRS ${j.crs} no soportado`);
  const { ancho, alto, res_m: res, tesela } = j;
  if (!Number.isInteger(ancho) || !Number.isInteger(alto) || ancho <= 0 || alto <= 0) mal('dimensiones inválidas');
  if (!(res > 0) || !Number.isInteger(tesela) || tesela <= 0) mal('resolución o tesela inválidas');
  const [x0, y1] = Array.isArray(j.origen_xy) ? j.origen_xy : [];
  if (!Number.isFinite(x0) || !Number.isFinite(y1)) mal('origen inválido');
  if (!Array.isArray(j.capas) || !Array.isArray(j.especies) || !Array.isArray(j.indice)) mal('faltan capas, especies o índice');
  const indice = new Map<string, [number, number]>();
  for (const e of j.indice) {
    if (!Array.isArray(e) || e.length !== 4 || !e.every(Number.isInteger)) mal('entrada del índice inválida');
    if (e[2] < 0 || e[2] + e[3] > j.bytes) mal('bloque fuera del archivo');
    indice.set(`${e[0]},${e[1]}`, [e[2], e[3]]);
  }
  for (const e of j.especies) if (!j.capas.some((c: CapaMicro) => c.id === `idon_${e}`)) mal(`falta la capa idon_${e}`);
  return { version: 1, res, x0, y1, ancho, alto, tesela, bytes: j.bytes, capas: j.capas, especies: j.especies,
    perfiles: j.perfiles && typeof j.perfiles === 'object' ? j.perfiles : {}, indice };
}

export interface Celda { fila: number; col: number }
export const teselaDe = (cab: CabeceraMicro, c: Celda) => ({ ft: Math.floor(c.fila / cab.tesela), ct: Math.floor(c.col / cab.tesela) });
export const claveTesela = (ft: number, ct: number) => `${ft},${ct}`;

/** Celdas cuyo centro está a ≤ radio de (lat, lon), con su centro y distancia (UTM 30, m). */
export function celdasEnRadio(cab: Pick<CabeceraMicro, 'res' | 'x0' | 'y1' | 'ancho' | 'alto'>, lat: number, lon: number, radio = RADIO_M) {
  const [x, y] = aUtm30(lat, lon);
  const col0 = Math.floor((x - cab.x0) / cab.res), fila0 = Math.floor((cab.y1 - y) / cab.res);
  const n = Math.ceil(radio / cab.res) + 1;
  const out: { fila: number; col: number; x: number; y: number; dist_m: number }[] = [];
  for (let f = fila0 - n; f <= fila0 + n; f++) {
    for (let c = col0 - n; c <= col0 + n; c++) {
      if (f < 0 || c < 0 || f >= cab.alto || c >= cab.ancho) continue;
      const cx = cab.x0 + (c + 0.5) * cab.res, cy = cab.y1 - (f + 0.5) * cab.res;
      const d = Math.hypot(cx - x, cy - y);
      if (d <= radio) out.push({ fila: f, col: c, x: cx, y: cy, dist_m: d });
    }
  }
  return out;
}

/** Celda que contiene el punto, o null fuera de la malla. */
export function celdaMicro(cab: Pick<CabeceraMicro, 'res' | 'x0' | 'y1' | 'ancho' | 'alto'>, lat: number, lon: number): Celda | null {
  const [x, y] = aUtm30(lat, lon);
  const col = Math.floor((x - cab.x0) / cab.res), fila = Math.floor((cab.y1 - y) / cab.res);
  return col < 0 || fila < 0 || col >= cab.ancho || fila >= cab.alto ? null : { fila, col };
}

/** Factores reales de una celda (null = sin dato). */
export interface ValoresCelda {
  fila: number; col: number;
  lat: number; lon: number;
  /** De tu posición al centro de la celda. */
  dist_m: number;
  rumbo: number;
  idon: number;
  arbol: number | null;
  fcc: number | null;
  sat: number | null;
  cubierta: number | null;
  /** Grados (0 = norte); 'llano' sin orientación. */
  orient: number | 'llano' | null;
  pend: number | null;
  humedad: number | null;
  cauce_m: number | null;
  /** cauce_m es «≥» (tope de la codificación). */
  cauceTope: boolean;
}

/** Lee la celda (fila, col) de un bloque de tesela ya descomprimido (capas planas tesela×tesela). */
export function leerCelda(cab: CabeceraMicro, bloque: Uint8Array | null, c: Celda, especie: string): Omit<ValoresCelda, 'lat' | 'lon' | 'dist_m' | 'rumbo'> {
  const t = cab.tesela, n = t * t;
  const i = (c.fila % t) * t + (c.col % t);
  const capa = (id: string) => { const k = cab.capas.findIndex((x) => x.id === id); return k < 0 || !bloque ? null : bloque[k * n + i]; };
  const v = (id: string) => { const x = capa(id); return x === null || x === NODATA ? null : x; };
  const o = capa('orient');
  const ca = cab.capas.find((x) => x.id === 'cauce');
  const cauce = v('cauce');
  return {
    fila: c.fila, col: c.col,
    idon: capa(`idon_${especie}`) ?? 0,
    arbol: v('arbol'), fcc: v('fcc'), sat: v('sat'), cubierta: v('cubierta'),
    orient: o === null || o === NODATA ? null : o === LLANO ? 'llano' : o * 2,
    pend: v('pend'), humedad: v('humedad'),
    cauce_m: cauce === null ? null : cauce * (ca?.escala ?? 10),
    cauceTope: cauce !== null && cauce >= (ca?.max ?? 250),
  };
}

/** Completa una celda leída con su centro en lat/lon y la distancia y el rumbo desde `pos`. */
export function situar(cab: Pick<CabeceraMicro, 'res' | 'x0' | 'y1'>, v: Omit<ValoresCelda, 'lat' | 'lon' | 'dist_m' | 'rumbo'>, pos: { lat: number; lon: number }): ValoresCelda {
  const [lat, lon] = deUtm30(cab.x0 + (v.col + 0.5) * cab.res, cab.y1 - (v.fila + 0.5) * cab.res);
  const [x, y] = aUtm30(pos.lat, pos.lon);
  const dist_m = Math.hypot(cab.x0 + (v.col + 0.5) * cab.res - x, cab.y1 - (v.fila + 0.5) * cab.res - y);
  return { ...v, lat, lon, dist_m, rumbo: rumbo(pos, { lat, lon }) };
}

// ---------------------------------------------------------------- selección de microzonas

export interface OpcionesSeleccion { max?: number; separacion_m?: number; umbral?: number; res?: number }

/** Mejores celdas, separadas y como mucho `max` (ver cabecera). Distancias entre celdas en la rejilla (exactas). */
export function seleccionarMicrozonas<T extends Pick<ValoresCelda, 'fila' | 'col' | 'idon' | 'dist_m'>>(celdas: T[], o: OpcionesSeleccion = {}): T[] {
  const max = o.max ?? MAX_MICROZONAS, sep = o.separacion_m ?? SEPARACION_M, umbral = o.umbral ?? UMBRAL_BUENA, res = o.res ?? 100;
  const cand = celdas.filter((c) => c.idon >= umbral).sort((a, b) => b.idon - a.idon || a.dist_m - b.dist_m || a.fila - b.fila || a.col - b.col);
  const elegidas: T[] = [];
  for (const c of cand) {
    if (elegidas.length >= max) break;
    if (elegidas.every((e) => Math.hypot(e.fila - c.fila, e.col - c.col) * res >= sep)) elegidas.push(c);
  }
  return elegidas;
}

/** Celda buena (≥ umbral) más cercana a tu posición, o null si no hay ninguna en las leídas. */
export function buenaMasCercana<T extends Pick<ValoresCelda, 'idon' | 'dist_m'>>(celdas: T[], umbral = UMBRAL_BUENA): T | null {
  let m: T | null = null;
  for (const c of celdas) if (c.idon >= umbral && (!m || c.dist_m < m.dist_m)) m = c;
  return m;
}

// ---------------------------------------------------------------- histéresis «te sales de la zona buena»

export interface EstadoZona {
  /** Dentro de zona buena (con histéresis). */
  dentro: boolean;
  /** Has estado en zona buena alguna vez desde que se activó el modo campo. */
  estuvo: boolean;
  /** Lecturas seguidas por debajo de UMBRAL_BAJA. */
  bajas: number;
}
export const ZONA_INICIAL: EstadoZona = { dentro: false, estuvo: false, bajas: 0 };
export type AvisoZona = 'sale' | 'vuelve' | null;

/** Siguiente estado con la idoneidad de la celda donde estás y la precisión del GPS. */
export function pasoZona(antes: EstadoZona, idonAqui: number, precision_m = 0): { estado: EstadoZona; aviso: AvisoZona } {
  if (!(precision_m <= PRECISION_MAX_M)) return { estado: antes, aviso: null };     // lectura poco fiable: no cuenta
  if (idonAqui >= UMBRAL_BUENA) {
    const aviso: AvisoZona = !antes.dentro && antes.estuvo ? 'vuelve' : null;
    return { estado: { dentro: true, estuvo: true, bajas: 0 }, aviso };
  }
  if (idonAqui < UMBRAL_BAJA) {
    const bajas = antes.bajas + 1;
    if (antes.dentro && bajas >= LECTURAS_SALIDA) return { estado: { dentro: false, estuvo: true, bajas }, aviso: 'sale' };
    return { estado: { ...antes, bajas }, aviso: null };
  }
  return { estado: { ...antes, bajas: 0 }, aviso: null };      // zona intermedia: ni entra ni sale
}

// ---------------------------------------------------------------- textos (factores reales en una línea)

/** Códigos de malla.ARBOL (pipeline). */
export const ARBOL: Record<number, string> = { 0: 'sin arbolado', 1: 'alcornoque', 2: 'encina', 3: 'quejigo', 4: 'castaño', 5: 'pino',
  6: 'pinsapo', 7: 'otro arbolado', 8: 'sabina' };
export const CLAVE_ARBOL: Record<number, string> = { 0: 'sin_arbolado', 1: 'alcornoque', 2: 'encina', 3: 'quejigo', 4: 'castano', 5: 'pino',
  6: 'pinsapo', 7: 'otro', 8: 'sabina' };
/** Códigos de malla.CUBIERTA (desarbolado del MFE). */
export const CUBIERTA: Record<number, string> = { 1: 'matorral', 2: 'pastizal con matorral', 3: 'pastizal' };

/** «umbría (N)», «solana (S)», «ladera E»; llano por debajo de 5°. */
export function textoLadera(orient: ValoresCelda['orient'], pend: number | null): string {
  if (orient === null) return '';
  if (orient === 'llano' || (pend !== null && pend < 5)) return 'llano';
  const card = cardinal(orient);
  const o = ((orient % 360) + 360) % 360;
  const tipo = o >= 315 || o < 45 ? 'umbría' : o >= 135 && o < 225 ? 'solana' : 'ladera';
  return `${tipo} al ${card}${pend !== null ? `, ${pend}°` : ''}`;
}

export function textoHumedad(h: number | null, cauce_m: number | null, tope = false): string {
  const p: string[] = [];
  if (h !== null) p.push(h >= 60 ? 'fresco (vaguada o arroyo)' : h >= 30 ? 'humedad media' : 'seco');
  if (cauce_m !== null && !tope && cauce_m < 50) p.push('junto a un cauce');
  else if (cauce_m !== null && !tope && cauce_m <= 300) p.push(`cauce a ${Math.round(cauce_m / 10) * 10} m`);
  return p.join(', ');
}

/** Árbol y copas: «alcornoque, 45 % de copas (satélite)». */
export function textoArbol(v: Pick<ValoresCelda, 'arbol' | 'fcc' | 'sat' | 'cubierta'>): string {
  const copas = v.sat ?? v.fcc;
  const fuente = v.sat !== null ? 'satélite' : 'mapa forestal';
  if (v.arbol === null || v.arbol === 0) {
    const cub = v.cubierta !== null ? CUBIERTA[v.cubierta] : undefined;
    return [cub ?? 'sin arbolado', copas !== null && copas > 0 ? `${copas} % de copas (${fuente})` : ''].filter(Boolean).join(', ');
  }
  const a = ARBOL[v.arbol] ?? 'arbolado';
  return copas === null ? a : `${a}, ${copas} % de copas (${fuente}, ${densidad(copas)})`;
}

/** Por qué esta celda, en una línea con los factores reales del modelo. */
export function razonCelda(v: ValoresCelda): string {
  return [`${v.idon}/100`, textoArbol(v), textoLadera(v.orient, v.pend), textoHumedad(v.humedad, v.cauce_m, v.cauceTope)]
    .filter(Boolean).join(' · ');
}

/** «Zona buena más cercana: 180 m al noreste». */
export const textoHacia = (dist_m: number, r: number) => `${Math.round(dist_m / 10) * 10} m al ${cardinal(r)}`;
