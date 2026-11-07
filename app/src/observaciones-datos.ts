// «Explorar aquí» (2026-10-25): una observación = un barrido de fotos con rumbo en un punto, lo que decía el modelo ahí,
// lo que describió Gemini y lo que encontraste. Puro, sin DOM ni IndexedDB (observaciones-datos.test.ts);
// observaciones.ts guarda y observaciones-ui.ts pinta.
//  - validarObservacion normaliza lo leído de IndexedDB (como validarTrack en grabacion.ts): lo que no encaja se rellena
//    con el valor «sin dato» (null, 'no_se_ve'), nunca con un número inventado.
//  - aGeoJSON no lleva fotos ni binarios. Que el pipeline use los hallazgos como citas es una decisión aparte.
import type { FeatureCollection } from 'geojson';
import type { ValoresCelda } from './micro';
import { ARBOL } from './micro';
import { MAX_NOTA, type NotaTrack } from './grabacion';
import { nuevoId } from './intercambio';

export const ARBOLES_OBS = ['alcornoque', 'encina', 'quejigo', 'castano', 'pino', 'eucalipto', 'otro', 'no_se_ve'] as const;
export const CONFIANZAS = ['baja', 'media', 'alta'] as const;
export const COPAS = ['abierta', 'media', 'cerrada', 'no_se_ve'] as const;
export const SOTOBOSQUES = ['despejado', 'matorral_bajo', 'matorral_denso', 'no_se_ve'] as const;
export const SUELOS = ['hojarasca', 'musgo', 'pasto', 'roca', 'tierra_desnuda'] as const;
export const HUMEDADES = ['seca', 'media', 'humeda', 'no_se_ve'] as const;
export const ESTADOS = ['sin_analizar', 'pendiente', 'analizada', 'error'] as const;
export const HALLAZGOS = ['no_mirado', 'nada', 'encontrada'] as const;
export const MAX_NOTAS_DIRECCION = 200;

export type ArbolObs = typeof ARBOLES_OBS[number];
export interface DireccionGemini {
  rumbo: number; arbol_dominante: ArbolObs; confianza_arbol: 'baja' | 'media' | 'alta';
  densidad_copas: 'abierta' | 'media' | 'cerrada' | 'no_se_ve';
  sotobosque: 'despejado' | 'matorral_bajo' | 'matorral_denso' | 'no_se_ve';
  suelo_visible: ('hojarasca' | 'musgo' | 'pasto' | 'roca' | 'tierra_desnuda')[];
  humedad_aparente: 'seca' | 'media' | 'humeda' | 'no_se_ve';
  notas: string;
}
export interface DireccionObs { rumbo: number; precBrujula: number | null; foto: Blob | null; analisis: DireccionGemini | null }
export interface Observacion {
  id: string; t: number; lat: number; lon: number; precGps: number;
  altGps: number | null; altModelo: number | null; especie: string; rutaId: string | null;
  modelo: Omit<ValoresCelda, 'dist_m' | 'rumbo'> | null;
  /** Idoneidad máxima del modelo por sector de 45° (índice = posición en `direcciones`), null = sin celdas. */
  modeloSector: (number | null)[];
  /** Árbol (nombre de ARBOL en micro.ts) de la celda de mayor idoneidad de cada sector; null = sin celdas o sin árbol. */
  arbolSector: (string | null)[];
  direcciones: DireccionObs[];
  estado: 'sin_analizar' | 'pendiente' | 'analizada' | 'error';
  error: string | null;
  hallazgo: 'no_mirado' | 'nada' | 'encontrada'; especieHallada: string; nota: string;
}

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const numONull = (x: unknown) => (num(x) ? x : null);
const enumDe = <T extends string>(x: unknown, valores: readonly T[], porDefecto: T): T => (valores.includes(x as T) ? (x as T) : porDefecto);

export function nuevaObservacion(p: { lat: number; lon: number; precGps: number; altGps: number | null; altModelo: number | null;
  especie: string; rutaId: string | null; t?: number; id?: string }): Observacion {
  return { id: p.id ?? nuevoId(), t: p.t ?? Date.now(), lat: p.lat, lon: p.lon, precGps: p.precGps, altGps: p.altGps, altModelo: p.altModelo,
    especie: p.especie, rutaId: p.rutaId, modelo: null, modeloSector: [], arbolSector: [], direcciones: [],
    estado: 'sin_analizar', error: null, hallazgo: 'no_mirado', especieHallada: '', nota: '' };
}

/** Normaliza un análisis de Gemini: valores fuera de lista → 'no_se_ve' (confianza 'baja'); sin rumbo numérico → null. */
export function normalizarDireccion(x: unknown): DireccionGemini | null {
  const d = x as Record<string, unknown> | null;
  if (!d || typeof d !== 'object' || !num(d.rumbo)) return null;
  return {
    rumbo: d.rumbo,
    arbol_dominante: enumDe(d.arbol_dominante, ARBOLES_OBS, 'no_se_ve'),
    confianza_arbol: enumDe(d.confianza_arbol, CONFIANZAS, 'baja'),
    densidad_copas: enumDe(d.densidad_copas, COPAS, 'no_se_ve'),
    sotobosque: enumDe(d.sotobosque, SOTOBOSQUES, 'no_se_ve'),
    suelo_visible: Array.isArray(d.suelo_visible) ? [...new Set(d.suelo_visible.filter((s): s is typeof SUELOS[number] => SUELOS.includes(s as never)))] : [],
    humedad_aparente: enumDe(d.humedad_aparente, HUMEDADES, 'no_se_ve'),
    notas: typeof d.notas === 'string' ? d.notas.slice(0, MAX_NOTAS_DIRECCION) : '',
  };
}

const esBlob = (x: unknown): x is Blob => typeof Blob !== 'undefined' && x instanceof Blob;

/** Normaliza lo leído de IndexedDB; null si no es una observación válida. */
export function validarObservacion(x: unknown): Observacion | null {
  const o = x as Record<string, any> | null;
  if (!o || typeof o !== 'object' || typeof o.id !== 'string' || !o.id || !num(o.t) || !num(o.lat) || !num(o.lon) || !num(o.precGps)) return null;
  const direcciones: DireccionObs[] = (Array.isArray(o.direcciones) ? o.direcciones : [])
    .filter((d: any) => d && typeof d === 'object' && num(d.rumbo))
    .map((d: any) => ({ rumbo: d.rumbo, precBrujula: numONull(d.precBrujula), foto: esBlob(d.foto) ? d.foto : null, analisis: normalizarDireccion(d.analisis) }));
  const m = o.modelo;
  return {
    id: o.id, t: o.t, lat: o.lat, lon: o.lon, precGps: o.precGps,
    altGps: numONull(o.altGps), altModelo: numONull(o.altModelo),
    especie: typeof o.especie === 'string' ? o.especie : '',
    rutaId: typeof o.rutaId === 'string' ? o.rutaId : null,
    modelo: m && typeof m === 'object' && num(m.idon) ? m : null,
    modeloSector: Array.isArray(o.modeloSector) ? o.modeloSector.map(numONull) : [],
    arbolSector: Array.isArray(o.arbolSector) ? o.arbolSector.map((a: unknown) => (typeof a === 'string' ? a : null)) : [],
    direcciones,
    estado: enumDe(o.estado, ESTADOS, 'sin_analizar'),
    error: typeof o.error === 'string' ? o.error : null,
    hallazgo: enumDe(o.hallazgo, HALLAZGOS, 'no_mirado'),
    especieHallada: typeof o.especieHallada === 'string' ? o.especieHallada : '',
    nota: typeof o.nota === 'string' ? o.nota.slice(0, MAX_NOTA) : '',
  };
}

/** FeatureCollection de puntos sin fotos (ver cabecera). */
export function aGeoJSON(obs: Observacion[]): FeatureCollection {
  return { type: 'FeatureCollection', features: obs.map((o) => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [o.lon, o.lat] },
    properties: {
      id: o.id, fecha: new Date(o.t).toISOString(), especie: o.especie, hallazgo: o.hallazgo, especieHallada: o.especieHallada, nota: o.nota,
      idon: o.modelo?.idon ?? null,
      arbol_modelo: o.modelo?.arbol != null ? ARBOL[o.modelo.arbol] ?? null : null,
      direcciones: o.direcciones.filter((d) => d.analisis).map((d) => ({ rumbo: d.rumbo, arbol: d.analisis!.arbol_dominante,
        copas: d.analisis!.densidad_copas, sotobosque: d.analisis!.sotobosque, humedad: d.analisis!.humedad_aparente })),
    },
  })) };
}

/** Nota de la ruta en curso que enlaza la observación: «Observación: 8 fotos». El id lleva el de la observación. */
export function notaDeObservacion(o: Observacion): NotaTrack {
  const n = o.direcciones.length;
  const partes = [`${n} ${n === 1 ? 'foto' : 'fotos'}`];
  if (o.hallazgo === 'encontrada') partes.push('encontrada');
  else if (o.hallazgo === 'nada') partes.push('nada');
  return { id: `obs-${o.id}`, t: o.t, lat: o.lat, lon: o.lon, alt: o.altGps, texto: `Observación: ${partes.join(', ')}`.slice(0, MAX_NOTA), estrellas: 0 };
}
