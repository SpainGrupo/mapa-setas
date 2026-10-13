// Utilidades HTTP: CORS con lista blanca y errores JSON claros.

export type CodigoError =
  | "origen_no_permitido"
  | "ruta_no_encontrada"
  | "metodo_no_permitido"
  | "tipo_contenido_no_soportado"
  | "carga_demasiado_grande"
  | "solicitud_invalida"
  | "limite_diario_superado"
  | "configuracion_incompleta"
  | "gemini_tiempo_agotado"
  | "gemini_saturado"
  | "gemini_error"
  | "contenido_bloqueado"
  | "respuesta_invalida";

export class ErrorHttp extends Error {
  constructor(
    public status: number,
    public codigo: CodigoError,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

export function origenesPermitidos(lista: string | undefined): Set<string> {
  return new Set(
    (lista ?? "")
      .split(",")
      .map((s) => s.trim().replace(/\/+$/, ""))
      .filter(Boolean),
  );
}

/** Devuelve el origen si está en la lista blanca; null en otro caso (incluido sin cabecera Origin). */
export function origenValido(request: Request, lista: string | undefined): string | null {
  const origen = request.headers.get("Origin");
  if (!origen) return null;
  return origenesPermitidos(lista).has(origen) ? origen : null;
}

export function cabecerasCors(origen: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origen,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Expose-Headers": "X-Restantes-Hoy",
    Vary: "Origin",
  };
}

export function json(cuerpo: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}

export function respuestaError(e: ErrorHttp, extra: Record<string, string> = {}): Response {
  return json({ error: { codigo: e.codigo, mensaje: e.message } }, e.status, extra);
}

/** Lee el cuerpo como texto cortando en cuanto supera `max` bytes (no confía solo en Content-Length). */
export async function leerCuerpoLimitado(request: Request, max: number): Promise<string> {
  const declarado = Number(request.headers.get("Content-Length") ?? "NaN");
  if (Number.isFinite(declarado) && declarado > max) {
    throw new ErrorHttp(413, "carga_demasiado_grande", `La solicitud supera el máximo de ${max} bytes.`);
  }
  if (!request.body) return "";
  const lector = request.body.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await lector.cancel();
      throw new ErrorHttp(413, "carga_demasiado_grande", `La solicitud supera el máximo de ${max} bytes.`);
    }
    trozos.push(value);
  }
  const todo = new Uint8Array(total);
  let pos = 0;
  for (const t of trozos) {
    todo.set(t, pos);
    pos += t.byteLength;
  }
  return new TextDecoder().decode(todo);
}
