// Fotos en el chat (solo base64, lista blanca, tamaño, solo las de la consulta en curso) y enlaces de Google Maps
// (extracción de coordenadas y resolución de enlaces cortos con lista blanca de redirecciones: SSRF).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";
import {
  MAX_BYTES_CHAT,
  MAX_BYTES_CUERPO_CHAT,
  MAX_BYTES_FOTO,
  MAX_FOTOS,
  TEXTO_FOTO_ANTERIOR,
  bytesDeBase64,
} from "../src/chat";
import { HERRAMIENTAS, NOMBRES_HERRAMIENTAS } from "../src/chat-herramientas";
import { SYSTEM_PROMPT } from "../src/chat-prompt";
import { SUSTITUTO } from "../src/seguridad";
import { MAX_SALTOS, coordenadasDeUrl, esEnlaceCorto, hostPermitido, resolverEnlaceCorto } from "../src/mapas-enlace";

const ORIGEN = "https://alex.github.io";

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
  return { ANTHROPIC_API_KEY: "sk-ant-clave-de-prueba-123", ALLOWED_ORIGINS: ORIGEN, RATE_LIMIT: new KVMemoria() as unknown as KVNamespace, ...extra } as Env & { RATE_LIMIT: KVMemoria };
}
function peticion(ruta: string, cuerpo: unknown, ip = "1.2.3.4") {
  return new Request(`https://w.example${ruta}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGEN, "CF-Connecting-IP": ip },
    body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
  });
}
const user = (c: unknown) => ({ role: "user", content: c });
const asst = (c: unknown) => ({ role: "assistant", content: c });

function respuestaClaude(texto = "Hola, prueba.") {
  return new Response(
    JSON.stringify({
      id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5",
      content: [{ type: "text", text: texto }], stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 3000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 200 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// Cabeceras reales mínimas de cada formato, rellenas hasta `bytes`.
function b64(cabecera: number[], bytes = 64): string {
  const a = new Uint8Array(Math.max(bytes, cabecera.length));
  a.set(cabecera);
  return Buffer.from(a).toString("base64");
}
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const foto = (data = b64(JPEG), media_type = "image/jpeg") => ({ type: "image", source: { type: "base64", media_type, data } });
const texto = (t: string) => ({ type: "text", text: t });

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
const chat = (messages: unknown[], e: Env = env(), ip?: string) => worker.fetch(peticion("/chat", { messages }, ip), e);
const enviado = () => JSON.parse(fetchMock.mock.calls[0]![1].body);
const codigo = async (r: Response) => (await r.json()).error.codigo;

describe("/chat con fotos: validación", () => {
  it("admite jpeg, png y webp en base64 y las reenvía tal cual (campo a campo)", async () => {
    const fotos = [foto(b64(JPEG)), foto(b64(PNG), "image/png"), foto(b64(WEBP), "image/webp")];
    const r = await chat([user([texto("mira"), ...fotos])]);
    expect(r.status).toBe(200);
    expect(enviado().messages[0].content).toEqual([texto("mira"), ...fotos]);
  });
  it("no deja pasar campos extra de la foto (cache_control…)", async () => {
    const f = { ...foto(), cache_control: { type: "ephemeral" } };
    f.source = { ...f.source, extra: 1 } as never;
    await chat([user([texto("x"), f])]);
    expect(enviado().messages[0].content[1]).toEqual(foto());
  });
  const malos: Array<[string, unknown]> = [
    ["imagen por URL", { type: "image", source: { type: "url", url: "https://example.com/a.jpg" } }],
    ["source sin tipo", { type: "image", source: { media_type: "image/jpeg", data: b64(JPEG) } }],
    ["sin source", { type: "image" }],
    ["tipo gif", foto(b64(JPEG), "image/gif")],
    ["tipo svg", foto(b64(JPEG), "image/svg+xml")],
    ["tipo no cadena", foto(b64(JPEG), 5 as never)],
    ["base64 con prefijo data:", foto("data:image/jpeg;base64," + b64(JPEG))],
    ["base64 con caracteres raros", foto("////***!")],
    ["base64 de longitud no múltiplo de 4", foto("/9j/4AA")],
    ["datos vacíos", foto("")],
    ["datos que no son cadena", { type: "image", source: { type: "base64", media_type: "image/jpeg", data: 5 } }],
    ["jpeg declarado pero son otros bytes", foto(b64(PNG), "image/jpeg")],
    ["png declarado pero son otros bytes", foto(b64(JPEG), "image/png")],
    ["webp declarado pero RIFF sin WEBP", foto(b64([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20]), "image/webp")],
  ];
  for (const [nombre, bloque] of malos) {
    it(`400 solicitud_invalida: ${nombre}`, async () => {
      const r = await chat([user([texto("x"), bloque])]);
      expect(r.status).toBe(400);
      expect(await codigo(r)).toBe("solicitud_invalida");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }
  it("más de 3 fotos -> 400", async () => {
    expect(MAX_FOTOS).toBe(3);
    const r = await chat([user([texto("x"), foto(), foto(), foto(), foto()])]);
    expect(r.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("3 fotos pasan; el límite cuenta toda la petición, no cada mensaje", async () => {
    expect((await chat([user([texto("x"), foto(), foto(), foto()])])).status).toBe(200);
    fetchMock.mockClear();
    const r = await chat([user([texto("a"), foto(), foto()]), asst("ok"), user([texto("b"), foto(), foto()])]);
    expect(r.status).toBe(400);
  });
  it("foto > 1,5 MB decodificada -> 413; justo en el límite pasa", async () => {
    const grande = b64(JPEG, MAX_BYTES_FOTO + 3);
    const r = await chat([user([texto("x"), foto(grande)])]);
    expect(r.status).toBe(413);
    expect(await codigo(r)).toBe("carga_demasiado_grande");
    expect(fetchMock).not.toHaveBeenCalled();
    const justo = b64(JPEG, MAX_BYTES_FOTO - (MAX_BYTES_FOTO % 3));
    expect(bytesDeBase64(justo)).toBeLessThanOrEqual(MAX_BYTES_FOTO);
    expect((await chat([user([texto("x"), foto(justo)])])).status).toBe(200);
  });
  it("bytesDeBase64 descuenta el relleno", () => {
    expect(bytesDeBase64("QUJD")).toBe(3);
    expect(bytesDeBase64("QUI=")).toBe(2);
    expect(bytesDeBase64("QQ==")).toBe(1);
  });
  it("una imagen dentro de un tool_result sigue prohibida (por base64 o por URL)", async () => {
    for (const img of [foto(), { type: "image", source: { type: "url", url: "https://x.example/a.png" } }]) {
      const r = await chat([
        user([texto("q")]),
        asst([{ type: "tool_use", id: "tu_1", name: "buscar_sitios", input: {} }]),
        user([{ type: "tool_result", tool_use_id: "tu_1", content: [img] }]),
      ]);
      expect(r.status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("un documento sigue prohibido", async () => {
    const r = await chat([user([texto("x"), { type: "document", source: { type: "url", url: "https://x.example/a.pdf" } }])]);
    expect(r.status).toBe(400);
  });
});

describe("/chat con fotos: solo llegan completas las de la consulta en curso", () => {
  it("las de consultas anteriores se sustituyen por «[foto enviada antes]»", async () => {
    const f1 = foto(b64(JPEG, 90));
    const f2 = foto(b64(PNG, 90), "image/png");
    const r = await chat([user([texto("<contexto_app>{}</contexto_app>"), f1, texto("primera")]), asst("vale"), user([texto("segunda"), f2])]);
    expect(r.status).toBe(200);
    const m = enviado().messages;
    expect(m[0].content).toEqual([texto("<contexto_app>{}</contexto_app>"), texto(TEXTO_FOTO_ANTERIOR), texto("primera")]);
    expect(m[2].content).toEqual([texto("segunda"), f2]);
    expect(JSON.stringify(m[0])).not.toContain(f1.source.data);
  });
  it("durante las rondas de herramientas la consulta en curso conserva sus fotos", async () => {
    const f = foto();
    await chat([
      user([texto("mira"), f]),
      asst([{ type: "tool_use", id: "tu_1", name: "estado_en_punto", input: { lat: 36.6, lon: -4.8, dia: 0 } }]),
      user([{ type: "tool_result", tool_use_id: "tu_1", content: "{}" }]),
    ]);
    expect(enviado().messages[0].content).toEqual([texto("mira"), f]);
  });
  it("una foto metida junto a un tool_result (ronda) se sustituye", async () => {
    await chat([
      user([texto("q")]),
      asst([{ type: "tool_use", id: "tu_1", name: "buscar_sitios", input: {} }]),
      user([{ type: "tool_result", tool_use_id: "tu_1", content: "[]" }, foto()]),
    ]);
    expect(enviado().messages[2].content[1]).toEqual(texto(TEXTO_FOTO_ANTERIOR));
  });
  it("un mensaje con solo fotos (sin texto) no se queda con ellas", async () => {
    await chat([user([foto()]), asst("ok"), user([texto("hola")])]);
    expect(enviado().messages[0].content).toEqual([texto(TEXTO_FOTO_ANTERIOR)]);
  });
});

describe("/chat con fotos: tamaño del cuerpo y coste", () => {
  it("3 fotos de ~1,4 MB pasan aunque el cuerpo supere 200 KB", async () => {
    const grande = b64(JPEG, 1_400_001 - (1_400_001 % 3));
    const cuerpo = JSON.stringify({ messages: [user([texto("x"), foto(grande), foto(grande), foto(grande)])] });
    expect(cuerpo.length).toBeGreaterThan(MAX_BYTES_CHAT);
    expect(cuerpo.length).toBeLessThan(MAX_BYTES_CUERPO_CHAT);
    expect((await worker.fetch(peticion("/chat", cuerpo), env())).status).toBe(200);
  });
  it("el tope de 200 KB sigue valiendo para el texto, con o sin fotos", async () => {
    const r = await chat([user([texto("x".repeat(30_000) + "y".repeat(0)), texto("z".repeat(30_000)), texto("w".repeat(30_000)), texto("v".repeat(30_000)), texto("u".repeat(30_000)), texto("t".repeat(30_000)), texto("s".repeat(30_000)), foto()])]);
    expect(r.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("cuerpo por encima del máximo con fotos -> 413 antes de parsear", async () => {
    const r = await worker.fetch(peticion("/chat", "x".repeat(MAX_BYTES_CUERPO_CHAT + 10)), env());
    expect(r.status).toBe(413);
  });
  it("la foto no se cuela por el tope de 200 KB: sin fotos, 210 KB de texto siguen siendo 413", async () => {
    const r = await chat([user("x".repeat(210 * 1024))]);
    expect(r.status).toBe(413);
  });
  it("el coste real (usage, con los tokens de las fotos) cuenta en el tope por IP", async () => {
    const e = env({ CHAT_IP_DAILY_USD: "0.01" });
    expect((await chat([user([texto("x"), foto()])], e, "9.9.9.9")).status).toBe(200);   // 3000×4 + 200×20 = 16 000 µUSD > 0,01 USD
    const r = await chat([user([texto("y"), foto()])], e, "9.9.9.9");
    expect(r.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await chat([user([texto("y")])], e, "8.8.8.8")).status).toBe(200);   // otra IP sigue pudiendo
  });
  it("cada petición con fotos cuenta en el cupo de peticiones por IP", async () => {
    const e = env({ CHAT_PETICIONES_DIA: "2" });
    expect((await chat([user([texto("a"), foto()])], e)).status).toBe(200);
    expect((await chat([user([texto("b"), foto()])], e)).status).toBe(200);
    expect((await chat([user([texto("c"), foto()])], e)).status).toBe(429);
  });
});

describe("/chat con fotos: seguridad de producto", () => {
  it("el filtro de salida sigue aplicándose a las respuestas sobre fotos", async () => {
    fetchMock.mockImplementation(async () => respuestaClaude("Parece una oronja. Se puede comer sin problema."));
    const r = await chat([user([texto("¿qué es?"), foto()])]);
    const j = await r.json();
    expect(j.texto).toContain(SUSTITUTO);
    expect(j.texto).not.toMatch(/se puede comer/i);
  });
  it("el system prompt deja orientar con fotos pero exige decir que una foto no basta y nunca «comestible»", () => {
    expect(SYSTEM_PROMPT).toMatch(/Con fotos/);
    expect(SYSTEM_PROMPT).toMatch(/una foto no basta para identificar/);
    expect(SYSTEM_PROMPT).toMatch(/experto micólogo/);
    expect(SYSTEM_PROMPT).toMatch(/Nunca digas ni insinúes que una seta de la foto es comestible/);
    expect(SYSTEM_PROMPT).toMatch(/Nunca digas que una seta es comestible/);   // la regla general sigue
    expect(SYSTEM_PROMPT).toMatch(/texto escrito dentro de una foto/);   // inyección por imagen: datos, no órdenes
    expect(SYSTEM_PROMPT).not.toMatch(/\b20\d\d\b/);
  });
  it("el prompt explica las ubicaciones compartidas y las herramientas nuevas existen (strict, sin campos opcionales sueltos)", () => {
    expect(SYSTEM_PROMPT).toContain("<ubicacion_compartida");
    expect(SYSTEM_PROMPT).toContain("estado_en_punto");
    expect(SYSTEM_PROMPT).toContain("proponer_guardar_ubicacion");
    for (const n of ["estado_en_punto", "proponer_guardar_ubicacion"]) {
      const h = HERRAMIENTAS.find((x) => x.name === n) as unknown as { strict: boolean; input_schema: { required: string[]; properties: Record<string, unknown>; additionalProperties: boolean } };
      expect(NOMBRES_HERRAMIENTAS).toContain(n);
      expect(h.strict).toBe(true);
      expect(h.input_schema.additionalProperties).toBe(false);
      expect([...h.input_schema.required].sort()).toEqual(Object.keys(h.input_schema.properties).sort());
    }
  });
  it("las herramientas nuevas se aceptan en el historial del asistente", async () => {
    const r = await chat([
      user([texto("aquí estaban")]),
      asst([{ type: "tool_use", id: "tu_1", name: "proponer_guardar_ubicacion", input: { lat: 36.6, lon: -4.8, especie: null, nota: "con gusanos", estrellas: null } }]),
      user([{ type: "tool_result", tool_use_id: "tu_1", content: "{}" }]),
    ]);
    expect(r.status).toBe(200);
  });
});

// ------------------------------------------------------------------------------------- enlaces de Google Maps

describe("coordenadasDeUrl: todos los formatos", () => {
  const casos: Array<[string, string, { lat: number; lon: number }]> = [
    ["el ejemplo real (?q=lat,lon)", "https://maps.google.com/?q=36.6315310,-4.7924210", { lat: 36.631531, lon: -4.792421 }],
    ["ejemplo real con parámetros de seguimiento", "https://maps.google.com/?q=36.6315310,-4.7924210&g_st=ic", { lat: 36.631531, lon: -4.792421 }],
    ["?q= con coma codificada", "https://www.google.com/maps?q=36.6315%2C-4.7924", { lat: 36.6315, lon: -4.7924 }],
    ["?q=lat,lon con espacio", "https://www.google.com/maps?q=36.6315,%20-4.7924", { lat: 36.6315, lon: -4.7924 }],
    ["?query=", "https://www.google.com/maps/search/?api=1&query=36.6315,-4.7924", { lat: 36.6315, lon: -4.7924 }],
    ["?ll=", "https://maps.google.es/?ll=36.6315,-4.7924&z=15", { lat: 36.6315, lon: -4.7924 }],
    ["?center=", "https://www.google.com/maps?center=36.6315,-4.7924&zoom=14", { lat: 36.6315, lon: -4.7924 }],
    ["?destination=", "https://www.google.com/maps/dir/?api=1&destination=36.6315,-4.7924", { lat: 36.6315, lon: -4.7924 }],
    ["/@lat,lon,zoom", "https://www.google.com/maps/@36.6315,-4.7924,17z", { lat: 36.6315, lon: -4.7924 }],
    ["/place/nombre/@lat,lon", "https://www.google.com/maps/place/Ojén/@36.5649,-4.8586,15z/data=!3m1!4b1", { lat: 36.5649, lon: -4.8586 }],
    ["!3d!4d gana sobre @ (marcador frente a vista)", "https://www.google.com/maps/place/Bar/@36.6000,-4.8000,17z/data=!3m1!4b1!4m6!3m5!1s0xd72:0x5!8m2!3d36.6315310!4d-4.7924210", { lat: 36.631531, lon: -4.792421 }],
    ["/place/lat,lon", "https://www.google.com/maps/place/36.6315,-4.7924", { lat: 36.6315, lon: -4.7924 }],
    ["/place/lat,lon con coma codificada", "https://www.google.com/maps/place/36.6315%2C-4.7924", { lat: 36.6315, lon: -4.7924 }],
    ["/search/lat,lon", "https://www.google.com/maps/search/36.6315,-4.7924", { lat: 36.6315, lon: -4.7924 }],
    ["dir con destino en el camino", "https://www.google.com/maps/dir/36.5,-4.8/36.6315,-4.7924", { lat: 36.5, lon: -4.8 }],
    ["hemisferio sur y oeste", "https://www.google.com/maps/@-33.8688,151.2093,12z", { lat: -33.8688, lon: 151.2093 }],
    ["google.com/maps/place con !3d!4d sin @", "https://www.google.com/maps/place/X/data=!4m2!3m1!1s0x0:0x1!8m2!3d36.1!4d-5.35", { lat: 36.1, lon: -5.35 }],
  ];
  for (const [nombre, url, esperado] of casos) {
    it(nombre, () => expect(coordenadasDeUrl(url)).toEqual(esperado));
  }
  it("acepta un objeto URL", () => expect(coordenadasDeUrl(new URL("https://maps.google.com/?q=36.5,-4.5"))).toEqual({ lat: 36.5, lon: -4.5 }));
  const sin = [
    "https://maps.google.com/?q=Restaurante+Casa+Pepe",
    "https://www.google.com/maps/place/Marbella",
    "https://maps.app.goo.gl/zcKpg1MnaUy2fDZd7?g_st=ic",
    "https://maps.google.com/?q=99.0,-4.5",
    "https://maps.google.com/?q=36.5,-190.5",
    "https://maps.google.com/?q=0,0",
    "no es una url",
    "",
  ];
  for (const u of sin) it(`null para «${u.slice(0, 40)}»`, () => expect(coordenadasDeUrl(u)).toBeNull());
});

describe("hosts de la lista blanca y enlaces cortos", () => {
  it("hostPermitido: Google y sus dominios de país, nada más", () => {
    for (const h of ["maps.app.goo.gl", "goo.gl", "maps.google.com", "www.google.com", "google.com", "www.google.es", "google.es", "maps.google.es", "www.google.co.uk", "consent.google.com", "MAPS.GOOGLE.COM"]) expect(hostPermitido(h), h).toBe(true);
    for (const h of ["evil.com", "google.com.evil.com", "evilgoogle.com", "maps.google.com.evil.com", "169.254.169.254", "localhost", "127.0.0.1", "[::1]", "google.evil", "notgoo.gl", "goo.gl.evil.com", "www.google.com@evil.com", "drive.google.com", "mail.google.com"]) expect(hostPermitido(h), h).toBe(false);
  });
  it("esEnlaceCorto: solo https y maps.app.goo.gl/… o goo.gl/maps/…", () => {
    expect(esEnlaceCorto(new URL("https://maps.app.goo.gl/zcKpg1MnaUy2fDZd7?g_st=ic"))).toBe(true);
    expect(esEnlaceCorto(new URL("https://goo.gl/maps/abc123"))).toBe(true);
    for (const u of ["http://maps.app.goo.gl/abc", "https://maps.app.goo.gl/", "https://maps.app.goo.gl", "https://goo.gl/abc", "https://goo.gl/", "https://www.google.com/maps/@1,2,3z", "https://user:pw@maps.app.goo.gl/abc", "https://maps.app.goo.gl:8443/abc", "https://evil.com/maps.app.goo.gl/abc", "https://maps.app.goo.gl.evil.com/abc", "https://127.0.0.1/abc"]) {
      expect(esEnlaceCorto(new URL(u)), u).toBe(false);
    }
  });
});

const redireccion = (loc: string, status = 302) => new Response(null, { status, headers: { Location: loc } });
const CORTO = "https://maps.app.goo.gl/zcKpg1MnaUy2fDZd7?g_st=ic";

describe("resolverEnlaceCorto", () => {
  it("el ejemplo real: redirige a maps.google.com/?q=… y devuelve 36.6315, -4.7924", async () => {
    const f = vi.fn(async () => redireccion("https://maps.google.com/?q=36.6315310,-4.7924210"));
    const c = await resolverEnlaceCorto(CORTO, f as never);
    expect(c).toEqual({ lat: 36.631531, lon: -4.792421 });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(CORTO);
    expect(init.redirect).toBe("manual");
    expect(init.method).toBe("GET");
    expect(init.signal).toBeDefined();
  });
  it("sigue varios saltos dentro de la lista blanca, incluidos relativos y dominios de país", async () => {
    const respuestas = [redireccion("https://goo.gl/maps/otro"), redireccion("/maps/place/Ojén/@36.5649,-4.8586,15z"), redireccion("https://www.google.es/maps/place/Ojén/@36.5649,-4.8586,15z/data=!3d36.5600!4d-4.8500")];
    const f = vi.fn(async () => respuestas.shift()!);
    // la 2.ª ya trae coordenadas en la URL de destino: no se pide
    expect(await resolverEnlaceCorto(CORTO, f as never)).toEqual({ lat: 36.5649, lon: -4.8586 });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("redirección a un host que no está en la lista -> 422 y NO se pide", async () => {
    for (const destino of ["https://evil.com/x?q=1,2", "http://maps.google.com/?q=36.5,-4.5", "https://169.254.169.254/latest/meta-data", "https://localhost/", "https://127.0.0.1:8080/", "https://google.com.evil.com/", "https://user:pw@maps.google.com/x", "https://maps.google.com:8443/x", "ftp://maps.google.com/x", "javascript:alert(1)"]) {
      const f = vi.fn(async () => redireccion(destino));
      await expect(resolverEnlaceCorto(CORTO, f as never), destino).rejects.toMatchObject({ status: 422, codigo: "enlace_no_resuelto" });
      expect(f).toHaveBeenCalledTimes(1);
    }
  });
  it("un salto de la cadena que sale de la lista corta la cadena aunque antes fueran buenos", async () => {
    const respuestas = [redireccion("https://goo.gl/maps/a"), redireccion("https://evil.com/")];
    const f = vi.fn(async () => respuestas.shift()!);
    await expect(resolverEnlaceCorto(CORTO, f as never)).rejects.toMatchObject({ status: 422 });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it(`máximo ${MAX_SALTOS} saltos`, async () => {
    let n = 0;
    const f = vi.fn(async () => redireccion(`https://goo.gl/maps/salto${++n}`));
    await expect(resolverEnlaceCorto(CORTO, f as never)).rejects.toMatchObject({ status: 422 });
    expect(f).toHaveBeenCalledTimes(MAX_SALTOS);
  });
  it("sin Location, 200 o error -> 422", async () => {
    for (const r of [() => new Response("<html>", { status: 200 }), () => new Response(null, { status: 302 }), () => new Response(null, { status: 404 }), () => new Response(null, { status: 500 })]) {
      await expect(resolverEnlaceCorto(CORTO, (async () => r()) as never)).rejects.toMatchObject({ status: 422 });
    }
  });
  it("no lee el cuerpo: lo cancela", async () => {
    const cancel = vi.fn(async () => {});
    const res = { status: 302, headers: new Headers({ Location: "https://maps.google.com/?q=36.5,-4.5" }), body: { cancel } } as unknown as Response;
    await resolverEnlaceCorto(CORTO, (async () => res) as never);
    expect(cancel).toHaveBeenCalled();
  });
  it("fallo de red o tiempo agotado -> 502, sin detalles internos", async () => {
    const e = await resolverEnlaceCorto(CORTO, (async () => { throw new TypeError("connect ECONNREFUSED 10.0.0.1"); }) as never).catch((x) => x);
    expect(e.status).toBe(502);
    expect(e.message).not.toMatch(/ECONNREFUSED|10\.0\.0\.1/);
  });
  it("la página de consentimiento de Google no se pide: se sigue su parámetro continue (también con lista blanca)", async () => {
    const respuestas = [
      redireccion("https://consent.google.com/m?continue=" + encodeURIComponent("https://www.google.com/maps/place/X/@36.6,-4.7,17z") + "&gl=ES"),
    ];
    const f = vi.fn(async () => respuestas.shift()!);
    expect(await resolverEnlaceCorto(CORTO, f as never)).toEqual({ lat: 36.6, lon: -4.7 });
    expect(f).toHaveBeenCalledTimes(1);
    const g = vi.fn(async () => redireccion("https://consent.google.com/m?continue=" + encodeURIComponent("https://evil.com/")));
    await expect(resolverEnlaceCorto(CORTO, g as never)).rejects.toMatchObject({ status: 422 });
  });
  it("entradas que no son enlaces cortos de Maps -> 400 sin ninguna petición", async () => {
    const f = vi.fn();
    for (const u of ["https://evil.com/x", "http://maps.app.goo.gl/abc", "https://maps.google.com/?q=1,2", "https://169.254.169.254/", "no es url", "", "x".repeat(3000), "https://maps.app.goo.gl/" + "a".repeat(3000)]) {
      await expect(resolverEnlaceCorto(u, f as never), u.slice(0, 30)).rejects.toMatchObject({ status: 400 });
    }
    expect(f).not.toHaveBeenCalled();
  });
});

describe("POST /resolver-enlace", () => {
  const resolver = (cuerpo: unknown, e: Env = env(), ip?: string) => worker.fetch(peticion("/resolver-enlace", cuerpo, ip), e);
  it("200 con lat/lon, CORS y cupo restante; solo se pide el enlace corto", async () => {
    fetchMock.mockImplementation(async () => redireccion("https://maps.google.com/?q=36.6315310,-4.7924210"));
    const r = await resolver({ url: CORTO });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ lat: 36.631531, lon: -4.792421 });
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe(ORIGEN);
    expect(r.headers.get("X-Restantes-Hoy")).toBe("59");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(CORTO);
  });
  it("origen no permitido -> 403 sin petición", async () => {
    const r = await worker.fetch(new Request("https://w.example/resolver-enlace", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://malo.example" }, body: JSON.stringify({ url: CORTO }) }), env());
    expect(r.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("cuerpos no válidos -> 400 sin petición ni gasto de cupo", async () => {
    const e = env({ MAPAS_DAILY_LIMIT: "1" });
    for (const c of ["{no", {}, { url: 5 }, { url: "https://evil.com/x" }, { url: "https://maps.google.com/?q=1,2" }, { url: "http://maps.app.goo.gl/abc" }, { url: "https://127.0.0.1/" }]) {
      expect((await resolver(c, e)).status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockImplementation(async () => redireccion("https://maps.google.com/?q=36.5,-4.5"));
    expect((await resolver({ url: CORTO }, e)).status).toBe(200);   // el cupo no se gastó con los rechazos
  });
  it("limitado por IP y día (MAPAS_DAILY_LIMIT) sin pedir nada al llegar al tope", async () => {
    fetchMock.mockImplementation(async () => redireccion("https://maps.google.com/?q=36.5,-4.5"));
    const e = env({ MAPAS_DAILY_LIMIT: "2" });
    expect((await resolver({ url: CORTO }, e)).status).toBe(200);
    expect((await resolver({ url: CORTO }, e)).status).toBe(200);
    const r = await resolver({ url: CORTO }, e);
    expect(r.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await resolver({ url: CORTO }, e, "7.7.7.7")).status).toBe(200);   // otra IP
  });
  it("sin KV con REQUIRE_KV=true -> 503 sin petición", async () => {
    const r = await resolver({ url: CORTO }, env({ RATE_LIMIT: undefined, REQUIRE_KV: "true" }));
    expect(r.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("redirección fuera de la lista -> 422 enlace_no_resuelto", async () => {
    fetchMock.mockImplementation(async () => redireccion("https://evil.com/"));
    const r = await resolver({ url: CORTO });
    expect(r.status).toBe(422);
    expect(await codigo(r)).toBe("enlace_no_resuelto");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("GET -> 405 y otras rutas siguen en 404", async () => {
    expect((await worker.fetch(new Request("https://w.example/resolver-enlace", { method: "GET", headers: { Origin: ORIGEN } }), env())).status).toBe(405);
    expect((await worker.fetch(new Request("https://w.example/otra", { method: "POST", headers: { Origin: ORIGEN } }), env())).status).toBe(404);
  });
});
