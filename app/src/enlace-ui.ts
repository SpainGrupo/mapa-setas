// Puntos que llegan por enlace (enlaces.ts): ?ir=lat,lon&n=…&nota=… o ?pts=lat,lon,nombre;… (también en el hash).
// Se pintan en el mapa principal y se abre una hoja con cada punto y sus botones «Navegar aquí» y «Guardar en Mis
// sitios». El enlace se quita de la URL al leerlo, para que recargar no lo vuelva a abrir.
import './campo.css';
import type { Map as MapaML, GeoJSONSource, MapMouseEvent } from 'maplibre-gl';
import { dentroDe, parsearEnlace, urlSinEnlace, type PuntoEnlace } from './enlaces';

export interface ContextoEnlace {
  mapa: () => MapaML | null;
  bbox: () => [number, number, number, number] | null;
  nombreRegion: () => string;
  navegar: (p: PuntoEnlace) => void;
  guardar: (p: PuntoEnlace) => Promise<'guardado' | 'ya'>;
  irA: (pantalla: string) => void;
}

let ctx: ContextoEnlace;
let puntos: PuntoEnlace[] = [];
let dlg: HTMLDialogElement;
let conCapa = false;

function boton(texto: string, f: () => void, clase = 'btn') {
  const b = document.createElement('button'); b.type = 'button'; b.className = clase; b.textContent = texto; b.onclick = f;
  return b;
}

function pintarHoja(solo?: number) {
  const ul = dlg.querySelector('#en-lista')!;
  ul.replaceChildren();
  const caja = ctx.bbox();
  const lista = solo === undefined ? puntos.map((p, i) => [p, i] as const) : [[puntos[solo], solo] as const];
  dlg.querySelector('#en-titulo')!.textContent = puntos.length === 1 ? 'Punto recibido' : `${puntos.length} puntos recibidos`;
  for (const [p, i] of lista) {
    const li = document.createElement('li'); li.className = 'sitio en-punto'; li.dataset.i = String(i);
    const t = document.createElement('div'); t.className = 'meta'; t.textContent = `${puntos.length > 1 ? `${i + 1}. ` : ''}${p.nombre || 'Punto sin nombre'}`;
    const c = document.createElement('div'); c.className = 'acceso'; c.textContent = `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
    li.append(t, c);
    if (p.nota) { const n = document.createElement('div'); n.className = 'txt'; n.textContent = p.nota; li.append(n); }
    if (caja && !dentroDe(p, caja)) {
      const f = document.createElement('div'); f.className = 'txt chip-restriccion en-fuera';
      f.textContent = `Fuera de la región activa (${ctx.nombreRegion()}): el mapa no llega; cambia de región en Ajustes si la tienes.`;
      li.append(f);
    }
    const estado = document.createElement('p'); estado.className = 'nota en-estado'; estado.setAttribute('role', 'status');
    const acc = document.createElement('div'); acc.className = 'acciones';
    acc.append(boton('Navegar aquí', () => { dlg.close(); ctx.navegar(p); }, 'btn btn-primario en-navegar'),
      boton('Guardar en Mis sitios', async () => {
        const r = await ctx.guardar(p).catch(() => null);
        estado.textContent = r === 'guardado' ? 'Guardado en Mis sitios.' : r === 'ya' ? 'Ya estaba en Mis sitios.' : 'No se pudo guardar.';
      }, 'btn en-guardar'),
      boton('Ver', () => { dlg.close(); centrar([p]); }, 'btn en-ver'));
    li.append(acc, estado);
    ul.append(li);
  }
  if (!dlg.open) dlg.showModal();
}

function centrar(ps: PuntoEnlace[]) {
  const m = ctx.mapa();
  if (!m || !ps.length) return;
  ctx.irA('p-mapa');
  if (ps.length === 1) { m.jumpTo({ center: [ps[0].lon, ps[0].lat], zoom: Math.max(m.getZoom(), 14) }); return; }
  const lons = ps.map((p) => p.lon), lats = ps.map((p) => p.lat);
  m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 60, maxZoom: 14, duration: 0 });
}

function capa(m: MapaML) {
  const fc = { type: 'FeatureCollection' as const, features: puntos.map((p, i) => ({ type: 'Feature' as const, properties: { i, n: i + 1 },
    geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] } })) };
  const src = m.getSource('enlace') as GeoJSONSource | undefined;
  if (src) { src.setData(fc); return; }
  m.addSource('enlace', { type: 'geojson', data: fc });
  m.addLayer({ id: 'enlace', type: 'circle', source: 'enlace', paint: { 'circle-radius': 11, 'circle-color': '#6a1b9a', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
  m.addLayer({ id: 'enlace-num', type: 'symbol', source: 'enlace', layout: { 'text-field': ['to-string', ['get', 'n']], 'text-font': ['Noto Sans Medium'],
    'text-size': 12, 'text-allow-overlap': true }, paint: { 'text-color': '#ffffff' } });
  if (!conCapa) {
    conCapa = true;
    m.on('click', 'enlace', (ev: MapMouseEvent & { features?: { properties: Record<string, unknown> }[] }) => {
      const i = Number(ev.features?.[0]?.properties?.i);
      if (Number.isFinite(i) && puntos[i]) pintarHoja(i);
    });
  }
}

/** Lee el enlace de la URL; si trae puntos, los pinta en el mapa (ya cargado) y abre la hoja. */
export function abrirEnlaceDeUrl(search = location.search, hash = location.hash): number {
  const e = parsearEnlace(search, hash);
  if (!e.puntos.length) return 0;
  puntos = e.puntos;
  try { history.replaceState(history.state, '', urlSinEnlace(location.href)); } catch { /* sin history */ }
  const m = ctx.mapa();
  if (m) { capa(m); centrar(puntos); }
  pintarHoja();
  document.body.dataset.enlace = String(puntos.length);
  return puntos.length;
}

/** Puntos que recibió la app (para e2e). */
export const puntosEnlace = () => puntos;

export function iniciarEnlace(c: ContextoEnlace) {
  ctx = c;
  dlg = document.createElement('dialog');
  dlg.id = 'dlg-enlace'; dlg.className = 'dlg dlg-hoja';
  dlg.innerHTML = `<h2 id="en-titulo">Punto recibido</h2>
    <p class="nota">Un enlace te ha enviado estos puntos. Que salgan aquí no dice nada de si se puede recoger ni de si una seta se puede consumir.</p>
    <ul id="en-lista" class="lista"></ul>
    <form method="dialog"><button class="btn btn-ancho" value="ok">Cerrar</button></form>`;
  document.body.append(dlg);
  window.addEventListener('hashchange', () => abrirEnlaceDeUrl());
}
