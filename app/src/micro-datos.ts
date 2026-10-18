// Carga de micro.json / micro.bin (Modo campo). Orden como acceso-datos.ts: archivo descargado en OPFS (Blob.slice) →
// HTTP con Range. Cada tesela es un bloque gzip independiente: se lee y se descomprime solo lo que hace falta para
// el radio alrededor de tu posición (2–4 teselas de 3,2 km), y se guarda en memoria.
import { baseDatos, cargarJson } from './datos';
import { archivoOpfs } from './opfs';
import { descomprimir, lectorBlob, type Lector } from './acceso';
import { celdaMicro, celdasEnRadio, claveTesela, leerCelda, parsearCabeceraMicro, RADIO_M, situar, teselaDe,
  type CabeceraMicro, type ValoresCelda } from './micro';
import type { Manifest } from './tipos';

export interface DatosMicro {
  cab: CabeceraMicro;
  /** Bloque descomprimido de la tesela (null si no está en el índice: sin hábitat). */
  tesela(ft: number, ct: number): Promise<Uint8Array | null>;
  estado: { origen: 'opfs' | 'http'; teselas: number; bytes: number };
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

let cache: Promise<DatosMicro | null> | null = null;

/** null si el manifest no trae micro o faltan los archivos. Se cachea por sesión. */
export function datosMicro(m: Manifest): Promise<DatosMicro | null> {
  cache ??= cargar(m).catch((e) => { cache = null; throw e; });
  return cache;
}

async function cargar(m: Manifest): Promise<DatosMicro | null> {
  if (!m.micro) return null;
  const j = await cargarJson<unknown>(m.micro.cabecera);
  if (!j) return null;
  const cab = parsearCabeceraMicro(j);
  const f = await archivoOpfs(m.micro.datos);
  const estado: DatosMicro['estado'] = { origen: f ? 'opfs' : 'http', teselas: 0, bytes: 0 };
  const lector = f ? lectorBlob(f) : lectorHttp(baseDatos() + m.micro.datos);
  const teselas = new Map<string, Promise<Uint8Array | null>>();
  const n = cab.capas.length * cab.tesela * cab.tesela;
  return {
    cab, estado,
    tesela(ft, ct) {
      const k = claveTesela(ft, ct);
      let p = teselas.get(k);
      if (!p) {
        const e = cab.indice.get(k);
        p = !e ? Promise.resolve(null) : (async () => {
          const b = await lector.leer(e[0], e[1]);
          if (b.byteLength !== e[1]) throw new Error(`micro.bin: ${b.byteLength} de ${e[1]} bytes`);
          const u = new Uint8Array(await (await descomprimir(new Blob([b]).stream())).arrayBuffer());
          if (u.length !== n) throw new Error(`micro.bin: tesela ${k} con ${u.length} bytes`);
          estado.teselas++; estado.bytes += e[1];
          return u;
        })();
        p.catch(() => teselas.delete(k));
        teselas.set(k, p);
      }
      return p;
    },
  };
}

/** Celdas a ≤ radio de `pos` con sus factores para `especie` (las de teselas sin hábitat salen con idoneidad 0). */
export async function celdasAlrededor(d: DatosMicro, pos: { lat: number; lon: number }, especie: string, radio = RADIO_M): Promise<ValoresCelda[]> {
  const cs = celdasEnRadio(d.cab, pos.lat, pos.lon, radio);
  const out: ValoresCelda[] = [];
  for (const c of cs) {
    const { ft, ct } = teselaDe(d.cab, c);
    const b = await d.tesela(ft, ct);
    out.push(situar(d.cab, leerCelda(d.cab, b, c, especie), pos));
  }
  return out;
}

/** La celda donde estás (null fuera de la malla). */
export async function celdaAqui(d: DatosMicro, pos: { lat: number; lon: number }, especie: string): Promise<ValoresCelda | null> {
  const c = celdaMicro(d.cab, pos.lat, pos.lon);
  if (!c) return null;
  const { ft, ct } = teselaDe(d.cab, c);
  return situar(d.cab, leerCelda(d.cab, await d.tesela(ft, ct), c, especie), pos);
}
