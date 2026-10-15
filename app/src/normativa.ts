// Normativa de recogida por comunidad autónoma (spec §3.6, §4.4): qué entradas de legal.ccaa enseñar para un punto.
// La CCAA del punto sale de ccaa.pmtiles (capa 'ccaa', propiedades id y nombre; consulta en mapa.ts, ccaaEn). Sin DOM.
import type { Geometry } from 'geojson';
import { dentroDe, orientativo } from './restricciones';
import { idCcaa, type EntradaLegal, type IdCcaa } from './manifest-region';

export const PENDIENTE = 'Pendiente de verificar';

/** Ids canónicos de las CCAA cuyos polígonos contienen el punto (acepta los códigos cortos del pipeline). */
export function ccaaEnPunto(fs: { properties: Record<string, unknown>; geometry: Geometry }[], lat: number, lon: number): IdCcaa[] {
  const ids: IdCcaa[] = [];
  for (const f of fs) {
    const id = idCcaa(f.properties.id);
    if (id && !ids.includes(id) && dentroDe(f.geometry, lat, lon)) ids.push(id);
  }
  return ids;
}

export interface VistaNormativa { ambito: 'punto' | 'todas'; entradas: EntradaLegal[]; nota: string }

/** Con un punto dentro de alguna CCAA de la región, solo esas; si no (sin punto, fuera o sin capa), todas. */
export function vistaNormativa(legal: EntradaLegal[], idsPunto: string[] | null, normasLegado: string[]): VistaNormativa {
  const delPunto = idsPunto?.length ? legal.filter((e) => idsPunto.includes(e.id)) : [];
  const entradas = delPunto.length ? delPunto : legal;
  return { ambito: delPunto.length ? 'punto' : 'todas', entradas,
    nota: orientativo(legal.length ? entradas.map((e) => e.sigla) : normasLegado) };
}

export const textoCupo = (kg: number) => `Cupo: hasta ${kg.toLocaleString('es-ES')} kg por persona y día.`;
