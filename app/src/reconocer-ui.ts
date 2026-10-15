// Pestaña Reconocer: fotos → reconocedor offline (Web Worker) → candidatos + capa de seguridad + preguntas guiadas,
// y con cobertura la segunda opinión (Gemini, vía el Worker de Cloudflare). También la descarga opcional del
// reconocedor en Ajustes. Regla §2: nunca «comestible»; las peligrosas no descartadas siempre en rojo.
import { mb, raizDatos } from './datos';
import { archivoModelo, borrarModelo, descargarModelo, estadoModelo } from './opfs';
import type { Manifest } from './tipos';
import { cargarGuia, fichasGuia, insignia, urlFotoGuia } from './guia-ui';
import { binomio, nombreComun, type Ficha } from './guia';
import { TEXTO_BANDA, type Candidato, type ResultadoModelo } from './reconocer-nucleo';
import { AVISO_EXPERTO, evaluar, NO_SE, respuestasParaWorker, sinComestible, type Evaluacion, type Respuestas } from './seguridad';
import { construirPares, nombreConComun, type FilaRasgo, type Par } from './comparar';
import { dibujoAnatomia, tituloAnatomia } from './anatomia';
import {
  CALIDAD, fechaHoy, fusionarPeligrosas, MAX_BYTES_FOTO, MAX_LADO, pedirSegundaOpinion, urlWorker,
  type PeligrosaFusionada, type RespuestaGemini,
} from './gemini';
import type { OrdenReconocedor, RespuestaReconocedor } from './reconocedor.worker';

export interface OpcionesReconocer {
  manifest: () => Manifest | null;
  avisar: (t: string, ms?: number) => void;
  /** `mortales`: nombres de las mortales aún sin descartar en este resultado (para el aviso de la ficha). */
  verFicha: (id: string, mortales: () => string[]) => void;
  guardarSitio: (d: { especieGuia?: string; foto?: Blob; lat: number; lon: number }) => void;
}

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const MAX_FOTOS = 4;
const E2E = new URLSearchParams(location.search).get('e2e') === '1';
const URL_WORKER = urlWorker(import.meta.env.VITE_WORKER_URL, E2E, (() => { try { return localStorage; } catch { return null; } })());

let op: OpcionesReconocer;
let fotos: Blob[] = [];
const urls: string[] = [];
let resultado: ResultadoModelo | null = null;
let respuestas: Respuestas = {};
let remota: RespuestaGemini | null = null;
let posicion: { lat: number; lon: number } | null = null;

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
  const nuevas = [...(lista ?? [])].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|heic|webp)$/i.test(f.name));
  const caben = MAX_FOTOS - fotos.length;
  if (nuevas.length > caben) op.avisar(`Máximo ${MAX_FOTOS} fotos: se usan las ${caben} primeras.`);
  fotos.push(...nuevas.slice(0, Math.max(0, caben)));
  limpiarResultado();
  pintarFotos();
}

// ---------------------------------------------------------------- estado y análisis

function pintarEstado() {
  const m = op.manifest()?.modelo;
  const est = estadoModelo();
  const listoModelo = !!(m && est);
  $('#rec-estado').textContent = !m ? 'El reconocedor no está en esta versión de los datos.'
    : listoModelo ? 'Reconocedor listo, funciona sin conexión.'
    : `Para reconocer sin conexión, descarga antes el reconocedor en Ajustes (≈${mb(m.total_bytes)}).`;
  $('#rec-ir-ajustes').hidden = listoModelo || !m;
  $<HTMLButtonElement>('#rec-analizar').disabled = !listoModelo || !fotos.length;
}

function limpiarResultado() {
  resultado = null; respuestas = {}; remota = null;
  $('#rec-resultado').hidden = true;
  delete document.body.dataset.reconocer;
}

async function analizar() {
  const btn = $<HTMLButtonElement>('#rec-analizar');
  btn.disabled = true;
  $('#rec-progreso').hidden = false;
  pedirPosicion();
  try {
    await cargarReconocedor();
    const r = await enviar({ tipo: 'reconocer', fotos: [...fotos] });
    if (r.tipo === 'error') throw new Error(r.mensaje);
    if (r.tipo !== 'resultado') throw new Error('Respuesta inesperada del reconocedor');
    document.body.dataset.reconocerMs = String(Math.round(r.ms));
    document.body.dataset.reconocerMsFoto = r.msPorFoto.map((x) => Math.round(x)).join(',');
    document.body.dataset.reconocerMsInferencia = r.msInferencia.map((x) => Math.round(x)).join(',');
    await cargarGuia();
    resultado = r.resultado; respuestas = {}; remota = null;
    pintarResultado();
  } catch (e) {
    op.avisar((e as Error).message, 6000);
  } finally {
    $('#rec-progreso').hidden = true;
    pintarEstado();
  }
}

// ---------------------------------------------------------------- resultado

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

/** Mortales que el resultado actual aún no descarta (incluida la segunda opinión), con nombre científico y común. */
function mortalesSinDescartar(): string[] {
  if (!resultado) return [];
  const ev = evaluar(resultado.noReconocido ? [] : resultado.candidatos, fichasGuia(), respuestas, resultado.noReconocido);
  const lista = fusionarPeligrosas(ev.peligrosas, remota?.peligrosas_posibles ?? [], fichasGuia());
  return lista.filter((p) => p.nivel === 'mortal').map((p) => { const f = fichaDe(p.id); return f ? nombreConComun(f) : p.nombre; });
}

function pintarCandidatos(r: ResultadoModelo) {
  const ol = $('#rec-candidatos');
  ol.replaceChildren();
  $('#rec-no-reconocido').hidden = !r.noReconocido;
  if (r.noReconocido) return;
  for (const c of r.candidatos) {
    const li = el('li', 'rec-cand');
    li.dataset.nombre = c.nombre;
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

function pintarPreguntas(ev: Evaluacion) {
  const cont = $('#rec-preguntas');
  cont.replaceChildren();
  $('#rec-sin-preguntas').hidden = ev.preguntas.length > 0;
  for (const p of ev.preguntas) {
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

function lineaPeligrosa(p: PeligrosaFusionada): HTMLLIElement {
  const li = el('li', `peligrosa n-${p.nivel}${p.alerta ? ' alerta' : ''}`);
  li.dataset.id = p.id ?? p.nombre;
  li.dataset.nivel = p.nivel;
  const f = fichaDe(p.id);
  const cab = el('div', 'peligrosa-cab');
  if (f) cab.append(insignia(f.grupo));
  else cab.append(el('span', 'insignia g-toxica', 'Peligro posible'));
  const nom = el('b', '');
  nom.append(el('i', '', f ? binomio(f) : p.nombre));
  if (f && nombreComun(f)) nom.append(` · ${nombreComun(f)}`);
  cab.append(nom, el('span', 'no-descartada', 'NO DESCARTADA'));
  li.append(cab, el('p', 'nota', `Por qué: ${p.motivos.join('; ')}.`));
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

/** Recalcula la capa de seguridad (al responder una pregunta o al llegar la segunda opinión) y la pinta. */
function pintarSeguridad() {
  if (!resultado) return;
  const ev = evaluar(resultado.noReconocido ? [] : resultado.candidatos, fichasGuia(), respuestas, resultado.noReconocido);
  const lista = fusionarPeligrosas(ev.peligrosas, remota?.peligrosas_posibles ?? [], fichasGuia());

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
  const ul = $('#rec-peligrosas');
  ul.replaceChildren(...lista.map(lineaPeligrosa));
  pintarComparar();
  $('#rec-sin-peligrosas').hidden = lista.length > 0;

  const desc = ev.peligrosas.filter((p) => p.descartada && !lista.some((l) => l.id === p.id));
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
  const top = resultado && !resultado.noReconocido ? resultado.candidatos[0] : undefined;
  const f = top && !top.afin ? fichaDe(top.idGuia) : undefined;
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
  const qs = [...$('#rec-preguntas').querySelectorAll<HTMLFieldSetElement>('fieldset[data-pregunta]')];
  const ids = new Set(Object.entries(PREGUNTAS_RASGO).filter(([, r]) => r === fila.clave).map(([q]) => q));
  const fs = qs.find((x) => ids.has(x.dataset.pregunta!) && !x.querySelector<HTMLInputElement>('input:checked:not([value=no_se])')) ?? qs.find((x) => ids.has(x.dataset.pregunta!));
  if (!fs) return;
  fs.scrollIntoView({ block: 'start', behavior: suave() });
  fs.classList.add('resaltada');
  setTimeout(() => fs.classList.remove('resaltada'), 1600);
  fs.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
}
/** Rasgo de la tabla al que responde cada pregunta (la primera fila donde aparece). */
const PREGUNTAS_RASGO: Record<string, string> = {
  interior_huevo: 'fase_huevo', laminas_pie_color: 'himenio', color_poros: 'himenio', himenio_cantarelo: 'himenio',
  color_reticulo: 'pie', pie_serpiente: 'pie', volva_saco: 'volva', anillo_doble_movil: 'anillo',
  azulea_al_corte: 'carne_y_corte', carne_enrojece: 'carne_y_corte', color_latex: 'carne_y_corte', interior_gleba: 'carne_y_corte',
  sombrero_mayor_10cm: 'sombrero', piel_dura_escamosa: 'sombrero', en_matas_madera: 'habitat', cordones_base: 'habitat',
};

function pintarComparar() {
  const sec = $('#rec-comparar');
  const tabs = $('#rec-pares'), cuerpo = $('#rec-par');
  sec.hidden = !paresActuales.length;
  if (!paresActuales.length) { tabs.replaceChildren(); cuerpo.replaceChildren(); return; }
  const top = resultado!.candidatos[0];
  const cand = fichaDe(top.idGuia)!;
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
  const firma = ev.preguntas.map((p) => p.id).join(',');
  if (firma !== firmaPreguntas) { firmaPreguntas = firma; pintarPreguntas(ev); }
}

function pintarResultado() {
  if (!resultado) return;
  if (urlTuFoto) URL.revokeObjectURL(urlTuFoto);
  urlTuFoto = fotos[0] ? URL.createObjectURL(fotos[0]) : '';
  pintarCandidatos(resultado);
  firmaPreguntas = '';
  $('#rec-gemini-resultado').hidden = true;
  $('#rec-gemini-resultado').replaceChildren();
  pintarSeguridad();
  pintarGemini();
  $('#rec-resultado').hidden = false;
  $('#rec-aviso-final').textContent = AVISO_EXPERTO;
  $('#rec-resultado').scrollIntoView({ block: 'start' });
}

// ---------------------------------------------------------------- segunda opinión (Gemini)

export const geminiConfigurado = () => !!URL_WORKER;

function pintarGemini() {
  const b = $<HTMLButtonElement>('#rec-gemini');
  b.hidden = !URL_WORKER;
  b.disabled = !navigator.onLine;
  $('#rec-gemini-nota').textContent = !URL_WORKER ? ''
    : navigator.onLine ? 'Envía las fotos, tus respuestas y la fecha y posición a un servicio externo (Google Gemini).'
    : 'Sin conexión: la segunda opinión necesita internet.';
}

async function aJpeg(b: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(b);
  const k = Math.min(1, MAX_LADO / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
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

async function segundaOpinion() {
  if (!resultado || !URL_WORKER) return;
  const b = $<HTMLButtonElement>('#rec-gemini');
  b.disabled = true;
  $('#rec-gemini-nota').textContent = 'Pidiendo la segunda opinión…';
  try {
    const ev = evaluar(resultado.noReconocido ? [] : resultado.candidatos, fichasGuia(), respuestas, resultado.noReconocido);
    const jpgs = await Promise.all(fotos.map(aJpeg));
    if (jpgs.some((j) => j.size > MAX_BYTES_FOTO)) throw new Error('Alguna foto sigue pesando más de 1,5 MB tras reducirla.');
    const r = await pedirSegundaOpinion(URL_WORKER, {
      fotos: await Promise.all(jpgs.map(aBase64)),
      respuestas_guiadas: respuestasParaWorker(ev.preguntas, respuestas),
      contexto: { fecha: fechaHoy(), ...(posicion ? { lat: +posicion.lat.toFixed(5), lon: +posicion.lon.toFixed(5) } : {}) },
      candidatos_offline: resultado.noReconocido ? [] : resultado.candidatos.map((c) => ({
        id: (c.idGuia && !c.afin ? c.idGuia : c.nombre.toLowerCase().replace(/\s+/g, '_')).slice(0, 120),
        nombre: c.nombre, score: Math.min(1, Math.max(0, +c.prob.toFixed(4))) })),
    });
    remota = r;
    pintarRemota(r);
    pintarSeguridad();
    document.body.dataset.gemini = 'ok';
    pintarGemini();
  } catch (e) {
    document.body.dataset.gemini = 'error';
    pintarGemini();
    $('#rec-gemini-nota').textContent = (e as Error).message;
    op.avisar((e as Error).message, 6000);
  }
}

function pintarRemota(r: RespuestaGemini) {
  const d = $('#rec-gemini-resultado');
  d.replaceChildren();
  d.append(el('h3', '', 'Segunda opinión (Gemini)'),
    el('p', 'nota', 'Otra IA, con sus propios errores. Sus posibles peligrosas se han sumado a la lista roja de arriba.'));
  const ol = el('ol', 'rec-gemini-cand');
  for (const c of r.candidatos) {
    const li = el('li');
    const n = el('b'); n.append(el('i', '', c.nombre_cientifico)); if (c.nombre_comun) n.append(` · ${c.nombre_comun}`);
    li.append(n, el('span', `banda b-${c.confianza}`, `Confianza del modelo: ${c.confianza}`));
    if (c.rasgos_observados.length) li.append(el('p', 'nota', `Rasgos vistos: ${c.rasgos_observados.join('; ')}`));
    if (c.rasgos_que_faltan_ver.length) li.append(el('p', 'nota', `Falta comprobar: ${c.rasgos_que_faltan_ver.join('; ')}`));
    ol.append(li);
  }
  d.append(ol);
  if (r.fotos_recomendadas.length) {
    d.append(el('p', 'nota', `Fotos que ayudarían: ${r.fotos_recomendadas.join('; ')}`));
  }
  d.append(el('div', 'aviso-seguridad', r.aviso));
  d.hidden = false;
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
  if (!resultado) return;
  let p = posicion;
  if (!p) { op.avisar('Buscando tu posición…', 20000); p = await pedirPosicion(); }
  if (!p) { op.avisar('No se pudo obtener tu posición: activa el GPS para guardar el sitio.', 5000); return; }
  const top = resultado.noReconocido ? undefined : resultado.candidatos[0];
  op.guardarSitio({ especieGuia: top?.idGuia && !top.afin ? top.idGuia : undefined, foto: fotos[0], lat: p.lat, lon: p.lon });
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

export function mostrarReconocer() { pintarEstado(); if (resultado) pintarGemini(); }

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
  window.addEventListener('online', () => { pintarAjustesModelo(); if (resultado) pintarGemini(); });
  window.addEventListener('offline', () => { pintarAjustesModelo(); if (resultado) pintarGemini(); });
  pintarFotos();
}
