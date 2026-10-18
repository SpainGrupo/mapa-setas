// «Ir al sitio» (2026-10-18): rumbo del GPS al sitio, giro de la flecha según la brújula del teléfono, distancia y
// desnivel restante. Puro, sin DOM (brujula.test.ts); ir-sitio.ts pinta la vista y escucha los sensores.
//  - Rumbo: el inicial del círculo máximo (de sobra para unos km), en grados desde el norte geográfico, horario.
//  - Brújula: iOS da `webkitCompassHeading` (grados desde el norte magnético, horario, ya corregido por iOS); el resto
//    da `alpha` de `deviceorientationabsolute` (antihorario desde el norte): rumbo = 360 − alpha. En ambos casos se suma
//    el giro de la pantalla (apaisado). La declinación magnética en Andalucía es ~1° W: no se corrige.
//  - Desnivel: altitud del sitio (modelo del terreno de acceso.bin, celdas de 100 m) menos altitud del GPS. Sin una de
//    las dos, PENDIENTE: no se inventa.
import { distanciaM } from './ranking';
import { PENDIENTE } from './orden-tops';

export { distanciaM };

/** Ángulo en [0, 360). */
export const normalizar = (g: number) => ((g % 360) + 360) % 360;

/** Rumbo inicial (grados, 0 = norte, horario) de `a` a `b`. */
export function rumbo(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const f1 = a.lat * r, f2 = b.lat * r, dl = (b.lon - a.lon) * r;
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return normalizar(Math.atan2(y, x) / r);
}

/** Giro de la flecha en pantalla: el rumbo al sitio menos hacia dónde mira el teléfono (null = sin brújula: respecto
 * al norte, con la flecha como en un mapa norte arriba). */
export const giroFlecha = (rumboSitio: number, orientacion: number | null) => normalizar(rumboSitio - (orientacion ?? 0));

const CARDINALES = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'];
const CORTOS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
/** Punto cardinal (8 rumbos) de un ángulo. */
export const cardinal = (g: number) => CARDINALES[Math.round(normalizar(g) / 45) % 8];
export const cardinalCorto = (g: number) => CORTOS[Math.round(normalizar(g) / 45) % 8];
/** «al noreste (47°)». */
export const textoRumbo = (g: number) => `al ${cardinal(g)} (${Math.round(normalizar(g)) % 360}°)`;

export interface LecturaOrientacion {
  webkitCompassHeading?: number | null;
  alpha?: number | null;
  absolute?: boolean;
}

/**
 * Hacia dónde mira la parte de arriba de la pantalla (grados desde el norte) a partir de un DeviceOrientationEvent.
 * `anguloPantalla` = screen.orientation.angle (0 en vertical, 90 apaisado…). null si el evento no da el norte.
 */
export function orientacionDe(ev: LecturaOrientacion, anguloPantalla = 0): number | null {
  const w = ev.webkitCompassHeading;
  if (typeof w === 'number' && Number.isFinite(w) && w >= 0) return normalizar(w + anguloPantalla);
  if (ev.absolute && typeof ev.alpha === 'number' && Number.isFinite(ev.alpha)) return normalizar(360 - ev.alpha + anguloPantalla);
  return null;
}

/** Suaviza la brújula (el sensor tiembla): paso `k` del camino más corto entre ángulos. */
export function suavizarAngulo(previo: number | null, nuevo: number, k = 0.25): number {
  if (previo === null) return normalizar(nuevo);
  const d = ((nuevo - previo + 540) % 360) - 180;
  return normalizar(previo + d * k);
}

/** Desnivel que queda (m): altitud del sitio − altitud del GPS; null si falta alguna. */
export function desnivel(altGps: number | null | undefined, altSitio: number | null | undefined): number | null {
  if (typeof altGps !== 'number' || !Number.isFinite(altGps) || typeof altSitio !== 'number' || !Number.isFinite(altSitio)) return null;
  return altSitio - altGps;
}

/** «≈ 120 m por subir», «≈ 40 m por bajar», «casi a la misma altura» o «Desnivel: PENDIENTE (…)». */
export function textoDesnivel(d: number | null, motivo = ''): string {
  if (d === null) return `Desnivel: ${PENDIENTE}${motivo ? ` (${motivo})` : ''}`;
  const m = Math.round(Math.abs(d) / 5) * 5;
  if (m < 10) return 'Casi a la misma altura';
  return `≈ ${m} m por ${d > 0 ? 'subir' : 'bajar'}`;
}

/** Navegación de Google Maps desde la ubicación actual (sin origin: Google usa tu posición). */
export function urlNavegarGoogle(p: { lat: number; lon: number }, modo: 'driving' | 'walking' = 'driving'): string {
  const q = new URLSearchParams({ api: '1', destination: `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`, travelmode: modo, dir_action: 'navigate' });
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}
