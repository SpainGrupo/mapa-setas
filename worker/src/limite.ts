// Límite diario por IP en KV. KV es eventualmente consistente: el tope es aproximado
// (ráfagas simultáneas pueden colarse por unas pocas peticiones), suficiente para frenar abuso.
import { ErrorHttp } from "./http";

export const LIMITE_DIARIO_POR_DEFECTO = 50;

export function limiteDiario(valor: string | undefined): number {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : LIMITE_DIARIO_POR_DEFECTO;
}

export function claveDia(ip: string, ahora: Date): string {
  return `rl:${ahora.toISOString().slice(0, 10)}:${ip}`;
}

/**
 * Cuenta una petición. Si no hay binding KV (desarrollo local sin KV), no limita y avisa en el log.
 * Devuelve las peticiones restantes hoy (o null si no hay KV).
 */
export async function consumir(
  kv: KVNamespace | undefined,
  ip: string,
  limite: number,
  ahora = new Date(),
): Promise<number | null> {
  if (!kv) {
    console.warn("RATE_LIMIT (KV) no configurado: límite diario desactivado.");
    return null;
  }
  const clave = claveDia(ip, ahora);
  let usadas = 0;
  try {
    usadas = Number((await kv.get(clave)) ?? "0") || 0;
  } catch (e) {
    console.error("Fallo leyendo KV; se continúa sin limitar esta petición.", e);
    return null;
  }
  if (usadas >= limite) {
    throw new ErrorHttp(429, "limite_diario_superado", `Has alcanzado el límite de ${limite} reconocimientos por día.`);
  }
  try {
    await kv.put(clave, String(usadas + 1), { expirationTtl: 60 * 60 * 48 });
  } catch (e) {
    console.error("Fallo escribiendo KV.", e);
  }
  return limite - usadas - 1;
}
