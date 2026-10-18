// Mapa del Top en la pestaña Hoy (2026-10-18): botón «Ver en el mapa» bajo «Los 10 mejores por seta» que abre un
// mini-mapa (minimapa.ts) con los sitios del listado tal como está en pantalla (día + filtro seta/grupo + orden), un
// marcador numerado por sitio con el color de su semáforo y, al tocarlo, una tarjeta con la seta o setas, la
// puntuación, la razón (razones.ts), el acceso, la titularidad y los botones de Google Maps, «Ir al sitio» y
// «Ruta a pie». Se repinta solo cuando cambia el listado.
import './campo.css';
import type { MapMouseEvent } from 'maplibre-gl';
import type { ManifestApp } from './manifest-region';
import { miniatura, avisarRepintadoTop, topActualMapa } from './hoy-ui';
import { textoAcceso, urlSitioGoogle } from './exportar-dia';
import { detallesTitularidad, normaTitularidad, textoTitularidad } from './titularidad';
import { NOMBRE_ESTADO } from './zona';
import { NOMBRE_DIFICULTAD } from './ruta';
import * as Mini from './minimapa';

export interface ContextoHoyMapa {
  manifest: () => ManifestApp | null;
  abrirEnlace: (url: string) => void;
  irAlSitio: (lat: number, lon: number, titulo: string) => void;
  rutaAPie: (lat: number, lon: number) => void;
  /** Guardar el sitio en Mis sitios. */
  guardar?: (lat: number, lon: number, titulo: string) => void;
}

type SitioMapa = ReturnType<typeof topActualMapa>['sitios'][number];

let ctx: ContextoHoyMapa;
let sel: number | null = null;
let sitios: SitioMapa[] = [];
let conClic = false;
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const abierto = () => !$('#hoy-mapa').hidden;

function boton(texto: string, f: () => void, clase = 'btn') {
  const b = document.createElement('button'); b.type = 'button'; b.className = clase; b.textContent = texto; b.onclick = f;
  return b;
}

function tarjeta() {
  const t = $('#hm-tarjeta');
  const s = sitios.find((x) => x.pos === sel);
  t.replaceChildren();
  t.hidden = !s;
  if (!s) return;
  t.dataset.pos = String(s.pos); t.dataset.estado = s.estado;
  const cab = document.createElement('div'); cab.className = 'hm-cab';
  const minis = document.createElement('span'); minis.className = 'tf-minis';
  for (const e of s.especies.slice(0, 2)) minis.append(miniatura(e));
  const tit = document.createElement('div'); tit.className = 'hm-tit';
  const n = document.createElement('b'); n.textContent = `${s.pos}. ${s.nombres.join(' · ')}`;
  const est = document.createElement('span'); est.className = 'tf-estado chip-estado'; est.dataset.estado = s.estado; est.textContent = NOMBRE_ESTADO[s.estado];
  tit.append(n, est);
  const x = boton('', () => { sel = null; pintar(false); }, 'btn-x');
  x.setAttribute('aria-label', 'Cerrar la tarjeta'); x.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-cerrar"/></svg>';
  cab.append(minis, tit, x);
  const p = (clase: string, texto: string) => { const e = document.createElement('p'); e.className = clase; e.textContent = texto; return e; };
  const pts = p('hm-puntos', `Puntuación del día: ${s.puntuacion} de 100 · ${NOMBRE_DIFICULTAD[s.dificultad]}${s.lejania ? ` · ${s.lejania}` : ''}`);
  const rz = p('tf-razon hm-razon', s.porque);
  const acc = p('hm-acceso', `Acceso: ${textoAcceso(s)}`);
  const ti = p('chip-titularidad tf-titularidad hm-titularidad', textoTitularidad(s.titularidad));
  ti.dataset.clase = s.titularidad.clase; ti.title = [...detallesTitularidad(s.titularidad), normaTitularidad()].join(' ');
  t.append(cab, pts, rz, acc, ti);
  if (s.restriccion) t.append(p('chip-restriccion tf-restr', s.restriccion));
  const bs = document.createElement('div'); bs.className = 'hm-acciones';
  const titulo = s.nombres.join(' · ');
  bs.append(boton('Google Maps', () => ctx.abrirEnlace(urlSitioGoogle(s)), 'btn btn-primario hm-google'),
    boton('Navegar aquí', () => ctx.irAlSitio(s.lat, s.lon, titulo), 'btn hm-navegar'),
    boton('Ruta a pie', () => ctx.rutaAPie(s.lat, s.lon), 'btn hm-ruta'));
  if (ctx.guardar) bs.append(boton('Guardar', () => ctx.guardar!(s.lat, s.lon, titulo), 'btn hm-guardar'));
  t.append(bs);
}

function pintar(encuadrar: boolean) {
  const d = topActualMapa();
  sitios = d.sitios;
  if (sel !== null && !sitios.some((s) => s.pos === sel)) sel = null;
  $('#hm-titulo').textContent = sitios.length ? `${sitios.length} ${sitios.length === 1 ? 'sitio' : 'sitios'} · ${d.filtro} · ${d.fecha.slice(8, 10)}/${d.fecha.slice(5, 7)}`
    : 'No hay sitios con estos filtros.';
  Mini.datos('top-hoy', { type: 'FeatureCollection', features: sitios.map((s) => ({ type: 'Feature', properties: { pos: s.pos, estado: s.estado, sel: s.pos === sel },
    geometry: { type: 'Point', coordinates: [s.lon, s.lat] } })) });
  $('#hoy-mapa').dataset.n = String(sitios.length);
  tarjeta();
  const m = Mini.mapaListo();
  if (!m || !encuadrar || !sitios.length) return;
  const lons = sitios.map((s) => s.lon), lats = sitios.map((s) => s.lat);
  m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 36, maxZoom: 14, duration: 0 });
}

async function abrir() {
  const sec = $('#hoy-mapa'), bt = $('#hoy-ver-mapa');
  if (abierto()) { sec.hidden = true; bt.setAttribute('aria-expanded', 'false'); Mini.datos('top-hoy', { type: 'FeatureCollection', features: [] }); return; }
  sec.hidden = false; bt.setAttribute('aria-expanded', 'true');
  Mini.ponerEn($('#hm-hueco'));
  pintar(false);
  const m = await Mini.miniMapa(ctx.manifest());
  if (!m) { $('#hm-titulo').textContent = 'No se pudo cargar el mapa.'; return; }
  if (!conClic) {
    conClic = true;
    m.on('click', 'top-hoy', (ev: MapMouseEvent & { features?: { properties: Record<string, unknown> }[] }) => {
      const pos = Number(ev.features?.[0]?.properties?.pos);
      if (!Number.isFinite(pos) || !abierto() || document.body.dataset.ir) return;
      sel = pos; pintar(false);
    });
    m.on('mouseenter', 'top-hoy', () => { m.getCanvas().style.cursor = 'pointer'; });
    m.on('mouseleave', 'top-hoy', () => { m.getCanvas().style.cursor = ''; });
  }
  Mini.alCargar(() => pintar(true));
}

/** Selecciona el sitio `pos` del mapa del Top (para el e2e y para teclado). */
export function elegirEnMapaTop(pos: number) { sel = pos; pintar(false); }

export function iniciarHoyMapa(c: ContextoHoyMapa) {
  ctx = c;
  const sec = $('#hoy-mapa');
  sec.innerHTML = `<p id="hm-titulo" class="nota hm-titulo" role="status"></p>
    <div id="hm-hueco" class="hm-hueco"></div>
    <p class="nota hm-leyenda" aria-hidden="true"><span data-estado="verde"></span>${NOMBRE_ESTADO.verde}<span data-estado="amarillo"></span>${NOMBRE_ESTADO.amarillo}<span data-estado="rojo"></span>${NOMBRE_ESTADO.rojo}<span data-estado="gris"></span>${NOMBRE_ESTADO.gris}</p>
    <div id="hm-tarjeta" class="hm-tarjeta" role="region" aria-live="polite" aria-label="Sitio elegido" hidden></div>`;
  $('#hoy-ver-mapa').addEventListener('click', abrir);
  avisarRepintadoTop(() => { if (abierto()) pintar(true); });
  // Al cerrar «Ir al sitio», el mini-mapa vuelve aquí si el mapa del Top está abierto.
  document.querySelector('#dlg-ir')?.addEventListener('close', () => {
    if (!abierto()) return;
    Mini.ponerEn($('#hm-hueco'));
    Mini.alCargar(() => pintar(true));
  });
}
