// Cliente de Open-Meteo (Forecast API, sin clave) con lotes, corrección por altitud y caché en IndexedDB.
// Datos meteorológicos: Open-Meteo.com (CC BY 4.0).
import { createStore, get, set } from 'idb-keyval';

export interface PuntoMeteo { id: number; lat: number; lon: number; alt_media: number }
export interface Dia {
  fecha: string; lluvia: number; tmin: number; tmax: number;
  et0?: number;                        // evapotranspiración de referencia FAO (mm/día)
  hr_min?: number;                     // humedad relativa mínima a 2 m (%)
  suelo?: number;                      // humedad del suelo 9–27 cm, media diaria de los valores horarios (m³/m³)
}
export interface DatosMeteo {
  fecha_consulta: string;              // ISO 8601 (UTC) del momento de la consulta
  hoy: string;                         // YYYY-MM-DD en Europe/Madrid al consultar
  puntos: Record<string, Dia[]>;       // id del punto → 30 días pasados + 7 de previsión (hoy incluido)
}

export const API = 'https://api.open-meteo.com/v1/forecast';
export const LOTE = 40;
export const MAX_URL = 2000;          // por encima se parte en lotes de LOTE puntos
export const REFRESCO_H = 3;
export const CADUCIDAD_H = 72;
const GRADIENTE = -0.65 / 100;         // °C por metro

export function lotes<T>(xs: T[], n = LOTE): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < xs.length; i += n) r.push(xs.slice(i, i + n));
  return r;
}

// Nombres comprobados contra la API el 2026-10-14 (https://open-meteo.com/en/docs): `soil_moisture_9_to_27cm_mean`
// no existe como variable diaria de la Forecast API (error «invalid String value»), por eso va en horaria.
export const DIARIAS = ['precipitation_sum', 'temperature_2m_max', 'temperature_2m_min', 'et0_fao_evapotranspiration',
  'relative_humidity_2m_min'] as const;

export function urlOpenMeteo(ps: PuntoMeteo[]): string {
  const q = new URLSearchParams({
    latitude: ps.map((p) => p.lat).join(','),
    longitude: ps.map((p) => p.lon).join(','),
    daily: DIARIAS.join(','),
    hourly: 'soil_moisture_9_to_27cm',   // la Forecast API no la da agregada por día: se promedia aquí
    past_days: '30',
    forecast_days: '7',
    timezone: 'Europe/Madrid',
  });
  return `${API}?${q.toString().replaceAll('%2C', ',')}`;
}

/** Temperatura del modelo (a la altitud de su celda) llevada a la altitud del punto. */
export const corregirAltitud = (t: number, elevModelo: number, altPunto: number) => t + GRADIENTE * (altPunto - elevModelo);

export function fechaMadrid(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

interface RespuestaOM {
  elevation: number;
  daily: { time: string[]; precipitation_sum: (number | null)[]; temperature_2m_max: (number | null)[]; temperature_2m_min: (number | null)[];
    et0_fao_evapotranspiration?: (number | null)[]; relative_humidity_2m_min?: (number | null)[] };
  hourly?: { time: string[]; soil_moisture_9_to_27cm?: (number | null)[] };
}

/** Media diaria de una variable horaria (clave YYYY-MM-DD); solo días con al menos 12 horas con dato. */
export function mediaDiaria(time: string[], v: (number | null)[]): Map<string, number> {
  const acc = new Map<string, [number, number]>();
  time.forEach((t, i) => {
    const x = v[i];
    if (x == null || !Number.isFinite(x)) return;
    const k = t.slice(0, 10), a = acc.get(k) ?? [0, 0];
    acc.set(k, [a[0] + x, a[1] + 1]);
  });
  const r = new Map<string, number>();
  for (const [k, [s, n]] of acc) if (n >= 12) r.set(k, Math.round((s / n) * 1000) / 1000);
  return r;
}

const num = (v: number | null | undefined) => (v == null ? NaN : v);

function serie(r: RespuestaOM, p: PuntoMeteo): Dia[] {
  const d = r.daily;
  const corr = (v: number | null) => Math.round(corregirAltitud(num(v), r.elevation, p.alt_media) * 10) / 10;
  const suelo = r.hourly?.soil_moisture_9_to_27cm ? mediaDiaria(r.hourly.time, r.hourly.soil_moisture_9_to_27cm) : null;
  return d.time.map((fecha, i) => {
    const dia: Dia = { fecha, lluvia: d.precipitation_sum[i] ?? 0, tmin: corr(d.temperature_2m_min[i]), tmax: corr(d.temperature_2m_max[i]) };
    const et0 = d.et0_fao_evapotranspiration?.[i], hr = d.relative_humidity_2m_min?.[i], s = suelo?.get(fecha);
    if (et0 != null) dia.et0 = et0;
    if (hr != null) dia.hr_min = hr;
    if (s != null) dia.suelo = s;
    return dia;
  });
}

type Fetch = (url: string) => Promise<Response>;

export async function consultar(puntos: PuntoMeteo[], fetchFn: Fetch = (u) => fetch(u), ahora = new Date()): Promise<DatosMeteo> {
  const grupos = urlOpenMeteo(puntos).length <= MAX_URL ? [puntos] : lotes(puntos);
  const res: Record<string, Dia[]> = {};
  for (const g of grupos) {
    const r = await fetchFn(urlOpenMeteo(g));
    if (!r.ok) throw new Error(`Open-Meteo respondió HTTP ${r.status}`);
    const j = await r.json();
    const lista: RespuestaOM[] = Array.isArray(j) ? j : [j];
    if (lista.length !== g.length) throw new Error(`Open-Meteo devolvió ${lista.length} puntos de ${g.length}`);
    g.forEach((p, i) => (res[String(p.id)] = serie(lista[i], p)));
  }
  return { fecha_consulta: ahora.toISOString(), hoy: fechaMadrid(ahora), puntos: res };
}

export const edadHoras = (d: DatosMeteo, ahora = new Date()) => (ahora.getTime() - Date.parse(d.fecha_consulta)) / 3.6e6;

export function necesitaRefresco(d: DatosMeteo | null, ahora: Date, enLinea: boolean): boolean {
  return enLinea && (!d || edadHoras(d, ahora) > REFRESCO_H);
}

// ---------------------------------------------------------------- caché (IndexedDB 'setas-meteo')

let almacen: ReturnType<typeof createStore> | null = null;
const tienda = () => (almacen ??= createStore('setas-meteo', 'cache'));
export const leerCache = async () => (await get<DatosMeteo>('datos', tienda())) ?? null;
export const guardarCache = (d: DatosMeteo) => set('datos', d, tienda());

export interface Resultado { datos: DatosMeteo | null; origen: 'red' | 'cache' | 'ninguno'; error?: string }

/** Caché si está fresca (o no hay red); si no, consulta y guarda. Si la consulta falla, la caché que haya. */
export async function obtener(puntos: PuntoMeteo[], o: {
  forzar?: boolean; fetchFn?: Fetch; leer?: () => Promise<DatosMeteo | null>; guardar?: (d: DatosMeteo) => Promise<unknown>;
  ahora?: Date; enLinea?: boolean;
} = {}): Promise<Resultado> {
  const ahora = o.ahora ?? new Date();
  const enLinea = o.enLinea ?? navigator.onLine;
  const cache = await (o.leer ?? leerCache)().catch(() => null);
  if (!(enLinea && o.forzar) && !necesitaRefresco(cache, ahora, enLinea)) {
    return { datos: cache, origen: cache ? 'cache' : 'ninguno' };
  }
  try {
    const d = await consultar(puntos, o.fetchFn, ahora);
    await (o.guardar ?? guardarCache)(d);
    return { datos: d, origen: 'red' };
  } catch (e) {
    return { datos: cache, origen: cache ? 'cache' : 'ninguno', error: String((e as Error)?.message ?? e) };
  }
}
