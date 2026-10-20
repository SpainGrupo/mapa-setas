// Perfil de altura de la ruta a pie (SVG propio, sin librería). Una sola serie: área suave con línea de 2 px, ejes
// recesivos, etiquetas directas en la salida, el punto y la cota más alta, y cruz al tocar. Pensado para leerse al sol:
// tinta oscura, texto de 12–14 px y nada que dependa solo del color.
import type { Perfil } from './ruta';
import { textoDistancia } from './ruta';
import { pasoLimpio } from './grafico';

const NS = 'http://www.w3.org/2000/svg';
export const COLOR_PERFIL = '#7a4a12';
const TINTA = '#111', TINTA_2 = '#3d3d3a', REJILLA = '#d9d6cf';
const W = 360, H = 150, IZQ = 40, DER = 14, ARR = 24, ABA = 120;

function el<K extends keyof SVGElementTagNameMap>(tag: K, at: Record<string, string | number>, padre?: Element, texto?: string) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(at)) e.setAttribute(k, String(v));
  if (texto != null) e.textContent = texto;
  padre?.append(e);
  return e;
}
const m = (v: number) => `${Math.round(v).toLocaleString('es-ES')} m`;

/** Textos del gráfico; por defecto, la ruta a pie del coche al punto. */
export interface TextosPerfil { titulo: string; marcaInicio: string; desde: string; aria: string }
const TEXTOS_COCHE: TextosPerfil = { titulo: 'Altura (m) · del coche al punto', marcaInicio: 'P ', desde: 'del coche', aria: 'en el coche' };

/** Dibuja el perfil en `contenedor`; `alDato` recibe el texto del punto tocado. Sin altitudes deja un aviso. */
export function pintarPerfil(contenedor: HTMLElement, p: Perfil, alDato: (t: string) => void, tx: TextosPerfil = TEXTOS_COCHE) {
  contenedor.replaceChildren();
  const idx = p.alt.map((a, i) => (Number.isFinite(a) ? i : -1)).filter((i) => i >= 0);
  if (idx.length < 2 || !(p.total_m > 0)) {
    const n = document.createElement('p'); n.className = 'nota'; n.textContent = 'Sin datos de altura para esta ruta.';
    contenedor.append(n); alDato(''); return null;
  }
  const paso = pasoLimpio(Math.max(20, p.max - p.min), 3);
  const lo = Math.floor(p.min / paso) * paso, hi = Math.max(lo + paso, Math.ceil(p.max / paso) * paso);
  const x = (d: number) => IZQ + (d / p.total_m) * (W - IZQ - DER);
  const y = (a: number) => ABA - ((a - lo) / (hi - lo)) * (ABA - ARR);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', class: 'perfil-svg',
    'aria-label': `Perfil de altura: de ${m(p.alt[idx[0]])} ${tx.aria} a ${m(p.alt[idx[idx.length - 1]])} en el punto, máximo ${m(p.max)}, ${textoDistancia(p.total_m)}` }, contenedor);

  const ejes = el('g', { 'font-size': 12, fill: TINTA_2 }, svg);
  for (let v = lo; v <= hi + 1e-9; v += paso) {
    el('line', { x1: IZQ, x2: W - DER, y1: y(v), y2: y(v), stroke: v === lo ? '#9a968c' : REJILLA, 'stroke-width': 1 }, ejes);
    el('text', { x: IZQ - 4, y: y(v) + 4, 'text-anchor': 'end' }, ejes, `${v}`);
  }
  const pk = pasoLimpio(p.total_m, 3);
  for (let d = 0; d <= p.total_m + 1e-9; d += pk) {
    el('text', { x: x(d), y: ABA + 18, 'text-anchor': d === 0 ? 'start' : 'middle', 'font-size': 12, fill: TINTA_2 }, svg,
      d === 0 ? '0' : textoDistancia(d));
  }
  el('text', { x: IZQ, y: ARR - 8, 'font-size': 13, fill: TINTA, 'font-weight': 700 }, svg, tx.titulo);

  const pts = idx.map((i) => [x(p.dist[i]), y(p.alt[i])] as const);
  const linea = pts.map(([px, py], k) => `${k ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
  el('path', { d: `${linea}L${pts[pts.length - 1][0].toFixed(1)},${ABA}L${pts[0][0].toFixed(1)},${ABA}Z`, fill: COLOR_PERFIL, 'fill-opacity': 0.16 }, svg);
  el('path', { d: linea, fill: 'none', stroke: COLOR_PERFIL, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'linea-perfil' }, svg);

  // Etiquetas directas: coche (P), punto y cota más alta (si no coincide con un extremo).
  const marca = (i: number, texto: string, ancla: string, debajo = false) => {
    const [px, py] = [x(p.dist[i]), y(p.alt[i])];
    el('circle', { cx: px, cy: py, r: 5, fill: COLOR_PERFIL, stroke: '#fff', 'stroke-width': 2 }, svg);
    el('text', { x: px + (ancla === 'start' ? 6 : ancla === 'end' ? -6 : 0), y: debajo ? Math.min(ABA - 4, py + 20) : Math.max(13, py - 9), 'text-anchor': ancla, 'font-size': 13, 'font-weight': 700,
      fill: TINTA, stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke' }, svg, texto);
  };
  const i0 = idx[0], i1 = idx[idx.length - 1];
  const iMax = idx.reduce((a, i) => (p.alt[i] > p.alt[a] ? i : a), i0);
  const conMax = iMax !== i0 && iMax !== i1 && p.alt[iMax] - Math.max(p.alt[i0], p.alt[i1]) >= paso / 4;
  // Etiquetas que chocarían (a menos de 90 px en horizontal): la del final va debajo de la línea.
  const cerca = (a: number, b: number) => Math.abs(x(p.dist[a]) - x(p.dist[b])) < 90;
  marca(i0, `${tx.marcaInicio}${m(p.alt[i0])}`, 'start', conMax && cerca(i0, iMax));
  marca(i1, m(p.alt[i1]), 'end', conMax && cerca(i1, iMax));
  if (conMax) marca(iMax, `máx. ${m(p.alt[iMax])}`, 'middle');

  // Toque: cruz vertical y dato del punto más cercano
  const cruz = el('line', { y1: ARR, y2: ABA, stroke: TINTA, 'stroke-width': 1, visibility: 'hidden' }, svg);
  const punto = el('circle', { r: 5, fill: '#fff', stroke: TINTA, 'stroke-width': 2, visibility: 'hidden' }, svg);
  const texto = (i: number) => `A ${textoDistancia(p.dist[i])} ${tx.desde}: ${m(p.alt[i])} de altura`;
  const señalar = (vx: number) => {
    const d = ((vx - IZQ) / (W - IZQ - DER)) * p.total_m;
    const i = idx.reduce((a, k) => (Math.abs(p.dist[k] - d) < Math.abs(p.dist[a] - d) ? k : a), idx[0]);
    for (const [k, v] of [['x1', x(p.dist[i])], ['x2', x(p.dist[i])]] as const) cruz.setAttribute(k, String(v));
    punto.setAttribute('cx', String(x(p.dist[i]))); punto.setAttribute('cy', String(y(p.alt[i])));
    cruz.setAttribute('visibility', 'visible'); punto.setAttribute('visibility', 'visible');
    alDato(texto(i));
  };
  const toque = el('rect', { x: IZQ, y: 0, width: W - IZQ - DER, height: H, fill: 'transparent', class: 'perfil-toque' }, svg);
  const vx = (ev: PointerEvent) => { const r = svg.getBoundingClientRect(); return ((ev.clientX - r.left) / r.width) * W; };
  toque.addEventListener('pointermove', (ev) => señalar(vx(ev as PointerEvent)));
  toque.addEventListener('pointerdown', (ev) => señalar(vx(ev as PointerEvent)));
  alDato(`Sube ${m(p.subida_m)} y baja ${m(p.bajada_m)} a lo largo del perfil. Toca el gráfico para ver cada punto.`);
  return svg;
}
