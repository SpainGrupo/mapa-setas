// Límite diario por IP y tope global diario en KV. KV es eventualmente consistente: el tope es
// aproximado (ráfagas simultáneas pueden colarse por unas pocas peticiones), suficiente para frenar abuso.
// El tope global cubre el caso de IPs rotadas (la cabecera Origin la falsifica cualquier cliente no navegador).
import { ErrorHttp } from "./http";

export const LIMITE_DIARIO_POR_DEFECTO = 50;
export const LIMITE_GLOBAL_POR_DEFECTO = 300;

export function entero(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : porDefecto;
}

export function limiteDiario(valor: string | undefined): number {
  return entero(valor, LIMITE_DIARIO_POR_DEFECTO);
}

export function limiteGlobal(valor: string | undefined): number {
  return entero(valor, LIMITE_GLOBAL_POR_DEFECTO);
}

export const LIMITE_EXPLORAR_DIARIO_POR_DEFECTO = 10;
export const LIMITE_EXPLORAR_GLOBAL_POR_DEFECTO = 60;

/** Prefijo de claves de /identificar (el de siempre). /explorar usa `exp:` para llevar su propia cuenta. */
export const PREFIJO_IDENTIFICAR = "rl:";
export const PREFIJO_EXPLORAR = "exp:";

export function limiteExplorarDiario(valor: string | undefined): number {
  return entero(valor, LIMITE_EXPLORAR_DIARIO_POR_DEFECTO);
}

export function limiteExplorarGlobal(valor: string | undefined): number {
  return entero(valor, LIMITE_EXPLORAR_GLOBAL_POR_DEFECTO);
}

/**
 * Identificador de cliente para los límites: la IP de Cloudflare (CF-Connecting-IP; el cliente no puede falsificarla
 * en workers.dev porque Cloudflare la reescribe). Las IPv6 se agrupan por su /64: un solo usuario suele tener un /64
 * entero y, sin agrupar, podría saltarse el límite por IP cambiando la mitad baja de la dirección.
 */
export function claveCliente(ip: string | null | undefined): string {
  const t = (ip ?? "").trim().toLowerCase();
  if (!t) return "desconocida";
  if (!t.includes(":")) return t;
  const [cabeza = "", cola] = t.split("::", 2);
  const a = cabeza ? cabeza.split(":") : [];
  const b = cola !== undefined && cola !== "" ? cola.split(":") : [];
  // IPv4 incrustada al final (::ffff:1.2.3.4): cuenta como dos grupos.
  const grupos = cola === undefined ? a : [...a, ...Array(Math.max(0, 8 - a.length - b.length - (b.at(-1)?.includes(".") ? 1 : 0))).fill("0"), ...b];
  if (grupos.length >= 2 && grupos.at(-1)?.includes(".") && grupos.slice(0, 5).every((g) => /^0*$/.test(g)) && /^0*ffff$/.test(grupos[5] ?? "")) {
    return grupos.at(-1)!; // IPv4 mapeada
  }
  const prefijo = grupos.slice(0, 4).map((g) => (g.replace(/^0+/, "") || "0"));
  while (prefijo.length < 4) prefijo.push("0");
  return `${prefijo.join(":")}::/64`;
}

export function claveDia(ip: string, ahora: Date, prefijo = PREFIJO_IDENTIFICAR): string {
  return `${prefijo}${ahora.toISOString().slice(0, 10)}:${ip}`;
}

export function claveGlobal(ahora: Date, prefijo = PREFIJO_IDENTIFICAR): string {
  return claveDia("__global__", ahora, prefijo);
}

export interface OpcionesLimite {
  limiteGlobal?: number;
  /** Si es true, sin KV o con fallo de lectura se responde 503 (fail closed). */
  requerirKv?: boolean;
  /** Prefijo de las claves de KV; contadores separados por ruta. Por defecto `rl:` (/identificar). */
  prefijo?: string;
  /** Qué se cuenta, para el mensaje del 429. Por defecto «reconocimientos». */
  unidad?: string;
  /** true = sin tope global (el chat tiene su propio tope de gasto). */
  sinGlobal?: boolean;
  /** Mensaje del 429 por IP; por defecto el de /identificar. */
  mensajeLimite?: string;
}

const TTL = 60 * 60 * 48;

function noDisponible(): ErrorHttp {
  return new ErrorHttp(503, "servicio_no_disponible", "Servicio no disponible temporalmente. Inténtalo más tarde.");
}

/**
 * Cuenta una petición (por IP y global). Comprueba ambos límites antes de incrementar ninguno.
 * Sin KV: si requerirKv es true -> 503; si no, no limita y avisa en el log (desarrollo local).
 * Devuelve las peticiones restantes hoy para esa IP (o null si no hay KV).
 */
export async function consumir(
  kv: KVNamespace | undefined,
  ip: string,
  limite: number,
  opciones: OpcionesLimite = {},
  ahora = new Date(),
): Promise<number | null> {
  const topeGlobal = opciones.limiteGlobal ?? LIMITE_GLOBAL_POR_DEFECTO;
  if (!kv) {
    if (opciones.requerirKv) {
      console.error("RATE_LIMIT (KV) no configurado y REQUIRE_KV=true: se rechaza la petición.");
      throw noDisponible();
    }
    console.warn("RATE_LIMIT (KV) no configurado: límite diario desactivado.");
    return null;
  }
  const prefijo = opciones.prefijo ?? PREFIJO_IDENTIFICAR;
  const clave = claveDia(ip, ahora, prefijo);
  const claveG = claveGlobal(ahora, prefijo);
  const usarGlobal = !opciones.sinGlobal;
  let usadas = 0;
  let usadasGlobal = 0;
  try {
    usadas = Number((await kv.get(clave)) ?? "0") || 0;
    if (usarGlobal) usadasGlobal = Number((await kv.get(claveG)) ?? "0") || 0;
  } catch (e) {
    if (opciones.requerirKv) {
      console.error("Fallo leyendo KV con REQUIRE_KV=true: se rechaza la petición.", e);
      throw noDisponible();
    }
    console.error("Fallo leyendo KV; se continúa sin limitar esta petición.", e);
    return null;
  }
  if (usarGlobal && usadasGlobal >= topeGlobal) {
    throw new ErrorHttp(429, "limite_global_superado", "El servicio ha alcanzado su límite diario. Vuelve a intentarlo mañana.");
  }
  if (usadas >= limite) {
    throw new ErrorHttp(429, "limite_diario_superado", opciones.mensajeLimite ?? `Has alcanzado el límite de ${limite} ${opciones.unidad ?? "reconocimientos"} por día.`);
  }
  try {
    await kv.put(clave, String(usadas + 1), { expirationTtl: TTL });
    if (usarGlobal) await kv.put(claveG, String(usadasGlobal + 1), { expirationTtl: TTL });
  } catch (e) {
    console.error("Fallo escribiendo KV.", e);
  }
  return limite - usadas - 1;
}
