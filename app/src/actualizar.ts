// Decisión de cuándo aplicar una versión nueva del service worker (2026-11-07). Pura, para poder probarla; el cableado
// (buscar versión, guardar el estado y recargar) está en main.ts.
export type DecisionVersion = 'nada' | 'aplicar' | 'esperar' | 'manual';

/** Una recarga automática por minuto como mucho: si skipWaiting no llegara a aplicarse, no se entra en un bucle. */
export const ENFRIAMIENTO_MS = 60_000;

/**
 * - 'nada': no hay versión pendiente (o ya se está aplicando).
 * - 'esperar': hay algo en marcha (grabación, Modo campo, navegación…): aviso «se aplicará al terminar» y se reintenta.
 * - 'manual': ya hubo una recarga automática hace menos de un minuto: aviso con botón, sin recargar sola.
 * - 'aplicar': guardar el estado, activar la versión y recargar.
 */
export function decidirVersion(d: { pendiente: boolean; aplicando: boolean; algoEnMarcha: boolean; ultimaAuto: number; ahora: number }): DecisionVersion {
  if (!d.pendiente || d.aplicando) return 'nada';
  if (d.algoEnMarcha) return 'esperar';
  if (d.ahora - d.ultimaAuto < ENFRIAMIENTO_MS) return 'manual';
  return 'aplicar';
}
