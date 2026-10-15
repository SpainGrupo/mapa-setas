// Región activa (spec §4.1): índice data/regiones.json, elección inicial (GPS → la más cercana; sin GPS, se pregunta),
// claves de almacenamiento por región y base de las URLs de datos. Sin DOM salvo document.baseURI (si existe).
import { distanciaM } from './ranking';
import { mb } from './unidades';
import { punto } from './manifest-region';

export interface Punto { lat: number; lon: number }
export interface RegionIndice { id: string; nombre: string; origen: Punto; bbox: [number, number, number, number]; total_bytes: number; generado: string }
export interface Almacen { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export const CLAVE_REGION = 'setas:region';
export const CLAVE_REGIONES = 'setas:regiones';
/** Entra en URLs y en rutas de OPFS: sin barras, puntos ni mayúsculas. 'modelo' está reservado (data/modelo/). */
export const ID_REGION = /^[a-z][a-z0-9_-]{0,31}$/;
const idValido = (id: unknown): id is string => typeof id === 'string' && ID_REGION.test(id) && id !== 'modelo';
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function parsearRegiones(j: unknown): RegionIndice[] {
  if (!Array.isArray(j)) return [];
  const r: RegionIndice[] = [];
  for (const x of j) {
    const o = x as (Omit<RegionIndice, 'origen'> & { origen: unknown }) | null;
    if (!o || !idValido(o.id) || r.some((y) => y.id === o.id)) continue;
    const origen = punto(o.origen);
    if (!origen || !Array.isArray(o.bbox) || o.bbox.length !== 4 || !o.bbox.every(fin)) continue;
    r.push({ id: o.id, nombre: typeof o.nombre === 'string' && o.nombre ? o.nombre : o.id, origen,
      bbox: [o.bbox[0], o.bbox[1], o.bbox[2], o.bbox[3]], total_bytes: fin(o.total_bytes) ? o.total_bytes : 0,
      generado: typeof o.generado === 'string' ? o.generado : '' });
  }
  return r;
}

export function regionMasCercana(rs: RegionIndice[], p: Punto): RegionIndice {
  return rs.reduce((a, b) => (distanciaM(p, b.origen) < distanciaM(p, a.origen) ? b : a));
}

let activa: string | null = null;
export function establecerActiva(id: string) {
  if (!idValido(id)) throw new Error(`Id de región no válido: ${id}`);
  activa = id;
}
export const hayRegionActiva = () => activa !== null;
export function regionActiva(): string {
  if (!activa) throw new Error('Todavía no hay región activa');
  return activa;
}
export const claveRegion = (nombre: string, region = regionActiva()) => `setas:${nombre}:${region}`;
export const raizDatos = () => (typeof document !== 'undefined' ? new URL('data/', document.baseURI).href : 'data/');
export const baseDatos = (region = regionActiva()) => `${raizDatos()}${region}/`;

const leer = (a: Almacen, k: string) => { try { return a.getItem(k); } catch { return null; } };
const escribir = (a: Almacen, k: string, v: string) => { try { a.setItem(k, v); } catch { /* solo esta sesión */ } };

/** Índice de regiones: de la red (y se guarda una copia para usarlo sin conexión) o, si no hay red, la copia. */
export async function cargarRegiones(o: { fetchFn?: typeof fetch; almacen?: Almacen; raiz?: string } = {}): Promise<RegionIndice[]> {
  const almacen = o.almacen ?? localStorage;
  try {
    const r = await (o.fetchFn ?? fetch)((o.raiz ?? raizDatos()) + 'regiones.json', { cache: 'no-cache' });
    if (r.ok) {
      const rs = parsearRegiones(await r.json());
      if (rs.length) { escribir(almacen, CLAVE_REGIONES, JSON.stringify(rs)); return rs; }
    }
  } catch { /* sin red */ }
  try { return parsearRegiones(JSON.parse(leer(almacen, CLAVE_REGIONES) ?? 'null')); } catch { return []; }
}

/** Región con la que arrancar: la guardada si sigue en el índice; si no, la única, la más cercana por GPS o la que se elija. */
export async function resolverRegion(rs: RegionIndice[], o: {
  almacen: Almacen; posicion: () => Promise<Punto | null>; preguntar: (rs: RegionIndice[]) => Promise<string | null>;
}): Promise<string | null> {
  if (!rs.length) return null;
  const guardada = leer(o.almacen, CLAVE_REGION);
  if (guardada && rs.some((r) => r.id === guardada)) return guardada;
  let id: string | null;
  if (rs.length === 1) id = rs[0].id;
  else {
    const p = await o.posicion().catch(() => null);
    id = p ? regionMasCercana(rs, p).id : await o.preguntar(rs);
  }
  if (!id || !rs.some((r) => r.id === id)) id = rs[0].id;
  escribir(o.almacen, CLAVE_REGION, id);
  return id;
}

export function textoEstadoRegion(r: RegionIndice, est: { bytes: number } | null, enLinea: boolean): string {
  if (est) return `Descargada · ${mb(est.bytes)}`;
  return enLinea ? `Sin descargar · ${mb(r.total_bytes)}` : 'Sin descargar · necesita conexión';
}
