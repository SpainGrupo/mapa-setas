// Enlaces de Google Maps en el chat: detecta los del texto del usuario y saca de ellos lat/lon.
//  - Los largos (google.com/maps/…, maps.google.com/?q=…) se resuelven aquí, sin red.
//  - Los cortos (maps.app.goo.gl, goo.gl/maps) los resuelve el Worker (POST /resolver-enlace): solo sigue
//    redirecciones hacia hosts de Google (lista blanca), así que aquí no se pide nada a Google directamente.
//  Mismos formatos que worker/src/mapas-enlace.ts (coordenadasDeUrl); si se cambia uno, cambiar el otro.
export interface Coordenadas { lat: number; lon: number }
export interface EnlaceMaps { original: string; url: URL; corto: boolean }

const num = (s: string) => Number(s.replace(',', '.'));
const valido = (lat: number, lon: number) =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
const redondear = (v: number) => Math.round(v * 1e6) / 1e6;
const PAR = '(-?\\d{1,3}(?:\\.\\d+)?)\\s*,\\s*(-?\\d{1,3}(?:\\.\\d+)?)';
const SOLO_PAR = new RegExp(`^${PAR}$`);
const MARCADOR = /!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/;

/** Coordenadas de una URL de Google Maps: marcador (!3d!4d) > q/query/ll/center/destination/daddr/saddr > /place|search|dir/lat,lon > vista (@lat,lon). */
export function coordenadasDeUrl(entrada: string | URL): Coordenadas | null {
  let u: URL;
  try { u = typeof entrada === 'string' ? new URL(entrada) : entrada; } catch { return null; }
  const dev = (a: string, b: string): Coordenadas | null => {
    const lat = num(a), lon = num(b);
    return valido(lat, lon) ? { lat: redondear(lat), lon: redondear(lon) } : null;
  };
  let ruta = u.pathname, busqueda = u.search;
  try { ruta = decodeURIComponent(ruta); } catch { /* se queda como llegó */ }
  try { busqueda = decodeURIComponent(busqueda); } catch { /* idem */ }

  const m3 = MARCADOR.exec(ruta);
  if (m3) { const r = dev(m3[1], m3[2]); if (r) return r; }
  for (const p of ['q', 'query', 'll', 'center', 'destination', 'daddr', 'saddr']) {
    const v = u.searchParams.get(p);
    const m = v ? SOLO_PAR.exec(v.trim()) : null;
    if (m) { const r = dev(m[1], m[2]); if (r) return r; }
  }
  const mq = new RegExp(`[?&](?:q|query|daddr|saddr)=(?:loc:)?\\s*${PAR}`).exec(busqueda);   // «q=loc:…», «q=lat,lon+(nombre)»
  if (mq) { const r = dev(mq[1], mq[2]); if (r) return r; }
  for (const seg of ruta.split('/')) {
    const m = SOLO_PAR.exec(seg.trim());
    if (m) { const r = dev(m[1], m[2]); if (r) return r; }
  }
  const md = MARCADOR.exec(busqueda);
  if (md) { const r = dev(md[1], md[2]); if (r) return r; }
  const ma = /@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/.exec(ruta);
  if (ma) { const r = dev(ma[1], ma[2]); if (r) return r; }
  return null;
}

const GOOGLE_PAIS = /^(?:www\.|maps\.)?google\.(?:com?\.)?[a-z]{2,3}$/;

/** Enlace corto que resuelve el Worker. */
export function esEnlaceCorto(u: URL): boolean {
  const h = u.hostname.toLowerCase();
  return h === 'maps.app.goo.gl' || (h === 'goo.gl' && u.pathname.startsWith('/maps'));
}
/** ¿Es un enlace de Google Maps (largo o corto)? */
export function esEnlaceMaps(u: URL): boolean {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (esEnlaceCorto(u)) return true;
  const h = u.hostname.toLowerCase();
  if (/^maps\.google\.[a-z.]{2,6}$/.test(h)) return GOOGLE_PAIS.test(h);
  return GOOGLE_PAIS.test(h) && /^\/maps(?:\/|$)/.test(u.pathname);
}

export const MAX_ENLACES = 3;

/** Enlaces de Google Maps del texto (con o sin «https://»), sin repetidos y como máximo MAX_ENLACES. */
export function buscarEnlacesMaps(texto: string): EnlaceMaps[] {
  const salida: EnlaceMaps[] = [];
  for (const crudo of texto.split(/\s+/)) {
    const original = crudo.replace(/^[<(\[«"'¿¡]+/, '').replace(/[>)\]»"'.,;:!?…]+$/, '');
    if (!original || !/[./]/.test(original)) continue;
    let u: URL;
    try { u = new URL(/^https?:\/\//i.test(original) ? original : `https://${original}`); } catch { continue; }
    if (!esEnlaceMaps(u) || salida.some((e) => e.url.href === u.href)) continue;
    salida.push({ original, url: u, corto: esEnlaceCorto(u) });
    if (salida.length >= MAX_ENLACES) break;
  }
  return salida;
}

/** POST {url}/resolver-enlace; la URL del Worker puede venir con /identificar o /chat. */
export function urlResolverEnlace(urlWorker: string): string {
  return `${urlWorker.trim().replace(/\/+$/, '').replace(/\/(?:identificar|chat)$/, '')}/resolver-enlace`;
}

export type ResolverCorto = (url: string) => Promise<Coordenadas | null>;

/** Resolvedor de enlaces cortos a través del Worker. Nunca lanza: null si no se pudo. */
export function resolvedorWorker(urlWorker: string, fetcher: typeof fetch = fetch, tiempoMs = 12_000): ResolverCorto {
  return async (url) => {
    const ctrl = new AbortController();
    const reloj = setTimeout(() => ctrl.abort(), tiempoMs);
    try {
      const res = await fetcher(urlResolverEnlace(urlWorker), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), signal: ctrl.signal });
      if (!res.ok) return null;
      const j = (await res.json()) as Partial<Coordenadas> | null;
      return j && typeof j.lat === 'number' && typeof j.lon === 'number' && valido(j.lat, j.lon) ? { lat: j.lat, lon: j.lon } : null;
    } catch { return null; } finally { clearTimeout(reloj); }
  };
}

export interface UbicacionCompartida extends Coordenadas { origen: 'enlace' | 'foto' }
export interface ResultadoEnlaces { ubicaciones: UbicacionCompartida[]; sinResolver: string[] }

/** Ubicaciones de los enlaces de Maps del texto: los largos en local, los cortos con `resolver` (sin él, quedan sin resolver). */
export async function ubicacionesDeEnlaces(texto: string, resolver?: ResolverCorto): Promise<ResultadoEnlaces> {
  const ubicaciones: UbicacionCompartida[] = [], sinResolver: string[] = [];
  for (const e of buscarEnlacesMaps(texto)) {
    const c = coordenadasDeUrl(e.url) ?? (e.corto && resolver ? await resolver(e.url.href) : null);
    if (c) ubicaciones.push({ lat: c.lat, lon: c.lon, origen: 'enlace' }); else sinResolver.push(e.original);
  }
  return { ubicaciones, sinResolver };
}
