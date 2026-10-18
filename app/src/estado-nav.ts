// Estado de navegación que sobrevive a una recarga: iOS descarta la página (Safari o PWA) cuando pasa un rato en segundo
// plano y, al volver, la carga de nuevo desde cero. Se guarda dónde estaba el usuario (pestaña, scroll de cada pantalla,
// posición del mapa, hoja de capas, día y seta de «Hoy») y al arrancar se restaura.
// Se escribe en sessionStorage (la misma pestaña, cualquier antigüedad) y en localStorage (por si iOS mata el proceso de
// la PWA y se pierde la sesión), este último solo vale unas horas: al día siguiente la app abre como siempre.
// Todo con try/catch: sin almacenamiento (modo privado, cuota), simplemente no se restaura.

export interface PosMapa { lon: number; lat: number; zoom: number; bearing?: number; pitch?: number }
export interface EstadoNav {
  v: 1;
  t: number;                           // ms (Date.now()) al guardar
  region?: string;                     // región activa: la posición del mapa solo vale en la misma
  pantalla?: string;                   // id de la pantalla activa (p-mapa, p-hoy…)
  scroll?: Record<string, number>;     // scrollTop por pantalla
  mapa?: PosMapa;
  capas?: boolean;                     // hoja «Capas del mapa» abierta
  hoy?: { especie?: string; dia?: string };
}

export const CLAVE_NAV = 'setas:navegacion';
export const VIGENCIA_LOCAL_MS = 12 * 3600 * 1000;

const PANTALLA = /^p-[a-z]+$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Valida y limpia lo leído (cualquier cosa rara se descarta campo a campo). */
export function sanear(x: unknown): EstadoNav | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (o.v !== 1 || !num(o.t)) return null;
  const r: EstadoNav = { v: 1, t: o.t };
  if (typeof o.region === 'string') r.region = o.region;
  if (typeof o.pantalla === 'string' && PANTALLA.test(o.pantalla)) r.pantalla = o.pantalla;
  if (o.scroll && typeof o.scroll === 'object') {
    const s = Object.entries(o.scroll as Record<string, unknown>).filter(([k, v]) => PANTALLA.test(k) && num(v) && v >= 0);
    if (s.length) r.scroll = Object.fromEntries(s) as Record<string, number>;
  }
  const m = o.mapa as Record<string, unknown> | undefined;
  if (m && num(m.lon) && num(m.lat) && num(m.zoom) && Math.abs(m.lat) <= 90 && Math.abs(m.lon) <= 180) {
    r.mapa = { lon: m.lon, lat: m.lat, zoom: m.zoom, ...(num(m.bearing) ? { bearing: m.bearing } : {}), ...(num(m.pitch) ? { pitch: m.pitch } : {}) };
  }
  if (o.capas === true) r.capas = true;
  const h = o.hoy as Record<string, unknown> | undefined;
  if (h && typeof h === 'object') {
    const hoy: EstadoNav['hoy'] = {};
    if (typeof h.especie === 'string' && h.especie) hoy.especie = h.especie;
    if (typeof h.dia === 'string' && FECHA.test(h.dia)) hoy.dia = h.dia;
    if (hoy.especie || hoy.dia) r.hoy = hoy;
  }
  return r;
}

type Almacen = Pick<Storage, 'getItem' | 'setItem'>;
const leerDe = (a: (() => Almacen | null | undefined)) => {
  try { const s = a()?.getItem(CLAVE_NAV); return s ? sanear(JSON.parse(s)) : null; } catch { return null; }
};

/** Estado guardado: el de la sesión si lo hay; si no, el de localStorage si tiene menos de VIGENCIA_LOCAL_MS. */
export function leerNav(sesion: () => Almacen | null | undefined, local: () => Almacen | null | undefined, ahora = Date.now()): EstadoNav | null {
  const s = leerDe(sesion);
  if (s) return s;
  const l = leerDe(local);
  return l && ahora - l.t >= 0 && ahora - l.t <= VIGENCIA_LOCAL_MS ? l : null;
}

export function guardarNav(est: EstadoNav, ...almacenes: (() => Almacen | null | undefined)[]) {
  const txt = JSON.stringify(est);
  for (const a of almacenes) { try { a()?.setItem(CLAVE_NAV, txt); } catch { /* sin almacenamiento: no se restaura */ } }
}
