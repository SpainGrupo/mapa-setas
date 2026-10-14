// Pestaña «Hoy» (fase 9): días elegibles, confianza de la proyección y calendario de especies. Puro (calendario.test.ts).
import type { Estado, ResultadoSemaforo } from './semaforo';
import { ddmm, diasEntre, sumarDias } from './semaforo';
import type { Fiabilidad } from './fiabilidad';

export const DIAS_MAX = 15;          // hoy … +15 (Open-Meteo da 16 días contando hoy)
export const DIAS_CHIPS = 7;
const SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «hoy», «mañana» o «sáb 18». */
export function etiquetaDia(hoy: string, fecha: string): string {
  const d = diasEntre(hoy, fecha);
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  return `${SEMANA[new Date(fecha + 'T12:00:00Z').getUTCDay()]} ${+fecha.slice(8, 10)}`;
}

/** Los días de los chips: hoy y los 6 siguientes. */
export const diasChips = (hoy: string) => Array.from({ length: DIAS_CHIPS }, (_, i) => sumarDias(hoy, i));

/** Fecha dentro de [hoy, hoy+15]; lo de fuera se lleva al borde. */
export function acotarDia(hoy: string, fecha: string | null | undefined): string {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return hoy;
  const d = diasEntre(hoy, fecha);
  return d < 0 ? hoy : d > DIAS_MAX ? sumarDias(hoy, DIAS_MAX) : fecha;
}

export type Confianza = 'alta' | 'media' | 'baja';
/** Confianza de la proyección según lo lejos que esté el día: 0–3 alta, 4–7 media, 8–15 baja. */
export function confianza(hoy: string, fecha: string): Confianza {
  const d = diasEntre(hoy, fecha);
  return d <= 3 ? 'alta' : d <= 7 ? 'media' : 'baja';
}
export const TEXTO_CONFIANZA: Record<Confianza, string> = {
  alta: 'Previsión fiable: faltan 3 días o menos.',
  media: 'Previsión con dudas: a 4–7 días la lluvia aún puede cambiar.',
  baja: 'Previsión poco fiable: a más de una semana, tómalo como tendencia.',
};

// ---------------------------------------------------------------- estado de cada especie en el calendario

export type ClaseCalendario = 'sale' | 'pronto' | 'temporada' | 'fuera';
export interface EstadoCalendario { clase: ClaseCalendario; texto: string; dias?: number; hasta?: string }

/** Último día de la racha de meses de temporada que contiene `fecha` (p. ej. 31/01 si sale de oct a ene). */
export function finTemporada(fecha: string, meses: number[]): string | null {
  if (!meses.length || !meses.includes(+fecha.slice(5, 7))) return null;
  let y = +fecha.slice(0, 4), m = +fecha.slice(5, 7);
  for (let i = 0; i < 12; i++) {
    const sm = (m % 12) + 1;
    if (!meses.includes(sm)) break;
    if (sm === 1) y++;
    m = sm;
  }
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
}

/** Días hasta el 1 del siguiente mes de temporada (null si no tiene meses o ya está en temporada). */
export function diasHastaTemporada(fecha: string, meses: number[]): number | null {
  if (!meses.length || meses.includes(+fecha.slice(5, 7))) return null;
  let y = +fecha.slice(0, 4), m = +fecha.slice(5, 7);
  for (let i = 0; i < 12; i++) {
    m = (m % 12) + 1;
    if (m === 1) y++;
    if (meses.includes(m)) return diasEntre(fecha, `${y}-${String(m).padStart(2, '0')}-01`);
  }
  return null;
}

/**
 * Estado del calendario de una especie el día D, a partir del semáforo de ese día (el mejor de sus sitios) y sus meses:
 *  - verde → «Ya sale», con «aguanta hasta ~fecha» = fin de la ventana del semáforo, sin pasar del fin de temporada.
 *  - amarillo con ventana por abrir (desde > D) → «Empieza en ~X días».
 *  - amarillo con la ventana abierta pero con pegas (temperatura, suelo) → «Puede salir, aguanta hasta ~fecha».
 *  - rojo/gris fuera de temporada → «Empieza en ~X días» contando hasta el 1 del primer mes de temporada.
 *  - rojo/gris en temporada → «En temporada, falta lluvia» (o «sin datos del tiempo» si es gris).
 */
export function estadoCalendario(fecha: string, meses: number[], r: ResultadoSemaforo | null): EstadoCalendario {
  const fin = finTemporada(fecha, meses);
  const tope = (h?: string) => (h && fin && h > fin ? fin : h ?? fin ?? undefined);
  if (r?.estado === 'verde') {
    const hasta = tope(r.hasta);
    return { clase: 'sale', texto: hasta ? `Ya sale · aguanta hasta ~${ddmm(hasta)}` : 'Ya sale', hasta };
  }
  if (r?.estado === 'amarillo' && r.desde && r.desde > fecha) {
    const dias = diasEntre(fecha, r.desde);
    return { clase: 'pronto', texto: `Empieza en ~${dias} ${dias === 1 ? 'día' : 'días'}`, dias };
  }
  if (r?.estado === 'amarillo') {
    const hasta = tope(r.hasta);
    return { clase: 'sale', texto: hasta ? `Puede salir · aguanta hasta ~${ddmm(hasta)}` : 'Puede salir', hasta };
  }
  const dias = diasHastaTemporada(fecha, meses);
  if (dias != null) return { clase: 'fuera', texto: `Empieza en ~${dias} días (temporada)`, dias };
  if (!meses.length) return { clase: 'temporada', texto: r?.estado === 'rojo' ? 'Falta lluvia' : 'Sin datos del tiempo' };
  return { clase: 'temporada', texto: r?.estado === 'rojo' ? 'En temporada, falta lluvia' : 'En temporada, sin datos del tiempo' };
}

/** El mejor estado de una lista de resultados (verde > amarillo > gris > rojo). */
const RANGO_ESTADO: Record<Estado, number> = { verde: 0, amarillo: 1, gris: 2, rojo: 3 };
export function mejorResultado(rs: (ResultadoSemaforo | null)[]): ResultadoSemaforo | null {
  let m: ResultadoSemaforo | null = null;
  for (const r of rs) {
    if (!r) continue;
    if (!m || RANGO_ESTADO[r.estado] < RANGO_ESTADO[m.estado]
      || (r.estado === m.estado && r.estado === 'amarillo' && (r.desde ?? '') < (m.desde ?? ''))) m = r;
  }
  return m;
}

const RANGO_CLASE: Record<ClaseCalendario, number> = { sale: 0, pronto: 1, temporada: 2, fuera: 3 };
const RANGO_FIAB: Record<Fiabilidad, number> = { buena: 0, media: 1, sin_validar: 2, baja: 3 };
/** Lo que más busca Alexander: boletus y Amanita caesarea (spec §1). */
export const preferida = (id: string) => id.startsWith('boletus_') || id === 'amanita_caesarea';

export interface FilaCalendario { id: string; fiabilidad: Fiabilidad; estado: EstadoCalendario }
/** Orden: primero lo que sale, luego lo que empieza antes; dentro, boletus/caesarea, fiabilidad y nombre. */
export function ordenarCalendario<T extends FilaCalendario>(filas: T[]): T[] {
  return [...filas].sort((a, b) => RANGO_CLASE[a.estado.clase] - RANGO_CLASE[b.estado.clase]
    || Number(preferida(b.id)) - Number(preferida(a.id))
    || RANGO_FIAB[a.fiabilidad] - RANGO_FIAB[b.fiabilidad]
    || (a.estado.dias ?? 0) - (b.estado.dias ?? 0)
    || a.id.localeCompare(b.id));
}
