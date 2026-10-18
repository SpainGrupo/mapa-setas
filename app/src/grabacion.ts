// «Grabar ruta» (2026-10-18): track del GPS con hora y altitud, notas con posición y estrellas, resumen (distancia,
// desnivel, duración) y GPX 1.1 (track + waypoints). Puro, sin DOM (grabacion.test.ts); grabar-ui.ts escucha el GPS,
// guarda la grabación en curso (rutas.ts) y pinta el panel.
//  - Filtro de puntos: se descartan lecturas con precisión peor que PRECISION_MAX_M y las que no se separan del último
//    punto más de max(DIST_MIN_M, precisión/2) (quieto, el GPS «baila» y sumaría metros que no has andado).
//  - Segmentos: cada vez que la grabación se reanuda (iOS recargó la página o pausó el GPS) empieza un segmento nuevo;
//    la distancia no une el hueco entre segmentos.
//  - Desnivel: suma de subidas y bajadas de la altitud del GPS con histéresis de UMBRAL_DESNIVEL_M (el ruido vertical
//    del GPS es de varios metros). Es aproximado y se dice así. Sin altitud en el GPS, null (PENDIENTE).
import { distanciaM } from './ranking';
import { escaparXml } from './exportar-dia';

export const PRECISION_MAX_M = 50;
export const DIST_MIN_M = 5;
export const UMBRAL_DESNIVEL_M = 4;
export const MAX_NOTA = 500;

export interface PuntoTrack { t: number; lat: number; lon: number; alt: number | null; prec: number; seg: number }
export interface NotaTrack { id: string; t: number; lat: number; lon: number; alt: number | null; texto: string; estrellas: 0 | 1 | 2 | 3 }
export interface Track {
  id: string;
  /** Hora de inicio y de fin (ms desde 1970); fin null mientras se graba. */
  inicio: number;
  fin: number | null;
  nombre: string;
  puntos: PuntoTrack[];
  notas: NotaTrack[];
  /** Segmento en curso. */
  seg: number;
}
export interface Lectura { t: number; lat: number; lon: number; alt?: number | null; prec: number }

const dosCifras = (n: number) => String(n).padStart(2, '0');
/** «Ruta 18/10/2026 09:05» (hora local). */
export function nombreRuta(t: number): string {
  const d = new Date(t);
  return `Ruta ${dosCifras(d.getDate())}/${dosCifras(d.getMonth() + 1)}/${d.getFullYear()} ${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}`;
}

export function nuevoTrack(id: string, t: number): Track {
  return { id, inicio: t, fin: null, nombre: nombreRuta(t), puntos: [], notas: [], seg: 0 };
}

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const altDe = (a: unknown) => (num(a) ? a : null);

/** Añade la lectura al track si pasa el filtro (muta el track). Devuelve si se aceptó. */
export function anadirPunto(tr: Track, l: Lectura): boolean {
  if (!num(l.lat) || !num(l.lon) || !num(l.t) || Math.abs(l.lat) > 90 || Math.abs(l.lon) > 180) return false;
  if (!num(l.prec) || l.prec > PRECISION_MAX_M) return false;
  const u = tr.puntos[tr.puntos.length - 1];
  if (u && u.seg === tr.seg) {
    if (l.t < u.t) return false;
    if (distanciaM(u, l) < Math.max(DIST_MIN_M, l.prec / 2)) return false;
  }
  tr.puntos.push({ t: l.t, lat: l.lat, lon: l.lon, alt: altDe(l.alt), prec: Math.round(l.prec), seg: tr.seg });
  return true;
}

/** Empieza un segmento nuevo (al reanudar tras una recarga o una pausa larga del GPS). */
export function nuevoSegmento(tr: Track) {
  if (tr.puntos.some((p) => p.seg === tr.seg)) tr.seg++;
}

/** Añade una nota con posición; el texto se recorta a MAX_NOTA caracteres. */
export function anadirNota(tr: Track, n: Omit<NotaTrack, 'texto' | 'estrellas' | 'alt'> & { texto: string; estrellas?: number; alt?: number | null }): NotaTrack {
  const e = Math.round(n.estrellas ?? 0);
  const nota: NotaTrack = { id: n.id, t: n.t, lat: n.lat, lon: n.lon, alt: altDe(n.alt), texto: n.texto.trim().slice(0, MAX_NOTA),
    estrellas: (e >= 0 && e <= 3 ? e : 0) as NotaTrack['estrellas'] };
  tr.notas.push(nota);
  return nota;
}

export interface Resumen {
  distancia_m: number;
  /** null sin altitud del GPS (PENDIENTE). */
  subida_m: number | null;
  bajada_m: number | null;
  duracion_s: number;
  puntos: number;
  notas: number;
  segmentos: number;
}

/** Subida y bajada con histéresis sobre una serie de altitudes (null = sin dato, se salta). */
export function desnivelSerie(alts: (number | null)[], umbral = UMBRAL_DESNIVEL_M): { subida: number; bajada: number } | null {
  let ref: number | null = null, subida = 0, bajada = 0, alguna = false;
  for (const a of alts) {
    if (!num(a)) continue;
    alguna = true;
    if (ref === null) { ref = a; continue; }
    if (a - ref >= umbral) { subida += a - ref; ref = a; } else if (ref - a >= umbral) { bajada += ref - a; ref = a; }
  }
  return alguna ? { subida: Math.round(subida), bajada: Math.round(bajada) } : null;
}

/** Resumen del track; `ahora` cuenta la duración de una grabación en curso. */
export function resumen(tr: Track, ahora?: number): Resumen {
  let dist = 0, sub = 0, baj = 0, conAlt = false;
  const segs = [...new Set(tr.puntos.map((p) => p.seg))];
  for (const s of segs) {
    const ps = tr.puntos.filter((p) => p.seg === s);
    for (let i = 1; i < ps.length; i++) dist += distanciaM(ps[i - 1], ps[i]);
    const d = desnivelSerie(ps.map((p) => p.alt));
    if (d) { conAlt = true; sub += d.subida; baj += d.bajada; }
  }
  const fin = tr.fin ?? ahora ?? tr.puntos[tr.puntos.length - 1]?.t ?? tr.inicio;
  return { distancia_m: Math.round(dist), subida_m: conAlt ? sub : null, bajada_m: conAlt ? baj : null,
    duracion_s: Math.max(0, Math.round((fin - tr.inicio) / 1000)), puntos: tr.puntos.length, notas: tr.notas.length, segmentos: segs.length };
}

/** «45 s», «12 min», «2 h 05 min». */
export function textoDuracion(s: number): string {
  if (s < 60) return `${Math.max(0, Math.round(s))} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${dosCifras(min % 60)} min`;
}

/** «3,2 km» o «850 m». */
export function textoKm(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km`;
}

/** «3,2 km · +240 m / −230 m · 2 h 05 min» (desnivel PENDIENTE sin altitud del GPS). */
export function textoResumen(r: Resumen): string {
  const des = r.subida_m === null ? 'desnivel PENDIENTE (el GPS no dio altitud)' : `+${r.subida_m} m / −${r.bajada_m} m (aprox.)`;
  return `${textoKm(r.distancia_m)} · ${des} · ${textoDuracion(r.duracion_s)}`;
}

const estrellas = (n: number) => '★'.repeat(n);
const iso = (t: number) => new Date(t).toISOString();
const ele = (a: number | null) => (a === null ? '' : `<ele>${Math.round(a * 10) / 10}</ele>`);

/** Nombre del waypoint de una nota: «★★ aquí boletus» (recortado a 60). */
export function nombreNota(n: NotaTrack, i: number): string {
  const t = n.texto.replace(/\s+/g, ' ').trim();
  const base = t ? (t.length > 60 ? `${t.slice(0, 59)}…` : t) : `Nota ${i + 1}`;
  return n.estrellas ? `${estrellas(n.estrellas)} ${base}` : base;
}

/** GPX 1.1: metadatos con el resumen, un wpt por nota y un trk con un trkseg por segmento. */
export function trackAGpx(tr: Track): string {
  const r = resumen(tr);
  const wpts = tr.notas.map((n, i) => `  <wpt lat="${n.lat.toFixed(6)}" lon="${n.lon.toFixed(6)}">${ele(n.alt)}<time>${iso(n.t)}</time>`
    + `<name>${escaparXml(nombreNota(n, i))}</name><desc>${escaparXml(n.texto)}</desc></wpt>`);
  const segs = [...new Set(tr.puntos.map((p) => p.seg))].map((s) => '    <trkseg>\n'
    + tr.puntos.filter((p) => p.seg === s).map((p) => `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">${ele(p.alt)}<time>${iso(p.t)}</time></trkpt>`).join('\n')
    + '\n    </trkseg>');
  return ['<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Mapa de setas" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><name>${escaparXml(tr.nombre)}</name><desc>${escaparXml(textoResumen(r))}</desc><time>${iso(tr.inicio)}</time></metadata>`,
    ...wpts,
    `  <trk><name>${escaparXml(tr.nombre)}</name>`, ...segs, '  </trk>',
    '</gpx>', ''].join('\n');
}

/** «ruta-2026-10-18-0905.gpx» (hora local). */
export function nombreArchivoGpx(tr: Track): string {
  const d = new Date(tr.inicio);
  return `ruta-${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}-${dosCifras(d.getHours())}${dosCifras(d.getMinutes())}.gpx`;
}

/** Valida un track leído del almacenamiento (grabación en curso recuperada tras una recarga); null si no sirve. */
export function validarTrack(x: unknown): Track | null {
  const t = x as Track;
  if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !num(t.inicio) || !Array.isArray(t.puntos) || !Array.isArray(t.notas)) return null;
  const puntos = t.puntos.filter((p) => p && num(p.lat) && num(p.lon) && num(p.t))
    .map((p) => ({ t: p.t, lat: p.lat, lon: p.lon, alt: altDe(p.alt), prec: num(p.prec) ? p.prec : 0, seg: num(p.seg) ? p.seg : 0 }));
  const notas = t.notas.filter((n) => n && num(n.lat) && num(n.lon) && num(n.t) && typeof n.texto === 'string')
    .map((n) => ({ id: String(n.id ?? n.t), t: n.t, lat: n.lat, lon: n.lon, alt: altDe(n.alt), texto: n.texto.slice(0, MAX_NOTA),
      estrellas: ([0, 1, 2, 3].includes(n.estrellas) ? n.estrellas : 0) as NotaTrack['estrellas'] }));
  return { id: t.id, inicio: t.inicio, fin: num(t.fin) ? t.fin : null, nombre: typeof t.nombre === 'string' && t.nombre ? t.nombre : nombreRuta(t.inicio),
    puntos, notas, seg: num(t.seg) ? t.seg : Math.max(0, ...puntos.map((p) => p.seg)) };
}

/** GeoJSON del track para pintarlo en el mapa: una línea por segmento y un punto por nota. */
export function trackAGeojson(tr: Track) {
  const segs = [...new Set(tr.puntos.map((p) => p.seg))];
  return { type: 'FeatureCollection' as const, features: [
    ...segs.map((s) => ({ type: 'Feature' as const, properties: { tipo: 'track', seg: s },
      geometry: { type: 'LineString' as const, coordinates: tr.puntos.filter((p) => p.seg === s).map((p) => [p.lon, p.lat]) } }))
      .filter((f) => f.geometry.coordinates.length >= 2),
    ...tr.notas.map((n, i) => ({ type: 'Feature' as const, properties: { tipo: 'nota', n: i + 1, texto: n.texto, estrellas: n.estrellas },
      geometry: { type: 'Point' as const, coordinates: [n.lon, n.lat] } })),
  ] };
}
