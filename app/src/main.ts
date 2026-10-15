import 'maplibre-gl/dist/maplibre-gl.css';
import './estilos.css';
import { registerSW } from 'virtual:pwa-register';
import type { Map as MapaML, GeoJSONSource, LngLat } from 'maplibre-gl';
import { baseDatos, cargarJson, cargarManifest, mb } from './datos';
import { cargarRegiones, claveRegion, establecerActiva, hayRegionActiva, regionActiva, resolverRegion, type RegionIndice } from './region';
import { migrarARegiones } from './migracion';
import type { EntradaLegal, ManifestApp } from './manifest-region';
import { PENDIENTE, textoCupo, vistaNormativa } from './normativa';
import type { Base } from './mapa';
// MapLibre (≈1 MB) va en su propio trozo y se carga al arrancar el mapa: el resto de la app se pinta antes.
let M: typeof import('./mapa') | null = null;
import { textoChip, type Restriccion } from './restricciones';
import { altitudes, aparcamiento, centroCelda, consultar, nombreVia, simplificar, textoSubida, textoTiempo, trazar, urlGoogleCoche, type Celda } from './acceso';
import { dificultad, NOMBRE_DIFICULTAD, perfil, seguir, textoDistancia, type Dificultad, type Perfil, type Seguimiento } from './ruta';
import { pintarPerfil } from './perfil-grafico';
import { iniciarHoy, pintarHoy, resumenHoy, sitiosCandidatos } from './hoy-ui';
import { diasEspecie, puntoReferencia, referenciaVista, ventanaEspecie, type PuntoRef, type Vista } from './ventana-especie';
import { detallesTitularidad, esPublico, normaTitularidad, notaTitularidad, ponerTextosTitularidad, TEXTO_TITULARIDAD, textoTitularidad, type Titularidad } from './titularidad';
import { AVISO_CITAS, COLOR_ORIGEN, NOMBRE_ORIGEN, ORIGENES_CITA } from './citas';
import { bloqueCuando } from './ventana-ui';
import type { SitiosJson } from './ranking';
import { datosAcceso } from './acceso-datos';
import { iniciarSelectorEspecie, ordenSelector, pintarSelectorEspecie } from './selector-especie';
import { Gps } from './gps';
import { borrarMapas, descargarMapas, estadoDescarga, moverEnOpfs } from './opfs';
import { borrarSitio, guardarSitio, guardarVarios, leerSitio, listarSitios } from './sitios';
import { aGPX, aJSON, deGPX, deJSON, nuevoId } from './intercambio';
import type { AccesoSitio, Sitio } from './tipos';
import type { Feature } from 'geojson';
import { claveMeteo, edadHoras, fechaMadrid, obtener, renombrarCache, CADUCIDAD_H, type DatosMeteo, type PuntoMeteo } from './meteo';
import { bandaAltitud, ddmm, humedadAcumulada, semaforo, sumarDias, textoBanda, type ResultadoSemaforo } from './semaforo';
import { expresionColores, haceTexto, NOMBRE_ESTADO, puntoMasCercano } from './zona';
import { pintarGrafico } from './grafico';
import { abrirFicha, cargarGuia, fichasGuia, fotosSinConexion, guardarFotosSinConexion, hayFicha, mostrarGuia, pintarCreditos, ponerBloqueTiempo, type EstadoFotos } from './guia-ui';
import { binomio, especieMapaDeFicha, fichaDeEspecieMapa } from './guia';
import { iniciarReconocer, mostrarReconocer, pintarAjustesModelo } from './reconocer-ui';
import { Hoja } from './hoja';

registerSW({ immediate: true });

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
/** Texto de una cifra grande: los números en <b> (más grandes), las unidades normales. textContent no cambia. */
function cifra(el: HTMLElement, texto: string) {
  el.replaceChildren(...texto.split(/(\d[\d.,]*)/).filter(Boolean).map((t) => {
    if (!/^\d/.test(t)) return t;
    const b = document.createElement('b'); b.textContent = t; return b;
  }));
}
let manifest: ManifestApp | null = null;
let regiones: RegionIndice[] = [];
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
  if (id === 'p-hoy') pintarHoy();
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
  localStorage.setItem(claveRegion('capa'), JSON.stringify({ especie, umbral }));
  M!.ponerIdoneidad(mapa, especie, umbral);
  M!.verCapa(mapa, ['idoneidad'], $<HTMLInputElement>('[data-capa=idoneidad]').checked);
  pintarSemaforoMapa();
  pintarTarjeta();
  pintarBotonFicha();
  pintarSelectorEspecie();
  aplicarFiltroCitas();
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

const CAPAS = (): Record<string, string[]> => ({
  sombreado: ['sombreado'], curvas: ['curvas', 'curvas-cota'],
  protegidos: ['protegidos-relleno', 'protegidos-linea'], idoneidad: ['idoneidad'], semaforo: ['semaforo'],
  rutas: M!.CAPAS_RUTAS, restricciones: M!.CAPAS_RESTRICCIONES,
  titularidad: M!.CAPAS_TITULARIDAD, solo_publicos: M!.CAPAS_SOLO_PUBLICOS, citas: M!.CAPAS_CITAS,
});

// «Solo montes públicos»: un interruptor en el mapa (velo sobre lo demás) y otro en el Top del día; comparten preferencia.
const CLAVE_SOLO_PUBLICOS = 'setas:solo-publicos';
function soloPublicos(): boolean { try { return localStorage.getItem(CLAVE_SOLO_PUBLICOS) === '1'; } catch { return false; } }
function ponerSoloPublicos(v: boolean) {
  try { localStorage.setItem(CLAVE_SOLO_PUBLICOS, v ? '1' : '0'); } catch { /* solo esta sesión */ }
  for (const c of document.querySelectorAll<HTMLInputElement>('[data-capa=solo_publicos], #hoy-solo-publicos')) c.checked = v;
  if (mapa) M!.verCapa(mapa, M!.CAPAS_SOLO_PUBLICOS, v);
}

/** Citas: solo la seta del mapa salvo «todas las especies». */
function aplicarFiltroCitas() {
  if (!mapa || !M) return;
  M.filtrarCitas(mapa, $<HTMLInputElement>('#citas-todas').checked ? null : $<HTMLSelectElement>('#sel-especie').value);
}

function pintarSitiosMapa(lista: Sitio[]) {
  const src = mapa?.getSource('sitios') as GeoJSONSource | undefined;
  src?.setData({ type: 'FeatureCollection', features: lista.map((s) => ({
    type: 'Feature', properties: { id: s.id, estrellas: s.estrellas },
    geometry: { type: 'Point', coordinates: [s.lon, s.lat] } })) });
}

async function iniciarMapa() {
  manifest = await cargarManifest();
  if (!manifest) { $('#sin-datos').hidden = false; return; }
  const atrib = manifest.atribuciones.mapa ? `Datos: ${manifest.atribuciones.mapa}` : '';
  $('#atrib-datos').textContent = atrib;
  $('#atrib-inicio').textContent = atrib;
  ponerTextosTitularidad(manifest.titularidad);
  $('#leyenda-monte-junta').textContent = TEXTO_TITULARIDAD.monte_junta;
  $('#leyenda-monte-municipal').textContent = TEXTO_TITULARIDAD.monte_municipal;
  for (const e of manifest.especies) nombres[e.id] = e.nombre;
  iniciarSelectorEspecie(() => manifest?.especies ?? [], { estadoHoy: estadoHoyRef, hoy: hoyZona, lugar: lugarRef });
  cargarGuia().then((ok) => { if (ok) for (const f of fichasGuia()) nombres[f.id] ??= binomio(f); pintarSelectorEspecie(); });
  rellenarEspecies($<HTMLSelectElement>('#sel-especie'));
  rellenarEspecies($<HTMLSelectElement>('#filtro-especie'), ['', 'Todas']);
  rellenarEspecies($<HTMLSelectElement>('#sitio-especie'), ['', 'Sin especificar']);
  $('#capa-rutas').hidden = !manifest.rutas;
  $('#capa-restricciones').hidden = !manifest.restricciones;
  for (const s of ['#capa-titularidad', '#capa-solo-publicos', '#leyenda-titularidad']) $(s).hidden = !manifest.titularidad;
  for (const s of ['#capa-citas', '#leyenda-citas']) $(s).hidden = !manifest.citas;
  $('#hoy-solo-publicos-campo').hidden = !manifest.titularidad;
  $('#leyenda-titularidad-nota').textContent = notaTitularidad();
  $('#leyenda-citas-nota').textContent = AVISO_CITAS;
  $('#leyenda-citas-lista').replaceChildren(...ORIGENES_CITA.map((o) => {
    const li = document.createElement('li'); li.dataset.origen = o;
    const m = document.createElement('span'); m.className = 'muestra-origen'; m.setAttribute('aria-hidden', 'true'); m.style.setProperty('--c', COLOR_ORIGEN[o]);
    const n = manifest!.citas?.por_origen?.[o];
    li.append(m, `${NOMBRE_ORIGEN[o]}${n != null ? ` (${n})` : ''}`);
    return li;
  }));
  M = await import('./mapa');
  M.ponerNombresEspecie((id) => nombres[id] ?? id);
  $('#rampa').style.background = `linear-gradient(90deg, ${M.COLORES_IDONEIDAD.join(',')})`;
  try {
    const g = JSON.parse(localStorage.getItem(claveRegion('capa')) ?? 'null');
    if (g && manifest.especies.some((e) => e.id === g.especie)) {
      $<HTMLSelectElement>('#sel-especie').value = g.especie;
      $<HTMLInputElement>('#rng-umbral').value = String(g.umbral);
    }
  } catch { /* preferencia corrupta: se ignora */ }
  pintarSelectorEspecie();

  mapa = M.crearMapa($('#mapa'), manifest);
  gps = new Gps(mapa, (m) => avisar(m));
  if (import.meta.env.DEV || E2E) (window as any).__setas = { mapa, origenes: M.origenes,
    region: () => ({ activa: regionActiva(), regiones: regiones.map((r) => r.id) }), meteo: () => ({ datos: meteo, origen: meteoOrigen, punto: puntoSel }),
    acceso: () => ultimoAcceso, trazaAcceso: () => trazaAcceso, hoy: hoyZona, tops: resumenHoy, selector: ordenSelector, puntoRef: refPunto,
    ruta: () => rutaActual && { ...rutaActual, perfil: { ...rutaActual.perfil } }, seguimiento: () => seguimiento,
    restriccionEn: (lat: number, lon: number) => manifest && M!.restriccionEn(manifest, lat, lon),
    titularidadEn: (lat: number, lon: number) => manifest && M!.titularidadEn(manifest, lat, lon),
    olvidarGps: () => { if (gps) gps.ultima = null; }, vista: vistaMapa,
    lugarHoy: (id: string) => lugarRef(id),
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
    ponerSoloPublicos(soloPublicos());
    aplicarFiltroCitas();
    document.body.dataset.mapa = 'listo';
  });
  $('#sel-especie').addEventListener('change', aplicarIdoneidad);
  $('#rng-umbral').addEventListener('input', aplicarIdoneidad);
  document.querySelectorAll<HTMLInputElement>('[data-capa]').forEach((c) =>
    c.addEventListener('change', () => {
      if (c.dataset.capa === 'solo_publicos') { ponerSoloPublicos(c.checked); return; }
      if (mapa) M!.verCapa(mapa, CAPAS()[c.dataset.capa!], c.checked);
      if (c.dataset.capa === 'citas') $('#citas-opciones').hidden = !c.checked;
    }));
  $('#citas-todas').addEventListener('change', aplicarFiltroCitas);
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
  if (base !== quiere && avisarSiCae) avisar('La vista satélite necesita conexión');
  const somb = $<HTMLInputElement>('[data-capa=sombreado]');
  somb.disabled = base === 'satelite';
  somb.closest('label')?.classList.toggle('desactivada', somb.disabled);
  document.querySelectorAll<HTMLInputElement>('input[name=base]').forEach((r) => (r.checked = r.value === base));
  M!.ponerBase(mapa, base, somb.checked);
  document.body.dataset.base = base;
}

// ---------------------------------------------------------------- cromo del mapa: hojas, capas, «Aquí» y pista

const hojaCapas = new Hoja($('#capas'), $('#capas .hoja-asa'), { retenes: (h) => [h], cerrable: true,
  alCerrar: () => $('#btn-capas').setAttribute('aria-expanded', 'false') });
new Hoja($('#tarjeta-acceso'), $('#tarjeta-acceso .hoja-asa'), { retenes: () => [92, 2000], inicial: 1, cerrable: true, alCerrar: () => cerrarAcceso() });
new Hoja($('#tarjeta-ruta'), $('#tarjeta-ruta .hoja-asa'), { retenes: (h) => [92, Math.min(h, 330), h], inicial: 1, cerrable: true, alCerrar: () => cerrarRuta() });
void hojaCapas;
function abrirCapas(abrir: boolean) {
  $('#capas').hidden = !abrir;
  $('#btn-capas').setAttribute('aria-expanded', String(abrir));
}
$('#btn-capas').addEventListener('click', () => abrirCapas(!!$('#capas').hidden));
$('#capas-cerrar').addEventListener('click', () => abrirCapas(false));

/** body[data-hoja] (oculta los botones flotantes y la pista) y body[data-zona] (los sube sobre la tarjeta de zona). */
function cromoMapa() {
  const hoja = ['#tarjeta-acceso', '#tarjeta-ruta', '#capas', '#barra-mira'].some((s) => !$(s).hidden);
  if (hoja) document.body.dataset.hoja = '1'; else delete document.body.dataset.hoja;
  if (!$('#tarjeta-zona').hidden) document.body.dataset.zona = '1'; else delete document.body.dataset.zona;
}
const vigia = new MutationObserver(cromoMapa);
for (const s of ['#tarjeta-acceso', '#tarjeta-ruta', '#capas', '#barra-mira', '#tarjeta-zona']) vigia.observe($(s), { attributes: true, attributeFilter: ['hidden'] });

// Pista visible hasta que se abre la primera ficha de acceso (luego ya se sabe).
const CLAVE_PISTA = 'setas:pista-acceso';
try { $('#pista-acceso').hidden = localStorage.getItem(CLAVE_PISTA) === '1'; } catch { $('#pista-acceso').hidden = false; }
function pistaVista() { $('#pista-acceso').hidden = true; try { localStorage.setItem(CLAVE_PISTA, '1'); } catch { /* solo esta sesión */ } }

// Modo «Aquí»: cruz en el centro del mapa; se mueve el mapa y «Ver acceso aquí» (alternativa visible a la pulsación larga).
function modoMira(activo: boolean) {
  $('#mira').hidden = !activo;
  $('#barra-mira').hidden = !activo;
  if (activo) { $('#tarjeta-zona').hidden = true; if (!$('#tarjeta-acceso').hidden) cerrarAcceso(); if (!$('#tarjeta-ruta').hidden) cerrarRuta(); abrirCapas(false); }
}
$('#btn-mira').addEventListener('click', () => modoMira(true));
$('#mira-cancelar').addEventListener('click', () => modoMira(false));
$('#mira-ver').addEventListener('click', () => {
  if (!mapa) return;
  const c = mapa.getCenter();
  modoMira(false);
  mostrarAcceso(c.lat, c.lng);
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
  titularidad?: Titularidad | null;
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
  $<HTMLButtonElement>('#ta-ruta').disabled = !conDatos;
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
  /** Celdas de la traza, del punto al coche (acceso.trazar). */
  celdas?: Celda[];
}

/** Aparcamiento, tiempo y subida a pie y trazado de un punto, con los datos locales (OPFS o HTTP). Nunca lanza. */
async function calcularAcceso(lat: number, lon: number): Promise<CalculoAcceso> {
  const t0 = performance.now();
  let d;
  try { d = manifest ? await datosAcceso(manifest) : null; } catch (e) {
    console.warn('acceso', e);
    return { estado: 'error', texto: 'No se pudieron leer los datos de acceso. Vuelve a descargar los mapas en Ajustes cuando tengas conexión.' };
  }
  if (!d) return { estado: 'sin_datos', texto: navigator.onLine ? 'Esta versión de los mapas no trae datos de acceso.'
    : 'Sin conexión y sin datos de acceso descargados. Descárgalos en Ajustes cuando tengas conexión.' };
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
    return { estado: 'ok', texto: '', linea, completa: tr.completa, celdas: tr.celdas,
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
  const rs = manifest && M ? await M.restriccionEn(manifest, lat, lon) : null;
  if (!vigente() || !rs?.length) return rs;
  for (const r of rs) {
    const b = document.createElement('b'); b.textContent = textoChip(r);
    b.insertAdjacentHTML('afterbegin', '<svg class="ico" aria-hidden="true"><use href="#i-alerta"/></svg>');
    const t = document.createElement('span'); t.textContent = r.texto;
    el.append(b, t);
  }
  el.hidden = false;
  return rs;
}

/** Etiqueta de titularidad del punto (monte público o «probablemente privado», con refuerzos y paso público). */
async function pintarTitularidad(el: HTMLElement, lat: number, lon: number, vigente: () => boolean, conNorma = true): Promise<Titularidad | null> {
  el.hidden = true;
  el.replaceChildren();
  const t = manifest && M ? await M.titularidadEn(manifest, lat, lon) : null;
  if (!vigente() || !t) return t;
  el.dataset.clase = t.clase;
  const b = document.createElement('b'); b.textContent = textoTitularidad(t);
  b.insertAdjacentHTML('afterbegin', `<svg class="ico" aria-hidden="true"><use href="#${esPublico(t) ? 'i-pin' : 'i-alerta'}"/></svg>`);
  el.append(b);
  for (const d of detallesTitularidad(t)) { const s = document.createElement('span'); s.textContent = d; el.append(s); }
  if (conNorma) { const n = document.createElement('small'); n.textContent = normaTitularidad(); el.append(n); }
  el.title = normaTitularidad();
  el.hidden = false;
  return t;
}

/** Ficha «Acceso» del punto: aparcamiento, tiempo y subida a pie y trazado aproximado (todo con los datos locales). */
async function mostrarAcceso(lat: number, lon: number) {
  if (!$('#tarjeta-ruta').hidden) cerrarRuta();
  pistaVista();
  if (!$('#barra-mira').hidden) modoMira(false);
  abrirCapas(false);
  const n = ++consultaAcceso;
  ultimoAcceso = { punto: { lat, lon }, estado: 'cargando' };
  $('#tarjeta-zona').hidden = true;
  $('#tarjeta-acceso').hidden = false;
  $('#tarjeta-acceso').dataset.estado = 'cargando';
  $('#ta-coord').textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  estadoAcceso('Calculando el acceso…', false);
  pintarTrazaAcceso([{ type: 'Feature', properties: { tipo: 'destino' }, geometry: { type: 'Point', coordinates: [lon, lat] } }]);
  const restr = pintarRestriccion($('#ta-restriccion'), lat, lon, () => n === consultaAcceso);
  const tit = pintarTitularidad($('#ta-titularidad'), lat, lon, () => n === consultaAcceso);
  const c = await calcularAcceso(lat, lon);
  const rs = await restr;
  const ti = await tit;
  if (n !== consultaAcceso) return;
  ultimoAcceso = { punto: { lat, lon }, estado: c.estado, acceso: c.acceso, traza: c.traza, ms: c.ms, lector: c.lector, restricciones: rs, titularidad: ti };
  $('#tarjeta-acceso').dataset.estado = c.estado;
  if (c.estado !== 'ok' || !c.acceso || !c.linea) { estadoAcceso(c.texto, false); return; }
  const { acceso, linea } = c;
  $('#ta-via').textContent = acceso.via;
  cifra($('#ta-tiempo'), textoTiempo(acceso.tiempo_min));
  cifra($('#ta-subida'), textoSubida(acceso.subida_m));
  estadoAcceso(c.completa ? '' : 'El trazado se corta antes de llegar al coche: síguelo solo como orientación.', true);
  pintarTrazaAcceso([
    { type: 'Feature', properties: { tipo: 'traza' }, geometry: { type: 'LineString', coordinates: linea } },
    { type: 'Feature', properties: { tipo: 'destino' }, geometry: { type: 'Point', coordinates: [lon, lat] } },
    { type: 'Feature', properties: { tipo: 'aparcamiento', via: acceso.via }, geometry: { type: 'Point', coordinates: [acceso.lon, acceso.lat] } },
  ]);
  encuadrar(linea);
}

/** Si el trazado no cabe en la vista (por encima de la ficha), la mueve sin acercar (o aleja si hace falta, con `ajustar`). */
function encuadrar(linea: [number, number][], tarjeta = '#tarjeta-acceso', ajustar = false) {
  if (!mapa) return;
  const lons = linea.map((p) => p[0]), lats = linea.map((p) => p[1]);
  const sw: [number, number] = [Math.min(...lons), Math.min(...lats)], ne: [number, number] = [Math.max(...lons), Math.max(...lats)];
  const alto = $(tarjeta).getBoundingClientRect().height;
  const caja = mapa.getContainer().getBoundingClientRect();
  const a = mapa.project(sw), b = mapa.project(ne);
  const panel = document.querySelector('.mapa-cab')?.getBoundingClientRect();
  const arriba = panel ? Math.max(24, panel.bottom - caja.top + 16) : 24;
  const dentro = (p: { x: number; y: number }) => p.x > 24 && p.x < caja.width - 24 && p.y > arriba && p.y < caja.height - alto - 40;
  if (dentro(a) && dentro(b)) return;
  const pad = { top: arriba + 20, left: 40, right: 40, bottom: alto + 50 };
  if (pad.top + pad.bottom > caja.height - 60) pad.bottom = Math.max(40, caja.height - 60 - pad.top);
  mapa.fitBounds([sw, ne], { padding: pad, maxZoom: ajustar ? 16 : mapa.getZoom(), duration: E2E ? 0 : 400 });
}

/** https en otra pestaña; geo: con un enlace (así lo abre Android con la app elegida). */
function abrirEnlace(url: string) {
  if (url.startsWith('https:')) { window.open(url, '_blank', 'noopener'); return; }
  const a = document.createElement('a'); a.href = url; a.rel = 'noopener';
  document.body.append(a); a.click(); a.remove();
}
$('#ta-cerrar').addEventListener('click', cerrarAcceso);
$('#ta-coche').addEventListener('click', () => {
  const a = ultimoAcceso?.acceso;
  if (a) abrirEnlace(urlGoogleCoche(a.lat, a.lon));
});
$('#ta-ruta').addEventListener('click', () => {
  const p = ultimoAcceso?.punto;
  if (p && ultimoAcceso?.estado === 'ok') abrirRuta(p.lat, p.lon);
});
$('#ta-guardar').addEventListener('click', () => {
  if (!ultimoAcceso) return;
  const { punto, acceso } = ultimoAcceso;
  abrirSitio(null, punto, { acceso });
});

// ---------------------------------------------------------------- Ruta a pie (fase 9)

interface RutaActual {
  destino: { lat: number; lon: number };
  /** Del coche al punto, [lon, lat]: centros de las celdas de la traza y el punto exacto al final. */
  linea: [number, number][];
  perfil: Perfil;
  acceso: AccesoSitio;
  dificultad: Dificultad;
  completa: boolean;
}
let rutaActual: RutaActual | null = null;
let consultaRuta = 0;
let seguimiento: (Seguimiento & { lat: number; lon: number; precision: number }) | null = null;
let dejarGps: (() => void) | null = null;
let bloqueoPantalla: { release(): Promise<void> } | null = null;

function cerrarRuta() {
  consultaRuta++;
  pararSeguimiento();
  rutaActual = null;
  $('#tarjeta-ruta').hidden = true;
  delete document.body.dataset.rutaAbierta;
  pintarTrazaAcceso([]);
}

/** Ficha «Ruta a pie» sobre el mapa: trazado del coche al punto, distancia, tiempo, subida, dificultad y perfil. */
async function abrirRuta(lat: number, lon: number) {
  const n = ++consultaRuta;
  pararSeguimiento();
  rutaActual = null;
  irA('p-mapa');
  if (!$('#tarjeta-acceso').hidden) { consultaAcceso++; $('#tarjeta-acceso').hidden = true; }
  $('#tarjeta-zona').hidden = true;
  const t = $('#tarjeta-ruta');
  t.hidden = false; t.dataset.estado = 'cargando'; delete t.dataset.seguir;
  document.body.dataset.rutaAbierta = '1';
  $('#ru-estado').textContent = 'Calculando la ruta…'; $('#ru-estado').hidden = false;
  $('#ru-datos').hidden = true; $('#ru-perfil').replaceChildren(); $('#ru-perfil-dato').textContent = ''; $('#ru-via').textContent = '';
  for (const b of ['#ru-seguir-btn', '#ru-coche']) $<HTMLButtonElement>(b).disabled = true;
  $('#ru-seguir-btn').textContent = 'Seguir con GPS';
  pintarTrazaAcceso([{ type: 'Feature', properties: { tipo: 'destino' }, geometry: { type: 'Point', coordinates: [lon, lat] } }]);
  const c = await calcularAcceso(lat, lon);
  if (n !== consultaRuta) return;
  const d = manifest ? await datosAcceso(manifest).catch(() => null) : null;
  if (c.estado !== 'ok' || !c.acceso || !c.celdas || !d) {
    t.dataset.estado = c.estado === 'ok' ? 'error' : c.estado;
    $('#ru-estado').textContent = c.texto || 'No se pudo calcular la ruta.';
    return;
  }
  const celdas = [...c.celdas].reverse();
  const alts = await altitudes(d.cab, d.lector, celdas).catch(() => celdas.map(() => NaN));
  if (n !== consultaRuta) return;
  const per = perfil(celdas, alts, d.cab.res);
  const linea: [number, number][] = [...celdas.map((x) => centroCelda(d.cab, x)), [lon, lat]];
  const dif = dificultad(c.acceso.tiempo_min, c.acceso.subida_m);
  rutaActual = { destino: { lat, lon }, linea, perfil: per, acceso: c.acceso, dificultad: dif, completa: !!c.completa };
  t.dataset.estado = 'ok';
  $('#ru-via').textContent = `desde ${c.acceso.via}`;
  cifra($('#ru-distancia'), textoDistancia(per.total_m));
  cifra($('#ru-tiempo'), textoTiempo(c.acceso.tiempo_min));
  cifra($('#ru-subida'), textoSubida(c.acceso.subida_m));
  const insignia = $('#ru-dificultad');
  insignia.textContent = NOMBRE_DIFICULTAD[dif]; insignia.className = `insignia-dif dif-${dif}`; insignia.dataset.dificultad = dif;
  $('#ru-datos').hidden = false;
  $('#ru-estado').textContent = c.completa ? '' : 'El trazado se corta antes de llegar al coche: síguelo solo como orientación.';
  $('#ru-estado').hidden = !!c.completa;
  for (const b of ['#ru-seguir-btn', '#ru-coche']) $<HTMLButtonElement>(b).disabled = false;
  pintarPerfil($('#ru-perfil'), per, (txt) => ($('#ru-perfil-dato').textContent = txt));
  pintarTrazaAcceso([
    { type: 'Feature', properties: { tipo: 'traza' }, geometry: { type: 'LineString', coordinates: linea } },
    { type: 'Feature', properties: { tipo: 'destino' }, geometry: { type: 'Point', coordinates: [lon, lat] } },
    { type: 'Feature', properties: { tipo: 'aparcamiento', via: c.acceso.via }, geometry: { type: 'Point', coordinates: [c.acceso.lon, c.acceso.lat] } },
  ]);
  encuadrar(linea, '#tarjeta-ruta', true);
  document.body.dataset.ruta = 'ok';
}

async function pedirBloqueoPantalla() {
  try { bloqueoPantalla = await (navigator as any).wakeLock?.request('screen') ?? null; } catch { bloqueoPantalla = null; }
}
document.addEventListener('visibilitychange', () => { if (dejarGps && document.visibilityState === 'visible') pedirBloqueoPantalla(); });

/** Modo «Seguir con GPS»: distancia que queda siguiendo la ruta y aviso si te alejas más de 80 m. Sin red: solo GPS. */
function seguirRuta() {
  if (!gps || !rutaActual) return;
  const t = $('#tarjeta-ruta');
  t.dataset.seguir = '1';
  $('#ru-seguir').hidden = false;
  $('#tarjeta-ruta .hoja-cuerpo').scrollTop = 0;   // «Dejar de seguir» queda arriba, a la vista
  $('#ru-seguir-btn').textContent = 'Dejar de seguir';
  $('#ru-restante').textContent = '—';
  $('#ru-fuera').hidden = true;
  $('#ru-gps').textContent = 'Buscando tu posición…';
  pedirBloqueoPantalla();
  const ruta = rutaActual;
  dejarGps = gps.escuchar((pos) => {
    if (rutaActual !== ruta) return;
    const s = seguir(ruta.linea, pos);
    seguimiento = { ...s, ...pos };
    $('#ru-restante').textContent = textoDistancia(s.restante_m);
    $('#ru-fuera').hidden = !s.fuera;
    $('#ru-fuera').textContent = s.fuera ? `Fuera de ruta: estás a ${textoDistancia(s.aRuta_m)} del trazado. Vuelve hacia la línea azul.` : '';
    t.dataset.fuera = String(s.fuera);
    $('#ru-gps').textContent = `Llevas ${textoDistancia(s.recorrido_m)} · GPS ±${Math.round(pos.precision)} m`;
    if (mapa && !mapa.getBounds().contains([pos.lon, pos.lat])) mapa.easeTo({ center: [pos.lon, pos.lat], duration: E2E ? 0 : 500 });
  });
}

function pararSeguimiento() {
  dejarGps?.(); dejarGps = null; seguimiento = null;
  bloqueoPantalla?.release().catch(() => {}); bloqueoPantalla = null;
  const t = $('#tarjeta-ruta');
  delete t.dataset.seguir; delete t.dataset.fuera;
  $('#ru-seguir').hidden = true;
  $('#ru-seguir-btn').textContent = 'Seguir con GPS';
}

$('#ru-seguir-btn').addEventListener('click', () => (dejarGps ? pararSeguimiento() : seguirRuta()));
$('#ru-coche').addEventListener('click', () => { const a = rutaActual?.acceso; if (a) abrirEnlace(urlGoogleCoche(a.lat, a.lon)); });
$('#ru-cerrar').addEventListener('click', cerrarRuta);

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
    li.textContent = todos.length ? 'Ningún sitio con esa especie.' : 'Aún no hay sitios. En el mapa, pulsa «Guardar» para guardar donde estás, o abre el acceso de un punto y pulsa el marcador.';
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
    const ir = document.createElement('button'); ir.className = 'btn btn-primario'; ir.textContent = 'Cómo llegar';
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
const clavePunto = () => claveRegion('punto-meteo');
const DISTANCIA_MAX_KM = 12;

const especieSel = () => $<HTMLSelectElement>('#sel-especie').value;
const reglasDe = (id: string) => manifest?.especies.find((e) => e.id === id)?.tiempo;

function estadoEn(p: PuntoMeteo, especie: string): ResultadoSemaforo | null {
  const r = reglasDe(especie);
  const serie = meteo?.puntos[String(p.id)];
  if (!r || !serie || !meteo) return null;
  return semaforo(serie, r, hoyZona(), { edadHoras: edadHoras(meteo) });
}

/** Semáforo de una especie en el punto meteo `id` un día concreto (pestaña Hoy: hoy … +15 con la serie guardada). */
function estadoPunto(id: number, especie: string, fecha: string): ResultadoSemaforo | null {
  const r = reglasDe(especie);
  const serie = meteo?.puntos[String(id)];
  if (!r || !serie || !meteo) return null;
  return semaforo(serie, r, fecha, { edadHoras: edadHoras(meteo) });
}

// Punto de referencia del tiempo de cada seta (ficha y selector del mapa): GPS cercano → mejor sitio → centro de la zona
// (ventana-especie.ts, puntoReferencia).
let sitiosRef: SitiosJson | null = null;
/** Vista actual del mapa (centro y esquinas), o null si el mapa no está listo. */
function vistaMapa(): Vista | null {
  if (!mapa || document.body.dataset.mapa !== 'listo') return null;
  const b = mapa.getBounds(), c = mapa.getCenter();
  return { centro: { lat: c.lat, lon: c.lng }, sw: { lat: b.getSouth(), lon: b.getWest() }, ne: { lat: b.getNorth(), lon: b.getEast() } };
}
/** Punto meteo de referencia de una seta: GPS a ≤ 12 km → la vista del mapa (el mejor punto de la vista) → su mejor
 * sitio → centro de la zona (ventana-especie.ts). */
function refPunto(especie: string): PuntoRef | null {
  const g = gps?.ultima ?? null;
  if (g) {
    const r = puntoReferencia(puntosMeteo, { gps: g, maxKm: DISTANCIA_MAX_KM });
    if (r?.origen === 'gps') return r;
  }
  const v = vistaMapa();
  if (v && meteo) {
    const hoy = hoyZona();
    const r = referenciaVista(puntosMeteo, v, (p) => estadoPunto(p.id, especie, hoy), hoy);
    if (r) return { id: r.id, origen: r.origen };
  }
  return puntoReferencia(puntosMeteo, { sitios: sitiosRef?.especies[especie] ?? null, maxKm: DISTANCIA_MAX_KM });
}
/** Pueblo del punto de referencia de una seta («activa cerca de Ojén»). */
function lugarRef(especie: string): string | null {
  const r = refPunto(especie);
  return (r && puntosMeteo.find((p) => p.id === r.id)?.lugar) || null;
}
/** Semáforo de hoy de una especie en su punto de referencia (selector del mapa: siempre hoy, no el día elegido en Hoy). */
function estadoHoyRef(especie: string): ResultadoSemaforo | null {
  const r = refPunto(especie);
  return r ? estadoPunto(r.id, especie, hoyZona()) : null;
}

/** Bloque «Cuándo está activa» de una ficha: la especie del mapa que describe, sus meses y los próximos 16 días. */
ponerBloqueTiempo((idFicha) => {
  const ids = (manifest?.especies ?? []).map((e) => e.id);
  const id = especieMapaDeFicha(idFicha, ids);
  const e = manifest?.especies.find((x) => x.id === id);
  if (!e?.tiempo) return null;     // solo guía, o sin reglas del tiempo: sin meses estructurados que enseñar
  const hoy = hoyZona();
  const ref = refPunto(id);
  const serie = ref && meteo ? meteo.puntos[String(ref.id)] : null;
  const dias = diasEspecie(serie, e.tiempo, hoy, meteo ? edadHoras(meteo) : 0);
  const meses = e.tiempo.meses ?? [];
  const bloque = bloqueCuando({ hoy, meses, conTiempo: true, dias, ventana: ventanaEspecie(dias, meses, hoy), origen: ref?.origen ?? null });
  if (bloque) bloque.dataset.especie = id;
  return bloque;
});

function textoMeteoCorto(): string {
  if (!meteo) return navigator.onLine ? 'Sin datos del tiempo todavía: los sitios salen sin semáforo.' : 'Sin conexión y sin datos del tiempo guardados: los sitios salen sin semáforo.';
  const h = edadHoras(meteo);
  return `Tiempo ${navigator.onLine ? '' : 'guardado, '}actualizado ${haceTexto(h)}${h > CADUCIDAD_H ? ' · datos antiguos: semáforo en gris' : ''}.`;
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
  M!.colorearSemaforo(mapa, expresionColores(estados));
}

function pintarPuntoMapa() {
  const src = mapa?.getSource('punto-meteo') as GeoJSONSource | undefined;
  src?.setData({ type: 'FeatureCollection', features: puntoSel ? [{ type: 'Feature', properties: {},
    geometry: { type: 'Point', coordinates: [puntoSel.lon, puntoSel.lat] } }] : [] });
}

let consultaZona = 0;
function elegirPunto(lat: number, lon: number, conTarjeta: boolean) {
  const p = puntoMasCercano(puntosMeteo, lat, lon);
  if (!p) return;
  const km = Math.hypot(p.lat - lat, (p.lon - lon) * Math.cos((lat * Math.PI) / 180)) * 111.2;
  if (km > DISTANCIA_MAX_KM) return;
  const n = ++consultaZona;
  pintarTitularidad($('#tz-titularidad'), lat, lon, () => n === consultaZona, false);
  puntoSel = p;
  localStorage.setItem(clavePunto(), String(p.id));
  pintarPuntoMapa();
  if (conTarjeta && $('#tarjeta-ruta').hidden) { if (!$('#tarjeta-acceso').hidden) cerrarAcceso(); $('#tarjeta-zona').hidden = false; }
  pintarTarjeta();
}

function pintarTarjeta() {
  if ($('#tarjeta-zona').hidden || !puntoSel) return;
  const r = estadoEn(puntoSel, especieSel());
  const punto = document.createElement('span'); punto.className = 'punto-estado'; punto.dataset.estado = r?.estado ?? 'gris'; punto.setAttribute('aria-hidden', 'true');
  $('#tz-estado').replaceChildren(punto, r ? `${nombres[especieSel()]}: ${NOMBRE_ESTADO[r.estado]}` : `${nombres[especieSel()]}: sin datos del tiempo`);
  $('#tz-motivo').textContent = r ? [r.motivo, fechasTexto(r)].filter(Boolean).join(' · ') : 'Conéctate y pulsa «Actualizar tiempo» en Zona.';
}
$('#tz-cerrar').addEventListener('click', () => ($('#tarjeta-zona').hidden = true));
$('#tz-ver').addEventListener('click', () => irA('p-zona'));
$('#zona-ir-mapa').addEventListener('click', () => irA('p-mapa'));
$('#zona-volver').addEventListener('click', () => irA('p-hoy'));

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
  $('#ind-suelo b').textContent = Number.isFinite(h.suelo) ? `${n(h.suelo, 2)} m³/m³` : 'sin dato';
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
  $('#zona-punto').textContent = `Zona elegida en el mapa (${puntoSel.lat.toFixed(3)}, ${puntoSel.lon.toFixed(3)}) · su bosque está a unos ${puntoSel.alt_media} m de altitud`;
  const elegida = especieSel();
  const orden = [...(manifest?.especies ?? [])].sort((a, b) => Number(b.id === elegida) - Number(a.id === elegida));
  for (const e of orden) {
    const r = estadoEn(puntoSel, e.id);
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.className = 'semaforo-fila' + (e.id === elegida ? ' elegida' : '');
    b.dataset.especie = e.id;
    b.dataset.estado = r?.estado ?? 'gris';
    const ic = document.createElement('span'); ic.className = 'ic punto-estado'; ic.dataset.estado = r?.estado ?? 'gris'; ic.setAttribute('aria-hidden', 'true');
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

/** Repinta el selector salvo con la hoja abierta (se perdería el foco del teclado); al abrirla se repinta igual. */
const repintarSelector = () => { if (!$<HTMLDialogElement>('#dlg-especie').open) pintarSelectorEspecie(); };

function repintarMeteo() {
  pintarSemaforoMapa();
  repintarSelector();
  pintarTarjeta();
  if ($('#p-zona').classList.contains('activa')) pintarZona();
  if ($('#p-hoy').classList.contains('activa')) pintarHoy();
}

async function cargarMeteo(forzar: boolean) {
  if (!puntosMeteo.length) return;
  const btn = $<HTMLButtonElement>('#btn-meteo');
  if (forzar) { btn.disabled = true; $('#estado-meteo').textContent = 'Consultando el tiempo…'; }
  const r = await obtener(puntosMeteo, { forzar, clave: claveMeteo(regionActiva()) });
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
  const guardado = localStorage.getItem(clavePunto());
  puntoSel = puntosMeteo.find((p) => String(p.id) === guardado) ?? null;
  pintarPuntoMapa();
  sitiosCandidatos().then((d) => { sitiosRef = d; repintarSelector(); });
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
    : completas ? `Guía lista sin conexión: textos y ${e.total} fotos guardados.`
    : e.trabajando ? `Guardando fotos de la guía… ${e.guardadas} de ${e.total}`
    : `Fotos de la guía guardadas: ${e.guardadas} de ${e.total}.${navigator.onLine ? '' : ' Faltan; conéctate para completarlas.'}`;
  $<HTMLButtonElement>('#btn-guia-fotos').hidden = completas || e.trabajando || !e.total;
  $<HTMLButtonElement>('#btn-guia-fotos').disabled = !navigator.onLine;
}
$('#btn-guia-fotos').addEventListener('click', () => guardarFotosSinConexion(pintarEstadoGuia));
$('#creditos-fotos').addEventListener('toggle', () => pintarCreditos());

async function pintarAjustes() {
  if (!hayRegionActiva()) return;
  pintarEstadoGuia();
  pintarAjustesModelo();
  const est = estadoDescarga();
  const btn = $<HTMLButtonElement>('#btn-descargar');
  const total = manifest?.total_bytes ?? 0;
  btn.textContent = `Descargar mapas para usar sin conexión (${mb(total)})`;
  btn.disabled = !manifest || !navigator.onLine;
  if (est) {
    const desfasado = manifest && manifest.generado !== est.generado;
    $('#estado-descarga').textContent = `Descargado el ${new Date(est.fecha).toLocaleString('es-ES')} · ${mb(est.bytes)}`
      + (desfasado ? ' · hay una versión más nueva' : '');
    btn.textContent = desfasado ? `Actualizar mapas (${mb(total)})` : `Volver a descargar (${mb(total)})`;
  } else {
    $('#estado-descarga').textContent = 'No descargado: sin conexión el mapa no se verá.';
  }
  $('#btn-borrar-mapas').hidden = !est;
  const persist = await navigator.storage?.persisted?.().catch(() => false);
  const q = await navigator.storage?.estimate?.().catch(() => undefined);
  $('#estado-almacen').textContent = `Almacenamiento persistente: ${persist ? 'sí' : 'no'}`
    + (q?.usage != null ? ` · en uso ${mb(q.usage)}${q.quota ? ` de ${mb(q.quota)}` : ''}` : '');
  pintarNormativa();
  $('#info-datos').textContent = manifest
    ? `Total de datos offline: ${mb(total)} (${manifest.archivos.length} archivos). Generados el ${new Date(manifest.generado).toLocaleDateString('es-ES')}. Mapa base: ${manifest.base ?? '—'}.`
    : 'Sin datos de mapas.';
}

/** Normativa en Ajustes: por la CCAA del último punto consultado (o del GPS); sin punto, todas las de la región. */
let normativaN = 0;
async function pintarNormativa() {
  const m = manifest;
  const nr = m?.restricciones;
  $('#normativa').hidden = !m || (!nr && !m.legal.length);
  if (!m) return;
  const n = ++normativaN;
  const p = ultimoAcceso?.punto ?? gps?.ultima ?? null;
  const ids = p && M ? await M.ccaaEn(m, p.lat, p.lon) : null;
  if (n !== normativaN) return;
  const v = vistaNormativa(m.legal, ids, m.normas_legado);
  const amb = $('#normativa-ambito');
  amb.textContent = v.ambito === 'punto' ? `En el punto elegido: ${v.entradas.map((e) => e.nombre).join(', ')}`
    : m.legal.length > 1 ? 'Todas las comunidades de la región. Toca un punto del mapa para ver solo la suya.' : '';
  amb.hidden = !amb.textContent;
  $('#normativa-ccaa').replaceChildren(...v.entradas.map(entradaLegal));
  $('#normativa-aviso').hidden = !!m.legal.length || !nr;   // con legal por CCAA, el aviso general sobra
  $('#normativa-aviso').textContent = nr?.aviso ?? '';
  $('#normativa-tipos-intro').hidden = !nr;
  $('#normativa-tipos').replaceChildren(...Object.values(nr?.tipos ?? {}).map((t) => { const li = document.createElement('li'); li.textContent = t; return li; }));
  $('#normativa-orientativo').textContent = v.nota;
  $('#avisos-datos').hidden = !m.avisos.length;
  $('#avisos-datos-lista').replaceChildren(...m.avisos.map((a) => { const li = document.createElement('li'); li.textContent = a; return li; }));
}

function entradaLegal(e: EntradaLegal): HTMLElement {
  const art = document.createElement('article'); art.className = 'normativa-entrada'; art.dataset.ccaa = e.id;
  const h = document.createElement('h3'); h.textContent = e.nombre;
  art.append(h);
  if (!e.verificado) {
    const b = document.createElement('span'); b.className = 'insignia-pendiente'; b.textContent = PENDIENTE;
    h.append(' ', b);
  }
  const t = document.createElement('p'); t.textContent = e.texto;
  art.append(t);
  // Spec §1.5: el cupo solo se enseña verificado (prepararManifest ya lo anula si no lo está).
  if (e.verificado && e.cupo_kg_dia !== null) { const c = document.createElement('p'); c.className = 'nota'; c.textContent = textoCupo(e.cupo_kg_dia); art.append(c); }
  if (e.fuente_url) {
    const a = document.createElement('a'); a.href = e.fuente_url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.textContent = `Texto oficial${e.sigla ? ` (${e.sigla})` : ''}`;
    art.append(a);
  }
  return art;
}

$('#btn-descargar').addEventListener('click', async () => {
  if (!manifest) return;
  const btn = $<HTMLButtonElement>('#btn-descargar');
  const prog = $<HTMLProgressElement>('#prog-descarga');
  btn.disabled = true; prog.hidden = false; prog.value = 0;
  try {
    const { persistente } = await descargarMapas(manifest, regionActiva(), baseDatos(), (h, t) => {
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
  if (!confirm('¿Borrar los mapas descargados? Sin conexión no se verá el mapa.')) return;
  await borrarMapas();
  recargarTrasCambioDeMapas('Mapas borrados');
});
window.addEventListener('online', () => { pintarAjustes(); guardarFotosSinConexion(pintarEstadoGuia); });
window.addEventListener('offline', () => pintarAjustes());

// Colores: como el teléfono, claros (sol) u oscuros (anochecer). El atributo se pone también en index.html antes de pintar.
{
  const sel = $<HTMLSelectElement>('#ajuste-tema');
  try { sel.value = localStorage.getItem('setas:tema') ?? ''; } catch { /* sin almacenamiento */ }
  sel.addEventListener('change', () => {
    if (sel.value) document.documentElement.dataset.tema = sel.value; else delete document.documentElement.dataset.tema;
    try { if (sel.value) localStorage.setItem('setas:tema', sel.value); else localStorage.removeItem('setas:tema'); } catch { /* solo esta sesión */ }
  });
}

iniciarHoy({
  manifest: () => manifest,
  hoy: hoyZona,
  hayMeteo: () => !!meteo,
  textoMeteo: textoMeteoCorto,
  estadoPunto,
  posicion: () => gps?.ultima ?? null,
  verEnMapa: async (especie, lat, lon) => {
    irA('p-mapa');
    const sel = $<HTMLSelectElement>('#sel-especie');
    if (sel.value !== especie) { sel.value = especie; sel.dispatchEvent(new Event('change')); }
    mapa?.jumpTo({ center: [lon, lat], zoom: Math.max(14, mapa.getZoom()) });
    mostrarAcceso(lat, lon);
  },
  rutaAPie: (_especie, lat, lon) => abrirRuta(lat, lon),
  coche: async (lat, lon) => {
    const c = await calcularAcceso(lat, lon);
    if (c.acceso) abrirEnlace(urlGoogleCoche(c.acceso.lat, c.acceso.lon));
    else avisar(`Sin aparcamiento estimado: ${c.texto}`, 5000);
  },
  guardar: (especie, lat, lon) => abrirSitio(null, { lat, lon }, { especie }),
  hayFicha: async (especie) => !!(await cargarGuia()) && hayFicha(fichaDeEspecieMapa(especie)),
  verFicha: (especie) => { irA('p-guia'); abrirFicha(fichaDeEspecieMapa(especie)); },
  irZona: () => irA('p-zona'),
  soloPublicos,
});
$<HTMLInputElement>('#hoy-solo-publicos').checked = soloPublicos();
$<HTMLInputElement>('#hoy-solo-publicos').addEventListener('change', (ev) => {
  ponerSoloPublicos((ev.target as HTMLInputElement).checked);
  pintarHoy();
});

iniciarReconocer({
  manifest: () => manifest,
  avisar,
  verFicha: (id, mortales) => {
    irA('p-guia');
    // Sigue siendo parte de Reconocer: la pestaña marcada es Reconocer y «Tu resultado» vuelve allí.
    document.querySelectorAll<HTMLButtonElement>('.pestanas button[data-p]').forEach((b) => {
      const r = b.dataset.p === 'p-reconocer';
      b.classList.toggle('activa', r);
      if (r) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    abrirFicha(id, 'reconocer', mortales);
  },
  guardarSitio: ({ especieGuia, foto, lat, lon }) => abrirSitio(null, { lat, lon },
    { especie: especieGuia ? especieMapaDeFicha(especieGuia, (manifest?.especies ?? []).map((e) => e.id)) : '', foto }),
});

// Hasta la tarea 11 (region-ui.ts): sin GPS ni pregunta, la primera región.
const posicionRapida = async () => null;
const preguntarRegion = async (rs: RegionIndice[]) => rs[0]?.id ?? null;

/** Arranque: migración de la instalación plana (una vez) → índice de regiones → región activa → mapa. */
async function arrancar() {
  await migrarARegiones({
    almacen: localStorage,
    raiz: async () => (navigator.storage?.getDirectory ? navigator.storage.getDirectory() : null),
    moverArchivos: (desde, hacia, nombres) => moverEnOpfs(desde, hacia, nombres),
    renombrarMeteo: renombrarCache,
  }).catch((e) => console.warn('migración a regiones', e));
  regiones = await cargarRegiones();
  const id = await resolverRegion(regiones, { almacen: localStorage, posicion: posicionRapida, preguntar: preguntarRegion });
  if (!id) { $('#sin-datos').hidden = false; return; }
  establecerActiva(id);
  await iniciarMapa();
}
arrancar().then(pintarAjustes).finally(() => guardarFotosSinConexion(pintarEstadoGuia));
