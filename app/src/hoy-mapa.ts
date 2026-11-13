// Vista «Mapa» de los sitios de Hoy (2026-11-13, estilo Airbnb): el interruptor «Lista | Mapa» de «Los 10 mejores» cambia
// el listado por un mini-mapa (minimapa.ts) con una chincheta-etiqueta por sitio —«≈ 62 %» con el color de su
// semáforo— y, debajo, un carrusel horizontal de tarjetas con scroll-snap. Tocar una chincheta la resalta y lleva el
// carrusel a su tarjeta; deslizar el carrusel resalta la chincheta de la tarjeta que queda en el centro y centra el
// mapa en ella. Cada tarjeta trae los minutos en coche (coche-ui.ts) y «Cómo llegar en coche».
// Los sitios son los del listado tal como está en pantalla (día + filtro seta/grupo + «Por seta»/«Por sitio» + orden) y
// se repinta solo cuando cambia. Ni la chincheta ni la tarjeta dicen que una seta sea comestible.
import './campo.css';
import type { Map as MapaML, Marker } from 'maplibre-gl';
import type { ManifestApp } from './manifest-region';
import { miniatura, avisarRepintadoTop, topActualMapa } from './hoy-ui';
import { detallesTitularidad, normaTitularidad, textoTitularidad } from './titularidad';
import { AYUDA_PROBABILIDAD, NOMBRE_ESTADO, textoEstado } from './zona';
import { textoProbabilidad } from './semaforo';
import { NOMBRE_DIFICULTAD } from './ruta';
import { bloqueCoche, pedir as pedirMinutos } from './coche-ui';
import * as Mini from './minimapa';

export interface ContextoHoyMapa {
  manifest: () => ManifestApp | null;
  abrirEnlace: (url: string) => void;   // (sin uso por ahora: Google Maps queda en el listado y en «Exportar día»)
  irAlSitio: (lat: number, lon: number, titulo: string) => void;
  rutaAPie: (lat: number, lon: number) => void;
  /** «Cómo llegar en coche» (Google Maps hasta el aparcamiento). */
  coche: (lat: number, lon: number) => void;
  /** Guardar el sitio en Mis sitios. */
  guardar?: (lat: number, lon: number, titulo: string) => void;
}

type SitioMapa = ReturnType<typeof topActualMapa>['sitios'][number];
export type ModoTop = 'lista' | 'mapa';

let ctx: ContextoHoyMapa;
let sel: number | null = null;
let sitios: SitioMapa[] = [];
let mapa: MapaML | null = null;
let pintando = 0;
const pines = new Map<number, Marker>();
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const abierto = () => !$('#hoy-mapa').hidden;
const sinAnimar = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function boton(texto: string, f: () => void, clase = 'btn') {
  const b = document.createElement('button'); b.type = 'button'; b.className = clase; b.textContent = texto; b.onclick = f;
  return b;
}

/** Dato clave de la chincheta: la probabilidad del semáforo («≈ 62 %»); sin ella, la puntuación del día. */
const textoPin = (s: SitioMapa) => (s.probabilidad != null ? textoProbabilidad(s.probabilidad) : `${s.puntuacion}/100`);

function tarjeta(s: SitioMapa): HTMLLIElement {
  const t = document.createElement('li'); t.className = 'hm-card'; t.dataset.pos = String(s.pos); t.dataset.estado = s.estado;
  t.setAttribute('aria-label', `Sitio ${s.pos}: ${s.nombres.join(' · ')}`);
  const cab = document.createElement('div'); cab.className = 'hm-cab';
  const minis = document.createElement('span'); minis.className = 'tf-minis';
  for (const e of s.especies.slice(0, 2)) minis.append(miniatura(e));
  const tit = document.createElement('div'); tit.className = 'hm-tit';
  const n = document.createElement('b'); n.textContent = `${s.pos}. ${s.nombres.join(' · ')}`;
  const est = document.createElement('span'); est.className = 'tf-estado chip-estado'; est.dataset.estado = s.estado; est.textContent = textoEstado(s);
  if (s.probabilidad != null) est.title = AYUDA_PROBABILIDAD;
  tit.append(n, est);
  cab.append(minis, tit);
  const p = (clase: string, texto: string) => { const e = document.createElement('p'); e.className = clase; e.textContent = texto; return e; };
  const pts = p('hm-puntos', `Puntuación del día: ${s.puntuacion} de 100 · ${NOMBRE_DIFICULTAD[s.dificultad]}`);
  const ti = p('chip-titularidad tf-titularidad hm-titularidad', textoTitularidad(s.titularidad));
  ti.dataset.clase = s.titularidad.clase; ti.title = [...detallesTitularidad(s.titularidad), normaTitularidad()].join(' ');
  t.append(cab, pts, bloqueCoche({ lat: s.lat, lon: s.lon, ap: s.ap }, () => ctx.coche(s.lat, s.lon)), ti);
  if (s.restriccion) t.append(p('chip-restriccion tf-restr', s.restriccion));
  const titulo = s.nombres.join(' · ');
  const bs = document.createElement('div'); bs.className = 'hm-acciones';
  bs.append(boton('Ruta a pie', () => ctx.rutaAPie(s.lat, s.lon), 'btn btn-primario hm-ruta'),
    boton('Navegar aquí', () => ctx.irAlSitio(s.lat, s.lon, titulo), 'btn hm-navegar'));
  if (ctx.guardar) bs.append(boton('Guardar', () => ctx.guardar!(s.lat, s.lon, titulo), 'btn hm-guardar'));
  t.append(bs);
  t.addEventListener('click', () => { if (sel !== s.pos) elegir(s.pos, 'mapa'); });
  return t;
}

function pin(s: SitioMapa): HTMLButtonElement {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'hm-pin'; b.dataset.pos = String(s.pos); b.dataset.estado = s.estado;
  b.setAttribute('aria-label', `Sitio ${s.pos}, ${textoEstado(s)}`);
  const tx = document.createElement('span'); tx.className = 'hm-pin-txt'; tx.textContent = textoPin(s);
  b.append(tx);
  b.addEventListener('click', (ev) => { ev.stopPropagation(); elegir(s.pos, 'mapa'); });
  return b;
}

const carrusel = () => $<HTMLElement>('#hm-carrusel');
const tarjetaDe = (pos: number) => carrusel().querySelector<HTMLElement>(`.hm-card[data-pos="${pos}"]`);

/** Resalta la chincheta y la tarjeta elegidas (sin mover ni el mapa ni el carrusel). */
function resaltar() {
  for (const [pos, m] of pines) {
    const el = m.getElement(), on = pos === sel;
    el.classList.toggle('sel', on); el.setAttribute('aria-pressed', String(on));
    el.style.zIndex = on ? '5' : '';
  }
  carrusel().querySelectorAll<HTMLElement>('.hm-card').forEach((c) => {
    const on = Number(c.dataset.pos) === sel;
    c.classList.toggle('sel', on); if (on) c.setAttribute('aria-current', 'true'); else c.removeAttribute('aria-current');
  });
  $('#hoy-mapa').dataset.sel = sel === null ? '' : String(sel);
}

/** Lleva el carrusel a la tarjeta `pos` (centrada). */
function irATarjeta(pos: number) {
  const c = tarjetaDe(pos), car = carrusel();
  if (!c) return;
  car.scrollTo({ left: c.offsetLeft - (car.clientWidth - c.offsetWidth) / 2, behavior: sinAnimar() ? 'auto' : 'smooth' });
}

/** Centra el mapa en el sitio, en la parte que deja libre el carrusel. */
function centrar(s: SitioMapa) {
  if (!mapa) return;
  const libre = carrusel().offsetHeight;
  mapa.easeTo({ center: [s.lon, s.lat], offset: [0, -libre / 2], duration: sinAnimar() ? 0 : 300 });
}

/** Elige el sitio `pos`. Desde una chincheta o un toque se lleva el carrusel a su tarjeta; desde el carrusel, solo se centra el mapa. */
function elegir(pos: number, origen: 'mapa' | 'tarjeta') {
  const s = sitios.find((x) => x.pos === pos);
  if (!s) return;
  sel = pos; resaltar();
  if (origen !== 'tarjeta') irATarjeta(pos);
  centrar(s);
}

/** Pone la selección en la tarjeta que queda en el centro del carrusel (al parar de deslizar). */
function alParar() {
  const car = carrusel(), r = car.getBoundingClientRect(), centro = r.left + r.width / 2;
  let mejor: HTMLElement | null = null, d = Infinity;
  car.querySelectorAll<HTMLElement>('.hm-card').forEach((c) => {
    const b = c.getBoundingClientRect(), dd = Math.abs(b.left + b.width / 2 - centro);
    if (dd < d) { d = dd; mejor = c; }
  });
  const pos = mejor ? Number((mejor as HTMLElement).dataset.pos) : NaN;
  if (Number.isFinite(pos) && pos !== sel) elegir(pos, 'tarjeta');
}

function quitarPines() { for (const m of pines.values()) m.remove(); pines.clear(); }

/** Repinta título, carrusel y chinchetas con el listado actual. `encuadrar`: ajusta el mapa a todos los sitios. */
async function pintar(encuadrar: boolean, conservar = false) {
  const mi = ++pintando;
  const d = topActualMapa();
  sitios = d.sitios;
  // Al cambiar el listado se vuelve al primero (las posiciones se renumeran); al volver de «Ir al sitio», se conserva.
  if (!conservar || !sitios.some((s) => s.pos === sel)) sel = sitios[0]?.pos ?? null;
  $('#hm-titulo').textContent = sitios.length ? `${sitios.length} ${sitios.length === 1 ? 'sitio' : 'sitios'} · ${d.filtro} · ${d.fecha.slice(8, 10)}/${d.fecha.slice(5, 7)}`
    : 'No hay sitios con estos filtros.';
  $('#hoy-mapa').dataset.n = String(sitios.length);
  carrusel().replaceChildren(...sitios.map(tarjeta));
  pedirMinutos();
  const m = mapa ?? await Mini.miniMapa(ctx.manifest());
  if (!m || mi !== pintando || !abierto()) return;
  mapa = m;
  const crear = await Mini.fabricaMarcadores();
  if (mi !== pintando) return;
  quitarPines();
  for (const s of sitios) pines.set(s.pos, crear(m, pin(s), s.lon, s.lat));
  resaltar();
  const c0 = sel === null ? null : tarjetaDe(sel);
  if (c0) carrusel().scrollLeft = c0.offsetLeft - (carrusel().clientWidth - c0.offsetWidth) / 2;
  if (!encuadrar || !sitios.length) return;
  const lons = sitios.map((s) => s.lon), lats = sitios.map((s) => s.lat);
  // El carrusel tapa la parte de abajo: se encuadra en lo que queda libre (sin pasarse, o MapLibre no encuadra nada).
  m.resize();   // el mini-mapa acaba de mudarse al hueco: que mida su tamaño de ahora antes de encuadrar
  const alto = m.getContainer().clientHeight, bajo = Math.min(carrusel().offsetHeight + 56, Math.max(60, alto - 160));
  m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
    { padding: { top: 56, bottom: bajo, left: 48, right: 48 }, maxZoom: 14, duration: 0 });
}

/** Cambia entre el listado y el mapa. */
export async function ponerModo(modo: ModoTop) {
  const sec = $('#hoy-mapa'), ul = $('#top-especie');
  document.querySelectorAll<HTMLButtonElement>('#hoy-modo button').forEach((b) => {
    const on = b.dataset.modo === modo; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('activa', on);
  });
  if (modo === 'lista') {
    sec.hidden = true; ul.hidden = false; quitarPines();
    return;
  }
  ul.hidden = true; sec.hidden = false;
  Mini.ponerEn($('#hm-hueco'));
  const m = await Mini.miniMapa(ctx.manifest());
  if (!m) { $('#hm-titulo').textContent = 'No se pudo cargar el mapa.'; return; }
  mapa = m;
  Mini.alCargar(() => { void pintar(true); });
}

/** Selecciona el sitio `pos` del mapa del Top (para el e2e y para teclado). */
export function elegirEnMapaTop(pos: number) { elegir(pos, 'mapa'); }

export function iniciarHoyMapa(c: ContextoHoyMapa) {
  ctx = c;
  const sec = $('#hoy-mapa');
  sec.innerHTML = `<p id="hm-titulo" class="nota hm-titulo" role="status"></p>
    <div class="hm-lienzo">
      <div id="hm-hueco" class="hm-hueco"></div>
      <ul id="hm-carrusel" class="hm-carrusel" aria-label="Sitios del mapa, desliza para ver el siguiente" tabindex="-1"></ul>
    </div>
    <p class="nota hm-leyenda" aria-hidden="true"><span data-estado="verde"></span>${NOMBRE_ESTADO.verde}<span data-estado="amarillo"></span>${NOMBRE_ESTADO.amarillo}<span data-estado="rojo"></span>${NOMBRE_ESTADO.rojo}<span data-estado="gris"></span>${NOMBRE_ESTADO.gris}</p>`;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  carrusel().addEventListener('scroll', () => { clearTimeout(temporizador); temporizador = setTimeout(alParar, 100); }, { passive: true });
  document.querySelectorAll<HTMLButtonElement>('#hoy-modo button').forEach((b) =>
    b.addEventListener('click', () => { void ponerModo(b.dataset.modo === 'mapa' ? 'mapa' : 'lista'); }));
  avisarRepintadoTop(() => { if (abierto()) void pintar(true); });
  // Al cerrar «Ir al sitio», el mini-mapa vuelve aquí si la vista Mapa sigue abierta.
  document.querySelector('#dlg-ir')?.addEventListener('close', () => {
    if (!abierto()) return;
    Mini.ponerEn($('#hm-hueco'));
    Mini.alCargar(() => { void pintar(true, true); });
  });
}
