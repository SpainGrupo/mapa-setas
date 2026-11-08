// POST /resolver-enlace: resuelve un enlace corto de Google Maps (maps.app.goo.gl, goo.gl/maps) a lat/lon.
// Protección SSRF: el Worker solo hace peticiones a hosts de una lista blanca, sigue las redirecciones a mano
// (máx. MAX_SALTOS), comprueba cada destino contra la lista antes de pedirlo, no lee cuerpos y solo devuelve
// coordenadas. La entrada que no sea un enlace de Google Maps se rechaza sin hacer ninguna petición.
import { ErrorHttp, json, leerCuerpoLimitado } from "./http";
import { claveCliente, consumir, entero } from "./limite";
import type { Env } from "./index";

export const MAX_BYTES_ENLACE = 4 * 1024;
export const MAX_SALTOS = 5;
export const TIEMPO_SALTO_MS = 3_000;
export const TIEMPO_TOTAL_MS = 8_000;
export const MAX_LARGO_URL = 2_000;
export const MAPAS_DIARIO_POR_DEFECTO = 60;

const HOSTS_CORTOS = new Set(["maps.app.goo.gl", "goo.gl"]);
/** Hosts a los que se puede pedir (y a los que puede redirigir un enlace corto). */
const HOSTS_FIJOS = new Set(["maps.app.goo.gl", "goo.gl", "maps.google.com", "www.google.com", "google.com", "consent.google.com"]);
/** google.es, www.google.es, maps.google.es, google.co.uk… (dominios de país de Google). */
const HOST_GOOGLE_PAIS = /^(?:(?:www|maps|consent)\.)?google\.(?:com?\.)?[a-z]{2,3}$/;

export function hostPermitido(host: string): boolean {
  const h = host.toLowerCase();
  return HOSTS_FIJOS.has(h) || HOST_GOOGLE_PAIS.test(h);
}

/** Enlace corto = lo único que el Worker acepta como punto de partida. */
export function esEnlaceCorto(u: URL): boolean {
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
  const h = u.hostname.toLowerCase();
  if (h === "maps.app.goo.gl") return u.pathname.length > 1;
  return h === "goo.gl" && /^\/maps\/[^/]+/.test(u.pathname);
}

const num = (s: string) => Number(s.replace(",", "."));
const valido = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
const redondear = (v: number) => Math.round(v * 1e6) / 1e6;
const PAR = "(-?\\d{1,3}(?:\\.\\d+)?)\\s*,\\s*(-?\\d{1,3}(?:\\.\\d+)?)";
const SOLO_PAR = new RegExp(`^${PAR}$`);

/**
 * Coordenadas de una URL de Google Maps (ya resuelta), o null. Orden: marcador del sitio (!3d!4d) > parámetros
 * (q, query, ll, center, destination, daddr, saddr) > /place|search|dir/lat,lon > centro de la vista (@lat,lon).
 */
export function coordenadasDeUrl(entrada: string | URL): { lat: number; lon: number } | null {
  let u: URL;
  try {
    u = typeof entrada === "string" ? new URL(entrada) : entrada;
  } catch {
    return null;
  }
  const dev = (a: string, b: string) => {
    const lat = num(a), lon = num(b);
    return valido(lat, lon) ? { lat: redondear(lat), lon: redondear(lon) } : null;
  };
  let ruta = u.pathname;
  let busqueda = u.search;
  try {
    ruta = decodeURIComponent(ruta);
  } catch { /* se queda como llegó */ }
  try {
    busqueda = decodeURIComponent(busqueda);
  } catch { /* idem */ }

  const m3 = /!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/.exec(ruta);
  if (m3) { const r = dev(m3[1]!, m3[2]!); if (r) return r; }
  for (const p of ["q", "query", "ll", "center", "destination", "daddr", "saddr"]) {
    const v = u.searchParams.get(p);
    const m = v ? SOLO_PAR.exec(v.trim()) : null;
    if (m) { const r = dev(m[1]!, m[2]!); if (r) return r; }
  }
  // «q=loc:36.6,-4.7» o «q=36.6,-4.7+(nombre)»
  const mq = new RegExp(`[?&](?:q|query|daddr|saddr)=(?:loc:)?\\s*${PAR}`).exec(busqueda);
  if (mq) { const r = dev(mq[1]!, mq[2]!); if (r) return r; }
  for (const seg of ruta.split("/")) {
    const m = SOLO_PAR.exec(seg.trim());
    if (m) { const r = dev(m[1]!, m[2]!); if (r) return r; }
  }
  const md = /!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/.exec(busqueda);
  if (md) { const r = dev(md[1]!, md[2]!); if (r) return r; }
  const ma = /@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/.exec(ruta);
  if (ma) { const r = dev(ma[1]!, ma[2]!); if (r) return r; }
  return null;
}

/** Destino al que lleva la página de consentimiento de Google (parámetro `continue`), sin pedirla. */
function destinoDeConsentimiento(u: URL): URL | null {
  if (!/^consent\.google\./.test(u.hostname.toLowerCase())) return null;
  const c = u.searchParams.get("continue");
  if (!c) return null;
  try {
    return new URL(c);
  } catch {
    return null;
  }
}

function sinResolver(): ErrorHttp {
  return new ErrorHttp(422, "enlace_no_resuelto", "No he podido sacar la ubicación de ese enlace.");
}

/**
 * Sigue las redirecciones de un enlace corto de Google Maps y devuelve lat/lon. Cada salto se comprueba contra
 * la lista blanca ANTES de pedirse; en cuanto una URL contiene coordenadas se para sin pedir más.
 */
export async function resolverEnlaceCorto(entrada: string, fetchImpl: typeof fetch = fetch): Promise<{ lat: number; lon: number }> {
  if (typeof entrada !== "string" || entrada.length === 0 || entrada.length > MAX_LARGO_URL) {
    throw new ErrorHttp(400, "solicitud_invalida", "El enlace no es válido.");
  }
  let actual: URL;
  try {
    actual = new URL(entrada.trim());
  } catch {
    throw new ErrorHttp(400, "solicitud_invalida", "El enlace no es válido.");
  }
  if (!esEnlaceCorto(actual)) {
    throw new ErrorHttp(400, "solicitud_invalida", "Solo se resuelven enlaces cortos de Google Maps (maps.app.goo.gl).");
  }
  const limite = Date.now() + TIEMPO_TOTAL_MS;
  for (let salto = 0; salto <= MAX_SALTOS; salto++) {
    const c = coordenadasDeUrl(actual);
    if (c) return c;
    if (salto === MAX_SALTOS) break;
    if (Date.now() >= limite) throw new ErrorHttp(504, "enlace_no_resuelto", "Google Maps tardó demasiado en responder.");
    const consentimiento = destinoDeConsentimiento(actual);
    let siguiente: URL;
    if (consentimiento) {
      siguiente = consentimiento;
    } else {
      const ctrl = new AbortController();
      const reloj = setTimeout(() => ctrl.abort(), Math.min(TIEMPO_SALTO_MS, Math.max(1, limite - Date.now())));
      let res: Response;
      try {
        res = await fetchImpl(actual.toString(), {
          method: "GET",
          redirect: "manual",
          signal: ctrl.signal,
          headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; MapaSetas/1.0)" },
        });
      } catch {
        throw new ErrorHttp(502, "enlace_no_resuelto", "No se pudo consultar el enlace de Google Maps.");
      } finally {
        clearTimeout(reloj);
      }
      // Nunca se lee el cuerpo.
      try { await res.body?.cancel(); } catch { /* nada */ }
      const loc = res.headers.get("Location");
      if (res.status < 300 || res.status >= 400 || !loc) throw sinResolver();
      try {
        siguiente = new URL(loc, actual);
      } catch {
        throw sinResolver();
      }
    }
    if (siguiente.protocol !== "https:" || siguiente.username || siguiente.password || (siguiente.port && siguiente.port !== "443") || !hostPermitido(siguiente.hostname)) {
      throw sinResolver();
    }
    actual = siguiente;
  }
  throw sinResolver();
}

export async function manejarResolverEnlace(
  request: Request,
  env: Env,
  cors: Record<string, string>,
  fetchImpl?: typeof fetch,
): Promise<Response> {
  const texto = await leerCuerpoLimitado(request, MAX_BYTES_ENLACE);
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    throw new ErrorHttp(400, "solicitud_invalida", "El cuerpo no es JSON válido.");
  }
  const url = typeof cuerpo === "object" && cuerpo !== null && !Array.isArray(cuerpo) ? (cuerpo as Record<string, unknown>).url : undefined;
  if (typeof url !== "string") throw new ErrorHttp(400, "solicitud_invalida", "Falta el campo url.");
  // Se valida antes de gastar cupo: lo que no es un enlace corto de Maps no cuenta ni hace peticiones.
  let u: URL | null = null;
  try {
    u = new URL(url.trim());
  } catch { /* se rechaza abajo */ }
  if (!u || url.length > MAX_LARGO_URL || !esEnlaceCorto(u)) {
    throw new ErrorHttp(400, "solicitud_invalida", "Solo se resuelven enlaces cortos de Google Maps (maps.app.goo.gl).");
  }
  const ip = claveCliente(request.headers.get("CF-Connecting-IP"));
  const limite = entero(env.MAPAS_DAILY_LIMIT, MAPAS_DIARIO_POR_DEFECTO);
  const restantes = await consumir(env.RATE_LIMIT, ip, limite, {
    prefijo: "mapas:",
    sinGlobal: true,
    requerirKv: env.REQUIRE_KV === "true",
    mensajeLimite: "Has llegado al máximo de enlaces de Google Maps por hoy.",
  });
  const c = await resolverEnlaceCorto(url, fetchImpl);
  const extra: Record<string, string> = { ...cors };
  if (restantes !== null) extra["X-Restantes-Hoy"] = String(restantes);
  return json({ lat: c.lat, lon: c.lon }, 200, extra);
}
