// Capa de restricciones de recogida (pipeline exportar.py → restricciones.pmtiles, capa 'restricciones' con
// tipo, nombre, zona y texto): utilidades sin DOM para saber si un punto cae dentro de un recinto restringido.
// La consulta lee la tesela del PMTiles (OPFS o HTTP) y no depende de lo que esté pintado, así que funciona
// sin conexión y aunque la capa esté oculta (ver mapa.ts, restriccionEn).
import type { Geometry, Position } from 'geojson';

export interface Restriccion { tipo: string; nombre: string; zona: string; texto: string }

export const NOMBRE_TIPO_RESTRICCION: Record<string, string> = {
  zona_reserva: 'Zona de Reserva', reserva_natural: 'Reserva Natural', parque_nacional: 'Parque Nacional',
};
/** Nota bajo la normativa: cita las siglas de los boletines de la zona (EntradaLegal.sigla o normas de legado). */
export function orientativo(normas: string[]): string {
  const n = [...new Set(normas.filter(Boolean))];
  return `Información orientativa: comprueba la normativa vigente${n.length ? ` (${n.join(', ')})` : ''} antes de recoger.`;
}

/** Tesela XYZ (Web Mercator) que contiene el punto en el nivel z. */
export function teselaDe(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  const lim = (v: number) => Math.min(n - 1, Math.max(0, v));
  return { x: lim(x), y: lim(y) };
}

/** Rayo par-impar sobre un anillo [lon, lat]. */
function cruces(anillo: Position[], lon: number, lat: number): boolean {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i], [xj, yj] = anillo[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** ¿Está el punto dentro del (Multi)Polygon? Par-impar sobre todos los anillos: los huecos quedan fuera. */
export function dentroDe(g: Geometry, lat: number, lon: number): boolean {
  const poligonos = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  let dentro = false;
  for (const p of poligonos) for (const anillo of p) if (cruces(anillo, lon, lat)) dentro = !dentro;
  return dentro;
}

/** «SIERRA DE LAS NIEVES» → «Sierra de las Nieves» (solo si viene todo en mayúsculas). */
export function nombreLegible(n: string): string {
  const t = n.trim();
  if (t !== t.toLocaleUpperCase('es-ES')) return t;
  const menores = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en']);
  return t.toLocaleLowerCase('es-ES').split(' ').map((w, i) =>
    i > 0 && menores.has(w) ? w : w.charAt(0).toLocaleUpperCase('es-ES') + w.slice(1)).join(' ');
}

/** Propiedades de una entidad de la capa → Restriccion (texto por tipo del manifest si la entidad no lo trae). */
export function aRestriccion(p: Record<string, unknown>, textos: Record<string, string> = {}): Restriccion {
  const tipo = String(p.tipo ?? '');
  return { tipo, nombre: nombreLegible(String(p.nombre ?? '')), zona: String(p.zona ?? ''),
    texto: String(p.texto || textos[tipo] || '') };
}

/** Recintos restringidos que contienen el punto (sin repetir tipo + nombre), en el orden de la capa. */
export function restriccionesEn(fs: { properties: Record<string, unknown>; geometry: Geometry }[], lat: number, lon: number,
  textos: Record<string, string> = {}): Restriccion[] {
  const r: Restriccion[] = [];
  for (const f of fs) {
    if (!dentroDe(f.geometry, lat, lon)) continue;
    const x = aRestriccion(f.properties, textos);
    if (!r.some((y) => y.tipo === x.tipo && y.nombre === x.nombre)) r.push(x);
  }
  return r;
}

/** Texto corto del aviso (chip): «Parque Nacional · Sierra de las Nieves». */
export function textoChip(r: Restriccion): string {
  return [NOMBRE_TIPO_RESTRICCION[r.tipo] ?? r.zona ?? 'Zona restringida', r.nombre].filter(Boolean).join(' · ');
}
