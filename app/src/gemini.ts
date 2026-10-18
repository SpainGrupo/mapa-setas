// Reconocimiento en línea: Worker de Cloudflare → Gemini (contrato en worker/README.md y worker/src/validar.ts).
// Con conexión es la primera opinión; el modelo local (ONNX) es el respaldo sin conexión y el contraste.
// La respuesta se presenta con la misma regla de seguridad: sus «peligrosas_posibles» se suman (unión) a las
// peligrosas locales no descartadas, y cualquier texto que diga «comestible» se neutraliza.
import { sinComestible, type CandidatoMin, type Peligrosa } from './seguridad';
import { genero } from './reconocer-nucleo';
import { IDS_CCAA, type IdCcaa } from './manifest-region';

/** Comunidades que conoce el Worker (worker/src/ccaa.ts, NOMBRE_CCAA). */
export const CCAA_GEMINI: readonly IdCcaa[] = IDS_CCAA;
/** La del punto si se conoce; si no, la primera de la región. 'andalucia' es el valor por defecto del Worker → null
 * (no se envía): así la petición de Marbella es la de siempre y la app funciona con el Worker anterior. */
export function elegirCcaaGemini(idsPunto: string[] | null, idsRegion: string[]): IdCcaa | null {
  const conocida = (ids: string[] | null) => ids?.find((i): i is IdCcaa => (CCAA_GEMINI as readonly string[]).includes(i)) ?? null;
  const c = conocida(idsPunto) ?? conocida(idsRegion);
  return c === 'andalucia' ? null : c;
}

/** URL del Worker fijada en el build (VITE_WORKER_URL). En e2e (?e2e=1) se puede sustituir desde localStorage. */
export function urlWorker(env: string | undefined, e2e: boolean, ls: Pick<Storage, 'getItem'> | null): string {
  const u = (env ?? '').trim() || (e2e ? ls?.getItem('setas:e2e-worker-url') ?? '' : '');
  return /^https?:\/\//.test(u) ? u : '';
}

export interface CandidatoGemini {
  nombre_cientifico: string; nombre_comun?: string; confianza: 'baja' | 'media' | 'alta';
  rasgos_observados: string[]; rasgos_que_faltan_ver: string[];
}
export interface RespuestaGemini {
  candidatos: CandidatoGemini[];
  peligrosas_posibles: { nombre_cientifico: string; motivo: string }[];
  fotos_recomendadas: string[];
  aviso: string;
}
export interface PeticionGemini {
  fotos: string[];
  respuestas_guiadas: Record<string, string | null>;
  contexto: { fecha?: string; lat?: number; lon?: number; altitud?: number; arbol?: string; suelo?: string; ccaa?: IdCcaa };
  candidatos_offline: { id: string; nombre: string; score: number }[];
}

/** Lado mayor de la foto que se envía (JPEG): de sobra para Gemini y muy por debajo del límite del Worker. */
export const MAX_LADO = 1024;
export const CALIDAD = 0.8;
export const MAX_BYTES_FOTO = 1.5 * 1024 * 1024;

/** Espera máxima de la app (el Worker corta a Gemini a los 30 s; Gemini suele tardar 10-20 s). */
export const TIEMPO_MAX_MS = 45_000;

/** Mensajes en castellano para los errores del Worker. `detalle`: el mensaje del Worker, para los casos no previstos. */
export function mensajeError(estado: number, codigo?: string, detalle?: string): string {
  if (estado === 403) return 'Esta copia de la app no está autorizada para consultar a Gemini (origen no permitido).';
  if (estado === 413) return 'Las fotos pesan demasiado para Gemini. Prueba con menos fotos.';
  if (estado === 429) return codigo === 'limite_global_superado'
    ? 'Hoy se ha agotado el cupo total de consultas a Gemini. Prueba mañana.'
    : 'Has llegado al límite diario de consultas a Gemini. Prueba mañana.';
  if (estado === 503) return 'Gemini está saturado o no disponible ahora. Prueba en unos minutos.';
  if (estado === 504) return 'Gemini ha tardado demasiado. Prueba otra vez.';
  if (estado === 422) return 'Gemini ha rechazado las fotos. Prueba con otras fotos de la seta.';
  if (estado === 400) return `La petición a Gemini no es válida${detalle ? ` (${detalle.slice(0, 120)})` : ''}. Prueba con otras fotos.`;
  if (estado === 0) return 'No se pudo conectar con Gemini. Comprueba la conexión.';
  if (estado === -1) return `Gemini no ha respondido en ${Math.round(TIEMPO_MAX_MS / 1000)} s. Prueba otra vez con cobertura.`;
  return `La consulta a Gemini ha fallado (error ${estado}${codigo ? `, ${codigo}` : ''}). Prueba más tarde.`;
}

/** Error de la consulta a Gemini con el estado HTTP (0: sin red; -1: tiempo agotado) y el código del Worker. */
export class ErrorGemini extends Error {
  constructor(public estado: number, public codigo?: string, detalle?: string) {
    super(mensajeError(estado, codigo, detalle));
  }
}

const binomio = (n: string) => n.trim().split(/\s+/).slice(0, 2).join(' ').toLowerCase();

/** Valida la forma mínima y limpia los textos (nunca «comestible»). */
export function limpiarRespuesta(r: unknown): RespuestaGemini {
  const o = (r ?? {}) as Partial<RespuestaGemini>;
  const txt = (v: unknown) => sinComestible(String(v ?? '')).slice(0, 300);
  const lista = (v: unknown) => (Array.isArray(v) ? v.map(txt).filter(Boolean) : []);
  return {
    candidatos: (Array.isArray(o.candidatos) ? o.candidatos : []).slice(0, 5).map((c) => ({
      nombre_cientifico: txt(c?.nombre_cientifico), nombre_comun: c?.nombre_comun ? txt(c.nombre_comun) : undefined,
      confianza: (['baja', 'media', 'alta'] as const).includes(c?.confianza) ? c.confianza : 'baja',
      rasgos_observados: lista(c?.rasgos_observados), rasgos_que_faltan_ver: lista(c?.rasgos_que_faltan_ver),
    })).filter((c) => c.nombre_cientifico),
    peligrosas_posibles: (Array.isArray(o.peligrosas_posibles) ? o.peligrosas_posibles : [])
      .map((p) => ({ nombre_cientifico: txt(p?.nombre_cientifico), motivo: txt(p?.motivo) })).filter((p) => p.nombre_cientifico),
    fotos_recomendadas: lista(o.fotos_recomendadas),
    aviso: 'No consumas ninguna seta sin la confirmación de un experto.',
  };
}

export interface FichaNombre { id: string; nombre_cientifico: string; grupo: string }
export interface PeligrosaFusionada {
  id?: string;               // ficha de la guía, si la hay
  nombre: string;
  nivel: 'mortal' | 'toxica' | 'desconocido';
  alerta: boolean;
  motivos: string[];
  /** Doble relevante para los candidatos (o señalado por Gemini); false: mortal que solo sale por si el reconocimiento falla. */
  relevante: boolean;
  /** Motivo que da Gemini, si la señala (sirve como rasgo que la distingue cuando no hay ficha). */
  motivoGemini?: string;
}

/**
 * Binomios que nombra una ficha: el suyo y los que incluye («(incluye G. gigas)», «y C. brunneum», «(= B. aestivalis)»,
 * «(Index Fungorum: Collybia nuda)»), con el género abreviado desarrollado. Así una segunda opinión que diga
 * «Gyromitra gigas» se reconoce como la ficha mortal de Gyromitra y no como «desconocida».
 */
export function binomiosDeFicha(nombre: string): string[] {
  const genero = nombre.split(/\s+/)[0];
  const out = [binomio(nombre)];
  for (const m of nombre.matchAll(/\b([A-Z][a-z]+|[A-Z]\.)\s([a-z]{3,})\b/g))
    out.push(binomio(`${m[1].endsWith('.') && genero.startsWith(m[1][0]) ? genero : m[1]} ${m[2]}`));
  return [...new Set(out)];
}

/**
 * Unión de las peligrosas locales NO descartadas y las que señala Gemini. Si Gemini señala una especie que las
 * respuestas locales habían descartado, vuelve a la lista (gana la cautela).
 */
export function fusionarPeligrosas(locales: Peligrosa[], remotas: RespuestaGemini['peligrosas_posibles'], fichas: FichaNombre[]): PeligrosaFusionada[] {
  const porBinomio = new Map<string, FichaNombre>();
  for (const f of fichas) for (const b of binomiosDeFicha(f.nombre_cientifico)) if (!porBinomio.has(b)) porBinomio.set(b, f);
  const porId = new Map(fichas.map((f) => [f.id, f]));
  const out = new Map<string, PeligrosaFusionada>();
  for (const p of locales) {
    if (p.descartada) continue;
    out.set(p.id, { id: p.id, nombre: porId.get(p.id)?.nombre_cientifico ?? p.id, nivel: p.nivel, alerta: p.alerta, motivos: [...p.origen],
      relevante: p.relevante !== false });
  }
  for (const r of remotas) {
    const f = porBinomio.get(binomio(r.nombre_cientifico));
    const clave = f?.id ?? `n:${binomio(r.nombre_cientifico)}`;
    const motivo = `según Gemini: ${r.motivo || 'posible confusión'}`;
    const ya = out.get(clave);
    if (ya) { ya.motivos.push(motivo); ya.relevante = true; ya.motivoGemini ??= r.motivo || undefined; continue; }
    const nivel = f?.grupo === 'mortal' ? 'mortal' : f?.grupo === 'toxica' ? 'toxica' : 'desconocido';
    out.set(clave, { id: f?.id, nombre: f?.nombre_cientifico ?? r.nombre_cientifico, nivel, alerta: false, motivos: [motivo], relevante: true,
      ...(r.motivo ? { motivoGemini: r.motivo } : {}) });
  }
  const rango = (p: PeligrosaFusionada) => ({ mortal: 0, desconocido: 1, toxica: 2 })[p.nivel];
  return [...out.values()].sort((a, b) => rango(a) - rango(b) || Number(b.alerta) - Number(a.alerta));
}

/** Petición al Worker. Lanza ErrorGemini (mensaje en castellano con el motivo real) si falla o tarda demasiado. */
export async function pedirSegundaOpinion(url: string, peticion: PeticionGemini, fetcher: typeof fetch = fetch,
  tiempoMs = TIEMPO_MAX_MS): Promise<RespuestaGemini> {
  const ctrl = new AbortController();
  let agotado = false;
  const reloj = setTimeout(() => { agotado = true; ctrl.abort(); }, tiempoMs);
  try {
    let r: Response;
    try {
      r = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(peticion), signal: ctrl.signal });
    } catch {
      throw new ErrorGemini(agotado ? -1 : 0);
    }
    if (!r.ok) {
      let codigo: string | undefined, detalle: string | undefined;
      try { const e = (await r.json())?.error; codigo = e?.codigo; detalle = e?.mensaje; } catch { /* sin cuerpo JSON */ }
      // Worker anterior a la multi-región: rechaza contexto.ccaa con 400. Se repite una vez sin ella (prompt por defecto).
      if (r.status === 400 && peticion.contexto.ccaa) {
        const { ccaa: _, ...contexto } = peticion.contexto;
        clearTimeout(reloj);
        return pedirSegundaOpinion(url, { ...peticion, contexto }, fetcher, tiempoMs);
      }
      throw new ErrorGemini(r.status, codigo, detalle);
    }
    try {
      return limpiarRespuesta(await r.json());
    } catch (e) {
      if (e instanceof ErrorGemini) throw e;
      throw new ErrorGemini(agotado ? -1 : 502, 'respuesta_invalida');
    }
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Candidatos de Gemini en la forma que entiende la capa de seguridad: con la ficha de la guía si su binomio (o uno de
 * los que incluye la ficha) coincide. Sin ficha, su género activa igualmente el grupo morfológico.
 */
export function candidatosDeGemini(r: RespuestaGemini, fichas: FichaNombre[]): (CandidatoMin & { confianza: CandidatoGemini['confianza'] })[] {
  const porBinomio = new Map<string, FichaNombre>();
  for (const f of fichas) for (const b of binomiosDeFicha(f.nombre_cientifico)) if (!porBinomio.has(b)) porBinomio.set(b, f);
  return r.candidatos.map((c) => {
    const f = porBinomio.get(binomio(c.nombre_cientifico));
    return { nombre: c.nombre_cientifico, ...(f ? { idGuia: f.id } : {}), confianza: c.confianza };
  });
}

/**
 * Contraste entre motores: hay discrepancia si el género del primer candidato de Gemini no aparece entre los del
 * modelo local. Devuelve los nombres locales para enseñarlos, o null si coinciden o falta alguno de los dos.
 */
export function discrepancia(gemini: { nombre: string }[], local: { nombre: string }[]): string[] | null {
  if (!gemini.length || !local.length) return null;
  const g = genero(gemini[0].nombre).toLowerCase();
  return local.some((c) => genero(c.nombre).toLowerCase() === g) ? null : local.slice(0, 3).map((c) => c.nombre);
}

/** Fecha local de Madrid AAAA-MM-DD. */
export const fechaHoy = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);
