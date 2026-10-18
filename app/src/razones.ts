// «Por qué este sitio»: 1–2 frases deterministas con los factores reales del ranking (ranking.ts). Puro, sin DOM
// (razones.test.ts). Solo usa lo que el modelo sabe del sitio: puntuación del día, hábitat (punt_media), tamaño de la
// mancha, estado y motivo del semáforo (lluvia/temperatura/temporada), fiabilidad del mapa y citas cercanas.
// Nunca habla de comestibilidad ni de recoger. Lo que no está en los datos no se menciona.
import { FACTOR_FIABILIDAD, type Entrada } from './ranking';
import type { Fiabilidad } from './fiabilidad';
import { NOMBRE_ESTADO } from './zona';

export interface ContextoRazon {
  fiabilidad: Fiabilidad;
  /** Motivo real del semáforo ese día (semaforo.ts), si se tiene. */
  motivo?: string | null;
}

const fmt = (n: number, d = 0) => n.toLocaleString('es-ES', { maximumFractionDigits: d });

function textoHabitat(p: number): string {
  if (p >= 70) return `hábitat muy favorable según el modelo (${fmt(p)}/100)`;
  if (p >= 50) return `hábitat favorable según el modelo (${fmt(p)}/100)`;
  return `hábitat moderado según el modelo (${fmt(p)}/100)`;
}

const TIEMPO: Record<Entrada['estado'], string> = {
  verde: 'el tiempo reciente y la temporada le acompañan ese día',
  amarillo: 'el tiempo reciente aún no basta del todo ese día',
  rojo: 'el tiempo o la temporada no acompañan ese día',
  gris: 'no hay datos del tiempo fiables para ese día',
};

// Cubierta de copas (sitios.json v3). Umbrales de la palabra (sobre la cubierta efectiva: satélite si hay, si no MFE):
//   < 10 % «muy abierto» · 10–40 % «claro» · 40–70 % «de densidad media» · ≥ 70 % «denso».
// Discrepancia: se dice si el satélite ve ≥ 15 puntos menos que el Mapa Forestal (MFE antiguo, recintos grandes),
// y si alrededor del punto marcado ve ≥ 15 puntos menos que en el conjunto de la mancha.
const MASA: Record<string, string> = {
  alcornoque: 'alcornocal', encina: 'encinar', quejigo: 'quejigar', castano: 'castañar', pino: 'pinar',
  pinsapo: 'pinsapar', sabina: 'sabinar', otro: 'arbolado',
};
export const UMBRAL_DISCREPANCIA = 15;
export function densidad(c: number): string {
  if (c < 10) return 'muy abierto';
  if (c < 40) return 'claro';
  if (c < 70) return 'de densidad media';
  return 'denso';
}
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Frase de árbol y cubierta («Alcornocal claro, 25 % de copas.»), o '' si sitios.json no trae los campos. */
export function textoCubierta(s: Entrada['sitio']): string {
  const sat = num(s.cubierta_sat) ? s.cubierta_sat : null;
  const mfe = num(s.fcc_mfe) ? s.fcc_mfe : null;
  const c = sat ?? mfe;
  if (!s.arbol && c === null) return '';
  if (s.arbol === 'sin_arbolado' && c === null) return 'Sin arbolado en el mapa forestal.';
  const masa = s.arbol && s.arbol !== 'sin_arbolado' ? MASA[s.arbol] ?? 'arbolado' : 'arbolado';
  let f = c === null ? masa : `${masa} ${densidad(c)}, ${fmt(c)} % de copas`;
  if (sat !== null && mfe !== null && mfe - sat >= UMBRAL_DISCREPANCIA) f += ` (el mapa forestal dice ${fmt(mfe)} %, el satélite 2021 ve ${fmt(sat)} %)`;
  if (num(s.factor_cubierta) && s.factor_cubierta < 0.9) f += ', lo que baja la puntuación';
  f = f.charAt(0).toUpperCase() + f.slice(1) + '.';
  const pto = num(s.cubierta_sat_punto) ? s.cubierta_sat_punto : null;
  if (sat !== null && pto !== null && sat - pto >= UMBRAL_DISCREPANCIA)
    f += ` Alrededor del punto marcado el satélite solo ve ${fmt(pto)} %: busca la parte más arbolada de la mancha.`;
  return f;
}

/** Razón breve de por qué un sitio sale en el Top (1–3 frases). */
export function razonSitio(e: Entrada, c: ContextoRazon): string {
  const s = e.sitio;
  // Factores dominantes del sitio: el hábitat siempre; luego las citas cercanas si las hay, y si no, el tamaño de la mancha.
  const top = [textoHabitat(s.punt_media)];
  const ha = s.area_mancha_ha ?? s.area_ha;
  if (s.citas) top.push(`${s.citas.n} ${s.citas.n === 1 ? 'cita publicada' : 'citas publicadas'} de la especie ${s.citas.nivel === 'punto' ? 'en el mismo punto' : 'en el paraje'}`);
  else if (Number.isFinite(ha) && ha > 0) top.push(`una mancha de ${fmt(ha, ha < 10 ? 1 : 0)} ha`);
  // El peso del tiempo y de la fiabilidad va siempre en la segunda frase: es lo que cambia de un día a otro.
  const tiempo = c.motivo?.trim() ? `${NOMBRE_ESTADO[e.estado]}: ${c.motivo.trim().replace(/\.$/, '')}` : `${NOMBRE_ESTADO[e.estado]}: ${TIEMPO[e.estado]}`;
  const fiab = FACTOR_FIABILIDAD[c.fiabilidad] < 1 ? ` Mapa de fiabilidad ${c.fiabilidad === 'sin_validar' ? 'sin validar' : c.fiabilidad}.` : '';
  const primera = `Puntuación ${e.puntuacion}/100 por ${top.join(' y ')}.`;
  const cob = textoCubierta(s);
  return `${primera}${cob ? ` ${cob}` : ''} ${tiempo}.${fiab}`;
}
