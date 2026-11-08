// Tope de gasto del chat: suma en KV el coste (microdólares) por día y mes UTC.
// KV es eventualmente consistente: el tope es aproximado; el límite de gasto del workspace de
// Anthropic es la red de seguridad real.
import { ErrorHttp } from "./http";

// USD por millón de tokens. Como 1 USD/M = 1 microUSD/token, coste_micro = tokens * precio.
interface Precios {
  entrada: number;
  escrituraCache: number;
  lecturaCache: number;
  salida: number;
}
const OPUS: Precios = { entrada: 4, escrituraCache: 5, lecturaCache: 0.2, salida: 20 };
const PRECIOS: Record<string, Precios> = {
  "claude-opus-5-5": OPUS,
  "claude-sonnet-5-5": { entrada: 2, escrituraCache: 2.5, lecturaCache: 0.2, salida: 10 },
  "claude-haiku-5-5": { entrada: 0.1, escrituraCache: 0.125, lecturaCache: 0.01, salida: 0.5 },
};

export interface UsoTokens {
  input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  output_tokens?: number | null;
  model?: string | null;
}
export interface UsoRespuesta extends UsoTokens {
  iterations?: UsoTokens[] | null;
}

export const LIMITE_DIARIO_USD_POR_DEFECTO = 1.5;
export const LIMITE_MENSUAL_USD_POR_DEFECTO = 25;
export const LIMITE_IP_USD_POR_DEFECTO = 0.5;
export const TTL_DIA = 60 * 60 * 48;
export const TTL_MES = 60 * 60 * 24 * 40;

export function usd(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

export function preciosDe(modelo: string): Precios {
  return PRECIOS[modelo] ?? OPUS; // desconocido: precios de Opus (conservador)
}

function costeUno(u: UsoTokens, modelo: string): number {
  const p = preciosDe(u.model || modelo);
  return (
    (u.input_tokens ?? 0) * p.entrada +
    (u.cache_creation_input_tokens ?? 0) * p.escrituraCache +
    (u.cache_read_input_tokens ?? 0) * p.lecturaCache +
    (u.output_tokens ?? 0) * p.salida
  );
}

/** Coste en microdólares. Si hay `iterations` (fallback) se suma cada una; si no, el uso total. */
export function costeMicro(uso: UsoRespuesta | null | undefined, modelo: string): number {
  if (!uso) return 0;
  const lista = uso.iterations && uso.iterations.length > 0 ? uso.iterations : [uso];
  return Math.ceil(lista.reduce((t, u) => t + costeUno(u, modelo), 0));
}

export const claveGastoDia = (ahora: Date) => `chatusd:d:${ahora.toISOString().slice(0, 10)}`;
export const claveGastoMes = (ahora: Date) => `chatusd:m:${ahora.toISOString().slice(0, 7)}`;
export const claveGastoIp = (ip: string, ahora: Date) => `chatusd:ip:${ahora.toISOString().slice(0, 10)}:${ip}`;

function noDisponible(): ErrorHttp {
  return new ErrorHttp(503, "servicio_no_disponible", "Servicio no disponible temporalmente. Inténtalo más tarde.");
}

export interface TopesGasto {
  diarioUsd: number;
  mensualUsd: number;
  requerirKv: boolean;
  /** Tope por IP y día (USD) y la clave de cliente; sin `ip` no se mira. */
  ipUsd?: number;
  ip?: string;
}

/** Lanza 429 `tope_gasto` si el gasto del día o del mes alcanza el tope. Sin KV: 503 con requerirKv. */
export async function comprobarTope(kv: KVNamespace | undefined, topes: TopesGasto, ahora = new Date()): Promise<void> {
  if (!kv) {
    if (topes.requerirKv) {
      console.error("RATE_LIMIT (KV) no configurado y REQUIRE_KV=true: se rechaza el chat.");
      throw noDisponible();
    }
    console.warn("RATE_LIMIT (KV) no configurado: tope de gasto del chat desactivado.");
    return;
  }
  let dia = 0;
  let mes = 0;
  let deIp = 0;
  try {
    dia = Number((await kv.get(claveGastoDia(ahora))) ?? "0") || 0;
    mes = Number((await kv.get(claveGastoMes(ahora))) ?? "0") || 0;
    if (topes.ip) deIp = Number((await kv.get(claveGastoIp(topes.ip, ahora))) ?? "0") || 0;
  } catch (e) {
    if (topes.requerirKv) {
      console.error("Fallo leyendo KV con REQUIRE_KV=true: se rechaza el chat.", e);
      throw noDisponible();
    }
    console.error("Fallo leyendo KV; se continúa sin tope de gasto.", e);
    return;
  }
  if (dia >= topes.diarioUsd * 1e6 || mes >= topes.mensualUsd * 1e6) {
    throw new ErrorHttp(429, "tope_gasto", "El asistente ha llegado a su tope de gasto. Vuelve a intentarlo mañana.");
  }
  if (topes.ip && deIp >= (topes.ipUsd ?? LIMITE_IP_USD_POR_DEFECTO) * 1e6) {
    throw new ErrorHttp(429, "limite_diario_superado", "Has llegado al máximo de uso del asistente por hoy. Vuelve a intentarlo mañana.");
  }
}

/** Suma el coste de la llamada al gasto del día y del mes. Un fallo de KV no tumba la respuesta. */
export async function registrarGasto(kv: KVNamespace | undefined, micro: number, ahora = new Date(), ip?: string): Promise<void> {
  if (!kv || micro <= 0) return;
  try {
    const kd = claveGastoDia(ahora);
    const km = claveGastoMes(ahora);
    const dia = Number((await kv.get(kd)) ?? "0") || 0;
    const mes = Number((await kv.get(km)) ?? "0") || 0;
    await kv.put(kd, String(dia + micro), { expirationTtl: TTL_DIA });
    await kv.put(km, String(mes + micro), { expirationTtl: TTL_MES });
    if (ip) {
      const ki = claveGastoIp(ip, ahora);
      const deIp = Number((await kv.get(ki)) ?? "0") || 0;
      await kv.put(ki, String(deIp + micro), { expirationTtl: TTL_DIA });
    }
  } catch (e) {
    console.error("Fallo registrando el gasto en KV.", e);
  }
}
