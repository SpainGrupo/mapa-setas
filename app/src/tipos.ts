export interface Sitio {
  id: string;
  lat: number;
  lon: number;
  estrellas: 1 | 2 | 3;
  nota: string;
  especie: string;        // id de especie ('' = sin especificar)
  fecha: string;          // ISO 8601
  foto?: Blob;
}

import type { Reglas } from './semaforo';

export interface Especie { id: string; nombre: string; tiempo?: Reglas }

export interface Manifest {
  generado: string;
  bbox: [number, number, number, number];
  especies: Especie[];
  umbrales: number[];
  zoom: { idoneidad: [number, number]; sombreado: [number, number]; base_max: number };
  base: string | null;
  meteo?: { puntos: string; zonas: string } | null;
  archivos: { nombre: string; bytes: number }[];
  total_bytes: number;
}
