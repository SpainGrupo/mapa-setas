// Límite diario por IP y tope global diario en KV. KV es eventualmente consistente: el tope es
// aproximado (ráfagas simultáneas pueden colarse por unas pocas peticiones), suficiente para frenar abuso.
// El tope global cubre el caso de IPs rotadas (la cabecera Origin la falsifica cualquier cliente no navegador).
import { ErrorHttp } from "./http";

export const LIMITE_DIARIO_POR_DEFECTO = 50;
export const LIMITE_GLOBAL_POR_DEFECTO = 300;

function entero(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : porDefecto;
}

export function limiteDiario(valor: string | undefined): number {
  return entero(valor, LIMITE_DIARIO_POR_DEFECTO);
}

export function limiteGlobal(valor: string | undefined): number {
  return entero(valor, LIMITE_GLOBAL_POR_DEFECTO);
}

export function claveDia(ip: string, ahora: Date): string {
  return `rl:${ahora.toISOString().slice(0, 10)}:${ip}`;
}

export function claveGlobal(ahora: Date): string {
  return claveDia("__global__", ahora);
}

export interface OpcionesLimite {
  limiteGlobal?: number;
  /** Si es true, sin KV o con fallo de lectura se responde 503 (fail closed). */
  requerirKv?: boolean;
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
  const clave = claveDia(ip, ahora);
  const claveG = claveGlobal(ahora);
  let usadas = 0;
  let usadasGlobal = 0;
  try {
    usadas = Number((await kv.get(clave)) ?? "0") || 0;
    usadasGlobal = Number((await kv.get(claveG)) ?? "0") || 0;
  } catch (e) {
    if (opciones.requerirKv) {
      console.error("Fallo leyendo KV con REQUIRE_KV=true: se rechaza la petición.", e);
      throw noDisponible();
    }
    console.error("Fallo leyendo KV; se continúa sin limitar esta petición.", e);
    return null;
  }
  if (usadasGlobal >= topeGlobal) {
    throw new ErrorHttp(429, "limite_global_superado", "El servicio ha alcanzado su límite diario. Vuelve a intentarlo mañana.");
  }
  if (usadas >= limite) {
    throw new ErrorHttp(429, "limite_diario_superado", `Has alcanzado el límite de ${limite} reconocimientos por día.`);
  }
  try {
    await kv.put(clave, String(usadas + 1), { expirationTtl: TTL });
    await kv.put(claveG, String(usadasGlobal + 1), { expirationTtl: TTL });
  } catch (e) {
    console.error("Fallo escribiendo KV.", e);
  }
  return limite - usadas - 1;
}
