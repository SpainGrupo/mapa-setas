// Regla del semáforo (heurística v3, 2026-11-07): probabilidad estimada (0–100 %) de que la especie esté saliendo hoy
// en un punto, y el color sale de esa cifra. Nunca habla de comestibilidad.
//
// v2 (2026-10-14, docs/investigacion/2026-10-14-factores-y-trucos.md) usaba cortes duros: un día fuera de la ventana
// era rojo y 0,2 °C fuera del rango, amarillo. Los hallazgos de campo de noviembre de 2026 (oronja en Ojén el 03/11,
// níscalos y Suillus en Monda el 07/11 con el semáforo en amarillo) lo contradecían. v3 multiplica factores suaves
// (docs/investigacion/2026-11-07-semaforo-probabilidad.md, calibrado con citas fechadas y meteo histórica):
//   probabilidad = P_MAX × tiempo desde el episodio × temperatura × humedad acumulada × estrés × temporada
//   - tiempo: rampa en los RAMPA_DIAS previos a ventana_dias[0], meseta en la ventana y caída lineal hasta 0 a
//     ventana_dias[1] + max(CAIDA_MIN_DIAS, CAIDA_FRAC × ancho). Manda el episodio pasado que más da hoy: la lluvia
//     prevista abre otra ventana pero no baja la de hoy.
//   - temperatura: por cada media de 10 días (mínimas, máximas), max(0, 1 − desvío/TEMP_ESCALA °C).
//   - humedad acumulada insuficiente (faltaHumedad) y estrés (golpe de calor, aire seco): factores fijos.
//   - fuera de temporada: factor bajo; con lluvia fuerte y suelo húmedo, uno intermedio (excepción de v2).
// Estado: verde ≥ UMBRAL_VERDE, amarillo ≥ UMBRAL_AMARILLO, rojo por debajo; gris sin datos (sin probabilidad).
// Los campos de Reglas de humedad y meses son opcionales: si faltan, esa comprobación no se hace.
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
  meses?: number[];                    // meses de temporada (1–12); fuera de ellos la probabilidad baja mucho
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
  /** Probabilidad estimada de que esté saliendo ese día (0–100, entera). Sin ella en gris (sin datos). */
  probabilidad?: number;
  desde?: string;                      // YYYY-MM-DD: la ventana aún no ha abierto (abre ese día)
  hasta?: string;                      // fin de la ventana típica (episodio + ventana_dias[1])
  episodio?: string;                   // último día del episodio de lluvia que manda
  lluvia_mm?: number;
  proxima?: ProximaVentana;
}
export interface Humedad {
  balance_mm: number;                  // Σ(lluvia − ET0) de los 30 días que acaban hoy; NaN si falta la ET0
  dias_lluvia: number;                 // días con ≥1 mm en esos 30 días
  suelo: number;                       // humedad del suelo 9–27 cm de hoy (m³/m³); NaN si no hay dato
}

/** Parámetros de la probabilidad (calibrados en docs/investigacion/2026-11-07-semaforo-probabilidad.md). */
export interface ParamsProbabilidad {
  p_max: number;            // techo: ni con todo a favor es seguro que salga
  rampa_dias: number;       // días antes de ventana_dias[0] en que la probabilidad ya sube…
  rampa_inicio_frac: number; // …pero nunca antes de esta fracción de ventana_dias[0] (el día de la lluvia no cuenta)
  caida_min_dias: number;   // la caída tras ventana_dias[1] dura al menos esto…
  caida_frac: number;       // …o esta fracción del ancho de la ventana
  temp_escala: number;      // °C de desvío de una media de 10 días que llevan su factor a 0
  f_humedad: number;        // humedad acumulada insuficiente
  f_estres: number;         // golpe de calor o aire seco tras el episodio
  f_fuera: number;          // fuera de temporada
  f_fuera_fuerte: number;   // fuera de temporada con lluvia fuerte y suelo húmedo
}
export const PARAMS: ParamsProbabilidad = {
  p_max: 0.9, rampa_dias: 10, rampa_inicio_frac: 0.3, caida_min_dias: 10, caida_frac: 0.4, temp_escala: 6,
  f_humedad: 0.65, f_estres: 0.7, f_fuera: 0.2, f_fuera_fuerte: 0.45,
};
export const UMBRAL_VERDE = 50;
export const UMBRAL_AMARILLO = 20;
/** Color de una probabilidad (0–100). */
export const estadoDe = (p: number): Estado => (p >= UMBRAL_VERDE ? 'verde' : p >= UMBRAL_AMARILLO ? 'amarillo' : 'rojo');
/** «≈ 62 %». */
export const textoProbabilidad = (p: number) => `≈ ${p} %`;
export const ETIQUETA_PROBABILIDAD = 'probabilidad estimada';

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

/** Desvío de una media de 10 días respecto a su rango favorable. */
interface FalloTemp { nombre: 'mínimas' | 'máximas'; v: number; rango: [number, number]; desvio: number; alta: boolean }
/** °C de desvío por debajo de los que la temperatura se describe como «casi en rango». */
export const CASI_EN_RANGO = 1;

/** Qué media de temperatura se sale del rango y cuánto (lista vacía si las dos están en rango). */
function temperatura(serie: Dia[], hoyI: number, r: Reglas): FalloTemp[] {
  const ult = serie.slice(Math.max(0, hoyI - 9), hoyI + 1);
  const fallos: FalloTemp[] = [];
  const mira = (nombre: FalloTemp['nombre'], v: number, rango: [number, number]) => {
    if (!Number.isFinite(v)) return;
    if (v < rango[0]) fallos.push({ nombre, v, rango, desvio: rango[0] - v, alta: false });
    else if (v > rango[1]) fallos.push({ nombre, v, rango, desvio: v - rango[1], alta: true });
  };
  mira('mínimas', media(ult.map((d) => d.tmin)), r.tmin_media);
  mira('máximas', media(ult.map((d) => d.tmax)), r.tmax_media);
  return fallos;
}
const textoFallo = (f: FalloTemp) => `${f.nombre} ${f.desvio < CASI_EN_RANGO ? 'casi en rango' : f.alta ? 'altas' : 'frías'}`
  + ` (${grados(f.v)} °C; favorable ${f.rango[0]}–${f.rango[1]})`;

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
export const FACTOR_FUERA_TEMPORADA = 1.5;   // fuera de temporada, la excepción pide un episodio ≥1,5 × episodio_mm con suelo húmedo

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

/** Días que dura la caída tras el fin de la ventana típica. */
export const diasCaida = (r: Reglas, p: ParamsProbabilidad = PARAMS) =>
  Math.max(p.caida_min_dias, Math.round(p.caida_frac * (r.ventana_dias[1] - r.ventana_dias[0])));

/** Factor del tiempo transcurrido desde el episodio (d días): rampa, meseta y caída (0–1). */
export function factorTiempo(d: number, r: Reglas, p: ParamsProbabilidad = PARAMS): number {
  const [vmin, vmax] = r.ventana_dias;
  if (d < 0) return 0;
  if (d < vmin) {
    const inicio = Math.max(vmin - p.rampa_dias - 1, p.rampa_inicio_frac * vmin);   // último día con factor 0
    return d <= inicio ? 0 : (d - inicio) / (vmin - inicio);
  }
  if (d <= vmax) return 1;
  return Math.max(0, 1 - (d - vmax) / diasCaida(r, p));
}

/** Factor de temperatura: producto, por cada media que se sale, de max(0, 1 − desvío/temp_escala). */
const factorTemp = (fallos: FalloTemp[], p: ParamsProbabilidad) => fallos.reduce((a, f) => a * Math.max(0, 1 - f.desvio / p.temp_escala), 1);

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const aprox = (iso: string) => `~${ddmm(iso)}`;
/** «lluvia del 18/10» o «lluvia prevista el 20/10». */
const deLluvia = (v: { episodio: string; prevista: boolean }) => (v.prevista ? `lluvia prevista el ${ddmm(v.episodio)}` : `lluvia del ${ddmm(v.episodio)}`);
/** Condición para que la ventana mejore cuando falla la temperatura: «Si refresca» / «Si templa». */
function siTemperatura(fallos: FalloTemp[]): string {
  if (fallos.every((f) => f.alta)) return 'Si refresca';
  if (fallos.every((f) => !f.alta)) return 'Si templa';
  return 'Si la temperatura entra en rango';
}

/**
 * Semáforo de un día con su probabilidad. Los motivos dicen siempre de qué lluvia es cada fecha, para que dos ventanas
 * seguidas no se lean como una contradicción («Ventana actual (lluvia del 04/10…): hasta ~24/10. Próxima ventana
 * (lluvia del 18/10): desde ~26/10.»). La próxima ventana va también en `proxima` (salvo en rojo).
 * `opciones.params` sustituye parámetros de la probabilidad (solo para la calibración).
 */
export function semaforo(serie: Dia[], reglas: Reglas, hoy: string,
  opciones: { edadHoras?: number; params?: Partial<ParamsProbabilidad> } = {}): ResultadoSemaforo {
  if ((opciones.edadHoras ?? 0) > CADUCIDAD_H) return { estado: 'gris', motivo: 'datos antiguos' };
  const hoyI = serie.length ? diasEntre(serie[0].fecha, hoy) : -1;
  if (hoyI < 0 || hoyI >= serie.length) return { estado: 'gris', motivo: 'sin datos para hoy' };
  const P = opciones.params ? { ...PARAMS, ...opciones.params } : PARAMS;
  const [vmin, vmax] = reglas.ventana_dias;
  const temp = temperatura(serie, hoyI, reglas);
  const fTemp = factorTemp(temp, P);
  const eps = episodios(serie, reglas.episodio_mm);
  const pasados = eps.filter((e) => e.i <= hoyI);                    // del más reciente al más antiguo
  const previsto = eps.filter((e) => e.i > hoyI).at(-1);             // el más cercano de la previsión
  const hum = humedadAcumulada(serie, hoy);
  const sinHumedad = faltaHumedad(hum, reglas);
  const ventanaDe = (ep: Episodio): ProximaVentana => {
    const f = serie[ep.i].fecha;
    return { desde: sumarDias(f, vmin), hasta: sumarDias(f, vmax), episodio: f, lluvia_mm: ep.mm, prevista: ep.i > hoyI };
  };

  // El episodio que manda hoy: el pasado que más probabilidad da (a igualdad, el más reciente).
  let actual: { ep: Episodio; f: number; estres: string | null } | null = null;
  for (const ep of pasados) {
    const ft = factorTiempo(hoyI - ep.i, reglas, P);
    if (ft <= 0) continue;
    const es = estres(serie, ep.i, hoyI);
    const f = ft * (es ? P.f_estres : 1);
    if (!actual || f > actual.f + 1e-9) actual = { ep, f, estres: es };
  }

  let res: ResultadoSemaforo;
  let p = 0;
  if (actual) {
    const { ep } = actual;
    const v = ventanaDe(ep);
    const d = hoyI - ep.i;
    // Próxima ventana: la de una lluvia pasada más reciente (de otro temporal: más de 3 días después) que aún no ha
    // abierto; si no, la de la lluvia prevista.
    const nueva = pasados.find((e) => e.i > ep.i + 3 && hoyI - e.i < vmin);
    const prox = nueva ? ventanaDe(nueva) : previsto ? ventanaDe(previsto) : undefined;
    p = P.p_max * actual.f * fTemp * (sinHumedad ? P.f_humedad : 1);
    const base = { episodio: v.episodio, lluvia_mm: ep.mm, hasta: v.hasta, ...(prox ? { proxima: prox } : {}) };
    const yProxima = prox ? `; próxima desde ${aprox(prox.desde)} (${deLluvia(prox)})` : '';
    const proxFrase = prox ? ` Próxima ventana (${deLluvia(prox)}): desde ${aprox(prox.desde)}.` : '';
    const pegas = [sinHumedad, actual.estres].filter((m): m is string => !!m);
    const fraseTemp = temp.length
      ? `${mayuscula(temp.map(textoFallo).join(' y '))}${temp.every((f) => f.desvio < CASI_EN_RANGO) ? ': resta poco' : `: ${siTemperatura(temp).toLowerCase()}, mejor`}.`
      : '';
    let motivo: string;
    if (d < vmin) {
      motivo = (100 * p < UMBRAL_AMARILLO
        ? `Lluvia de ${ep.mm} mm el ${ddmm(v.episodio)}: esperar. Ventana desde ${aprox(v.desde)} hasta ${aprox(v.hasta)}; puede adelantarse algún día.`
        : `Lluvia de ${ep.mm} mm el ${ddmm(v.episodio)}: la ventana está abriendo (suele empezar hacia ${aprox(v.desde)}; hasta ${aprox(v.hasta)}).`)
        + (fraseTemp ? ` ${fraseTemp}` : '') + (pegas.length ? ` ${mayuscula(pegas.join('; '))}.` : '') + proxFrase;
      res = { estado: 'rojo', ...base, desde: v.desde, motivo };
    } else if (d > vmax) {
      motivo = `Ventana del ${ddmm(v.episodio)} terminando (${ep.mm} mm, hace ${d} días; la ventana típica acabó el ${aprox(v.hasta)}): aún puede quedar algo unos días.`
        + (fraseTemp ? ` ${fraseTemp}` : '') + (pegas.length ? ` ${mayuscula(pegas.join('; '))}.` : '') + proxFrase;
      res = { estado: 'rojo', ...base, motivo };
    } else if (temp.length && temp.some((f) => f.desvio >= CASI_EN_RANGO)) {
      motivo = `Lluvia suficiente (${ep.mm} mm el ${ddmm(v.episodio)}) pero ${temp.map(textoFallo).join(' y ')}. ${siTemperatura(temp)}, ventana hasta ${aprox(v.hasta)}${yProxima}.`
        + (pegas.length ? ` ${mayuscula(pegas.join('; '))}.` : '');
      res = { estado: 'rojo', ...base, motivo };
    } else if (pegas.length) {
      motivo = `${mayuscula(pegas.join('; '))}; llovieron ${ep.mm} mm el ${ddmm(v.episodio)}. Ventana hasta ${aprox(v.hasta)}${yProxima}.`
        + (fraseTemp ? ` ${fraseTemp}` : '');
      res = { estado: 'rojo', ...base, motivo };
    } else {
      motivo = `Ventana actual (lluvia del ${ddmm(v.episodio)}, ${ep.mm} mm, hace ${d} días): hasta ${aprox(v.hasta)}.`
        + (fraseTemp ? ` ${fraseTemp}` : '') + proxFrase;
      res = { estado: 'rojo', ...base, motivo };
    }
    if (nueva && previsto) res.motivo += ` Más lluvia prevista el ${ddmm(serie[previsto.i].fecha)}.`;
    if (d >= vmin && serie[hoyI].lluvia >= AGUACERO_MM) {
      res.motivo += ` Aguacero hoy (${Math.round(serie[hoyI].lluvia)} mm): barro y accesos difíciles.`;
    }
  } else {
    // Ninguna ventana da nada hoy: o se espera una que aún no abre, o ya pasó, o está seco.
    const espera = pasados.find((e) => hoyI - e.i < vmin) ?? previsto;
    if (espera) {
      const v = ventanaDe(espera);
      const otra = espera.i <= hoyI && previsto ? ventanaDe(previsto) : undefined;
      const intro = v.prevista ? `Lluvia prevista el ${ddmm(v.episodio)} (${espera.mm} mm)` : `Lluvia de ${espera.mm} mm el ${ddmm(v.episodio)}`;
      res = { estado: 'rojo', episodio: v.episodio, lluvia_mm: espera.mm, desde: v.desde, hasta: v.hasta,
        motivo: `${intro}: esperar. Ventana desde ${aprox(v.desde)} hasta ${aprox(v.hasta)}.`
          + (temp.length ? ` Temperatura fuera de rango: ${temp.map(textoFallo).join(', ')}.` : '')
          + (otra ? ` Después, ${deLluvia(otra)}: otra ventana desde ${aprox(otra.desde)}.` : '') };
    } else if (pasados.length) {
      const ult = pasados[0];
      res = { estado: 'rojo', episodio: serie[ult.i].fecha, lluvia_mm: ult.mm,
        motivo: `Ventana pasada: la última lluvia buena fue el ${ddmm(serie[ult.i].fecha)}, hace ${hoyI - ult.i} días.` };
    } else {
      res = { estado: 'rojo', motivo: `Seco: sin lluvia de ${reglas.episodio_mm} mm o más en ${hoyI} días.` };
    }
  }
  return temporada(res, p, reglas, hoy, sinHumedad, P);
}

/**
 * Temporada y cierre: fuera de los meses de la especie la probabilidad se multiplica por f_fuera («Fuera de
 * temporada»). Excepción documentada (v2): si hay probabilidad, el episodio es fuerte (≥ FACTOR_FUERA_TEMPORADA ×
 * episodio_mm) y la humedad acumulada basta, por f_fuera_fuerte («fuera de temporada, pero…»), p. ej. un otoño
 * adelantado o una primavera muy lluviosa (con P_MAX 0,9 se queda en amarillo, como en v2). Si la ventana aún no ha
 * abierto (`desde`), cuenta el mes en que abre, no el de hoy.
 * Después, el color sale de la probabilidad; el rojo no lleva `proxima`.
 */
function temporada(res: ResultadoSemaforo, p: number, r: Reglas, hoy: string, sinHumedad: string | null, P: ParamsProbabilidad): ResultadoSemaforo {
  let out = res;
  if (r.meses?.length) {
    const ref = res.desde ?? hoy;
    if (!r.meses.includes(+ref.slice(5, 7))) {
      const cuando = `sale en ${[...r.meses].sort((a, b) => a - b).map((m) => MESES[m - 1]).join(', ')}`;
      const fuerte = p > 0 && (res.lluvia_mm ?? 0) >= FACTOR_FUERA_TEMPORADA * r.episodio_mm && !sinHumedad;
      if (fuerte) {
        p *= P.f_fuera_fuerte;
        out = { ...res, motivo: `Fuera de temporada (${cuando}), pero llovió fuerte y el suelo está húmedo: puede salir algo. ${res.motivo}` };
      } else {
        p *= P.f_fuera;
        out = { estado: 'rojo', motivo: `Fuera de temporada (${cuando}).`, ...(res.episodio ? { episodio: res.episodio, lluvia_mm: res.lluvia_mm } : {}) };
      }
    }
  }
  const probabilidad = Math.round(100 * p);
  const estado = estadoDe(probabilidad);
  const final: ResultadoSemaforo = { ...out, estado, probabilidad };
  if (estado === 'rojo') delete final.proxima;
  return final;
}
