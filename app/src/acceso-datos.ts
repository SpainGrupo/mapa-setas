// Carga de los datos de acceso: cabecera y aparcamientos (JSON) y un Lector sobre acceso.bin que no carga los
// 38 MB en memoria. Orden: archivo descargado en OPFS (Blob.slice) → HTTP con Range. Si el pipeline publica
// acceso.bin.gz, se descomprime una vez con DecompressionStream a un Blob (el navegador lo puede llevar a disco)
// y se lee igual con Blob.slice.
import { baseDatos, cargarJson } from './datos';
import { archivoOpfs } from './opfs';
import { descomprimir, lectorBlob, nombreBinario, parsearCabecera, type AparcamientosCompactos, type Cabecera, type Lector } from './acceso';
import type { Manifest } from './tipos';

export interface DatosAcceso {
  cab: Cabecera;
  aparcamientos: AparcamientosCompactos;
  lector: Lector;
  /** Para el e2e y el informe: de dónde salen los bytes y cuántas lecturas se hicieron. */
  estado: { origen: 'opfs' | 'http' | 'http-completo'; gzip: boolean; lecturas: number; bytes: number };
}

/** Range HTTP; si el servidor responde 200 (sin Range) se queda el cuerpo entero y lee de él. */
function lectorHttp(url: string, estado: DatosAcceso['estado']): Lector {
  let completo: Promise<Blob> | null = null;
  return {
    async leer(o, n) {
      if (completo) return (await completo).slice(o, o + n).arrayBuffer();
      const r = await fetch(url, { headers: { Range: `bytes=${o}-${o + n - 1}` } });
      if (r.status === 206) return r.arrayBuffer();
      if (!r.ok) throw new Error(`HTTP ${r.status} al leer ${url.split('/').pop()}`);
      estado.origen = 'http-completo';
      completo = r.blob();
      return (await completo).slice(o, o + n).arrayBuffer();
    },
  };
}

let cache: Promise<DatosAcceso | null> | null = null;

/** null si el manifest no trae acceso o faltan los archivos. Se cachea por sesión (la app recarga al cambiar mapas). */
export function datosAcceso(m: Manifest): Promise<DatosAcceso | null> {
  cache ??= cargar(m).catch((e) => { cache = null; throw e; });
  return cache;
}

async function cargar(m: Manifest): Promise<DatosAcceso | null> {
  if (!m.acceso) return null;
  const [j, aparcamientos] = await Promise.all([cargarJson<unknown>(m.acceso.cabecera), cargarJson<AparcamientosCompactos>(m.acceso.aparcamientos)]);
  if (!j || !aparcamientos) return null;
  const cab = parsearCabecera(j);
  const nombre = nombreBinario(m);
  const gzip = nombre.endsWith('.gz');
  const estado: DatosAcceso['estado'] = { origen: 'opfs', gzip, lecturas: 0, bytes: 0 };
  let base: Lector;
  const f = await archivoOpfs(nombre);
  if (f) {
    base = lectorBlob(gzip ? await descomprimir(f.stream()) : f);
  } else if (gzip) {
    const r = await fetch(baseDatos() + nombre);
    if (!r.ok || !r.body) throw new Error(`HTTP ${r.status} al bajar ${nombre}`);
    estado.origen = 'http-completo';
    base = lectorBlob(await descomprimir(r.body));
  } else {
    estado.origen = 'http';
    base = lectorHttp(baseDatos() + nombre, estado);
  }
  const lector: Lector = {
    async leer(o, n) {
      if (o < 0 || o + n > cab.bytes) throw new Error('lectura fuera de acceso.bin');
      const b = await base.leer(o, n);
      if (b.byteLength !== n) throw new Error(`acceso.bin: ${b.byteLength} de ${n} bytes`);
      estado.lecturas++; estado.bytes += n;
      return b;
    },
  };
  return { cab, aparcamientos, lector, estado };
}
