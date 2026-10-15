// Tops por día (fase 9): orden de los sitios candidatos de sitios.json para una fecha. Puro, sin DOM (ranking.test.ts).
//
// puntuación(sitio, D) = calidad × factor del semáforo × factor de fiabilidad
//   calidad      = punt_media × ln(1 + area_ha) × bonus_pisado   (la misma con la que el pipeline los ordena)
//   semáforo     = estado de la especie en el punto meteo del sitio el día D: verde 1, amarillo 0,5, gris 0,3, rojo 0,1
//   fiabilidad   = la del mapa de la especie: buena 1, media 0,85, sin validar 0,75, baja 0,6
// y el filtro de dificultad máxima del usuario quita los sitios que lo superan (no los rebaja). Con «solo montes
// públicos» se quitan también los que no caen en un monte público (titularidad de sitios.json).
// Para enseñarla se pasa a 0–100 contra el máximo teórico (100 × ln 101 × 1 × 1 × 1): así un mismo sitio vale
// lo mismo de un día a otro salvo por el tiempo.
import type { Estado } from './semaforo';
import type { Fiabilidad } from './fiabilidad';
import { dentroDeDificultad, dificultad, type Dificultad } from './ruta';
import { esPublico, type Titularidad } from './titularidad';

export interface SitioCandidato {
  id: number;                 // índice plano de la celda (fila·ancho + col) en acceso.bin
  lat: number;
  lon: number;
  area_ha: number;
  area_mancha_ha?: number;
  punt_media: number;
  punt_max: number;
  t_pie_min: number;
  subida_m: number;
  dist_camino_m: number;
  aparcamiento_id: number | null;
  restringido: boolean;
  meteo_id: number;
  bonus_pisado?: number;
  /** Titularidad del punto (pipeline sitios.py + titularidad.py); sin dato = como «probablemente privado». */
  titularidad?: Titularidad;
}
export interface SitiosJson { version: number; generado: string; especies: Record<string, SitioCandidato[]> }

export const FACTOR_SEMAFORO: Record<Estado, number> = { verde: 1, amarillo: 0.5, gris: 0.3, rojo: 0.1 };
export const FACTOR_FIABILIDAD: Record<Fiabilidad, number> = { buena: 1, media: 0.85, sin_validar: 0.75, baja: 0.6 };
export const CALIDAD_MAX = 100 * Math.log(101);
export const MAX_GENERAL = 20;
export const RADIO_FUSION_M = 300;

export const calidad = (s: SitioCandidato) => s.punt_media * Math.log(1 + s.area_ha) * (s.bonus_pisado ?? 1);
export const puntuacion100 = (score: number) => Math.max(0, Math.min(100, Math.round((100 * score) / CALIDAD_MAX)));

export interface Entrada {
  especie: string;
  sitio: SitioCandidato;
  estado: Estado;
  dificultad: Dificultad;
  score: number;
  puntuacion: number;        // 0–100
}

/** Estado del semáforo de una especie en un punto meteo el día elegido (null = sin datos). */
export type EstadoEn = (especie: string, meteoId: number) => Estado | null;

export interface Opciones {
  estadoEn: EstadoEn;
  fiabilidad: (especie: string) => Fiabilidad;
  maxDificultad: Dificultad | null;
  /** Solo sitios en monte público (autonómico o municipal). */
  soloPublicos?: boolean;
}

export function puntuar(especie: string, s: SitioCandidato, o: Opciones): Entrada | null {
  const dif = dificultad(s.t_pie_min, s.subida_m);
  if (!dentroDeDificultad(dif, o.maxDificultad)) return null;
  if (o.soloPublicos && !esPublico(s.titularidad)) return null;
  const estado = o.estadoEn(especie, s.meteo_id) ?? 'gris';
  const score = calidad(s) * FACTOR_SEMAFORO[estado] * FACTOR_FIABILIDAD[o.fiabilidad(especie)];
  return { especie, sitio: s, estado, dificultad: dif, score, puntuacion: puntuacion100(score) };
}

const porScore = (a: Entrada, b: Entrada) => b.score - a.score || a.sitio.id - b.sitio.id;

/** Los `n` mejores sitios de una especie para el día (todos los estados, rojo incluido: salen abajo). */
export function topEspecie(datos: SitiosJson, especie: string, o: Opciones, n = 10): Entrada[] {
  return (datos.especies[especie] ?? []).map((s) => puntuar(especie, s, o)).filter((e): e is Entrada => !!e).sort(porScore).slice(0, n);
}

export interface FilaGeneral { principal: Entrada; entradas: Entrada[]; especies: string[] }

/** Distancia en metros (haversine). */
export function distanciaM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/**
 * Une en una fila las entradas cuyos puntos están a ≤ `radio` m de la principal de una fila ya abierta (las entradas
 * llegan ordenadas: la principal es la de más puntuación). Una especie no se repite dentro de una fila.
 */
export function fusionar(entradas: Entrada[], radio = RADIO_FUSION_M): FilaGeneral[] {
  const filas: FilaGeneral[] = [];
  for (const e of entradas) {
    const f = filas.find((x) => distanciaM(x.principal.sitio, e.sitio) <= radio);
    if (f) { if (!f.especies.includes(e.especie)) { f.entradas.push(e); f.especies.push(e.especie); } }
    else filas.push({ principal: e, entradas: [e], especies: [e.especie] });
  }
  return filas;
}

/**
 * Top general: de cada especie, sus `n` mejores sitios que no estén en rojo ese día; todo junto, ordenado, fusionado
 * a 300 m y cortado a `max` filas.
 */
export function topGeneral(datos: SitiosJson, especies: string[], o: Opciones, n = 2, max = MAX_GENERAL): FilaGeneral[] {
  const todas: Entrada[] = [];
  for (const id of especies) {
    const l = (datos.especies[id] ?? []).map((s) => puntuar(id, s, o)).filter((e): e is Entrada => !!e && e.estado !== 'rojo').sort(porScore);
    todas.push(...l.slice(0, n));
  }
  return fusionar(todas.sort(porScore)).slice(0, max);
}

/** Valida lo justo de sitios.json para no romper la pestaña con un archivo raro. */
export function parsearSitios(j: unknown): SitiosJson | null {
  const o = j as SitiosJson;
  if (!o || typeof o !== 'object' || typeof o.especies !== 'object' || !o.especies) return null;
  const especies: SitiosJson['especies'] = {};
  for (const [k, l] of Object.entries(o.especies)) {
    if (!Array.isArray(l)) continue;
    especies[k] = l.filter((s) => s && Number.isFinite(s.lat) && Number.isFinite(s.lon) && Number.isFinite(s.punt_media)
      && Number.isFinite(s.area_ha) && Number.isFinite(s.t_pie_min) && Number.isFinite(s.subida_m));
  }
  return { version: o.version, generado: o.generado, especies };
}
