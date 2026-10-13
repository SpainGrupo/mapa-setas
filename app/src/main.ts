import 'maplibre-gl/dist/maplibre-gl.css';
import './estilos.css';
import { registerSW } from 'virtual:pwa-register';
import type { Map as MapaML, GeoJSONSource, LngLat } from 'maplibre-gl';
import { BASE_DATOS, cargarJson, cargarManifest, mb } from './datos';
import { COLORES_IDONEIDAD, colorearSemaforo, crearMapa, origenes, ponerIdoneidad, verCapa } from './mapa';
import { Gps } from './gps';
import { borrarMapas, descargarMapas, estadoDescarga } from './opfs';
import { borrarSitio, guardarSitio, guardarVarios, leerSitio, listarSitios } from './sitios';
import { aGPX, aJSON, deGPX, deJSON, nuevoId } from './intercambio';
import type { Manifest, Sitio } from './tipos';
import { edadHoras, fechaMadrid, obtener, CADUCIDAD_H, type DatosMeteo, type PuntoMeteo } from './meteo';
import { ddmm, semaforo, sumarDias, type ResultadoSemaforo } from './semaforo';
import { expresionColores, haceTexto, ICONO_ESTADO, NOMBRE_ESTADO, puntoMasCercano } from './zona';
import { pintarGrafico } from './grafico';

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
  if (id === 'p-zona') pintarZona();
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
}

const CAPAS: Record<string, string[]> = {
  sombreado: ['sombreado'], curvas: ['curvas', 'curvas-cota'],
  protegidos: ['protegidos-relleno', 'protegidos-linea'], idoneidad: ['idoneidad'], semaforo: ['semaforo'],
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
  if (import.meta.env.DEV || new URLSearchParams(location.search).get('e2e') === '1') (window as any).__setas = { mapa, origenes, meteo: () => ({ datos: meteo, origen: meteoOrigen, punto: puntoSel }),
    resumenSemaforo: () => Object.fromEntries((manifest?.especies ?? []).map((e) => {
      const n: Record<string, number> = { verde: 0, amarillo: 0, rojo: 0, gris: 0 };
      for (const p of puntosMeteo) n[estadoEn(p, e.id)?.estado ?? 'gris']++;
      return [e.id, n];
    })) };
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
    mapa!.addSource('punto-meteo', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    mapa!.addLayer({ id: 'punto-meteo', type: 'circle', source: 'punto-meteo', paint: {
      'circle-radius': 7, 'circle-color': '#111', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
    mapa!.on('click', (ev) => elegirPunto(ev.lngLat.lat, ev.lngLat.lng, true));
    pintarSemaforoMapa();
    pintarPuntoMapa();
    document.body.dataset.mapa = 'listo';
  });
  $('#sel-especie').addEventListener('change', aplicarIdoneidad);
  $('#rng-umbral').addEventListener('input', aplicarIdoneidad);
  document.querySelectorAll<HTMLInputElement>('[data-capa]').forEach((c) =>
    c.addEventListener('change', () => mapa && verCapa(mapa, CAPAS[c.dataset.capa!], c.checked)));
  instalarPulsacionLarga(mapa);
  iniciarMeteo();
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
  return semaforo(serie, r, fechaMadrid(new Date()), { edadHoras: edadHoras(meteo) });
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
  if (conTarjeta) $('#tarjeta-zona').hidden = false;
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

function pintarEstadoMeteo() {
  const el = $('#estado-meteo');
  if (!meteo) { el.textContent = navigator.onLine ? 'Sin datos del tiempo todavía.' : 'Sin conexión y sin datos del tiempo guardados.'; return; }
  const h = edadHoras(meteo);
  const cuando = `actualizado ${haceTexto(h)} (${new Date(meteo.fecha_consulta).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })})`;
  el.textContent = (navigator.onLine ? `Tiempo ${cuando}` : `Sin conexión: último dato guardado, ${cuando}`)
    + (h > CADUCIDAD_H ? ' · datos antiguos' : '');
  el.classList.toggle('antiguo', h > CADUCIDAD_H);
}

function pintarZona() {
  pintarEstadoMeteo();
  $<HTMLButtonElement>('#btn-meteo').disabled = !navigator.onLine;
  const ul = $('#lista-semaforo');
  ul.replaceChildren();
  const graf = $('#zona-grafico');
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
  if (!serie) return;
  const hoyF = fechaMadrid(new Date());
  const r = estadoEn(puntoSel, elegida);
  const reg = reglasDe(elegida);
  const ventana = r?.episodio && reg ? { desde: sumarDias(r.episodio, reg.ventana_dias[0]), hasta: sumarDias(r.episodio, reg.ventana_dias[1]),
    etiqueta: `ventana ${nombres[elegida]?.split(' ')[1] ?? ''}`.trim() } : null;
  pintarGrafico($('#grafico'), serie, hoyF, ventana, (t) => ($('#grafico-dato').textContent = t));
  const tabla = $<HTMLTableElement>('#tabla-dias');
  tabla.replaceChildren();
  const cab = tabla.insertRow();
  for (const t of ['Día', 'Lluvia (mm)', 'Máx (°C)', 'Mín (°C)']) { const th = document.createElement('th'); th.textContent = t; cab.append(th); }
  const n1 = (v: number) => (Number.isFinite(v) ? v.toLocaleString('es-ES', { maximumFractionDigits: 1 }) : '—');
  for (const d of serie) {
    const tr = tabla.insertRow();
    tr.className = d.fecha === hoyF ? 'hoy' : d.fecha > hoyF ? 'prev' : '';
    for (const v of [ddmm(d.fecha) + (d.fecha === hoyF ? ' hoy' : ''), n1(d.lluvia), n1(d.tmax), n1(d.tmin)]) tr.insertCell().textContent = v;
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
