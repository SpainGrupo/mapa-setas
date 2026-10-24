// «Explorar aquí» (2026-10-25): lo que sale a la red. Construye la petición de POST /explorar (contrato en
// worker/README.md §POST /explorar: solo los campos que allí figuran), la envía y valida la respuesta. Sin DOM.
//  - Privacidad: lat/lon a 2 decimales (~1 km); las fotos van re-codificadas (sin EXIF) en base64 sin prefijo. Nada de esto
//    se llama sin que el usuario pulse «Analizar» (o la cola de pendientes que él mismo dejó) ni sin URL del Worker.
//  - Sin red → 'pendiente' (se reintenta al volver la conexión). Error HTTP → 'error' con el mensaje del Worker. La
//    observación devuelta es una copia: guardarla es cosa de quien llama (analizarPendientes lo hace).
//  - Todo texto de Gemini pasa por sinComestible; valores fuera de lista, por normalizarDireccion (a 'no_se_ve').
import { normalizar } from './brujula';
import { ErrorGemini, TIEMPO_MAX_MS, mensajeError } from './gemini';
import { normalizarDireccion, type DireccionGemini, type Observacion } from './observaciones-datos';
import { guardarObservacion, listarObservaciones } from './observaciones';
import { sinComestible } from './seguridad';

export const redondear2 = (x: number) => Math.round(x * 100) / 100;
/** Rumbo entero 0–359 como lo exige el Worker. */
export const rumboEnvio = (r: number) => Math.round(normalizar(r)) % 360;

export interface ContextoAnalisis { especieNombre: string; arbolesRegion: string[] }

/** URL de /explorar a partir de la del Worker (con o sin /identificar al final). '' si no hay Worker. */
export function urlExplorar(base: string): string {
  const b = base.trim();
  if (!b) return '';
  return `${b.replace(/\/+$/, '').replace(/\/identificar$/, '')}/explorar`;
}

async function base64De(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Cuerpo de POST /explorar. Las direcciones sin foto se saltan (y su entrada de `modelo_sector`). */
export async function peticionExplorar(o: Observacion, ctx: ContextoAnalisis): Promise<{ fotos: { rumbo: number; jpeg: string }[]; contexto: Record<string, unknown> }> {
  const idx = o.direcciones.map((d, i) => (d.foto ? i : -1)).filter((i) => i >= 0);
  const fotos = await Promise.all(idx.map(async (i) => ({ rumbo: rumboEnvio(o.direcciones[i].rumbo), jpeg: await base64De(o.direcciones[i].foto!) })));
  const alt = o.altModelo ?? o.altGps;
  const contexto: Record<string, unknown> = {
    ...(o.especie ? { especie: o.especie } : {}),
    ...(ctx.especieNombre ? { especie_nombre: ctx.especieNombre } : {}),
    mes: new Date(o.t).getMonth() + 1,
    altitud: alt === null ? null : Math.round(alt),
    lat: redondear2(o.lat), lon: redondear2(o.lon),
    ...(ctx.arbolesRegion.length ? { arboles_region: ctx.arbolesRegion } : {}),
    modelo_sector: idx.map((i) => o.modeloSector[i] ?? null),
  };
  return { fotos, contexto };
}

/** Una dirección por rumbo enviado y en su orden; lanza si la respuesta no cumple. */
export function validarRespuestaExplorar(x: unknown, rumbos: number[]): DireccionGemini[] {
  const lista = (x as { direcciones?: unknown } | null)?.direcciones;
  if (!Array.isArray(lista) || lista.length !== rumbos.length) throw new Error('El análisis no devuelve una dirección por foto.');
  return lista.map((d, i) => {
    const n = normalizarDireccion(d);
    if (!n || n.rumbo !== rumbos[i]) throw new Error(`El análisis no encaja con la foto ${i + 1}.`);
    return { ...n, notas: sinComestible(n.notas) };
  });
}

/** Mensaje en castellano; los 429 y 400 llevan el del Worker (habla de «barridos», no de reconocimientos). */
function mensajeHttp(estado: number, codigo?: string, detalle?: string): string {
  if (estado === 429) return sinComestible(detalle || 'Has llegado al límite de barridos de hoy. Prueba mañana.');
  if (estado === 422) return 'Gemini ha rechazado las fotos de este barrido. Prueba con otro.';
  if (estado === 400) return `El barrido no es válido${detalle ? ` (${sinComestible(detalle).slice(0, 120)})` : ''}.`;
  return mensajeError(estado, codigo, detalle);
}

const conEstado = (o: Observacion, estado: Observacion['estado'], error: string | null, direcciones = o.direcciones): Observacion => ({ ...o, estado, error, direcciones });

/** Envía el barrido. Éxito → 'analizada'; sin red o sin Worker → 'pendiente'; fallo del Worker → 'error' con su mensaje. */
export async function analizar(o: Observacion, ctx: ContextoAnalisis, url: string, f: typeof fetch = fetch, tiempoMs = TIEMPO_MAX_MS): Promise<Observacion> {
  if (!o.direcciones.some((d) => d.foto)) return conEstado(o, 'error', 'Este barrido no tiene fotos que analizar.');
  if (!url) return conEstado(o, 'pendiente', null);
  const idx = o.direcciones.map((d, i) => (d.foto ? i : -1)).filter((i) => i >= 0);
  const ctrl = new AbortController();
  let agotado = false;
  const reloj = setTimeout(() => { agotado = true; ctrl.abort(); }, tiempoMs);
  try {
    const cuerpo = await peticionExplorar(o, ctx);
    let r: Response;
    try {
      r = await f(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), signal: ctrl.signal });
    } catch {
      return agotado ? conEstado(o, 'error', new ErrorGemini(-1).message) : conEstado(o, 'pendiente', null);
    }
    if (!r.ok) {
      let codigo: string | undefined, detalle: string | undefined;
      try { const e = (await r.json())?.error; codigo = e?.codigo; detalle = e?.mensaje; } catch { /* sin cuerpo JSON */ }
      return conEstado(o, 'error', mensajeHttp(r.status, codigo, detalle));
    }
    let dirs: DireccionGemini[];
    try {
      dirs = validarRespuestaExplorar(await r.json(), cuerpo.fotos.map((x) => x.rumbo));
    } catch {
      return conEstado(o, 'error', 'La respuesta del análisis no es válida. Prueba otra vez.');
    }
    const direcciones = o.direcciones.map((d, i) => {
      const k = idx.indexOf(i);
      return k < 0 ? d : { ...d, analisis: dirs[k] };
    });
    return conEstado(o, 'analizada', null, direcciones);
  } finally {
    clearTimeout(reloj);
  }
}

export interface AlmacenObservaciones { listar: () => Promise<Observacion[]>; guardar: (o: Observacion) => Promise<unknown> }
const ALMACEN: AlmacenObservaciones = { listar: listarObservaciones, guardar: guardarObservacion };

/** Analiza las observaciones 'pendiente' (al volver la conexión y al abrir Explorar). Devuelve cuántas quedaron analizadas. */
export async function analizarPendientes(contextoDe: (o: Observacion) => ContextoAnalisis, url: string, f: typeof fetch = fetch, almacen: AlmacenObservaciones = ALMACEN): Promise<number> {
  if (!url) return 0;
  let hechas = 0;
  for (const o of (await almacen.listar()).filter((x) => x.estado === 'pendiente')) {
    const r = await analizar(o, contextoDe(o), url, f);
    await almacen.guardar(r);
    if (r.estado === 'analizada') hechas++;
    else if (r.estado === 'pendiente') break; // sigue sin red: no se insiste con las demás
  }
  return hechas;
}
