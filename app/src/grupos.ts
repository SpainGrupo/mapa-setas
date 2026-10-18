// Taxonomía de grupos de setas (única fuente; la usan Hoy y el selector del mapa). Agrupa las especies del mapa
// (ids de especies.yaml / manifest) en grupos «de cesta»: elegir un grupo en Hoy combina el top de todas sus especies.
// Por región solo aparecen los grupos con alguna especie en el manifest de esa región (ver gruposDe()).
// Lista completa de especies y nombres comunes: knowledge/reference/especies-y-grupos.md.
import { fusionar, puntuar, type FilaGeneral, type Opciones, type SitiosJson, type Entrada } from './ranking';

export interface Grupo {
  id: string;
  nombre: string;
  /** Ids exactos de especie del mapa. */
  especies: readonly string[];
  /** Prefijos de id (género) que también caen en el grupo: variantes regionales (terfezia_claveryi, suillus_*, …). */
  prefijos?: readonly string[];
}

/** Orden = orden de presentación. Un id de especie cae en el primer grupo que lo reclame. */
export const GRUPOS: readonly Grupo[] = [
  { id: 'boletus', nombre: 'Boletus', especies: ['boletus_aereus', 'boletus_aestivalis', 'boletus_edulis', 'boletus_pinophilus'], prefijos: ['boletus_'] },
  // Solo las del mapa: las Amanita tóxicas de la guía nunca se modelan ni entran aquí.
  { id: 'amanita', nombre: 'Amanitas (oronja y gurumelo)', especies: ['amanita_caesarea', 'amanita_ponderosa'] },
  { id: 'niscalos', nombre: 'Níscalos', especies: ['lactarius_deliciosus', 'lactarius_sanguifluus'] },
  { id: 'rebozuelos', nombre: 'Rebozuelos', especies: ['cantharellus_cibarius'], prefijos: ['cantharellus_', 'craterellus_'] },
  { id: 'babosillos', nombre: 'Babosillos (Suillus)', especies: ['suillus_collinitus'], prefijos: ['suillus_'] },
  { id: 'trufas', nombre: 'Criadillas y trufas', especies: ['terfezia_arenaria', 'terfezia_claveryi'], prefijos: ['terfezia_', 'tuber_'] },
  { id: 'parasoles', nombre: 'Parasoles', especies: ['macrolepiota_procera'], prefijos: ['macrolepiota_'] },
  { id: 'cardo', nombre: 'Setas de cardo', especies: ['pleurotus_eryngii'] },
  { id: 'hydnum', nombre: 'Lenguas de gato (Hydnum)', especies: ['hydnum_repandum'], prefijos: ['hydnum_'] },
  { id: 'llenegas', nombre: 'Llenegas (Hygrophorus)', especies: ['hygrophorus_latitabundus'] },
  { id: 'pie_azul', nombre: 'Pie azul', especies: ['lepista_nuda'] },
  { id: 'champinones', nombre: 'Champiñones', especies: ['agaricus_campestris'] },
  { id: 'colmenillas', nombre: 'Colmenillas', especies: ['morchella_spp'], prefijos: ['morchella_'] },
  { id: 'rusulas', nombre: 'Rúsulas (carbonera)', especies: ['russula_cyanoxantha'] },
  // Sin prefijo tricholoma_: T. terreum, T. pardinum y T. equestre son fichas tóxicas, nunca capa.
  { id: 'tricholoma', nombre: 'Capuchinas (Tricholoma)', especies: ['tricholoma_portentosum'] },
];

export const OTRAS: Grupo = { id: 'otras', nombre: 'Otras', especies: [] };

/** Valor de un grupo en los <select>: «grupo:boletus». */
export const PREFIJO_VALOR = 'grupo:';
export const valorGrupo = (g: string) => PREFIJO_VALOR + g;
export const esValorGrupo = (v: string) => v.startsWith(PREFIJO_VALOR);

/** Grupo de una especie del mapa (OTRAS si ninguno la reclama). */
export function grupoDe(especie: string): Grupo {
  return GRUPOS.find((g) => g.especies.includes(especie)) ?? GRUPOS.find((g) => g.prefijos?.some((p) => especie.startsWith(p))) ?? OTRAS;
}

export interface GrupoRegion { grupo: Grupo; especies: string[] }

/** Grupos con especies de la región, en el orden de GRUPOS; dentro, las especies en el orden recibido (el del manifest). */
export function gruposDe(ids: readonly string[]): GrupoRegion[] {
  const por = new Map<string, string[]>();
  for (const id of ids) { const g = grupoDe(id).id; if (!por.has(g)) por.set(g, []); por.get(g)!.push(id); }
  return [...GRUPOS, OTRAS].filter((g) => por.has(g.id)).map((g) => ({ grupo: g, especies: por.get(g.id)! }));
}

/** Especies que filtra un valor del selector: las del grupo («grupo:x») o la especie sola. */
export function especiesDeValor(valor: string, ids: readonly string[]): string[] {
  if (!esValorGrupo(valor)) return ids.includes(valor) ? [valor] : [];
  const g = valor.slice(PREFIJO_VALOR.length);
  return gruposDe(ids).find((x) => x.grupo.id === g)?.especies ?? [];
}

const porScore = (a: Entrada, b: Entrada) => b.score - a.score || a.sitio.id - b.sitio.id;

/**
 * Top combinado de un grupo: los sitios de todas sus especies (rojo incluido, como topEspecie), ordenados y
 * fusionados a 300 m como el top general (una fila por sitio, con varias setas si comparten punto), hasta `n` filas.
 */
export function topGrupo(datos: SitiosJson, especies: readonly string[], op: Opciones, n = 10): FilaGeneral[] {
  const o: Opciones = { ...op, factorCitas: op.factorCitas ?? datos.factor_citas === true };
  const todas: Entrada[] = [];
  for (const id of especies) for (const s of datos.especies[id] ?? []) { const e = puntuar(id, s, o); if (e) todas.push(e); }
  return fusionar(todas.sort(porScore)).slice(0, n);
}
