// Carga de las cotas para la ruta a pie del Modo campo. Como micro-datos.ts: archivo descargado en OPFS (Blob.slice) →
// HTTP con Range; cada tesela es un bloque gzip independiente que se lee y descomprime solo si hace falta.
// Respaldo: si la región no publica mdt_campo (manifest antiguo), la altitud de 100 m de acceso.bin (versión 2).
import { baseDatos, cargarJson } from './datos';
import { archivoOpfs } from './opfs';
import { altitudes, descomprimir, lectorBlob, type Lector } from './acceso';
import { datosAcceso } from './acceso-datos';
import { componerRejilla, decodificarTesela, parsearCabeceraMdt, teselasVentana, ventanaGlobal, type CabeceraMdt, type Rejilla } from './mdt';
import type { Manifest } from './tipos';

export interface Cotas {
  rejilla: Rejilla;
  /** 'mdt25': MDT25 del IGN a 25 m; 'acceso100': altitud de 100 m de acceso.bin (respaldo). */
  fuente: 'mdt25' | 'acceso100';
}

function lectorHttp(url: string): Lector {
  let completo: Promise<Blob> | null = null;
  return {
    async leer(o, n) {
      if (completo) return (await completo).slice(o, o + n).arrayBuffer();
      const r = await fetch(url, { headers: { Range: `bytes=${o}-${o + n - 1}` } });
      if (r.status === 206) return r.arrayBuffer();
      if (!r.ok) throw new Error(`HTTP ${r.status} al leer ${url.split('/').pop()}`);
      completo = r.blob();
      return (await completo).slice(o, o + n).arrayBuffer();
    },
  };
}

interface DatosMdt { cab: CabeceraMdt; tesela(ft: number, ct: number): Promise<Uint16Array | null>; estado: { origen: 'opfs' | 'http'; teselas: number } }
let cache: Promise<DatosMdt | null> | null = null;

function datosMdt(m: Manifest): Promise<DatosMdt | null> {
  cache ??= cargar(m).catch((e) => { cache = null; throw e; });
  return cache;
}

async function cargar(m: Manifest): Promise<DatosMdt | null> {
  if (!m.mdt_campo) return null;
  const j = await cargarJson<unknown>(m.mdt_campo.cabecera);
  if (!j) return null;
  const cab = parsearCabeceraMdt(j);
  const f = await archivoOpfs(m.mdt_campo.datos);
  const estado: DatosMdt['estado'] = { origen: f ? 'opfs' : 'http', teselas: 0 };
  const lector = f ? lectorBlob(f) : lectorHttp(baseDatos() + m.mdt_campo.datos);
  const teselas = new Map<string, Promise<Uint16Array | null>>();
  return {
    cab, estado,
    tesela(ft, ct) {
      const k = `${ft},${ct}`;
      let p = teselas.get(k);
      if (!p) {
        const e = cab.indice.get(k);
        p = !e ? Promise.resolve(null) : (async () => {
          const b = await lector.leer(e[0], e[1]);
          if (b.byteLength !== e[1]) throw new Error(`mdt_campo.bin: ${b.byteLength} de ${e[1]} bytes`);
          const u = new Uint8Array(await (await descomprimir(new Blob([b]).stream())).arrayBuffer());
          estado.teselas++;
          return decodificarTesela(u, cab.tesela);
        })();
        p.catch(() => teselas.delete(k));
        teselas.set(k, p);
      }
      return p;
    },
  };
}

/** Rejilla de cotas del rectángulo UTM, de 25 m si la región la tiene y si no de 100 m; null sin ninguna. */
export async function cotasEn(m: Manifest, caja: [number, number, number, number]): Promise<Cotas | null> {
  const d = await datosMdt(m).catch((e) => { console.warn('mdt_campo', e); return null; });
  if (d) {
    const v = ventanaGlobal(d.cab, ...caja);
    const ts = teselasVentana(d.cab.tesela, v);
    const bloques = new Map<string, Uint16Array | null>();
    for (const [ft, ct] of ts) bloques.set(`${ft},${ct}`, await d.tesela(ft, ct));
    const rejilla = componerRejilla(d.cab, v, (ft, ct) => bloques.get(`${ft},${ct}`) ?? null);
    if (rejilla.alt.some(Number.isFinite)) return { rejilla, fuente: 'mdt25' };
  }
  const a = await datosAcceso(m).catch(() => null);
  if (!a?.cab.altitud) return null;
  const v = ventanaGlobal(a.cab, ...caja);
  const celdas = [];
  for (let f = v.f0; f < v.f1; f++) for (let c = v.c0; c < v.c1; c++) celdas.push({ fila: f, col: c });
  const alts = await altitudes(a.cab, a.lector, celdas);
  const ancho = v.c1 - v.c0, alto = v.f1 - v.f0;
  const rejilla: Rejilla = { res: a.cab.res, x0: a.cab.x0 + v.c0 * a.cab.res, y1: a.cab.y1 - v.f0 * a.cab.res, ancho, alto,
    alt: Float32Array.from(alts) };
  return rejilla.alt.some(Number.isFinite) ? { rejilla, fuente: 'acceso100' } : null;
}

/** Para el e2e: teselas de mdt_campo.bin leídas. */
export async function estadoMdt(m: Manifest) { const d = await datosMdt(m).catch(() => null); return d ? { ...d.estado } : null; }
