// «Grabar ruta» (2026-10-18): panel flotante mientras se graba (tiempo, distancia, GPS, «Nota aquí», «Terminar»), notas
// con posición y estrellas, y «Mis rutas» en Mis sitios (resumen, GPX, ver en el mapa, borrar). La lógica está en
// grabacion.ts y el almacenamiento en rutas.ts.
//  - La grabación en curso se guarda en IndexedDB a cada punto (como mucho cada 3 s) y al ocultar la página: si iOS
//    la recarga, al volver sigue grabando en un tramo nuevo.
//  - Safari puede pausar el GPS con la pantalla bloqueada o con otra app delante: se avisa y se pide Wake Lock
//    (pantalla encendida) si el navegador lo tiene; se vuelve a pedir al volver a la app.
import './campo.css';
import type { Map as MapaML, GeoJSONSource } from 'maplibre-gl';
import { anadirNota, anadirPunto, nombreArchivoGpx, nuevoSegmento, nuevoTrack, resumen, textoDuracion, textoKm, textoResumen,
  trackAGeojson, trackAGpx, type Track } from './grabacion';
import { borrarGrabacion, borrarRuta, guardarGrabacion, guardarRuta, leerGrabacion, leerRuta, listarRutas } from './rutas';
import { escucharGps, type PosicionGps } from './posicion-viva';
import { nuevoId } from './intercambio';

export interface ContextoGrabar {
  avisar: (texto: string, ms?: number) => void;
  /** Mapa principal (para «Ver en el mapa») y cambio de pestaña. */
  mapa: () => MapaML | null;
  irA: (pantalla: string) => void;
}

export const AVISO_PANTALLA = 'Safari puede pausar el GPS con la pantalla bloqueada o con otra app delante: deja la app abierta. '
  + 'La pantalla se mantiene encendida si el teléfono lo permite.';
const NOTAS_RAPIDAS = ['Aquí boletus', 'Aquí amanitas', 'Suelo seco', 'Suelo húmedo', 'Nada'];
const ESPERA_ESCRITURA_MS = 3000;
const SIN_SENAL_S = 60;

let ctx: ContextoGrabar;
let grabando: Track | null = null;
let ultima: PosicionGps | null = null;
let dejarGps: (() => void) | null = null;
let tic = 0;
let ultimaEscritura = 0;
let bloqueo: { release(): Promise<void> } | null = null;
let errorGps = '';
let panel: HTMLElement;
let dlgNota: HTMLDialogElement;
let dlgFin: HTMLDialogElement;

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const hora = (t: number) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

function avisarCambio() {
  document.body.dataset.grabando = grabando ? '1' : '';
  if (!grabando) delete document.body.dataset.grabando;
  document.dispatchEvent(new CustomEvent('setas:grabacion', { detail: { grabando: !!grabando } }));
}

function html() {
  panel = document.createElement('div');
  panel.id = 'grabacion'; panel.className = 'grabacion vidrio'; panel.hidden = true;
  panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', 'Grabación de ruta');
  panel.innerHTML = `
    <div class="gr-fila">
      <span class="gr-punto" aria-hidden="true"></span>
      <p class="gr-datos"><b id="gr-tiempo">0 s</b> · <span id="gr-distancia">0 m</span> · <span id="gr-gps">buscando GPS…</span></p>
    </div>
    <p id="gr-aviso" class="gr-aviso"></p>
    <div class="gr-acciones">
      <button id="gr-nota" class="btn" type="button">Nota aquí</button>
      <button id="gr-terminar" class="btn btn-primario" type="button">Terminar</button>
    </div>`;
  document.body.append(panel);

  dlgNota = document.createElement('dialog');
  dlgNota.id = 'dlg-nota-ruta'; dlgNota.className = 'dlg dlg-hoja';
  dlgNota.innerHTML = `
    <form method="dialog" id="frm-nota-ruta">
      <h2>Nota en este punto</h2>
      <p id="nr-pos" class="nota"></p>
      <div class="nr-rapidas" role="group" aria-label="Notas rápidas">${NOTAS_RAPIDAS.map((t) => `<button type="button" class="chip" data-t="${t}">${t}</button>`).join('')}</div>
      <label class="campo"><span class="etq">Nota</span><textarea id="nr-texto" name="texto" rows="2" maxlength="500"></textarea></label>
      <fieldset class="estrellas-nota">
        <legend>Valoración (opcional)</legend>
        <label><input type="radio" name="estrellas" value="0" checked /><span>—</span></label>
        <label><input type="radio" name="estrellas" value="1" /><span>★</span></label>
        <label><input type="radio" name="estrellas" value="2" /><span>★★</span></label>
        <label><input type="radio" name="estrellas" value="3" /><span>★★★</span></label>
      </fieldset>
      <div class="fila-botones">
        <button type="button" id="nr-cancelar" class="btn">Cancelar</button>
        <button type="submit" id="nr-guardar" class="btn btn-primario">Guardar nota</button>
      </div>
    </form>`;
  document.body.append(dlgNota);

  dlgFin = document.createElement('dialog');
  dlgFin.id = 'dlg-ruta-fin'; dlgFin.className = 'dlg dlg-hoja';
  dlgFin.innerHTML = `
    <h2>Ruta guardada</h2>
    <p id="rf-nombre" class="nota"></p>
    <dl id="rf-resumen" class="rf-resumen"></dl>
    <p class="nota">Está en Mis sitios › Mis rutas.</p>
    <div class="fila-botones">
      <button type="button" id="rf-gpx" class="btn">Exportar GPX</button>
      <button type="button" id="rf-mapa" class="btn">Ver en el mapa</button>
      <button type="button" id="rf-cerrar" class="btn btn-primario">Cerrar</button>
    </div>`;
  document.body.append(dlgFin);
}

function pintarPanel() {
  if (!grabando) { panel.hidden = true; return; }
  panel.hidden = false;
  const r = resumen(grabando, Date.now());
  $('#gr-tiempo').textContent = textoDuracion(r.duracion_s);
  $('#gr-distancia').textContent = textoKm(r.distancia_m);
  const edad = ultima ? (Date.now() - ultima.t) / 1000 : Infinity;
  $('#gr-gps').textContent = errorGps || (!ultima ? 'buscando GPS…' : edad > SIN_SENAL_S ? `sin GPS desde las ${hora(ultima.t)}` : `GPS ±${Math.round(ultima.precision)} m`);
  panel.dataset.gps = errorGps ? 'error' : !ultima ? 'buscando' : edad > SIN_SENAL_S ? 'parado' : 'ok';
  $('#gr-aviso').textContent = AVISO_PANTALLA;
  $<HTMLButtonElement>('#gr-nota').disabled = !ultima;
  panel.dataset.puntos = String(r.puntos);
}

function persistir(forzar = false) {
  if (!grabando) return;
  if (!forzar && Date.now() - ultimaEscritura < ESPERA_ESCRITURA_MS) return;
  ultimaEscritura = Date.now();
  guardarGrabacion(grabando).catch((e) => console.warn('grabación en curso', e));
}

async function pedirBloqueo() {
  try { bloqueo = await (navigator as any).wakeLock?.request('screen') ?? null; } catch { bloqueo = null; }
}

function alPunto(p: PosicionGps) {
  ultima = p; errorGps = '';
  if (!grabando) return;
  if (anadirPunto(grabando, { t: p.t, lat: p.lat, lon: p.lon, alt: p.alt, prec: p.precision })) persistir();
  pintarPanel();
}

function conectar() {
  dejarGps?.();
  dejarGps = escucharGps(alPunto, (m) => { errorGps = m; pintarPanel(); });
  pedirBloqueo();
  clearInterval(tic);
  tic = window.setInterval(pintarPanel, 1000);
  avisarCambio();
  pintarPanel();
}

function desconectar() {
  dejarGps?.(); dejarGps = null;
  clearInterval(tic);
  bloqueo?.release().catch(() => {}); bloqueo = null;
}

/** Empieza a grabar (si ya graba, no hace nada). Devuelve si ha empezado una grabación nueva. */
export async function empezarGrabacion(silencio = false): Promise<boolean> {
  if (grabando) { pintarPanel(); return false; }
  if (!('geolocation' in navigator)) { ctx.avisar('Este dispositivo no tiene GPS disponible.'); return false; }
  grabando = nuevoTrack(nuevoId(), Date.now());
  ultima = null; errorGps = '';
  persistir(true);
  conectar();
  if (!silencio) ctx.avisar('Grabando la ruta. ' + AVISO_PANTALLA, 6000);
  return true;
}

/** Termina la grabación (pide confirmación) y la guarda en Mis rutas. */
export async function terminar() {
  if (!grabando) return;
  if (!confirm('¿Terminar la grabación y guardar la ruta?')) return;
  const tr = grabando;
  tr.fin = Date.now();
  desconectar();
  grabando = null;
  avisarCambio();
  pintarPanel();
  if (!tr.puntos.length && !tr.notas.length) {
    await borrarGrabacion().catch(() => {});
    ctx.avisar('Ruta sin puntos de GPS ni notas: no se guarda.', 5000);
    return;
  }
  await guardarRuta(tr);
  await borrarGrabacion().catch(() => {});
  abrirFin(tr);
  pintarRutas();
}

function abrirFin(tr: Track) {
  const r = resumen(tr);
  $('#rf-nombre').textContent = tr.nombre;
  const dl = $('#rf-resumen'); dl.replaceChildren();
  const fila = (k: string, v: string) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; dl.append(dt, dd); };
  fila('Distancia', textoKm(r.distancia_m));
  fila('Desnivel', r.subida_m === null ? 'PENDIENTE (el GPS no dio altitud)' : `+${r.subida_m} m / −${r.bajada_m} m (aprox.)`);
  fila('Duración', textoDuracion(r.duracion_s));
  fila('Notas', String(r.notas));
  if (r.segmentos > 1) fila('Tramos', `${r.segmentos} (el GPS se pausó o la página se recargó)`);
  dlgFin.dataset.id = tr.id;
  dlgFin.showModal();
}

/** Abre la nota en el punto actual (también desde «Navegar aquí»). */
export function abrirNota() {
  if (!grabando || !ultima) return;
  const p = ultima;
  dlgNota.dataset.lat = String(p.lat); dlgNota.dataset.lon = String(p.lon); dlgNota.dataset.alt = p.alt === null ? '' : String(p.alt);
  $('#nr-pos').textContent = `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)} · GPS ±${Math.round(p.precision)} m${p.alt !== null ? ` · ${Math.round(p.alt)} m` : ''}`;
  $<HTMLTextAreaElement>('#nr-texto').value = '';
  (dlgNota.querySelector('input[name=estrellas][value="0"]') as HTMLInputElement).checked = true;
  dlgNota.showModal();
}

function guardarNota(ev: Event) {
  ev.preventDefault();
  if (!grabando) { dlgNota.close(); return; }
  const d = new FormData(ev.target as HTMLFormElement);
  const alt = dlgNota.dataset.alt;
  anadirNota(grabando, { id: nuevoId(), t: Date.now(), lat: Number(dlgNota.dataset.lat), lon: Number(dlgNota.dataset.lon),
    alt: alt ? Number(alt) : null, texto: String(d.get('texto') ?? ''), estrellas: Number(d.get('estrellas') ?? 0) });
  persistir(true);
  dlgNota.close();
  ctx.avisar(`Nota ${grabando.notas.length} guardada`);
}

function bajarGpx(tr: Track) {
  const u = URL.createObjectURL(new Blob([trackAGpx(tr)], { type: 'application/gpx+xml' }));
  const a = document.createElement('a'); a.href = u; a.download = nombreArchivoGpx(tr);
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 10000);
}

/** Pinta la ruta en el mapa principal (capa propia) y la encuadra. */
export function verRutaEnMapa(tr: Track) {
  const m = ctx.mapa();
  if (!m) { ctx.avisar('El mapa aún no está listo.'); return; }
  ctx.irA('p-mapa');
  const g = trackAGeojson(tr);
  const src = m.getSource('ruta-grabada') as GeoJSONSource | undefined;
  if (src) src.setData(g);
  else {
    m.addSource('ruta-grabada', { type: 'geojson', data: g });
    m.addLayer({ id: 'ruta-grabada', type: 'line', source: 'ruta-grabada', filter: ['==', ['get', 'tipo'], 'track'],
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#6a1b9a', 'line-width': 4, 'line-opacity': 0.9 } });
    m.addLayer({ id: 'ruta-grabada-notas', type: 'circle', source: 'ruta-grabada', filter: ['==', ['get', 'tipo'], 'nota'],
      paint: { 'circle-radius': 7, 'circle-color': '#6a1b9a', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } });
  }
  const pts = [...tr.puntos, ...tr.notas];
  if (!pts.length) return;
  const lons = pts.map((p) => p.lon), lats = pts.map((p) => p.lat);
  m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 60, maxZoom: 16, duration: 0 });
  document.body.dataset.rutaGrabada = tr.id;
}

/** «Mis rutas» en la pestaña Mis sitios. */
export async function pintarRutas() {
  const ul = document.querySelector<HTMLElement>('#lista-rutas');
  if (!ul) return;
  const l = await listarRutas().catch(() => [] as Track[]);
  ul.replaceChildren();
  if (!l.length) {
    const li = document.createElement('li'); li.className = 'vacio';
    li.textContent = 'Aún no hay rutas. Pulsa «Grabar ruta» al empezar a andar.';
    ul.append(li); return;
  }
  for (const tr of l) {
    const li = document.createElement('li'); li.className = 'sitio ruta-grabada'; li.dataset.id = tr.id;
    const t = document.createElement('div'); t.className = 'meta'; t.textContent = tr.nombre;
    const r = document.createElement('div'); r.className = 'txt rg-resumen'; r.textContent = textoResumen(resumen(tr));
    li.append(t, r);
    if (tr.notas.length) {
      const n = document.createElement('div'); n.className = 'txt rg-notas';
      n.textContent = `${tr.notas.length} ${tr.notas.length === 1 ? 'nota' : 'notas'}: ${tr.notas.slice(0, 3).map((x) => `${'★'.repeat(x.estrellas)}${x.estrellas ? ' ' : ''}${x.texto || '(sin texto)'}`).join(' · ')}${tr.notas.length > 3 ? '…' : ''}`;
      li.append(n);
    }
    const acc = document.createElement('div'); acc.className = 'acciones';
    const b = (texto: string, f: () => void, clase = 'btn') => { const x = document.createElement('button'); x.type = 'button'; x.className = clase; x.textContent = texto; x.onclick = f; return x; };
    acc.append(b('Ver en mapa', () => verRutaEnMapa(tr)), b('GPX', () => bajarGpx(tr), 'btn btn-primario rg-gpx'),
      b('Borrar', async () => { if (!confirm(`¿Borrar «${tr.nombre}»?`)) return; await borrarRuta(tr.id); pintarRutas(); }, 'btn btn-peligro'));
    li.append(acc);
    ul.append(li);
  }
}

/** Recupera una grabación en curso tras una recarga y sigue grabando en un tramo nuevo. */
async function recuperar() {
  const tr = await leerGrabacion().catch(() => null);
  if (!tr || tr.fin !== null || grabando) return;
  grabando = tr;
  nuevoSegmento(grabando);
  persistir(true);
  conectar();
  ctx.avisar(`La página se recargó: la ruta que empezaste a las ${hora(tr.inicio)} se sigue grabando (tramo nuevo).`, 7000);
}

export function iniciarGrabar(c: ContextoGrabar) {
  ctx = c;
  html();
  $('#gr-nota').addEventListener('click', abrirNota);
  $('#gr-terminar').addEventListener('click', terminar);
  $('#frm-nota-ruta').addEventListener('submit', guardarNota);
  $('#nr-cancelar').addEventListener('click', () => dlgNota.close());
  dlgNota.querySelectorAll<HTMLButtonElement>('.nr-rapidas .chip').forEach((b) => b.addEventListener('click', () => {
    const t = $<HTMLTextAreaElement>('#nr-texto');
    t.value = t.value.trim() ? `${t.value.trim()}, ${b.dataset.t!.toLowerCase()}` : b.dataset.t!;
  }));
  $('#rf-cerrar').addEventListener('click', () => dlgFin.close());
  $('#rf-gpx').addEventListener('click', async () => { const tr = await leerRuta(dlgFin.dataset.id ?? ''); if (tr) bajarGpx(tr); });
  $('#rf-mapa').addEventListener('click', async () => { const tr = await leerRuta(dlgFin.dataset.id ?? ''); dlgFin.close(); if (tr) verRutaEnMapa(tr); });
  document.querySelector('#btn-grabar-ruta')?.addEventListener('click', () => empezarGrabacion());
  document.addEventListener('visibilitychange', () => {
    if (!grabando) return;
    if (document.visibilityState === 'hidden') persistir(true);
    else { pedirBloqueo(); pintarPanel(); }
  });
  window.addEventListener('pagehide', () => persistir(true));
  recuperar();
}

/** Estado para el e2e (window.__setas.grabacion()). */
export const estadoGrabacion = () => (grabando ? { ...resumen(grabando, Date.now()), id: grabando.id, seg: grabando.seg,
  notas: grabando.notas.map((n) => ({ texto: n.texto, estrellas: n.estrellas })) } : null);
