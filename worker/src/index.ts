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
import { llamarGemini, llamarGeminiConCuerpo } from "./gemini";
import { postProcesar, validarSalida } from "./seguridad";
import {
  PREFIJO_EXPLORAR,
  consumir,
  limiteDiario,
  limiteExplorarDiario,
  limiteExplorarGlobal,
  limiteGlobal,
  claveCliente,
} from "./limite";
import { MAX_BYTES_CUERPO_EXPLORAR, cuerpoGeminiExplorar, postProcesarExplorar, validarPeticionExplorar } from "./explorar";
import { manejarChat } from "./chat";
import { manejarResolverEnlace } from "./mapas-enlace";

export interface Env {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  ALLOWED_ORIGINS?: string;
  DAILY_LIMIT?: string;
  GLOBAL_DAILY_LIMIT?: string;
  /** Barridos de /explorar por IP y día (cupo propio, aparte de DAILY_LIMIT). */
  EXPLORAR_DAILY_LIMIT?: string;
  EXPLORAR_GLOBAL_LIMIT?: string;
  REQUIRE_KV?: string;
  ANTHROPIC_API_KEY?: string;
  CLAUDE_MODEL?: string;
  CLAUDE_EFFORT?: string;
  CHAT_DAILY_LIMIT?: string;
  CHAT_DAILY_USD?: string;
  CHAT_MONTHLY_USD?: string;
  /** Peticiones /chat por IP y día, contando también las rondas de herramientas (anti-falsificación del historial). */
  CHAT_PETICIONES_DIA?: string;
  /** Gasto máximo del chat por IP y día en USD (que una sola IP no agote el tope global). */
  CHAT_IP_DAILY_USD?: string;
  /** Enlaces cortos de Google Maps resueltos por IP y día (POST /resolver-enlace). */
  MAPAS_DAILY_LIMIT?: string;
  RATE_LIMIT?: KVNamespace;
}

// Sin `export`: workerd rechaza exportaciones del módulo principal que no sean manejadores.
const MODELO_POR_DEFECTO = "gemini-3.8-flash";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origen = origenValido(request, env.ALLOWED_ORIGINS);

    // Lista blanca de orígenes: todo lo demás se rechaza (incluido sin cabecera Origin).
    if (!origen) {
      return respuestaError(new ErrorHttp(403, "origen_no_permitido", "Origen no permitido."));
    }
    const cors = cabecerasCors(origen);

    const esExplorar = url.pathname === "/explorar";
    const esChat = url.pathname === "/chat";
    const esEnlace = url.pathname === "/resolver-enlace";
    if (url.pathname !== "/identificar" && !esExplorar && !esChat && !esEnlace) {
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
      if (esChat) return await manejarChat(request, env, cors);
      if (esEnlace) return await manejarResolverEnlace(request, env, cors);
      if (!env.GEMINI_API_KEY) {
        throw new ErrorHttp(500, "configuracion_incompleta", "El servicio no está configurado.");
      }

      const texto = await leerCuerpoLimitado(request, esExplorar ? MAX_BYTES_CUERPO_EXPLORAR : MAX_BYTES_CUERPO);
      let cuerpo: unknown;
      try {
        cuerpo = JSON.parse(texto);
      } catch {
        throw new ErrorHttp(400, "solicitud_invalida", "El cuerpo no es JSON válido.");
      }
      const ip = claveCliente(request.headers.get("CF-Connecting-IP"));
      const modelo = env.GEMINI_MODEL || MODELO_POR_DEFECTO;

      if (esExplorar) {
        const pe = validarPeticionExplorar(cuerpo);
        const restantes = await consumir(env.RATE_LIMIT, ip, limiteExplorarDiario(env.EXPLORAR_DAILY_LIMIT), {
          limiteGlobal: limiteExplorarGlobal(env.EXPLORAR_GLOBAL_LIMIT),
          requerirKv: env.REQUIRE_KV === "true",
          prefijo: PREFIJO_EXPLORAR,
          unidad: "barridos",
        });
        const bruto = await llamarGeminiConCuerpo(cuerpoGeminiExplorar(pe), env.GEMINI_API_KEY, modelo);
        const resultado = postProcesarExplorar(
          bruto,
          pe.fotos.map((f) => f.rumbo),
        );
        const extra: Record<string, string> = { ...cors };
        if (restantes !== null) extra["X-Restantes-Hoy"] = String(restantes);
        return json(resultado, 200, extra);
      }

      const peticion = validarPeticion(cuerpo);

      const restantes = await consumir(env.RATE_LIMIT, ip, limiteDiario(env.DAILY_LIMIT), {
        limiteGlobal: limiteGlobal(env.GLOBAL_DAILY_LIMIT),
        requerirKv: env.REQUIRE_KV === "true",
      });

      const bruto = await llamarGemini(peticion, env.GEMINI_API_KEY, modelo);
      const resultado = postProcesar(validarSalida(bruto), peticion.respuestas_guiadas);

      const extra: Record<string, string> = { ...cors };
      if (restantes !== null) extra["X-Restantes-Hoy"] = String(restantes);
      return json(resultado, 200, extra);
    } catch (e) {
      if (e instanceof ErrorHttp) return respuestaError(e, cors);
      console.error("Error inesperado", e instanceof Error ? e.message : e);
      return respuestaError(new ErrorHttp(500, esChat ? "claude_error" : "gemini_error", "Error interno."), cors);
    }
  },
} satisfies ExportedHandler<Env>;
