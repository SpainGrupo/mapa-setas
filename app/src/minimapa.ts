// Una sola instancia de mini-mapa (mapa.ts crearMiniMapa) para el mapa del Top de Hoy y la vista «Ir al sitio»: su
// contenedor se mueve al hueco que lo enseña (MapLibre sigue con el mismo WebGL; basta resize()). Carga MapLibre
// solo la primera vez que se pide. Capas propias: los sitios del Top (top-hoy) y la línea de ti al sitio (ir).
import type { Map as MapaML, GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import type { ManifestApp } from './manifest-region';
import { COLOR_ESTADO } from './zona';

let promesa: Promise<MapaML | null> | null = null;
let mapa: MapaML | null = null;
const alCrearse: ((m: MapaML) => void)[] = [];
/** Llama a `f` cuando se cree el mini-mapa (o ya, si existe). */
export function alCrear(f: (m: MapaML) => void) { if (mapa) f(mapa); else alCrearse.push(f); }
const caja = document.createElement('div');
caja.className = 'minimapa';
caja.id = 'minimapa';
const pendientes = new Map<string, FeatureCollection>();
const VACIO: FeatureCollection = { type: 'FeatureCollection', features: [] };

function capas(m: MapaML) {
  m.addSource('top-hoy', { type: 'geojson', data: pendientes.get('top-hoy') ?? VACIO });
  m.addSource('ir', { type: 'geojson', data: pendientes.get('ir') ?? VACIO });
  m.addSource('campo', { type: 'geojson', data: pendientes.get('campo') ?? VACIO });
  m.addLayer({ id: 'ir-sendero-fondo', type: 'line', source: 'ir', filter: ['==', ['get', 'tipo'], 'sendero'],
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 8 } });
  m.addLayer({ id: 'ir-sendero', type: 'line', source: 'ir', filter: ['==', ['get', 'tipo'], 'sendero'],
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#1565c0', 'line-width': 5 } });
  m.addLayer({ id: 'ir-linea', type: 'line', source: 'ir', filter: ['==', ['get', 'tipo'], 'linea'],
    layout: { 'line-cap': 'round' }, paint: { 'line-color': '#b23a0b', 'line-width': 3, 'line-dasharray': [1.5, 1.5] } });
  m.addLayer({ id: 'top-hoy', type: 'circle', source: 'top-hoy', paint: {
    'circle-radius': ['case', ['boolean', ['get', 'sel'], false], 15, 12],
    'circle-color': ['match', ['get', 'estado'], 'verde', COLOR_ESTADO.verde, 'amarillo', COLOR_ESTADO.amarillo, 'rojo', COLOR_ESTADO.rojo, COLOR_ESTADO.gris],
    'circle-stroke-color': ['case', ['boolean', ['get', 'sel'], false], '#0d1a13', '#ffffff'], 'circle-stroke-width': 3 } });
  m.addLayer({ id: 'top-hoy-num', type: 'symbol', source: 'top-hoy', layout: { 'text-field': ['to-string', ['get', 'pos']],
    'text-font': ['Noto Sans Medium'], 'text-size': 13, 'text-allow-overlap': true, 'text-ignore-placement': true },
    paint: { 'text-color': '#0d1a13' } });
  // Modo campo (campo-ui.ts): círculo de búsqueda, ruta a pie por el terreno (campo-ruta.ts), iconos de la seta en las
  // microzonas y número de cada una.
  m.addLayer({ id: 'campo-ruta-fondo', type: 'line', source: 'campo', filter: ['==', ['get', 'tipo'], 'ruta'],
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 8 } });
  m.addLayer({ id: 'campo-ruta', type: 'line', source: 'campo', filter: ['==', ['get', 'tipo'], 'ruta'],
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#7a4a12', 'line-width': 4 } });
  m.addLayer({ id: 'campo-radio', type: 'line', source: 'campo', filter: ['==', ['get', 'tipo'], 'radio'],
    paint: { 'line-color': '#1565c0', 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': 0.7 } });
  m.addLayer({ id: 'campo-yo', type: 'circle', source: 'campo', filter: ['==', ['get', 'tipo'], 'yo'], paint: {
    'circle-radius': 9, 'circle-color': '#1565c0', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
  m.addLayer({ id: 'campo-iconos', type: 'symbol', source: 'campo', filter: ['==', ['get', 'tipo'], 'micro'], layout: {
    'icon-image': ['get', 'icono'], 'icon-size': ['case', ['boolean', ['get', 'sel'], false], 0.62, 0.5],
    'icon-allow-overlap': true, 'icon-ignore-placement': true,
    'text-field': ['to-string', ['get', 'n']], 'text-font': ['Noto Sans Medium'], 'text-size': 12, 'text-offset': [1.1, -1.1],
    'text-allow-overlap': true, 'text-ignore-placement': true },
  paint: { 'text-color': '#0d1a13', 'text-halo-color': '#ffffff', 'text-halo-width': 2 } });
  m.addLayer({ id: 'ir-destino', type: 'circle', source: 'ir', filter: ['==', ['get', 'tipo'], 'destino'], paint: {
    'circle-radius': 11, 'circle-color': '#b23a0b', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
  m.addLayer({ id: 'ir-yo', type: 'circle', source: 'ir', filter: ['==', ['get', 'tipo'], 'yo'], paint: {
    'circle-radius': 9, 'circle-color': '#1565c0', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
}

/** El mini-mapa (lo crea la primera vez); null sin manifest o si MapLibre no carga. */
export function miniMapa(manifest: ManifestApp | null): Promise<MapaML | null> {
  if (!manifest) return Promise.resolve(null);
  promesa ??= import('./mapa').then((M) => {
    if (!caja.isConnected) document.body.append(caja);   // MapLibre necesita medidas al crearse
    const m = M.crearMiniMapa(caja, manifest);
    m.once('load', () => { capas(m); document.body.dataset.minimapa = 'listo'; });
    mapa = m;
    alCrearse.forEach((f) => f(m));
    return m;
  }).catch((e) => { console.warn('mini-mapa', e); promesa = null; return null; });
  return promesa;
}

export const mapaListo = () => (mapa && mapa.getSource('top-hoy') ? mapa : null);

/** Pone el mini-mapa en el hueco `hueco` (lo saca de donde estuviera). */
export function ponerEn(hueco: HTMLElement) {
  if (caja.parentElement !== hueco) hueco.append(caja);
  requestAnimationFrame(() => mapa?.resize());
}

/** Datos de una de sus fuentes (se guardan hasta que el estilo cargue). */
export function datos(fuente: 'top-hoy' | 'ir' | 'campo', fc: FeatureCollection) {
  pendientes.set(fuente, fc);
  (mapa?.getSource(fuente) as GeoJSONSource | undefined)?.setData(fc);
}

/** Llama a `f` cuando el mini-mapa tenga el estilo y sus capas (o ya). */
export function alCargar(f: (m: MapaML) => void) {
  if (mapaListo()) { f(mapa!); return; }
  mapa?.once('load', () => queueMicrotask(() => f(mapa!)));
}
