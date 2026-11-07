// «Explorar aquí» (2026-10-25): pantalla completa con la cámara trasera, el rumbo del teléfono y un barrido de 8 fotos
// (una cada 45°) que se guarda en el teléfono como observación (observaciones.ts). Patrón de ir-sitio.ts y campo-ui.ts.
//  - Sin conexión y sin coste: nada sale del teléfono hasta que pulsas «Analizar» (explorar-resultado.ts: aviso de privacidad
//    la primera vez, envío a POST /explorar, cola de pendientes). El resultado son 8 direcciones con su puntuación y una
//    «Mejor dirección» que calcula explorar.ts (Gemini solo describe); «Ver en la cámara» la saca como marca grande.
//  - AR ligera: sobre el vídeo, una marca por microzona (la misma selección que Modo campo: seleccionarMicrozonas + filtro de
//    desnivel de campo-ruta.ts, misma seta) colocada con la brújula y la inclinación (explorar-geo.ts: proyectar). No está
//    anclada al paisaje: se mueve con el error de la brújula. Fuera de cuadro, un chip en el borde. Desnivel = cota de la
//    celda − tu cota, las dos del modelo del terreno (no la altitud del GPS). Se repinta en cada lectura de brújula (rAF) y
//    se recalcula al moverte más de 50 m.
//  - Brújula: iOS pide permiso tras un toque («Activar brújula»); Android da deviceorientationabsolute sin permiso.
//    Sin brújula, o con la cámara en modo archivo (camara.ts), se hace una foto por dirección con un botón cada una.
//  - Disparo automático (solo con cámara en vivo): rumbo a ±10° del objetivo, móvil casi vertical y quieto
//    (explorar-geo.ts). Para decidir, el rumbo es la media de las últimas lecturas, no el valor suavizado de la pantalla.
//  - En apaisado no hay inclinación fiable (beta cambia de eje): sin disparo automático, el botón «Foto ahora» sigue valiendo.
//  - Batería: sin toques durante 2 min se paran cámara, GPS y sensores («Reanudar»). Wake Lock mientras está activa.
//  - Cuatro toques seguidos en el rumbo enseñan un diagnóstico (webkitCompassAccuracy, cámara, orientación) para la fase 0.
import './campo.css';
import type { ManifestApp } from './manifest-region';
import { escucharGps, ultimaPosicion, type PosicionGps } from './posicion-viva';
import { cardinal, cardinalCorto, distanciaM, normalizar, orientacionDe, suavizarAngulo } from './brujula';
import { ARBOL, MAX_MICROZONAS, seleccionarMicrozonas, UMBRAL_BUENA, type ValoresCelda } from './micro';
import { celdaAqui, celdasAlrededor, datosMicro, type DatosMicro } from './micro-datos';
import { cotasEn } from './mdt-datos';
import { cajaAlrededor, CANDIDATAS, filtrarPorDesnivel, type DesnivelMicro } from './ruta-pie';
import * as RC from './campo-ruta';
import { cotaEn } from './mdt';
import { abrirCamara, capturar, type Camara } from './camara';
import { celdasMarca, deltaAngulo, enSector, estaQuieto, FOV_H, FOV_V, listoParaDisparar, mediaCircular, PASO_BARRIDO, PRECISION_BRUJULA_MAX, proyectar, rumbosBarrido,
  type Marca } from './explorar-geo';
import { notaDeObservacion, nuevaObservacion, type DireccionObs, type Observacion } from './observaciones-datos';
import { anadirNotaExterna } from './grabar-ui';
import { guardarObservacion, leerObservacion } from './observaciones';
import { analizarObservacion, EVENTO_CAMBIO, iniciarAnalisis, mejorDe, perfilDe, pintarResultado, reintentarPendientes, urlAnalisis } from './explorar-resultado';

export interface ContextoExplorar {
  /** Seta elegida en el mapa (valor inicial si quien abre no da otra). */
  especie: () => string;
  /** Id de la región activa (diagnóstico). */
  region: () => string;
  /** Manifest de la región: de él salen los datos de microzonas y de cotas. */
  manifest: () => ManifestApp | null;
  /** URL de la miniatura de la guía de una seta (o null): icono de las marcas. */
  miniatura?: (id: string) => string | null;
  /** Setas de la región con su nombre (para «¿Qué encontraste?»). */
  especies: () => { id: string; nombre: string }[];
  /** Guardar un punto en Mis sitios (sin duplicarlo). */
  guardar: (p: { lat: number; lon: number; nota: string; especie: string }) => Promise<'guardado' | 'ya'>;
  avisar: (texto: string) => void;
}

type Fase = 'visor' | 'barrido' | 'guardando' | 'fin';
const ESPERA_BRUJULA_MS = 3000;
const INACTIVIDAD_MS = 120000;
const MIN_ENTRE_LECTURAS_MS = 40;
const LECTURAS_QUIETO = 8;
const LECTURAS_RUMBO = 5;
const TOQUES_DIAGNOSTICO = 4;
const RADIO_SECTORES_M = 500;
const RADIO_COTA_M = 150;
const SIN_BRUJULA = 'Este móvil no da la brújula al navegador.';
const AVISO_BRUJULA = 'Brújula poco fiable: aléjate del coche y haz un 8 con el teléfono.';

let ctx: ContextoExplorar;
let dlg: HTMLDialogElement;
let camara: Camara | null = null;
let especie = '';
let fase: Fase = 'visor';
let pos: PosicionGps | null = null;
let orient: number | null = null;
let beta: number | null = null;
let precBrujula: number | null = null;
let lecturas: number[] = [];
let tLectura = 0;
let hayBrujula = false;
let objetivos: number[] = [];
let hechas = new Map<number, DireccionObs>();
let siguiente = 0;
let posBarrido: PosicionGps | null = null;
let disparando = false;
let obs: Observacion | null = null;
let dejarGps: (() => void) | null = null;
let tBrujula = 0;
let tInactivo = 0;
let ultimoToque = 0;
let pausado = false;
let abierto = false;
let bloqueo: { release(): Promise<void> } | null = null;
let estadoBrujula = '';
let toquesRumbo: number[] = [];
let sesion = 0;
type MicroAR = ValoresCelda & DesnivelMicro;
let datosAR: DatosMicro | null | undefined;
let celdasAR: ValoresCelda[] = [];
let microAR: MicroAR[] = [];
let centroAR: { lat: number; lon: number } | null = null;
let calculandoAR = false;
let pendienteAR = false;
let rafAR = 0;
let ultimoAR: { estado: 'ok' | 'sin-datos' | 'sin-brujula' | 'cargando'; ancho: number; alto: number; dentro: boolean; marcas: (Marca & { fila: number; col: number; idon: number })[] } | null = null;
const MOVER_AR_M = 50;
const elMarcas = new Map<string, HTMLElement>();
/** Mejor dirección del último análisis, para sacarla como marca grande en la cámara (solo a ≤ MEJOR_AR_M del punto del barrido). */
let mejorAR: { rumbo: number; lat: number; lon: number } | null = null;
let ultimoMejor: { visible: boolean; x: number } | null = null;
const MEJOR_AR_M = 150;

const $ = <T extends HTMLElement = HTMLElement>(s: string) => dlg.querySelector(s) as T;
const DOE = () => (typeof DeviceOrientationEvent === 'undefined' ? null : DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> });
const anguloPantalla = () => (typeof screen !== 'undefined' && screen.orientation ? screen.orientation.angle : Number((window as any).orientation) || 0);
const inactividadMs = () => Number((window as any).__setasInactividadMs) || INACTIVIDAD_MS;
const modoManual = () => camara?.modo === 'archivo' || !hayBrujula;

function html() {
  const d = document.createElement('dialog');
  d.id = 'dlg-explorar'; d.className = 'dlg dlg-ir dlg-explorar'; d.setAttribute('aria-labelledby', 'ex-titulo');
  d.innerHTML = `
    <div class="ex-cab">
      <h2 id="ex-titulo">Explorar aquí</h2>
      <button id="ex-rumbo" class="ex-rumbo" type="button" aria-label="Rumbo del teléfono">sin rumbo</button>
      <button id="ex-cerrar" class="btn" type="button">Cerrar</button>
    </div>
    <p id="ex-gps" class="nota ex-gps" role="status">Esperando el GPS…</p>
    <p id="ex-aviso" class="ex-aviso" role="status" hidden></p>
    <div id="ex-escena" class="ex-escena">
      <div id="ex-camara" class="ex-camara"></div>
      <div id="ex-sin-camara" class="ex-sin-camara" hidden></div>
      <div id="ex-marcas" class="ex-marcas" aria-hidden="true"></div>
      <div id="ex-mejor-capa" class="ex-marcas" role="status"></div>
      <p id="ex-dentro" class="ex-dentro" role="status" hidden>Estás en una zona buena</p>
      <p id="ex-ar-aviso" class="ex-ar-aviso" hidden>Cada marca es una celda de 100 m, no un punto exacto</p>
      <p id="ex-ar-estado" class="ex-ar-estado" role="status" hidden></p>
      <div class="ex-mira" aria-hidden="true"></div>
      <div class="ex-anillo" aria-hidden="true">
        <ul id="ex-anillo"></ul>
        <svg id="ex-aguja" class="ex-aguja" viewBox="0 0 100 100"><path d="M50 8 62 50 50 42 38 50z"/></svg>
      </div>
      <p id="ex-guia" class="ex-guia" hidden></p>
      <div id="ex-destello" class="ex-destello" aria-hidden="true"></div>
      <div id="ex-pausa" class="ex-pausa" hidden>
        <p>Pausado para ahorrar batería</p>
        <button id="ex-reanudar" class="btn btn-primario" type="button">Reanudar</button>
      </div>
    </div>
    <p id="ex-estado" class="ex-estado" role="status">Apunta hacia donde quieras y pulsa «Barrer 360°»: harás 8 fotos, una cada 45°.</p>
    <div id="ex-acciones" class="ex-acciones">
      <button id="ex-activar" class="btn btn-ancho" type="button" hidden>Activar brújula</button>
      <button id="ex-barrer" class="btn btn-primario" type="button" disabled>Barrer 360°</button>
      <button id="ex-foto" class="btn" type="button" hidden>Foto ahora</button>
      <button id="ex-terminar" class="btn" type="button" hidden>Terminar</button>
      <button id="ex-cancelar" class="btn" type="button" hidden>Cancelar</button>
    </div>
    <div id="ex-direcciones" class="ex-direcciones" role="group" aria-label="Fotos por dirección" hidden></div>
    <section id="ex-fin" class="ex-fin" hidden aria-labelledby="ex-fin-tit">
      <h3 id="ex-fin-tit">Barrido guardado</h3>
      <p id="ex-fin-res" class="nota"></p>
      <p class="ex-pregunta" id="ex-pregunta">¿Encontraste algo aquí?</p>
      <div class="ex-hallazgo" role="group" aria-labelledby="ex-pregunta">
        <button id="ex-h-nada" class="btn" type="button">Nada</button>
        <button id="ex-h-si" class="btn" type="button">Sí</button>
        <button id="ex-h-luego" class="btn" type="button">Luego</button>
      </div>
      <div id="ex-h-cual" class="ex-cual" hidden>
        <label class="campo"><span class="etq">¿Qué encontraste?</span><select id="ex-h-especie"></select></label>
        <button id="ex-h-ok" class="btn btn-primario" type="button">Guardar</button>
      </div>
      <p id="ex-h-estado" class="nota" role="status"></p>
      <div class="ex-analisis">
        <button id="ex-analizar" class="btn btn-ancho" type="button" hidden>Analizar</button>
        <p id="ex-an-estado" class="nota" role="status"></p>
        <div id="ex-an-res" class="ex-an-res"></div>
        <button id="ex-ver-camara" class="btn btn-ancho" type="button" hidden>Ver la mejor dirección en la cámara</button>
      </div>
      <div class="ex-fin-acciones">
        <button id="ex-sitio" class="btn" type="button">Guardar como sitio</button>
        <button id="ex-otro" class="btn" type="button">Otro barrido</button>
      </div>
    </section>
    <pre id="ex-diag" class="ex-diag" hidden></pre>
    <p class="nota ex-nota">En el monte la brújula se desvía de 10 a 20°: sirve para orientarte, no para apuntar.</p>`;
  document.body.append(d);
  return d;
}

// ---------------------------------------------------------------- brújula

function alOrientar(ev: DeviceOrientationEvent) {
  const e = ev as DeviceOrientationEvent & { webkitCompassHeading?: number; webkitCompassAccuracy?: number };
  const ang = anguloPantalla();
  beta = typeof ev.beta === 'number' && Number.isFinite(ev.beta) && ang % 180 === 0 ? ev.beta : null;
  if (typeof e.webkitCompassAccuracy === 'number' && Number.isFinite(e.webkitCompassAccuracy)) precBrujula = e.webkitCompassAccuracy;
  const o = orientacionDe({ webkitCompassHeading: e.webkitCompassHeading, alpha: ev.alpha, absolute: ev.absolute || ev.type === 'deviceorientationabsolute' }, ang);
  if (o === null) return;
  const t = performance.now();
  if (!hayBrujula) {
    hayBrujula = true; estadoBrujula = '';
    clearTimeout(tBrujula);
    $('#ex-activar').hidden = true;
    pintarAcciones();
  }
  orient = suavizarAngulo(orient, o, 0.3);
  if (t - tLectura >= MIN_ENTRE_LECTURAS_MS) {
    tLectura = t;
    lecturas.push(o);
    if (lecturas.length > LECTURAS_QUIETO) lecturas.shift();
  }
  pintarRumbo();
  pintarAviso();
  pintarGuia();
  pedirAR();
  evaluarBarrido();
}

function escucharBrujula(conPlazo = true) {
  dejarBrujula();
  window.addEventListener('deviceorientationabsolute', alOrientar as EventListener);
  window.addEventListener('deviceorientation', alOrientar as EventListener);
  if (!conPlazo) return;
  tBrujula = window.setTimeout(() => {
    if (hayBrujula) return;
    estadoBrujula = SIN_BRUJULA;
    pintarAviso(); pintarAcciones(); pintarGuia();
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
    if (r === 'granted') { estadoBrujula = ''; escucharBrujula(); pintarAviso(); return; }
    estadoBrujula = 'Sin permiso para la brújula (se puede dar en Ajustes › Safari › Movimiento y orientación).';
  } catch {
    estadoBrujula = 'No se pudo activar la brújula.';
  }
  pintarAviso();
}

/** Rumbo para decidir (media de las últimas lecturas crudas), no el suavizado de la pantalla. */
const rumboRapido = () => mediaCircular(lecturas.slice(-LECTURAS_RUMBO));
const brujulaDudosa = () => precBrujula !== null && (precBrujula < 0 || precBrujula > PRECISION_BRUJULA_MAX);

// ---------------------------------------------------------------- pintar

const nombreDir = (r: number) => `${cardinalCorto(r)} ${Math.round(normalizar(r)) % 360}°`;

function pintarRumbo() {
  $('#ex-rumbo').textContent = orient === null ? 'sin rumbo' : nombreDir(orient);
  $('#ex-aguja').style.transform = `rotate(${(orient ?? 0).toFixed(1)}deg)`;
}

function pintarAviso() {
  const a = $('#ex-aviso');
  const t = hayBrujula && brujulaDudosa() ? AVISO_BRUJULA : estadoBrujula;
  if (a.textContent !== t) a.textContent = t;
  a.hidden = !t;
}

function pintarGps() {
  $('#ex-gps').textContent = pos ? `GPS ±${Math.round(pos.precision)} m${pos.alt !== null ? ` · altitud ${Math.round(pos.alt)} m` : ' · sin altitud'}` : 'Esperando el GPS…';
  pintarAcciones();
}

function pintarAnillo() {
  const ul = $('#ex-anillo');
  const base = objetivos.length ? objetivos : Array.from({ length: 8 }, (_, i) => i * PASO_BARRIDO);
  ul.replaceChildren(...base.map((r, i) => {
    const li = document.createElement('li');
    li.style.setProperty('--giro', `${r}deg`);
    li.dataset.rumbo = String(r);
    li.dataset.estado = !objetivos.length ? 'libre' : hechas.has(i) ? 'hecha' : i === siguiente && fase === 'barrido' && !modoManual() ? 'siguiente' : 'pendiente';
    return li;
  }));
}

/** Texto de guía sobre la cámara según la fase. */
function pintarGuia() {
  const g = $('#ex-guia');
  if (fase !== 'barrido' || modoManual() || !camara || camara.modo !== 'vivo') { g.hidden = true; return; }
  const obj = objetivos[siguiente];
  const act = rumboRapido();
  let t: string;
  if (act === null) t = 'Buscando la brújula…';
  else {
    const d = deltaAngulo(obj, act);
    if (Math.abs(d) > 10) t = `Gira a la ${d > 0 ? 'derecha' : 'izquierda'}: faltan ${Math.round(Math.abs(d))}°`;
    else if (beta === null) t = 'Gira el móvil a vertical para el disparo automático, o pulsa «Foto ahora»';
    else if (beta < 70 || beta > 110) t = 'Pon el móvil en vertical';
    else t = 'Mantén el móvil quieto…';
  }
  g.textContent = t; g.hidden = false;
}

function pintarAcciones() {
  const enBarrido = fase === 'barrido';
  const visor = fase === 'visor';
  const D = DOE();
  const pidePermiso = typeof D?.requestPermission === 'function';
  $('#ex-activar').hidden = hayBrujula || !pidePermiso || fase === 'fin' || fase === 'guardando';
  const b = $<HTMLButtonElement>('#ex-barrer');
  b.hidden = !visor;
  b.disabled = !pos || !camara;
  $('#ex-foto').hidden = !(enBarrido && !modoManual());
  $('#ex-terminar').hidden = !(enBarrido && hechas.size >= 1);
  $('#ex-cancelar').hidden = !enBarrido;
  $('#ex-direcciones').hidden = !(enBarrido && modoManual());
  $('#ex-fin').hidden = fase !== 'fin';
  $('#ex-escena').hidden = fase === 'fin';
  $('#ex-acciones').hidden = fase === 'fin' || fase === 'guardando';
  $('#ex-estado').hidden = fase === 'fin';
  pedirAR();
  $('#ex-gps').hidden = fase === 'fin';
  $('#ex-rumbo').hidden = fase === 'fin';
  dlg.dataset.fase = fase;
  dlg.dataset.modo = camara ? (modoManual() ? 'manual' : 'auto') : 'sin-camara';
  $('#ex-estado').textContent = textoEstado();
}

function textoEstado(): string {
  if (fase === 'guardando') return 'Guardando el barrido…';
  if (fase === 'barrido') {
    const n = hechas.size;
    if (modoManual()) {
      return `${n} de ${objetivos.length} fotos. ${camara?.modo === 'archivo' ? '' : 'Mira hacia cada dirección y pulsa su botón. '}Puedes hacerlas en el orden que quieras y terminar cuando tengas las que necesites.`;
    }
    return `Foto ${Math.min(n + 1, objetivos.length)} de ${objetivos.length} · hacia el ${cardinal(objetivos[siguiente] ?? 0)}. Salta sola al apuntar bien; si no, «Foto ahora».`;
  }
  if (!camara) return 'Abriendo la cámara…';
  if (!pos) return 'Esperando el GPS para situar el barrido…';
  if (camara.modo === 'archivo') return 'No se pudo abrir la cámara en vivo. Haz una foto por dirección con la cámara del móvil.';
  return 'Apunta hacia donde quieras y pulsa «Barrer 360°»: harás 8 fotos, una cada 45°.';
}

function pintarDirecciones() {
  const cont = $('#ex-direcciones');
  cont.replaceChildren(...objetivos.map((r, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn ex-dir'; b.dataset.rumbo = String(r); b.dataset.hecha = hechas.has(i) ? '1' : '';
    b.textContent = hechas.has(i) ? `✓ ${cardinalCorto(r)}` : `Foto hacia el ${cardinal(r)}`;
    b.setAttribute('aria-label', hechas.has(i) ? `Foto hacia el ${cardinal(r)} hecha. Pulsa para repetirla.` : `Foto hacia el ${cardinal(r)}`);
    b.onclick = () => { void disparar(i); };
    return b;
  }));
}

function repintar() {
  pintarAnillo(); pintarDirecciones(); pintarAcciones(); pintarGuia(); pintarRumbo(); pintarAviso();
}

function destello() {
  const d = $('#ex-destello');
  d.classList.remove('on'); void d.offsetWidth; d.classList.add('on');
  try { navigator.vibrate?.(60); } catch { /* sin vibración */ }
}

// ---------------------------------------------------------------- cámara y sensores

async function arrancarSensores() {
  const mia = ++sesion;
  const D = DOE();
  const pidePermiso = typeof D?.requestPermission === 'function';
  hayBrujula = false; estadoBrujula = '';
  if (!D) { estadoBrujula = 'Este navegador no da la brújula.'; }
  else if (!pidePermiso) escucharBrujula();
  else { estadoBrujula = 'Pulsa «Activar brújula» para ver el rumbo.'; escucharBrujula(false); }
  dejarGps?.();
  dejarGps = escucharGps((p) => { pos = p; pintarGps(); void calcularAR(); }, (m) => { $('#ex-gps').textContent = m; });
  pos = ultimaPosicion();
  void cargarAR();
  pedirBloqueo();
  camara?.parar();
  camara = null;
  repintar(); pintarGps();
  const c = await abrirCamara($('#ex-camara'));
  if (mia !== sesion || !abierto) { c.parar(); return; }
  camara = c;
  const sc = $('#ex-sin-camara');
  sc.hidden = c.modo === 'vivo';
  sc.textContent = c.modo === 'vivo' ? '' : 'Sin vista de cámara: haz cada foto con la cámara de tu móvil.';
  repintar(); pintarGps();
  pedirAR();
}

function detenerSensores() {
  sesion++;
  dejarGps?.(); dejarGps = null;
  dejarBrujula();
  camara?.parar(); camara = null;
  bloqueo?.release().catch(() => {}); bloqueo = null;
  cancelAnimationFrame(rafAR); rafAR = 0;
}

async function pedirBloqueo() {
  try { bloqueo = await (navigator as any).wakeLock?.request('screen') ?? null; } catch { bloqueo = null; }
}

function tocar() { ultimoToque = Date.now(); }

function pausar() {
  if (pausado || !abierto) return;
  pausado = true;
  detenerSensores();
  $('#ex-pausa').hidden = false;
  dlg.dataset.pausado = '1';
}

async function reanudar() {
  if (!pausado) return;
  pausado = false;
  $('#ex-pausa').hidden = true;
  delete dlg.dataset.pausado;
  tocar();
  await arrancarSensores();
}

// ---------------------------------------------------------------- AR ligera

const faltaMicro = () => datosAR === null || (datosAR !== undefined && (!especie || !datosAR.cab.especies.includes(especie)));

async function cargarAR() {
  const m = ctx.manifest();
  if (datosAR !== undefined && datosAR !== null) { void calcularAR(); return; }
  datosAR = m?.micro ? await datosMicro(m).catch((e) => { console.warn('micro (AR)', e); return null; }) : null;
  void calcularAR();
}

/** Microzonas como en Modo campo, con tu posición; se repite al moverte más de MOVER_AR_M. */
async function calcularAR() {
  const p = pos;
  if (!p || !datosAR || faltaMicro() || !abierto) { pedirAR(); return; }
  if (centroAR && distanciaM(centroAR, p) <= MOVER_AR_M && microAR.length + celdasAR.length > 0) return;
  if (calculandoAR) { pendienteAR = true; return; }
  calculandoAR = true;
  try {
    const m = ctx.manifest();
    celdasAR = await celdasAlrededor(datosAR, p, especie);
    const cands = seleccionarMicrozonas(celdasAR, { res: datosAR.cab.res, max: CANDIDATAS });
    await RC.prepararCotas(m, p);
    microAR = filtrarPorDesnivel(RC.anotar(cands, p), RC.desnivelMaxEfectivo(), MAX_MICROZONAS).visibles;
    centroAR = { lat: p.lat, lon: p.lon };
  } catch (e) {
    console.warn('AR', e);
  } finally {
    calculandoAR = false;
    if (pendienteAR) { pendienteAR = false; void calcularAR(); }
  }
  pedirAR();
}

const arActiva = () => abierto && !pausado && camara?.modo === 'vivo' && (fase === 'visor' || fase === 'barrido');

function pedirAR() {
  if (rafAR || !abierto) return;
  rafAR = requestAnimationFrame(() => { rafAR = 0; pintarMarcas(); pintarMejor(); });
}

function iconoMarca() {
  const d = document.createElement('div'); d.className = 'ex-icono';
  const url = ctx.miniatura?.(especie) ?? null;
  if (url) d.style.backgroundImage = `url("${url}")`;
  else d.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-seta"/></svg>';
  return d;
}

/** «180 m · ↑ 35 m · 72» (sin cifra de desnivel si falta una de las dos cotas). */
function textoMarca(c: MicroAR, desnivel: number | null) {
  const d = desnivel === null ? '' : Math.abs(desnivel) < 5 ? ' · casi llano' : ` · ${desnivel > 0 ? '↑' : '↓'} ${Math.round(Math.abs(desnivel) / 5) * 5} m`;
  return `${Math.round(c.dist_m / 10) * 10} m${d} · ${c.idon}`;
}

function pintarMarcas() {
  const capa = $('#ex-marcas');
  const nota = $('#ex-ar-aviso'), est = $('#ex-ar-estado'), dentro = $('#ex-dentro');
  const limpiar = (t: string, estado: NonNullable<typeof ultimoAR>['estado']) => {
    capa.replaceChildren(); elMarcas.clear();
    dentro.hidden = true; nota.hidden = true; est.textContent = t; est.hidden = !t;
    ultimoAR = { estado, ancho: 0, alto: 0, dentro: false, marcas: [] };
  };
  if (!arActiva()) { capa.replaceChildren(); elMarcas.clear(); dentro.hidden = true; nota.hidden = true; est.hidden = true; ultimoAR = null; return; }
  if (faltaMicro()) { limpiar('Sin datos de microzonas aquí', 'sin-datos'); return; }
  if (orient === null) { limpiar(estadoBrujula === SIN_BRUJULA ? 'Sin brújula: no se pueden colocar las marcas' : '', 'sin-brujula'); return; }
  const caja = $('#ex-escena').getBoundingClientRect();
  const w = caja.width, h = caja.height;
  if (!w || !h) return;
  const vertical = anguloPantalla() % 180 === 0;
  const fov = vertical ? { h: FOV_H.vertical, v: FOV_V.vertical } : { h: FOV_H.apaisado, v: FOV_V.apaisado };
  const aqui = pos ? RC.cotaModelo(pos.lat, pos.lon) : null;
  const lista = microAR.map((c) => ({ c, desnivel: c.cota_m !== null && aqui !== null ? c.cota_m - aqui : null }));
  const { marcas } = celdasMarca(lista.map((x) => ({ ...x, dist_m: x.c.dist_m })));
  const esta = celdasMarca(celdasAR.filter((c) => c.idon >= UMBRAL_BUENA));
  est.hidden = true; nota.hidden = false; dentro.hidden = !esta.dentro;
  const vistas = new Set<string>();
  const calc = marcas.map((x) => ({ ...x, m: proyectar({ rumbo: x.c.rumbo, dist_m: x.c.dist_m, desnivel: x.desnivel }, orient!, beta ?? 90, fov, { w, h }) }));
  const fuera: Record<'izq' | 'der', typeof calc[number] | undefined> = { izq: undefined, der: undefined };
  for (const x of calc) {
    const k = `${x.c.fila},${x.c.col}`;
    if (!x.m.visible) {
      const lado = x.m.lado!;
      if (!fuera[lado] || x.c.dist_m < fuera[lado]!.c.dist_m) fuera[lado] = x;
      continue;
    }
    vistas.add(k);
    let el = elMarcas.get(k);
    if (!el) {
      el = document.createElement('div'); el.className = 'ex-marca'; el.dataset.fila = String(x.c.fila); el.dataset.col = String(x.c.col);
      el.append(iconoMarca(), Object.assign(document.createElement('span'), { className: 'ex-marca-txt' }));
      capa.append(el); elMarcas.set(k, el);
    }
    // La etiqueta no se sale del cuadro (x e y informadas siguen siendo las proyectadas).
    const px = Math.min(w - 84, Math.max(84, x.m.x)), py = Math.min(h - 96, Math.max(26, x.m.y));
    el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -22px)`;
    const t = textoMarca(x.c, x.desnivel);
    const sp = el.lastElementChild as HTMLElement;
    if (sp.textContent !== t) sp.textContent = t;
  }
  for (const lado of ['izq', 'der'] as const) {
    const k = `chip-${lado}`, x = fuera[lado];
    let el = elMarcas.get(k);
    if (!x) { el?.remove(); elMarcas.delete(k); continue; }
    vistas.add(k);
    if (!el) { el = document.createElement('div'); el.className = 'ex-chip'; el.dataset.lado = lado; capa.append(el); elMarcas.set(k, el); }
    const t = `${lado === 'izq' ? '← ' : ''}buena zona, ${Math.round(x.c.dist_m / 10) * 10} m${lado === 'der' ? ' →' : ''}`;
    if (el.textContent !== t) el.textContent = t;
    el.style.top = `${Math.min(h - 80, Math.max(48, x.m.y)).toFixed(0)}px`;
  }
  for (const [k, el] of [...elMarcas]) if (!vistas.has(k)) { el.remove(); elMarcas.delete(k); }
  ultimoAR = { estado: 'ok', ancho: w, alto: h, dentro: esta.dentro, marcas: calc.map((x) => ({ ...x.m, fila: x.c.fila, col: x.c.col, idon: x.c.idon })) };
}

/** Mejor dirección del análisis como marca grande (o chip en el borde si queda fuera de cuadro). */
function pintarMejor() {
  const capa = $('#ex-mejor-capa');
  const quitar = () => { if (capa.firstChild) capa.replaceChildren(); ultimoMejor = null; };
  if (!arActiva() || !mejorAR || orient === null || !pos || distanciaM(mejorAR, pos) > MEJOR_AR_M) { quitar(); return; }
  const caja = $('#ex-escena').getBoundingClientRect();
  const w = caja.width, h = caja.height;
  if (!w || !h) return;
  const vertical = anguloPantalla() % 180 === 0;
  const fov = vertical ? { h: FOV_H.vertical, v: FOV_V.vertical } : { h: FOV_H.apaisado, v: FOV_V.apaisado };
  const m = proyectar({ rumbo: mejorAR.rumbo, dist_m: 1000, desnivel: null }, orient, beta ?? 90, fov, { w, h });
  const texto = `Mejor dirección: ${nombreDir(mejorAR.rumbo)}`;
  let marca = capa.firstElementChild as HTMLElement | null;
  if (!marca) { marca = document.createElement('div'); capa.append(marca); }
  if (m.visible) {
    marca.className = 'ex-mejor';
    marca.style.transform = `translate(${Math.min(w - 90, Math.max(90, m.x)).toFixed(1)}px, ${(h * 0.3).toFixed(1)}px) translate(-50%, 0)`;
    marca.style.top = ''; marca.style.left = '';
    if (marca.textContent !== texto) marca.textContent = texto;
  } else {
    marca.className = 'ex-mejor-chip'; marca.dataset.lado = m.lado!;
    marca.style.transform = '';
    marca.style.top = `${(h * 0.3).toFixed(0)}px`;
    const t = m.lado === 'izq' ? `← ${texto}` : `${texto} →`;
    if (marca.textContent !== t) marca.textContent = t;
  }
  ultimoMejor = { visible: m.visible, x: m.x };
}

// ---------------------------------------------------------------- barrido

function evaluarBarrido() {
  if (fase !== 'barrido' || modoManual() || disparando || pausado || camara?.modo !== 'vivo') return;
  const obj = objetivos[siguiente];
  if (obj === undefined) return;
  if (listoParaDisparar(obj, rumboRapido(), beta, estaQuieto(lecturas))) void disparar(siguiente);
}

function empezarBarrido() {
  if (!pos || !camara) return;
  posBarrido = pos;
  objetivos = rumbosBarrido(modoManual() ? 0 : orient ?? 0);
  hechas = new Map();
  siguiente = 0;
  fase = 'barrido';
  tocar();
  repintar();
}

function cancelarBarrido() {
  if (hechas.size && !confirm('¿Cancelar el barrido? Las fotos hechas se descartan.')) return;
  fase = 'visor'; hechas = new Map(); objetivos = []; siguiente = 0;
  repintar();
}

/** Hace la foto de la dirección `idx` (la siguiente en el barrido automático, la elegida en el manual). */
async function disparar(idx: number) {
  if (disparando || !camara || fase !== 'barrido' || objetivos[idx] === undefined) return;
  disparando = true; tocar();
  try {
    const foto = await capturar(camara);
    const medido = modoManual() ? null : rumboRapido();
    hechas.set(idx, { rumbo: Math.round(normalizar(medido ?? objetivos[idx])) % 360, precBrujula: medido !== null ? precBrujula : null, foto, analisis: null });
    destello();
    siguiente = modoManual() ? objetivos.findIndex((_, i) => !hechas.has(i)) : idx + 1;
    if (hechas.size >= objetivos.length) { disparando = false; await terminarBarrido(); return; }
    if (siguiente < 0) siguiente = 0;
  } catch (e) {
    ctx.avisar(e instanceof Error && e.message ? e.message : 'No se pudo hacer la foto.');
  } finally {
    disparando = false;
    if (fase === 'barrido') repintar();
  }
}

/** Datos del modelo en el punto: tu celda, idoneidad máxima y árbol por sector de 45° y altitud del terreno. */
async function datosDelModelo(p: { lat: number; lon: number }, rumbos: number[]) {
  const m = ctx.manifest();
  const vacio = { modelo: null as Observacion['modelo'], modeloSector: rumbos.map(() => null as number | null), arbolSector: rumbos.map(() => null as string | null), altModelo: null as number | null };
  if (!m) return vacio;
  const out = { ...vacio };
  const d: DatosMicro | null = m.micro ? await datosMicro(m).catch((e) => { console.warn('micro', e); return null; }) : null;
  if (d && especie && d.cab.especies.includes(especie)) {
    try {
      const aqui = await celdaAqui(d, p, especie);
      if (aqui) { const { dist_m: _d, rumbo: _r, ...resto } = aqui; out.modelo = resto; }
      const celdas = await celdasAlrededor(d, p, especie, RADIO_SECTORES_M);
      rumbos.forEach((r, i) => {
        const mejor = enSector<ValoresCelda>(celdas, r).reduce<ValoresCelda | null>((a, c) => (!a || c.idon > a.idon ? c : a), null);
        out.modeloSector[i] = mejor ? mejor.idon : null;
        out.arbolSector[i] = mejor && mejor.arbol !== null ? ARBOL[mejor.arbol] ?? null : null;
      });
    } catch (e) { console.warn('modelo en el barrido', e); }
  }
  try {
    const c = await cotasEn(m, cajaAlrededor(p, RADIO_COTA_M));
    const v = c ? cotaEn(c.rejilla, p.lat, p.lon) : NaN;
    out.altModelo = Number.isFinite(v) ? v : null;
  } catch { /* sin cotas */ }
  return out;
}

async function terminarBarrido() {
  if (!posBarrido || !hechas.size) return;
  fase = 'guardando';
  repintar();
  const idx = [...hechas.keys()].sort((a, b) => a - b);
  const p = posBarrido;
  const o = nuevaObservacion({ lat: p.lat, lon: p.lon, precGps: p.precision, altGps: p.alt, altModelo: null, especie, rutaId: null });
  o.direcciones = idx.map((i) => hechas.get(i)!);
  const mod = await datosDelModelo(p, idx.map((i) => objetivos[i]));
  o.modelo = mod.modelo; o.modeloSector = mod.modeloSector; o.arbolSector = mod.arbolSector; o.altModelo = mod.altModelo;
  // Si se está grabando una ruta, la observación queda como nota suya (y waypoint en el GPX).
  o.rutaId = anadirNotaExterna(notaDeObservacion(o));
  try {
    await guardarObservacion(o);
  } catch (e) {
    console.warn('guardar observación', e);
    ctx.avisar('No se pudo guardar el barrido en el móvil.');
    fase = 'barrido'; repintar();
    return;
  }
  obs = o;
  detenerSensores();
  fase = 'fin';
  pintarFin();
  repintar();
}

// ---------------------------------------------------------------- después del barrido

function pintarFin() {
  if (!obs) return;
  const n = obs.direcciones.length;
  $('#ex-fin-res').textContent = `${n} ${n === 1 ? 'foto guardada' : 'fotos guardadas'} en tu móvil${obs.modelo ? ` · esta zona: ${obs.modelo.idon} de 100 en el mapa` : ' · sin datos del mapa en este punto'}.`;
  $('#ex-h-cual').hidden = true;
  const dicho = obs.hallazgo === 'nada' ? 'Anotado: no encontraste nada aquí.' : obs.hallazgo === 'encontrada' ? 'Anotado: encontraste algo aquí.' : '';
  $('#ex-h-estado').textContent = dicho;
  const sel = $<HTMLSelectElement>('#ex-h-especie');
  const lista = ctx.especies();
  sel.replaceChildren(...lista.map((e) => Object.assign(document.createElement('option'), { value: e.id, textContent: e.nombre })),
    Object.assign(document.createElement('option'), { value: '', textContent: 'Otra cosa / no lo sé' }));
  if (especie && lista.some((e) => e.id === especie)) sel.value = especie;
  void pintarAnalisis();
}

/** Botón «Analizar», estado y resultado (lista de direcciones) de la observación en pantalla. */
async function pintarAnalisis() {
  const o = obs;
  if (!o) return;
  const btn = $<HTMLButtonElement>('#ex-analizar');
  btn.hidden = !urlAnalisis() || o.estado === 'analizada';
  btn.textContent = o.estado === 'error' ? 'Probar otra vez' : o.estado === 'pendiente' ? 'Analizar ahora' : 'Analizar';
  $('#ex-an-estado').textContent = o.estado === 'sin_analizar' && urlAnalisis() ? 'Las fotos no salen del móvil hasta que pulses «Analizar».' : '';
  const perfil = o.estado === 'analizada' ? await perfilDe(o.especie).catch(() => null) : null;
  const mejor = o.estado === 'analizada' ? await mejorDe(o).catch(() => null) : null;
  if (obs !== o) return;
  pintarResultado($('#ex-an-res'), o, perfil);
  $('#ex-ver-camara').hidden = !mejor;
}

async function analizarAhora() {
  const o = obs;
  if (!o) return;
  const btn = $<HTMLButtonElement>('#ex-analizar');
  btn.disabled = true; $('#ex-an-estado').textContent = 'Analizando el barrido…';
  try {
    const r = await analizarObservacion(o);
    if (r && obs && obs.id === r.id) {
      // Si cambiaste el hallazgo mientras tanto, se conserva.
      const nueva = { ...r, hallazgo: obs.hallazgo, especieHallada: obs.especieHallada, nota: obs.nota };
      if (nueva.hallazgo !== r.hallazgo || nueva.especieHallada !== r.especieHallada) await guardarObservacion(nueva);
      obs = nueva;
    }
  } catch (e) {
    console.warn('analizar', e);
    ctx.avisar('No se pudo analizar el barrido. Prueba otra vez.');
  } finally {
    btn.disabled = false;
    void pintarAnalisis();
  }
}

/** Vuelve a la cámara con la mejor dirección marcada (mientras estés a ≤ MEJOR_AR_M del punto del barrido). */
async function verMejorEnCamara() {
  const o = obs;
  const m = o && await mejorDe(o).catch(() => null);
  if (!o || !m) return;
  reiniciar();
  mejorAR = { rumbo: m.rumbo, lat: o.lat, lon: o.lon };
  tocar();
  repintar();
  await arrancarSensores();
}

async function marcarHallazgo(h: Observacion['hallazgo'], hallada = '') {
  if (!obs) return;
  obs.hallazgo = h; obs.especieHallada = hallada;
  try { await guardarObservacion(obs); } catch (e) { console.warn('hallazgo', e); ctx.avisar('No se pudo guardar la respuesta.'); return; }
  pintarFin();
}

async function guardarComoSitio() {
  if (!obs) return;
  const d = new Date(obs.t);
  const fecha = `${d.toLocaleDateString('es-ES')} ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
  const r = await ctx.guardar({ lat: obs.lat, lon: obs.lon, nota: `Observación ${fecha}`, especie: obs.hallazgo === 'encontrada' && obs.especieHallada ? obs.especieHallada : obs.especie });
  ctx.avisar(r === 'ya' ? 'Ya estaba en Mis sitios' : 'Guardado en Mis sitios');
}

// ---------------------------------------------------------------- abrir / cerrar

function reiniciar() {
  fase = 'visor'; hechas = new Map(); objetivos = []; siguiente = 0; obs = null; posBarrido = null;
  orient = null; beta = null; precBrujula = null; lecturas = []; tLectura = 0; hayBrujula = false; disparando = false;
  estadoBrujula = ''; pausado = false; toquesRumbo = [];
  celdasAR = []; microAR = []; centroAR = null; ultimoAR = null; elMarcas.clear(); $('#ex-marcas').replaceChildren();
  mejorAR = null; ultimoMejor = null; $('#ex-mejor-capa').replaceChildren();
  $('#ex-an-res').replaceChildren(); $('#ex-an-estado').textContent = ''; $('#ex-ver-camara').hidden = true;
  $('#ex-pausa').hidden = true; delete dlg.dataset.pausado;
  $('#ex-diag').hidden = true;
}

/** Abre «Explorar aquí» (por defecto con la seta elegida en el mapa). */
export async function abrirExplorar(idEspecie?: string) {
  if (!dlg) return;
  especie = idEspecie ?? ctx.especie();
  reiniciar();
  abierto = true;
  tocar();
  if (!dlg.open) dlg.showModal();
  clearInterval(tInactivo);
  tInactivo = window.setInterval(() => { if (Date.now() - ultimoToque > inactividadMs()) pausar(); }, Math.min(5000, Math.max(200, inactividadMs() / 4)));
  repintar();
  void reintentarPendientes();
  await arrancarSensores();
}

function cerrar() {
  abierto = false;
  clearInterval(tInactivo);
  detenerSensores();
  fase = 'visor'; hechas = new Map(); obs = null;
}

const sinGuardar = () => abierto && fase === 'barrido' && hechas.size > 0;

function diagnostico() {
  const v = camara?.resolucion?.() ?? null;
  const pre = $('#ex-diag');
  pre.textContent = [
    `webkitCompassAccuracy: ${precBrujula === null ? 'sin dato' : precBrujula}`,
    `brújula: ${hayBrujula ? 'sí' : 'no'} · beta: ${beta === null ? 'sin dato' : Math.round(beta)}`,
    `cámara: ${camara ? camara.modo : 'cerrada'}${v ? ` ${v.w}×${v.h}` : ''}`,
    `pantalla: ${anguloPantalla()}° · ventana ${window.innerWidth}×${window.innerHeight}`,
    `región: ${ctx.region()} · seta: ${especie || 'ninguna'}`,
  ].join('\n');
  pre.hidden = false;
}

export function iniciarExplorar(c: ContextoExplorar) {
  ctx = c;
  iniciarAnalisis({ manifest: c.manifest, especies: c.especies, avisar: c.avisar });
  dlg = html();
  $('#ex-cerrar').addEventListener('click', () => { if (!sinGuardar() || confirm('¿Salir? Las fotos de este barrido no se guardarán.')) dlg.close(); });
  dlg.addEventListener('cancel', (e) => { if (sinGuardar() && !confirm('¿Salir? Las fotos de este barrido no se guardarán.')) e.preventDefault(); });
  dlg.addEventListener('close', cerrar);
  dlg.addEventListener('pointerdown', tocar, true);
  $('#ex-activar').addEventListener('click', () => { tocar(); void activarBrujula(); });
  $('#ex-barrer').addEventListener('click', empezarBarrido);
  $('#ex-foto').addEventListener('click', () => { void disparar(siguiente); });
  $('#ex-terminar').addEventListener('click', () => { void terminarBarrido(); });
  $('#ex-cancelar').addEventListener('click', cancelarBarrido);
  $('#ex-reanudar').addEventListener('click', () => { void reanudar(); });
  $('#ex-rumbo').addEventListener('click', () => {
    const t = Date.now();
    toquesRumbo = [...toquesRumbo.filter((x) => t - x < 2500), t];
    if (toquesRumbo.length >= TOQUES_DIAGNOSTICO) { toquesRumbo = []; diagnostico(); }
  });
  $('#ex-h-nada').addEventListener('click', () => { $('#ex-h-cual').hidden = true; void marcarHallazgo('nada'); });
  $('#ex-h-si').addEventListener('click', () => { $('#ex-h-cual').hidden = false; });
  $('#ex-h-luego').addEventListener('click', () => { $('#ex-h-cual').hidden = true; void marcarHallazgo('no_mirado'); });
  $('#ex-h-ok').addEventListener('click', () => { void marcarHallazgo('encontrada', $<HTMLSelectElement>('#ex-h-especie').value); });
  $('#ex-sitio').addEventListener('click', () => { void guardarComoSitio(); });
  $('#ex-analizar').addEventListener('click', () => { void analizarAhora(); });
  $('#ex-ver-camara').addEventListener('click', () => { void verMejorEnCamara(); });
  document.addEventListener(EVENTO_CAMBIO, () => {
    const id = obs?.id;
    if (!abierto || fase !== 'fin' || !id) return;
    void leerObservacion(id).then((r) => { if (r && obs?.id === id) { obs = r; void pintarAnalisis(); } });
  });
  $('#ex-otro').addEventListener('click', () => { reiniciar(); void abrirExplorar(especie); });
  document.addEventListener('visibilitychange', () => { if (abierto && !pausado && document.visibilityState === 'visible') pedirBloqueo(); });
}

export const exploracionAbierta = () => !!dlg?.open;

/** Estado para el e2e (window.__setas.explorar()). */
export const estadoExplorar = () => (dlg?.open ? {
  fase, camara: camara?.modo ?? null, manual: modoManual(), orientacion: orient, beta, precBrujula, hayBrujula, pausado,
  objetivos: [...objetivos], siguiente, hechas: [...hechas.keys()].sort((a, b) => a - b), pos, aviso: $('#ex-aviso').hidden ? null : $('#ex-aviso').textContent,
  estado: $('#ex-estado').textContent, guia: $('#ex-guia').hidden ? null : $('#ex-guia').textContent, obsId: obs?.id ?? null,
  ar: { estado: ultimoAR?.estado ?? 'cargando', centro: centroAR, ancho: ultimoAR?.ancho ?? 0, dentro: ultimoAR?.dentro ?? false, marcas: ultimoAR?.marcas ?? [],
    chips: [...dlg.querySelectorAll('.ex-chip')].map((c) => ({ lado: (c as HTMLElement).dataset.lado, texto: c.textContent })),
    mejor: mejorAR ? { rumbo: mejorAR.rumbo, ...(ultimoMejor ?? { visible: false, x: 0 }) } : null,
    micro: microAR.map((c) => ({ fila: c.fila, col: c.col, idon: c.idon, dist_m: c.dist_m, rumbo: c.rumbo, cota_m: c.cota_m })), celdas: celdasAR.length } } : null);
