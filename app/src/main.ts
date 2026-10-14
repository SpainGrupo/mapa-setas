import 'maplibre-gl/dist/maplibre-gl.css';
import './estilos.css';
import { registerSW } from 'virtual:pwa-register';
import type { Map as MapaML, GeoJSONSource, LngLat } from 'maplibre-gl';
import { BASE_DATOS, cargarJson, cargarManifest, mb } from './datos';
import { CAPAS_RESTRICCIONES, CAPAS_RUTAS, COLORES_IDONEIDAD, colorearSemaforo, crearMapa, origenes, ponerBase, ponerIdoneidad, restriccionEn, verCapa, type Base } from './mapa';
import { ORIENTATIVO, textoChip, type Restriccion } from './restricciones';
import { aparcamiento, centroCelda, consultar, esIOS, nombreVia, simplificar, textoSubida, textoTiempo, trazar, urlGoogleCoche, urlOtraApp } from './acceso';
import { datosAcceso } from './acceso-datos';
import { iniciarSelectorEspecie, pintarSelectorEspecie } from './selector-especie';
import { Gps } from './gps';
import { borrarMapas, descargarMapas, estadoDescarga } from './opfs';
import { borrarSitio, guardarSitio, guardarVarios, leerSitio, listarSitios } from './sitios';
import { aGPX, aJSON, deGPX, deJSON, nuevoId } from './intercambio';
import type { AccesoSitio, Manifest, Sitio } from './tipos';
import type { Feature } from 'geojson';
import { edadHoras, fechaMadrid, obtener, CADUCIDAD_H, type DatosMeteo, type PuntoMeteo } from './meteo';
import { bandaAltitud, ddmm, humedadAcumulada, semaforo, sumarDias, textoBanda, type ResultadoSemaforo } from './semaforo';
import { expresionColores, haceTexto, ICONO_ESTADO, NOMBRE_ESTADO, puntoMasCercano } from './zona';
import { pintarGrafico } from './grafico';
import { abrirFicha, cargarGuia, fichasGuia, fotosSinConexion, guardarFotosSinConexion, hayFicha, mostrarGuia, pintarCreditos, type EstadoFotos } from './guia-ui';
import { binomio, especieMapaDeFicha, fichaDeEspecieMapa } from './guia';
import { iniciarReconocer, mostrarReconocer, pintarAjustesModelo } from './reconocer-ui';

registerSW({ immediate: true });

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
let manifest: Manifest | null = null;
let mapa: MapaML | null = null;
let gps: Gps | null = null;
const nombres: Record<string, string> = {};
const E2E = new URLSearchParams(location.search).get('e2e') === '1';
/** «Hoy» del semáforo (Europe/Madrid). Solo en el e2e (?e2e=1&hoy=AAAA-MM-DD) se puede fijar, para que la temporada no dependa del mes. */
const HOY_FIJO = E2E ? new URLSearchParams(location.search).get('hoy') : null;
const hoyZona = () => (HOY_FIJO && /^\d{4}-\d{2}-\d{2}$/.test(HOY_FIJO) ? HOY_FIJO : fechaMadrid(new Date()));

// ---------------------------------------------------------------- avisos y navegación

let tAviso = 0;
function avisar(texto: string, ms = 3500) {
  const el = $('#aviso');
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(tAviso);
  tAviso = window.setTimeout(() => (el.hidden = true), ms);
}
function quitarAviso() { clearTimeout(tAviso); $('#aviso').hidden = true; }

// Tras cambiar los mapas de OPFS se recarga la página una vez (ver mapa.ts) y el aviso sale al volver.
const CLAVE_AVISO_RECARGA = 'setas:aviso-tras-recarga';
function recargarTrasCambioDeMapas(aviso: string) {
  sessionStorage.setItem(CLAVE_AVISO_RECARGA, aviso);
  location.reload();
}
const avisoPendiente = sessionStorage.getItem(CLAVE_AVISO_RECARGA);
if (avisoPendiente) { sessionStorage.removeItem(CLAVE_AVISO_RECARGA); avisar(avisoPendiente, 5000); }

function irA(id: string) {
  document.querySelectorAll('.pantalla').forEach((p) => p.classList.toggle('activa', p.id === id));
  document.querySelectorAll<HTMLButtonElement>('.pestanas button[data-p]').forEach((b) => {
    b.classList.toggle('activa', b.dataset.p === id);
    if (b.dataset.p === id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  if (id === 'p-mapa') mapa?.resize();
  if (id === 'p-sitios') pintarLista();
  if (id === 'p-ajustes') pintarAjustes();
  if (id === 'p-zona') pintarZona();
  if (id === 'p-guia') mostrarGuia();
  if (id === 'p-reconocer') mostrarReconocer();
}

document.querySelectorAll<HTMLButtonElement>('.pestanas button').forEach((b) =>
  b.addEventListener('click', () => (b.dataset.p ? irA(b.dataset.p) : avisar(`${b.dataset.prox}: próximamente`))));

// ---------------------------------------------------------------- primer arranque

if (!localStorage.getItem('setas:aviso-visto')) {
  const d = $<HTMLDialogElement>('#dlg-inicio');
  d.addEventListener('close', () => localStorage.setItem('setas:aviso-visto', '1'));
  d.showModal();
}

// ---------------------------------------------------------------- mapa

function rellenarEspecies(sel: HTMLSelectElement, primera?: [string, string]) {
  sel.replaceChildren();
  if (primera) sel.add(new Option(primera[1], primera[0]));
  for (const e of manifest?.especies ?? []) sel.add(new Option(e.nombre, e.id));
}

function aplicarIdoneidad() {
  if (!mapa || !manifest) return;
  const especie = $<HTMLSelectElement>('#sel-especie').value;
  const umbral = Number($<HTMLInputElement>('#rng-umbral').value);
  $('#txt-umbral').textContent = `≥ ${umbral} m`;
  localStorage.setItem('setas:capa', JSON.stringify({ especie, umbral }));
  ponerIdoneidad(mapa, especie, umbral);
  verCapa(mapa, ['idoneidad'], $<HTMLInputElement>('[data-capa=idoneidad]').checked);
  pintarSemaforoMapa();
  pintarTarjeta();
  pintarBotonFicha();
  pintarSelectorEspecie();
}

/** «Ver ficha» junto al selector de especie, solo si la especie del mapa tiene ficha en la guía. */
async function pintarBotonFicha() {
  const id = fichaDeEspecieMapa($<HTMLSelectElement>('#sel-especie').value);
  $('#btn-ver-ficha').hidden = !(await cargarGuia() && hayFicha(id));
}
$('#btn-ver-ficha').addEventListener('click', () => {
  irA('p-guia');
  abrirFicha(fichaDeEspecieMapa($<HTMLSelectElement>('#sel-especie').value));
});

const CAPAS: Record<string, string[]> = {
  sombreado: ['sombreado'], curvas: ['curvas', 'curvas-cota'],
  protegidos: ['protegidos-relleno', 'protegidos-linea'], idoneidad: ['idoneidad'], semaforo: ['semaforo'],
  rutas: CAPAS_RUTAS, restricciones: CAPAS_RESTRICCIONES,
};

function pintarSitiosMapa(lista: Sitio[]) {
  const src = mapa?.getSource('sitios') as GeoJSONSource | undefined;
  src?.setData({ type: 'FeatureCollection', features: lista.map((s) => ({
    type: 'Feature', properties: { id: s.id, estrellas: s.estrellas },
    geometry: { type: 'Point', coordinates: [s.lon, s.lat] } })) });
}

async function iniciarMapa() {
  manifest = await cargarManifest();
  if (!manifest) { $('#sin-datos').hidden = false; return; }
  for (const e of manifest.especies) nombres[e.id] = e.nombre;
  iniciarSelectorEspecie(() => manifest?.especies ?? []);
  cargarGuia().then((ok) => { if (ok) for (const f of fichasGuia()) nombres[f.id] ??= binomio(f); pintarSelectorEspecie(); });
  rellenarEspecies($<HTMLSelectElement>('#sel-especie'));
  rellenarEspecies($<HTMLSelectElement>('#filtro-especie'), ['', 'Todas']);
  rellenarEspecies($<HTMLSelectElement>('#sitio-especie'), ['', 'Sin especificar']);
  $('#capa-rutas').hidden = !manifest.rutas;
  $('#capa-restricciones').hidden = !manifest.restricciones;
  $('#rampa').style.background = `linear-gradient(90deg, ${COLORES_IDONEIDAD.join(',')})`;
  try {
    const g = JSON.parse(localStorage.getItem('setas:capa') ?? 'null');
    if (g && manifest.especies.some((e) => e.id === g.especie)) {
      $<HTMLSelectElement>('#sel-especie').value = g.especie;
      $<HTMLInputElement>('#rng-umbral').value = String(g.umbral);
    }
  } catch { /* preferencia corrupta: se ignora */ }
  pintarSelectorEspecie();

  mapa = crearMapa($('#mapa'), manifest);
  gps = new Gps(mapa, (m) => avisar(m));
  if (import.meta.env.DEV || E2E) (window as any).__setas = { mapa, origenes, meteo: () => ({ datos: meteo, origen: meteoOrigen, punto: puntoSel }),
    acceso: () => ultimoAcceso, trazaAcceso: () => trazaAcceso, hoy: hoyZona,
    restriccionEn: (lat: number, lon: number) => manifest && restriccionEn(manifest, lat, lon),
    sitioEditando: () => editando && { ...editando, foto: undefined }, accesoSitio: () => accesoSitio,
    resumenSemaforo: () => Object.fromEntries((manifest?.especies ?? []).map((e) => {
      const n: Record<string, number> = { verde: 0, amarillo: 0, rojo: 0, gris: 0 };
      for (const p of puntosMeteo) n[estadoEn(p, e.id)?.estado ?? 'gris']++;
      return [e.id, n];
    })) };
  mapa.on('load', async () => {
    aplicarIdoneidad();
    aplicarBase(false);
    mapa!.addSource('sitios', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    mapa!.addLayer({ id: 'sitios', type: 'circle', source: 'sitios', paint: {
      'circle-radius': ['+', 6, ['*', 2, ['get', 'estrellas']]], 'circle-color': '#b23a0b',
      'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
    mapa!.on('click', 'sitios', (ev) => {
      const id = ev.features?.[0]?.properties?.id;
      if (id) leerSitio(String(id)).then((s) => s && abrirSitio(s));
    });
    pintarSitiosMapa(await listarSitios());
    instalarCapaAcceso(mapa!);
    mapa!.addSource('punto-meteo', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    mapa!.addLayer({ id: 'punto-meteo', type: 'circle', source: 'punto-meteo', paint: {
      'circle-radius': 7, 'circle-color': '#111', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
    mapa!.on('click', (ev) => {
      if (Date.now() - tPulsacionLarga < 800) return;   // el «click» que sigue a soltar la pulsación larga
      elegirPunto(ev.lngLat.lat, ev.lngLat.lng, true);
    });
    pintarSemaforoMapa();
    pintarPuntoMapa();
    document.body.dataset.mapa = 'listo';
  });
  $('#sel-especie').addEventListener('change', aplicarIdoneidad);
  $('#rng-umbral').addEventListener('input', aplicarIdoneidad);
  document.querySelectorAll<HTMLInputElement>('[data-capa]').forEach((c) =>
    c.addEventListener('change', () => mapa && verCapa(mapa, CAPAS[c.dataset.capa!], c.checked)));
  document.querySelectorAll<HTMLInputElement>('input[name=base]').forEach((r) => r.addEventListener('change', () => {
    try { localStorage.setItem(CLAVE_BASE, r.value); } catch { /* sin almacenamiento: solo esta sesión */ }
    aplicarBase(true);
  }));
  window.addEventListener('offline', () => aplicarBase(true));
  window.addEventListener('online', () => aplicarBase(false));
  instalarPulsacionLarga(mapa);
  iniciarMeteo();
}

// ---------------------------------------------------------------- fondo: mapa o satélite (PNOA, solo en línea)

const CLAVE_BASE = 'setas:base';
function baseGuardada(): Base {
  try { return localStorage.getItem(CLAVE_BASE) === 'satelite' ? 'satelite' : 'mapa'; } catch { return 'mapa'; }
}
/** Aplica el fondo guardado; sin conexión el satélite cae al mapa (la preferencia se conserva para cuando vuelva). */
function aplicarBase(avisarSiCae: boolean) {
  if (!mapa?.getLayer('pnoa')) return;
  const quiere = baseGuardada();
  const base: Base = quiere === 'satelite' && !navigator.onLine ? 'mapa' : quiere;
  if (base !== quiere && avisarSiCae) avisar('La vista satélite necesita cobertura');
  const somb = $<HTMLInputElement>('[data-capa=sombreado]');
  somb.disabled = base === 'satelite';
  somb.closest('label')?.classList.toggle('desactivada', somb.disabled);
  document.querySelectorAll<HTMLInputElement>('input[name=base]').forEach((r) => (r.checked = r.value === base));
  ponerBase(mapa, base, somb.checked);
  document.body.dataset.base = base;
}

$('#btn-capas').addEventListener('click', () => {
  const c = $('#capas');
  c.hidden = !c.hidden;
  $('#btn-capas').setAttribute('aria-expanded', String(!c.hidden));
});
/** Muestra «Buscando…» mientras se espera al GPS; si falla, lo sustituye por el motivo. */
async function conPosicion<T>(f: () => Promise<T>): Promise<T | undefined> {
  avisar('Buscando tu posición…', 25000);
  try {
    const r = await f();
    quitarAviso();
    return r;
  } catch (err) {
    avisar((err as Error).message, 5000);
    return undefined;
  }
}
$('#btn-centrar').addEventListener('click', () => { if (gps) conPosicion(() => gps!.centrar()); });
$('#btn-aqui').addEventListener('click', async () => {
  if (!gps) return;
  const p = await conPosicion(() => gps!.posicion());
  if (p) abrirSitio(null, { lat: p.lat, lon: p.lon });
});

let tPulsacionLarga = 0;
/** Pulsación larga (600 ms sin moverse) en el mapa → ficha «Acceso» de ese punto (desde ella, «Guardar sitio»). */
function instalarPulsacionLarga(m: MapaML) {
  let t = 0, origen: { x: number; y: number } | null = null, disparada = false;
  // Al soltar tras una pulsación larga se anota la hora: el «click» que MapLibre emite justo después se ignora.
  const cancelar = () => { clearTimeout(t); origen = null; if (disparada) { disparada = false; tPulsacionLarga = Date.now(); } };
  const empezar = (e: { point: { x: number; y: number }; lngLat: LngLat; originalEvent: Event }) => {
    if ((e.originalEvent as TouchEvent).touches?.length > 1) return cancelar();
    if (m.getLayer('sitios') && m.queryRenderedFeatures([e.point.x, e.point.y], { layers: ['sitios'] }).length) return cancelar();
    origen = e.point;
    const ll = e.lngLat;
    clearTimeout(t);
    t = window.setTimeout(() => { origen = null; disparada = true; tPulsacionLarga = Date.now(); navigator.vibrate?.(30); mostrarAcceso(ll.lat, ll.lng); }, 600);
  };
  const mover = (e: { point: { x: number; y: number } }) => {
    if (origen && Math.hypot(e.point.x - origen.x, e.point.y - origen.y) > 10) cancelar();
  };
  m.on('touchstart', empezar); m.on('touchmove', mover); m.on('touchend', cancelar); m.on('touchcancel', cancelar);
  m.on('mousedown', empezar); m.on('mousemove', mover); m.on('mouseup', cancelar);
  m.on('dragstart', cancelar); m.on('zoomstart', cancelar);
  m.getCanvas().addEventListener('contextmenu', (e) => e.preventDefault());
}

// ---------------------------------------------------------------- ficha «Acceso» (pulsación larga)

interface UltimoAcceso {
  punto: { lat: number; lon: number };
  estado: 'cargando' | 'ok' | 'fuera' | 'sin_dato' | 'sin_datos' | 'error';
  acceso?: AccesoSitio;
  traza?: { pasos: number; vertices: number; completa: boolean; bloques: number };
  ms?: { consulta: number; traza: number; total: number };
  lector?: unknown;
  restricciones?: Restriccion[] | null;
}
let ultimoAcceso: UltimoAcceso | null = null;
let consultaAcceso = 0;

function instalarCapaAcceso(m: MapaML) {
  m.addSource('acceso', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  m.addLayer({ id: 'acceso-traza-fondo', type: 'line', source: 'acceso', filter: ['==', ['geometry-type'], 'LineString'],
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': 7, 'line-opacity': 0.9 } });
  m.addLayer({ id: 'acceso-traza', type: 'line', source: 'acceso', filter: ['==', ['geometry-type'], 'LineString'],
    layout: { 'line-join': 'round' }, paint: { 'line-color': '#1565c0', 'line-width': 4, 'line-dasharray': [1.6, 1.2] } });
  m.addLayer({ id: 'acceso-puntos', type: 'circle', source: 'acceso', filter: ['==', ['geometry-type'], 'Point'], paint: {
    'circle-radius': ['match', ['get', 'tipo'], 'aparcamiento', 11, 7],
    'circle-color': ['match', ['get', 'tipo'], 'aparcamiento', '#1565c0', '#111'],
    'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
  m.addLayer({ id: 'acceso-p', type: 'symbol', source: 'acceso', filter: ['==', ['get', 'tipo'], 'aparcamiento'],
    layout: { 'text-field': 'P', 'text-font': ['Noto Sans Medium'], 'text-size': 14, 'text-allow-overlap': true, 'text-ignore-placement': true },
    paint: { 'text-color': '#fff' } });
}

let trazaAcceso: Feature[] = [];
function pintarTrazaAcceso(features: Feature[]) {
  trazaAcceso = features;
  (mapa?.getSource('acceso') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
}

function cerrarAcceso() {
  consultaAcceso++;
  $('#tarjeta-acceso').hidden = true;
  pintarTrazaAcceso([]);
}

function estadoAcceso(texto: string, conDatos: boolean) {
  $('#ta-estado').textContent = texto;
  $('#ta-estado').hidden = !texto;
  $('#ta-datos').hidden = !conDatos;
  $<HTMLButtonElement>('#ta-coche').disabled = !conDatos;
  $<HTMLButtonElement>('#ta-otra').disabled = !conDatos;
}

interface CalculoAcceso {
  estado: UltimoAcceso['estado'];
  texto: string;                       // motivo cuando no hay acceso
  acceso?: AccesoSitio;
  linea?: [number, number][];
  completa?: boolean;
  traza?: UltimoAcceso['traza'];
  ms?: UltimoAcceso['ms'];
  lector?: unknown;
}

/** Aparcamiento, tiempo y subida a pie y trazado de un punto, con los datos locales (OPFS o HTTP). Nunca lanza. */
async function calcularAcceso(lat: number, lon: number): Promise<CalculoAcceso> {
  const t0 = performance.now();
  let d;
  try { d = manifest ? await datosAcceso(manifest) : null; } catch (e) {
    console.warn('acceso', e);
    return { estado: 'error', texto: 'No se pudieron leer los datos de acceso. Si no tienes cobertura, descarga los mapas en Ajustes cuando la tengas.' };
  }
  if (!d) return { estado: 'sin_datos', texto: navigator.onLine ? 'Esta versión de los mapas no trae datos de acceso.'
    : 'Sin conexión y sin los datos de acceso descargados: descárgalos en Ajustes cuando tengas cobertura.' };
  try {
    const c = await consultar(d.cab, d.lector, lat, lon);
    const t1 = performance.now();
    if (c.estado === 'fuera') return { estado: 'fuera', texto: 'Este punto queda fuera de la zona con datos de acceso.' };
    if (c.estado === 'sin_dato') return { estado: 'sin_dato', texto: 'No hay estimación de acceso para este punto: está fuera de la zona estudiada o en agua.' };
    const ap = aparcamiento(d.aparcamientos, c.origen);
    if (!ap) return { estado: 'sin_dato', texto: 'No se encontró el aparcamiento de este punto en los datos.' };
    const tr = await trazar(d.cab, d.lector, c.celda);
    const t2 = performance.now();
    const vertices = simplificar(tr.celdas).map((x) => centroCelda(d.cab, x));
    const linea: [number, number][] = [[lon, lat], ...vertices];
    // Con la traza completa se aparca donde acaba (la celda de vía a la que llega); si se corta, en el punto
    // representativo del aparcamiento (uno por vía y bloque de 300 m).
    const [plon, plat] = tr.completa ? linea[linea.length - 1] : [ap.lon, ap.lat];
    const via = nombreVia(ap);
    return { estado: 'ok', texto: '', linea, completa: tr.completa,
      acceso: { lat: +plat.toFixed(5), lon: +plon.toFixed(5), via, tiempo_min: c.tiempo_min, subida_m: c.subida_m },
      traza: { pasos: tr.celdas.length - 1, vertices: linea.length, completa: tr.completa, bloques: tr.bloquesLeidos },
      ms: { consulta: Math.round(t1 - t0), traza: Math.round(t2 - t1), total: Math.round(t2 - t0) }, lector: { ...d.estado } };
  } catch (e) {
    console.warn('acceso', e);
    return { estado: 'error', texto: 'No se pudieron leer los datos de acceso de este punto.' };
  }
}

/** Aviso (chip) de recinto restringido en el punto; oculto si no hay o no se puede saber. */
async function pintarRestriccion(el: HTMLElement, lat: number, lon: number, vigente: () => boolean): Promise<Restriccion[] | null> {
  el.hidden = true;
  el.replaceChildren();
  const rs = manifest ? await restriccionEn(manifest, lat, lon) : null;
  if (!vigente() || !rs?.length) return rs;
  for (const r of rs) {
    const b = document.createElement('b'); b.textContent = `⚠ ${textoChip(r)}`;
    const t = document.createElement('span'); t.textContent = r.texto;
    el.append(b, t);
  }
  el.hidden = false;
  return rs;
}

/** Ficha «Acceso» del punto: aparcamiento, tiempo y subida a pie y trazado aproximado (todo con los datos locales). */
async function mostrarAcceso(lat: number, lon: number) {
  const n = ++consultaAcceso;
  ultimoAcceso = { punto: { lat, lon }, estado: 'cargando' };
  $('#tarjeta-zona').hidden = true;
  $('#tarjeta-acceso').hidden = false;
  $('#tarjeta-acceso').dataset.estado = 'cargando';
  $('#ta-coord').textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  estadoAcceso('Calculando el acceso…', false);
  pintarTrazaAcceso([{ type: 'Feature', properties: { tipo: 'destino' }, geometry: { type: 'Point', coordinates: [lon, lat] } }]);
  const restr = pintarRestriccion($('#ta-restriccion'), lat, lon, () => n === consultaAcceso);
  const c = await calcularAcceso(lat, lon);
  const rs = await restr;
  if (n !== consultaAcceso) return;
  ultimoAcceso = { punto: { lat, lon }, estado: c.estado, acceso: c.acceso, traza: c.traza, ms: c.ms, lector: c.lector, restricciones: rs };
  $('#tarjeta-acceso').dataset.estado = c.estado;
  if (c.estado !== 'ok' || !c.acceso || !c.linea) { estadoAcceso(c.texto, false); return; }
  const { acceso, linea } = c;
  $('#ta-via').textContent = acceso.via;
  $('#ta-tiempo').textContent = textoTiempo(acceso.tiempo_min);
  $('#ta-subida').textContent = textoSubida(acceso.subida_m);
  estadoAcceso(c.completa ? '' : 'El trazado se corta antes de llegar al coche: síguelo solo como orientación.', true);
  pintarTrazaAcceso([
    { type: 'Feature', properties: { tipo: 'traza' }, geometry: { type: 'LineString', coordinates: linea } },
    { type: 'Feature', properties: { tipo: 'destino' }, geometry: { type: 'Point', coordinates: [lon, lat] } },
    { type: 'Feature', properties: { tipo: 'aparcamiento', via: acceso.via }, geometry: { type: 'Point', coordinates: [acceso.lon, acceso.lat] } },
  ]);
  encuadrar(linea);
}

/** Si el trazado no cabe en la vista (por encima de la ficha), la mueve sin acercar. */
function encuadrar(linea: [number, number][]) {
  if (!mapa) return;
  const lons = linea.map((p) => p[0]), lats = linea.map((p) => p[1]);
  const sw: [number, number] = [Math.min(...lons), Math.min(...lats)], ne: [number, number] = [Math.max(...lons), Math.max(...lats)];
  const alto = $('#tarjeta-acceso').getBoundingClientRect().height;
  const caja = mapa.getContainer().getBoundingClientRect();
  const a = mapa.project(sw), b = mapa.project(ne);
  const panel = document.querySelector('.panel-sup')?.getBoundingClientRect();
  const arriba = panel ? Math.max(24, panel.bottom - caja.top + 16) : 24;
  const dentro = (p: { x: number; y: number }) => p.x > 24 && p.x < caja.width - 24 && p.y > arriba && p.y < caja.height - alto - 40;
  if (dentro(a) && dentro(b)) return;
  mapa.fitBounds([sw, ne], { padding: { top: arriba + 20, left: 40, right: 40, bottom: alto + 50 }, maxZoom: mapa.getZoom(), duration: 400 });
}

/** https en otra pestaña; geo: con un enlace (así lo abre Android con la app elegida). */
function abrirEnlace(url: string) {
  if (url.startsWith('https:')) { window.open(url, '_blank', 'noopener'); return; }
  const a = document.createElement('a'); a.href = url; a.rel = 'noopener';
  document.body.append(a); a.click(); a.remove();
}
const ios = () => esIOS(navigator.userAgent, navigator.maxTouchPoints);

$('#ta-cerrar').addEventListener('click', cerrarAcceso);
$('#ta-coche').addEventListener('click', () => {
  const a = ultimoAcceso?.acceso;
  if (a) abrirEnlace(urlGoogleCoche(a.lat, a.lon));
});
$('#ta-otra').addEventListener('click', () => {
  const a = ultimoAcceso?.acceso;
  if (a) abrirEnlace(urlOtraApp(a.lat, a.lon, `Aparcamiento: ${a.via}`, ios()));
});
$('#ta-guardar').addEventListener('click', () => {
  if (!ultimoAcceso) return;
  const { punto, acceso } = ultimoAcceso;
  abrirSitio(null, punto, { acceso });
});

// ---------------------------------------------------------------- formulario de sitio

let editando: Sitio | null = null;
/** Búsqueda automática del aparcamiento de un sitio nuevo sin él («Sitio aquí» o Reconocer). */
let accesoSitio: { id: string; estado: 'buscando' | CalculoAcceso['estado']; promesa: Promise<void> } | null = null;
let fotoNueva: Blob | null | undefined;   // undefined = sin cambios
let urlFoto = '';

async function reducirFoto(f: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob((b) => ok(b ?? f), 'image/jpeg', 0.82));
  } catch { return f; }
}

function mostrarFoto(b?: Blob | null) {
  const img = $<HTMLImageElement>('#foto-sitio');
  if (urlFoto) URL.revokeObjectURL(urlFoto);
  urlFoto = b ? URL.createObjectURL(b) : '';
  img.src = urlFoto; img.hidden = !b;
}

/** Si la especie no está entre las del mapa (p. ej. una ficha de la guía desde Reconocer), añade su opción. */
function asegurarOpcion(sel: HTMLSelectElement, id: string) {
  if (!id || [...sel.options].some((o) => o.value === id)) return;
  sel.add(new Option(nombres[id] ?? id, id));
}

function abrirSitio(s: Sitio | null, punto?: { lat: number; lon: number }, previo?: { especie?: string; foto?: Blob; acceso?: AccesoSitio }) {
  const frm = $<HTMLFormElement>('#frm-sitio');
  frm.reset();
  fotoNueva = undefined;
  editando = s ?? { id: nuevoId(), lat: punto!.lat, lon: punto!.lon, estrellas: 1, nota: '',
    especie: previo?.especie ?? ($<HTMLSelectElement>('#sel-especie').value || ''), fecha: new Date().toISOString(),
    ...(previo?.acceso ? { acceso: previo.acceso } : {}) };
  asegurarOpcion($<HTMLSelectElement>('#sitio-especie'), editando.especie);
  $('#tit-sitio').textContent = s ? 'Editar sitio' : 'Nuevo sitio';
  $('#coord-sitio').textContent = `${editando.lat.toFixed(5)}, ${editando.lon.toFixed(5)} · ${new Date(editando.fecha).toLocaleString('es-ES')}`;
  $('#acceso-sitio').textContent = editando.acceso ? textoAccesoSitio(editando.acceso) : '';
  $('#acceso-sitio').hidden = !editando.acceso;
  $('#acceso-sitio').dataset.estado = editando.acceso ? 'ok' : '';
  const sitio = editando;
  pintarRestriccion($('#sitio-restriccion'), sitio.lat, sitio.lon, () => editando === sitio);
  accesoSitio = null;
  if (!s && !sitio.acceso) buscarAccesoSitio(sitio);
  (frm.elements.namedItem('nota') as HTMLTextAreaElement).value = editando.nota;
  (frm.elements.namedItem('especie') as HTMLSelectElement).value = editando.especie;
  frm.querySelector<HTMLInputElement>(`input[name=estrellas][value="${editando.estrellas}"]`)!.checked = true;
  $('#btn-sitio-borrar').hidden = !s;
  mostrarFoto(editando.foto);
  $<HTMLDialogElement>('#dlg-sitio').showModal();
  if (previo?.foto) reducirFoto(previo.foto).then((b) => { fotoNueva = b; mostrarFoto(b); });
}

/** Como la pulsación larga, pero para el formulario: rellena el aparcamiento del sitio nuevo (también sin red, desde OPFS). */
function buscarAccesoSitio(sitio: Sitio) {
  const el = $('#acceso-sitio');
  el.hidden = false; el.dataset.estado = 'buscando';
  el.textContent = 'Buscando dónde aparcar…';
  const b: NonNullable<typeof accesoSitio> = { id: sitio.id, estado: 'buscando', promesa: Promise.resolve() };
  b.promesa = calcularAcceso(sitio.lat, sitio.lon).then((c) => {
    b.estado = c.estado;
    if (editando !== sitio) return;
    el.dataset.estado = c.estado;
    if (c.acceso) { sitio.acceso = c.acceso; el.textContent = textoAccesoSitio(c.acceso); }
    else el.textContent = `Sin aparcamiento estimado: ${c.texto[0].toLowerCase()}${c.texto.slice(1)}`;
  });
  accesoSitio = b;
}

$<HTMLInputElement>('[name=foto]').addEventListener('change', async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  fotoNueva = await reducirFoto(f);
  mostrarFoto(fotoNueva);
});
$('#btn-sitio-cancelar').addEventListener('click', () => $<HTMLDialogElement>('#dlg-sitio').close());
$('#btn-sitio-borrar').addEventListener('click', async () => {
  if (!editando || !confirm('¿Borrar este sitio? No se puede deshacer.')) return;
  await borrarSitio(editando.id);
  $<HTMLDialogElement>('#dlg-sitio').close();
  await refrescarSitios();
  avisar('Sitio borrado');
});
$('#frm-sitio').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!editando) return;
  const frm = e.target as HTMLFormElement;
  // Si aún se busca el aparcamiento, se espera un poco (es local: suele tardar menos de un segundo).
  if (accesoSitio?.id === editando.id && accesoSitio.estado === 'buscando')
    await Promise.race([accesoSitio.promesa, new Promise((r) => setTimeout(r, 5000))]);
  const d = new FormData(frm);
  const s: Sitio = { ...editando, estrellas: Number(d.get('estrellas')) as 1 | 2 | 3,
    nota: String(d.get('nota') ?? ''), especie: String(d.get('especie') ?? '') };
  if (fotoNueva !== undefined) { if (fotoNueva) s.foto = fotoNueva; else delete s.foto; }
  await guardarSitio(s);
  $<HTMLDialogElement>('#dlg-sitio').close();
  await refrescarSitios();
  avisar('Sitio guardado');
});

// ---------------------------------------------------------------- Mis sitios

const textoAccesoSitio = (a: AccesoSitio) => `Aparcar en ${a.via} · ${textoTiempo(a.tiempo_min)} a pie, ${textoSubida(a.subida_m)} de subida`;

async function refrescarSitios() {
  const l = await listarSitios();
  pintarSitiosMapa(l);
  if ($('#p-sitios').classList.contains('activa')) pintarLista(l);
}

const urlsLista: string[] = [];
async function pintarLista(l?: Sitio[]) {
  const todos = l ?? await listarSitios();
  const filtro = $<HTMLSelectElement>('#filtro-especie').value;
  const lista = filtro ? todos.filter((s) => s.especie === filtro) : todos;
  urlsLista.splice(0).forEach((u) => URL.revokeObjectURL(u));
  const ul = $('#lista-sitios');
  ul.replaceChildren();
  if (!lista.length) {
    const li = document.createElement('li'); li.className = 'vacio';
    li.textContent = todos.length ? 'Ningún sitio con esa especie.' : 'Aún no hay sitios. Usa «Sitio aquí» o mantén pulsado el mapa.';
    ul.append(li); return;
  }
  for (const s of lista) {
    const li = document.createElement('li'); li.className = 'sitio';
    const est = document.createElement('div'); est.className = 'est'; est.textContent = '★'.repeat(s.estrellas) + '☆'.repeat(3 - s.estrellas);
    const meta = document.createElement('div'); meta.className = 'meta';
    meta.textContent = `${nombres[s.especie] ?? 'Sin especie'} · ${new Date(s.fecha).toLocaleDateString('es-ES')}`;
    li.append(est);
    if (s.foto) { const img = document.createElement('img'); const u = URL.createObjectURL(s.foto); urlsLista.push(u); img.src = u; img.alt = ''; li.append(img); }
    li.append(meta);
    if (s.acceso) { const t = document.createElement('div'); t.className = 'acceso'; t.textContent = textoAccesoSitio(s.acceso); li.append(t); }
    if (s.nota) { const t = document.createElement('div'); t.className = 'txt'; t.textContent = s.nota; li.append(t); }
    const acc = document.createElement('div'); acc.className = 'acciones';
    const ver = document.createElement('button'); ver.className = 'btn'; ver.textContent = 'Ver en mapa';
    ver.onclick = () => { irA('p-mapa'); mapa?.flyTo({ center: [s.lon, s.lat], zoom: 15 }); };
    const ed = document.createElement('button'); ed.className = 'btn'; ed.textContent = 'Editar';
    ed.onclick = () => abrirSitio(s);
    const ir = document.createElement('button'); ir.className = 'btn'; ir.textContent = 'Cómo llegar';
    ir.title = s.acceso ? 'En coche hasta el aparcamiento guardado (Google Maps)' : 'En coche hasta el sitio (Google Maps)';
    ir.onclick = () => abrirEnlace(urlGoogleCoche(s.acceso?.lat ?? s.lat, s.acceso?.lon ?? s.lon));
    acc.append(ver, ir, ed); li.append(acc);
    ul.append(li);
  }
}
$('#filtro-especie').addEventListener('change', () => pintarLista());

function bajar(texto: string, nombre: string, tipo: string) {
  const u = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = document.createElement('a'); a.href = u; a.download = nombre;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 10000);
}
const hoy = () => new Date().toISOString().slice(0, 10);
$('#btn-gpx').addEventListener('click', async () =>
  bajar(aGPX(await listarSitios(), nombres), `mis-sitios-${hoy()}.gpx`, 'application/gpx+xml'));
$('#btn-json').addEventListener('click', async () =>
  bajar(await aJSON(await listarSitios()), `mis-sitios-${hoy()}.json`, 'application/json'));
$<HTMLInputElement>('#inp-importar').addEventListener('change', async (e) => {
  const inp = e.target as HTMLInputElement;
  const f = inp.files?.[0];
  inp.value = '';
  if (!f) return;
  try {
    const txt = await f.text();
    const { sitios: l, descartados } = /\.json$/i.test(f.name) || txt.trimStart().startsWith('{')
      ? deJSON(txt) : { sitios: deGPX(txt), descartados: 0 };
    await guardarVarios(l);
    await refrescarSitios();
    avisar(descartados ? `Importados ${l.length}, descartados ${descartados}` : `Importados ${l.length} sitios`, descartados ? 5000 : 3500);
  } catch (err) {
    avisar(`No se pudo importar: ${(err as Error).message}`, 5000);
  }
});

// ---------------------------------------------------------------- Zona: tiempo y semáforo

let puntosMeteo: PuntoMeteo[] = [];
let meteo: DatosMeteo | null = null;
let meteoOrigen: 'red' | 'cache' | 'ninguno' = 'ninguno';
let puntoSel: PuntoMeteo | null = null;
const CLAVE_PUNTO = 'setas:punto-meteo';
const DISTANCIA_MAX_KM = 12;

const especieSel = () => $<HTMLSelectElement>('#sel-especie').value;
const reglasDe = (id: string) => manifest?.especies.find((e) => e.id === id)?.tiempo;

function estadoEn(p: PuntoMeteo, especie: string): ResultadoSemaforo | null {
  const r = reglasDe(especie);
  const serie = meteo?.puntos[String(p.id)];
  if (!r || !serie || !meteo) return null;
  return semaforo(serie, r, hoyZona(), { edadHoras: edadHoras(meteo) });
}

function fechasTexto(r: ResultadoSemaforo): string {
  if (r.estado === 'verde' && r.hasta) return `Hasta el ${ddmm(r.hasta)} aprox.`;
  if (r.estado === 'amarillo' && r.desde) return `Desde el ${ddmm(r.desde)} aprox.`;
  if (r.estado === 'amarillo' && r.hasta) return `Ventana hasta el ${ddmm(r.hasta)} aprox.`;
  return '';
}

function pintarSemaforoMapa() {
  if (!mapa?.getLayer('semaforo')) return;
  const especie = especieSel();
  const estados: Record<number, ResultadoSemaforo['estado']> = {};
  for (const p of puntosMeteo) { const r = estadoEn(p, especie); if (r) estados[p.id] = r.estado; }
  colorearSemaforo(mapa, expresionColores(estados));
}

function pintarPuntoMapa() {
  const src = mapa?.getSource('punto-meteo') as GeoJSONSource | undefined;
  src?.setData({ type: 'FeatureCollection', features: puntoSel ? [{ type: 'Feature', properties: {},
    geometry: { type: 'Point', coordinates: [puntoSel.lon, puntoSel.lat] } }] : [] });
}

function elegirPunto(lat: number, lon: number, conTarjeta: boolean) {
  const p = puntoMasCercano(puntosMeteo, lat, lon);
  if (!p) return;
  const km = Math.hypot(p.lat - lat, (p.lon - lon) * Math.cos((lat * Math.PI) / 180)) * 111.2;
  if (km > DISTANCIA_MAX_KM) return;
  puntoSel = p;
  localStorage.setItem(CLAVE_PUNTO, String(p.id));
  pintarPuntoMapa();
  if (conTarjeta) { if (!$('#tarjeta-acceso').hidden) cerrarAcceso(); $('#tarjeta-zona').hidden = false; }
  pintarTarjeta();
}

function pintarTarjeta() {
  if ($('#tarjeta-zona').hidden || !puntoSel) return;
  const r = estadoEn(puntoSel, especieSel());
  $('#tz-estado').textContent = r ? `${ICONO_ESTADO[r.estado]} ${nombres[especieSel()]}: ${NOMBRE_ESTADO[r.estado]}`
    : `${nombres[especieSel()]}: sin datos del tiempo`;
  $('#tz-motivo').textContent = r ? [r.motivo, fechasTexto(r)].filter(Boolean).join(' · ') : 'Conéctate y pulsa «Actualizar tiempo» en Zona.';
}
$('#tz-cerrar').addEventListener('click', () => ($('#tarjeta-zona').hidden = true));
$('#tz-ver').addEventListener('click', () => irA('p-zona'));
$('#zona-ir-mapa').addEventListener('click', () => irA('p-mapa'));

function pintarEstadoMeteo() {
  const el = $('#estado-meteo');
  if (!meteo) { el.textContent = navigator.onLine ? 'Sin datos del tiempo todavía.' : 'Sin conexión y sin datos del tiempo guardados.'; return; }
  const h = edadHoras(meteo);
  const cuando = `actualizado ${haceTexto(h)} (${new Date(meteo.fecha_consulta).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })})`;
  el.textContent = (navigator.onLine ? `Tiempo ${cuando}` : `Sin conexión: último dato guardado, ${cuando}`)
    + (h > CADUCIDAD_H ? ' · datos antiguos' : '');
  el.classList.toggle('antiguo', h > CADUCIDAD_H);
}

/** Indicadores de humedad acumulada del punto y pista de altitud para la especie elegida. */
function pintarHumedad(serie: DatosMeteo['puntos'][string] | undefined, p: PuntoMeteo, especie: string) {
  const caja = $('#zona-humedad');
  caja.hidden = !serie;
  if (!serie) return;
  const hoy = hoyZona();
  const h = humedadAcumulada(serie, hoy);
  const n = (v: number, d = 0) => v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }).replace('-', '−');
  $('#ind-balance b').textContent = Number.isFinite(h.balance_mm) ? `${h.balance_mm > 0 ? '+' : ''}${n(h.balance_mm)} mm` : 'sin dato';
  $('#ind-dias b').textContent = `${h.dias_lluvia} de 30`;
  $('#ind-suelo b').textContent = Number.isFinite(h.suelo) ? n(h.suelo, 2) : 'sin dato';
  const reg = reglasDe(especie);
  const txt = reg ? textoBanda(bandaAltitud(serie, hoy, reg, p.alt_media), p.alt_media) : '';
  const banda = $('#zona-banda');
  banda.hidden = !txt;
  banda.textContent = txt ? `Para ${nombres[especie] ?? especie}: ${txt[0].toLowerCase()}${txt.slice(1)}` : '';
  $('#ley-suelo').hidden = !serie.some((d) => Number.isFinite(d.suelo));
}

function pintarZona() {
  pintarEstadoMeteo();
  $<HTMLButtonElement>('#btn-meteo').disabled = !navigator.onLine;
  const ul = $('#lista-semaforo');
  ul.replaceChildren();
  const graf = $('#zona-grafico');
  $('#zona-ir-mapa').hidden = !!puntoSel;
  if (!puntoSel) { $('#zona-punto').textContent = 'Toca el mapa para elegir una zona.'; graf.hidden = true; return; }
  $('#zona-punto').textContent = `Zona del punto ${puntoSel.id} · ${puntoSel.lat.toFixed(3)}, ${puntoSel.lon.toFixed(3)} · bosque a ~${puntoSel.alt_media} m de altitud media`;
  const elegida = especieSel();
  const orden = [...(manifest?.especies ?? [])].sort((a, b) => Number(b.id === elegida) - Number(a.id === elegida));
  for (const e of orden) {
    const r = estadoEn(puntoSel, e.id);
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.className = 'semaforo-fila' + (e.id === elegida ? ' elegida' : '');
    b.dataset.especie = e.id;
    b.dataset.estado = r?.estado ?? 'gris';
    const ic = document.createElement('span'); ic.className = 'ic'; ic.textContent = ICONO_ESTADO[r?.estado ?? 'gris'];
    const esp = document.createElement('span'); esp.className = 'esp'; esp.textContent = e.nombre;
    const est = document.createElement('span'); est.className = 'est'; est.textContent = r ? NOMBRE_ESTADO[r.estado] : 'Sin datos del tiempo';
    const mot = document.createElement('span'); mot.className = 'mot'; mot.textContent = r?.motivo ?? '';
    b.append(ic, esp, est, mot);
    const f = r ? fechasTexto(r) : '';
    if (f) { const fe = document.createElement('span'); fe.className = 'fechas'; fe.textContent = f; b.append(fe); }
    b.addEventListener('click', () => {
      const sel = $<HTMLSelectElement>('#sel-especie');
      if (sel.value === e.id) return;
      sel.value = e.id;
      sel.dispatchEvent(new Event('change'));
      pintarZona();
    });
    li.append(b); ul.append(li);
  }
  const serie = meteo?.puntos[String(puntoSel.id)];
  graf.hidden = !serie;
  pintarHumedad(serie, puntoSel, elegida);
  if (!serie) return;
  const hoyF = hoyZona();
  const r = estadoEn(puntoSel, elegida);
  const reg = reglasDe(elegida);
  const ventana = r?.episodio && reg ? { desde: sumarDias(r.episodio, reg.ventana_dias[0]), hasta: sumarDias(r.episodio, reg.ventana_dias[1]),
    etiqueta: `ventana ${nombres[elegida]?.split(' ')[1] ?? ''}`.trim() } : null;
  pintarGrafico($('#grafico'), serie, hoyF, ventana, (t) => ($('#grafico-dato').textContent = t));
  const tabla = $<HTMLTableElement>('#tabla-dias');
  tabla.replaceChildren();
  const cab = tabla.insertRow();
  const conSuelo = serie.some((d) => Number.isFinite(d.suelo));
  for (const t of ['Día', 'Lluvia (mm)', 'Máx (°C)', 'Mín (°C)', ...(conSuelo ? ['Suelo (m³/m³)'] : [])]) { const th = document.createElement('th'); th.textContent = t; cab.append(th); }
  const n1 = (v: number) => (Number.isFinite(v) ? v.toLocaleString('es-ES', { maximumFractionDigits: 1 }) : '—');
  const n2 = (v: number | undefined) => (Number.isFinite(v) ? (v as number).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
  for (const d of serie) {
    const tr = tabla.insertRow();
    tr.className = d.fecha === hoyF ? 'hoy' : d.fecha > hoyF ? 'prev' : '';
    for (const v of [ddmm(d.fecha) + (d.fecha === hoyF ? ' hoy' : ''), n1(d.lluvia), n1(d.tmax), n1(d.tmin), ...(conSuelo ? [n2(d.suelo)] : [])]) tr.insertCell().textContent = v;
  }
}

function repintarMeteo() {
  pintarSemaforoMapa();
  pintarTarjeta();
  if ($('#p-zona').classList.contains('activa')) pintarZona();
}

async function cargarMeteo(forzar: boolean) {
  if (!puntosMeteo.length) return;
  const btn = $<HTMLButtonElement>('#btn-meteo');
  if (forzar) { btn.disabled = true; $('#estado-meteo').textContent = 'Consultando el tiempo…'; }
  const r = await obtener(puntosMeteo, { forzar });
  meteo = r.datos;
  meteoOrigen = r.origen;
  document.body.dataset.meteo = r.origen;
  if (r.error && forzar) avisar(`No se pudo actualizar el tiempo: ${r.error}${meteo ? '. Se muestra el último dato guardado.' : ''}`, 5000);
  else if (forzar && !navigator.onLine) avisar('Sin conexión: se muestra el último dato guardado.');
  btn.disabled = !navigator.onLine;
  repintarMeteo();
  pintarEstadoMeteo();
}

async function iniciarMeteo() {
  if (!manifest?.meteo) return;
  puntosMeteo = (await cargarJson<PuntoMeteo[]>(manifest.meteo.puntos)) ?? [];
  const guardado = localStorage.getItem(CLAVE_PUNTO);
  puntoSel = puntosMeteo.find((p) => String(p.id) === guardado) ?? null;
  pintarPuntoMapa();
  await cargarMeteo(false);
}
$('#btn-meteo').addEventListener('click', () => cargarMeteo(true));
window.addEventListener('online', () => { if ($('#p-zona').classList.contains('activa')) pintarZona(); });
window.addEventListener('offline', () => { if ($('#p-zona').classList.contains('activa')) pintarZona(); });

// ---------------------------------------------------------------- Ajustes / descargas

function pintarEstadoGuia(e: EstadoFotos = fotosSinConexion()) {
  const el = $('#estado-guia');
  const completas = e.total > 0 && e.guardadas === e.total;
  el.textContent = !e.total ? (navigator.onLine ? 'Preparando la guía…' : 'Sin conexión: la guía no está guardada todavía.')
    : completas ? `Guía lista sin cobertura: textos y ${e.total} fotos guardados.`
    : e.trabajando ? `Guardando fotos de la guía… ${e.guardadas} de ${e.total}`
    : `Fotos de la guía guardadas: ${e.guardadas} de ${e.total}.${navigator.onLine ? '' : ' Faltan; conéctate para completarlas.'}`;
  $<HTMLButtonElement>('#btn-guia-fotos').hidden = completas || e.trabajando || !e.total;
  $<HTMLButtonElement>('#btn-guia-fotos').disabled = !navigator.onLine;
}
$('#btn-guia-fotos').addEventListener('click', () => guardarFotosSinConexion(pintarEstadoGuia));
$('#creditos-fotos').addEventListener('toggle', () => pintarCreditos());

async function pintarAjustes() {
  pintarEstadoGuia();
  pintarAjustesModelo();
  const est = estadoDescarga();
  const btn = $<HTMLButtonElement>('#btn-descargar');
  const total = manifest?.total_bytes ?? 0;
  btn.textContent = `Descargar mapas para uso sin cobertura (${mb(total)})`;
  btn.disabled = !manifest || !navigator.onLine;
  if (est) {
    const desfasado = manifest && manifest.generado !== est.generado;
    $('#estado-descarga').textContent = `Descargado el ${new Date(est.fecha).toLocaleString('es-ES')} · ${mb(est.bytes)}`
      + (desfasado ? ' · hay una versión más nueva' : '');
    btn.textContent = desfasado ? `Actualizar mapas (${mb(total)})` : `Volver a descargar (${mb(total)})`;
  } else {
    $('#estado-descarga').textContent = 'No descargado: sin cobertura el mapa no se verá.';
  }
  $('#btn-borrar-mapas').hidden = !est;
  const persist = await navigator.storage?.persisted?.().catch(() => false);
  const q = await navigator.storage?.estimate?.().catch(() => undefined);
  $('#estado-almacen').textContent = `Almacenamiento persistente: ${persist ? 'sí' : 'no'}`
    + (q?.usage != null ? ` · en uso ${mb(q.usage)}${q.quota ? ` de ${mb(q.quota)}` : ''}` : '');
  const nr = manifest?.restricciones;
  $('#normativa').hidden = !nr;
  if (nr) {
    $('#normativa-aviso').textContent = nr.aviso;
    const ul = $('#normativa-tipos');
    ul.replaceChildren(...Object.values(nr.tipos).map((t) => { const li = document.createElement('li'); li.textContent = t; return li; }));
    $('#normativa-orientativo').textContent = ORIENTATIVO;
  }
  $('#info-datos').textContent = manifest
    ? `Total de datos offline: ${mb(total)} (${manifest.archivos.length} archivos). Generados el ${new Date(manifest.generado).toLocaleDateString('es-ES')}. Mapa base: ${manifest.base ?? '—'}.`
    : 'Sin datos de mapas.';
}

$('#btn-descargar').addEventListener('click', async () => {
  if (!manifest) return;
  const btn = $<HTMLButtonElement>('#btn-descargar');
  const prog = $<HTMLProgressElement>('#prog-descarga');
  btn.disabled = true; prog.hidden = false; prog.value = 0;
  try {
    const { persistente } = await descargarMapas(manifest, BASE_DATOS, (h, t) => {
      prog.value = h / t;
      $('#estado-descarga').textContent = `Descargando… ${mb(h)} de ${mb(t)}`;
    });
    recargarTrasCambioDeMapas(persistente ? 'Mapas actualizados' : 'Mapas actualizados (el navegador podría borrarlos si falta espacio)');
  } catch (err) {
    avisar(`Error en la descarga: ${(err as Error).message}${estadoDescarga() ? '. Los mapas anteriores siguen disponibles.' : ''}`, 6000);
    prog.hidden = true;
    pintarAjustes();
  }
});
$('#btn-borrar-mapas').addEventListener('click', async () => {
  if (!confirm('¿Borrar los mapas descargados? Sin cobertura no se verá el mapa.')) return;
  await borrarMapas();
  recargarTrasCambioDeMapas('Mapas borrados');
});
window.addEventListener('online', () => { pintarAjustes(); guardarFotosSinConexion(pintarEstadoGuia); });
window.addEventListener('offline', () => pintarAjustes());

iniciarReconocer({
  manifest: () => manifest,
  avisar,
  verFicha: (id) => { irA('p-guia'); abrirFicha(id); },
  guardarSitio: ({ especieGuia, foto, lat, lon }) => abrirSitio(null, { lat, lon },
    { especie: especieGuia ? especieMapaDeFicha(especieGuia, (manifest?.especies ?? []).map((e) => e.id)) : '', foto }),
});

iniciarMapa().then(pintarAjustes).finally(() => guardarFotosSinConexion(pintarEstadoGuia));
