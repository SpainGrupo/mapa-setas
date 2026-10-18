// Enlaces con puntos para abrir en la app (2026-10-18): los que generan los asistentes o se comparten. Puro, sin DOM
// (enlaces.test.ts); enlace-ui.ts los enseña en el mapa con «Navegar aquí» y «Guardar en Mis sitios».
// Formato (documentado en knowledge/reference/enlaces-a-puntos.md), en la query o en el hash (#…):
//   ?ir=36.60071,-4.81962&n=Arroyo%20aereus&nota=Bajo%20alcornoques   un punto (n y nota opcionales)
//   ?pts=36.60071,-4.81962,Arroyo%20aereus;36.61,-4.82,Otro            varios puntos «lat,lon,nombre» separados por «;»
//   #ir=…  ·  #ir?ir=…  ·  #pts=…                                          lo mismo en el hash (GitHub Pages, accesos directos)
// Coordenadas en grados decimales WGS84 (punto decimal). Se aceptan como mucho MAX_PUNTOS; los inválidos se descartan.
export const MAX_PUNTOS = 25;
export const MAX_NOMBRE = 80;
export const MAX_NOTA = 500;
const CLAVES = ['ir', 'n', 'nota', 'pts'];

export interface PuntoEnlace { lat: number; lon: number; nombre: string; nota: string }
export interface Enlace { puntos: PuntoEnlace[]; descartados: number }

const limpiar = (s: string | null | undefined, max: number) => (s ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** «36.60071,-4.81962» → [lat, lon]; null si no son coordenadas válidas. */
export function parsearCoord(lat: string, lon: string): [number, number] | null {
  const re = /^\s*[-+]?\d{1,3}(\.\d+)?\s*$/;
  if (!re.test(lat) || !re.test(lon)) return null;
  const a = Number(lat), b = Number(lon);
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return [a, b];
}

/** Parámetros del enlace a partir de location.search y location.hash. */
export function parametrosEnlace(search: string, hash: string): URLSearchParams {
  const q = new URLSearchParams(search);
  let h = hash.replace(/^#/, '');
  if (/^ir\?/.test(h)) h = h.slice(3);                 // «#ir?ir=…»
  else if (/^ir$/.test(h)) h = '';
  const hq = new URLSearchParams(h);
  for (const k of CLAVES) if (!q.has(k) && hq.has(k)) q.set(k, hq.get(k)!);
  return q;
}

/** Puntos del enlace (vacío si no trae ninguno). */
export function parsearEnlace(search: string, hash = ''): Enlace {
  const q = parametrosEnlace(search, hash);
  const puntos: PuntoEnlace[] = [];
  let descartados = 0;
  const ir = q.get('ir');
  if (ir) {
    const [la, lo] = ir.split(',');
    const c = la !== undefined && lo !== undefined ? parsearCoord(la, lo) : null;
    if (c) puntos.push({ lat: c[0], lon: c[1], nombre: limpiar(q.get('n'), MAX_NOMBRE), nota: limpiar(q.get('nota'), MAX_NOTA) });
    else descartados++;
  }
  for (const trozo of (q.get('pts') ?? '').split(';')) {
    if (!trozo.trim()) continue;
    const [la, lo, ...resto] = trozo.split(',');
    const c = la !== undefined && lo !== undefined ? parsearCoord(la, lo) : null;
    if (!c) { descartados++; continue; }
    puntos.push({ lat: c[0], lon: c[1], nombre: limpiar(resto.join(','), MAX_NOMBRE), nota: '' });
  }
  if (puntos.length > MAX_PUNTOS) { descartados += puntos.length - MAX_PUNTOS; puntos.length = MAX_PUNTOS; }
  return { puntos, descartados };
}

/** La URL sin los parámetros del enlace (para no volver a abrirlo al recargar). Conserva el resto. */
export function urlSinEnlace(href: string): string {
  const u = new URL(href);
  for (const k of CLAVES) u.searchParams.delete(k);
  const h = u.hash.replace(/^#/, '');
  if (h === 'ir' || /^ir\?/.test(h) || CLAVES.some((k) => new URLSearchParams(h).has(k))) u.hash = '';
  return u.toString();
}

/** Genera un enlace (para asistentes y para «Compartir»): un punto con ?ir=…&n=…&nota=… o varios con ?pts=…. */
export function generarEnlace(base: string, puntos: { lat: number; lon: number; nombre?: string; nota?: string }[]): string {
  const u = new URL(base);
  const c = (p: { lat: number; lon: number }) => `${+p.lat.toFixed(6)},${+p.lon.toFixed(6)}`;
  if (puntos.length === 1) {
    const p = puntos[0];
    u.searchParams.set('ir', c(p));
    if (p.nombre) u.searchParams.set('n', p.nombre);
    if (p.nota) u.searchParams.set('nota', p.nota);
  } else u.searchParams.set('pts', puntos.map((p) => `${c(p)}${p.nombre ? `,${p.nombre.replace(/;/g, ',')}` : ''}`).join(';'));
  return u.toString();
}

/** ¿Está el punto dentro de la caja [oeste, sur, este, norte]? */
export const dentroDe = (p: { lat: number; lon: number }, b: [number, number, number, number]) =>
  p.lon >= b[0] && p.lon <= b[2] && p.lat >= b[1] && p.lat <= b[3];

// ---------------------------------------------------------------- importar KML (Placemark con Point)

/** Puntos de un KML (Google My Maps, Google Earth, el «Exportar día» de la app): nombre y descripción. */
export function puntosDeKml(texto: string): PuntoEnlace[] {
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement.localName !== 'kml') throw new Error('El archivo no es un KML válido.');
  const hijo = (el: Element, n: string) => [...el.children].find((c) => c.localName === n)?.textContent ?? '';
  const out: PuntoEnlace[] = [];
  for (const pm of [...doc.getElementsByTagNameNS('*', 'Placemark')]) {
    const pt = pm.getElementsByTagNameNS('*', 'Point')[0];
    const co = pt?.getElementsByTagNameNS('*', 'coordinates')[0]?.textContent?.trim();
    if (!co) continue;
    const [lo, la] = co.split(/[\s,]+/);
    const c = la !== undefined && lo !== undefined ? parsearCoord(la, lo) : null;
    if (!c) continue;
    out.push({ lat: c[0], lon: c[1], nombre: limpiar(hijo(pm, 'name'), MAX_NOMBRE), nota: (hijo(pm, 'description') ?? '').trim().slice(0, 2000) });
  }
  return out;
}
