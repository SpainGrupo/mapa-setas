// Guía de especies: tipos, búsqueda sin acentos, agrupación y textos de seguridad (sin DOM).

export type Grupo = 'apreciada' | 'comestible_menor' | 'toxica' | 'mortal';

export interface Foto { archivo: string; autor: string; licencia: string; url_fuente: string; descripcion?: string }
export interface Confusion { id: string; diferencias: string[] }
export interface Ficha {
  id: string;
  nombre_cientifico: string;
  nombres_comunes: string[];
  grupo: Grupo;
  toxicidad_nota: string;
  sombrero: string; himenio: string; pie: string; volva: string; anillo: string;
  carne_y_corte: string; olor_sabor: string; esporada: string; habitat: string; temporada: string;
  rasgos_clave: string[];
  no_confundir_con: Confusion[];
  fase_huevo?: string;
  fotos: Foto[];
  fuentes: { titulo: string; url: string }[];
}
/** indice.json (scripts/enlazar-guia.mjs): hash corto por foto y por miniatura (id de ficha → hash). */
export interface IndiceGuia { especies: string; fotos: Record<string, string>; miniaturas?: Record<string, string> }

/** Orden de los grupos en la lista: primero lo que se busca, después lo peligroso (mortales antes que tóxicas). */
export const ORDEN_GRUPOS: Grupo[] = ['apreciada', 'comestible_menor', 'mortal', 'toxica'];

/** Nunca «Comestible» a secas: la etiqueta de un grupo comestible no debe sonar a permiso para comer. */
export const ETIQUETA_GRUPO: Record<Grupo, string> = {
  apreciada: 'Apreciada', comestible_menor: 'Poco valor', toxica: 'Tóxica', mortal: '☠ MORTAL',
};
export const TITULO_GRUPO: Record<Grupo, string> = {
  apreciada: 'Muy apreciadas', comestible_menor: 'De poco valor', toxica: 'Tóxicas', mortal: 'Mortales',
};
export const COMESTIBLES: ReadonlySet<Grupo> = new Set(['apreciada', 'comestible_menor']);
export const AVISO_COMESTIBLE = 'Considerada comestible por la bibliografía. No la consumas sin la confirmación de un experto.';

/** Minúsculas, sin tildes ni diéresis, espacios colapsados. «Amanita de los Césares» → «amanita de los cesares». */
export function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s_]+/g, ' ').trim();
}

/** Nombre corto para mostrar: el primer nombre común con mayúscula inicial. */
export function nombreComun(f: Ficha): string {
  const n = f.nombres_comunes[0] ?? '';
  return n ? n[0].toLocaleUpperCase('es-ES') + n.slice(1) : '';
}

/** Nombre científico sin la autoría («Boletus edulis Bull.» → «Boletus edulis»). */
export function binomio(f: Ficha): string {
  return f.nombre_cientifico.split(/\s+/).slice(0, 2).join(' ');
}

/** ¿Encaja la ficha con la búsqueda? Cada palabra debe aparecer en algún nombre (común, científico o id). */
export function coincide(f: Ficha, consulta: string): boolean {
  const palabras = normalizar(consulta).split(' ').filter(Boolean);
  if (!palabras.length) return true;
  const pajar = normalizar([f.nombre_cientifico, f.id, ...f.nombres_comunes].join(' | '));
  return palabras.every((p) => pajar.includes(p));
}

export function filtrar(fichas: Ficha[], consulta: string, grupo: Grupo | '' = ''): Ficha[] {
  return fichas.filter((f) => (!grupo || f.grupo === grupo) && coincide(f, consulta));
}

/** Grupos en ORDEN_GRUPOS, sin los vacíos; dentro de cada grupo, por nombre científico. */
export function agrupar(fichas: Ficha[]): { grupo: Grupo; fichas: Ficha[] }[] {
  return ORDEN_GRUPOS.map((grupo) => ({
    grupo,
    fichas: fichas.filter((f) => f.grupo === grupo).sort((a, b) => a.nombre_cientifico.localeCompare(b.nombre_cientifico, 'es')),
  })).filter((g) => g.fichas.length > 0);
}

/** URL relativa (a la raíz de la app) de una foto, con su versión para la caché. */
export function urlFoto(archivo: string, indice: IndiceGuia | null): string {
  const v = indice?.fotos[archivo];
  return `guia/${archivo}${v ? `?v=${v}` : ''}`;
}

/**
 * Especies del mapa (manifest) cuya ficha tiene otro id. GBIF trata Boletus aestivalis como sinónimo de
 * B. reticulatus, y la guía la describe como «Boletus reticulatus (= B. aestivalis)».
 */
export const FICHA_DE_ESPECIE_MAPA: Record<string, string> = {
  boletus_aestivalis: 'boletus_reticulatus',
  lactarius_sanguifluus: 'lactarius_deliciosus',
};
/**
 * Especies del mapa sin ficha propia que la guía describe dentro de la ficha de otra especie (no son sinónimos):
 * el selector las muestra con su nombre científico y la foto de esa ficha. L. sanguifluus va en la del níscalo.
 */
export const DESCRITA_EN_OTRA_FICHA: ReadonlySet<string> = new Set(['lactarius_sanguifluus']);
export const fichaDeEspecieMapa = (id: string) => FICHA_DE_ESPECIE_MAPA[id] ?? id;
/** Al revés: id de especie del mapa para una ficha de la guía (si el mapa la tiene), o la propia ficha. */
export function especieMapaDeFicha(idFicha: string, idsMapa: string[]): string {
  if (idsMapa.includes(idFicha)) return idFicha;
  const delMapa = idsMapa.find((m) => fichaDeEspecieMapa(m) === idFicha);
  return delMapa ?? idFicha;
}

/**
 * Miniatura (128 px, generada en el build a partir de la primera foto de la ficha) de una especie del mapa,
 * con el alias de sinónimos de FICHA_DE_ESPECIE_MAPA; null si la especie no tiene ficha con foto.
 */
export function miniaturaEspecie(idMapa: string, indice: IndiceGuia | null): string | null {
  const ficha = fichaDeEspecieMapa(idMapa);
  const v = indice?.miniaturas?.[ficha];
  return v ? `guia/miniaturas/${ficha}.jpg?v=${v}` : null;
}
