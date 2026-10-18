// Pestaña Reconocer: fotos → con conexión, Gemini (vía el Worker de Cloudflare) como primera opinión; sin conexión (o si
// Gemini falla), el reconocedor local (ONNX en un Web Worker) como respaldo. Si están los dos, el local sirve de
// contraste y una discrepancia se avisa. Después: candidatos con sus rasgos y lo que falta comprobar, los dobles
// peligrosos relevantes con el rasgo que los separa, las mortales que no se pueden descartar (aparte y en rojo) y las
// preguntas guiadas. También la descarga opcional del reconocedor en Ajustes.
// Regla §2: nunca «comestible»; las peligrosas no descartadas siempre en rojo.
import { mb, raizDatos } from './datos';
import { archivoModelo, borrarModelo, descargarModelo, estadoModelo } from './opfs';
import type { IdCcaa } from './manifest-region';
import type { Manifest } from './tipos';
import { cargarGuia, fichasGuia, insignia, urlFotoGuia } from './guia-ui';
import { binomio, nombreComun, type Ficha } from './guia';
import { TEXTO_BANDA, type Candidato, type ResultadoModelo } from './reconocer-nucleo';
import {
  AVISO_EXPERTO, evaluar, NO_SE, respuestasParaWorker, sinComestible, type CandidatoMin, type Evaluacion, type Pregunta, type Respuestas,
} from './seguridad';
import { construirPares, FOTO_PREGUNTA, nombreConComun, RASGOS, rasgoQueDistingue, type FilaRasgo, type Par } from './comparar';
import { dibujoAnatomia, tituloAnatomia } from './anatomia';
import {
  CALIDAD, candidatosDeGemini, discrepancia, fechaHoy, fusionarPeligrosas, MAX_BYTES_FOTO, MAX_LADO, pedirSegundaOpinion, urlWorker,
  type PeligrosaFusionada, type RespuestaGemini,
} from './gemini';
import type { OrdenReconocedor, RespuestaReconocedor } from './reconocedor.worker';

export interface OpcionesReconocer {
  manifest: () => Manifest | null;
  avisar: (t: string, ms?: number) => void;
  /** `mortales`: nombres de las mortales aún sin descartar en este resultado (para el aviso de la ficha). */
  verFicha: (id: string, mortales: () => string[]) => void;
  guardarSitio: (d: { especieGuia?: string; foto?: Blob; lat: number; lon: number }) => void;
  /** Comunidad autónoma para el prompt de Gemini (null: la del Worker por defecto). */
  ccaaGemini?: (p: { lat: number; lon: number } | null) => Promise<IdCcaa | null>;
}

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const MAX_FOTOS = 4;
const E2E = new URLSearchParams(location.search).get('e2e') === '1';
const URL_WORKER = urlWorker(import.meta.env.VITE_WORKER_URL, E2E, (() => { try { return localStorage; } catch { return null; } })());

type Motor = 'gemini' | 'local';
let op: OpcionesReconocer;
let fotos: Blob[] = [];
const urls: string[] = [];
/** Quién ha respondido (null: aún nada). Gemini manda si respondió; el local es respaldo y contraste. */
let motor: Motor | null = null;
let local: ResultadoModelo | null = null;
let remota: RespuestaGemini | null = null;
let errorGemini = '';
let localPendiente = false;
let respuestas: Respuestas = {};
let posicion: { lat: number; lon: number } | null = null;
/** Cada análisis tiene su turno: un resultado que llega tarde de un análisis anterior se ignora. */
let turno = 0;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, clase = '', texto?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto != null) n.textContent = texto;
  return n;
}
const fichaDe = (id?: string): Ficha | undefined => (id ? fichasGuia().find((f) => f.id === id) : undefined);

// ---------------------------------------------------------------- Web Worker de inferencia

let trabajador: Worker | null = null;
let listo: Promise<void> | null = null;

function enviar(o: OrdenReconocedor, transferir: Transferable[] = []): Promise<RespuestaReconocedor> {
  return new Promise((ok, mal) => {
    trabajador!.onmessage = (e: MessageEvent<RespuestaReconocedor>) => ok(e.data);
    trabajador!.onerror = (e) => { mal(new Error(e.message || 'Error en el reconocedor')); };
    trabajador!.postMessage(o, transferir);
  });
}

/** Tras descargar o borrar el paquete: la próxima vez se carga de nuevo. */
export function reiniciarReconocedor() {
  trabajador?.terminate();
  trabajador = null; listo = null;
}

async function cargarReconocedor(): Promise<void> {
  listo ??= (async () => {
    const [modelo, texto, etiquetas, wasm] = await Promise.all(
      ['vision_int8.onnx', 'texto_f16.bin', 'etiquetas.json', 'ort-wasm-simd-threaded.wasm'].map(archivoModelo));
    if (!modelo || !texto || !etiquetas || !wasm) throw new Error('El reconocedor no está descargado o está incompleto. Descárgalo en Ajustes.');
    trabajador = new Worker(new URL('./reconocedor.worker.ts', import.meta.url), { type: 'module' });
    const r = await enviar({ tipo: 'cargar', modelo, texto, etiquetas, wasm, urlMjs: new URL('ort/ort-wasm-simd-threaded.mjs', document.baseURI).href });
    if (r.tipo === 'error') throw new Error(r.mensaje);
    if (r.tipo === 'listo') document.body.dataset.reconocedorCargaMs = String(Math.round(r.ms));
  })().catch((e) => { reiniciarReconocedor(); throw e; });
  return listo;
}

/** Reconocimiento local. Lanza Error con el motivo si falla. */
async function reconocerLocal(lista: Blob[]): Promise<ResultadoModelo> {
  await cargarReconocedor();
  const r = await enviar({ tipo: 'reconocer', fotos: [...lista] });
  if (r.tipo === 'error') throw new Error(r.mensaje);
  if (r.tipo !== 'resultado') throw new Error('Respuesta inesperada del reconocedor');
  document.body.dataset.reconocerMs = String(Math.round(r.ms));
  document.body.dataset.reconocerMsFoto = r.msPorFoto.map((x) => Math.round(x)).join(',');
  document.body.dataset.reconocerMsInferencia = r.msInferencia.map((x) => Math.round(x)).join(',');
  return r.resultado;
}

// ---------------------------------------------------------------- fotos

function pintarFotos() {
  urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  const cont = $('#rec-miniaturas');
  cont.replaceChildren();
  fotos.forEach((f, i) => {
    const fig = el('figure', 'miniatura');
    const img = el('img'); const u = URL.createObjectURL(f); urls.push(u); img.src = u; img.alt = `Foto ${i + 1}`;
    const quitar = el('button', 'btn-x', '×'); quitar.setAttribute('aria-label', `Quitar foto ${i + 1}`);
    quitar.addEventListener('click', () => { fotos.splice(i, 1); limpiarResultado(); pintarFotos(); });
    fig.append(img, quitar); cont.append(fig);
  });
  $('#rec-num-fotos').textContent = fotos.length ? `${fotos.length} de ${MAX_FOTOS} fotos` : 'Haz de 1 a 4 fotos: el sombrero por arriba y por debajo, el pie entero con la base y, si es un huevo, el corte.';
  pintarEstado();
}

function anadirFotos(lista: FileList | null) {
  const nuevas = [...(lista ?? [])].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name));
  const caben = MAX_FOTOS - fotos.length;
  if (nuevas.length > caben) op.avisar(`Máximo ${MAX_FOTOS} fotos: se usan las ${caben} primeras.`);
  fotos.push(...nuevas.slice(0, Math.max(0, caben)));
  limpiarResultado();
  pintarFotos();
}

// ---------------------------------------------------------------- estado y análisis

const localListo = () => !!(op.manifest()?.modelo && estadoModelo());
const geminiDisponible = () => !!URL_WORKER && navigator.onLine;

function pintarEstado() {
  const m = op.manifest()?.modelo;
  const listoModelo = localListo();
  const partes: string[] = [];
  if (URL_WORKER) partes.push(navigator.onLine ? 'Con conexión responde Gemini (envía tus fotos a Google).' : 'Sin conexión: Gemini no está disponible.');
  partes.push(!m ? 'El reconocedor sin conexión no está en esta versión de los datos.'
    : listoModelo ? 'Reconocedor listo, funciona sin conexión.'
    : `Para reconocer sin conexión, descarga antes el reconocedor en Ajustes (≈${mb(m.total_bytes)}).`);
  $('#rec-estado').textContent = partes.join(' ');
  $('#rec-ir-ajustes').hidden = listoModelo || !m;
  $<HTMLButtonElement>('#rec-analizar').disabled = !fotos.length || !(listoModelo || geminiDisponible());
}

function limpiarResultado() {
  turno++;
  motor = null; local = null; remota = null; errorGemini = ''; localPendiente = false; respuestas = {};
  $('#rec-resultado').hidden = true;
  delete document.body.dataset.reconocer;
  delete document.body.dataset.motor;
}

async function analizar() {
  const btn = $<HTMLButtonElement>('#rec-analizar');
  const conGemini = geminiDisponible(), conLocal = localListo();
  if (!conGemini && !conLocal) { pintarEstado(); return; }
  if (localPendiente) reiniciarReconocedor();   // un análisis local anterior sigue en marcha: no mezclar respuestas
  limpiarResultado();
  const mio = turno;
  btn.disabled = true;
  const prog = $('#rec-progreso');
  prog.hidden = false;
  prog.textContent = conGemini ? 'Consultando a Gemini… suele tardar entre 10 y 20 segundos.'
    : 'Comparando… La primera vez tarda unos segundos en cargar el reconocedor.';
  pedirPosicion();
  const lista = [...fotos];
  let errorLocal = '', mantener = false;
  delete prog.dataset.error;
  const pLocal: Promise<ResultadoModelo | null> = conLocal
    ? reconocerLocal(lista).catch((e) => { errorLocal = (e as Error).message; return null; })
    : Promise.resolve(null);
  localPendiente = conLocal;
  try {
    await cargarGuia();
    if (conGemini) {
      try {
        const r = await consultarGemini(lista, false);
        if (mio !== turno) return;
        remota = r; motor = 'gemini';
        document.body.dataset.gemini = 'ok';
      } catch (e) {
        if (mio !== turno) return;
        errorGemini = (e as Error).message;
        document.body.dataset.gemini = 'error';
      }
    }
    if (motor === 'gemini') {
      pintarResultado();
      // El local llega después y queda como contraste.
      void pLocal.then((r) => {
        if (mio !== turno) return;
        localPendiente = false; local = r;
        if (motor) { pintarContraste(); pintarSeguridad(); }
      });
      return;
    }
    if (conLocal) prog.textContent = errorGemini ? 'Gemini no ha respondido: comparando con el reconocedor sin conexión…' : prog.textContent;
    const r = await pLocal;
    if (mio !== turno) return;
    localPendiente = false;
    if (r) { local = r; motor = 'local'; pintarResultado(); return; }
    const motivo = [errorGemini && `Gemini: ${errorGemini}`, errorLocal && `Reconocedor sin conexión: ${errorLocal}`].filter(Boolean).join(' ')
      || 'No se ha podido reconocer la seta.';
    prog.textContent = motivo;
    prog.dataset.error = 'si';
    mantener = true;
    op.avisar(motivo, 8000);
  } catch (e) {
    op.avisar((e as Error).message, 6000);
  } finally {
    if (mio === turno && !mantener) prog.hidden = true;
    pintarEstado();
  }
}

// ---------------------------------------------------------------- resultado

/** Candidatos para la capa de seguridad: los del motor que responde; con Gemini, también el primero del local (contraste). */
function candidatosSeguridad(): { cands: CandidatoMin[]; noRec: boolean } {
  if (motor === 'gemini' && remota) {
    const g = candidatosDeGemini(remota, fichasGuia());
    const l = local && !local.noReconocido ? local.candidatos.slice(0, 1).map((c) => ({ nombre: c.nombre, idGuia: c.afin ? undefined : c.idGuia })) : [];
    return { cands: [...g, ...l], noRec: !g.length && !l.length };
  }
  if (local) return { cands: local.noReconocido ? [] : local.candidatos, noRec: local.noReconocido };
  return { cands: [], noRec: true };
}
const evaluarAhora = (): Evaluacion => { const { cands, noRec } = candidatosSeguridad(); return evaluar(cands, fichasGuia(), respuestas, noRec); };

/** Ficha de la guía del candidato principal (para comparar y para «Guardar sitio»). */
function fichaPrincipal(): Ficha | undefined {
  if (motor === 'gemini' && remota) return fichaDe(candidatosDeGemini(remota, fichasGuia()).find((c) => c.idGuia)?.idGuia);
  const top = local && !local.noReconocido ? local.candidatos[0] : undefined;
  return top && !top.afin ? fichaDe(top.idGuia) : undefined;
}
/** Ids de la guía de todos los candidatos que se muestran (para el rasgo que separa cada doble). */
function idsCandidatos(): string[] {
  return candidatosSeguridad().cands.map((c) => c.idGuia).filter((x): x is string => !!x);
}

function nombreCandidato(c: Candidato): { cientifico: string; comun: string } {
  const f = fichaDe(c.idGuia);
  if (f && !c.afin) return { cientifico: binomio(f), comun: nombreComun(f) };
  return { cientifico: c.nombre, comun: '' };
}

function botonFicha(id: string, texto = 'Ver ficha') {
  const b = el('button', 'btn-chico', texto);
  b.type = 'button';
  b.addEventListener('click', () => op.verFicha(id, mortalesSinDescartar));
  return b;
}

function listaPeligrosas(ev = evaluarAhora()): PeligrosaFusionada[] {
  return fusionarPeligrosas(ev.peligrosas, remota?.peligrosas_posibles ?? [], fichasGuia());
}

/** Mortales que el resultado actual aún no descarta (incluido lo que señala Gemini), con nombre científico y común. */
function mortalesSinDescartar(): string[] {
  if (!motor) return [];
  return listaPeligrosas().filter((p) => p.nivel === 'mortal').map((p) => { const f = fichaDe(p.id); return f ? nombreConComun(f) : p.nombre; });
}

function lista(clase: string, titulo: string, xs: string[]): HTMLElement {
  const d = el('div', clase);
  d.append(el('b', '', titulo));
  const ul = el('ul');
  for (const t of xs) ul.append(el('li', '', sinComestible(t)));
  d.append(ul);
  return d;
}

function pintarMotor() {
  const d = $('#rec-motor');
  d.replaceChildren();
  d.dataset.motor = motor ?? '';
  document.body.dataset.motor = motor ?? '';
  if (motor === 'gemini') {
    d.append(el('b', '', 'Responde Gemini (en línea)'),
      el('p', '', 'Una IA de Google, con sus propios errores. El reconocedor sin conexión queda como contraste.'));
  } else {
    d.append(el('b', '', 'Responde el reconocedor sin conexión'),
      el('p', '', errorGemini ? `Gemini no ha respondido: ${errorGemini}`
        : !URL_WORKER ? 'Gemini no está configurado en esta copia de la app.'
        : !navigator.onLine ? 'Sin conexión: Gemini no se ha consultado.' : 'Puedes consultar también a Gemini con el botón de abajo.'));
  }
}

function pintarCandidatos() {
  const ol = $('#rec-candidatos');
  ol.replaceChildren();
  const noRec = motor === 'gemini' ? !remota?.candidatos.length : !!local?.noReconocido;
  $('#rec-no-reconocido').hidden = !noRec;
  if (motor === 'gemini' && remota) {
    const mapa = candidatosDeGemini(remota, fichasGuia());
    remota.candidatos.forEach((c, i) => {
      const li = el('li', 'rec-cand');
      li.dataset.nombre = c.nombre_cientifico;
      li.dataset.motor = 'gemini';
      li.dataset.confianza = c.confianza;
      const f = fichaDe(mapa[i]?.idGuia);
      if (f) li.dataset.id = f.id;
      const nom = el('span', 'rec-nombre');
      nom.append(el('i', '', f ? binomio(f) : c.nombre_cientifico));
      const comun = (f && nombreComun(f)) || c.nombre_comun;
      if (comun) nom.append(` · ${comun}`);
      li.append(nom, el('span', `banda b-${c.confianza}`, `Confianza: ${c.confianza}`));
      if (c.rasgos_observados.length) li.append(lista('rasgos vistos', 'Rasgos que se ven en tus fotos', c.rasgos_observados));
      if (c.rasgos_que_faltan_ver.length) li.append(lista('rasgos faltan', 'Falta comprobar', c.rasgos_que_faltan_ver));
      const fila = el('span', 'rec-acciones');
      if (f) {
        if (f.grupo === 'mortal' || f.grupo === 'toxica') fila.append(insignia(f.grupo));
        fila.append(botonFicha(f.id));
      } else fila.append(el('span', 'nota', 'Sin ficha en la guía'));
      li.append(fila);
      ol.append(li);
    });
    return;
  }
  if (!local || local.noReconocido) return;
  for (const c of local.candidatos) {
    const li = el('li', 'rec-cand');
    li.dataset.nombre = c.nombre;
    li.dataset.motor = 'local';
    if (c.idGuia) li.dataset.id = c.idGuia;
    li.dataset.banda = c.banda;
    const { cientifico, comun } = nombreCandidato(c);
    const nom = el('span', 'rec-nombre');
    nom.append(el('i', '', cientifico));
    if (comun) nom.append(` · ${comun}`);
    const banda = el('span', `banda b-${c.banda}`, TEXTO_BANDA[c.banda]);
    li.append(nom, banda);
    const f = fichaDe(c.idGuia);
    if (f) {
      const fila = el('span', 'rec-acciones');
      // Spec §2: nada de «Apreciada» junto a un candidato; solo se marca el peligro (tóxica o mortal).
      if (f.grupo === 'mortal' || f.grupo === 'toxica') fila.append(insignia(f.grupo));
      if (c.afin) fila.append(el('span', 'nota', `parecida a ${binomio(f)}`));
      fila.append(botonFicha(f.id, c.afin ? `Ficha de ${binomio(f)}` : 'Ver ficha'));
      li.append(fila);
    } else {
      li.append(el('span', 'nota', 'Sin ficha en la guía'));
    }
    ol.append(li);
  }
}

/** Fotos que ayudarían: las que pide Gemini y las de las preguntas que deciden y aún no tienen respuesta. */
function pintarFotosRecomendadas(ev: Evaluacion) {
  const d = $('#rec-fotos-rec');
  const deGemini = motor === 'gemini' ? remota?.fotos_recomendadas ?? [] : [];
  const dePreguntas = ev.preguntas.filter((p) => !respuestas[p.id] || respuestas[p.id] === NO_SE)
    .map((p) => FOTO_PREGUNTA[p.id]).filter(Boolean).slice(0, 4).map((t) => t[0].toUpperCase() + t.slice(1));
  const xs = [...new Set([...deGemini, ...dePreguntas])];
  d.replaceChildren();
  d.hidden = !xs.length;
  if (xs.length) d.append(lista('', 'Fotos que ayudarían a confirmar', xs));
}

/** Contraste con el reconocedor sin conexión cuando responde Gemini. */
function pintarContraste() {
  const d = $('#rec-contraste');
  d.replaceChildren();
  delete d.dataset.discrepa;
  if (motor !== 'gemini') { d.hidden = true; return; }
  d.hidden = false;
  if (localPendiente) { d.append(el('p', 'nota', 'Contraste: el reconocedor sin conexión aún está comparando…')); return; }
  if (!local) {
    d.append(el('p', 'nota', localListo() ? 'Contraste: el reconocedor sin conexión no ha podido comparar estas fotos.'
      : 'Contraste: descarga el reconocedor en Ajustes para compararlo también sin conexión.'));
    return;
  }
  if (local.noReconocido) { d.append(el('p', 'nota', 'Contraste: el reconocedor sin conexión no reconoce la seta en estas fotos.')); return; }
  const nombres = local.candidatos.slice(0, 3).map((c) => nombreCandidato(c).cientifico);
  const dis = discrepancia((remota?.candidatos ?? []).map((c) => ({ nombre: c.nombre_cientifico })), local.candidatos);
  if (dis) {
    d.dataset.discrepa = 'si';
    d.append(el('b', '', 'Los dos reconocedores no coinciden'),
      el('p', '', `El reconocedor sin conexión propone otro género: ${nombres.join(', ')}. Se han sumado los dobles peligrosos de su primer candidato. Ante la duda, consulta a un experto.`));
  } else {
    d.append(el('p', 'nota', `Contraste: el reconocedor sin conexión coincide en el género (${nombres.join(', ')}).`));
  }
}

function pintarPreguntasEn(cont: HTMLElement, preguntas: Pregunta[]) {
  cont.replaceChildren();
  for (const p of preguntas) {
    const fs = el('fieldset', 'pregunta');
    fs.dataset.pregunta = p.id;
    fs.append(el('legend', '', p.texto));
    if (p.ayuda) fs.append(el('p', 'nota', p.ayuda));
    const opciones = el('div', 'opciones');
    for (const o of p.opciones) {
      const lab = el('label', 'opcion');
      const inp = el('input');
      inp.type = 'radio'; inp.name = `q-${p.id}`; inp.value = o.v;
      inp.checked = (respuestas[p.id] ?? NO_SE) === o.v;
      inp.addEventListener('change', () => { respuestas[p.id] = o.v; pintarSeguridad(); });
      lab.append(inp, el('span', '', o.t));
      opciones.append(lab);
    }
    fs.append(opciones);
    cont.append(fs);
  }
}

function pintarPreguntas(ev: Evaluacion) {
  $('#rec-sin-preguntas').hidden = ev.preguntas.length + ev.preguntasOtras.length > 0;
  pintarPreguntasEn($('#rec-preguntas'), ev.preguntas);
  const det = $<HTMLDetailsElement>('#rec-preguntas-otras');
  det.hidden = !ev.preguntasOtras.length;
  pintarPreguntasEn(det.querySelector<HTMLElement>('.rec-preguntas')!, ev.preguntasOtras);
}

function lineaPeligrosa(p: PeligrosaFusionada, ids: string[]): HTMLLIElement {
  const li = el('li', `peligrosa n-${p.nivel}${p.alerta ? ' alerta' : ''}`);
  li.dataset.id = p.id ?? p.nombre;
  li.dataset.nivel = p.nivel;
  const f = fichaDe(p.id);
  const cab = el('div', 'peligrosa-cab');
  // Spec §2: en la lista de peligrosas nunca «Apreciada»; una ficha buscada que señala Gemini sale como peligro posible.
  if (f && (f.grupo === 'mortal' || f.grupo === 'toxica')) cab.append(insignia(f.grupo));
  else cab.append(el('span', 'insignia g-toxica', 'Peligro posible'));
  const nom = el('b', '');
  nom.append(el('i', '', f ? binomio(f) : p.nombre));
  if (f && nombreComun(f)) nom.append(` · ${nombreComun(f)}`);
  cab.append(nom, el('span', 'no-descartada', 'NO DESCARTADA'));
  li.append(cab);
  // El rasgo concreto que la separa de tus candidatos (guía; si no, Gemini).
  const dist = rasgoQueDistingue(f?.id, ids, fichasGuia(), p.motivoGemini);
  if (dist.rasgos.length) {
    const titulo = dist.fuente === 'guia_par' ? 'Cómo distinguirla' : dist.fuente === 'guia_ficha' ? 'Sus rasgos clave' : 'Según Gemini';
    const d = lista('distingue', titulo, dist.rasgos);
    d.dataset.fuente = dist.fuente;
    li.append(d);
  }
  li.append(el('p', 'nota', `Por qué está aquí: ${p.motivos.join('; ')}.`));
  if (f) {
    const acc = el('div', 'acciones-peligrosa');
    if (paresActuales.some((x) => x.ficha.id === f.id)) {
      const c = el('button', 'btn-chico', 'Compararla');
      c.type = 'button';
      c.addEventListener('click', () => { parSel = f.id; pintarComparar(); $('#rec-comparar').scrollIntoView({ block: 'start', behavior: suave() }); });
      acc.append(c);
    }
    acc.append(botonFicha(f.id, 'Ver ficha'));
    li.append(acc);
  }
  return li;
}

/** Mortales sin descartar que no se parecen a los candidatos: una sola caja roja, sin mezclarlas con los dobles. */
function pintarOtrasMortales(otras: PeligrosaFusionada[]) {
  const d = $('#rec-otras-mortales');
  d.replaceChildren();
  d.hidden = !otras.length;
  if (!otras.length) return;
  const t = el('b', '', otras.length === 1 ? 'Otra mortal sin descartar' : `Otras ${otras.length} mortales sin descartar`);
  t.insertAdjacentHTML('afterbegin', '<svg class="ico" aria-hidden="true"><use href="#i-alerta"/></svg>');
  const nombres = otras.map((p) => { const f = fichaDe(p.id); return f ? nombreConComun(f) : p.nombre; });
  const ul = el('ul', 'otras-lista');
  otras.forEach((p, i) => { const li = el('li', '', nombres[i]); li.dataset.id = p.id ?? p.nombre; ul.append(li); });
  const ir = el('button', 'btn-chico', 'Ir a la pregunta');
  ir.type = 'button';
  ir.addEventListener('click', () => irAPreguntaId('bajo_sombrero'));
  d.append(t, el('p', '', 'No se parecen a tus candidatos, pero el reconocimiento puede fallar. Siguen en la lista hasta que las descartes: mira qué hay debajo del sombrero y, si son poros, de qué color.'), ul, ir);
}

/** Recalcula la capa de seguridad (al responder una pregunta o al llegar otra respuesta) y la pinta. */
function pintarSeguridad() {
  if (!motor) return;
  const ev = evaluarAhora();
  const todas = listaPeligrosas(ev);
  // Dobles: primero los que una respuesta hace probables, luego las mortales, los que también nombra Gemini y los que
  // tienen ficha en la guía.
  const peso = (p: PeligrosaFusionada) => (p.alerta ? 0 : 8) + (p.nivel === 'mortal' ? 0 : 4) + (p.motivoGemini ? 0 : 2) + (p.id ? 0 : 1);
  const relevantes = todas.filter((p) => p.relevante).map((p, i) => [p, i] as const)
    .sort((a, b) => peso(a[0]) - peso(b[0]) || a[1] - b[1]).map(([p]) => p);
  const otras = todas.filter((p) => !p.relevante);

  const al = $('#rec-alertas');
  al.replaceChildren();
  for (const a of ev.alertas) {
    const d = el('div', `alerta-roja n-${a.nivel}`);
    d.setAttribute('role', 'alert');
    const t = el('b', '', a.nivel === 'mortal' ? 'PELIGRO MORTAL' : 'PELIGRO: TÓXICA');
    t.insertAdjacentHTML('afterbegin', '<svg class="ico" aria-hidden="true"><use href="#i-alerta"/></svg>');
    d.append(t, el('p', '', a.texto));
    al.append(d);
  }

  calcularPares(ev);
  const ids = idsCandidatos();
  $('#rec-peligrosas').replaceChildren(...relevantes.map((p) => lineaPeligrosa(p, ids)));
  $('#rec-sin-peligrosas').hidden = relevantes.length > 0;
  pintarOtrasMortales(otras);
  pintarComparar();
  pintarFotosRecomendadas(ev);

  const desc = ev.peligrosas.filter((p) => p.descartada && !todas.some((l) => l.id === p.id));
  const dUl = $('#rec-descartadas ul');
  dUl.replaceChildren(...desc.map((p) => {
    const f = fichaDe(p.id);
    const li = el('li', 'descartada');
    li.dataset.id = p.id;
    li.append(el('i', '', f ? binomio(f) : p.id), `: descartada por tus respuestas (${p.motivo}). Compruébalo con un experto.`);
    return li;
  }));
  $('#rec-descartadas').hidden = !desc.length;

  document.body.dataset.reconocer = 'resultado';
  document.body.dataset.alerta = ev.alertas.some((a) => a.nivel === 'mortal') ? 'mortal' : ev.alertas.length ? 'toxica' : 'no';
  pintarPreguntasSiCambian(ev);
}

// ---------------------------------------------------------------- comparación por pares (marcas de campo)

let paresActuales: Par[] = [];
let parSel = '';
let urlTuFoto = '';
const suave = (): ScrollBehavior => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

function calcularPares(ev: Evaluacion) {
  const f = fichaPrincipal();
  paresActuales = f ? construirPares(f, ev, fichasGuia(), respuestas) : [];
  if (!paresActuales.some((p) => p.ficha.id === parSel)) parSel = paresActuales[0]?.ficha.id ?? '';
}

const ESTADO_PAR: Record<Par['estado'], string> = { alerta: 'PROBABLE', no_descartada: 'NO DESCARTADA', descartada: 'DESCARTADA POR TU RESPUESTA' };
const NIVEL: Record<string, string> = { mortal: 'MORTAL', toxica: 'TÓXICA' };

function figura(src: string, nombre: string, pie: string, clase = ''): HTMLElement {
  const fig = el('figure', clase);
  const img = el('img'); img.src = src; img.alt = nombre; img.decoding = 'async'; img.loading = 'lazy';
  const cap = el('figcaption');
  cap.append(el('b', '', nombre), el('span', '', pie));
  fig.append(img, cap);
  return fig;
}

function marca(n: number, falta = false): HTMLSpanElement {
  const m = el('span', `marca${falta ? ' falta' : ''}`, String(n));
  m.setAttribute('aria-label', `rasgo ${n}${falta ? ', sin comprobar' : ''}`);
  return m;
}

/** Lleva a la pregunta que aporta ese rasgo y la resalta un momento. */
function irAPregunta(fila: FilaRasgo) {
  irAPreguntaEn(new Set(Object.entries(PREGUNTAS_RASGO).filter(([, r]) => r === fila.clave).map(([q]) => q)));
}
function irAPreguntaId(id: string) { irAPreguntaEn(new Set([id])); }
function irAPreguntaEn(ids: Set<string>) {
  const qs = [...$('#rec-resultado').querySelectorAll<HTMLFieldSetElement>('fieldset[data-pregunta]')];
  const fs = qs.find((x) => ids.has(x.dataset.pregunta!) && !x.querySelector<HTMLInputElement>('input:checked:not([value=no_se])')) ?? qs.find((x) => ids.has(x.dataset.pregunta!));
  if (!fs) return;
  const det = fs.closest('details');
  if (det) det.open = true;
  fs.scrollIntoView({ block: 'start', behavior: suave() });
  fs.classList.add('resaltada');
  setTimeout(() => fs.classList.remove('resaltada'), 1600);
  fs.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
}
/** Rasgo de la tabla al que responde cada pregunta (la primera fila donde aparece). */
const PREGUNTAS_RASGO: Record<string, string> = {};
for (const r of RASGOS) for (const q of r.preguntas) PREGUNTAS_RASGO[q] ??= r.clave;

function pintarComparar() {
  const sec = $('#rec-comparar');
  const tabs = $('#rec-pares'), cuerpo = $('#rec-par');
  sec.hidden = !paresActuales.length;
  if (!paresActuales.length) { tabs.replaceChildren(); cuerpo.replaceChildren(); return; }
  const cand = fichaPrincipal()!;
  tabs.replaceChildren(...paresActuales.map((p) => {
    const b = el('button', 'par-tab');
    b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.id = p.ficha.id; b.dataset.estado = p.estado;
    b.setAttribute('aria-selected', String(p.ficha.id === parSel));
    b.append(el('b', '', nombreComun(p.ficha) || binomio(p.ficha)),
      el('small', '', p.estado === 'descartada' ? 'DESCARTADA' : `${NIVEL[p.peligrosa.nivel]} · ${ESTADO_PAR[p.estado]}`));
    b.addEventListener('click', () => { parSel = p.ficha.id; pintarComparar(); });
    return b;
  }));
  const par = paresActuales.find((p) => p.ficha.id === parSel)!;
  const f = par.ficha;
  cuerpo.replaceChildren();
  cuerpo.dataset.id = f.id;
  cuerpo.setAttribute('aria-label', `${binomio(cand)} frente a ${binomio(f)}`);

  // Estado del par
  const est = el('div', 'par-estado');
  est.dataset.estado = par.estado;
  est.setAttribute('role', par.estado === 'descartada' ? 'note' : 'alert');
  est.append(el('b', '', `${NIVEL[par.peligrosa.nivel]} · ${ESTADO_PAR[par.estado]}`), el('p', '', sinComestible(par.falsoPositivo.fiarte)));
  cuerpo.append(est);

  // Fotos: la tuya, la de la candidata y la de la peligrosa (con autor y licencia)
  const fotos = el('div', 'par-fotos');
  if (urlTuFoto) fotos.append(figura(urlTuFoto, 'Tu foto', 'la que has analizado'));
  const credito = (x: typeof f) => (x.fotos[0] ? `${x.fotos[0].autor} · ${x.fotos[0].licencia}` : '');
  if (cand.fotos[0]) fotos.append(figura(urlFotoGuia(cand.fotos[0]), nombreComun(cand) || binomio(cand), credito(cand)));
  if (f.fotos[0]) fotos.append(figura(urlFotoGuia(f.fotos[0]), nombreComun(f) || binomio(f), credito(f), 'es-peligrosa'));
  cuerpo.append(fotos);

  // Qué buscar en tus fotos: las marcas de los rasgos que deciden
  const deciden = par.filas.filter((x) => x.decide);
  if (deciden.length) {
    const busca = el('p', 'busca');
    busca.append('Busca en tus fotos:');
    for (const x of deciden) { const s = el('span'); s.append(marca(x.marca, !!x.tu?.falta), x.titulo); busca.append(s); }
    cuerpo.append(busca);
  }

  // Dibujos de anatomía, numerados
  const conDibujo = par.filas.filter((x) => x.dibujos.candidata || x.dibujos.peligrosa);
  if (conDibujo.length) {
    const dib = el('div', 'par-dibujos');
    for (const x of conDibujo) {
      const fig = el('figure', 'dibujo');
      fig.append(marca(x.marca, !!x.tu?.falta));
      const { candidata: dc, peligrosa: dp } = x.dibujos;
      if (dc && dp && dc !== dp) {
        const dos = el('div', 'dibujo-par');
        for (const [k, quien, clase] of [[dc, nombreComun(cand) || binomio(cand), ''], [dp, nombreComun(f) || binomio(f), 'es-peligrosa']] as const) {
          const d = el('div', clase); d.innerHTML = dibujoAnatomia(k) ?? ''; d.append(el('small', '', quien)); dos.append(d);
        }
        fig.append(dos);
      } else {
        const d = el('div'); d.innerHTML = dibujoAnatomia((dc ?? dp)!) ?? '';
        fig.append(d);
        if (!(dc && dp)) fig.append(el('small', 'nota', `solo ${dc ? nombreComun(cand) || binomio(cand) : nombreComun(f) || binomio(f)}`));
      }
      fig.append(el('figcaption', '', dc === dp || !dc || !dp ? tituloAnatomia((dc ?? dp)!) : x.titulo));
      dib.append(fig);
    }
    cuerpo.append(dib);
  }

  // Tabla rasgo | candidata | peligrosa | tú
  const tabla = el('table', 'par-tabla');
  const thead = el('thead', 'sr'); const trh = el('tr');
  trh.append(el('th', '', nombreComun(cand) || binomio(cand)), el('th', 'peligrosa-col', nombreComun(f) || binomio(f)), el('th', '', 'Tú: respuesta o foto'));
  thead.append(trh);
  const tb = el('tbody');
  for (const x of par.filas) {
    const tr1 = el('tr', 'fila-rasgo');
    const th = el('th'); th.colSpan = 3; th.scope = 'rowgroup';
    const sp = el('span'); sp.append(marca(x.marca, !!x.tu?.falta), x.titulo);
    if (x.decide) sp.append(el('small', 'decide', 'DECIDE'));
    th.append(sp); tr1.append(th);
    const tr2 = el('tr');
    const tu = el('td', 'td-tu');
    if (!x.tu) tu.append(el('span', 'celda-tu', 'Míralo en tu foto'));
    else if (x.tu.falta) {
      const b = el('button', 'celda-tu falta', x.tu.texto === 'No sé' ? 'Sin comprobar: respondiste «No sé»' : 'Sin comprobar');
      b.type = 'button'; b.title = 'Ir a la pregunta';
      b.addEventListener('click', () => irAPregunta(x));
      tu.append(b);
    } else tu.append(el('span', 'celda-tu', x.tu.texto));
    const tdC = el('td', '', sinComestible(x.candidata)), tdP = el('td', 'td-peligrosa', sinComestible(x.peligrosa));
    tdC.dataset.etq = nombreComun(cand) || binomio(cand); tdP.dataset.etq = nombreComun(f) || binomio(f); tu.dataset.etq = 'Tú';
    tr2.append(tdC, tdP, tu);
    tb.append(tr1, tr2);
  }
  tabla.append(thead, tb);
  cuerpo.append(tabla);

  // Riesgo de falso positivo
  const fp = el('section', 'falso-positivo');
  fp.append(el('h3', '', 'Riesgo de falso positivo'));
  const dl = el('dl');
  const lista = (xs: string[]) => { const ul = el('ul'); for (const t of xs) ul.append(el('li', '', sinComestible(t))); return ul; };
  const dd = (x: string | HTMLElement) => { const d = el('dd'); d.append(x); return d; };
  dl.append(el('dt', '', 'Por qué se parecen'), dd(lista(par.falsoPositivo.parecido)),
    el('dt', '', 'Qué las separa'), dd(lista(par.falsoPositivo.separa)),
    el('dt', '', 'Cuánto fiarte'), dd(sinComestible(par.falsoPositivo.fiarte)),
    el('dt', '', 'Qué foto falta'), dd(par.falsoPositivo.fotos.length ? lista(par.falsoPositivo.fotos.map((t) => t[0].toUpperCase() + t.slice(1))) : 'Ninguna: ya has respondido a todo lo que decide.'));
  fp.append(dl, botonFicha(f.id, `Ficha de ${binomio(f)}`));
  cuerpo.append(fp);
}

let firmaPreguntas = '';
function pintarPreguntasSiCambian(ev: Evaluacion) {
  const firma = `${ev.preguntas.map((p) => p.id).join(',')}|${ev.preguntasOtras.map((p) => p.id).join(',')}`;
  if (firma !== firmaPreguntas) { firmaPreguntas = firma; pintarPreguntas(ev); }
}

function pintarResultado() {
  if (!motor) return;
  if (urlTuFoto) URL.revokeObjectURL(urlTuFoto);
  urlTuFoto = fotos[0] ? URL.createObjectURL(fotos[0]) : '';
  pintarMotor();
  pintarCandidatos();
  pintarContraste();
  firmaPreguntas = '';
  pintarSeguridad();
  pintarGemini();
  $('#rec-resultado').hidden = false;
  $('#rec-aviso-final').textContent = AVISO_EXPERTO;
  $('#rec-resultado').scrollIntoView({ block: 'start' });
}

// ---------------------------------------------------------------- Gemini (en línea)

export const geminiConfigurado = () => !!URL_WORKER;

function pintarGemini() {
  const b = $<HTMLButtonElement>('#rec-gemini');
  b.hidden = !URL_WORKER;
  b.disabled = !navigator.onLine;
  b.textContent = motor === 'gemini' ? 'Preguntar otra vez a Gemini con tus respuestas' : 'Consultar a Gemini';
  $('#rec-gemini-nota').textContent = !URL_WORKER ? ''
    : !navigator.onLine ? 'Sin conexión: Gemini necesita internet.'
    : errorGemini && motor !== 'gemini' ? `Gemini no ha respondido: ${errorGemini}`
    : 'Gemini recibe tus fotos, tus respuestas y la fecha y posición (servicio externo de Google).';
}

/** Decodifica la foto (también HEIC en Safari) con el giro EXIF aplicado; si createImageBitmap no puede, con <img>. */
async function decodificar(b: Blob): Promise<{ img: CanvasImageSource; w: number; h: number; cerrar: () => void }> {
  try {
    const bmp = await createImageBitmap(b, { imageOrientation: 'from-image' });
    return { img: bmp, w: bmp.width, h: bmp.height, cerrar: () => bmp.close() };
  } catch {
    const u = URL.createObjectURL(b);
    const im = new Image();
    im.src = u;
    try { await im.decode(); } catch {
      URL.revokeObjectURL(u);
      throw new Error('No se pudo leer la foto (formato no compatible). Hazla con la cámara de la app o elige una foto JPEG.');
    }
    return { img: im, w: im.naturalWidth, h: im.naturalHeight, cerrar: () => URL.revokeObjectURL(u) };
  }
}

/** Foto → JPEG de MAX_LADO px de lado como máximo, por debajo del límite del Worker. */
async function aJpeg(b: Blob): Promise<Blob> {
  const d = await decodificar(b);
  const k = Math.min(1, MAX_LADO / Math.max(d.w, d.h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(d.w * k)); c.height = Math.max(1, Math.round(d.h * k));
  c.getContext('2d')!.drawImage(d.img, 0, 0, c.width, c.height);
  d.cerrar();
  for (let q = CALIDAD; ; q -= 0.15) {
    const j: Blob = await new Promise((ok, mal) => c.toBlob((x) => (x ? ok(x) : mal(new Error('No se pudo comprimir la foto'))), 'image/jpeg', q));
    if (j.size <= MAX_BYTES_FOTO || q < 0.35) return j;
  }
}
const aBase64 = (b: Blob) => new Promise<string>((ok, mal) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
  r.onerror = () => mal(r.error);
  r.readAsDataURL(b);
});

/** Consulta a Gemini con las fotos; `conRespuestas`: incluye las respuestas guiadas y los candidatos del local. */
async function consultarGemini(lista: Blob[], conRespuestas: boolean): Promise<RespuestaGemini> {
  const jpgs = await Promise.all(lista.map(aJpeg));
  if (jpgs.some((j) => j.size > MAX_BYTES_FOTO)) throw new Error('Alguna foto sigue pesando más de 1,5 MB tras reducirla.');
  const ccaa = (await op.ccaaGemini?.(posicion).catch(() => null)) ?? null;
  const ev = conRespuestas && motor ? evaluarAhora() : null;
  return pedirSegundaOpinion(URL_WORKER, {
    fotos: await Promise.all(jpgs.map(aBase64)),
    respuestas_guiadas: ev ? respuestasParaWorker([...ev.preguntas, ...ev.preguntasOtras], respuestas) : {},
    contexto: { fecha: fechaHoy(), ...(posicion ? { lat: +posicion.lat.toFixed(5), lon: +posicion.lon.toFixed(5) } : {}), ...(ccaa ? { ccaa } : {}) },
    candidatos_offline: conRespuestas && local && !local.noReconocido ? local.candidatos.map((c) => ({
      id: (c.idGuia && !c.afin ? c.idGuia : c.nombre.toLowerCase().replace(/\s+/g, '_')).slice(0, 120),
      nombre: c.nombre.slice(0, 120), score: Math.min(1, Math.max(0, +c.prob.toFixed(4))) })) : [],
  });
}

/** Botón «Consultar a Gemini» / «Preguntar otra vez»: con las respuestas dadas. */
async function segundaOpinion() {
  if (!motor || !URL_WORKER) return;
  const mio = turno;
  const b = $<HTMLButtonElement>('#rec-gemini');
  b.disabled = true;
  $('#rec-gemini-nota').textContent = 'Consultando a Gemini… suele tardar entre 10 y 20 segundos.';
  try {
    const r = await consultarGemini([...fotos], true);
    if (mio !== turno) return;
    remota = r; motor = 'gemini'; errorGemini = '';
    document.body.dataset.gemini = 'ok';
    pintarResultado();
  } catch (e) {
    if (mio !== turno) return;
    errorGemini = (e as Error).message;
    document.body.dataset.gemini = 'error';
    pintarMotor();
    pintarGemini();
    if (motor === 'gemini') $('#rec-gemini-nota').textContent = `Gemini no ha respondido: ${errorGemini}`;
    op.avisar(errorGemini, 6000);
  }
}

// ---------------------------------------------------------------- GPS y guardar sitio

function pedirPosicion(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((ok) => {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { posicion = { lat: p.coords.latitude, lon: p.coords.longitude }; ok(posicion); },
      () => ok(null), { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
  });
}

async function guardar() {
  if (!motor) return;
  let p = posicion;
  if (!p) { op.avisar('Buscando tu posición…', 20000); p = await pedirPosicion(); }
  if (!p) { op.avisar('No se pudo obtener tu posición: activa el GPS para guardar el sitio.', 5000); return; }
  op.guardarSitio({ especieGuia: fichaPrincipal()?.id, foto: fotos[0], lat: p.lat, lon: p.lon });
}

// ---------------------------------------------------------------- Ajustes: descarga del reconocedor

export function pintarAjustesModelo() {
  const m = op.manifest()?.modelo;
  const est = estadoModelo();
  const btn = $<HTMLButtonElement>('#btn-modelo');
  $('#estado-gemini').textContent = URL_WORKER ? 'Configurada: necesita conexión.' : 'Pendiente de configurar (falta la dirección del servicio).';
  if (!m) {
    $('#estado-modelo').textContent = 'No disponible en esta versión de los datos.';
    btn.hidden = true; $('#btn-borrar-modelo').hidden = true; return;
  }
  btn.hidden = false;
  btn.disabled = !navigator.onLine;
  const desfasado = !!est && est.generado !== m.version;
  btn.textContent = !est ? `Descargar reconocedor para usar sin conexión (≈${mb(m.total_bytes)})`
    : desfasado ? `Actualizar reconocedor (≈${mb(m.total_bytes)})` : `Volver a descargar el reconocedor (≈${mb(m.total_bytes)})`;
  $('#estado-modelo').textContent = est
    ? `Descargado el ${new Date(est.fecha).toLocaleString('es-ES')} · ${mb(est.bytes)}${desfasado ? ' · hay una versión más nueva' : ''}`
    : 'No descargado: opcional. Sin él no se puede reconocer sin conexión.';
  $('#btn-borrar-modelo').hidden = !est;
}

async function descargar() {
  const m = op.manifest()?.modelo;
  if (!m) return;
  const btn = $<HTMLButtonElement>('#btn-modelo');
  const prog = $<HTMLProgressElement>('#prog-modelo');
  btn.disabled = true; prog.hidden = false; prog.value = 0;
  try {
    await descargarModelo(m, raizDatos(), (h, t) => {
      prog.value = h / t;
      $('#estado-modelo').textContent = `Descargando el reconocedor… ${mb(h)} de ${mb(t)}`;
    });
    reiniciarReconocedor();
    op.avisar('Reconocedor descargado: ya funciona sin conexión');
  } catch (e) {
    op.avisar(`Error al descargar el reconocedor: ${(e as Error).message}${estadoModelo() ? '. El anterior sigue disponible.' : ''}`, 6000);
  } finally {
    prog.hidden = true;
    pintarAjustesModelo();
    pintarEstado();
  }
}

// ---------------------------------------------------------------- arranque

export function mostrarReconocer() { pintarEstado(); if (motor) pintarGemini(); }

export function iniciarReconocer(o: OpcionesReconocer) {
  op = o;
  for (const id of ['#rec-camara', '#rec-galeria']) {
    $<HTMLInputElement>(id).addEventListener('change', (e) => {
      const inp = e.target as HTMLInputElement;
      anadirFotos(inp.files);
      inp.value = '';
    });
  }
  $('#rec-analizar').addEventListener('click', analizar);
  $('#rec-ir-ajustes').addEventListener('click', () => document.querySelector<HTMLButtonElement>('.pestanas button[data-p=p-ajustes]')?.click());
  $('#rec-gemini').addEventListener('click', segundaOpinion);
  $('#rec-guardar').addEventListener('click', guardar);
  $('#btn-modelo').addEventListener('click', descargar);
  $('#btn-borrar-modelo').addEventListener('click', async () => {
    if (!confirm('¿Borrar el reconocedor descargado? Sin él no se puede reconocer sin conexión.')) return;
    reiniciarReconocedor();
    await borrarModelo();
    pintarAjustesModelo(); pintarEstado();
    op.avisar('Reconocedor borrado');
  });
  window.addEventListener('online', () => { pintarAjustesModelo(); pintarEstado(); if (motor) pintarGemini(); });
  window.addEventListener('offline', () => { pintarAjustesModelo(); pintarEstado(); if (motor) pintarGemini(); });
  pintarFotos();
}
