// Primer arranque tras la fase B (spec §4.3): la instalación plana de antes (solo Marbella) pasa a la disposición por
// región. Una sola vez (setas:migracion-regiones). Las dependencias se inyectan para probarla con un OPFS falso.
import type { Almacen } from './region';
import { paqueteMapas } from './opfs';

export const CLAVE_MIGRACION = 'setas:migracion-regiones';
export interface DepsMigracion {
  almacen: Almacen;
  raiz: () => Promise<FileSystemDirectoryHandle | null>;
  /** Mueve archivos sin borrar los que ya haya en el destino (migración reanudable). */
  moverArchivos: (desde: string, hacia: string, nombres: string[]) => Promise<void>;
  renombrarMeteo: (de: string, a: string) => Promise<void>;
}
export type ResultadoMigracion = 'hecha-antes' | 'sin-instalacion' | 'migrada';

const LEGADO = 'marbella';
const POR_REGION = ['capa', 'punto-meteo'];

/** Archivos (no carpetas) que hay directamente en `dir`; [] si no existe. */
async function archivosSueltos(raiz: FileSystemDirectoryHandle | null, dir: string): Promise<{ h: FileSystemDirectoryHandle | null; nombres: string[] }> {
  if (!raiz) return { h: null, nombres: [] };
  try {
    const h = await raiz.getDirectoryHandle(dir);
    const nombres: string[] = [];
    for await (const [n, e] of (h as any).entries() as AsyncIterable<[string, FileSystemHandle]>) if (e.kind === 'file') nombres.push(n);
    return { h, nombres };
  } catch { return { h: null, nombres: [] }; }
}

export async function migrarARegiones(d: DepsMigracion): Promise<ResultadoMigracion> {
  const a = d.almacen;
  if (a.getItem(CLAVE_MIGRACION) === '1') return 'hecha-antes';
  let uso = a.getItem('setas:aviso-visto') !== null;

  for (const k of POR_REGION) {
    const v = a.getItem(`setas:${k}`);
    if (v === null) continue;
    uso = true;
    if (a.getItem(`setas:${k}:${LEGADO}`) === null) a.setItem(`setas:${k}:${LEGADO}`, v);
    a.removeItem(`setas:${k}`);
  }

  const raiz = await d.raiz().catch(() => null);
  const p = paqueteMapas(LEGADO);
  const estado = a.getItem('setas:mapas-descargados');
  const mapas = await archivosSueltos(raiz, 'mapas');
  if (mapas.nombres.length && estado !== null) {
    await d.moverArchivos('mapas', p.dir, mapas.nombres);
    a.setItem(p.clave, estado);
  } else {
    for (const n of mapas.nombres) await mapas.h!.removeEntry(n).catch(() => {});
  }
  if (estado !== null || mapas.nombres.length) uso = true;
  a.removeItem('setas:mapas-descargados');

  const staging = await archivosSueltos(raiz, 'mapas-nuevo');
  for (const n of staging.nombres) await staging.h!.removeEntry(n).catch(() => {});
  if (staging.h && staging.nombres.length) await raiz!.removeEntry('mapas-nuevo').catch(() => {});   // solo si quedó vacío
  if (a.getItem('setas:mapas-nuevo-generado') !== null) { uso = true; a.removeItem('setas:mapas-nuevo-generado'); }
  if (mapas.h && mapas.nombres.length && estado === null) await raiz!.removeEntry('mapas').catch(() => {});

  await d.renombrarMeteo('datos', `datos:${LEGADO}`).catch(() => {});
  if (uso && a.getItem('setas:region') === null) a.setItem('setas:region', LEGADO);
  a.setItem(CLAVE_MIGRACION, '1');
  return uso ? 'migrada' : 'sin-instalacion';
}
