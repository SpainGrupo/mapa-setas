export interface Sitio {
  id: string;
  lat: number;
  lon: number;
  estrellas: 1 | 2 | 3;
  nota: string;
  especie: string;        // id de especie ('' = sin especificar)
  fecha: string;          // ISO 8601
  foto?: Blob;
  /** Aparcamiento más cercano a pie (ficha «Acceso»), si el sitio se guardó desde ella. */
  acceso?: AccesoSitio;
}

export interface AccesoSitio { lat: number; lon: number; via: string; tiempo_min: number; subida_m: number }

import type { Reglas } from './semaforo';
import type { Fiabilidad } from './fiabilidad';

export interface Especie { id: string; nombre: string; tiempo?: Reglas; fiabilidad?: Fiabilidad;
  /** Citas de la zona con precisión ≤ 1 km que usó la calibración (calibracion.json → exportar.especies). */
  n_citas?: number | null;
  /** Multi-región: la especie está en la guía pero sin hábitat en esta región (sin pmtiles de idoneidad). */
  sin_habitat?: boolean;
  /** false: el perfil no está validado con citas en esta región (exportar.calibrado). Ausente en manifests antiguos. */
  calibrado?: boolean }

export interface Manifest {
  generado: string;
  bbox: [number, number, number, number];
  especies: Especie[];
  umbrales: number[];
  zoom: { idoneidad: [number, number]; sombreado: [number, number]; base_max: number };
  base: string | null;
  meteo?: { puntos: string; zonas: string } | null;
  /** Acceso a pie desde el coche (pipeline acceso.py): cabecera JSON, binario (.bin o .bin.gz) y aparcamientos. */
  acceso?: { cabecera: string; datos: string; aparcamientos: string } | null;
  /** Rutas y senderos (GR/PR/SL), PMTiles con la capa 'rutas'. */
  rutas?: string | null;
  /** Recintos donde recoger exige autorización (capa 'restricciones': tipo, nombre, zona, texto), textos por tipo y aviso legal. */
  restricciones?: { capa: string; tipos: Record<string, string>; aviso: string } | null;
  /** Sitios candidatos por especie (pipeline sitios.py), para los tops de la pestaña Hoy. */
  sitios?: { archivo: string; version: number; n_por_especie?: Record<string, number> } | null;
  /** Titularidad (titularidad.py): montes públicos, cotos, señales OSM y pasos públicos; textos, aviso y norma. */
  titularidad?: { capa: string; textos: Record<string, string>; aviso: string; norma: string; montes_junta?: number;
    montes_municipales?: number } | null;
  /** Citas y sitios conocidos (exportar.exportar_citas): PMTiles con la capa 'citas'. */
  citas?: { capa: string; n?: number; por_origen?: Record<string, number> } | null;
  /** Multi-región (contrato en docs/superpowers/plans/2026-10-15-multi-region-fase-b-app.md). Validados en manifest-region.ts. */
  region?: unknown;
  legal?: unknown;
  atribuciones?: unknown;
  /** PMTiles de comunidades autónomas (capa 'ccaa', propiedades id y nombre). */
  ccaa?: string | null;
  avisos?: unknown;
  archivos: { nombre: string; bytes: number }[];
  total_bytes: number;
  /** Reconocedor offline (modelo/construir.py): descarga opcional aparte, no cuenta en total_bytes. */
  modelo?: PaqueteModelo | null;
}

export interface PaqueteModelo {
  version: string;
  ort_version: string;
  etiquetas: number;
  dir: string;                 // relativo a data/, con barra final
  /** Sitios candidatos por especie (pipeline sitios.py), para los tops de la pestaña Hoy. */
  sitios?: { archivo: string; version: number; n_por_especie?: Record<string, number> } | null;
  archivos: { nombre: string; bytes: number }[];
  total_bytes: number;
}
