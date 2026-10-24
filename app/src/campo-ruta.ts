// Ruta a pie por el terreno dentro del Modo campo (2026-10-20). campo-ui.ts solo engancha: este módulo guarda las cotas
// alrededor de tu posición (mdt-datos.ts), anota el desnivel de las microzonas, calcula la ruta hacia la elegida
// (ruta-pie.ts) y pinta su bloque: conmutador «Mínimo desnivel / Más directa», distancia, desnivel + y −, tiempo,
// perfil de altura (perfil-grafico.ts) y la nota de resolución.
import { cajaAlrededor, desnivelMicrozonas, DESNIVELES_MAX, MAX_NODOS, NOMBRE_MODO, notaResolucion, rutaPie, textoMinutos,
  type DesnivelMicro, type ModoRuta, type ResultadoRuta, type RutaPie } from './ruta-pie';
import { cotasEn, type Cotas } from './mdt-datos';
import { celdaLatLon } from './mdt';
import { pintarPerfil } from './perfil-grafico';
import { textoDistancia } from './ruta';
import { RADIO_M } from './micro';
import type { Manifest } from './tipos';
import type { Feature } from 'geojson';

/** Margen alrededor del radio de búsqueda para que la ruta pueda rodear (m). */
export const MARGEN_M = 400;
const CLAVE_MODO = 'setas:campo-ruta-modo', CLAVE_MAX = 'setas:campo-desnivel-max';

const leer = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const guardar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* solo esta sesión */ } };

let modo: ModoRuta = leer(CLAVE_MODO) === 'directa' ? 'directa' : 'minimo_desnivel';
let max: number | null = (() => { const v = Number(leer(CLAVE_MAX)); return DESNIVELES_MAX.includes(v) && v > 0 ? v : null; })();
let cotas: Cotas | null | undefined;
let centroCotas: { lat: number; lon: number } | null = null;
let ruta: ResultadoRuta | null = null;
let rutaMs = 0;
let anotarMs = 0;
let claveRuta = '';
let bloque: HTMLElement | null = null;
let alCambiar: () => void = () => {};

export const modoRuta = () => modo;
export const fuenteCotas = () => (cotas ? cotas.fuente : cotas === null ? 'ninguna' : 'cargando');
/** Desnivel máximo elegido (null = sin límite). Sin cotas no se puede filtrar: null. */
export const desnivelMax = () => max;
export const desnivelMaxEfectivo = () => (cotas ? max : null);

/** Selector «Desnivel máximo» (lo pone campo-ui.ts en su cabecera). */
export function selectorDesnivel(cambio: () => void): HTMLElement {
  const l = document.createElement('label'); l.className = 'campo cp-especie cp-desnivel';
  const s = document.createElement('span'); s.className = 'etq'; s.textContent = 'Desnivel máximo hasta la microzona';
  const sel = document.createElement('select'); sel.id = 'cp-desnivel';
  sel.append(...DESNIVELES_MAX.map((v) => { const o = document.createElement('option'); o.value = v === null ? '' : String(v); o.textContent = v === null ? 'Sin límite' : `${v} m`; return o; }));
  sel.value = max === null ? '' : String(max);
  sel.addEventListener('change', () => { max = sel.value ? Number(sel.value) : null; guardar(CLAVE_MAX, sel.value); cambio(); });
  l.append(s, sel);
  return l;
}

/** Carga (o reutiliza) las cotas alrededor de `centro`. */
export async function prepararCotas(m: Manifest | null, centro: { lat: number; lon: number }) {
  if (cotas !== undefined && centroCotas && centroCotas.lat === centro.lat && centroCotas.lon === centro.lon) return;
  if (!m) { cotas = null; return; }
  cotas = await cotasEn(m, cajaAlrededor(centro, RADIO_M + MARGEN_M)).catch((e) => { console.warn('cotas', e); return null; });
  centroCotas = { lat: centro.lat, lon: centro.lon };
  claveRuta = '';
}

/** Desnivel de cada candidata desde tu posición (sin cotas: todo null). */
export function anotar<T extends { lat: number; lon: number }>(cands: T[], desde: { lat: number; lon: number }): (T & DesnivelMicro)[] {
  if (!cotas) return cands.map((c) => ({ ...c, cota_m: null, dCota_m: null, desnivel_m: null, subida_m: null, bajada_m: null, motivo: 'sin_datos' as const }));
  const t0 = performance.now();
  const r = desnivelMicrozonas(cands, cotas.rejilla, desde, max);
  anotarMs = performance.now() - t0;
  return r;
}

/** «±12 m» para la lista de microzonas. */
export const textoDesnivelMicro = (d: Pick<DesnivelMicro, 'desnivel_m' | 'subida_m' | 'bajada_m'>) =>
  d.desnivel_m === null ? '' : d.desnivel_m < 5 ? 'casi llano' : `+${d.subida_m} / −${d.bajada_m} m`;

function calcular(destino: { lat: number; lon: number }, desde: { lat: number; lon: number }) {
  if (!cotas) { ruta = null; return; }
  const t0 = performance.now();
  ruta = rutaPie(cotas.rejilla, desde, destino, modo, MAX_NODOS);
  rutaMs = performance.now() - t0;
}

const NOMBRE_FALLO: Record<Exclude<ResultadoRuta['estado'], 'ok'>, string> = {
  sin_ruta: 'No hay ruta por el terreno sin pasar por pendientes de más de 30°: ve con cuidado o busca un camino.',
  limite: 'La ruta es demasiado larga para calcularla aquí.',
  sin_datos: 'No hay cotas del terreno en tu posición o en la microzona.',
  fuera: 'La microzona queda fuera de la zona de cotas cargada: acércate y vuelve a elegirla.',
};

/**
 * Bloque de la ruta hacia `destino` desde `desde` (se recalcula solo si cambian destino, modo o la celda de partida).
 * `cambio` se llama al cambiar el modo (para repintar el mapa).
 */
export function bloqueRuta(destino: { lat: number; lon: number }, desde: { lat: number; lon: number } | null, cambio: () => void): HTMLElement {
  alCambiar = cambio;
  bloque ??= Object.assign(document.createElement('div'), { className: 'cp-ruta' });
  const c = desde && cotas ? celdaLatLon(cotas.rejilla, desde.lat, desde.lon) : null;
  const celda = c ? `${c.fila},${c.col}` : desde ? 'fuera' : '';
  const clave = `${destino.lat},${destino.lon}|${modo}|${celda}|${fuenteCotas()}`;
  if (clave === claveRuta) return bloque;
  claveRuta = clave;
  if (desde) calcular(destino, desde); else ruta = null;
  pintarBloque(!!desde);
  return bloque;
}

function pintarBloque(conPos: boolean) {
  const b = bloque!;
  b.dataset.estado = ruta?.estado ?? (cotas === null ? 'sin_cotas' : conPos ? 'cargando' : 'sin_posicion');
  const seg = document.createElement('fieldset'); seg.className = 'segmentado cp-modo'; seg.setAttribute('aria-label', 'Tipo de ruta');
  for (const m of ['minimo_desnivel', 'directa'] as ModoRuta[]) {
    const l = document.createElement('label');
    const i = document.createElement('input'); i.type = 'radio'; i.name = 'cp-modo'; i.value = m; i.checked = modo === m;
    i.addEventListener('change', () => { modo = m; guardar(CLAVE_MODO, m); claveRuta = ''; alCambiar(); });
    const s = document.createElement('span'); s.textContent = NOMBRE_MODO[m];
    l.append(i, s); seg.append(l);
  }
  const datos = document.createElement('p'); datos.className = 'cp-ruta-datos'; datos.setAttribute('role', 'status');
  const graf = document.createElement('div'); graf.className = 'cp-ruta-perfil';
  const dato = document.createElement('p'); dato.className = 'nota cp-ruta-dato';
  const nota = document.createElement('p'); nota.className = 'nota cp-ruta-nota';
  if (!cotas) {
    datos.textContent = cotas === null ? 'Esta región no tiene cotas del terreno: sin ruta a pie (actualiza los mapas).' : 'Cargando las cotas del terreno…';
    b.replaceChildren(datos); return;
  }
  nota.textContent = notaResolucion(cotas.rejilla.res) + (cotas.fuente === 'acceso100' ? ' Esta región aún no tiene el MDT de 25 m.' : '');
  if (!conPos) { datos.textContent = 'Esperando tu posición para trazar la ruta…'; b.replaceChildren(seg, datos, nota); return; }
  if (!ruta || ruta.estado !== 'ok') {
    datos.textContent = ruta ? NOMBRE_FALLO[ruta.estado] : '';
    b.replaceChildren(seg, datos, nota); return;
  }
  const r: RutaPie = ruta;
  datos.innerHTML = '';
  const fuerte = (t: string) => { const x = document.createElement('b'); x.textContent = t; return x; };
  datos.append(fuerte(textoDistancia(r.distancia_m)), ' · ', fuerte(`+${r.subida_m} m`), ' de subida · ', fuerte(`−${r.bajada_m} m`),
    ' de bajada · ', fuerte(`≈ ${textoMinutos(r.tiempo_min)}`), ' a pie');
  pintarPerfil(graf, r.perfil, (t) => { dato.textContent = t; },
    { titulo: 'Altura (m) · de ti a la microzona', marcaInicio: 'Tú ', desde: 'de ti', aria: 'donde estás' });
  b.replaceChildren(seg, datos, graf, dato, nota);
}

/** Ruta trazada hacia `destino` (para «Ir aquí»), o null. */
export function rutaHacia(destino: { lat: number; lon: number }): RutaPie | null {
  return ruta?.estado === 'ok' && claveRuta.startsWith(`${destino.lat},${destino.lon}|`) ? ruta : null;
}

/** Línea de la ruta para el mapa del modo campo. */
export function featuresRuta(): Feature[] {
  return ruta?.estado === 'ok' ? [{ type: 'Feature', properties: { tipo: 'ruta', modo: ruta.modo }, geometry: { type: 'LineString', coordinates: ruta.linea } }] : [];
}

export function limpiarRuta() { ruta = null; claveRuta = ''; }
/** Al cambiar de búsqueda (nuevo centro): las cotas se vuelven a pedir. */
export function olvidarCotas() { cotas = undefined; centroCotas = null; limpiarRuta(); }

/** Estado para el e2e. */
export const estadoRuta = () => ({
  modo, desnivelMax: max, cotas: fuenteCotas(), res: cotas?.rejilla.res ?? null, ms: Math.round(rutaMs * 10) / 10, msAnotar: Math.round(anotarMs * 10) / 10,
  ruta: ruta ? (ruta.estado === 'ok' ? { estado: ruta.estado, modo: ruta.modo, distancia_m: Math.round(ruta.distancia_m), subida_m: ruta.subida_m,
    bajada_m: ruta.bajada_m, tiempo_min: Math.round(ruta.tiempo_min * 10) / 10, nodos: ruta.nodos, n: ruta.linea.length, res: ruta.res,
    inicio: ruta.linea[0], fin: ruta.linea[ruta.linea.length - 1] } : { estado: ruta.estado, nodos: ruta.nodos }) : null,
});
