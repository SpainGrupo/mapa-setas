// Minutos en coche en las tarjetas de sitios (2026-11-13): botón «Usar mi ubicación» (solo al pulsarlo se pide el
// permiso; nada al cargar), cifra «🚗 25 min» en cada tarjeta y el botón «Cómo llegar en coche» al lado. La lógica pura
// (OSRM, troceo, caché, estimación, formato) está en coche.ts.
//
// Cada cifra es un <span class="coche-min"> con los datos de su sitio; recalcular() recoge todos los que hay en el DOM
// (la lista, el carrusel del mapa y las tarjetas del chat), pide una sola tabla de duraciones y los rellena a la vez.
// Origen: el GPS de la app si está activo; si no, la ubicación del móvil de esta sesión; si no, la última guardada
// (indicada como «desde tu última ubicación»). Sin ninguna, no se pone cifra.
import { CLAVE_POSICION, CacheMinutos, claveOrigen, formatoMinutos, minutosEnCoche, parsearPosicion, serializarPosicion, textoHace,
  type Minutos, type Punto, type PosicionGuardada } from './coche';

export interface ContextoCoche {
  /** Destino en coche de un sitio: su aparcamiento si se conoce; si no, el propio punto. */
  destino: (ap: number | null, lat: number, lon: number) => Promise<Punto>;
  /** Posición del GPS de la app, si está activo. */
  posicionGps: () => Punto | null;
  /** Se llama cuando cambia la ubicación viva (para reordenar por cercanía y repintar las distancias). */
  alCambiarOrigen?: () => void;
}

type TipoOrigen = 'gps' | 'viva' | 'ultima';
interface Origen { p: Punto; tipo: TipoOrigen; t?: number }

let ctx: ContextoCoche | null = null;
let viva: PosicionGuardada | null = null;        // ubicación pedida en esta sesión
let guardada: PosicionGuardada | null = null;    // la de la última vez (localStorage)
let errorUbi: string | null = null;
let buscando = false;
let calculando = false;
let claveActual = '';
const resultados = new Map<string, Minutos>();   // clave del sitio → minutos con el origen actual
const cache = new CacheMinutos();

const leer = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const escribir = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* solo esta sesión */ } };

function origen(): Origen | null {
  const g = ctx?.posicionGps();
  if (g) return { p: g, tipo: 'gps' };
  if (viva) return { p: viva, tipo: 'viva', t: viva.t };
  if (guardada) return { p: guardada, tipo: 'ultima', t: guardada.t };
  return null;
}
/** Ubicación en directo (GPS de la app o la pedida en esta sesión); nunca la guardada de otra vez. */
export const posicionUsuario = (): Punto | null => ctx?.posicionGps() ?? viva ?? null;

const claveSitio = (lat: number, lon: number) => `${lat.toFixed(5)},${lon.toFixed(5)}`;

interface SitioCoche { lat: number; lon: number; ap?: number | null; destino?: Punto }

function cifra(s: SitioCoche): HTMLSpanElement {
  const min = document.createElement('span'); min.className = 'coche-min'; min.dataset.k = claveSitio(s.lat, s.lon);
  min.dataset.lat = String(s.lat); min.dataset.lon = String(s.lon);
  if (s.ap != null) min.dataset.ap = String(s.ap);
  if (s.destino) { min.dataset.dlat = String(s.destino.lat); min.dataset.dlon = String(s.destino.lon); }
  return min;
}

/** Bloque de una tarjeta: la cifra de minutos (vacía hasta que haya origen) y «Cómo llegar en coche». `destino` fija el
 * punto de aparcar cuando ya se conoce (tarjetas del chat); si no, se resuelve por `ap` (aparcamiento_id del sitio). */
export function bloqueCoche(s: SitioCoche, abrir: () => void): HTMLElement {
  const caja = document.createElement('div'); caja.className = 'tf-coche';
  const b = document.createElement('button'); b.type = 'button'; b.className = 'btn coche-ir'; b.textContent = 'Cómo llegar en coche';
  b.onclick = abrir;
  caja.append(...cifraConDesde(s), b);
  return caja;
}

/** Solo la cifra (y su «desde tu última ubicación»), sin botón: para tarjetas que ya tienen el suyo (chat). */
export function cifraCoche(s: SitioCoche): HTMLElement {
  const caja = document.createElement('p'); caja.className = 'tf-coche tf-coche-solo';
  caja.append(...cifraConDesde(s));
  pedir();
  return caja;
}

function cifraConDesde(s: SitioCoche): HTMLElement[] {
  const min = cifra(s);
  const desde = document.createElement('span'); desde.className = 'coche-desde'; desde.hidden = true; desde.textContent = 'desde tu última ubicación';
  rellenar(min, desde);
  return [min, desde];
}

function rellenar(el: HTMLElement, desdeEl?: HTMLElement) {
  const r = resultados.get(el.dataset.k ?? '');
  const o = origen();
  el.textContent = r && o ? formatoMinutos(r.min, r.estimado) : '';
  el.dataset.estimado = r ? String(r.estimado) : '';
  el.dataset.origen = r && o ? o.tipo : '';
  const desde = desdeEl ?? (el.nextElementSibling as HTMLElement | null);
  if (desde?.classList.contains('coche-desde')) desde.hidden = !(r && o?.tipo === 'ultima');
}

function textoBarra(): string {
  const o = origen();
  const partes: string[] = [];
  if (buscando) partes.push('Buscando tu ubicación…');
  else if (errorUbi) partes.push(errorUbi);
  if (!o) {
    if (!buscando && !errorUbi) partes.push('Para ver cuánto se tarda en coche: se envía un punto aproximado tuyo (~500 m) al servicio de rutas OSRM.');
    return partes.join(' ');
  }
  if (o.tipo === 'ultima') partes.push(`Minutos en coche desde tu última ubicación (${textoHace(Date.now() - (o.t ?? Date.now()))}).`);
  else partes.push('Minutos en coche desde tu ubicación (calculados con OSRM).');
  if (calculando) partes.push('Calculando…');
  else if ([...resultados.values()].some((r) => r.estimado)) partes.push('«Estimado»: aproximación en línea recta, sin ruta real.');
  return partes.join(' ');
}

function pintarBarra() {
  const e = document.getElementById('hoy-ubicacion-estado');
  if (e) e.textContent = textoBarra();
  const b = document.getElementById('hoy-ubicacion') as HTMLButtonElement | null;
  if (b) b.disabled = buscando;
}

function pintarCifras() {
  document.querySelectorAll<HTMLElement>('.coche-min').forEach((el) => rellenar(el));
  pintarBarra();
}

let corriendo = false, repetir = false;
/** Recoge las cifras del DOM, pide a OSRM las que faltan (una tabla; troceada si son muchas) y las rellena. */
export async function recalcular(): Promise<void> {
  if (corriendo) { repetir = true; return; }
  corriendo = true;
  try { do { repetir = false; await una(); } while (repetir); } finally { corriendo = false; calculando = false; pintarCifras(); }
}
/** Como recalcular(), tras terminar de pintar el DOM. */
export const pedir = () => { setTimeout(() => { void recalcular(); }, 0); };

async function una() {
  const o = origen();
  if (!o || !ctx) { pintarCifras(); return; }
  const clave = claveOrigen(o.p);
  if (clave !== claveActual) { claveActual = clave; resultados.clear(); }
  const nuevos = new Map<string, HTMLElement>();
  document.querySelectorAll<HTMLElement>('.coche-min').forEach((el) => {
    const k = el.dataset.k!;
    if (!resultados.has(k) && !nuevos.has(k)) nuevos.set(k, el);
  });
  if (!nuevos.size) { pintarCifras(); return; }
  calculando = true; pintarBarra();
  const claves = [...nuevos.keys()];
  const destinos = await Promise.all(claves.map((k) => {
    const el = nuevos.get(k)!;
    const lat = Number(el.dataset.lat), lon = Number(el.dataset.lon);
    if (el.dataset.dlat) return Promise.resolve({ lat: Number(el.dataset.dlat), lon: Number(el.dataset.dlon) });
    return ctx!.destino(el.dataset.ap != null ? Number(el.dataset.ap) : null, lat, lon).catch(() => ({ lat, lon }));
  }));
  const res = await minutosEnCoche(o.p, destinos, { cache, enLinea: navigator.onLine !== false });
  if (claveOrigen(origen()?.p ?? o.p) !== clave) { repetir = true; return; }   // el origen cambió mientras tanto
  claves.forEach((k, i) => resultados.set(k, res[i]));
  calculando = false;
  pintarCifras();
}

function aviso(texto: string | null) { errorUbi = texto; pintarBarra(); }

/** «Usar mi ubicación»: pide el permiso (solo aquí), guarda la posición con su hora y recalcula las cifras. */
export function usarMiUbicacion(): void {
  if (!navigator.geolocation) { aviso('Este dispositivo no ofrece ubicación.'); return; }
  buscando = true; errorUbi = null; pintarBarra();
  navigator.geolocation.getCurrentPosition((pos) => {
    buscando = false; errorUbi = null;
    viva = { lat: pos.coords.latitude, lon: pos.coords.longitude, t: Date.now() };
    escribir(CLAVE_POSICION, serializarPosicion(viva));
    resultados.clear(); claveActual = '';
    pintarBarra();
    ctx?.alCambiarOrigen?.();
    pedir();
  }, (err) => {
    buscando = false;
    aviso(err.code === 1 ? 'No hay permiso de ubicación: sin él no se pueden calcular los minutos.'
      : 'No se pudo obtener tu ubicación.');
    pedir();   // con una ubicación guardada se sigue usando
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 });
}

/** Engancha el botón y la línea de estado de la barra (#hoy-ubicacion / #hoy-ubicacion-estado) y carga la última posición. */
export function iniciarCoche(c: ContextoCoche) {
  ctx = c;
  guardada = parsearPosicion(leer(CLAVE_POSICION));
  document.getElementById('hoy-ubicacion')?.addEventListener('click', usarMiUbicacion);
  window.addEventListener('online', pedir);
  pintarBarra();
  if (guardada) pedir();
}
