// Modo «Navegar aquí» (2026-10-18, «a lo Wikiloc»): a pantalla completa, el mini-mapa sigue tu posición (opcionalmente
// girado hacia donde miras), con la línea de ti al destino y, si la app tiene el acceso a pie, el sendero
// aparcamiento → sitio; flecha con la brújula, distancia y desnivel restantes, rumbo, aviso al llegar (< 30 m) y al
// salirte del sendero (> 50 m), pantalla encendida (Wake Lock) y grabación del track a la vez (grabar-ui.ts).
// La lógica está en brujula.ts y navegar.ts.
//  - iOS (Safari 13+): DeviceOrientationEvent.requestPermission() solo vale tras un toque: botón «Activar brújula».
//    Da webkitCompassHeading. Android/Chrome: deviceorientationabsolute sin permiso.
//  - Sin brújula (sin permiso, sin sensor o sin lecturas en 3 s): si andas, el rumbo de la marcha del GPS; si no, la
//    flecha se pinta respecto al norte (arriba = norte) y se dice.
import './campo.css';
import type { ManifestApp } from './manifest-region';
import { escucharGps, ultimaPosicion, type PosicionGps } from './posicion-viva';
import { desnivel, giroFlecha, orientacionDe, suavizarAngulo, textoDesnivel, textoRumbo, urlNavegarGoogle } from './brujula';
import { avisosNavegacion, estadoNavegacion, LLEGADA_M, type EstadoNav, type Sendero } from './navegar';
import { textoDistancia } from './ruta';
import { abrirNota, empezarGrabacion, estadoGrabacion, terminar } from './grabar-ui';
import { textoDuracion, textoKm } from './grabacion';
import * as Mini from './minimapa';

export interface DestinoIr {
  lat: number;
  lon: number;
  titulo: string;
  subtitulo?: string;
  /** Ruta a pie por el terreno ya trazada desde tu posición (Modo campo, ruta-pie.ts): se sigue en vez del sendero. */
  ruta?: SenderoApp;
}

/** `terreno` = ruta a pie por el terreno del Modo campo (sin él, sendero desde el aparcamiento). */
export interface SenderoApp extends Sendero { via: string; tipo?: 'terreno' }

export interface ContextoIr {
  manifest: () => ManifestApp | null;
  /** Altitud del terreno en el punto (modelo de acceso.bin); null sin dato. */
  altitudEn: (lat: number, lon: number) => Promise<number | null>;
  /** Sendero a pie aparcamiento → punto (acceso.bin); null si la app no lo tiene para ese punto. */
  sendero: (lat: number, lon: number) => Promise<SenderoApp | null>;
  abrirEnlace: (url: string) => void;
  /** Modo campo (campo-ui.ts) encima de esta vista; sin él, no hay botón. */
  abrirCampo?: () => void;
  /** Guardar el destino en Mis sitios. */
  guardar?: (d: DestinoIr) => Promise<'guardado' | 'ya'>;
  avisar?: (t: string) => void;
}

type Fuente = 'brujula' | 'marcha' | 'norte';
const ESPERA_BRUJULA_MS = 3000;

let ctx: ContextoIr;
let dlg: HTMLDialogElement;
let destino: DestinoIr | null = null;
let altSitio: number | null | undefined;   // undefined = consultando
let sendero: SenderoApp | null | undefined; // undefined = consultando
let pos: PosicionGps | null = null;
let nav: EstadoNav | null = null;
let orient: number | null = null;          // brújula suavizada
let fuente: Fuente = 'norte';
let estadoBrujula = '';
let dejarGps: (() => void) | null = null;
let tBrujula = 0;
let tGrab = 0;
let ultimoGiroMapa = 0;
/** Repintado del mapa aplazado por el límite de ~12/s: sin él se perdía la última posición si llegaban dos seguidas. */
let mapaPendiente = 0;
let grabacionPropia = false;
let bloqueo: { release(): Promise<void> } | null = null;
let avisosVistos: string[] = [];

const $ = <T extends HTMLElement = HTMLElement>(s: string) => dlg.querySelector(s) as T;
const DOE = () => (typeof DeviceOrientationEvent === 'undefined' ? null : DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> });
const anguloPantalla = () => (typeof screen !== 'undefined' && screen.orientation ? screen.orientation.angle : Number((window as any).orientation) || 0);

function html() {
  const d = document.createElement('dialog');
  d.id = 'dlg-ir'; d.className = 'dlg dlg-ir'; d.setAttribute('aria-labelledby', 'ir-titulo');
  d.innerHTML = `
    <div class="ir-cab">
      <div><p class="ir-etq">Navegando a</p><h2 id="ir-titulo"></h2><p id="ir-sub" class="nota"></p></div>
      <button id="ir-cerrar" class="btn" type="button">Salir</button>
    </div>
    <p id="ir-alerta" class="ir-alerta" role="alert" hidden></p>
    <div class="ir-brujula">
      <div class="ir-rosa" aria-hidden="true"><span class="ir-n">N</span>
        <svg id="ir-flecha" class="ir-flecha" viewBox="0 0 100 100"><path d="M50 6 78 86 50 70 22 86z"/></svg>
      </div>
      <div class="ir-datos">
        <p class="ir-dist"><b id="ir-distancia">—</b><small id="ir-medida">en línea recta</small></p>
        <p id="ir-rumbo" class="ir-rumbo"></p>
        <p id="ir-desnivel" class="ir-desnivel"></p>
        <p id="ir-sendero" class="nota ir-sendero"></p>
      </div>
    </div>
    <p id="ir-fuente" class="nota ir-fuente" role="status"></p>
    <button id="ir-activar" class="btn btn-ancho" type="button" hidden>Activar brújula</button>
    <div class="ir-mapa">
      <div id="ir-hueco" class="ir-hueco"></div>
      <div class="ir-mapa-cab vidrio">
        <label class="ir-girar"><input id="ir-seguir" type="checkbox" checked /><span>Seguirme</span></label>
        <label class="ir-girar"><input id="ir-girar" type="checkbox" /><span>Mapa hacia donde miro</span></label>
      </div>
    </div>
    <div class="ir-grab">
      <p id="ir-grab" class="ir-grab-txt"><span class="gr-punto" aria-hidden="true"></span><span id="ir-grab-datos">Grabación parada</span></p>
      <button id="ir-nota" class="btn" type="button">Nota aquí</button>
      <button id="ir-grabar" class="btn" type="button">Grabar</button>
    </div>
    <p id="ir-gps" class="nota" role="status">Buscando tu posición…</p>
    <div class="ir-acciones">
      <button id="ir-google" class="btn" type="button"><svg class="ico" aria-hidden="true"><use href="#i-coche"/></svg>Google Maps</button>
      <button id="ir-google-pie" class="btn" type="button"><svg class="ico" aria-hidden="true"><use href="#i-caminar"/></svg>Google a pie</button>
      <button id="ir-guardar" class="btn" type="button" hidden>Guardar</button>
      <button id="ir-campo" class="btn" type="button" hidden>Modo campo</button>
    </div>
    <p class="nota ir-aviso">Orientativo: la línea recta no sigue caminos y el sendero es aproximado (rejilla de 100 m); puede cruzar fincas, vallas o barrancos. La altitud del GPS puede fallar ±10–30 m.</p>`;
  document.body.append(d);
  return d;
}

const deLa = () => (sendero?.tipo === 'terreno' ? 'de la ruta' : 'del sendero');
const porEl = () => (sendero?.tipo === 'terreno' ? 'por la ruta' : 'por el sendero');

function pintarFuente() {
  const t = fuente === 'brujula' ? 'Flecha según la brújula del teléfono. Sujétalo en horizontal, lejos del coche.'
    : fuente === 'marcha' ? 'Sin brújula: la flecha usa el rumbo de tu marcha (GPS). Camina para que se actualice.'
      : 'Sin brújula: arriba es el norte. La flecha apunta al destino como en un mapa.';
  $('#ir-fuente').textContent = estadoBrujula ? `${estadoBrujula} ${t}` : t;
  dlg.dataset.fuente = fuente;
  const girar = $<HTMLInputElement>('#ir-girar');
  girar.disabled = fuente === 'norte';
  if (girar.disabled) girar.checked = false;
}

/** Orientación con la que se gira la flecha (null = norte arriba). */
function orientacionActual(): number | null {
  if (fuente === 'brujula') return orient;
  if (fuente === 'marcha') return pos?.rumbo ?? null;
  return null;
}

function alerta(tipo: 'llegada' | 'fuera' | 'vuelta') {
  const a = $('#ir-alerta');
  a.dataset.tipo = tipo;
  a.textContent = tipo === 'llegada' ? `Has llegado: estás a menos de ${LLEGADA_M} m del punto.`
    : tipo === 'fuera' ? `Te has salido ${deLa()}: estás a ${textoDistancia(nav?.aSendero_m ?? 0)}. Vuelve hacia la línea azul.`
      : `De vuelta en ${sendero?.tipo === 'terreno' ? 'la ruta' : 'el sendero'}.`;
  a.hidden = false;
  avisosVistos.push(tipo);
  try { navigator.vibrate?.(tipo === 'vuelta' ? 80 : [200, 100, 200]); } catch { /* sin vibración */ }
  if (tipo === 'vuelta') setTimeout(() => { if (a.dataset.tipo === 'vuelta') a.hidden = true; }, 4000);
}

function pintar() {
  if (!destino) return;
  const flecha = $('#ir-flecha');
  if (!pos) {
    $('#ir-distancia').textContent = '—';
    $('#ir-rumbo').textContent = '';
    flecha.style.transform = '';
    dlg.dataset.estado = 'buscando';
  } else {
    const ahora = estadoNavegacion(pos, destino, sendero ?? null, nav?.unido ?? false);
    const avisos = avisosNavegacion(nav, ahora);
    nav = ahora;
    for (const a of avisos) alerta(a);
    if (!ahora.fuera && !ahora.llegado && $('#ir-alerta').dataset.tipo !== 'vuelta') $('#ir-alerta').hidden = true;
    dlg.dataset.estado = ahora.llegado ? 'llegado' : 'ok';
    dlg.dataset.fuera = String(!!ahora.fuera);
    $('#ir-distancia').textContent = ahora.llegado ? 'Has llegado' : textoDistancia(ahora.restante_m);
    $('#ir-medida').textContent = ahora.llegado ? `a menos de ${LLEGADA_M} m` : ahora.medida === 'sendero' ? porEl() : 'en línea recta';
    $('#ir-rumbo').textContent = ahora.llegado ? '' : `Destino ${textoRumbo(ahora.rumbo)}`;
    const giro = giroFlecha(ahora.rumbo, orientacionActual());
    flecha.style.transform = `rotate(${giro.toFixed(1)}deg)`;
    flecha.dataset.giro = giro.toFixed(1);
    $('#ir-gps').textContent = `GPS ±${Math.round(pos.precision)} m${pos.alt !== null ? ` · altitud ${Math.round(pos.alt)} m${pos.precAlt ? ` (±${Math.round(pos.precAlt)} m)` : ''}` : ' · sin altitud'}`;
  }
  // Desnivel: por el perfil del sendero si vas por él; si no, altitud del sitio − GPS; sin datos, PENDIENTE.
  const des = $('#ir-desnivel');
  if (nav?.subidaSendero_m != null) {
    des.textContent = nav.subidaSendero_m < 10 ? `Casi sin subida ${porEl()}` : `≈ ${Math.round(nav.subidaSendero_m / 5) * 5} m de subida ${porEl()}`;
    des.dataset.desnivel = String(nav.subidaSendero_m);
  } else {
    const dn = altSitio === undefined ? null : desnivel(pos?.alt, altSitio);
    des.textContent = altSitio === undefined ? 'Desnivel: consultando la altitud del sitio…'
      : textoDesnivel(dn, altSitio === null ? 'sin altitud del sitio en los datos' : !pos ? 'sin posición' : pos.alt === null ? 'el GPS no da altitud' : '');
    des.dataset.desnivel = dn === null ? 'pendiente' : String(Math.round(dn));
  }
  $('#ir-sendero').textContent = sendero === undefined ? 'Buscando el sendero a pie…'
    : sendero === null ? 'Sin sendero a pie de la app para este punto: solo línea recta.'
      : `${sendero.tipo === 'terreno' ? 'Ruta a pie por el terreno desde' : 'Sendero a pie desde'} ${sendero.via}${nav && !nav.unido && nav.aSendero_m !== null ? ` (te queda a ${textoDistancia(nav.aSendero_m)})` : ''}.`;
  dlg.dataset.sendero = sendero ? 'si' : sendero === null ? 'no' : 'buscando';
  pintarMapa();
}

function pintarMapa() {
  if (!destino) return;
  const yo = pos ? [pos.lon, pos.lat] : null;
  Mini.datos('ir', { type: 'FeatureCollection', features: [
    ...(sendero ? [{ type: 'Feature' as const, properties: { tipo: 'sendero' }, geometry: { type: 'LineString' as const, coordinates: sendero.linea } }] : []),
    ...(yo ? [{ type: 'Feature' as const, properties: { tipo: 'linea' }, geometry: { type: 'LineString' as const, coordinates: [yo, [destino.lon, destino.lat]] } },
      { type: 'Feature' as const, properties: { tipo: 'yo' }, geometry: { type: 'Point' as const, coordinates: yo } }] : []),
    { type: 'Feature', properties: { tipo: 'destino' }, geometry: { type: 'Point', coordinates: [destino.lon, destino.lat] } },
  ] });
  const m = Mini.mapaListo();
  if (!m || !dlg.open) return;
  const seguir = $<HTMLInputElement>('#ir-seguir').checked && pos;
  const o = $<HTMLInputElement>('#ir-girar').checked ? orientacionActual() : null;
  const ahora = performance.now();
  if (ahora - ultimoGiroMapa < 80) {                     // ~12 por segundo: de sobra y no satura el móvil
    if (!mapaPendiente) mapaPendiente = window.setTimeout(() => { mapaPendiente = 0; pintarMapa(); }, 80 - (ahora - ultimoGiroMapa));
    return;
  }
  ultimoGiroMapa = ahora;
  if (seguir) { m.jumpTo({ center: [pos!.lon, pos!.lat], bearing: o ?? 0, zoom: Math.max(m.getZoom(), 15) }); return; }
  if (o !== null) m.jumpTo({ bearing: o }); else if (m.getBearing() !== 0) m.jumpTo({ bearing: 0 });
}

/** Encuadra destino, tu posición y el sendero (al dejar de seguirte o sin GPS). */
function vistaGeneral() {
  const m = Mini.mapaListo();
  if (!m || !destino) return;
  const pts: [number, number][] = [[destino.lon, destino.lat], ...(pos ? [[pos.lon, pos.lat] as [number, number]] : []), ...(sendero?.linea ?? [])];
  const lons = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
  m.jumpTo({ bearing: 0 });
  if (pts.length === 1) m.jumpTo({ center: pts[0], zoom: 15 });
  else m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 40, maxZoom: 16, duration: 0 });
}

function alOrientar(ev: DeviceOrientationEvent) {
  const o = orientacionDe({ webkitCompassHeading: (ev as any).webkitCompassHeading, alpha: ev.alpha, absolute: ev.absolute || ev.type === 'deviceorientationabsolute' },
    anguloPantalla());
  if (o === null) return;
  orient = suavizarAngulo(orient, o, 0.3);
  if (fuente !== 'brujula') { fuente = 'brujula'; estadoBrujula = ''; clearTimeout(tBrujula); $('#ir-activar').hidden = true; pintarFuente(); }
  pintar();
}

/** Escucha la brújula; `conPlazo` = sin lecturas en 3 s, se da por perdida y se dice (no mientras falte el permiso). */
function escucharBrujula(conPlazo = true) {
  window.addEventListener('deviceorientationabsolute', alOrientar as EventListener);
  window.addEventListener('deviceorientation', alOrientar as EventListener);
  clearTimeout(tBrujula);
  if (!conPlazo) return;
  tBrujula = window.setTimeout(() => {
    if (fuente === 'brujula') return;
    estadoBrujula = 'Este teléfono no da la brújula al navegador.';
    fuente = pos?.rumbo != null && (pos.velocidad ?? 0) > 0.5 ? 'marcha' : 'norte';
    pintarFuente(); pintar();
  }, ESPERA_BRUJULA_MS);
}

function dejarBrujula() {
  window.removeEventListener('deviceorientationabsolute', alOrientar as EventListener);
  window.removeEventListener('deviceorientation', alOrientar as EventListener);
  clearTimeout(tBrujula);
}

async function activarBrujula() {
  const D = DOE();
  try {
    const r = await D!.requestPermission!();
    if (r === 'granted') { estadoBrujula = ''; $('#ir-activar').hidden = true; escucharBrujula(); return; }
    estadoBrujula = 'Sin permiso para la brújula (se puede dar en Ajustes › Safari › Movimiento y orientación).';
  } catch {
    estadoBrujula = 'No se pudo activar la brújula.';
  }
  pintarFuente(); pintar();
}

function alGps(p: PosicionGps) {
  pos = p;
  if (fuente !== 'brujula') {
    const f: Fuente = p.rumbo !== null && (p.velocidad ?? 0) > 0.5 ? 'marcha' : 'norte';
    if (f !== fuente) { fuente = f; pintarFuente(); }
  }
  pintar();
}

async function pedirBloqueo() {
  try { bloqueo = await (navigator as any).wakeLock?.request('screen') ?? null; } catch { bloqueo = null; }
}

function pintarGrab() {
  const g = estadoGrabacion();
  $('#ir-grab-datos').textContent = g ? `Grabando · ${textoDuracion(g.duracion_s)} · ${textoKm(g.distancia_m)}${g.notas.length ? ` · ${g.notas.length} notas` : ''}` : 'Grabación parada';
  dlg.dataset.grabando = g ? '1' : '';
  $<HTMLButtonElement>('#ir-nota').disabled = !g || !pos;
  $('#ir-grabar').textContent = g ? 'Terminar' : 'Grabar';
}

async function cerrar() {
  dejarGps?.(); dejarGps = null;
  dejarBrujula();
  clearInterval(tGrab);
  bloqueo?.release().catch(() => {}); bloqueo = null;
  destino = null;
  delete document.body.dataset.ir;
  Mini.datos('ir', { type: 'FeatureCollection', features: [] });
  const m = Mini.mapaListo();
  if (m && m.getBearing() !== 0) m.jumpTo({ bearing: 0 });
  // La grabación que empezó al navegar se ofrece terminar al salir (si dices que no, sigue con el panel flotante).
  if (grabacionPropia && estadoGrabacion()) { grabacionPropia = false; await terminar(); }
  grabacionPropia = false;
}

/** Abre el modo «Navegar aquí» hacia `d` y empieza a grabar el track (si no se estaba grabando ya). */
export async function abrirIr(d: DestinoIr) {
  if (!dlg) return;
  destino = d; altSitio = undefined; sendero = d.ruta ? { ...d.ruta, tipo: 'terreno' } : undefined; pos = ultimaPosicion(); nav = null; orient = null; fuente = 'norte'; estadoBrujula = '';
  avisosVistos = [];
  $('#ir-alerta').hidden = true;
  $('#ir-titulo').textContent = d.titulo || 'Punto del mapa';
  $('#ir-sub').textContent = d.subtitulo ?? `${d.lat.toFixed(5)}, ${d.lon.toFixed(5)}`;
  $<HTMLInputElement>('#ir-girar').checked = false;
  $<HTMLInputElement>('#ir-seguir').checked = true;
  const D = DOE();
  const pidePermiso = typeof D?.requestPermission === 'function';
  $('#ir-activar').hidden = !pidePermiso;
  // Con requestPermission (iOS, y algunos Chrome) se escucha ya por si el permiso estaba dado; si no llegan
  // lecturas, el botón «Activar brújula» lo pide.
  if (!D) estadoBrujula = 'Este navegador no da la brújula.';
  else if (!pidePermiso) escucharBrujula();
  else { estadoBrujula = 'Pulsa «Activar brújula» para que la flecha gire contigo.'; escucharBrujula(false); }
  pintarFuente();
  if (!dlg.open) dlg.showModal();
  document.body.dataset.ir = 'abierto';
  Mini.ponerEn($('#ir-hueco'));
  pedirBloqueo();
  grabacionPropia = await empezarGrabacion(true);
  clearInterval(tGrab);
  tGrab = window.setInterval(pintarGrab, 1000);
  pintarGrab();
  pintar();
  dejarGps?.();
  dejarGps = escucharGps(alGps, (m) => { $('#ir-gps').textContent = m; });
  ctx.altitudEn(d.lat, d.lon).catch(() => null).then((a) => { if (destino === d) { altSitio = a; pintar(); } });
  if (!d.ruta) ctx.sendero(d.lat, d.lon).catch(() => null).then((s) => { if (destino === d) { sendero = s; nav = null; pintar(); } });
  const m = await Mini.miniMapa(ctx.manifest());
  if (m && destino === d) Mini.alCargar(() => { if (!pos) vistaGeneral(); pintar(); });
}

export function iniciarIr(c: ContextoIr) {
  ctx = c;
  dlg = html();
  $('#ir-cerrar').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => { cerrar(); });
  $('#ir-activar').addEventListener('click', activarBrujula);
  $('#ir-girar').addEventListener('change', () => { ultimoGiroMapa = 0; pintar(); });
  $('#ir-seguir').addEventListener('change', () => { ultimoGiroMapa = 0; if (!$<HTMLInputElement>('#ir-seguir').checked) vistaGeneral(); pintar(); });
  $('#ir-google').addEventListener('click', () => destino && ctx.abrirEnlace(urlNavegarGoogle(destino, 'driving')));
  $('#ir-google-pie').addEventListener('click', () => destino && ctx.abrirEnlace(urlNavegarGoogle(destino, 'walking')));
  $('#ir-nota').addEventListener('click', () => abrirNota());
  $('#ir-campo').hidden = !c.abrirCampo;
  $('#ir-campo').addEventListener('click', () => c.abrirCampo?.());
  $('#ir-guardar').hidden = !c.guardar;
  $('#ir-guardar').addEventListener('click', async () => {
    if (!destino || !c.guardar) return;
    const r = await c.guardar(destino);
    c.avisar?.(r === 'ya' ? 'Ya estaba en Mis sitios' : 'Guardado en Mis sitios');
  });
  $('#ir-grabar').addEventListener('click', async () => {
    if (estadoGrabacion()) { await terminar(); grabacionPropia = false; } else grabacionPropia = await empezarGrabacion(true);
    pintarGrab();
  });
  // Arrastrar el mapa deja de seguirte (como en Wikiloc); «Seguirme» lo vuelve a activar.
  Mini.alCrear((m) => m.on('dragstart', () => { if (dlg.open) $<HTMLInputElement>('#ir-seguir').checked = false; }));
  document.addEventListener('visibilitychange', () => { if (dlg.open && document.visibilityState === 'visible') pedirBloqueo(); });
}

/** Devuelve el mini-mapa a esta vista (al cerrar el modo campo abierto encima). */
export function volverAlMapaIr() {
  if (!dlg?.open || !destino) return;
  Mini.ponerEn($('#ir-hueco'));
  ultimoGiroMapa = 0;
  pintar();
}

/** Estado para el e2e (window.__setas.ir()). */
export const estadoIr = () => (dlg?.open && destino ? { destino, fuente, orientacion: orient, pos, altSitio: altSitio ?? null, nav,
  sendero: sendero ? { via: sendero.via, tipo: sendero.tipo ?? 'aparcamiento', n: sendero.linea.length, linea: sendero.linea } : sendero ?? null, avisos: [...avisosVistos],
  giro: Number($('#ir-flecha').dataset.giro ?? NaN), distancia: $('#ir-distancia').textContent, desnivel: $('#ir-desnivel').textContent,
  alerta: $('#ir-alerta').hidden ? null : $('#ir-alerta').textContent, rumboMapa: Mini.mapaListo()?.getBearing() ?? null,
  centroMapa: Mini.mapaListo()?.getCenter().toArray() ?? null } : null);
