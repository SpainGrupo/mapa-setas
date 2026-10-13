// Regla del semáforo (heurística v1): cuándo buscar según la lluvia y la temperatura. Nunca habla de comestibilidad.
import type { Dia } from './meteo';
import { CADUCIDAD_H } from './meteo';

export interface Reglas {
  episodio_mm: number;                 // lluvia acumulada en ≤3 días consecutivos que dispara la fructificación
  ventana_dias: [number, number];      // días tras el episodio en que suele salir
  tmin_media: [number, number];        // rango favorable de la media de mínimas de los últimos 10 días
  tmax_media: [number, number];        // ídem de máximas
}
export type Estado = 'verde' | 'amarillo' | 'rojo' | 'gris';
export interface ResultadoSemaforo {
  estado: Estado;
  motivo: string;
  desde?: string;                      // YYYY-MM-DD
  hasta?: string;
  episodio?: string;                   // último día del episodio de lluvia que manda
  lluvia_mm?: number;
}

const DIA_MS = 86400000;
const aMs = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const sumarDias = (iso: string, n: number) => new Date(aMs(iso) + n * DIA_MS).toISOString().slice(0, 10);
export const diasEntre = (a: string, b: string) => Math.round((aMs(b) - aMs(a)) / DIA_MS);
export const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const grados = (v: number) => v.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

interface Episodio { i: number; mm: number }

const LLOVIZNA_MM = 1;   // un día con menos no cierra episodio (los modelos dan trazas de 0,1–0,5 mm)

/** Episodios: días con lluvia que cierran una ventana de 1–3 días consecutivos con ≥ episodio_mm. Del más reciente al más antiguo. */
function episodios(serie: Dia[], mm: number): Episodio[] {
  const r: Episodio[] = [];
  for (let e = serie.length - 1; e >= 0; e--) {
    if (!(serie[e].lluvia >= LLOVIZNA_MM)) continue;
    let suma = 0, mejor = 0;
    for (let k = 0; k < 3 && e - k >= 0; k++) { suma += serie[e - k].lluvia; mejor = Math.max(mejor, suma); }
    if (mejor >= mm) r.push({ i: e, mm: Math.round(mejor) });
  }
  return r;
}

function media(xs: number[]): number {
  const v = xs.filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
}

/** Qué temperatura falla (lista vacía si las dos medias de 10 días están en rango). */
function temperatura(serie: Dia[], hoyI: number, r: Reglas): string[] {
  const ult = serie.slice(Math.max(0, hoyI - 9), hoyI + 1);
  const fallos: string[] = [];
  const mira = (nombre: string, v: number, [a, b]: [number, number]) => {
    if (!Number.isFinite(v)) return;
    if (v < a) fallos.push(`${nombre} frías (${grados(v)} °C; favorable ${a}–${b})`);
    else if (v > b) fallos.push(`${nombre} altas (${grados(v)} °C; favorable ${a}–${b})`);
  };
  mira('mínimas', media(ult.map((d) => d.tmin)), r.tmin_media);
  mira('máximas', media(ult.map((d) => d.tmax)), r.tmax_media);
  return fallos;
}

export function semaforo(serie: Dia[], reglas: Reglas, hoy: string, opciones: { edadHoras?: number } = {}): ResultadoSemaforo {
  if ((opciones.edadHoras ?? 0) > CADUCIDAD_H) return { estado: 'gris', motivo: 'datos antiguos' };
  const hoyI = serie.length ? diasEntre(serie[0].fecha, hoy) : -1;
  if (hoyI < 0 || hoyI >= serie.length) return { estado: 'gris', motivo: 'sin datos para hoy' };
  const [vmin, vmax] = reglas.ventana_dias;
  const temp = temperatura(serie, hoyI, reglas);
  const eps = episodios(serie, reglas.episodio_mm);
  const pasado = eps.find((e) => e.i <= hoyI);
  const previsto = eps.filter((e) => e.i > hoyI).at(-1); // el más cercano de la previsión (eps va del más reciente al más antiguo)

  const evaluar = (ep: Episodio | undefined): ResultadoSemaforo => {
    if (!ep) return { estado: 'rojo', motivo: `seco: sin lluvia de ${reglas.episodio_mm} mm o más en 30 días` };
    const fecha = serie[ep.i].fecha;
    const d = hoyI - ep.i;
    const base = { episodio: fecha, lluvia_mm: ep.mm };
    if (d < vmin) {
      const desde = sumarDias(fecha, vmin);
      const intro = d < 0 ? `lluvia prevista el ${ddmm(fecha)} (${ep.mm} mm)` : `lluvia de ${ep.mm} mm el ${ddmm(fecha)}`;
      return { estado: 'amarillo', ...base, desde, hasta: sumarDias(fecha, vmax),
        motivo: `${intro}: esperar, la ventana suele abrir el ${ddmm(desde)}` + (temp.length ? `; temperatura fuera de rango: ${temp.join(', ')}` : '') };
    }
    if (d > vmax) return { estado: 'rojo', ...base, motivo: `ventana pasada: la última lluvia buena fue el ${ddmm(fecha)}, hace ${d} días` };
    const hasta = sumarDias(fecha, vmax);
    if (temp.length) return { estado: 'amarillo', ...base, hasta, motivo: `lluvia buena, temperatura justa: ${temp.join(', ')}` };
    return { estado: 'verde', ...base, hasta, motivo: `ventana abierta: ${ep.mm} mm el ${ddmm(fecha)}, hace ${d} días` };
  };

  const actual = evaluar(pasado);
  if (!previsto) return actual;
  // Si la lluvia pasada aún cuenta (ventana abierta o por abrir), la prevista solo completa el motivo;
  // solo cuando lo pasado no sirve (rojo) manda el episodio previsto.
  if (actual.estado !== 'rojo') return { ...actual, motivo: `${actual.motivo}; lluvia prevista el ${ddmm(serie[previsto.i].fecha)}` };
  return evaluar(previsto);
}
