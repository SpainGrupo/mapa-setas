import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";
import { AVISO, limpiarTexto, SUSTITUTO } from "../src/seguridad";
import { MAX_BYTES_CUERPO, MAX_BYTES_FOTO } from "../src/validar";
import { cuerpoGemini } from "../src/gemini";

const ORIGEN = "https://alex.github.io";
const JPEG = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49));

class KVMemoria {
  datos = new Map<string, string>();
  async get(k: string) {
    return this.datos.get(k) ?? null;
  }
  async put(k: string, v: string) {
    this.datos.set(k, v);
  }
}

function env(extra: Partial<Env> = {}): Env {
  return {
    GEMINI_API_KEY: "clave-de-prueba",
    GEMINI_MODEL: "gemini-3.8-flash",
    ALLOWED_ORIGINS: `${ORIGEN}, http://localhost:5173/`,
    DAILY_LIMIT: "3",
    RATE_LIMIT: new KVMemoria() as unknown as KVNamespace,
    ...extra,
  };
}

function peticion(cuerpo: unknown, opts: { origen?: string | null; metodo?: string; ruta?: string; tipo?: string; ip?: string } = {}) {
  const h: Record<string, string> = { "Content-Type": opts.tipo ?? "application/json", "CF-Connecting-IP": opts.ip ?? "1.2.3.4" };
  if (opts.origen !== null) h.Origin = opts.origen ?? ORIGEN;
  const metodo = opts.metodo ?? "POST";
  return new Request(`https://w.example${opts.ruta ?? "/identificar"}`, {
    method: metodo,
    headers: h,
    body: metodo === "POST" ? (typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo)) : undefined,
  });
}

const valida = {
  fotos: [JPEG],
  respuestas_guiadas: { himenio: "laminas", anillo: true },
  contexto: { arbol: "alcornoque", altitud: 600, fecha: "2026-10-20", lat: 36.6, lon: -5.1 },
  candidatos_offline: [{ id: "amanita_caesarea", nombre: "Amanita caesarea", score: 0.6 }],
};

const salidaModelo = {
  candidatos: [
    {
      nombre_cientifico: "Agaricus campestris",
      nombre_comun: "Champiñón silvestre",
      confianza: "media",
      rasgos_observados: ["Láminas rosadas libres", "Anillo simple"],
      rasgos_que_faltan_ver: ["Base del pie"],
    },
  ],
  peligrosas_posibles: [{ nombre_cientifico: "Amanita verna", motivo: "Blanca con anillo" }],
  fotos_recomendadas: ["Base del pie desenterrada"],
  aviso: "Lo que sea",
};

function respuestaGemini(obj: unknown, extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: typeof obj === "string" ? obj : JSON.stringify(obj) }] } }],
      ...extra,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => respuestaGemini(salidaModelo));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const llamar = (r: Request, e: Env = env()) => worker.fetch(r, e);

describe("CORS", () => {
  it("rechaza orígenes fuera de la lista", async () => {
    const r = await llamar(peticion(valida, { origen: "https://malo.example" }));
    expect(r.status).toBe(403);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect((await r.json()).error.codigo).toBe("origen_no_permitido");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rechaza peticiones sin Origin", async () => {
    expect((await llamar(peticion(valida, { origen: null }))).status).toBe(403);
  });
  it("rechaza si ALLOWED_ORIGINS está vacío", async () => {
    expect((await llamar(peticion(valida), env({ ALLOWED_ORIGINS: "" }))).status).toBe(403);
  });
  it("acepta el preflight de un origen permitido (normaliza barra final)", async () => {
    const r = await llamar(peticion(null, { metodo: "OPTIONS", origen: "http://localhost:5173" }));
    expect(r.status).toBe(204);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    expect(r.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });
  it("devuelve cabeceras CORS en la respuesta 200", async () => {
    const r = await llamar(peticion(valida));
    expect(r.status).toBe(200);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe(ORIGEN);
    expect(r.headers.get("Vary")).toBe("Origin");
  });
});

describe("rutas y método", () => {
  it("404 en otra ruta", async () => {
    expect((await llamar(peticion(valida, { ruta: "/otra" }))).status).toBe(404);
  });
  it("405 con GET", async () => {
    expect((await llamar(peticion(null, { metodo: "GET" }))).status).toBe(405);
  });
  it("415 sin JSON", async () => {
    expect((await llamar(peticion("x", { tipo: "text/plain" }))).status).toBe(415);
  });
  it("500 claro si falta la clave", async () => {
    const r = await llamar(peticion(valida), env({ GEMINI_API_KEY: undefined }));
    expect(r.status).toBe(500);
    expect((await r.json()).error.codigo).toBe("configuracion_incompleta");
  });
});

describe("límites de tamaño y validación", () => {
  it("400 con una comunidad fuera de la lista cerrada (incluidas claves de Object.prototype)", async () => {
    const malas: unknown[] = ["galicia", "Andalucia", "__proto__", "toString", "constructor", "hasOwnProperty", "", 3, { a: 1 }, ["andalucia"]];
    for (const [i, ccaa] of malas.entries()) {
      const r = await llamar(peticion({ ...valida, contexto: { ...valida.contexto, ccaa } }, { ip: `9.9.9.${i}` }));
      expect(r.status, String(ccaa)).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("413 si el cuerpo supera el máximo", async () => {
    const enorme = "a".repeat(MAX_BYTES_CUERPO + 10);
    const r = await llamar(peticion(enorme));
    expect(r.status).toBe(413);
  });
  it("413 si una foto supera 1,5 MB decodificada", async () => {
    const n = Math.ceil(((MAX_BYTES_FOTO + 3) * 4) / 3 / 4) * 4;
    const grande = JPEG.slice(0, 4) + "A".repeat(n - 4);
    const r = await llamar(peticion({ ...valida, fotos: [grande] }));
    expect(r.status).toBe(413);
    expect((await r.json()).error.codigo).toBe("carga_demasiado_grande");
  });
  it("acepta una foto justo en 1,5 MB", async () => {
    const n = (MAX_BYTES_FOTO * 4) / 3; // múltiplo de 4
    const justa = JPEG.slice(0, 4) + "A".repeat(n - 4);
    expect((await llamar(peticion({ ...valida, fotos: [justa] }))).status).toBe(200);
  });
  it("400 con 0 o 5 fotos", async () => {
    expect((await llamar(peticion({ ...valida, fotos: [] }))).status).toBe(400);
    expect((await llamar(peticion({ ...valida, fotos: [JPEG, JPEG, JPEG, JPEG, JPEG] }))).status).toBe(400);
  });
  it("acepta 4 fotos y prefijo data: URL", async () => {
    const r = await llamar(peticion({ ...valida, fotos: [JPEG, JPEG, JPEG, `data:image/jpeg;base64,${JPEG}`] }));
    expect(r.status).toBe(200);
    const enviado = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(enviado.contents[0].parts.filter((p: any) => p.inline_data)).toHaveLength(4);
    expect(enviado.contents[0].parts[3].inline_data.data).toBe(JPEG);
  });
  it("400 si no es JPEG o no es base64", async () => {
    expect((await llamar(peticion({ ...valida, fotos: [btoa("PNGxxxxxx")] }))).status).toBe(400);
    expect((await llamar(peticion({ ...valida, fotos: ["no base64!"] }))).status).toBe(400);
  });
  it("400 con JSON roto o campos extraños", async () => {
    expect((await llamar(peticion("{roto"))).status).toBe(400);
    expect((await llamar(peticion({ ...valida, contexto: { hack: 1 } }))).status).toBe(400);
    expect((await llamar(peticion({ ...valida, contexto: { lat: 200 } }))).status).toBe(400);
    expect((await llamar(peticion({ ...valida, respuestas_guiadas: { volva: { a: 1 } } }))).status).toBe(400);
    expect((await llamar(peticion({ ...valida, respuestas_guiadas: { volva: "x".repeat(500) } }))).status).toBe(400);
  });
});

describe("límite diario por IP", () => {
  it("permite DAILY_LIMIT peticiones y luego 429", async () => {
    const e = env();
    for (let i = 0; i < 3; i++) {
      const r = await llamar(peticion(valida), e);
      expect(r.status).toBe(200);
      expect(r.headers.get("X-Restantes-Hoy")).toBe(String(2 - i));
    }
    const r = await llamar(peticion(valida), e);
    expect(r.status).toBe(429);
    expect((await r.json()).error.codigo).toBe("limite_diario_superado");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Otra IP sigue pudiendo
    expect((await llamar(peticion(valida, { ip: "5.6.7.8" }), e)).status).toBe(200);
  });
  it("usa 50 por defecto si DAILY_LIMIT no es válido", async () => {
    const r = await llamar(peticion(valida), env({ DAILY_LIMIT: "abc" }));
    expect(r.headers.get("X-Restantes-Hoy")).toBe("49");
  });
  it("sin KV no limita (fallback de desarrollo)", async () => {
    const e = env({ RATE_LIMIT: undefined, DAILY_LIMIT: "1" });
    for (let i = 0; i < 3; i++) expect((await llamar(peticion(valida), e)).status).toBe(200);
  });
  it("las peticiones inválidas no consumen cupo", async () => {
    const kv = new KVMemoria();
    await llamar(peticion({ fotos: [] }), env({ RATE_LIMIT: kv as unknown as KVNamespace }));
    expect(kv.datos.size).toBe(0);
  });
});

describe("tope global diario y KV obligatorio", () => {
  const hoy = () => new Date().toISOString().slice(0, 10);
  it("429 global al alcanzar GLOBAL_DAILY_LIMIT aunque se rote la IP", async () => {
    const e = env({ DAILY_LIMIT: "50", GLOBAL_DAILY_LIMIT: "2" });
    expect((await llamar(peticion(valida, { ip: "1.1.1.1" }), e)).status).toBe(200);
    expect((await llamar(peticion(valida, { ip: "2.2.2.2" }), e)).status).toBe(200);
    const r = await llamar(peticion(valida, { ip: "3.3.3.3" }), e);
    expect(r.status).toBe(429);
    const err = (await r.json()).error;
    expect(err.codigo).toBe("limite_global_superado");
    expect(err.mensaje).toBe("El servicio ha alcanzado su límite diario. Vuelve a intentarlo mañana.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("cuenta IP y global a la vez", async () => {
    const kv = new KVMemoria();
    const e = env({ RATE_LIMIT: kv as unknown as KVNamespace });
    await llamar(peticion(valida, { ip: "9.9.9.9" }), e);
    expect(kv.datos.get(`rl:${hoy()}:9.9.9.9`)).toBe("1");
    expect(kv.datos.get(`rl:${hoy()}:__global__`)).toBe("1");
  });
  it("si se supera el límite por IP no incrementa el global", async () => {
    const kv = new KVMemoria();
    const e = env({ RATE_LIMIT: kv as unknown as KVNamespace, DAILY_LIMIT: "1" });
    await llamar(peticion(valida), e);
    expect((await llamar(peticion(valida), e)).status).toBe(429);
    expect(kv.datos.get(`rl:${hoy()}:__global__`)).toBe("1");
  });
  it("usa 300 por defecto si GLOBAL_DAILY_LIMIT no es válido", async () => {
    const kv = new KVMemoria();
    kv.datos.set(`rl:${hoy()}:__global__`, "299");
    const e = env({ RATE_LIMIT: kv as unknown as KVNamespace, GLOBAL_DAILY_LIMIT: "x" });
    expect((await llamar(peticion(valida), e)).status).toBe(200);
    expect((await llamar(peticion(valida), e)).status).toBe(429);
  });
  it("REQUIRE_KV=true sin KV -> 503 y no llama a Gemini", async () => {
    const r = await llamar(peticion(valida), env({ RATE_LIMIT: undefined, REQUIRE_KV: "true" }));
    expect(r.status).toBe(503);
    expect((await r.json()).error.codigo).toBe("servicio_no_disponible");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("REQUIRE_KV=true y KV.get lanza -> 503 y no llama a Gemini", async () => {
    const kv = { get: async () => { throw new Error("kv caído"); }, put: async () => {} };
    const r = await llamar(peticion(valida), env({ RATE_LIMIT: kv as unknown as KVNamespace, REQUIRE_KV: "true" }));
    expect(r.status).toBe(503);
    expect((await r.json()).error.codigo).toBe("servicio_no_disponible");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("sin REQUIRE_KV=true sigue fail-open si KV.get lanza", async () => {
    const kv = { get: async () => { throw new Error("kv caído"); }, put: async () => {} };
    const r = await llamar(peticion(valida), env({ RATE_LIMIT: kv as unknown as KVNamespace, REQUIRE_KV: "false" }));
    expect(r.status).toBe(200);
  });
});

describe("llamada a Gemini", () => {
  it("el prompt nombra la comunidad pedida y por defecto Andalucía", async () => {
    await llamar(peticion(valida));
    expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body).systemInstruction.parts[0].text).toContain("en Andalucía (España)");
    await llamar(peticion({ ...valida, contexto: { ...valida.contexto, ccaa: "comunitat_valenciana" } }, { ip: "5.6.7.8" }));
    const t = JSON.parse(fetchMock.mock.calls.at(-1)![1].body).systemInstruction.parts[0].text;
    expect(t).toContain("en la Comunitat Valenciana (España)");
    expect(t).not.toContain("Andalucía");
  });
  it("usa generateContent, cabecera de clave y salida JSON con esquema", async () => {
    await llamar(peticion(valida));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
    expect(init.headers["x-goog-api-key"]).toBe("clave-de-prueba");
    expect(String(url)).not.toContain("clave-de-prueba");
    const body = JSON.parse(init.body);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema.required).toContain("peligrosas_posibles");
    expect(body.systemInstruction.parts[0].text).toContain("Amanita phalloides");
    expect(body.systemInstruction.parts[0].text).toContain("Omphalotus");
    expect(body.systemInstruction.parts[0].text).toContain("Lepiota");
    expect(body.systemInstruction.parts[0].text).toContain(AVISO);
  });
  it("el prompt del usuario incluye respuestas y contexto como datos", () => {
    const b = cuerpoGemini({ ...valida, candidatos_offline: valida.candidatos_offline } as any);
    const t = b.contents[0]!.parts.at(-1) as { text: string };
    expect(t.text).toContain("alcornoque");
    expect(t.text).toContain("laminas");
  });
});

describe("validación del esquema de salida", () => {
  it("devuelve el JSON normalizado", async () => {
    const r = await llamar(peticion(valida));
    const j = await r.json();
    expect(j.candidatos[0].nombre_cientifico).toBe("Agaricus campestris");
    expect(j.candidatos[0].confianza).toBe("media");
    expect(j.fotos_recomendadas).toEqual(["Base del pie desenterrada"]);
  });
  it("502 si falta un campo obligatorio", async () => {
    fetchMock.mockResolvedValueOnce(respuestaGemini({ candidatos: [] }));
    const r = await llamar(peticion(valida));
    expect(r.status).toBe(502);
    expect((await r.json()).error.codigo).toBe("respuesta_invalida");
  });
  it("502 si la confianza no es válida", async () => {
    const malo = structuredClone(salidaModelo);
    (malo.candidatos[0] as any).confianza = "segura";
    fetchMock.mockResolvedValueOnce(respuestaGemini(malo));
    expect((await llamar(peticion(valida))).status).toBe(502);
  });
  it("502 si el texto no es JSON", async () => {
    fetchMock.mockResolvedValueOnce(respuestaGemini("esto no es json"));
    expect((await llamar(peticion(valida))).status).toBe(502);
  });
  it("ignora las partes de pensamiento", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            { finishReason: "STOP", content: { parts: [{ text: "pensando...", thought: true }, { text: JSON.stringify(salidaModelo) }] } },
          ],
        }),
      ),
    );
    expect((await llamar(peticion(valida))).status).toBe(200);
  });
  it("descarta campos no previstos", async () => {
    fetchMock.mockResolvedValueOnce(respuestaGemini({ ...salidaModelo, comestible: true }));
    const j = await (await llamar(peticion(valida))).json();
    expect(j).not.toHaveProperty("comestible");
  });
});

describe("seguridad: comestibilidad y aviso", () => {
  it("fuerza siempre el aviso", async () => {
    const j = await (await llamar(peticion(valida))).json();
    expect(j.aviso).toBe("No consumas ninguna seta sin la confirmación de un experto.");
  });
  it("elimina afirmaciones de comestibilidad (lista de guia/validar.py y ampliada)", async () => {
    const malo = structuredClone(salidaModelo);
    malo.candidatos[0]!.rasgos_observados = [
      "Láminas rosadas. Se puede comer sin problema.",
      "Es comestible segura",
      "Apta para el consumo",
      "Sin peligro alguno",
      "Es un excelente comestible.",
      "Puedes comerla tranquilamente",
      "Anillo membranoso",
    ];
    malo.peligrosas_posibles[0]!.motivo = "Blanca. Es inofensiva.";
    fetchMock.mockResolvedValueOnce(respuestaGemini(malo));
    const j = await (await llamar(peticion(valida))).json();
    const todo = JSON.stringify(j);
    for (const f of [/se puede comer/i, /comestible segur/i, /apta para el consumo/i, /sin peligro/i, /excelente comestible/i, /puedes comer/i, /inofensiv/i]) {
      expect(todo).not.toMatch(f);
    }
    expect(j.candidatos[0].rasgos_observados[0]).toBe(`Láminas rosadas. ${SUSTITUTO}`);
    expect(j.candidatos[0].rasgos_observados.at(-1)).toBe("Anillo membranoso");
  });
  it("no toca texto inocuo", () => {
    expect(limpiarTexto("Láminas libres, blancas")).toBe("Láminas libres, blancas");
  });
  it("añade amanitas mortales si hay un candidato Amanita", async () => {
    fetchMock.mockResolvedValueOnce(
      respuestaGemini({
        ...salidaModelo,
        candidatos: [{ nombre_cientifico: "Amanita caesarea", confianza: "media", rasgos_observados: [], rasgos_que_faltan_ver: [] }],
        peligrosas_posibles: [],
      }),
    );
    const j = await (await llamar(peticion(valida))).json();
    const nombres = j.peligrosas_posibles.map((p: any) => p.nombre_cientifico);
    expect(nombres).toEqual(expect.arrayContaining(["Amanita phalloides", "Amanita verna", "Amanita virosa"]));
  });
  it("añade Omphalotus para rebozuelos, Lepiota para parasoles y R. satanas para boletos sin duplicar", async () => {
    fetchMock.mockResolvedValueOnce(
      respuestaGemini({
        ...salidaModelo,
        candidatos: ["Cantharellus cibarius", "Macrolepiota procera", "Boletus aereus"].map((n) => ({
          nombre_cientifico: n, confianza: "baja", rasgos_observados: [], rasgos_que_faltan_ver: [],
        })),
        peligrosas_posibles: [{ nombre_cientifico: "omphalotus  olearius", motivo: "Parecido" }],
      }),
    );
    const j = await (await llamar(peticion(valida))).json();
    const nombres = j.peligrosas_posibles.map((p: any) => p.nombre_cientifico.toLowerCase());
    expect(nombres.filter((n: string) => n.includes("omphalotus"))).toHaveLength(1);
    expect(nombres).toContain("lepiota brunneoincarnata");
    expect(nombres).toContain("rubroboletus satanas");
  });
  it("añade amanitas mortales si la persona marcó volva", async () => {
    const j = await (await llamar(peticion({ ...valida, respuestas_guiadas: { volva: true } }))).json();
    expect(j.peligrosas_posibles.map((p: any) => p.nombre_cientifico)).toContain("Amanita phalloides");
  });
});

describe("mapeo de errores de Gemini", () => {
  it("504 si Gemini tarda más de 30 s", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(
      (_u: string, init: RequestInit) =>
        new Promise((_res, rej) => init.signal!.addEventListener("abort", () => rej(new DOMException("abort", "AbortError")))),
    );
    const p = llamar(peticion(valida));
    await vi.advanceTimersByTimeAsync(30_001);
    const r = await p;
    expect(r.status).toBe(504);
    expect((await r.json()).error.codigo).toBe("gemini_tiempo_agotado");
  });
  it("503 si Gemini devuelve 429", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 429 }));
    expect((await llamar(peticion(valida))).status).toBe(503);
  });
  it("502 sin filtrar el cuerpo de Google si devuelve 500", async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"error":{"message":"secreto interno"}}', { status: 500 }));
    const r = await llamar(peticion(valida));
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain("secreto interno");
  });
  it("502 si falla la red", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network"));
    expect((await llamar(peticion(valida))).status).toBe(502);
  });
  it("422 si el prompt está bloqueado", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } })));
    const r = await llamar(peticion(valida));
    expect(r.status).toBe(422);
    expect((await r.json()).error.codigo).toBe("contenido_bloqueado");
  });
  it("502 si la respuesta se corta (MAX_TOKENS)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{" }] } }] })),
    );
    expect((await llamar(peticion(valida))).status).toBe(502);
  });
});
