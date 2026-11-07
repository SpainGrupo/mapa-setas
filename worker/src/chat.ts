// POST /chat: proxy hacia la API de Claude para «Pregunta a Claude» (spec 2026-10-20 §2, §5, §6).
// Worker sin estado: el cliente reenvía el historial entero; las herramientas se ejecutan en el iPhone.
import Anthropic from "@anthropic-ai/sdk";
import { ErrorHttp, json, leerCuerpoLimitado } from "./http";
import { AVISO, limpiarTexto, PROHIBIDO_EXTRA, PROHIBIDO_GUIA, SUSTITUTO } from "./seguridad";
import { consumir, entero } from "./limite";
import { HERRAMIENTAS } from "./chat-herramientas";
import { SYSTEM_PROMPT } from "./chat-prompt";
import {
  comprobarTope,
  costeMicro,
  LIMITE_DIARIO_USD_POR_DEFECTO,
  LIMITE_MENSUAL_USD_POR_DEFECTO,
  registrarGasto,
  usd,
} from "./chat-gasto";
import type { Env } from "./index";

export const MAX_BYTES_CHAT = 200 * 1024;
export const MAX_MENSAJES = 40;
export const MAX_RONDAS = 6;
export const CHAT_DIARIO_POR_DEFECTO = 30;
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

/** Valida la forma de `messages`. Los mensajes assistant se aceptan tal cual (eco de respuestas previas). */
export function validarMensajes(cuerpo: unknown): Mensaje[] {
  if (!esObjeto(cuerpo) || !Array.isArray(cuerpo.messages)) throw invalida("Falta el campo messages.");
  const msgs = cuerpo.messages as unknown[];
  if (msgs.length === 0) throw invalida("messages no puede estar vacío.");
  if (msgs.length > MAX_MENSAJES) {
    throw new ErrorHttp(400, "conversacion_larga", "Empieza una conversación nueva.");
  }
  msgs.forEach((m, i) => {
    if (!esObjeto(m)) throw invalida(`El mensaje ${i} no es un objeto.`);
    const esperado = i % 2 === 0 ? "user" : "assistant";
    if (m.role !== "user" && m.role !== "assistant") throw invalida(`Rol no permitido en el mensaje ${i}.`);
    if (m.role !== esperado) throw invalida("Los roles deben alternar empezando por user.");
    if (typeof m.content === "string") {
      if (m.role === "user" && m.content.length === 0) throw invalida(`El mensaje ${i} está vacío.`);
      return;
    }
    if (!Array.isArray(m.content) || m.content.length === 0) throw invalida(`Contenido no válido en el mensaje ${i}.`);
    for (const b of m.content) {
      if (!esObjeto(b) || typeof b.type !== "string") throw invalida(`Bloque no válido en el mensaje ${i}.`);
      if (m.role === "user") {
        if (b.type === "text") {
          if (typeof b.text !== "string") throw invalida(`Bloque text no válido en el mensaje ${i}.`);
        } else if (b.type === "tool_result") {
          if (typeof b.tool_use_id !== "string") throw invalida(`tool_result sin tool_use_id en el mensaje ${i}.`);
        } else {
          throw invalida(`Tipo de bloque no permitido en un mensaje user (${i}).`);
        }
      }
    }
  });
  if (msgs.length % 2 === 0) throw invalida("La conversación debe terminar en un mensaje user.");
  return msgs as Mensaje[];
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
  let r = limpiarTexto(t);
  if (PROHIBIDO_GUIA.test(r) || PROHIBIDO_EXTRA.test(r)) r = SUSTITUTO; // red final por si limpiarTexto no cubre el caso
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
  const texto = await leerCuerpoLimitado(request, MAX_BYTES_CHAT);
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    throw invalida("El cuerpo no es JSON válido.");
  }
  const msgs = validarMensajes(cuerpo);
  const nueva = esConsultaNueva(msgs);
  if (!nueva && rondasHechas(msgs) >= MAX_RONDAS) {
    throw new ErrorHttp(429, "demasiadas_rondas", "La consulta necesita demasiadas vueltas. Prueba a preguntarlo de otra forma.");
  }

  const requerirKv = env.REQUIRE_KV === "true";
  await comprobarTope(env.RATE_LIMIT, {
    diarioUsd: usd(env.CHAT_DAILY_USD, LIMITE_DIARIO_USD_POR_DEFECTO),
    mensualUsd: usd(env.CHAT_MONTHLY_USD, LIMITE_MENSUAL_USD_POR_DEFECTO),
    requerirKv,
  });

  let restantes: number | null = null;
  if (nueva) {
    const ip = request.headers.get("CF-Connecting-IP") ?? "desconocida";
    const limite = entero(env.CHAT_DAILY_LIMIT, CHAT_DIARIO_POR_DEFECTO);
    restantes = await consumir(env.RATE_LIMIT, ip, limite, {
      prefijo: "chat:",
      sinGlobal: true,
      requerirKv,
      mensajeLimite: `Has alcanzado el límite de ${limite} consultas por día.`,
    });
  }

  const cliente = crearCliente(env.ANTHROPIC_API_KEY, fetchImpl);
  const params = parametrosClaude(env, msgs);
  let respuesta: Anthropic.Beta.BetaMessage;
  try {
    respuesta = (await cliente.beta.messages.create(params as never)) as Anthropic.Beta.BetaMessage;
  } catch (e) {
    throw mapearError(e);
  }

  await registrarGasto(env.RATE_LIMIT, costeMicro(respuesta.usage as never, params.model));

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
