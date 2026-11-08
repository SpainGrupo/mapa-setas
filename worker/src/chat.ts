// POST /chat: proxy hacia la API de Claude para «Pregunta a Claude» (spec 2026-10-20 §2, §5, §6).
// Worker sin estado: el cliente reenvía el historial entero; las herramientas se ejecutan en el iPhone.
import Anthropic from "@anthropic-ai/sdk";
import { ErrorHttp, json, leerCuerpoLimitado } from "./http";
import { AVISO, limpiarTexto, PROHIBIDO_EXTRA, PROHIBIDO_GUIA, PROHIBIDO_OTRAS_LENGUAS, SUSTITUTO } from "./seguridad";
import { claveCliente, consumir, entero } from "./limite";
import { HERRAMIENTAS, NOMBRES_HERRAMIENTAS } from "./chat-herramientas";
import { SYSTEM_PROMPT } from "./chat-prompt";
import {
  comprobarTope,
  costeMicro,
  LIMITE_DIARIO_USD_POR_DEFECTO,
  LIMITE_IP_USD_POR_DEFECTO,
  LIMITE_MENSUAL_USD_POR_DEFECTO,
  registrarGasto,
  usd,
} from "./chat-gasto";
import type { Env } from "./index";

/** Tope del cuerpo SIN contar las fotos en base64 (texto, contexto, resultados de herramientas). */
export const MAX_BYTES_CHAT = 200 * 1024;
/** Fotos por petición, tamaño máximo de cada una ya decodificada y tipos admitidos. Solo base64 (nunca URL). */
export const MAX_FOTOS = 3;
export const MAX_BYTES_FOTO = Math.round(1.5 * 1024 * 1024);
export const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"] as const;
/** Tope del cuerpo bruto: el texto (MAX_BYTES_CHAT) más MAX_FOTOS fotos en base64 y su envoltorio JSON. */
export const MAX_BYTES_CUERPO_CHAT = MAX_BYTES_CHAT + MAX_FOTOS * (Math.ceil((MAX_BYTES_FOTO * 4) / 3) + 200);
/** Lo que ve Claude en lugar de las fotos de consultas anteriores (no se pagan tokens repetidos). */
export const TEXTO_FOTO_ANTERIOR = "[foto enviada antes]";
export const MAX_MENSAJES = 40;
export const MAX_RONDAS = 6;
export const CHAT_DIARIO_POR_DEFECTO = 30;
/** Peticiones por IP y día contando las rondas de herramientas (30 consultas × ~5 rondas). */
export const CHAT_PETICIONES_DIA_POR_DEFECTO = 150;
export const CLAUDE_MODELO_POR_DEFECTO = "claude-opus-5-5";
export const CLAUDE_ESFUERZO_POR_DEFECTO = "low";
export const BETA_FALLBACK = "server-side-fallback-2026-07-01";
const MAX_TOKENS = 4000;
const TEXTO_REFUSAL = "No puedo responder a eso; prueba a reformularlo.";

type Bloque = Record<string, unknown>;
export interface Mensaje {
  role: "user" | "assistant";
  content: string | Bloque[];
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function invalida(mensaje: string): ErrorHttp {
  return new ErrorHttp(400, "solicitud_invalida", mensaje);
}

/** Máximo de caracteres de un bloque de texto o de un tool_result (el cuerpo ya va acotado a MAX_BYTES_CHAT). */
export const MAX_CARACTERES_BLOQUE = 40_000;
const ID_HERRAMIENTA = /^[A-Za-z0-9_-]{1,128}$/;
const NOMBRES = new Set<string>(NOMBRES_HERRAMIENTAS);

function textoAcotado(v: unknown, i: number, que: string): string {
  if (typeof v !== "string") throw invalida(`${que} no válido en el mensaje ${i}.`);
  if (v.length > MAX_CARACTERES_BLOQUE) throw invalida(`${que} demasiado largo en el mensaje ${i}.`);
  return v;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Bytes que ocupa un base64 ya validado (sin decodificarlo). */
export function bytesDeBase64(b64: string): number {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return (b64.length / 4) * 3 - pad;
}

/** Firma de los primeros bytes: el tipo declarado tiene que ser el real (la API rechazaría el resto). */
function firmaCoincide(tipo: string, b64: string): boolean {
  let cab: string;
  try {
    cab = atob(b64.slice(0, 24));
  } catch {
    return false;
  }
  if (tipo === "image/jpeg") return cab.startsWith("\xFF\xD8\xFF");
  if (tipo === "image/png") return cab.startsWith("\x89PNG\r\n\x1a\n");
  return cab.startsWith("RIFF") && cab.slice(8, 12) === "WEBP";
}

/**
 * Foto de un mensaje user. SOLO `source.type: "base64"` (con `url` la API descargaría y cobraría cualquier
 * cosa), tipo en lista blanca, base64 estricto, ≤ MAX_BYTES_FOTO decodificada y firma acorde al tipo.
 */
function bloqueImagen(b: Bloque, i: number): Bloque {
  const s = b.source;
  if (!esObjeto(s) || s.type !== "base64") throw invalida(`Las fotos solo se admiten en base64 (mensaje ${i}).`);
  if (typeof s.media_type !== "string" || !(TIPOS_FOTO as readonly string[]).includes(s.media_type)) {
    throw invalida(`Tipo de foto no admitido en el mensaje ${i} (jpeg, png o webp).`);
  }
  const data = s.data;
  if (typeof data !== "string" || data.length === 0 || data.length % 4 !== 0 || !BASE64.test(data)) {
    throw invalida(`Foto no válida en el mensaje ${i}.`);
  }
  if (bytesDeBase64(data) > MAX_BYTES_FOTO) {
    throw new ErrorHttp(413, "carga_demasiado_grande", `Cada foto puede pesar como máximo ${Math.round(MAX_BYTES_FOTO / 1024 / 1024 * 10) / 10} MB.`);
  }
  if (!firmaCoincide(s.media_type, data)) throw invalida(`La foto del mensaje ${i} no es del tipo que dice ser.`);
  return { type: "image", source: { type: "base64", media_type: s.media_type, data } };
}

/**
 * Bloques de un mensaje user, reconstruidos campo a campo: `text`, `image` en base64 y `tool_result` con contenido
 * de texto. Nada de documentos ni de imágenes por URL (dentro de un tool_result, haría que la API descargara y
 * cobrara contenido arbitrario) ni campos extra como `cache_control`.
 */
function bloqueUser(b: Bloque, i: number): Bloque {
  if (b.type === "text") return { type: "text", text: textoAcotado(b.text, i, "Bloque text") };
  if (b.type === "image") return bloqueImagen(b, i);
  if (b.type === "tool_result") {
    if (typeof b.tool_use_id !== "string" || !ID_HERRAMIENTA.test(b.tool_use_id)) {
      throw invalida(`tool_result sin tool_use_id válido en el mensaje ${i}.`);
    }
    let content: string | Bloque[];
    if (typeof b.content === "string") content = textoAcotado(b.content, i, "tool_result");
    else if (Array.isArray(b.content)) {
      let total = 0;
      content = b.content.map((c) => {
        if (!esObjeto(c) || c.type !== "text") throw invalida(`tool_result solo admite texto (mensaje ${i}).`);
        const t = textoAcotado(c.text, i, "tool_result");
        total += t.length;
        return { type: "text", text: t };
      });
      if (total > MAX_CARACTERES_BLOQUE) throw invalida(`tool_result demasiado largo en el mensaje ${i}.`);
    } else throw invalida(`tool_result sin contenido válido en el mensaje ${i}.`);
    if (b.is_error !== undefined && typeof b.is_error !== "boolean") throw invalida(`is_error no válido en el mensaje ${i}.`);
    return { type: "tool_result", tool_use_id: b.tool_use_id, content, ...(b.is_error === true ? { is_error: true } : {}) };
  }
  throw invalida(`Tipo de bloque no permitido en un mensaje user (${i}).`);
}

/**
 * Bloques de un mensaje assistant (eco de respuestas anteriores). Solo los tipos que puede devolver /chat:
 * text, tool_use (de una herramienta propia), thinking/redacted_thinking (firmados por la API) y fallback.
 */
function bloqueAssistant(b: Bloque, i: number): Bloque {
  switch (b.type) {
    case "text":
      return { type: "text", text: textoAcotado(b.text, i, "Bloque text") };
    case "tool_use":
      if (typeof b.id !== "string" || !ID_HERRAMIENTA.test(b.id) || typeof b.name !== "string" || !NOMBRES.has(b.name) || !esObjeto(b.input)) {
        throw invalida(`tool_use no válido en el mensaje ${i}.`);
      }
      return { type: "tool_use", id: b.id, name: b.name, input: b.input };
    case "thinking":
      if (typeof b.thinking !== "string" || typeof b.signature !== "string") throw invalida(`thinking no válido en el mensaje ${i}.`);
      return { type: "thinking", thinking: b.thinking, signature: b.signature };
    case "redacted_thinking":
      if (typeof b.data !== "string") throw invalida(`redacted_thinking no válido en el mensaje ${i}.`);
      return { type: "redacted_thinking", data: b.data };
    case "fallback": {
      const { cache_control: _cc, ...resto } = b;
      return resto;
    }
    default:
      throw invalida(`Tipo de bloque no permitido en un mensaje assistant (${i}).`);
  }
}

/**
 * Valida la forma de `messages` y devuelve una copia saneada (solo los campos y tipos que usa la app).
 * Los mensajes assistant son eco de respuestas previas: el cliente puede falsificarlos, por eso el límite por IP
 * cuenta también las rondas de herramientas (ver manejarChat) y no solo las consultas nuevas.
 */
export function validarMensajes(cuerpo: unknown): Mensaje[] {
  if (!esObjeto(cuerpo) || !Array.isArray(cuerpo.messages)) throw invalida("Falta el campo messages.");
  const msgs = cuerpo.messages as unknown[];
  if (msgs.length === 0) throw invalida("messages no puede estar vacío.");
  if (msgs.length > MAX_MENSAJES) {
    throw new ErrorHttp(400, "conversacion_larga", "Empieza una conversación nueva.");
  }
  const salida = msgs.map((m, i): Mensaje => {
    if (!esObjeto(m)) throw invalida(`El mensaje ${i} no es un objeto.`);
    const esperado = i % 2 === 0 ? "user" : "assistant";
    if (m.role !== "user" && m.role !== "assistant") throw invalida(`Rol no permitido en el mensaje ${i}.`);
    if (m.role !== esperado) throw invalida("Los roles deben alternar empezando por user.");
    if (typeof m.content === "string") {
      if (m.role === "user" && m.content.length === 0) throw invalida(`El mensaje ${i} está vacío.`);
      return { role: m.role, content: textoAcotado(m.content, i, "Texto") };
    }
    if (!Array.isArray(m.content) || m.content.length === 0) throw invalida(`Contenido no válido en el mensaje ${i}.`);
    const content = m.content.map((b) => {
      if (!esObjeto(b) || typeof b.type !== "string") throw invalida(`Bloque no válido en el mensaje ${i}.`);
      return m.role === "user" ? bloqueUser(b, i) : bloqueAssistant(b, i);
    });
    return { role: m.role, content };
  });
  if (msgs.length % 2 === 0) throw invalida("La conversación debe terminar en un mensaje user.");
  return soloFotosDeLaConsulta(salida);
}

const esFoto = (b: Bloque) => b.type === "image";

/**
 * Máximo MAX_FOTOS fotos en toda la petición. Solo llegan completas las del mensaje de la consulta en curso (el último
 * user con texto y sin tool_result: sigue siéndolo durante las rondas de herramientas); las demás, en cualquier otro
 * mensaje, se sustituyen por TEXTO_FOTO_ANTERIOR para no pagar tokens repetidos ni colar fotos en las rondas.
 */
function soloFotosDeLaConsulta(msgs: Mensaje[]): Mensaje[] {
  let total = 0;
  for (const m of msgs) if (typeof m.content !== "string") total += m.content.filter(esFoto).length;
  if (total === 0) return msgs;
  if (total > MAX_FOTOS) throw invalida(`Máximo ${MAX_FOTOS} fotos por mensaje.`);
  let ancla = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]!;
    if (m.role === "user" && tieneTexto(m) && !tieneResultado(m)) {
      ancla = i;
      break;
    }
  }
  return msgs.map((m, i) =>
    i === ancla || typeof m.content === "string" || !m.content.some(esFoto)
      ? m
      : { role: m.role, content: m.content.map((b) => (esFoto(b) ? { type: "text", text: TEXTO_FOTO_ANTERIOR } : b)) },
  );
}

/** Bytes de base64 de fotos que lleva el cuerpo, para no contarlos en el tope de texto. */
export function caracteresDeFotos(cuerpo: unknown): number {
  if (!esObjeto(cuerpo) || !Array.isArray(cuerpo.messages)) return 0;
  let n = 0;
  for (const m of cuerpo.messages as unknown[]) {
    if (!esObjeto(m) || !Array.isArray(m.content)) continue;
    for (const b of m.content as unknown[]) {
      if (esObjeto(b) && b.type === "image" && esObjeto(b.source) && typeof b.source.data === "string") n += b.source.data.length;
    }
  }
  return n;
}

function bloques(m: Mensaje): Bloque[] {
  return typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
}

const tieneTexto = (m: Mensaje) => bloques(m).some((b) => b.type === "text");
const tieneResultado = (m: Mensaje) => bloques(m).some((b) => b.type === "tool_result");

/** Consulta nueva = el último user tiene texto y ningún tool_result. */
export function esConsultaNueva(msgs: Mensaje[]): boolean {
  const ultimo = msgs[msgs.length - 1]!;
  return tieneTexto(ultimo) && !tieneResultado(ultimo);
}

/** Rondas de herramientas ya hechas: mensajes assistant con tool_use desde el último user con texto (sin tool_result). */
export function rondasHechas(msgs: Mensaje[]): number {
  let inicio = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]!;
    if (m.role === "user" && tieneTexto(m) && !tieneResultado(m)) {
      inicio = i;
      break;
    }
  }
  let n = 0;
  for (let i = inicio + 1; i < msgs.length; i++) {
    const m = msgs[i]!;
    if (m.role === "assistant" && bloques(m).some((b) => b.type === "tool_use")) n++;
  }
  return n;
}

export function filtrarTexto(t: string): string {
  // Caracteres invisibles (ancho cero, guion blando, marcas de dirección) fuera: no se ven y sirven para colar
  // «comes\u200btible» por delante de las expresiones regulares.
  let r = limpiarTexto(t.replace(/[\u00AD\u200B-\u200F\u2060-\u2064\uFEFF\u202A-\u202E]/g, ""));
  if (PROHIBIDO_OTRAS_LENGUAS.test(r)) {
    r = r
      .split(/(?<=[.;!?\n])\s*/)
      .map((f) => (PROHIBIDO_OTRAS_LENGUAS.test(f) ? SUSTITUTO : f))
      .join(" ")
      .trim();
  }
  if (PROHIBIDO_GUIA.test(r) || PROHIBIDO_EXTRA.test(r) || PROHIBIDO_OTRAS_LENGUAS.test(r)) r = SUSTITUTO; // red final por si limpiarTexto no cubre el caso
  return r;
}

export function crearCliente(apiKey: string, fetchImpl?: typeof fetch): Anthropic {
  return new Anthropic({ apiKey, maxRetries: 1, timeout: 45_000, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
}

export function parametrosClaude(env: Env, messages: Mensaje[]) {
  const model = env.CLAUDE_MODEL || CLAUDE_MODELO_POR_DEFECTO;
  const base = {
    model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    tools: HERRAMIENTAS as unknown as Anthropic.Beta.BetaToolUnion[],
    tool_choice: { type: "auto" as const },
    messages: messages as unknown as Anthropic.Beta.BetaMessageParam[],
    output_config: { effort: (env.CLAUDE_EFFORT || CLAUDE_ESFUERZO_POR_DEFECTO) as "low" | "medium" | "high" },
    cache_control: { type: "ephemeral" as const },
  };
  if (model.startsWith("claude-haiku")) return base;
  return { ...base, betas: [BETA_FALLBACK], fallbacks: "default" as const };
}

function mapearError(e: unknown): ErrorHttp {
  if (e instanceof Anthropic.APIConnectionTimeoutError) {
    return new ErrorHttp(504, "claude_tiempo_agotado", "El asistente tardó demasiado. Inténtalo de nuevo.");
  }
  if (e instanceof Anthropic.RateLimitError || (e instanceof Anthropic.APIError && e.status === 529)) {
    return new ErrorHttp(503, "claude_saturado", "El asistente está saturado. Inténtalo en unos minutos.");
  }
  // Mensaje interno del SDK/API solo al log del servidor (nunca contiene la clave: va en cabecera).
  console.error("Error de Claude", e instanceof Anthropic.APIError ? `${e.status} ${e.name}` : e instanceof Error ? e.name : "desconocido");
  return new ErrorHttp(502, "claude_error", "El asistente no está disponible ahora mismo.");
}

export async function manejarChat(
  request: Request,
  env: Env,
  cors: Record<string, string>,
  fetchImpl?: typeof fetch,
): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new ErrorHttp(503, "asistente_no_activado", "El asistente no está activado todavía.");
  }
  const texto = await leerCuerpoLimitado(request, MAX_BYTES_CUERPO_CHAT);
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    throw invalida("El cuerpo no es JSON válido.");
  }
  // El tope de MAX_BYTES_CHAT vale para todo lo que no son fotos: las fotos no dejan más sitio al texto.
  if (new TextEncoder().encode(texto).byteLength - caracteresDeFotos(cuerpo) > MAX_BYTES_CHAT) {
    throw new ErrorHttp(413, "carga_demasiado_grande", `La solicitud supera el máximo de ${MAX_BYTES_CHAT} bytes sin contar las fotos.`);
  }
  const msgs = validarMensajes(cuerpo);
  const nueva = esConsultaNueva(msgs);
  if (!nueva && rondasHechas(msgs) >= MAX_RONDAS) {
    throw new ErrorHttp(429, "demasiadas_rondas", "La consulta necesita demasiadas vueltas. Prueba a preguntarlo de otra forma.");
  }

  const requerirKv = env.REQUIRE_KV === "true";
  const ip = claveCliente(request.headers.get("CF-Connecting-IP"));
  await comprobarTope(env.RATE_LIMIT, {
    diarioUsd: usd(env.CHAT_DAILY_USD, LIMITE_DIARIO_USD_POR_DEFECTO),
    mensualUsd: usd(env.CHAT_MONTHLY_USD, LIMITE_MENSUAL_USD_POR_DEFECTO),
    ipUsd: usd(env.CHAT_IP_DAILY_USD, LIMITE_IP_USD_POR_DEFECTO),
    ip,
    requerirKv,
  });

  let restantes: number | null = null;
  if (nueva) {
    const limite = entero(env.CHAT_DAILY_LIMIT, CHAT_DIARIO_POR_DEFECTO);
    restantes = await consumir(env.RATE_LIMIT, ip, limite, {
      prefijo: "chat:",
      sinGlobal: true,
      requerirKv,
      mensajeLimite: `Has alcanzado el límite de ${limite} consultas por día.`,
    });
  }
  // Toda petición cuenta (también las rondas de herramientas): el historial lo manda el cliente y se puede
  // falsificar para que una consulta nueva parezca una ronda y no gaste cupo.
  const limitePeticiones = entero(env.CHAT_PETICIONES_DIA, CHAT_PETICIONES_DIA_POR_DEFECTO);
  await consumir(env.RATE_LIMIT, ip, limitePeticiones, {
    prefijo: "chatreq:",
    sinGlobal: true,
    requerirKv,
    mensajeLimite: "Has llegado al máximo de uso del asistente por hoy. Vuelve a intentarlo mañana.",
  });

  const cliente = crearCliente(env.ANTHROPIC_API_KEY, fetchImpl);
  const params = parametrosClaude(env, msgs);
  let respuesta: Anthropic.Beta.BetaMessage;
  try {
    respuesta = (await cliente.beta.messages.create(params as never)) as Anthropic.Beta.BetaMessage;
  } catch (e) {
    throw mapearError(e);
  }

  await registrarGasto(env.RATE_LIMIT, costeMicro(respuesta.usage as never, params.model), new Date(), ip);

  const refusal = respuesta.stop_reason === "refusal";
  const unido = respuesta.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const extra: Record<string, string> = { ...cors };
  if (restantes !== null) extra["X-Restantes-Hoy"] = String(restantes);
  return json(
    {
      content: respuesta.content,
      stop_reason: respuesta.stop_reason,
      texto: refusal ? TEXTO_REFUSAL : filtrarTexto(unido),
      aviso: AVISO,
    },
    200,
    extra,
  );
}
