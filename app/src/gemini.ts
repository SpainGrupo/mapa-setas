// Segunda opinión con cobertura: Worker de Cloudflare → Gemini (contrato en worker/README.md y worker/src/validar.ts).
// La respuesta se presenta con la misma regla de seguridad: sus «peligrosas_posibles» se suman (unión) a las
// peligrosas locales no descartadas, y cualquier texto que diga «comestible» se neutraliza.
import { sinComestible, type Peligrosa } from './seguridad';
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

export const MAX_LADO = 1280;
export const CALIDAD = 0.8;
export const MAX_BYTES_FOTO = 1.5 * 1024 * 1024;

/** Mensajes en castellano para los errores del Worker. */
export function mensajeError(estado: number, codigo?: string): string {
  if (estado === 403) return 'Esta copia de la app no está autorizada para pedir la segunda opinión (origen no permitido).';
  if (estado === 413) return 'Las fotos pesan demasiado para la segunda opinión. Prueba con menos fotos.';
  if (estado === 429) return codigo === 'limite_global_superado'
    ? 'Hoy se ha agotado el cupo total de segundas opiniones. Prueba mañana.'
    : 'Has llegado al límite diario de segundas opiniones. Prueba mañana.';
  if (estado === 503) return 'El servicio de segunda opinión está saturado o no disponible ahora. Prueba en unos minutos.';
  if (estado === 504) return 'La segunda opinión ha tardado demasiado. Prueba otra vez.';
  if (estado === 422) return 'El servicio ha rechazado las fotos. Prueba con otras fotos de la seta.';
  if (estado === 400) return 'La petición no es válida. Prueba con otras fotos.';
  if (estado === 0) return 'No se pudo conectar con el servicio de segunda opinión. Comprueba la conexión.';
  return `La segunda opinión ha fallado (error ${estado}). Prueba más tarde.`;
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
}

/**
 * Unión de las peligrosas locales NO descartadas y las que señala Gemini. Si Gemini señala una especie que las
 * respuestas locales habían descartado, vuelve a la lista (gana la cautela).
 */
export function fusionarPeligrosas(locales: Peligrosa[], remotas: RespuestaGemini['peligrosas_posibles'], fichas: FichaNombre[]): PeligrosaFusionada[] {
  const porBinomio = new Map(fichas.map((f) => [binomio(f.nombre_cientifico), f]));
  const porId = new Map(fichas.map((f) => [f.id, f]));
  const out = new Map<string, PeligrosaFusionada>();
  for (const p of locales) {
    if (p.descartada) continue;
    out.set(p.id, { id: p.id, nombre: porId.get(p.id)?.nombre_cientifico ?? p.id, nivel: p.nivel, alerta: p.alerta, motivos: [...p.origen] });
  }
  for (const r of remotas) {
    const f = porBinomio.get(binomio(r.nombre_cientifico));
    const clave = f?.id ?? `n:${binomio(r.nombre_cientifico)}`;
    const motivo = `segunda opinión: ${r.motivo || 'posible confusión'}`;
    const ya = out.get(clave);
    if (ya) { ya.motivos.push(motivo); continue; }
    const nivel = f?.grupo === 'mortal' ? 'mortal' : f?.grupo === 'toxica' ? 'toxica' : 'desconocido';
    out.set(clave, { id: f?.id, nombre: f?.nombre_cientifico ?? r.nombre_cientifico, nivel, alerta: false, motivos: [motivo] });
  }
  const rango = (p: PeligrosaFusionada) => ({ mortal: 0, desconocido: 1, toxica: 2 })[p.nivel];
  return [...out.values()].sort((a, b) => rango(a) - rango(b) || Number(b.alerta) - Number(a.alerta));
}

/** Petición al Worker. Lanza Error con el mensaje en castellano si falla. */
export async function pedirSegundaOpinion(url: string, peticion: PeticionGemini, fetcher: typeof fetch = fetch): Promise<RespuestaGemini> {
  let r: Response;
  try {
    r = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(peticion) });
  } catch {
    throw new Error(mensajeError(0));
  }
  if (!r.ok) {
    let codigo: string | undefined;
    try { codigo = (await r.json())?.error?.codigo; } catch { /* sin cuerpo JSON */ }
    // Worker anterior a la multi-región: rechaza contexto.ccaa con 400. Se repite una vez sin ella (prompt por defecto).
    if (r.status === 400 && peticion.contexto.ccaa) {
      const { ccaa: _, ...contexto } = peticion.contexto;
      return pedirSegundaOpinion(url, { ...peticion, contexto }, fetcher);
    }
    throw new Error(mensajeError(r.status, codigo));
  }
  return limpiarRespuesta(await r.json());
}

/** Fecha local de Madrid AAAA-MM-DD. */
export const fechaHoy = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d);
