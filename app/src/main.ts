import 'maplibre-gl/dist/maplibre-gl.css';
import './estilos.css';
import { registerSW } from 'virtual:pwa-register';
import type { Map as MapaML, GeoJSONSource, LngLat } from 'maplibre-gl';
import { BASE_DATOS, cargarManifest, mb } from './datos';
import { COLORES_IDONEIDAD, crearMapa, origenes, ponerIdoneidad, verCapa } from './mapa';
import { Gps } from './gps';
import { borrarMapas, descargarMapas, estadoDescarga } from './opfs';
import { borrarSitio, guardarSitio, guardarVarios, leerSitio, listarSitios } from './sitios';
import { aGPX, aJSON, deGPX, deJSON, nuevoId } from './intercambio';
import type { Manifest, Sitio } from './tipos';

registerSW({ immediate: true });

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
let manifest: Manifest | null = null;
let mapa: MapaML | null = null;
let gps: Gps | null = null;
const nombres: Record<string, string> = {};

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
  document.querySelectorAll<HTMLButtonElement>('.pestanas button[data-p]').forEach((b) =>
    b.classList.toggle('activa', b.dataset.p === id));
  if (id === 'p-mapa') mapa?.resize();
  if (id === 'p-sitios') pintarLista();
  if (id === 'p-ajustes') pintarAjustes();
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
}

const CAPAS: Record<string, string[]> = {
  sombreado: ['sombreado'], curvas: ['curvas', 'curvas-cota'],
  protegidos: ['protegidos-relleno', 'protegidos-linea'], idoneidad: ['idoneidad'],
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
  rellenarEspecies($<HTMLSelectElement>('#sel-especie'));
  rellenarEspecies($<HTMLSelectElement>('#filtro-especie'), ['', 'Todas']);
  rellenarEspecies($<HTMLSelectElement>('#sitio-especie'), ['', 'Sin especificar']);
  $('#rampa').style.background = `linear-gradient(90deg, ${COLORES_IDONEIDAD.join(',')})`;
  try {
    const g = JSON.parse(localStorage.getItem('setas:capa') ?? 'null');
    if (g && manifest.especies.some((e) => e.id === g.especie)) {
      $<HTMLSelectElement>('#sel-especie').value = g.especie;
      $<HTMLInputElement>('#rng-umbral').value = String(g.umbral);
    }
  } catch { /* preferencia corrupta: se ignora */ }

  mapa = crearMapa($('#mapa'), manifest);
  gps = new Gps(mapa, (m) => avisar(m));
  if (import.meta.env.DEV || new URLSearchParams(location.search).get('e2e') === '1') (window as any).__setas = { mapa, origenes };
  mapa.on('load', async () => {
    aplicarIdoneidad();
    mapa!.addSource('sitios', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    mapa!.addLayer({ id: 'sitios', type: 'circle', source: 'sitios', paint: {
      'circle-radius': ['+', 6, ['*', 2, ['get', 'estrellas']]], 'circle-color': '#b23a0b',
      'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
    mapa!.on('click', 'sitios', (ev) => {
      const id = ev.features?.[0]?.properties?.id;
      if (id) leerSitio(String(id)).then((s) => s && abrirSitio(s));
    });
    pintarSitiosMapa(await listarSitios());
    document.body.dataset.mapa = 'listo';
  });
  $('#sel-especie').addEventListener('change', aplicarIdoneidad);
  $('#rng-umbral').addEventListener('input', aplicarIdoneidad);
  document.querySelectorAll<HTMLInputElement>('[data-capa]').forEach((c) =>
    c.addEventListener('change', () => mapa && verCapa(mapa, CAPAS[c.dataset.capa!], c.checked)));
  instalarPulsacionLarga(mapa);
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

/** Pulsación larga (600 ms sin moverse) en el mapa → nuevo sitio en ese punto. */
function instalarPulsacionLarga(m: MapaML) {
  let t = 0, origen: { x: number; y: number } | null = null;
  const cancelar = () => { clearTimeout(t); origen = null; };
  const empezar = (e: { point: { x: number; y: number }; lngLat: LngLat; originalEvent: Event }) => {
    if ((e.originalEvent as TouchEvent).touches?.length > 1) return cancelar();
    if (m.getLayer('sitios') && m.queryRenderedFeatures([e.point.x, e.point.y], { layers: ['sitios'] }).length) return cancelar();
    origen = e.point;
    const ll = e.lngLat;
    clearTimeout(t);
    t = window.setTimeout(() => { origen = null; navigator.vibrate?.(30); abrirSitio(null, { lat: ll.lat, lon: ll.lng }); }, 600);
  };
  const mover = (e: { point: { x: number; y: number } }) => {
    if (origen && Math.hypot(e.point.x - origen.x, e.point.y - origen.y) > 10) cancelar();
  };
  m.on('touchstart', empezar); m.on('touchmove', mover); m.on('touchend', cancelar); m.on('touchcancel', cancelar);
  m.on('mousedown', empezar); m.on('mousemove', mover); m.on('mouseup', cancelar);
  m.on('dragstart', cancelar); m.on('zoomstart', cancelar);
  m.getCanvas().addEventListener('contextmenu', (e) => e.preventDefault());
}

// ---------------------------------------------------------------- formulario de sitio

let editando: Sitio | null = null;
let fotoNueva: Blob | null | undefined;   // undefined = sin cambios
let urlFoto = '';

async function reducirFoto(f: File): Promise<Blob> {
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

function abrirSitio(s: Sitio | null, punto?: { lat: number; lon: number }) {
  const frm = $<HTMLFormElement>('#frm-sitio');
  frm.reset();
  fotoNueva = undefined;
  editando = s ?? { id: nuevoId(), lat: punto!.lat, lon: punto!.lon, estrellas: 1, nota: '',
    especie: $<HTMLSelectElement>('#sel-especie').value || '', fecha: new Date().toISOString() };
  $('#tit-sitio').textContent = s ? 'Editar sitio' : 'Nuevo sitio';
  $('#coord-sitio').textContent = `${editando.lat.toFixed(5)}, ${editando.lon.toFixed(5)} · ${new Date(editando.fecha).toLocaleString('es-ES')}`;
  (frm.elements.namedItem('nota') as HTMLTextAreaElement).value = editando.nota;
  (frm.elements.namedItem('especie') as HTMLSelectElement).value = editando.especie;
  frm.querySelector<HTMLInputElement>(`input[name=estrellas][value="${editando.estrellas}"]`)!.checked = true;
  $('#btn-sitio-borrar').hidden = !s;
  mostrarFoto(editando.foto);
  $<HTMLDialogElement>('#dlg-sitio').showModal();
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
    if (s.nota) { const t = document.createElement('div'); t.className = 'txt'; t.textContent = s.nota; li.append(t); }
    const acc = document.createElement('div'); acc.className = 'acciones';
    const ver = document.createElement('button'); ver.className = 'btn'; ver.textContent = 'Ver en mapa';
    ver.onclick = () => { irA('p-mapa'); mapa?.flyTo({ center: [s.lon, s.lat], zoom: 15 }); };
    const ed = document.createElement('button'); ed.className = 'btn'; ed.textContent = 'Editar';
    ed.onclick = () => abrirSitio(s);
    acc.append(ver, ed); li.append(acc);
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

// ---------------------------------------------------------------- Ajustes / descargas

async function pintarAjustes() {
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
window.addEventListener('online', () => pintarAjustes());
window.addEventListener('offline', () => pintarAjustes());

iniciarMapa().then(pintarAjustes);
