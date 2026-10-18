// «Exportar día» (pestaña Hoy): los mejores sitios del día y filtro actuales como ruta de Google Maps, KML y texto para
// compartir. Puro, sin DOM (exportar-dia.test.ts); hoy-ui.ts pinta el panel y hace la descarga y el Web Share.
//  - Selección: el orden elegido en «Ordenar por» (orden-tops.ts), con los sitios en verde delante (orden estable);
//    como mucho MAX_SITIOS_EXPORTAR.
//  - Ruta: https://www.google.com/maps/dir/?api=1 con origin = tu GPS (si no hay, sin origin: Google usa tu ubicación),
//    destination = el último sitio y waypoints = el resto, en coche. Google Maps admite como mucho 9 waypoints en estas
//    URLs (https://developers.google.com/maps/documentation/urls/get-started#directions-action), así que 10 sitios = 9
//    paradas + destino; si llegaran más, se cortan.
//  - KML: un Placemark por sitio, como docs/setas-18.10.26.kml. Nunca dice que una seta sea comestible.
import type { Entrada } from './ranking';
import type { Estado } from './semaforo';
import { NOMBRE_DIFICULTAD, type Dificultad } from './ruta';
import { textoTiempo } from './acceso';
import { esPublico, TEXTO_TITULARIDAD, type Titularidad } from './titularidad';

export const MAX_SITIOS_EXPORTAR = 10;
/** Límite de Google Maps para `waypoints` en las URLs de ruta. */
export const MAX_WAYPOINTS_GOOGLE = 9;
export const PIE_SEGURIDAD = 'Orientativo. No consumas ninguna seta sin confirmación de un experto.';

export interface SetaExport {
  /** Nombre científico (o el del manifest). */
  cientifico: string;
  /** Nombre común; vacío o igual al científico = no se repite. */
  comun: string;
  grupo: string;
}

export interface SitioExport {
  lat: number;
  lon: number;
  puntuacion: number;
  estado: Estado;
  setas: SetaExport[];
  /** «Por qué» (razones.ts, con el motivo del semáforo). */
  porque: string;
  minutos: number;
  subida_m: number;
  dificultad: Dificultad;
  titularidad: Titularidad;
  /** Texto de zona con restricciones (manifest.chip_sitio_restringido), si aplica. */
  restriccion?: string | null;
}

/** Los sitios a exportar: en el orden recibido (el elegido en pantalla), los verdes delante, como mucho `max`. */
export function seleccionarSitios<T extends { principal: Pick<Entrada, 'estado'> }>(ordenados: readonly T[], max = MAX_SITIOS_EXPORTAR): T[] {
  const verdes = ordenados.filter((x) => x.principal.estado === 'verde');
  const resto = ordenados.filter((x) => x.principal.estado !== 'verde');
  return [...verdes, ...resto].slice(0, Math.max(0, max));
}

const coord = (p: { lat: number; lon: number }) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;

/** Ruta en coche de Google Maps por los sitios en orden (null sin sitios). */
export function urlRutaGoogle(sitios: readonly { lat: number; lon: number }[], origen: { lat: number; lon: number } | null): string | null {
  if (!sitios.length) return null;
  const xs = sitios.slice(0, MAX_WAYPOINTS_GOOGLE + 1);
  const q = new URLSearchParams({ api: '1' });
  if (origen) q.set('origin', coord(origen));
  q.set('destination', coord(xs[xs.length - 1]));
  const paradas = xs.slice(0, -1);
  if (paradas.length) q.set('waypoints', paradas.map(coord).join('|'));
  q.set('travelmode', 'driving');
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

/** Un sitio en Google Maps. */
export const urlSitioGoogle = (p: { lat: number; lon: number }) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coord(p))}`;

/** «2026-10-18» → «18.10.26». */
export const fechaCorta = (f: string) => `${f.slice(8, 10)}.${f.slice(5, 7)}.${f.slice(2, 4)}`;
/** «2026-10-18» → «18/10/2026». */
export const fechaLarga = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
export const nombreArchivoKml = (fecha: string) => `setas ${fechaCorta(fecha)}.kml`;

/** Escapa texto para XML (contenido y atributos). Quita los caracteres de control que XML 1.0 no admite. */
export function escaparXml(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** «Boletus aereus» o «Boletus aereus + Amanita caesarea». */
const nombreSetas = (s: SitioExport) => s.setas.map((x) => x.cientifico).join(' + ');

/** Nombre del Placemark: «N · Especie (puntuación)». */
export const nombrePlacemark = (s: SitioExport, n: number) => `${n} · ${nombreSetas(s)} (${s.puntuacion})`;

function textoSeta(x: SetaExport): string {
  const extra = [x.comun && x.comun !== x.cientifico ? x.comun : '', x.grupo ? `grupo ${x.grupo}` : ''].filter(Boolean).join(', ');
  return extra ? `${x.cientifico} (${extra})` : x.cientifico;
}

/** Texto de la titularidad para el KML: «PRIVADO, coto…» o «PÚBLICO, <monte>…». */
export function textoTitularidadKml(t: Titularidad): string {
  if (esPublico(t)) {
    const clase = TEXTO_TITULARIDAD[t.clase];
    return `PÚBLICO, ${t.monte ? `${t.monte} (${clase})` : clase}.`;
  }
  const extra = [t.refuerzos?.includes('coto') ? (t.coto ? `coto «${t.coto}»` : 'coto') : '',
    t.refuerzos?.includes('senal_privado') ? 'valla o paso privado cerca' : ''].filter(Boolean).join(', ');
  const paso = t.paso ? ` (con paso público${t.via ? `: ${t.via}` : ''}, no recoger fuera)` : '';
  return `PRIVADO${extra ? `, ${extra}` : ''}${paso}. Pide permiso antes de entrar.`;
}

export function textoAcceso(s: Pick<SitioExport, 'minutos' | 'subida_m' | 'dificultad'>): string {
  const sube = Math.round(s.subida_m);
  return `${textoTiempo(s.minutos)} a pie, ${sube < 5 ? 'casi llano' : `${sube} m de subida`} (${NOMBRE_DIFICULTAD[s.dificultad].toLowerCase()}).`;
}

/** Descripción del Placemark (texto plano, una línea por apartado). */
export function descripcionSitio(s: SitioExport): string {
  const l = [
    `${s.setas.length > 1 ? 'Setas' : 'Seta'}: ${s.setas.map(textoSeta).join('; ')}.`,
    `Por qué: ${s.porque.trim()}`,
    `Acceso: ${textoAcceso(s)}`,
    `Titularidad: ${textoTitularidadKml(s.titularidad)}`,
  ];
  if (s.restriccion?.trim()) l.push(`Restricciones: ${s.restriccion.trim()}`);
  l.push(PIE_SEGURIDAD);
  return l.join('\n');
}

/** KML del día con un Placemark por sitio, en orden. */
export function generarKml(fecha: string, sitios: readonly SitioExport[], filtro = ''): string {
  const cab = `Sitios del ${fechaLarga(fecha)}${filtro ? ` (${filtro})` : ''} según Mapa de setas. ${PIE_SEGURIDAD}`;
  const pm = sitios.map((s, i) => `<Placemark><name>${escaparXml(nombrePlacemark(s, i + 1))}</name>`
    + `<description>${escaparXml(descripcionSitio(s))}</description>`
    + `<Point><coordinates>${+s.lon.toFixed(5)},${+s.lat.toFixed(5)},0</coordinates></Point></Placemark>`);
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<kml xmlns="http://www.opengis.net/kml/2.2">', '<Document>',
    `<name>${escaparXml(`setas ${fechaCorta(fecha)}`)}</name>`, `<description>${escaparXml(cab)}</description>`,
    ...pm, '</Document>', '</kml>', ''].join('\n');
}

/** Texto para compartir: un sitio por línea, la ruta y el aviso. */
export function textoCompartir(fecha: string, sitios: readonly SitioExport[], ruta: string | null, filtro = ''): string {
  const l = [`Setas ${fechaLarga(fecha)}${filtro ? ` · ${filtro}` : ''}`,
    ...sitios.map((s, i) => `${nombrePlacemark(s, i + 1)}: ${urlSitioGoogle(s)}`)];
  if (ruta) l.push('', `Ruta en coche: ${ruta}`);
  l.push('', PIE_SEGURIDAD);
  return l.join('\n');
}

/** Ayuda para importar el KML en Google My Maps. */
export const AYUDA_MY_MAPS = 'Para tenerlo como lista privada que puedes compartir: abre Google My Maps (mymaps.google.com), '
  + 'pulsa «Crear un mapa nuevo», luego «Importar» en la capa sin título y elige el archivo KML. '
  + 'El mapa queda privado hasta que lo compartas desde «Compartir».';
