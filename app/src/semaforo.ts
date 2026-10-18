// Regla del semáforo (heurística v2): cuándo buscar según la lluvia, la humedad acumulada, la temperatura y la
// temporada. Nunca habla de comestibilidad. v2 (2026-10-14) sigue docs/investigacion/2026-10-14-factores-y-trucos.md,
// recomendaciones 1, 5 y 6. Los campos nuevos de Reglas son opcionales: si faltan, esa comprobación no se hace.
import type { Dia } from './meteo';
import { CADUCIDAD_H } from './meteo';

export interface Reglas {
  episodio_mm: number;                 // lluvia acumulada en ≤3 días consecutivos que dispara la fructificación
  ventana_dias: [number, number];      // días tras el episodio en que suele salir
  tmin_media: [number, number];        // rango favorable de la media de mínimas de los últimos 10 días
  tmax_media: [number, number];        // ídem de máximas
  balance_30d_min_mm?: number;         // lluvia − ET0 de los últimos 30 días (mm) por debajo de la cual el suelo sigue seco
  dias_lluvia_30d_min?: number;        // días con ≥1 mm en los últimos 30 días
  humedad_suelo_min?: number;          // humedad del suelo a 9–27 cm (m³/m³) que basta aunque el balance sea bajo
  meses?: number[];                    // meses de temporada (1–12); fuera de ellos, rojo salvo lluvia fuerte y suelo húmedo
}
export type Estado = 'verde' | 'amarillo' | 'rojo' | 'gris';
/** Ventana siguiente a la que manda hoy: la abre una lluvia más reciente (o prevista) que la del episodio actual. */
export interface ProximaVentana {
  desde: string;                       // YYYY-MM-DD
  hasta: string;
  episodio: string;                    // último día de esa lluvia
  lluvia_mm: number;
  prevista: boolean;                   // la lluvia aún está en la previsión
}
export interface ResultadoSemaforo {
  estado: Estado;
  motivo: string;
  desde?: string;                      // YYYY-MM-DD
  hasta?: string;
  episodio?: string;                   // último día del episodio de lluvia que manda
  lluvia_mm?: number;
  proxima?: ProximaVentana;
}
export interface Humedad {
  balance_mm: number;                  // Σ(lluvia − ET0) de los 30 días que acaban hoy; NaN si falta la ET0
  dias_lluvia: number;                 // días con ≥1 mm en esos 30 días
  suelo: number;                       // humedad del suelo 9–27 cm de hoy (m³/m³); NaN si no hay dato
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

/** Humedad acumulada en los 30 días que acaban hoy (hoy incluido). */
export function humedadAcumulada(serie: Dia[], hoy: string): Humedad {
  const hoyI = serie.length ? diasEntre(serie[0].fecha, hoy) : -1;
  const ult = hoyI < 0 ? [] : serie.slice(Math.max(0, hoyI - 29), hoyI + 1);
  const conEt0 = ult.length > 0 && ult.every((d) => Number.isFinite(d.et0));
  const suelos = ult.map((d) => d.suelo).filter((v): v is number => Number.isFinite(v));
  return {
    balance_mm: conEt0 ? Math.round(ult.reduce((a, d) => a + d.lluvia - (d.et0 as number), 0)) : NaN,
    dias_lluvia: ult.filter((d) => d.lluvia >= LLOVIZNA_MM).length,
    suelo: suelos.length ? suelos[suelos.length - 1] : NaN,
  };
}

/** Motivo por el que la humedad acumulada no basta (null si basta o si la especie no fija umbrales). */
function faltaHumedad(h: Humedad, r: Reglas): string | null {
  const pocosDias = r.dias_lluvia_30d_min != null && h.dias_lluvia < r.dias_lluvia_30d_min;
  const fuentes: boolean[] = [];
  if (r.balance_30d_min_mm != null && Number.isFinite(h.balance_mm)) fuentes.push(h.balance_mm >= r.balance_30d_min_mm);
  if (r.humedad_suelo_min != null && Number.isFinite(h.suelo)) fuentes.push(h.suelo >= r.humedad_suelo_min);
  const seco = fuentes.length > 0 && !fuentes.some(Boolean);
  if (!pocosDias && !seco) return null;
  const datos = [Number.isFinite(h.balance_mm) ? `balance ${String(h.balance_mm).replace('-', '−')} mm en 30 días` : '',
    `${h.dias_lluvia} ${h.dias_lluvia === 1 ? 'día' : 'días'} de lluvia`].filter(Boolean).join(' y ');
  return `lluvia puntual, suelo aún seco: ${datos}`;
}

export const AGUACERO_MM = 30;          // lluvia del día a partir de la cual se avisa de barro (solo aviso, no cambia el color)
export const SUBIDA_CALOR = 8;          // °C sobre la media de máximas de los 10 días previos (Salerni et al. 2023)
export const HR_SECA = 30;              // % de humedad relativa mínima diaria
/** Golpe de calor o aire seco entre el día siguiente al episodio y hoy (null si no hay). */
function estres(serie: Dia[], epI: number, hoyI: number): string | null {
  let seguidos = 0;
  for (let i = epI + 1; i <= hoyI; i++) {
    const previos = serie.slice(Math.max(0, i - 10), i).map((d) => d.tmax).filter(Number.isFinite);
    const ref = previos.length >= 5 ? media(previos) : NaN;
    if (Number.isFinite(ref) && serie[i].tmax >= ref + SUBIDA_CALOR) {
      return `golpe de calor el ${ddmm(serie[i].fecha)} (${grados(serie[i].tmax)} °C, ${Math.round(serie[i].tmax - ref)} °C más de lo normal): puede cortar la salida`;
    }
    seguidos = (serie[i].hr_min ?? NaN) < HR_SECA ? seguidos + 1 : 0;
    if (seguidos >= 2) return `aire muy seco desde el ${ddmm(serie[i - 1].fecha)} (humedad mínima bajo el ${HR_SECA} % dos días seguidos): puede cortar la salida`;
  }
  return null;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const FACTOR_FUERA_TEMPORADA = 1.5;   // fuera de temporada solo cuenta un episodio ≥1,5 × episodio_mm con suelo húmedo

/** Banda de altitud donde la media de 10 días encaja en el rango de la especie, a −0,65 °C/100 m desde altPunto. */
export function bandaAltitud(serie: Dia[], hoy: string, r: Reglas, altPunto: number, limites: [number, number] = [0, 2000]):
  { desde: number; hasta: number; encaja: boolean } | null {
  const hoyI = serie.length ? diasEntre(serie[0].fecha, hoy) : -1;
  if (hoyI < 0 || hoyI >= serie.length) return null;
  const ult = serie.slice(Math.max(0, hoyI - 9), hoyI + 1);
  const mn = media(ult.map((d) => d.tmin)), mx = media(ult.map((d) => d.tmax));
  if (!Number.isFinite(mn) || !Number.isFinite(mx)) return null;
  const G = 0.0065;                                       // °C por metro
  // T(a) = T0 − G·(a − alt) ∈ [lo, hi]  ⇔  a ∈ [alt + (T0 − hi)/G, alt + (T0 − lo)/G]
  const rango = (t0: number, [lo, hi]: [number, number]) => [altPunto + (t0 - hi) / G, altPunto + (t0 - lo) / G];
  const [a1, b1] = rango(mn, r.tmin_media), [a2, b2] = rango(mx, r.tmax_media);
  const desde = Math.max(a1, a2, limites[0]), hasta = Math.min(b1, b2, limites[1]);
  const redondeo = (v: number) => Math.round(v / 50) * 50;
  if (hasta >= desde) return { desde: redondeo(desde), hasta: redondeo(hasta), encaja: true };
  // Sin cota que cumpla las dos: la que menos se sale (desvío total en °C), de 50 en 50 m.
  const fuera = (t: number, [lo, hi]: [number, number]) => Math.max(0, lo - t, t - hi);
  let mejor = limites[0], pen = Infinity;
  for (let a = limites[0]; a <= limites[1]; a += 50) {
    const d = -G * (a - altPunto);
    const p = fuera(mn + d, r.tmin_media) + fuera(mx + d, r.tmax_media);
    if (p < pen - 1e-9) { pen = p; mejor = a; }
  }
  return { desde: mejor, hasta: mejor, encaja: false };
}

/** Texto de la pista de altitud: «empieza por arriba» / «ya baja» / la cota de la zona sirve. */
export function textoBanda(b: { desde: number; hasta: number; encaja: boolean } | null, altPunto: number): string {
  if (!b) return '';
  const m = (v: number) => v.toLocaleString('es-ES');
  if (!b.encaja) return `Ahora ninguna altitud tiene la temperatura justa. La que más se acerca está hacia los ${m(b.desde)} m.`;
  const banda = `entre ${m(b.desde)} y ${m(b.hasta)} m`;
  if (b.desde > altPunto) return `Empieza por arriba, mejor ahora ${banda}.`;
  if (b.hasta < altPunto) return `Ya baja, mejor ahora ${banda}.`;
  return `Esta altitud va bien, mejor ahora ${banda}.`;
}

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const aprox = (iso: string) => `~${ddmm(iso)}`;
/** «lluvia del 18/10» o «lluvia prevista el 20/10». */
const deLluvia = (v: { episodio: string; prevista: boolean }) => (v.prevista ? `lluvia prevista el ${ddmm(v.episodio)}` : `lluvia del ${ddmm(v.episodio)}`);
/** Condición para que la ventana actual valga cuando falla la temperatura: «Si refresca» / «Si templa». */
function siTemperatura(fallos: string[]): string {
  if (fallos.every((f) => f.includes(' altas '))) return 'Si refresca';
  if (fallos.every((f) => f.includes(' frías '))) return 'Si templa';
  return 'Si la temperatura entra en rango';
}

/**
 * Semáforo de hoy. Los motivos dicen siempre de qué lluvia es cada fecha, para que dos ventanas seguidas no se lean como
 * una contradicción («hasta ~25/10» de la actual y «desde ~26/10» de la próxima): «Ventana actual (lluvia del 04/10…):
 * hasta ~24/10. Próxima ventana (lluvia del 18/10): desde ~26/10.» La próxima ventana va también en `proxima`.
 */
export function semaforo(serie: Dia[], reglas: Reglas, hoy: string, opciones: { edadHoras?: number } = {}): ResultadoSemaforo {
  if ((opciones.edadHoras ?? 0) > CADUCIDAD_H) return { estado: 'gris', motivo: 'datos antiguos' };
  const hoyI = serie.length ? diasEntre(serie[0].fecha, hoy) : -1;
  if (hoyI < 0 || hoyI >= serie.length) return { estado: 'gris', motivo: 'sin datos para hoy' };
  const [vmin, vmax] = reglas.ventana_dias;
  const temp = temperatura(serie, hoyI, reglas);
  const eps = episodios(serie, reglas.episodio_mm);
  const pasado = eps.find((e) => e.i <= hoyI);
  const previsto = eps.filter((e) => e.i > hoyI).at(-1); // el más cercano de la previsión (eps va del más reciente al más antiguo)
  const hum = humedadAcumulada(serie, hoy);
  const ventanaDe = (ep: Episodio): ProximaVentana => {
    const f = serie[ep.i].fecha;
    return { desde: sumarDias(f, vmin), hasta: sumarDias(f, vmax), episodio: f, lluvia_mm: ep.mm, prevista: ep.i > hoyI };
  };

  /** Estado y motivo del episodio `ep`; `prox` = la ventana siguiente, que el motivo menciona. */
  const evaluar = (ep: Episodio | undefined, prox?: ProximaVentana): ResultadoSemaforo => {
    if (!ep) return { estado: 'rojo', motivo: `Seco: sin lluvia de ${reglas.episodio_mm} mm o más en 30 días.` };
    const v = ventanaDe(ep);
    const fecha = v.episodio;
    const d = hoyI - ep.i;
    const base = { episodio: fecha, lluvia_mm: ep.mm, ...(prox ? { proxima: prox } : {}) };
    const yProxima = prox ? `; próxima desde ${aprox(prox.desde)} (${deLluvia(prox)})` : '';
    if (d < vmin) {
      const intro = d < 0 ? `Lluvia prevista el ${ddmm(fecha)} (${ep.mm} mm)` : `Lluvia de ${ep.mm} mm el ${ddmm(fecha)}`;
      return { estado: 'amarillo', ...base, desde: v.desde, hasta: v.hasta,
        motivo: `${intro}: esperar. Ventana desde ${aprox(v.desde)} hasta ${aprox(v.hasta)}.`
          + (temp.length ? ` Temperatura fuera de rango: ${temp.join(', ')}.` : '')
          + (prox ? ` Después, ${deLluvia(prox)}: otra ventana desde ${aprox(prox.desde)}.` : '') };
    }
    if (d > vmax) return { estado: 'rojo', ...base, motivo: `Ventana pasada: la última lluvia buena fue el ${ddmm(fecha)}, hace ${d} días.` };
    const hasta = v.hasta;
    if (temp.length) return { estado: 'amarillo', ...base, hasta,
      motivo: `Lluvia suficiente (${ep.mm} mm el ${ddmm(fecha)}) pero ${temp.join(' y ')}. ${siTemperatura(temp)}, ventana hasta ${aprox(hasta)}${yProxima}.` };
    const pegas = [faltaHumedad(hum, reglas), estres(serie, ep.i, hoyI)].filter((m): m is string => !!m);
    if (pegas.length) return { estado: 'amarillo', ...base, hasta,
      motivo: `${mayuscula(pegas.join('; '))}; llovieron ${ep.mm} mm el ${ddmm(fecha)}. Ventana hasta ${aprox(hasta)}${yProxima}.` };
    return { estado: 'verde', ...base, hasta,
      motivo: `Ventana actual (lluvia del ${ddmm(fecha)}, ${ep.mm} mm, hace ${d} días): hasta ${aprox(hasta)}.`
        + (prox ? ` Próxima ventana (${deLluvia(prox)}): desde ${aprox(prox.desde)}.` : '') };
  };

  // Una lluvia nueva abre otra ventana futura, no cierra la actual: si un episodio anterior tiene la ventana
  // abierta hoy, se evalúa ese (con temperatura, humedad y estrés) y la lluvia nueva es la próxima ventana.
  const abierto = pasado && hoyI - pasado.i < vmin
    ? eps.find((e) => e.i < pasado.i && hoyI - e.i >= vmin && hoyI - e.i <= vmax) : undefined;
  const actual = abierto ?? pasado;
  // La próxima ventana: la de la lluvia nueva si hay una ventana abierta; si no, la de la lluvia prevista. Si lo pasado
  // no sirve (rojo), manda el episodio previsto.
  const prox = abierto && pasado ? ventanaDe(pasado) : previsto ? ventanaDe(previsto) : undefined;
  let res = evaluar(actual, prox);
  if (res.estado === 'rojo' && previsto && !(abierto && pasado)) res = evaluar(previsto);
  else if (abierto && pasado && previsto) res = { ...res, motivo: `${res.motivo} Más lluvia prevista el ${ddmm(serie[previsto.i].fecha)}.` };
  if (res.estado === 'rojo') { const { proxima: _p, ...sin } = res; res = sin; }
  if (abierto && pasado && serie[hoyI].lluvia >= AGUACERO_MM) {
    res = { ...res, motivo: `${res.motivo} Aguacero hoy (${Math.round(serie[hoyI].lluvia)} mm): barro y accesos difíciles.` };
  }
  return temporada(res, reglas, hoy, hum);
}

/**
 * Temporada: fuera de los meses de la especie, rojo «fuera de temporada». Excepción documentada: si el estado ya no
 * era rojo, el episodio es fuerte (≥ FACTOR_FUERA_TEMPORADA × episodio_mm) y la humedad acumulada basta, queda en
 * amarillo «fuera de temporada, pero…» (p. ej. un otoño adelantado o una primavera muy lluviosa). Para «esperar»
 * cuenta el mes en que abre la ventana, no el de hoy.
 */
function temporada(res: ResultadoSemaforo, r: Reglas, hoy: string, hum: Humedad): ResultadoSemaforo {
  if (!r.meses?.length) return res;
  const ref = res.estado === 'amarillo' && res.desde ? res.desde : hoy;
  if (r.meses.includes(+ref.slice(5, 7))) return res;
  const cuando = `sale en ${[...r.meses].sort((a, b) => a - b).map((m) => MESES[m - 1]).join(', ')}`;
  const fuerte = res.estado !== 'rojo' && (res.lluvia_mm ?? 0) >= FACTOR_FUERA_TEMPORADA * r.episodio_mm && !faltaHumedad(hum, r);
  if (fuerte) return { ...res, estado: 'amarillo', motivo: `Fuera de temporada (${cuando}), pero llovió fuerte y el suelo está húmedo: puede salir algo. ${res.motivo}` };
  return { estado: 'rojo', motivo: `Fuera de temporada (${cuando}).`, ...(res.episodio ? { episodio: res.episodio, lluvia_mm: res.lluvia_mm } : {}) };
}
