// «Modo campo» (2026-10-18, segunda parte de la app: ya estás en el monte y buscas a escala micro). Pantalla completa
// con el mini-mapa compartido (minimapa.ts) siguiendo tu posición y, en un radio de ~500 m, un icono de la seta buscada
// en las mejores celdas de 100 m (micro.ts: máx. 10, separadas ≥ 120 m). Tocar un icono → por qué (factores reales en
// una línea), «Ir aquí» (Navegar aquí) y «Guardar» (Mis sitios). Aviso «te sales de la zona buena» con histéresis, con
// rumbo y distancia a la celda buena más cercana. Ficha «Cómo buscar <seta>» (como-buscar.ts).
// Se abre desde el mapa (botón «Campo», si tu posición cae en la región) y desde «Navegar aquí».
import './campo.css';
import type { Map as MapaML, MapMouseEvent } from 'maplibre-gl';
import type { ManifestApp } from './manifest-region';
import { escucharGps, ultimaPosicion, type PosicionGps } from './posicion-viva';
import { distanciaM, rumbo } from './brujula';
import { buenaMasCercana, MAX_MICROZONAS, pasoZona, RADIO_M, razonCelda, RECALCULAR_M, seleccionarMicrozonas, textoHacia, UMBRAL_BAJA,
  UMBRAL_BUENA, ZONA_INICIAL, type AvisoZona, type EstadoZona, type PerfilMicro, type ValoresCelda } from './micro';
import { celdaAqui, celdasAlrededor, datosMicro, type DatosMicro } from './micro-datos';
import { AVISO_LIGNICOLA, comoBuscar, esLignicola, PENDIENTE, type DatosBuscar } from './como-buscar';
import * as Mini from './minimapa';
import * as RC from './campo-ruta';
import { CANDIDATAS, filtrarPorDesnivel, type DesnivelMicro } from './ruta-pie';

export interface PuntoCampo { lat: number; lon: number; titulo: string; nota: string; especie: string;
  /** Ruta a pie por el terreno ya trazada hasta el punto (campo-ruta.ts), para seguirla en «Navegar aquí». */
  ruta?: { linea: [number, number][]; dist: number[]; alt: number[]; via: string } }
type MicroZ = ValoresCelda & DesnivelMicro;
export interface ContextoCampo {
  manifest: () => ManifestApp | null;
  /** Especie elegida en el mapa (valor inicial). */
  especie: () => string;
  nombre: (id: string) => string;
  /** URL de la miniatura de la guía (o null). */
  miniatura: (id: string) => string | null;
  /** Ficha de la guía (hábitat y temporada) de una especie del mapa. */
  ficha: (id: string) => DatosBuscar['ficha'];
  navegar: (p: PuntoCampo) => void;
  guardar: (p: PuntoCampo) => Promise<'guardado' | 'ya'>;
  /** «Navegar aquí» abierto debajo: al cerrar el modo campo el mini-mapa vuelve allí. */
  alCerrar?: () => void;
  avisar: (t: string) => void;
}

let ctx: ContextoCampo;
let dlg: HTMLDialogElement;
let especie = '';
let datos: DatosMicro | null | undefined;
let pos: PosicionGps | null = null;
let centro: { lat: number; lon: number } | null = null;
let celdas: ValoresCelda[] = [];
let micro: MicroZ[] = [];
let ocultas = 0;
let aqui: ValoresCelda | null = null;
let zona: EstadoZona = ZONA_INICIAL;
let sel: number | null = null;
let dejarGps: (() => void) | null = null;
let calculando: Promise<void> | null = null;
let avisos: Exclude<AvisoZona, null>[] = [];
let seguir = true;
/** Centro de búsqueda ya encuadrado en el mapa. */
let encuadrado: { lat: number; lon: number } | null = null;

const $ = <T extends HTMLElement = HTMLElement>(s: string) => dlg.querySelector(s) as T;
const icono = (id: string) => `seta-${id}`;

function html() {
  const d = document.createElement('dialog');
  d.id = 'dlg-campo'; d.className = 'dlg dlg-ir dlg-campo'; d.setAttribute('aria-labelledby', 'cp-titulo');
  d.innerHTML = `
    <div class="ir-cab">
      <div><p class="ir-etq">Modo campo</p><h2 id="cp-titulo"></h2></div>
      <button id="cp-cerrar" class="btn" type="button">Salir</button>
    </div>
    <label class="campo cp-especie"><span class="etq">Seta que buscas</span><select id="cp-especie"></select></label>
    <p id="cp-alerta" class="ir-alerta" role="alert" hidden></p>
    <p id="cp-estado" class="cp-estado" role="status">Buscando tu posición…</p>
    <div class="ir-mapa cp-mapa">
      <div id="cp-hueco" class="ir-hueco"></div>
      <div class="ir-mapa-cab vidrio"><label class="ir-girar"><input id="cp-seguir" type="checkbox" checked /><span>Seguirme</span></label></div>
    </div>
    <div id="cp-tarjeta" class="cp-tarjeta" hidden></div>
    <ol id="cp-lista" class="cp-lista" aria-label="Microzonas cercanas"></ol>
    <details id="cp-buscar" class="cp-buscar"><summary id="cp-buscar-tit">Cómo buscar</summary><dl id="cp-buscar-dl"></dl></details>
    <p class="nota ir-aviso">Resolución 100 m: cada icono marca una celda de una hectárea (la mejor según el modelo), no un árbol concreto. Orientativo y heurístico: busca alrededor del icono. Recoger exige respetar la normativa y el permiso del propietario.</p>`;
  document.body.append(d);
  return d;
}

// ---------------------------------------------------------------- icono de la seta (miniatura o dibujito)

function dibujito(c: CanvasRenderingContext2D, t: number) {
  c.fillStyle = '#f3e3c3'; c.strokeStyle = '#5b3a1e'; c.lineWidth = t * 0.04;
  c.beginPath(); c.roundRect(t * 0.42, t * 0.48, t * 0.16, t * 0.26, t * 0.05); c.fill(); c.stroke();      // pie
  c.fillStyle = '#9a5b2b';
  c.beginPath(); c.ellipse(t / 2, t * 0.5, t * 0.3, t * 0.2, 0, Math.PI, 0); c.closePath(); c.fill(); c.stroke();   // sombrero
}

async function ponerIcono(m: MapaML, id: string) {
  if (m.hasImage(icono(id))) return;
  const t = 96, cv = document.createElement('canvas'); cv.width = cv.height = t;
  const c = cv.getContext('2d')!;
  c.beginPath(); c.arc(t / 2, t / 2, t / 2 - 3, 0, 2 * Math.PI); c.fillStyle = '#ffffff'; c.fill();
  const url = ctx.miniatura(id);
  let foto = false;
  if (url) {
    try {
      const img = new Image(); img.decoding = 'async'; img.src = url; await img.decode();
      c.save(); c.beginPath(); c.arc(t / 2, t / 2, t / 2 - 8, 0, 2 * Math.PI); c.clip();
      const s = Math.max(t / img.width, t / img.height);
      c.drawImage(img, (t - img.width * s) / 2, (t - img.height * s) / 2, img.width * s, img.height * s); c.restore();
      foto = true;
    } catch { /* sin foto: dibujito */ }
  }
  if (!foto) dibujito(c, t);
  c.beginPath(); c.arc(t / 2, t / 2, t / 2 - 4, 0, 2 * Math.PI); c.lineWidth = 6; c.strokeStyle = '#1b4332'; c.stroke();
  if (!m.hasImage(icono(id))) m.addImage(icono(id), c.getImageData(0, 0, t, t), { pixelRatio: 2 });
  dlg.dataset.icono = foto ? 'foto' : 'dibujo';
}

// ---------------------------------------------------------------- cálculo

const perfil = (): PerfilMicro | null => datos?.cab.perfiles[especie] ?? null;
const nombre = () => ctx.nombre(especie);

async function recalcular(p: { lat: number; lon: number }) {
  if (!datos) return;
  celdas = await celdasAlrededor(datos, p, especie);
  // Ruta a pie (campo-ruta.ts): candidatas por idoneidad, desnivel de cada una y filtro por desnivel máximo.
  const cands = seleccionarMicrozonas(celdas, { res: datos.cab.res, max: CANDIDATAS });
  await RC.prepararCotas(ctx.manifest(), p);
  const f = filtrarPorDesnivel(RC.anotar(cands, p), RC.desnivelMaxEfectivo(), MAX_MICROZONAS);
  micro = f.visibles; ocultas = f.ocultas;
  centro = { lat: p.lat, lon: p.lon };
  if (sel !== null && sel >= micro.length) sel = null;
}

/** Distancia y rumbo de cada celda desde la posición actual (sin volver a leer las teselas). */
function reubicar(p: { lat: number; lon: number }) {
  for (const c of [...celdas]) { c.dist_m = distanciaM(p, c); c.rumbo = rumbo(p, c); }
}

async function actualizar() {
  if (!pos || !datos) { pintar(); return; }
  const p = pos;
  if (!centro || distanciaM(centro, p) > RECALCULAR_M || !celdas.length) await recalcular(p);
  else reubicar(p);
  aqui = await celdaAqui(datos, p, especie);
  const r = pasoZona(zona, aqui?.idon ?? 0, p.precision);
  zona = r.estado;
  if (r.aviso) alerta(r.aviso);
  pintar();
}

function programar() {
  if (calculando) { calculando.then(() => programar()); return; }
  calculando = actualizar().catch((e) => { console.warn('modo campo', e); $('#cp-estado').textContent = 'No se pudieron leer las microzonas.'; })
    .finally(() => { calculando = null; });
}

function alerta(a: Exclude<AvisoZona, null>) {
  const el = $('#cp-alerta');
  el.dataset.tipo = a === 'sale' ? 'fuera' : 'vuelta';
  const b = pos ? buenaMasCercana(celdas) : null;
  el.textContent = a === 'sale'
    ? `Te sales de la zona buena (aquí ${aqui?.idon ?? 0}/100).${b ? ` La más cercana: ${textoHacia(b.dist_m, b.rumbo)}.` : ` No hay celdas buenas a menos de ${RADIO_M} m.`}`
    : 'De vuelta en zona buena.';
  el.hidden = false;
  avisos.push(a);
  try { navigator.vibrate?.(a === 'vuelve' ? 80 : [200, 100, 200]); } catch { /* sin vibración */ }
  if (a === 'vuelve') setTimeout(() => { if (el.dataset.tipo === 'vuelta') el.hidden = true; }, 4000);
}

// ---------------------------------------------------------------- pintar

function boton(texto: string, f: () => void, clase = 'btn') {
  const b = document.createElement('button'); b.type = 'button'; b.className = clase; b.textContent = texto; b.onclick = f; return b;
}
const punto = (c: ValoresCelda, i: number): PuntoCampo => {
  const r = RC.rutaHacia(c);
  return { lat: c.lat, lon: c.lon, especie,
    titulo: `Microzona ${i + 1} · ${nombre()}`, nota: `Microzona ${i + 1} de ${nombre()} (Modo campo, celda de 100 m): ${razonCelda(c)}`,
    ruta: r ? { linea: r.linea, dist: r.perfil.dist, alt: r.perfil.alt, via: `tu posición (${r.modo === 'directa' ? 'más directa' : 'mínimo desnivel'}, rejilla de ${r.res} m)` } : undefined };
};

function pintarTarjeta() {
  const t = $('#cp-tarjeta');
  const c = sel !== null ? micro[sel] : null;
  t.hidden = !c;
  if (!c || sel === null) { t.replaceChildren(); return; }
  const i = sel;
  const h = document.createElement('p'); h.className = 'cp-tit';
  h.textContent = `Microzona ${i + 1} · ${textoHacia(c.dist_m, c.rumbo)}`;
  const r = document.createElement('p'); r.className = 'cp-razon'; r.textContent = razonCelda(c);
  const ruta = RC.bloqueRuta(c, pos, () => { pintarTarjeta(); pintarMapa(); });
  const acc = document.createElement('div'); acc.className = 'hm-acciones';
  acc.append(boton('Ir aquí', () => { ctx.navegar(punto(c, i)); }, 'btn btn-primario cp-ir'),
    boton('Guardar', async () => { const r2 = await ctx.guardar(punto(c, i)); ctx.avisar(r2 === 'ya' ? 'Ya estaba en Mis sitios' : 'Guardado en Mis sitios'); }, 'btn cp-guardar'));
  const av = esLignicola(especie) ? Object.assign(document.createElement('p'), { className: 'nota cp-aviso-lignicola', textContent: AVISO_LIGNICOLA }) : null;
  t.replaceChildren(h, r, ...(av ? [av] : []), ruta, acc);
}

function pintarLista() {
  const ol = $('#cp-lista');
  ol.replaceChildren(...micro.map((c, i) => {
    const li = document.createElement('li');
    const dz = RC.textoDesnivelMicro(c);
    const b = boton(`${i + 1}. ${c.idon}/100 · ${textoHacia(c.dist_m, c.rumbo)}${dz ? ` · ${dz}` : ''}`, () => { sel = i; seguir = false; $<HTMLInputElement>('#cp-seguir').checked = false; pintar(); centrarEn(c); }, 'cp-fila');
    if (sel === i) b.setAttribute('aria-current', 'true');
    li.append(b);
    return li;
  }));
}

function pintarBuscar() {
  $('#cp-buscar-tit').textContent = `Cómo buscar ${nombre()}`;
  $('#cp-buscar-dl').replaceChildren(...lineasBuscar(especie, perfil()));
}

function circulo(lat: number, lon: number, r: number): [number, number][] {
  const dLat = r / 111320, dLon = r / (111320 * Math.cos((lat * Math.PI) / 180));
  return Array.from({ length: 65 }, (_, i) => { const a = (i / 64) * 2 * Math.PI; return [lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]; });
}

function pintarMapa() {
  Mini.datos('campo', { type: 'FeatureCollection', features: [
    ...(centro ? [{ type: 'Feature' as const, properties: { tipo: 'radio' }, geometry: { type: 'LineString' as const, coordinates: circulo(centro.lat, centro.lon, RADIO_M) } }] : []),
    ...(sel !== null ? RC.featuresRuta() : []),
    ...micro.map((c, i) => ({ type: 'Feature' as const, properties: { tipo: 'micro', n: i + 1, i, icono: icono(especie), sel: sel === i },
      geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] } })),
    ...(pos && dlg.open ? [{ type: 'Feature' as const, properties: { tipo: 'yo' }, geometry: { type: 'Point' as const, coordinates: [pos.lon, pos.lat] } }] : []),
  ] });
  const m = Mini.mapaListo();
  if (!m || !dlg.open || !seguir || !pos) return;
  // Al recalcular, encuadra el círculo de búsqueda entero (todos los iconos a la vista); luego solo te sigue.
  if (centro && encuadrado !== centro) {
    encuadrado = centro;
    const r = circulo(centro.lat, centro.lon, RADIO_M);
    const lons = r.map((x) => x[0]), lats = r.map((x) => x[1]);
    m.jumpTo({ bearing: 0 });
    m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 24, duration: 0 });
  }
  m.jumpTo({ center: [pos.lon, pos.lat], bearing: 0 });
}

function centrarEn(c: { lat: number; lon: number }) {
  const m = Mini.mapaListo();
  m?.easeTo({ center: [c.lon, c.lat], duration: 300 });
}

function pintar() {
  dlg.dataset.datos = datos ? 'si' : datos === null ? 'no' : 'cargando';
  $('#cp-titulo').textContent = nombre();
  const est = $('#cp-estado');
  if (datos === null) est.textContent = 'Esta región no tiene datos de microzonas: actualiza los mapas.';
  else if (!pos) est.textContent = 'Buscando tu posición…';
  else if (!aqui) est.textContent = 'Estás fuera de la zona del mapa.';
  else {
    const b = buenaMasCercana(celdas);
    const n = micro.length;
    const base = `Aquí: ${aqui.idon}/100 (${aqui.idon >= UMBRAL_BUENA ? 'zona buena' : aqui.idon < UMBRAL_BAJA ? 'zona baja' : 'zona media'}). `;
    const lim = RC.desnivelMaxEfectivo();
    const filtro = lim === null ? '' : ` con ≤ ${lim} m de desnivel`;
    est.textContent = base + (n ? `${n} ${n === 1 ? 'microzona' : 'microzonas'}${filtro} a menos de ${RADIO_M} m${b && aqui.idon < UMBRAL_BUENA ? `; la buena más cercana, ${textoHacia(b.dist_m, b.rumbo)}` : ''}.`
      : `Ninguna celda buena (≥ ${UMBRAL_BUENA}/100) para ${nombre()}${filtro} a menos de ${RADIO_M} m.`)
      + (ocultas ? ` ${ocultas} ${ocultas === 1 ? 'oculta' : 'ocultas'} por desnivel.` : '')
      + (RC.desnivelMax() !== null && lim === null ? ' Sin cotas del terreno: no se filtra por desnivel.' : '');
    est.dataset.zona = zona.dentro ? 'dentro' : 'fuera';
  }
  if (!zona.dentro && $('#cp-alerta').dataset.tipo === 'vuelta') $('#cp-alerta').hidden = true;
  if (zona.dentro && $('#cp-alerta').dataset.tipo === 'fuera') $('#cp-alerta').hidden = true;
  dlg.dataset.n = String(micro.length);
  pintarLista();
  pintarTarjeta();
  pintarMapa();
}

/** <dt>/<dd> de «Cómo buscar» (también para la ficha de la guía). */
export function lineasBuscar(id: string, p: PerfilMicro | null): HTMLElement[] {
  const meses = ctx?.manifest()?.especies.find((e) => e.id === id)?.tiempo?.meses ?? null;
  const out: HTMLElement[] = [];
  for (const l of comoBuscar(id, { perfil: p, ficha: ctx?.ficha(id) ?? null, meses })) {
    const dt = document.createElement('dt'); dt.textContent = l.titulo;
    const dd = document.createElement('dd'); dd.dataset.clave = l.clave;
    if (l.texto === PENDIENTE) { dd.className = 'cp-pendiente'; dd.textContent = 'PENDIENTE: ninguna fuente de la app lo dice todavía.'; }
    else {
      dd.textContent = l.texto;
      const f = document.createElement('small'); f.className = 'cp-fuente'; f.textContent = `Fuente: ${l.fuente}`;
      dd.append(f);
    }
    out.push(dt, dd);
  }
  return out;
}

/** Bloque «Cómo buscar» para la ficha de la guía (perfil de micro.json si la región lo tiene). */
export async function bloqueComoBuscar(id: string): Promise<HTMLElement | null> {
  const m = ctx?.manifest();
  if (!m || !m.especies.some((e) => e.id === id)) return null;
  const d = await datosMicro(m).catch(() => null);
  const s = document.createElement('section'); s.className = 'ficha-seccion cp-buscar-guia'; s.dataset.especie = id;
  const h = document.createElement('h3'); h.textContent = `Cómo buscar ${ctx.nombre(id)}`;
  const dl = document.createElement('dl'); dl.className = 'cp-dl';
  dl.append(...lineasBuscar(id, d?.cab.perfiles[id] ?? null));
  s.append(h, dl);
  return s;
}

// ---------------------------------------------------------------- abrir / cerrar

function rellenarEspecies() {
  const sel = $<HTMLSelectElement>('#cp-especie');
  const ids = (ctx.manifest()?.especies ?? []).map((e) => e.id).filter((e) => !datos || datos.cab.especies.includes(e));
  sel.replaceChildren(...ids.map((id) => { const o = document.createElement('option'); o.value = id; o.textContent = ctx.nombre(id); return o; }));
  if (!ids.includes(especie) && ids.length) especie = ids[0];
  sel.value = especie;
}

function reiniciar() {
  centro = null; encuadrado = null; celdas = []; micro = []; ocultas = 0; aqui = null; zona = ZONA_INICIAL; sel = null; avisos = [];
  RC.limpiarRuta();
  $('#cp-alerta').hidden = true;
}

/** Abre el modo campo (por defecto con la seta elegida en el mapa). */
export async function abrirCampo(idEspecie?: string) {
  if (!dlg) return;
  const m = ctx.manifest();
  if (!dlg.open) { especie = idEspecie || ctx.especie(); reiniciar(); }
  seguir = true; $<HTMLInputElement>('#cp-seguir').checked = true; encuadrado = null;
  datos = undefined;
  if (!dlg.open) dlg.showModal();
  document.body.dataset.campo = 'abierto';
  Mini.ponerEn($('#cp-hueco'));
  datos = m ? await datosMicro(m).catch((e) => { console.warn('micro', e); return null; }) : null;
  rellenarEspecies();
  pintarBuscar();
  pos = ultimaPosicion();
  pintar();
  dejarGps?.();
  dejarGps = escucharGps((p) => { pos = p; programar(); }, (msg) => { $('#cp-estado').textContent = msg; });
  const mm = await Mini.miniMapa(m);
  if (mm) Mini.alCargar(async (x) => { await ponerIcono(x, especie); programar(); });
}

function cerrar() {
  dejarGps?.(); dejarGps = null;
  delete document.body.dataset.campo;
  ctx.alCerrar?.();
}

/** Quita los iconos de las microzonas del mini-mapa. */
export function limpiarCampo() { reiniciar(); Mini.datos('campo', { type: 'FeatureCollection', features: [] }); }

export function iniciarCampo(c: ContextoCampo) {
  ctx = c;
  dlg = html();
  $('#cp-cerrar').addEventListener('click', () => { limpiarCampo(); dlg.close(); });
  dlg.addEventListener('close', cerrar);
  $('#cp-especie').addEventListener('change', async () => {
    especie = $<HTMLSelectElement>('#cp-especie').value;
    reiniciar();
    pintarBuscar();
    const m = Mini.mapaListo();
    if (m) await ponerIcono(m, especie);
    programar();
  });
  $('.cp-especie').after(RC.selectorDesnivel(() => { centro = null; sel = null; RC.limpiarRuta(); programar(); }));
  $('#cp-seguir').addEventListener('change', () => { seguir = $<HTMLInputElement>('#cp-seguir').checked; pintarMapa(); });
  Mini.alCrear((m) => {
    m.on('click', 'campo-iconos', (e: MapMouseEvent & { features?: { properties: Record<string, unknown> }[] }) => {
      if (!dlg.open) return;
      const i = Number(e.features?.[0]?.properties?.i);
      if (Number.isInteger(i)) { sel = i; pintar(); }
    });
    m.on('dragstart', () => { if (dlg.open) { seguir = false; $<HTMLInputElement>('#cp-seguir').checked = false; } });
  });
}

export const campoAbierto = () => !!dlg?.open;

/** Estado para el e2e (window.__setas.campo()). */
export const estadoCampo = () => (dlg?.open ? { especie, datos: datos ? { origen: datos.estado.origen, teselas: datos.estado.teselas } : datos ?? null,
  pos, aqui: aqui ? { idon: aqui.idon, razon: razonCelda(aqui) } : null, zona, avisos: [...avisos], sel,
  micro: micro.map((c) => ({ lat: c.lat, lon: c.lon, idon: c.idon, dist_m: c.dist_m, rumbo: c.rumbo, fila: c.fila, col: c.col, razon: razonCelda(c),
    cota_m: c.cota_m, dCota_m: c.dCota_m, desnivel_m: c.desnivel_m, subida_m: c.subida_m, bajada_m: c.bajada_m, motivo: c.motivo })),
  ocultas, rutaPie: RC.estadoRuta(),
  celdas: celdas.map((c) => ({ lat: c.lat, lon: c.lon, idon: c.idon, fila: c.fila, col: c.col })),
  alerta: $('#cp-alerta').hidden ? null : $('#cp-alerta').textContent, estado: $('#cp-estado').textContent,
  icono: dlg.dataset.icono ?? null } : null);
