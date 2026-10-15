// Campos multi-región del manifest (región, normativa por CCAA, atribuciones, avisos, especies sin hábitat) ya
// validados, con los textos de legado de Marbella para lo que el manifest no trae. Sin DOM.
// Forma real del pipeline (exportar.py, fase A): region.origen = [lon, lat]; legal.ccaa[].id corto ('AND') y
// legal.ccaa[].norma con la cita completa ('Resolución …, BOJA 196 …'); de ahí se saca la sigla del boletín.
import type { Especie, Manifest } from './tipos';

export type IdCcaa = 'andalucia' | 'comunitat_valenciana' | 'region_murcia' | 'castilla_la_mancha';
export const IDS_CCAA: readonly IdCcaa[] = ['andalucia', 'comunitat_valenciana', 'region_murcia', 'castilla_la_mancha'];
/** Códigos cortos del pipeline (pipeline/regiones/<id>.yaml legal.ccaa[].id y ccaa.pmtiles) → id canónico. */
const ALIAS_CCAA: Record<string, IdCcaa> = { AND: 'andalucia', CV: 'comunitat_valenciana', MUR: 'region_murcia', CLM: 'castilla_la_mancha' };
export function idCcaa(v: unknown): IdCcaa | null {
  if (typeof v !== 'string') return null;
  if ((IDS_CCAA as readonly string[]).includes(v)) return v as IdCcaa;
  return Object.prototype.hasOwnProperty.call(ALIAS_CCAA, v) ? ALIAS_CCAA[v] : null;
}

export interface RegionManifest { id: string; nombre: string; origen: { lat: number; lon: number }; etiqueta_origen: string }
export interface EntradaLegal {
  id: IdCcaa; nombre: string; norma: string;
  /** Sigla del boletín ('BOJA', 'DOGV'…) para la nota orientativa y el enlace; '' si no se reconoce. */
  sigla: string;
  cupo_kg_dia: number | null; texto: string; verificado: boolean; fuente_url: string;
}
export interface Atribuciones { mapa: string; fuentes: Record<string, string> }
export interface ManifestApp extends Manifest {
  region: RegionManifest;
  legal: EntradaLegal[];
  texto_protegido: string;
  chip_sitio_restringido: string;
  atribuciones: Atribuciones;
  /** Normas de la nota «orientativa» cuando el manifest no trae `legal` (solo el legado de Marbella: BOJA). */
  normas_legado: string[];
  avisos: string[];
  /** Especies de la región sin hábitat: fuera de `especies` (que ya solo trae las activas). */
  especies_sin_habitat: Especie[];
}

const TEXTO_PROTEGIDO = 'Consulta la normativa de recolección del espacio.';
const CHIP_RESTRINGIDO = 'Recoger aquí exige autorización';
const OSM = { osm: 'OpenStreetMap' };

/** Lo que estaba fijo en el código para Marbella y su manifest todavía no trae (atribuciones, normas sin `legal`). */
export const LEGADO_MARBELLA = {
  region: { id: 'marbella', nombre: 'Marbella', origen: { lat: 36.5101, lon: -4.8825 }, etiqueta_origen: 'de Marbella' } as RegionManifest,
  atribuciones: { mapa: 'IGN CC BY 4.0, © MITECO MFE, IGME, REDIAM CC BY 4.0, © OpenStreetMap ODbL, Protomaps',
    fuentes: { rediam: 'REDIAM (Junta de Andalucía)', ...OSM } } as Atribuciones,
  texto_protegido: TEXTO_PROTEGIDO,
  chip_sitio_restringido: CHIP_RESTRINGIDO,
  normas: ['BOJA'],
};

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);
const txt = (v: unknown, def = '') => (typeof v === 'string' ? v.trim() : def);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** {lat, lon} o [lon, lat] (forma del pipeline) → {lat, lon}; null si no vale. */
export function punto(v: unknown): { lat: number; lon: number } | null {
  if (Array.isArray(v)) {
    const lon = num(v[0]), lat = num(v[1]);
    return v.length === 2 && lat !== null && lon !== null ? { lat, lon } : null;
  }
  const o = obj(v), lat = num(o?.lat), lon = num(o?.lon);
  return lat !== null && lon !== null ? { lat, lon } : null;
}

const BOLETINES = /\b(BOJA|DOGV|BORM|DOCM|BOE)\b/;
/** Sigla del boletín citado en la norma; una norma corta sin boletín conocido se toma tal cual. */
export function siglaNorma(norma: string): string {
  const m = BOLETINES.exec(norma);
  if (m) return m[1];
  return norma.length <= 12 ? norma : '';
}

function region(v: unknown, id: string, bbox: Manifest['bbox']): RegionManifest {
  const r = obj(v);
  if (r) {
    if (r.id !== id) throw new Error(`La región del manifest (${String(r.id)}) no coincide con la pedida (${id})`);
    const o = punto(r.origen);
    if (o) return { id, nombre: txt(r.nombre, id) || id, origen: o, etiqueta_origen: txt(r.etiqueta_origen) };
  }
  if (id === 'marbella') return { ...LEGADO_MARBELLA.region };
  return { id, nombre: id, origen: { lat: (bbox[1] + bbox[3]) / 2, lon: (bbox[0] + bbox[2]) / 2 }, etiqueta_origen: 'del centro de la zona' };
}

function entradaLegal(v: unknown): EntradaLegal | null {
  const e = obj(v);
  const id = idCcaa(e?.id);
  if (!e || !id || !txt(e.texto)) return null;
  const verificado = e.verificado === true;
  const url = txt(e.fuente_url);
  const norma = txt(e.norma);
  return { id, nombre: txt(e.nombre, id) || id, norma, sigla: siglaNorma(norma), texto: txt(e.texto), verificado,
    // Spec §1.5: un cupo sin cotejar no se enseña nunca.
    cupo_kg_dia: verificado ? num(e.cupo_kg_dia) : null,
    fuente_url: /^https:\/\//.test(url) ? url : '' };
}

export function prepararManifest(m: Manifest, idRegion: string): ManifestApp {
  const legadoMarbella = idRegion === 'marbella';
  const legal = obj(m.legal);
  const atr = obj(m.atribuciones);
  const fuentesAtr = obj(atr?.fuentes) ?? {};
  const fuentes: Record<string, string> = atr ? { ...OSM } : legadoMarbella ? { ...LEGADO_MARBELLA.atribuciones.fuentes } : { ...OSM };
  for (const [k, v] of Object.entries(fuentesAtr)) if (typeof v === 'string') fuentes[k] = v;
  const entradas = Array.isArray(legal?.ccaa) ? legal.ccaa.map(entradaLegal).filter((e): e is EntradaLegal => !!e) : [];
  return {
    ...m,
    especies: m.especies.filter((e) => !e.sin_habitat),
    especies_sin_habitat: m.especies.filter((e) => e.sin_habitat),
    region: region(m.region, idRegion, m.bbox),
    legal: entradas,
    texto_protegido: txt(legal?.texto_protegido) || TEXTO_PROTEGIDO,
    chip_sitio_restringido: txt(legal?.chip_sitio_restringido) || CHIP_RESTRINGIDO,
    atribuciones: { mapa: atr ? txt(atr.mapa) : legadoMarbella ? LEGADO_MARBELLA.atribuciones.mapa : '', fuentes },
    normas_legado: !entradas.length && legadoMarbella ? [...LEGADO_MARBELLA.normas] : [],
    avisos: Array.isArray(m.avisos) ? m.avisos.filter((a): a is string => typeof a === 'string' && a.trim() !== '') : [],
    ccaa: typeof m.ccaa === 'string' && m.ccaa ? m.ccaa : null,
  };
}

/** Nombre legible del valor `fuente` de una entidad (rutas.pmtiles). */
export function nombreFuente(f: string, fuentes: Record<string, string>): string {
  return Object.prototype.hasOwnProperty.call(fuentes, f) ? fuentes[f] : (f === 'osm' ? 'OpenStreetMap' : f || '—');
}
