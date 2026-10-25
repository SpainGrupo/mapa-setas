// Bucle del cliente del chat «Pregunta a Claude» (spec docs/specs/2026-10-20-pregunta-a-claude-design.md §2, §3 y §7).
// Puro y sin DOM: el fetch, las herramientas y el contexto entran por `EntornoChat`.
//
// Contrato con el Worker: POST {URL}/chat con { messages } en formato Messages API (alterna user/assistant, empieza y
// acaba en user). Respuesta 200: { content, stop_reason, texto (ya filtrado: es lo que se enseña), aviso }.
// El historial es append-only: cada `content` del asistente se guarda TAL CUAL llega (con su razonamiento, sin
// filtrar ni reordenar) y se reenvía igual. Si una consulta falla a medias se descarta ENTERA (nunca queda un
// mensaje del asistente con un tool_use sin su resultado, que la API rechazaría).
import { createStore, del, get, set } from 'idb-keyval';
import type { AccionChat, ResultadoHerramienta, Tarjeta } from './chat-herramientas';
import type { Dificultad } from './ruta';
import type { Estado } from './semaforo';

export const MAX_RONDAS = 6;
export const MAX_TARJETAS = 10;
export const TIEMPO_MAX_MS = 120_000;
export const AVISO_CHAT = 'No consumas ninguna seta sin la confirmación de un experto.';
export const MENSAJE_RECHAZO = 'No puedo responder a eso; prueba a reformularlo.';
export const MENSAJE_SIN_CONEXION = 'Necesita conexión.';

export type Bloque = { type: string; [k: string]: unknown };
export interface MensajeApi { role: 'user' | 'assistant'; content: string | Bloque[] }

/** Lo que se enseña de cada mensaje (la API solo recibe `mensajes`). */
export type Turno =
  | { rol: 'usuario'; texto: string }
  | { rol: 'asistente'; texto: string; tarjetas: Tarjeta[]; acciones: AccionChat[]; cortado?: boolean };

export interface Conversacion {
  mensajes: MensajeApi[];
  turnos: Turno[];
  /** Consultas que le quedan hoy (cabecera X-Restantes-Hoy), si se sabe. */
  restantes: number | null;
}
export const conversacionNueva = (): Conversacion => ({ mensajes: [], turnos: [], restantes: null });

// ---------------------------------------------------------------- contexto compacto (§3)

export interface DatosContexto {
  fecha: string;
  hora: string;
  region: string;
  posicion: { lat: number; lon: number } | null;
  pestana: string;
  /** Día elegido en Hoy, relativo a hoy: 0 = hoy. */
  diaElegido: number | null;
  filtro: string;
  soloPublicos: boolean;
  maxDificultad: Dificultad | null;
  topVisible: { id: string; puntuacion: number; estado: Estado }[];
  enLinea: boolean;
}

export interface ContextoApp {
  fecha: string; hora: string; region: string;
  posicion: { lat: number; lon: number; precision_m: number } | null;
  pestana: string; dia_elegido: string | null; filtro: string;
  solo_publicos: boolean; max_dificultad: Dificultad | null;
  top_visible: { id: string; puntuacion: number; estado: Estado }[];
  en_linea: boolean;
}

/** La posición va a Claude redondeada a 0,01° (~1 km); la exacta solo la usa la app en local. */
export const redondear01 = (v: number) => Math.round(v * 100) / 100;
export const PRECISION_POSICION_M = 1000;
export const MAX_TOP_CONTEXTO = 10;

export function construirContexto(d: DatosContexto): ContextoApp {
  return {
    fecha: d.fecha, hora: d.hora, region: d.region,
    posicion: d.posicion ? { lat: redondear01(d.posicion.lat), lon: redondear01(d.posicion.lon), precision_m: PRECISION_POSICION_M } : null,
    pestana: d.pestana,
    dia_elegido: d.diaElegido === null ? null : d.diaElegido === 0 ? 'hoy' : `${d.diaElegido > 0 ? '+' : ''}${d.diaElegido}`,
    filtro: d.filtro, solo_publicos: d.soloPublicos, max_dificultad: d.maxDificultad,
    top_visible: d.topVisible.slice(0, MAX_TOP_CONTEXTO), en_linea: d.enLinea,
  };
}

/** Hora local de Madrid, «09:50». */
export function horaMadrid(d: Date): string {
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
}

/** Mensaje del usuario: el contexto como bloque de texto delante de su pregunta. */
export function mensajeUsuario(contexto: ContextoApp, texto: string): MensajeApi {
  return { role: 'user', content: [
    { type: 'text', text: `<contexto_app>${JSON.stringify(contexto)}</contexto_app>` },
    { type: 'text', text: texto },
  ] };
}

// ---------------------------------------------------------------- URL del Worker

/** La URL del Worker puede venir con la ruta de Gemini (…/identificar): el chat vive en /chat. */
export function urlChat(urlWorker: string): string {
  const base = urlWorker.trim().replace(/\/+$/, '').replace(/\/identificar$/, '');
  return `${base}/chat`;
}

// ---------------------------------------------------------------- envío

export interface EntornoChat {
  /** URL completa de POST /chat. */
  url: string;
  fetcher?: typeof fetch;
  enLinea: () => boolean;
  /** Contexto de la app en este momento (se llama una vez por pregunta del usuario). */
  contexto: () => ContextoApp;
  ejecutar: (nombre: string, entrada: unknown) => Promise<ResultadoHerramienta>;
  alProgreso?: (fase: 'pensando' | 'herramientas', nombres?: string[]) => void;
  tiempoMs?: number;
}

export type SalidaEnvio =
  | { ok: true; turno: Extract<Turno, { rol: 'asistente' }> }
  | { ok: false; error: string; codigo?: string; status?: number };

interface RespuestaWorker { content: Bloque[]; stop_reason: string; texto: string; aviso?: string }

const MENSAJE_NO_ACTIVADO = 'El asistente no está activado todavía.';
const MENSAJE_HTTP: Record<number, string> = {
  400: 'La consulta no es válida. Empieza una conversación nueva.',
  403: 'Esta copia de la app no puede usar el chat.',
  429: 'Has llegado al límite de consultas. Vuelve a probar más tarde.',
  404: MENSAJE_NO_ACTIVADO,
  500: 'El chat no está configurado todavía.',
  502: 'Claude ha fallado. Inténtalo de nuevo en un momento.',
  503: 'El chat no está disponible ahora mismo. Inténtalo de nuevo en un momento.',
  504: 'Claude ha tardado demasiado. Inténtalo de nuevo.',
};

class ErrorEnvio extends Error {
  constructor(mensaje: string, readonly codigo?: string, readonly status?: number) { super(mensaje); }
}

async function llamar(env: EntornoChat, mensajes: MensajeApi[]): Promise<{ r: RespuestaWorker; restantes: number | null }> {
  const ctrl = new AbortController();
  let agotado = false;
  const reloj = setTimeout(() => { agotado = true; ctrl.abort(); }, env.tiempoMs ?? TIEMPO_MAX_MS);
  try {
    let res: Response;
    try {
      res = await (env.fetcher ?? fetch)(env.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: mensajes }), signal: ctrl.signal });
    } catch {
      throw new ErrorEnvio(agotado ? MENSAJE_HTTP[504] : 'No se pudo conectar con el chat. Comprueba la conexión e inténtalo de nuevo.', agotado ? 'tiempo_agotado' : 'sin_red');
    }
    if (!res.ok) {
      let codigo: string | undefined, mensaje: string | undefined;
      try { const e = (await res.json())?.error; codigo = typeof e?.codigo === 'string' ? e.codigo : undefined; mensaje = typeof e?.mensaje === 'string' ? e.mensaje : undefined; } catch { /* sin cuerpo JSON */ }
      throw new ErrorEnvio(res.status === 404 ? MENSAJE_NO_ACTIVADO : mensaje || MENSAJE_HTTP[res.status] || `El chat devolvió un error (${res.status}).`, codigo, res.status);
    }
    let j: unknown;
    try { j = await res.json(); } catch { throw new ErrorEnvio('El chat devolvió una respuesta ilegible.', 'respuesta_invalida', 502); }
    const o = j as Partial<RespuestaWorker> | null;
    if (!o || !Array.isArray(o.content) || typeof o.stop_reason !== 'string') throw new ErrorEnvio('El chat devolvió una respuesta inesperada.', 'respuesta_invalida', 502);
    const cab = res.headers.get('X-Restantes-Hoy');
    const n = cab === null || cab.trim() === '' ? NaN : Number(cab);
    return { r: { content: o.content as Bloque[], stop_reason: o.stop_reason, texto: typeof o.texto === 'string' ? o.texto : '', aviso: o.aviso }, restantes: Number.isFinite(n) ? Math.max(0, Math.round(n)) : null };
  } finally {
    clearTimeout(reloj);
  }
}

const usosDe = (c: Bloque[]) => c.filter((b) => b.type === 'tool_use') as (Bloque & { id: string; name: string; input: unknown })[];

/**
 * Envía la pregunta y resuelve las rondas de herramientas hasta la respuesta final (máximo MAX_RONDAS).
 * Si sale bien, añade a `conv` los mensajes y turnos de la consulta; si falla, `conv` queda como estaba.
 */
export async function enviar(conv: Conversacion, texto: string, env: EntornoChat): Promise<SalidaEnvio> {
  const pregunta = texto.trim();
  if (!pregunta) return { ok: false, error: 'Escribe una pregunta.', codigo: 'vacio' };
  if (!env.enLinea()) return { ok: false, error: MENSAJE_SIN_CONEXION, codigo: 'sin_conexion' };

  const trabajo: MensajeApi[] = [...conv.mensajes, mensajeUsuario(env.contexto(), pregunta)];
  const tarjetas = new Map<string, Tarjeta>();
  const acciones: AccionChat[] = [];
  let restantes = conv.restantes;
  let rondas = 0;
  try {
    for (let primera = true; ; primera = false) {
      env.alProgreso?.(primera ? 'pensando' : 'herramientas');
      const { r, restantes: rest } = await llamar(env, trabajo);
      if (primera && rest !== null) restantes = rest;   // solo las consultas nuevas llevan el contador
      if (r.stop_reason === 'refusal') throw new ErrorEnvio(MENSAJE_RECHAZO, 'rechazo');
      const usos = usosDe(r.content);
      if (r.stop_reason === 'tool_use') {
        if (!usos.length) throw new ErrorEnvio('El chat devolvió una respuesta inesperada.', 'respuesta_invalida', 502);
        if (rondas >= MAX_RONDAS) throw new ErrorEnvio('Claude ha hecho demasiadas consultas seguidas. Prueba a preguntarlo de otra forma.', 'demasiadas_rondas', 429);
        rondas++;
        trabajo.push({ role: 'assistant', content: r.content });   // tal cual llega
        env.alProgreso?.('herramientas', usos.map((u) => u.name));
        const resultados = await Promise.all(usos.map(async (u): Promise<{ bloque: Bloque; res: ResultadoHerramienta }> => {
          let res: ResultadoHerramienta;
          try { res = await env.ejecutar(u.name, u.input); } catch {
            res = { contenido: JSON.stringify({ error: 'Fallo interno de la herramienta.' }), error: true, tarjetas: [], acciones: [] };
          }
          return { bloque: { type: 'tool_result', tool_use_id: u.id, content: res.contenido, ...(res.error ? { is_error: true } : {}) }, res };
        }));
        for (const { res } of resultados) {
          for (const t of res.tarjetas) if (!tarjetas.has(t.id)) tarjetas.set(t.id, t);
          acciones.push(...res.acciones);
        }
        trabajo.push({ role: 'user', content: resultados.map((x) => x.bloque) });   // TODOS los resultados en un único mensaje
        continue;
      }
      if (usos.length) throw new ErrorEnvio('La respuesta de Claude se cortó a medias. Inténtalo de nuevo.', 'respuesta_incompleta', 502);
      trabajo.push({ role: 'assistant', content: r.content });
      const turno: Extract<Turno, { rol: 'asistente' }> = {
        rol: 'asistente', texto: r.texto.trim() || 'Claude no ha escrito respuesta. Prueba a preguntarlo de otra forma.',
        tarjetas: [...tarjetas.values()].slice(0, MAX_TARJETAS), acciones, ...(r.stop_reason === 'max_tokens' ? { cortado: true } : {}),
      };
      conv.mensajes = trabajo;
      conv.turnos = [...conv.turnos, { rol: 'usuario', texto: pregunta }, turno];
      conv.restantes = restantes;
      return { ok: true, turno };
    }
  } catch (e) {
    if (e instanceof ErrorEnvio) {
      if (e.codigo === 'limite_diario_superado') conv.restantes = 0;
      return { ok: false, error: e.message, codigo: e.codigo, status: e.status };
    }
    return { ok: false, error: 'No se pudo completar la consulta.', codigo: 'interno' };
  }
}

// ---------------------------------------------------------------- persistencia (solo la última conversación)

let almacen: ReturnType<typeof createStore> | null = null;
const tienda = () => (almacen ??= createStore('setas-chat', 'conversacion'));
const CLAVE = 'ultima';

const esTurno = (t: unknown): t is Turno => {
  const o = t as Turno | null;
  return !!o && typeof o === 'object' && ((o.rol === 'usuario' && typeof o.texto === 'string')
    || (o.rol === 'asistente' && typeof o.texto === 'string' && Array.isArray(o.tarjetas) && Array.isArray(o.acciones)));
};

/** Valida lo justo de una conversación guardada; null si no sirve. */
export function validarConversacion(x: unknown): Conversacion | null {
  const o = x as Partial<Conversacion> | null;
  if (!o || !Array.isArray(o.mensajes) || !Array.isArray(o.turnos)) return null;
  const ms = o.mensajes as MensajeApi[];
  if (ms.some((m) => !m || (m.role !== 'user' && m.role !== 'assistant') || !(typeof m.content === 'string' || Array.isArray(m.content)))) return null;
  if (ms.length && (ms[0].role !== 'user' || ms[ms.length - 1].role !== 'assistant')) return null;   // una consulta completa acaba en el asistente
  if (!o.turnos.every(esTurno)) return null;
  return { mensajes: ms, turnos: o.turnos as Turno[], restantes: typeof o.restantes === 'number' && Number.isFinite(o.restantes) ? o.restantes : null };
}

export async function leerConversacion(): Promise<Conversacion> {
  try { return validarConversacion(await get(CLAVE, tienda())) ?? conversacionNueva(); } catch { return conversacionNueva(); }
}
export async function guardarConversacion(c: Conversacion): Promise<void> {
  try { await set(CLAVE, c, tienda()); } catch { /* sin almacenamiento: solo esta sesión */ }
}
export async function borrarConversacion(): Promise<void> {
  try { await del(CLAVE, tienda()); } catch { /* nada que borrar */ }
}
