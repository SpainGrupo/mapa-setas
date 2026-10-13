import * as maplibregl from 'maplibre-gl';
import urlTrabajador from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { type Map as MapaML, type MapLayerMouseEvent, type StyleSpecification, type LayerSpecification } from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';
import { layers, namedFlavor } from '@protomaps/basemaps';
import { FuenteOpfsHttp } from './fuente';
import { archivoOpfs } from './opfs';
import { BASE_DATOS } from './datos';
import type { Manifest } from './tipos';

export const ATRIBUCION = 'IGN CC BY 4.0, © MITECO MFE, IGME, REDIAM CC BY 4.0, © OpenStreetMap ODbL, Protomaps';
export const COLORES_IDONEIDAD = ['#d9f0a3', '#addd8e', '#78c679', '#41ab5d', '#238443', '#006837', '#004529'];

maplibregl.setWorkerUrl(urlTrabajador);
const protocolo = new Protocol();
maplibregl.addProtocol('pmtiles', protocolo.tile);
const fuentes = new Map<string, FuenteOpfsHttp>();

/** URL pmtiles:// de un archivo de datos; registra la Source OPFS/HTTP la primera vez. */
function pm(nombre: string): string {
  const url = BASE_DATOS + nombre;
  if (!fuentes.has(url)) {
    const f = new FuenteOpfsHttp(url, () => archivoOpfs(nombre));
    fuentes.set(url, f);
    protocolo.add(new PMTiles(f));
  }
  return 'pmtiles://' + url;
}

// Tras cambiar los archivos de OPFS (actualización o borrado) la app recarga la página (ver main.ts,
// recargarTrasCambioDeMapas): es la forma más simple de no reutilizar ningún File antiguo ni las cachés de
// cabecera/directorios de PMTiles ni las teselas que MapLibre ya tiene. Mientras se descarga, el mapa sigue
// leyendo los archivos antiguos, porque la descarga va a un directorio de staging.
export function origenes() { return Object.fromEntries([...fuentes].map(([k, f]) => [k.split('/').pop(), { origen: f.origen, ...f.lecturas }])); }

function estilo(): StyleSpecification {
  const raiz = new URL('./', document.baseURI).href;
  const base = layers('protomaps', namedFlavor('light'), { lang: 'es' }) as LayerSpecification[];
  const primerSimbolo = base.findIndex((l) => l.type === 'symbol');
  const propias: LayerSpecification[] = [
    { id: 'sombreado', type: 'raster', source: 'sombreado', paint: { 'raster-opacity': 0.9 } },
    { id: 'curvas', type: 'line', source: 'curvas', 'source-layer': 'curvas',
      paint: { 'line-color': '#8a5a2b', 'line-opacity': ['case', ['get', 'principal'], 0.7, 0.4],
        'line-width': ['case', ['get', 'principal'], 1.1, 0.5] } },
    { id: 'protegidos-relleno', type: 'fill', source: 'protegidos', 'source-layer': 'protegidos',
      paint: { 'fill-color': '#6a1b9a', 'fill-opacity': 0.06 } },
    { id: 'protegidos-linea', type: 'line', source: 'protegidos', 'source-layer': 'protegidos',
      paint: { 'line-color': '#6a1b9a', 'line-width': 2, 'line-dasharray': [3, 2] } },
  ];
  const etiquetasCurvas: LayerSpecification = {
    id: 'curvas-cota', type: 'symbol', source: 'curvas', 'source-layer': 'curvas', minzoom: 13,
    filter: ['get', 'principal'],
    layout: { 'symbol-placement': 'line', 'text-field': ['to-string', ['get', 'ele']],
      'text-font': ['Noto Sans Regular'], 'text-size': 11 },
    paint: { 'text-color': '#6b4320', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
  };
  return {
    version: 8,
    glyphs: raiz + 'fonts/{fontstack}/{range}.pbf',
    sprite: raiz + 'sprites/light',
    sources: {
      protomaps: { type: 'vector', url: pm('base.pmtiles') },
      sombreado: { type: 'raster', url: pm('sombreado.pmtiles'), tileSize: 256 },
      curvas: { type: 'vector', url: pm('curvas.pmtiles') },
      protegidos: { type: 'vector', url: pm('protegidos.pmtiles') },
    },
    layers: [...base.slice(0, primerSimbolo), ...propias, ...base.slice(primerSimbolo), etiquetasCurvas],
  };
}

export function crearMapa(contenedor: HTMLElement, m: Manifest): MapaML {
  const [o, s, e, n] = m.bbox;
  const mx = (e - o) * 0.25, my = (n - s) * 0.25;
  const mapa = new maplibregl.Map({
    container: contenedor,
    style: estilo(),
    bounds: [[o, s], [e, n]],
    maxBounds: [[o - mx, s - my], [e + mx, n + my]],
    minZoom: 7,
    maxZoom: 17,
    attributionControl: { compact: true, customAttribution: ATRIBUCION },
    dragRotate: false,
    pitchWithRotate: false,
  });
  mapa.touchZoomRotate.disableRotation();
  mapa.once('load', () => contenedor.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show'));
  mapa.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
  mapa.on('click', 'protegidos-relleno', (ev: MapLayerMouseEvent) => {
    const f = ev.features?.[0];
    if (!f) return;
    const div = document.createElement('div');
    div.className = 'popup-enp';
    const b = document.createElement('strong'); b.textContent = String(f.properties.nombre ?? 'Espacio protegido');
    const p = document.createElement('div'); p.textContent = String(f.properties.figura ?? '');
    const a = document.createElement('div'); a.className = 'aviso'; a.textContent = 'Consulta la normativa de recolección del espacio.';
    div.append(b, p, a);
    new maplibregl.Popup({ maxWidth: '280px' }).setLngLat(ev.lngLat).setDOMContent(div).addTo(mapa);
  });
  return mapa;
}

/** Cambia la capa de idoneidad (especie × umbral de distancia). */
export function ponerIdoneidad(mapa: MapaML, especie: string, umbral: number) {
  if (mapa.getLayer('idoneidad')) mapa.removeLayer('idoneidad');
  if (mapa.getSource('idoneidad')) mapa.removeSource('idoneidad');
  mapa.addSource('idoneidad', { type: 'raster', url: pm(`idoneidad_${especie}_${umbral}.pmtiles`), tileSize: 256 });
  mapa.addLayer({ id: 'idoneidad', type: 'raster', source: 'idoneidad', paint: { 'raster-opacity': 0.72, 'raster-resampling': 'nearest' } },
    'protegidos-relleno');
}

export function verCapa(mapa: MapaML, ids: string[], visible: boolean) {
  for (const id of ids) if (mapa.getLayer(id)) mapa.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
}
