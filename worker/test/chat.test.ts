import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";
import { costeMicro, claveGastoDia, claveGastoMes } from "../src/chat-gasto";
import { SUSTITUTO } from "../src/seguridad";
import { HERRAMIENTAS } from "../src/chat-herramientas";
import { SYSTEM_PROMPT } from "../src/chat-prompt";

const ORIGEN = "https://alex.github.io";
const CLAVE = "sk-ant-clave-de-prueba-123";

class KVMemoria {
  datos = new Map<string, string>();
  async get(k: string) {
    return this.datos.get(k) ?? null;
  }
  async put(k: string, v: string) {
    this.datos.set(k, v);
  }
}

function env(extra: Partial<Env> = {}): Env & { RATE_LIMIT: KVMemoria } {
  return {
    ANTHROPIC_API_KEY: CLAVE,
    ALLOWED_ORIGINS: ORIGEN,
    CHAT_DAILY_LIMIT: "2",
    RATE_LIMIT: new KVMemoria() as unknown as KVNamespace,
    ...extra,
  } as Env & { RATE_LIMIT: KVMemoria };
}

function peticion(cuerpo: unknown, opts: { origen?: string | null; metodo?: string; tipo?: string; ip?: string } = {}) {
  const h: Record<string, string> = { "Content-Type": opts.tipo ?? "application/json", "CF-Connecting-IP": opts.ip ?? "1.2.3.4" };
  if (opts.origen !== null) h.Origin = opts.origen ?? ORIGEN;
  const metodo = opts.metodo ?? "POST";
  return new Request("https://w.example/chat", {
    method: metodo,
    headers: h,
    body: metodo === "POST" ? (typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo)) : undefined,
  });
}

const user = (c: unknown) => ({ role: "user", content: c });
const asst = (c: unknown) => ({ role: "assistant", content: c });
const uso = { input_tokens: 1000, cache_creation_input_tokens: 2000, cache_read_input_tokens: 4000, output_tokens: 500 };

function respuestaClaude(over: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [{ type: "text", text: "Hola, prueba." }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: uso,
      ...over,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => respuestaClaude());
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const llamar = (r: Request, e: Env = env()) => worker.fetch(r, e);
const enviado = () => JSON.parse(fetchMock.mock.calls[0]![1].body);

describe("/chat: CORS y método", () => {
  it("rechaza orígenes fuera de la lista", async () => {
    const r = await llamar(peticion({ messages: [user("hola")] }, { origen: "https://malo.example" }));
    expect(r.status).toBe(403);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
  it("OPTIONS 204, GET 405, tipo 415", async () => {
    const o = await llamar(peticion(null, { metodo: "OPTIONS" }));
    expect(o.status).toBe(204);
    expect(o.headers.get("Access-Control-Allow-Origin")).toBe(ORIGEN);
    expect((await llamar(peticion(null, { metodo: "GET" }))).status).toBe(405);
    expect((await llamar(peticion("x", { tipo: "text/plain" }))).status).toBe(415);
  });
  it("500 sin ANTHROPIC_API_KEY", async () => {
    const r = await llamar(peticion({ messages: [user("hola")] }), env({ ANTHROPIC_API_KEY: undefined }));
    expect(r.status).toBe(500);
    expect((await r.json()).error.codigo).toBe("configuracion_incompleta");
  });
  it("200 con CORS y cabecera de restantes", async () => {
    const r = await llamar(peticion({ messages: [user("hola")] }));
    expect(r.status).toBe(200);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe(ORIGEN);
    expect(r.headers.get("X-Restantes-Hoy")).toBe("1");
  });
});

describe("/chat: validación", () => {
  const malos: Array<[string, unknown]> = [
    ["JSON roto", "{no"],
    ["sin messages", {}],
    ["messages vacío", { messages: [] }],
    ["rol system", { messages: [{ role: "system", content: "x" }] }],
    ["empieza por assistant", { messages: [asst("x"), user("y")] }],
    ["no alterna", { messages: [user("a"), user("b"), user("c")] }],
    ["termina en assistant", { messages: [user("a"), asst("b")] }],
    ["bloque image en user", { messages: [user([{ type: "image", source: {} }])] }],
    ["bloque tool_use en user", { messages: [user([{ type: "tool_use", id: "a", name: "b", input: {} }])] }],
    ["text sin texto", { messages: [user([{ type: "text" }])] }],
    ["tool_result sin id", { messages: [user([{ type: "tool_result", content: "x" }])] }],
    ["content vacío", { messages: [user([])] }],
    ["user string vacío", { messages: [user("")] }],
  ];
  for (const [nombre, cuerpo] of malos) {
    it(`400 solicitud_invalida: ${nombre}`, async () => {
      const r = await llamar(peticion(cuerpo));
      expect(r.status).toBe(400);
      expect((await r.json()).error.codigo).toBe("solicitud_invalida");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }
  it("más de 40 mensajes -> conversacion_larga", async () => {
    const messages = Array.from({ length: 41 }, (_, i) => (i % 2 === 0 ? user("a") : asst("b")));
    const r = await llamar(peticion({ messages }));
    expect(r.status).toBe(400);
    const e = (await r.json()).error;
    expect(e.codigo).toBe("conversacion_larga");
    expect(e.mensaje).toBe("Empieza una conversación nueva.");
  });
  it("40 mensajes es el máximo pero par -> termina en assistant, inválido; 39 vale", async () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? user("a") : asst("b")));
    expect((await llamar(peticion({ messages: mk(40) }))).status).toBe(400);
    expect((await llamar(peticion({ messages: mk(39) }))).status).toBe(200);
  });
  it("cuerpo > 200 KB -> 413", async () => {
    const r = await llamar(peticion({ messages: [user("x".repeat(210 * 1024))] }));
    expect(r.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("acepta assistant con thinking y tool_use tal cual y user con tool_result", async () => {
    const messages = [
      user([{ type: "text", text: "<contexto_app>{}</contexto_app> hola" }]),
      asst([
        { type: "thinking", thinking: "", signature: "abc" },
        { type: "tool_use", id: "tu_1", name: "buscar_sitios", input: { n: 3 } },
      ]),
      user([{ type: "tool_result", tool_use_id: "tu_1", content: "[]" }]),
    ];
    const r = await llamar(peticion({ messages }));
    expect(r.status).toBe(200);
    expect(enviado().messages).toEqual(messages);
  });
});

describe("/chat: límites", () => {
  it("el límite por IP cuenta solo consultas nuevas y usa claves propias", async () => {
    const e = env();
    const nueva = { messages: [user("hola")] };
    expect((await llamar(peticion(nueva), e)).status).toBe(200);
    expect((await llamar(peticion(nueva), e)).status).toBe(200);
    const r3 = await llamar(peticion(nueva), e);
    expect(r3.status).toBe(429);
    expect((await r3.json()).error.codigo).toBe("limite_diario_superado");
    // una ronda de herramientas no consume ni se bloquea por el límite diario
    const ronda = {
      messages: [
        user("hola"),
        asst([{ type: "tool_use", id: "t1", name: "semaforo", input: {} }]),
        user([{ type: "tool_result", tool_use_id: "t1", content: "ok" }]),
      ],
    };
    const r4 = await llamar(peticion(ronda), e);
    expect(r4.status).toBe(200);
    expect(r4.headers.get("X-Restantes-Hoy")).toBeNull();
    const claves = [...e.RATE_LIMIT.datos.keys()];
    expect(claves.some((k) => k.startsWith("chat:"))).toBe(true);
    expect(claves.some((k) => k.startsWith("rl:"))).toBe(false);
  });

  const conRondas = (n: number) => {
    const messages: unknown[] = [user("hola")];
    for (let i = 0; i < n; i++) {
      messages.push(asst([{ type: "tool_use", id: `t${i}`, name: "semaforo", input: {} }]));
      messages.push(user([{ type: "tool_result", tool_use_id: `t${i}`, content: "ok" }]));
    }
    return { messages };
  };
  it("6 rondas previas -> 429 demasiadas_rondas; 5 pasan", async () => {
    const r = await llamar(peticion(conRondas(6)));
    expect(r.status).toBe(429);
    expect((await r.json()).error.codigo).toBe("demasiadas_rondas");
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await llamar(peticion(conRondas(5)))).status).toBe(200);
  });
  it("las rondas se cuentan desde el último user con texto", async () => {
    const previa = conRondas(6).messages;
    const messages = [...previa, asst("fin"), user("otra pregunta")];
    expect((await llamar(peticion({ messages }))).status).toBe(200);
  });

  it("tope diario -> 429 tope_gasto sin llamar a Claude", async () => {
    const e = env();
    e.RATE_LIMIT.datos.set(claveGastoDia(new Date()), String(1.5e6));
    const r = await llamar(peticion({ messages: [user("hola")] }), e);
    expect(r.status).toBe(429);
    const err = (await r.json()).error;
    expect(err.codigo).toBe("tope_gasto");
    expect(err.mensaje).toBe("El asistente ha llegado a su tope de gasto. Vuelve a intentarlo mañana.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("tope mensual -> 429 tope_gasto, también en rondas", async () => {
    const e = env({ CHAT_MONTHLY_USD: "10" });
    e.RATE_LIMIT.datos.set(claveGastoMes(new Date()), String(10e6));
    const r = await llamar(peticion({ messages: [user("hola")] }), e);
    expect(r.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("justo por debajo del tope pasa", async () => {
    const e = env();
    e.RATE_LIMIT.datos.set(claveGastoDia(new Date()), String(1.5e6 - 1));
    expect((await llamar(peticion({ messages: [user("hola")] }), e)).status).toBe(200);
  });
  it("suma el gasto del día y del mes (entrada, escritura y lectura de caché, salida)", async () => {
    const e = env();
    await llamar(peticion({ messages: [user("hola")] }), e);
    // 1000*4 + 2000*5 + 4000*0.2 + 500*20 = 4000+10000+800+10000
    const esperado = 24800;
    expect(e.RATE_LIMIT.datos.get(claveGastoDia(new Date()))).toBe(String(esperado));
    expect(e.RATE_LIMIT.datos.get(claveGastoMes(new Date()))).toBe(String(esperado));
    await llamar(peticion({ messages: [user("otra")] }), e);
    expect(e.RATE_LIMIT.datos.get(claveGastoDia(new Date()))).toBe(String(esperado * 2));
  });
  it("sin KV con REQUIRE_KV=true -> 503 sin llamar a Claude", async () => {
    const r = await llamar(peticion({ messages: [user("hola")] }), env({ RATE_LIMIT: undefined, REQUIRE_KV: "true" }));
    expect(r.status).toBe(503);
    expect((await r.json()).error.codigo).toBe("servicio_no_disponible");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("KV que falla al leer con REQUIRE_KV=true -> 503", async () => {
    const kv = { get: async () => { throw new Error("kv caído"); }, put: async () => {} } as unknown as KVNamespace;
    const r = await llamar(peticion({ messages: [user("hola")] }), env({ RATE_LIMIT: kv, REQUIRE_KV: "true" }));
    expect(r.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("sin KV y sin REQUIRE_KV sigue adelante", async () => {
    expect((await llamar(peticion({ messages: [user("hola")] }), env({ RATE_LIMIT: undefined }))).status).toBe(200);
  });
});

describe("costeMicro", () => {
  it("modelo desconocido usa precios de Opus", () => {
    expect(costeMicro({ input_tokens: 1000, output_tokens: 100 }, "claude-nuevo-9")).toBe(1000 * 4 + 100 * 20);
  });
  it("sonnet y haiku", () => {
    expect(costeMicro(uso, "claude-sonnet-5-5")).toBe(1000 * 2 + 2000 * 2.5 + 4000 * 0.2 + 500 * 10);
    expect(costeMicro(uso, "claude-haiku-5-5")).toBe(Math.ceil(1000 * 0.1 + 2000 * 0.125 + 4000 * 0.01 + 500 * 0.5));
  });
  it("suma cada iteración (fallback), cada una con su modelo", () => {
    const c = costeMicro(
      { ...uso, iterations: [{ input_tokens: 100, output_tokens: 10 }, { input_tokens: 100, output_tokens: 10, model: "claude-sonnet-5-5" }] },
      "claude-opus-5-5",
    );
    expect(c).toBe(100 * 4 + 10 * 20 + 100 * 2 + 10 * 10);
  });
});

describe("/chat: respuesta", () => {
  it("texto filtrado, content intacto", async () => {
    const content = [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: "Ve al sitio 1. Esta seta es comestible y muy buena. Lleva agua." },
    ];
    fetchMock.mockResolvedValue(respuestaClaude({ content }));
    const r = await llamar(peticion({ messages: [user("hola")] }));
    const b = await r.json();
    expect(b.content).toEqual(content);
    expect(b.texto).toContain(SUSTITUTO);
    expect(b.texto).not.toMatch(/comestible/i);
    expect(b.texto).toContain("Ve al sitio 1.");
    expect(b.stop_reason).toBe("end_turn");
    expect(b.aviso).toMatch(/experto/);
  });
  it("tool_use se devuelve para que el cliente ejecute la herramienta", async () => {
    const content = [{ type: "tool_use", id: "tu_9", name: "buscar_sitios", input: { n: 3 } }];
    fetchMock.mockResolvedValue(respuestaClaude({ content, stop_reason: "tool_use" }));
    const b = await (await llamar(peticion({ messages: [user("hola")] }))).json();
    expect(b.stop_reason).toBe("tool_use");
    expect(b.content).toEqual(content);
    expect(b.texto).toBe("");
  });
  it("refusal -> texto fijo", async () => {
    fetchMock.mockResolvedValue(respuestaClaude({ content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: null, explanation: null } }));
    const b = await (await llamar(peticion({ messages: [user("hola")] }))).json();
    expect(b.stop_reason).toBe("refusal");
    expect(b.texto).toBe("No puedo responder a eso; prueba a reformularlo.");
  });
});

describe("/chat: errores de Anthropic", () => {
  const err = (status: number, tipo: string) =>
    new Response(JSON.stringify({ type: "error", error: { type: tipo, message: `interno ${CLAVE}` } }), { status, headers: { "Content-Type": "application/json" } });

  it("429 -> 503 claude_saturado", async () => {
    fetchMock.mockImplementation(async () => err(429, "rate_limit_error"));
    const r = await llamar(peticion({ messages: [user("hola")] }));
    expect(r.status).toBe(503);
    const txt = JSON.stringify(await r.json());
    expect(txt).toContain("claude_saturado");
    expect(txt).not.toContain(CLAVE);
  });
  it("500 -> 502 claude_error sin filtrar el mensaje interno", async () => {
    fetchMock.mockImplementation(async () => err(500, "api_error"));
    const r = await llamar(peticion({ messages: [user("hola")] }));
    expect(r.status).toBe(502);
    const txt = JSON.stringify(await r.json());
    expect(txt).toContain("claude_error");
    expect(txt).not.toContain("interno");
    expect(txt).not.toContain(CLAVE);
  });
  it("401 -> 502 claude_error", async () => {
    fetchMock.mockImplementation(async () => err(401, "authentication_error"));
    expect((await llamar(peticion({ messages: [user("hola")] }))).status).toBe(502);
  });
  it("tiempo agotado -> 504", async () => {
    fetchMock.mockImplementation(async () => {
      const e = new Error("Request timed out.");
      e.name = "AbortError";
      throw e;
    });
    const r = await llamar(peticion({ messages: [user("hola")] }));
    expect(r.status).toBe(504);
    expect((await r.json()).error.codigo).toBe("claude_tiempo_agotado");
  });
  it("un error de Claude no suma gasto", async () => {
    fetchMock.mockImplementation(async () => err(500, "api_error"));
    const e = env();
    await llamar(peticion({ messages: [user("hola")] }), e);
    expect(e.RATE_LIMIT.datos.has(claveGastoDia(new Date()))).toBe(false);
  });
});

describe("/chat: petición enviada a Anthropic", () => {
  it("lleva tools, system, effort, fallbacks y cache_control; nunca thinking ni tool_choice forzado", async () => {
    await llamar(peticion({ messages: [user("hola")] }));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/v1/messages");
    const cuerpo = enviado();
    expect(cuerpo.model).toBe("claude-opus-5-5");
    expect(cuerpo.max_tokens).toBe(4000);
    expect(cuerpo.system).toBe(SYSTEM_PROMPT);
    expect(cuerpo.tools.map((t: { name: string }) => t.name)).toEqual(HERRAMIENTAS.map((t) => t.name));
    expect(cuerpo.tool_choice).toEqual({ type: "auto" });
    expect(cuerpo.output_config).toEqual({ effort: "low" });
    expect(cuerpo.cache_control).toEqual({ type: "ephemeral" });
    expect(cuerpo.fallbacks).toBe("default");
    expect(cuerpo).not.toHaveProperty("thinking");
    expect(cuerpo).not.toHaveProperty("stream");
    const cab = new Headers(init.headers);
    expect(cab.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
  });
  it("respeta CLAUDE_MODEL y CLAUDE_EFFORT; haiku sin fallback", async () => {
    await llamar(peticion({ messages: [user("hola")] }), env({ CLAUDE_MODEL: "claude-haiku-5-5", CLAUDE_EFFORT: "medium" }));
    const cuerpo = enviado();
    expect(cuerpo.model).toBe("claude-haiku-5-5");
    expect(cuerpo.output_config).toEqual({ effort: "medium" });
    expect(cuerpo).not.toHaveProperty("fallbacks");
    expect(new Headers(fetchMock.mock.calls[0]![1].headers).get("anthropic-beta") ?? "").not.toContain("fallback");
  });
  it("el system prompt es estable: sin fechas ni cifras de año", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/20\d\d/);
  });
  it("la clave no aparece en ninguna respuesta", async () => {
    const r = await llamar(peticion({ messages: [user("hola")] }));
    expect(JSON.stringify(await r.json())).not.toContain(CLAVE);
    expect([...r.headers.values()].join(" ")).not.toContain(CLAVE);
  });
});
