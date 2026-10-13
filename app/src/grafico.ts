// Gráfico SVG propio (sin librería) de un punto meteo: temperaturas arriba, lluvia en medio y, si hay dato, humedad
// del suelo abajo (paneles con el mismo eje de fechas: nunca dos escalas en un mismo panel). Previsión sombreada, línea de «hoy» y banda de
// la ventana de la especie elegida. Pensado para leerse al sol: tinta oscura, trazos de 2 px y texto grande.
import type { Dia } from './meteo';
import { ddmm, diasEntre } from './semaforo';

const NS = 'http://www.w3.org/2000/svg';
export const COLORES_GRAFICO = { lluvia: '#2a78d6', tmax: '#d9480f', tmin: '#4a3aa7', ventana: '#0ca30c', suelo: '#9a5a00' };
const TINTA = '#111', TINTA_2 = '#3d3d3a', REJILLA = '#d9d6cf';
const W = 360, IZQ = 34, DER = 40, T0 = 26, T1 = 142, L0 = 196, L1 = 284, S0 = L1 + 34, S1 = S0 + 56;

function el<K extends keyof SVGElementTagNameMap>(tag: K, at: Record<string, string | number>, padre?: Element, texto?: string) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(at)) e.setAttribute(k, String(v));
  if (texto != null) e.textContent = texto;
  padre?.append(e);
  return e;
}

/** Pasos «limpios» para un eje (1, 2, 5 × 10^n). */
export function pasoLimpio(rango: number, objetivo = 4): number {
  const bruto = Math.max(rango, 1e-9) / objetivo;
  const p = 10 ** Math.floor(Math.log10(bruto));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= bruto)!;
}

const num1 = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 });
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export function textoDia(d: Dia, hoy: string): string {
  const sem = DIAS[new Date(d.fecha + 'T12:00:00Z').getUTCDay()];
  const rel = diasEntre(hoy, d.fecha);
  const cuando = rel === 0 ? ' (hoy)' : rel > 0 ? ' (previsión)' : '';
  const suelo = Number.isFinite(d.suelo) ? ` · suelo ${(d.suelo as number).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
  return `${sem} ${ddmm(d.fecha)}${cuando} · lluvia ${num1(d.lluvia)} mm · máx ${num1(d.tmax)} °C · mín ${num1(d.tmin)} °C${suelo}`;
}

/**
 * Dibuja el gráfico en `contenedor` (sustituye lo que hubiera). `ventana` = fechas de la ventana de la especie
 * (si hay episodio). `alDato` recibe el texto del día señalado al tocar/pasar el dedo.
 */
export function pintarGrafico(contenedor: HTMLElement, serie: Dia[], hoy: string,
  ventana: { desde: string; hasta: string; etiqueta: string } | null, alDato: (t: string) => void) {
  contenedor.replaceChildren();
  if (!serie.length) return;
  const n = serie.length;
  const slot = (W - IZQ - DER) / n;
  const x = (i: number) => IZQ + (i + 0.5) * slot;
  const iDe = (f: string) => diasEntre(serie[0].fecha, f);
  const conSuelo = serie.some((d) => Number.isFinite(d.suelo));
  const FONDO = conSuelo ? S1 : L1, H = FONDO + 38;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', class: 'grafico-svg',
    'aria-label': `Lluvia diaria y temperaturas máximas y mínimas${conSuelo ? ', y humedad del suelo' : ''}: 30 días pasados y 7 de previsión` }, contenedor);

  // Escalas
  const temps = serie.flatMap((d) => [d.tmin, d.tmax]).filter(Number.isFinite);
  const pT = pasoLimpio(Math.max(...temps) - Math.min(...temps), 3);
  const tLo = Math.floor(Math.min(...temps) / pT) * pT, tHi = Math.ceil(Math.max(...temps) / pT) * pT || pT;
  const yT = (v: number) => T1 - ((v - tLo) / (tHi - tLo || 1)) * (T1 - T0);
  const lMax = Math.max(10, ...serie.map((d) => d.lluvia));
  const pL = pasoLimpio(lMax, 2);
  const lHi = Math.ceil(lMax / pL) * pL;
  const yL = (v: number) => L1 - (v / lHi) * (L1 - L0);
  const suelos = serie.map((d) => d.suelo).filter((v): v is number => Number.isFinite(v));
  const pS = 0.05;
  const sLo = suelos.length ? Math.floor(Math.min(...suelos) / pS) * pS : 0;
  const sHi = suelos.length ? Math.max(sLo + pS, Math.ceil(Math.max(...suelos) / pS) * pS) : pS;
  const yS = (v: number) => S1 - ((v - sLo) / (sHi - sLo)) * (S1 - S0);

  // Fondo: previsión y ventana (debajo de todo)
  const hoyI = iDe(hoy);
  if (hoyI < n - 1) {
    const x0 = IZQ + (Math.max(0, hoyI) + 1) * slot;
    el('rect', { x: x0, y: T0 - 14, width: W - DER - x0, height: FONDO - T0 + 14, fill: '#000', 'fill-opacity': 0.06 }, svg);
    el('text', { x: W - DER - 2, y: T0 - 4, 'text-anchor': 'end', 'font-size': 12, fill: TINTA_2 }, svg, 'previsión');
  }
  if (ventana) {
    const a = Math.max(0, iDe(ventana.desde)), b = Math.min(n - 1, iDe(ventana.hasta));
    if (b >= a) {
      const x0 = IZQ + a * slot, x1 = IZQ + (b + 1) * slot;
      for (const [y0, y1] of [[T0, T1], [L0, L1], ...(conSuelo ? [[S0, S1]] : [])]) {
        el('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, fill: COLORES_GRAFICO.ventana, 'fill-opacity': 0.14 }, svg);
      }
      el('rect', { x: x0, y: FONDO + 2, width: x1 - x0, height: 4, rx: 2, fill: COLORES_GRAFICO.ventana }, svg);
      // Etiqueta dentro de la banda, bajo el título (la de «previsión» va encima): halo blanco para leerse sobre las líneas.
      el('text', { x: Math.min(x0 + 3, W - DER - 70), y: T0 + 13, 'font-size': 12, fill: TINTA, 'font-weight': 700,
        stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke' }, svg, ventana.etiqueta);
    }
  }

  // Rejilla y ejes (recesivos)
  const ejes = el('g', { 'font-size': 12, fill: TINTA_2 }, svg);
  for (let v = tLo; v <= tHi + 1e-9; v += pT) {
    el('line', { x1: IZQ, x2: W - DER, y1: yT(v), y2: yT(v), stroke: REJILLA, 'stroke-width': 1 }, ejes);
    el('text', { x: IZQ - 4, y: yT(v) + 4, 'text-anchor': 'end' }, ejes, `${v}°`);
  }
  for (let v = 0; v <= lHi + 1e-9; v += pL) {
    el('line', { x1: IZQ, x2: W - DER, y1: yL(v), y2: yL(v), stroke: v === 0 ? '#9a968c' : REJILLA, 'stroke-width': 1 }, ejes);
    el('text', { x: IZQ - 4, y: yL(v) + 4, 'text-anchor': 'end' }, ejes, String(v));
  }
  if (conSuelo) {
    for (const v of [sLo, sHi]) {
      el('line', { x1: IZQ, x2: W - DER, y1: yS(v), y2: yS(v), stroke: REJILLA, 'stroke-width': 1 }, ejes);
      el('text', { x: IZQ - 4, y: yS(v) + 4, 'text-anchor': 'end' }, ejes, v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    }
    el('text', { x: IZQ, y: S0 - 6, 'font-size': 13, fill: TINTA, 'font-weight': 700 }, svg, 'Humedad del suelo (m³/m³)');
  }
  el('text', { x: IZQ, y: T0 - 4, 'font-size': 13, fill: TINTA, 'font-weight': 700 }, svg, 'Temperatura (°C)');
  el('text', { x: IZQ, y: L0 - 6, 'font-size': 13, fill: TINTA, 'font-weight': 700 }, svg, 'Lluvia (mm/día)');
  for (let i = 0; i < n; i++) {
    const rel = i - hoyI;
    if (rel % 7 !== 0 || rel === 0) continue;
    el('text', { x: x(i), y: FONDO + 22, 'text-anchor': 'middle', 'font-size': 12, fill: TINTA_2 }, svg, ddmm(serie[i].fecha));
  }

  // Lluvia: columnas finas que crecen desde la base, con hueco entre ellas
  const anchoB = Math.max(2, Math.min(24, slot - 2));
  serie.forEach((d, i) => {
    if (!(d.lluvia > 0)) return;
    const h = Math.max(1.5, L1 - yL(d.lluvia)), r = Math.min(2, anchoB / 2, h / 2), x0 = x(i) - anchoB / 2;
    el('path', { d: `M${x0},${L1} v${-(h - r)} q0,${-r} ${r},${-r} h${anchoB - 2 * r} q${r},0 ${r},${r} v${h - r} z`,
      fill: COLORES_GRAFICO.lluvia }, svg);
  });

  // Temperaturas: líneas de 2 px con etiqueta directa al final
  for (const [clave, nombre] of [['tmax', 'máx'], ['tmin', 'mín']] as const) {
    const pts = serie.map((d, i) => [x(i), yT(d[clave])] as const).filter(([, y]) => Number.isFinite(y));
    el('path', { d: pts.map(([px, py], k) => `${k ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(''), fill: 'none',
      stroke: COLORES_GRAFICO[clave], 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    const [ux, uy] = pts[pts.length - 1] ?? [0, 0];
    el('circle', { cx: ux, cy: uy, r: 4, fill: COLORES_GRAFICO[clave], stroke: '#fff', 'stroke-width': 2 }, svg);
    el('text', { x: ux + 7, y: uy + 4, 'font-size': 12, fill: TINTA, 'font-weight': 600 }, svg, nombre);
  }

  // Humedad del suelo: una línea de 2 px en su propio panel
  if (conSuelo) {
    const pts = serie.map((d, i) => [x(i), Number.isFinite(d.suelo) ? yS(d.suelo as number) : NaN] as const).filter(([, y]) => Number.isFinite(y));
    el('path', { d: pts.map(([px, py], k) => `${k ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(''), fill: 'none', class: 'linea-suelo',
      stroke: COLORES_GRAFICO.suelo, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    const [ux, uy] = pts[pts.length - 1];
    el('circle', { cx: ux, cy: uy, r: 4, fill: COLORES_GRAFICO.suelo, stroke: '#fff', 'stroke-width': 2 }, svg);
  }

  // Hoy
  if (hoyI >= 0 && hoyI < n) {
    el('line', { x1: x(hoyI), x2: x(hoyI), y1: T0 - 14, y2: FONDO, stroke: TINTA, 'stroke-width': 1.5 }, svg);
    el('text', { x: x(hoyI), y: FONDO + 22, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: TINTA }, svg, 'hoy');
  }

  // Capa de toque: un objetivo por día, más ancho que la columna; cruz vertical en el día señalado
  const cruz = el('line', { y1: T0 - 14, y2: FONDO, stroke: TINTA, 'stroke-width': 1, 'stroke-dasharray': '0', visibility: 'hidden' }, svg);
  const señalar = (i: number) => {
    cruz.setAttribute('x1', String(x(i))); cruz.setAttribute('x2', String(x(i))); cruz.setAttribute('visibility', 'visible');
    alDato(textoDia(serie[i], hoy));
  };
  const toque = el('rect', { x: IZQ, y: 0, width: W - IZQ - DER, height: H, fill: 'transparent', class: 'grafico-toque' }, svg);
  const indice = (ev: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const vx = ((ev.clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(n - 1, Math.floor((vx - IZQ) / slot)));
  };
  toque.addEventListener('pointermove', (ev) => señalar(indice(ev as PointerEvent)));
  toque.addEventListener('pointerdown', (ev) => señalar(indice(ev as PointerEvent)));
  alDato(textoDia(serie[Math.max(0, Math.min(n - 1, hoyI))], hoy));
  return svg;
}
