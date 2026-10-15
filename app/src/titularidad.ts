// Titularidad del monte (pipeline titularidad.py → titularidad.pmtiles, capa 'titularidad' con clase, nombre,
// detalle y texto): utilidades sin DOM. Misma regla que titularidad.etiqueta_punto en Python:
//  - dentro de un monte público del Catálogo de REDIAM: «Monte público (Junta)» o «Monte público municipal…»;
//  - fuera, por defecto «Probablemente privado…» (no sale de ningún dato). Cotos, vallas, cancelas y access=private
//    de OSM solo refuerzan ese aviso, nunca lo quitan; su ausencia no significa acceso libre;
//  - junto a una vía pecuaria o un sendero de uso público: «Paso público, no recoger fuera».
import type { Geometry } from 'geojson';
import { dentroDe } from './restricciones';

export type ClaseTitularidad = 'monte_junta' | 'monte_municipal' | 'privado';
export interface Titularidad {
  clase: ClaseTitularidad;
  /** Nombre del monte público (si lo es). */
  monte?: string;
  /** Señales que refuerzan el aviso de finca privada: 'coto', 'senal_privado'. */
  refuerzos?: string[];
  /** Junto a una vía pecuaria o un sendero de uso público. */
  paso?: boolean;
  /** Nombre del coto o de la vía, si hay. */
  coto?: string;
  via?: string;
}

export const TEXTO_TITULARIDAD: Record<ClaseTitularidad | 'paso_publico', string> = {
  monte_junta: 'Monte público (Junta)',
  monte_municipal: 'Monte público municipal: consulta al ayuntamiento',
  privado: 'Probablemente privado: necesitas permiso del dueño para recoger',
  paso_publico: 'Paso público, no recoger fuera',
};
export const TEXTO_REFUERZO: Record<string, string> = {
  coto: 'Está dentro de un coto de caza',
  senal_privado: 'Hay una valla, cancela o paso privado cerca (OpenStreetMap)',
};
/** Norma citada en los avisos (legal-acceso.md §1.1). */
export const NORMA_TITULARIDAD = 'Ley 43/2003 de Montes, art. 36: los frutos espontáneos de un monte son de su dueño. '
  + 'Resolución de 23-09-2026 (BOJA 196), punto 8: en terrenos particulares hace falta la autorización del propietario para recoger setas.';
export const AVISO_TITULARIDAD = 'No hay datos abiertos fiables de vallas ni de quién es dueño de cada finca. '
  + 'Fuera de los montes públicos marcados, asume que es privado y pide permiso.';

export const esPublico = (t: Pick<Titularidad, 'clase'> | null | undefined) => t?.clase === 'monte_junta' || t?.clase === 'monte_municipal';

/** Clases (y nombres) de los polígonos de la capa que contienen el punto → etiqueta. */
export function etiquetaTitularidad(fs: { properties: Record<string, unknown>; geometry: Geometry }[], lat: number, lon: number): Titularidad {
  const dentro = fs.filter((f) => dentroDe(f.geometry, lat, lon));
  const de = (c: string) => dentro.find((f) => f.properties.clase === c);
  const nombre = (f: { properties: Record<string, unknown> } | undefined) => (f?.properties.nombre ? String(f.properties.nombre) : undefined);
  const junta = de('monte_junta'), muni = de('monte_municipal');
  const base: Titularidad = junta ? { clase: 'monte_junta', monte: nombre(junta) }
    : muni ? { clase: 'monte_municipal', monte: nombre(muni) } : { clase: 'privado' };
  if (base.clase === 'privado') {
    const refuerzos = ['coto', 'senal_privado'].filter((c) => de(c));
    if (refuerzos.length) base.refuerzos = refuerzos;
    if (de('coto')) base.coto = nombre(de('coto'));
  }
  const paso = de('paso_publico');
  if (paso) { base.paso = true; base.via = nombre(paso); }
  return base;
}

/** Texto principal de la etiqueta («Monte público (Junta) · El Meliche»). */
export function textoTitularidad(t: Titularidad): string {
  return [TEXTO_TITULARIDAD[t.clase], t.monte].filter(Boolean).join(' · ');
}

/** Líneas secundarias: refuerzos y paso público. */
export function detallesTitularidad(t: Titularidad): string[] {
  const l: string[] = [];
  for (const r of t.refuerzos ?? []) l.push(r === 'coto' && t.coto ? `${TEXTO_REFUERZO.coto} («${t.coto}»)` : TEXTO_REFUERZO[r] ?? r);
  if (t.paso) l.push(`${t.via ? `${t.via}: ` : ''}${t.via ? 'paso público, no recoger fuera' : TEXTO_TITULARIDAD.paso_publico}`);
  return l;
}
