import * as maplibregl from 'maplibre-gl';
import urlTrabajador from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { type Map as MapaML, type MapMouseEvent, type StyleSpecification, type LayerSpecification } from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { layers, namedFlavor } from '@protomaps/basemaps';
import { FuenteOpfsHttp } from './fuente';
import { archivoOpfs } from './opfs';
import { baseDatos } from './datos';
import type { Manifest } from './tipos';
import { nombreFuente, normasNota, type IdCcaa, type ManifestApp } from './manifest-region';
import { ccaaEnPunto } from './normativa';
import { NOMBRE_TIPO_RESTRICCION, orientativo, aRestriccion, restriccionesEn, teselaDe, type Restriccion } from './restricciones';
import { etiquetaTitularidad, TEXTO_TITULARIDAD, type Titularidad } from './titularidad';
import { AVISO_CITAS, COLOR_ORIGEN, expresionColorOrigen, filasCita, filtroCitas } from './citas';

/** Ortofoto PNOA del IGN (WMTS, solo KVP según GetCapabilities; GoogleMapsCompatible hasta el nivel 19, JPEG). */
export const URL_PNOA = 'https://www.ign.es/wmts/pnoa-ma?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=OI.OrthoimageCoverage'
  + '&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg';
export const ATRIBUCION_PNOA = 'PNOA © IGN (CC BY 4.0)';
export type Base = 'mapa' | 'satelite';
export const COLORES_IDONEIDAD = ['#d9f0a3', '#addd8e', '#78c679', '#41ab5d', '#238443', '#006837', '#004529'];

maplibregl.setWorkerUrl(urlTrabajador);
const protocolo = new Protocol();
maplibregl.addProtocol('pmtiles', protocolo.tile);
const fuentes = new Map<string, FuenteOpfsHttp>();
const archivosPm = new Map<string, PMTiles>();

/** URL pmtiles:// de un archivo de datos; registra la Source OPFS/HTTP la primera vez. */
function pm(nombre: string): string {
  const url = baseDatos() + nombre;
  if (!fuentes.has(url)) {
    const f = new FuenteOpfsHttp(url, () => archivoOpfs(nombre));
    fuentes.set(url, f);
    const a = new PMTiles(f);
    archivosPm.set(url, a);
    protocolo.add(a);
  }
  return 'pmtiles://' + url;
}

type EntidadGeo = { properties: Record<string, unknown>; geometry: any };

/** Entidades de la capa `capa` en la tesela del nivel máximo de `archivo` que contiene el punto (sin filtrar
 * por geometría). Sin tesela → []. Si no se puede leer (sin red y sin descarga) → null. */
async function entidadesTesela(archivo: string, capa: string, lat: number, lon: number): Promise<EntidadGeo[] | null> {
  pm(archivo);
  const a = archivosPm.get(baseDatos() + archivo)!;
  try {
    const z = (await a.getHeader()).maxZoom;
    const { x, y } = teselaDe(lat, lon, z);
    const t = await a.getZxy(z, x, y);
    if (!t) return [];
    const l = new VectorTile(new PbfReader(new Uint8Array(t.data))).layers[capa];
    if (!l) return [];
    return Array.from({ length: l.length }, (_, i) => l.feature(i).toGeoJSON(x, y, z) as EntidadGeo);
  } catch (e) {
    console.warn(capa, e);
    return null;
  }
}

/** Titularidad del punto (titularidad.pmtiles): monte público o «probablemente privado», con refuerzos y paso
 * público. Igual que restriccionEn: lee la tesela (OPFS o HTTP) y no depende de la capa pintada. null si no se sabe. */
export async function titularidadEn(m: Manifest, lat: number, lon: number): Promise<Titularidad | null> {
  if (!m.titularidad) return null;
  const fs = await entidadesTesela(m.titularidad.capa, 'titularidad', lat, lon);
  return fs ? etiquetaTitularidad(fs, lat, lon) : null;
}

/**
 * Recintos restringidos (restricciones.pmtiles) que contienen el punto. Lee la tesela del nivel máximo del
 * archivo con la misma Source OPFS/HTTP que el mapa: sin conexión sale de OPFS y no depende de que la capa esté
 * visible. Sin tesela (fuera de todo recinto) → []. Si no se puede leer (sin red y sin descarga) → null.
 */
export async function restriccionEn(m: Manifest, lat: number, lon: number): Promise<Restriccion[] | null> {
  if (!m.restricciones) return null;
  const fs = await entidadesTesela(m.restricciones.capa, 'restricciones', lat, lon);
  return fs && restriccionesEn(fs, lat, lon, m.restricciones.tipos);
}

/** Comunidades autónomas (ccaa.pmtiles, capa 'ccaa') que contienen el punto; null sin capa o sin poder leerla. */
export async function ccaaEn(m: ManifestApp, lat: number, lon: number): Promise<IdCcaa[] | null> {
  if (!m.ccaa) return null;
  const fs = await entidadesTesela(m.ccaa, 'ccaa', lat, lon);
  return fs && ccaaEnPunto(fs, lat, lon);
}

// Tras cambiar los archivos de OPFS (actualización o borrado) la app recarga la página (ver main.ts,
// recargarTrasCambioDeMapas): es la forma más simple de no reutilizar ningún File antiguo ni las cachés de
// cabecera/directorios de PMTiles ni las teselas que MapLibre ya tiene. Mientras se descarga, el mapa sigue
// leyendo los archivos antiguos, porque la descarga va a un directorio de staging.
export function origenes() { return Object.fromEntries([...fuentes].map(([k, f]) => [k.split('/').pop(), { origen: f.origen, ...f.lecturas }])); }

/** Colores de las marcas de sendero (GR rojo y blanco, PR amarillo y blanco, SL verde y blanco). */
export const COLORES_RUTA: Record<string, string> = { GR: '#d1262b', PR: '#e8b400', SL: '#23913b', otro: '#6f6f6f' };
export const NOMBRE_TIPO_RUTA: Record<string, string> = {
  GR: 'Gran Recorrido (GR)', PR: 'Pequeño Recorrido (PR)', SL: 'Sendero Local (SL)', otro: 'Otro sendero o camino',
};
export const CAPAS_RUTAS = ['rutas-fondo', 'rutas-marca', 'rutas-otros', 'rutas-etiqueta'];
export const CAPAS_RESTRICCIONES = ['restricciones-relleno', 'restricciones-linea'];
export const CAPAS_TITULARIDAD = ['titularidad-relleno', 'titularidad-linea', 'pasos-linea'];
export const CAPAS_SOLO_PUBLICOS = ['fuera-publico'];
export const CAPAS_CITAS = ['citas'];
export const COLOR_TITULARIDAD = { monte_junta: '#2e7d32', monte_municipal: '#1565c0', paso: '#8d5524' };
const CLASES_MONTE: any = ['in', ['get', 'clase'], ['literal', ['monte_junta', 'monte_municipal']]];
export const COLOR_RESTRICCION = '#c62828';
const RAYADO = 'rayado-restriccion';

/** Patrón de rayas diagonales rojas (16 px, transparente entre rayas) para el relleno de las restricciones. */
function imagenRayado(): { width: number; height: number; data: Uint8Array } {
  const n = 16, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = (x + y) % 8;                       // raya de 2 px cada 8 px, a 45°
    if (d > 1) continue;
    const i = (y * n + x) * 4;
    data.set([198, 40, 40, d === 0 ? 200 : 120], i);
  }
  return { width: n, height: n, data };
}

function popupRestriccion(r: Restriccion, nota: string): HTMLElement {
  const div = document.createElement('div');
  div.className = 'popup-restriccion';
  const b = document.createElement('strong'); b.textContent = r.nombre || 'Zona restringida';
  const t = document.createElement('div'); t.className = 'pr-tipo'; t.textContent = NOMBRE_TIPO_RESTRICCION[r.tipo] ?? r.zona;
  const x = document.createElement('div'); x.textContent = r.texto;
  const a = document.createElement('div'); a.className = 'aviso'; a.textContent = nota;
  div.append(b, t, x, a);
  return div;
}
const MARCADAS: any = ['in', ['get', 'tipo'], ['literal', ['GR', 'PR', 'SL']]];

function popupMonte(p: Record<string, unknown>, nota: string, fuente: string): HTMLElement {
  const div = document.createElement('div');
  div.className = 'popup-monte';
  const clase = String(p.clase ?? '') as 'monte_junta' | 'monte_municipal';
  const b = document.createElement('strong'); b.textContent = String(p.nombre || 'Monte público');
  const t = document.createElement('div'); t.className = 'pm-clase'; t.dataset.clase = clase; t.textContent = TEXTO_TITULARIDAD[clase] ?? '';
  const d = document.createElement('div'); d.textContent = [p.detalle, p.codigo].filter(Boolean).join(' · ');
  const a = document.createElement('div'); a.className = 'aviso'; a.textContent = `${nota}${fuente ? ` Fuente: ${fuente}.` : ''}`;
  div.append(b, t, d, a);
  return div;
}

function popupPaso(p: Record<string, unknown>, fuente: string): HTMLElement {
  const div = document.createElement('div');
  div.className = 'popup-paso';
  const b = document.createElement('strong'); b.textContent = String(p.nombre || (p.tipo === 'via_pecuaria' ? 'Vía pecuaria' : 'Sendero de uso público'));
  const t = document.createElement('div'); t.textContent = `${p.tipo === 'via_pecuaria' ? 'Vía pecuaria' : 'Sendero de uso público'}: ${TEXTO_TITULARIDAD.paso_publico.toLowerCase()}.`;
  const a = document.createElement('div'); a.className = 'aviso'; a.textContent = `${fuente ? `Fuente: ${fuente}. ` : ''}El trazado de las vías pecuarias no deslindadas puede ser aproximado.`;
  div.append(b, t, a);
  return div;
}

function popupCita(p: Record<string, unknown>, nombre: (id: string) => string): HTMLElement {
  const div = document.createElement('div');
  div.className = 'popup-cita';
  const dl = document.createElement('dl');
  for (const f of filasCita(p, nombre)) {
    const dt = document.createElement('dt'); dt.textContent = f.etiqueta;
    const dd = document.createElement('dd');
    if (f.enlace) {
      const a = document.createElement('a'); a.href = f.enlace; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = f.valor;
      dd.append(a);
    } else dd.textContent = f.valor;
    if (f.etiqueta === 'Origen') {
      const m = document.createElement('span'); m.className = 'muestra-origen'; m.setAttribute('aria-hidden', 'true');
      m.style.setProperty('--c', COLOR_ORIGEN[String(p.origen) as keyof typeof COLOR_ORIGEN] ?? COLOR_ORIGEN.imba);
      dd.prepend(m);
    }
    dl.append(dt, dd);
  }
  const a = document.createElement('div'); a.className = 'aviso'; a.textContent = AVISO_CITAS;
  div.append(dl, a);
  return div;
}

/** Nombre de especie para los popups de citas (main.ts lo rellena con el manifest y la guía). */
let nombreEspecie: (id: string) => string = (id) => id;
export function ponerNombresEspecie(f: (id: string) => string) { nombreEspecie = f; }

function capasRutas(): { lineas: LayerSpecification[]; etiqueta: LayerSpecification } {
  const oculta = { visibility: 'none' as const };
  const ancho = (a: number, b: number): any => ['interpolate', ['linear'], ['zoom'], 8, a, 14, b];
  return {
    lineas: [
      { id: 'rutas-fondo', type: 'line', source: 'rutas', 'source-layer': 'rutas', filter: MARCADAS,
        layout: { ...oculta, 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': ancho(2.5, 7), 'line-opacity': 0.95 } },
      { id: 'rutas-marca', type: 'line', source: 'rutas', 'source-layer': 'rutas', filter: MARCADAS,
        layout: { ...oculta, 'line-join': 'round' },
        paint: { 'line-color': ['match', ['get', 'tipo'], 'GR', COLORES_RUTA.GR, 'PR', COLORES_RUTA.PR, COLORES_RUTA.SL],
          'line-width': ancho(1.5, 4), 'line-dasharray': [2, 1.4] } },
      { id: 'rutas-otros', type: 'line', source: 'rutas', 'source-layer': 'rutas', filter: ['!', MARCADAS],
        layout: { ...oculta, 'line-join': 'round' },
        paint: { 'line-color': COLORES_RUTA.otro, 'line-width': ancho(1, 2.5), 'line-dasharray': [3, 1.5], 'line-opacity': 0.85 } },
    ],
    etiqueta: { id: 'rutas-etiqueta', type: 'symbol', source: 'rutas', 'source-layer': 'rutas', minzoom: 13,
      layout: { ...oculta, 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'ref'], ['get', 'name'], ''],
        'text-font': ['Noto Sans Medium'], 'text-size': 12, 'symbol-spacing': 320 },
      paint: { 'text-color': ['match', ['get', 'tipo'], 'GR', '#9e1418', 'PR', '#7a5d00', 'SL', '#14612a', '#444'],
        'text-halo-color': '#fff', 'text-halo-width': 2 } },
  };
}

function popupRuta(p: Record<string, unknown>, fuentes: Record<string, string>): HTMLElement {
  const div = document.createElement('div');
  div.className = 'popup-ruta';
  const tipo = String(p.tipo ?? 'otro');
  const b = document.createElement('strong'); b.textContent = String(p.name || p.ref || 'Sendero sin nombre');
  const linea = (t: string) => { const d = document.createElement('div'); d.textContent = t; return d; };
  const marca = document.createElement('span'); marca.className = 'marca-ruta'; marca.dataset.tipo = tipo;
  marca.style.setProperty('--c', COLORES_RUTA[tipo] ?? COLORES_RUTA.otro);
  const t = linea(`${p.ref && p.name ? `${p.ref} · ` : ''}${NOMBRE_TIPO_RUTA[tipo] ?? NOMBRE_TIPO_RUTA.otro}`);
  t.prepend(marca);
  div.append(b, t);
  if (p.dificultad) div.append(linea(`Dificultad: ${p.dificultad}`));
  const f = String(p.fuente ?? '');
  const fu = linea(`Fuente: ${nombreFuente(f, fuentes)}`);
  fu.className = 'aviso';
  div.append(fu);
  return div;
}

function estilo(conMeteo: boolean, archivoRutas: string | null, archivoRestricciones: string | null,
  archivoTitularidad: string | null = null, archivoCitas: string | null = null): StyleSpecification {
  const raiz = new URL('./', document.baseURI).href;
  const base = layers('protomaps', namedFlavor('light'), { lang: 'es' }) as LayerSpecification[];
  const primerSimbolo = base.findIndex((l) => l.type === 'symbol');
  const propias: LayerSpecification[] = [
    { id: 'sombreado', type: 'raster', source: 'sombreado', paint: { 'raster-opacity': 0.9 } },
    { id: 'curvas', type: 'line', source: 'curvas', 'source-layer': 'curvas',
      paint: { 'line-color': '#8a5a2b', 'line-opacity': ['case', ['get', 'principal'], 0.7, 0.4],
        'line-width': ['case', ['get', 'principal'], 1.1, 0.5] } },
    { id: 'semaforo', type: 'fill', source: 'meteo_zonas', 'source-layer': 'meteo_zonas', layout: { visibility: 'none' },
      paint: { 'fill-color': '#8a8a86', 'fill-opacity': 0.35, 'fill-outline-color': '#ffffff' } },
    { id: 'protegidos-relleno', type: 'fill', source: 'protegidos', 'source-layer': 'protegidos',
      paint: { 'fill-color': '#6a1b9a', 'fill-opacity': 0.06 } },
    // «Solo montes públicos»: velo claro sobre lo que no es monte público (encima de la idoneidad, que se inserta
    // justo antes de protegidos-relleno).
    ...(archivoTitularidad ? [{ id: 'fuera-publico', type: 'fill', source: 'titularidad', 'source-layer': 'fuera_publico',
      layout: { visibility: 'none' }, paint: { 'fill-color': '#f3efe6', 'fill-opacity': 0.86 } } as LayerSpecification] : []),
    { id: 'protegidos-linea', type: 'line', source: 'protegidos', 'source-layer': 'protegidos',
      paint: { 'line-color': '#6a1b9a', 'line-width': 2, 'line-dasharray': [3, 2] } },
  ];
  if (archivoRestricciones) propias.push(
    { id: 'restricciones-relleno', type: 'fill', source: 'restricciones', 'source-layer': 'restricciones',
      paint: { 'fill-pattern': RAYADO, 'fill-opacity': 0.75 } },
    { id: 'restricciones-linea', type: 'line', source: 'restricciones', 'source-layer': 'restricciones',
      paint: { 'line-color': COLOR_RESTRICCION, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.2, 14, 2.5] } });
  if (archivoTitularidad) propias.push(
    { id: 'titularidad-relleno', type: 'fill', source: 'titularidad', 'source-layer': 'titularidad', filter: CLASES_MONTE,
      layout: { visibility: 'none' },
      paint: { 'fill-color': ['match', ['get', 'clase'], 'monte_junta', COLOR_TITULARIDAD.monte_junta, COLOR_TITULARIDAD.monte_municipal],
        'fill-opacity': 0.12 } },
    { id: 'titularidad-linea', type: 'line', source: 'titularidad', 'source-layer': 'titularidad', filter: CLASES_MONTE,
      layout: { visibility: 'none' },
      paint: { 'line-color': ['match', ['get', 'clase'], 'monte_junta', COLOR_TITULARIDAD.monte_junta, COLOR_TITULARIDAD.monte_municipal],
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 14, 2.5] } },
    { id: 'pasos-linea', type: 'line', source: 'titularidad', 'source-layer': 'pasos', minzoom: 9,
      layout: { visibility: 'none', 'line-cap': 'round' },
      paint: { 'line-color': COLOR_TITULARIDAD.paso, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 14, 3],
        'line-dasharray': [1, 1.5], 'line-opacity': 0.9 } });
  const rutas = archivoRutas ? capasRutas() : null;
  if (rutas) propias.push(...rutas.lineas);
  if (archivoCitas) propias.push(
    { id: 'citas', type: 'circle', source: 'citas', 'source-layer': 'citas', layout: { visibility: 'none' },
      paint: { 'circle-color': expresionColorOrigen() as any, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 3.5, 14, 7],
        'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5, 'circle-opacity': 0.95 } });
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
      pnoa: { type: 'raster', tiles: [URL_PNOA], tileSize: 256, maxzoom: 19, attribution: ATRIBUCION_PNOA },
      ...(conMeteo ? { meteo_zonas: { type: 'vector' as const, url: pm('meteo_zonas.pmtiles') } } : {}),
      ...(archivoRutas ? { rutas: { type: 'vector' as const, url: pm(archivoRutas) } } : {}),
      ...(archivoRestricciones ? { restricciones: { type: 'vector' as const, url: pm(archivoRestricciones) } } : {}),
      ...(archivoTitularidad ? { titularidad: { type: 'vector' as const, url: pm(archivoTitularidad) } } : {}),
      ...(archivoCitas ? { citas: { type: 'vector' as const, url: pm(archivoCitas) } } : {}),
    },
    layers: [{ id: 'pnoa', type: 'raster', source: 'pnoa', layout: { visibility: 'none' } }, ...base.slice(0, primerSimbolo), ...propias.filter((l) => conMeteo || l.id !== 'semaforo'),
      ...base.slice(primerSimbolo), etiquetasCurvas, ...(rutas ? [rutas.etiqueta] : [])],
  };
}

export function crearMapa(contenedor: HTMLElement, m: ManifestApp): MapaML {
  const nota = orientativo(normasNota(m));
  const fuenteTitularidad = m.atribuciones.capas.titularidad ?? '';
  const [o, s, e, n] = m.bbox;
  const mx = (e - o) * 0.25, my = (n - s) * 0.25;
  const mapa = new maplibregl.Map({
    container: contenedor,
    style: estilo(!!m.meteo, m.rutas ?? null, m.restricciones?.capa ?? null, m.titularidad?.capa ?? null, m.citas?.capa ?? null),
    bounds: [[o, s], [e, n]],
    maxBounds: [[o - mx, s - my], [e + mx, n + my]],
    minZoom: 7,
    maxZoom: 17,
    attributionControl: { compact: true, customAttribution: m.atribuciones.mapa || undefined },
    dragRotate: false,
    pitchWithRotate: false,
  });
  mapa.touchZoomRotate.disableRotation();
  mapa.on('styleimagemissing', (e: { id: string }) => {
    if (e.id === RAYADO && !mapa.hasImage(RAYADO)) mapa.addImage(RAYADO, imagenRayado(), { pixelRatio: 2 });
  });
  mapa.once('load', () => contenedor.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show'));
  mapa.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
  // Un solo manejador: primero senderos (con margen de 10 px, las líneas son finas) y si no, espacio protegido.
  const visible = (id: string) => !!mapa.getLayer(id) && mapa.getLayoutProperty(id, 'visibility') === 'visible';
  mapa.on('click', (ev: MapMouseEvent) => {
    const { x: cx, y: cy } = ev.point;
    const ancla = ev.point.y < mapa.getContainer().clientHeight * 0.6 ? 'top' : 'bottom';
    const cita = visible('citas') ? mapa.queryRenderedFeatures([[cx - 8, cy - 8], [cx + 8, cy + 8]], { layers: ['citas'] })[0] : undefined;
    if (cita) {
      new maplibregl.Popup({ maxWidth: '300px', className: 'popup-citas', anchor: ancla }).setLngLat(ev.lngLat)
        .setDOMContent(popupCita(cita.properties, nombreEspecie)).addTo(mapa);
      return;
    }
    const visibles = CAPAS_RUTAS.slice(0, 3).filter((id) => mapa.getLayer(id) && mapa.getLayoutProperty(id, 'visibility') === 'visible');
    const { x, y } = ev.point;
    const ruta = visibles.length ? mapa.queryRenderedFeatures([[x - 10, y - 10], [x + 10, y + 10]], { layers: visibles })[0] : undefined;
    if (ruta) {
      new maplibregl.Popup({ maxWidth: '280px', className: 'popup-rutas' }).setLngLat(ev.lngLat).setDOMContent(popupRuta(ruta.properties, m.atribuciones.fuentes)).addTo(mapa);
      return;
    }
    const restr = mapa.getLayer('restricciones-relleno') && mapa.getLayoutProperty('restricciones-relleno', 'visibility') !== 'none'
      ? mapa.queryRenderedFeatures(ev.point, { layers: ['restricciones-relleno'] })[0] : undefined;
    if (restr) {
      new maplibregl.Popup({ maxWidth: '290px', className: 'popup-restricciones', anchor: ev.point.y < mapa.getContainer().clientHeight * 0.6 ? 'top' : 'bottom' }).setLngLat(ev.lngLat)
        .setDOMContent(popupRestriccion(aRestriccion(restr.properties, m.restricciones?.tipos), nota)).addTo(mapa);
      return;
    }
    const paso = visible('pasos-linea') ? mapa.queryRenderedFeatures([[cx - 8, cy - 8], [cx + 8, cy + 8]], { layers: ['pasos-linea'] })[0] : undefined;
    if (paso) {
      new maplibregl.Popup({ maxWidth: '280px', className: 'popup-pasos', anchor: ancla }).setLngLat(ev.lngLat).setDOMContent(popupPaso(paso.properties, fuenteTitularidad)).addTo(mapa);
      return;
    }
    const monte = visible('titularidad-relleno') ? mapa.queryRenderedFeatures(ev.point, { layers: ['titularidad-relleno'] })[0] : undefined;
    if (monte) {
      new maplibregl.Popup({ maxWidth: '290px', className: 'popup-montes', anchor: ancla }).setLngLat(ev.lngLat).setDOMContent(popupMonte(monte.properties, nota, fuenteTitularidad)).addTo(mapa);
      return;
    }
    const f = mapa.getLayer('protegidos-relleno') ? mapa.queryRenderedFeatures(ev.point, { layers: ['protegidos-relleno'] })[0] : undefined;
    if (!f) return;
    const div = document.createElement('div');
    div.className = 'popup-enp';
    const b = document.createElement('strong'); b.textContent = String(f.properties.nombre ?? 'Espacio protegido');
    const p = document.createElement('div'); p.textContent = String(f.properties.figura ?? '');
    const a = document.createElement('div'); a.className = 'aviso'; a.textContent = m.texto_protegido;
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

/** Filtra la capa de citas por la especie del mapa (null = todas). */
export function filtrarCitas(mapa: MapaML, especie: string | null) {
  if (mapa.getLayer('citas')) mapa.setFilter('citas', filtroCitas(especie) as any);
}

export function verCapa(mapa: MapaML, ids: string[], visible: boolean) {
  for (const id of ids) if (mapa.getLayer(id)) mapa.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
}

/** Colorea los polígonos de Voronoi de la capa Semáforo (expresión de zona.ts expresionColores). */
export function colorearSemaforo(mapa: MapaML, expresion: any) {
  if (mapa.getLayer('semaforo')) mapa.setPaintProperty('semaforo', 'fill-color', expresion);
}

// ---------------------------------------------------------------- base: mapa o satélite

const originales = new WeakMap<MapaML, Map<string, unknown>>();

/**
 * Mapa base vectorial o ortofoto PNOA (solo con conexión: no va en la descarga OPFS). En satélite se ocultan
 * los rellenos del mapa base y el sombreado, y las carreteras, ríos y límites quedan semitransparentes encima
 * (sin sus bordes); las etiquetas, curvas, idoneidad, espacios protegidos, GPS y sitios siguen igual.
 */
export function ponerBase(mapa: MapaML, base: Base, sombreado: boolean) {
  const sat = base === 'satelite';
  let orig = originales.get(mapa);
  if (!orig) originales.set(mapa, (orig = new Map()));
  for (const l of mapa.getStyle().layers) {
    if ((l as { source?: string }).source !== 'protomaps' && l.type !== 'background') continue;
    if (l.type === 'background' || l.type === 'fill') mapa.setLayoutProperty(l.id, 'visibility', sat ? 'none' : 'visible');
    else if (l.type === 'line') {
      if (/casing/.test(l.id)) { mapa.setLayoutProperty(l.id, 'visibility', sat ? 'none' : 'visible'); continue; }
      if (!orig.has(l.id)) orig.set(l.id, mapa.getPaintProperty(l.id, 'line-opacity'));
      mapa.setPaintProperty(l.id, 'line-opacity', sat ? 0.55 : orig.get(l.id) as number | undefined);
    }
  }
  mapa.setLayoutProperty('pnoa', 'visibility', sat ? 'visible' : 'none');
  verCapa(mapa, ['sombreado'], !sat && sombreado);
}
