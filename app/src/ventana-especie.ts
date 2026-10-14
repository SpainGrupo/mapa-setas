// «Cuándo está activa» de cada seta (ficha de la Guía) y orden del selector de especie del mapa. Puro
// (ventana-especie.test.ts): el DOM vive en ventana-ui.ts y selector-especie.ts.
//
// Punto de referencia del tiempo (una sola serie por seta, para que la tira de días sea legible):
//  1. GPS: el punto meteo más cercano a la última posición, si está a ≤ maxKm (si no, el usuario está fuera de la zona).
//  2. Si no hay GPS: el punto meteo del mejor sitio candidato de esa seta en sitios.json (el de más calidad del monte).
//  3. Si la seta no tiene sitios: el punto meteo más cercano a la mediana (lat, lon) de todos los puntos de la zona.
import type { Dia, PuntoMeteo } from './meteo';
import { ddmm, diasEntre, semaforo, sumarDias, type Estado, type Reglas, type ResultadoSemaforo } from './semaforo';
import { confianza, DIAS_MAX, diasHastaTemporada, finTemporada, type Confianza } from './calendario';
import { calidad, distanciaM, type SitioCandidato } from './ranking';
import { puntoMasCercano } from './zona';
import type { Fiabilidad } from './fiabilidad';

export const DIAS_VENTANA = DIAS_MAX + 1;   // hoy … +15
export const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre',
  'noviembre', 'diciembre'];

// ---------------------------------------------------------------- punto de referencia

export type OrigenRef = 'gps' | 'sitio' | 'zona';
export interface PuntoRef { id: number; origen: OrigenRef }

export function puntoReferencia(puntos: PuntoMeteo[], o: { gps?: { lat: number; lon: number } | null; sitios?: SitioCandidato[] | null; maxKm?: number } = {}): PuntoRef | null {
  if (!puntos.length) return null;
  if (o.gps) {
    const p = puntoMasCercano(puntos, o.gps.lat, o.gps.lon);
    if (p && distanciaM(p, o.gps) / 1000 <= (o.maxKm ?? 12)) return { id: p.id, origen: 'gps' };
  }
  if (o.sitios?.length) {
    const mejor = o.sitios.reduce((a, b) => (calidad(b) > calidad(a) ? b : a));
    if (puntos.some((p) => p.id === mejor.meteo_id)) return { id: mejor.meteo_id, origen: 'sitio' };
  }
  const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const p = puntoMasCercano(puntos, med(puntos.map((x) => x.lat)), med(puntos.map((x) => x.lon)));
  return p ? { id: p.id, origen: 'zona' } : null;
}

export const TEXTO_ORIGEN: Record<OrigenRef, string> = {
  gps: 'Con el tiempo de donde estás.',
  sitio: 'Con el tiempo de su mejor sitio en el mapa.',
  zona: 'Con el tiempo del centro de la zona.',
};

// ---------------------------------------------------------------- días

export interface DiaVentana {
  fecha: string;
  estado: Estado;
  activo: boolean;
  motivo: string;
  confianza: Confianza;
  /** Día en que abrió (o abre) la ventana de la lluvia que manda. */
  abre?: string;
  /** Fin de esa ventana según el semáforo. */
  hasta?: string;
  /** Amarillo «esperar»: día en que suele abrir. */
  desde?: string;
}

/** Un día cuenta como activo si está en verde, o en amarillo con la ventana ya abierta (no «esperar»). */
export const esActivo = (r: ResultadoSemaforo, fecha: string) =>
  r.estado === 'verde' || (r.estado === 'amarillo' && !(r.desde && r.desde > fecha));

/** Semáforo de hoy … +15 con la serie de un punto (vacío sin serie). */
export function diasEspecie(serie: Dia[] | null | undefined, reglas: Reglas, hoy: string, edadHoras = 0): DiaVentana[] {
  if (!serie?.length) return [];
  return Array.from({ length: DIAS_VENTANA }, (_, i) => {
    const fecha = sumarDias(hoy, i);
    const r = semaforo(serie, reglas, fecha, { edadHoras });
    const d: DiaVentana = { fecha, estado: r.estado, activo: esActivo(r, fecha), motivo: r.motivo, confianza: confianza(hoy, fecha) };
    if (r.episodio) d.abre = sumarDias(r.episodio, reglas.ventana_dias[0]);
    if (r.hasta) d.hasta = r.hasta;
    if (r.desde) d.desde = r.desde;
    return d;
  });
}

// ---------------------------------------------------------------- estimación de una línea

export type TipoVentana = 'activa' | 'pronto' | 'fuera' | 'espera' | 'sin_datos';
export interface Ventana { tipo: TipoVentana; texto: string; desde?: string; hasta?: string; confianza?: Confianza }

/**
 * Una línea con lo que se espera:
 *  - activa hoy → «Activa desde ~X hasta ~Y» (X: cuando abrió la ventana; Y: último día activo seguido, o el fin de
 *    la ventana si sigue activa al final de la previsión, sin pasar del fin de temporada). Confianza según Y.
 *  - activa más adelante, o en «esperar» con la apertura pasada la previsión → «Se espera a partir de ~X». Confianza según X.
 *  - nada a la vista y fuera de temporada → «Fuera de temporada hasta ~mes» (sin confianza: es el calendario).
 *  - nada a la vista en temporada → «En temporada, pero …»; sin tiempo → «Sin datos de tiempo».
 */
export function ventanaEspecie(dias: DiaVentana[], meses: number[], hoy: string): Ventana {
  const i0 = dias.findIndex((d) => d.activo);
  if (i0 === 0) {
    let j = 0;
    while (j + 1 < dias.length && dias[j + 1].activo) j++;
    let hasta = dias[j].fecha;
    if (j === dias.length - 1 && dias[j].hasta && dias[j].hasta! > hasta) {
      const fin = finTemporada(hoy, meses);
      const tope = fin && fin < dias[j].hasta! ? fin : dias[j].hasta!;
      if (tope > hasta) hasta = tope;
    }
    const desde = dias[0].abre && dias[0].abre < hoy ? dias[0].abre : hoy;
    const c = confianza(hoy, hasta);
    return { tipo: 'activa', desde, hasta, confianza: c,
      texto: `Activa desde ${desde === hoy ? 'hoy' : `~${ddmm(desde)}`} hasta ~${ddmm(hasta)}` };
  }
  if (i0 > 0) {
    const desde = dias[i0].fecha;
    return { tipo: 'pronto', desde, confianza: confianza(hoy, desde), texto: `Se espera a partir de ~${ddmm(desde)}` };
  }
  const ultimo = dias.at(-1)?.fecha ?? hoy;
  const espera = dias.find((d) => d.estado === 'amarillo' && d.desde && d.desde > ultimo);
  if (espera) return { tipo: 'pronto', desde: espera.desde, confianza: 'baja', texto: `Se espera a partir de ~${ddmm(espera.desde!)}` };
  const faltan = diasHastaTemporada(hoy, meses);
  if (faltan != null) {
    const inicio = sumarDias(hoy, faltan);
    return { tipo: 'fuera', desde: inicio, texto: `Fuera de temporada hasta ~${MESES_LARGOS[+inicio.slice(5, 7) - 1]}` };
  }
  if (!dias.some((d) => d.estado !== 'gris')) return { tipo: 'sin_datos', texto: 'Sin datos de tiempo' };
  const fin = finTemporada(hoy, meses);
  if (fin && diasEntre(hoy, fin) < DIAS_VENTANA) return { tipo: 'espera', texto: 'Acaba la temporada sin lluvia suficiente a la vista' };
  return { tipo: 'espera', texto: `En temporada, pero no se ve lluvia suficiente en los próximos ${DIAS_VENTANA} días` };
}

// ---------------------------------------------------------------- selector de especie del mapa

export interface OpcionSelector { id: string; fiabilidad: Fiabilidad; resultado: ResultadoSemaforo | null; meses: number[] }
export type EtiquetaInactiva = 'seco' | 'sin datos' | 'fuera de temporada';
export interface Inactiva<T> { item: T; etiqueta: EtiquetaInactiva }

const RANGO_FIAB: Record<Fiabilidad, number> = { buena: 0, media: 1, sin_validar: 2, baja: 3 };
const RANGO_ETIQUETA: Record<EtiquetaInactiva, number> = { seco: 0, 'sin datos': 1, 'fuera de temporada': 2 };

/** Por qué una especie no está activa hoy (null si lo está: verde o amarillo). */
export function etiquetaInactiva(o: OpcionSelector, hoy: string): EtiquetaInactiva | null {
  const e = o.resultado?.estado;
  if (e === 'verde' || e === 'amarillo') return null;
  if (/^fuera de temporada/.test(o.resultado?.motivo ?? '') || (o.meses.length && !o.meses.includes(+hoy.slice(5, 7)))) return 'fuera de temporada';
  return e === 'rojo' ? 'seco' : 'sin datos';
}

/**
 * Orden del selector: arriba las activas hoy (verde y luego amarillo; dentro, mejor fiabilidad), abajo las demás
 * (seco, sin datos, fuera de temporada; dentro, fiabilidad). Empates: el orden del manifest. Sin ningún resultado
 * del tiempo (todavía no hay datos) no se separa nada: todas en «activas», en el orden del manifest.
 */
export function ordenarSelector<T extends OpcionSelector>(xs: T[], hoy: string): { activas: T[]; inactivas: Inactiva<T>[] } {
  if (!xs.some((x) => x.resultado)) return { activas: [...xs], inactivas: [] };
  const idx = new Map(xs.map((x, i) => [x, i]));
  const activas: T[] = [], inactivas: Inactiva<T>[] = [];
  for (const x of xs) {
    const et = etiquetaInactiva(x, hoy);
    if (et) inactivas.push({ item: x, etiqueta: et }); else activas.push(x);
  }
  const rEst = (x: T) => (x.resultado?.estado === 'verde' ? 0 : 1);
  activas.sort((a, b) => rEst(a) - rEst(b) || RANGO_FIAB[a.fiabilidad] - RANGO_FIAB[b.fiabilidad] || idx.get(a)! - idx.get(b)!);
  inactivas.sort((a, b) => RANGO_ETIQUETA[a.etiqueta] - RANGO_ETIQUETA[b.etiqueta]
    || RANGO_FIAB[a.item.fiabilidad] - RANGO_FIAB[b.item.fiabilidad] || idx.get(a.item)! - idx.get(b.item)!);
  return { activas, inactivas };
}
