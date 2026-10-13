// Worker proxy: PWA de setas -> Gemini. Spec §2 y §8.3.
import {
  ErrorHttp,
  cabecerasCors,
  json,
  leerCuerpoLimitado,
  origenValido,
  respuestaError,
} from "./http";
import { MAX_BYTES_CUERPO, validarPeticion } from "./validar";
import { llamarGemini } from "./gemini";
import { postProcesar, validarSalida } from "./seguridad";
import { consumir, limiteDiario, limiteGlobal } from "./limite";

export interface Env {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  ALLOWED_ORIGINS?: string;
  DAILY_LIMIT?: string;
  GLOBAL_DAILY_LIMIT?: string;
  REQUIRE_KV?: string;
  RATE_LIMIT?: KVNamespace;
}

export const MODELO_POR_DEFECTO = "gemini-3.8-flash";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origen = origenValido(request, env.ALLOWED_ORIGINS);

    // Lista blanca de orígenes: todo lo demás se rechaza (incluido sin cabecera Origin).
    if (!origen) {
      return respuestaError(new ErrorHttp(403, "origen_no_permitido", "Origen no permitido."));
    }
    const cors = cabecerasCors(origen);

    if (url.pathname !== "/identificar") {
      return respuestaError(new ErrorHttp(404, "ruta_no_encontrada", "Ruta no encontrada."), cors);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
      return respuestaError(new ErrorHttp(405, "metodo_no_permitido", "Usa POST."), { ...cors, Allow: "POST, OPTIONS" });
    }

    try {
      const tipo = request.headers.get("Content-Type") ?? "";
      if (!/^application\/json\b/i.test(tipo)) {
        throw new ErrorHttp(415, "tipo_contenido_no_soportado", "Envía Content-Type: application/json.");
      }
      if (!env.GEMINI_API_KEY) {
        throw new ErrorHttp(500, "configuracion_incompleta", "El servicio no está configurado.");
      }

      const texto = await leerCuerpoLimitado(request, MAX_BYTES_CUERPO);
      let cuerpo: unknown;
      try {
        cuerpo = JSON.parse(texto);
      } catch {
        throw new ErrorHttp(400, "solicitud_invalida", "El cuerpo no es JSON válido.");
      }
      const peticion = validarPeticion(cuerpo);

      const ip = request.headers.get("CF-Connecting-IP") ?? "desconocida";
      const restantes = await consumir(env.RATE_LIMIT, ip, limiteDiario(env.DAILY_LIMIT), {
        limiteGlobal: limiteGlobal(env.GLOBAL_DAILY_LIMIT),
        requerirKv: env.REQUIRE_KV === "true",
      });

      const bruto = await llamarGemini(peticion, env.GEMINI_API_KEY, env.GEMINI_MODEL || MODELO_POR_DEFECTO);
      const resultado = postProcesar(validarSalida(bruto), peticion.respuestas_guiadas);

      const extra: Record<string, string> = { ...cors };
      if (restantes !== null) extra["X-Restantes-Hoy"] = String(restantes);
      return json(resultado, 200, extra);
    } catch (e) {
      if (e instanceof ErrorHttp) return respuestaError(e, cors);
      console.error("Error inesperado", e instanceof Error ? e.message : e);
      return respuestaError(new ErrorHttp(500, "gemini_error", "Error interno."), cors);
    }
  },
} satisfies ExportedHandler<Env>;
