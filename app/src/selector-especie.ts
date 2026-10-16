// Selector de especie del mapa con fotos: botón (miniatura + nombre) → hoja con la lista (role=listbox).
// El valor vive en el <select id="sel-especie"> oculto, que sigue siendo la fuente de verdad para el resto de
// la app: elegir aquí cambia su valor y lanza «change»; cualquier otro cambio se refleja con pintarSelectorEspecie().
// Teclado: ↑/↓/Inicio/Fin mueven el foco, Intro/Espacio eligen, Esc cierra (el propio <dialog>).
import { binomio, DESCRITA_EN_OTRA_FICHA, fichaDeEspecieMapa, miniaturaEspecie, nombreComun, textoFichaDe } from './guia';
import { fichaGuia, indiceGuia } from './guia-ui';
import type { Especie } from './tipos';
import { EXPLICACION_FIABILIDAD, insigniaFiabilidad, nivelFiabilidad, sinCalibrar, textoFiabilidad, TEXTO_SIN_CALIBRAR } from './fiabilidad';
import type { ResultadoSemaforo } from './semaforo';
import { ordenarSelector, textoFinVentana, TEXTO_INACTIVA, type EtiquetaInactiva, type Ventana } from './ventana-especie';
import { NOMBRE_ESTADO } from './zona';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
let especies: () => Especie[] = () => [];
/** Semáforo de hoy de cada especie en su punto de referencia (main.ts); null sin datos del tiempo. */
let estadoHoy: (id: string) => ResultadoSemaforo | null = () => null;
let hoy: () => string = () => new Date().toISOString().slice(0, 10);
/** Pueblo del punto meteo que decide el estado de cada seta (main.ts): «activa cerca de Ojén». */
let lugar: (id: string) => string | null = () => null;
/** Especies de la guía sin hábitat en la región activa (manifest.especies_sin_habitat): grises y no elegibles. */
let sinHabitat: () => Especie[] = () => [];
/** Estimación de la ventana de cada seta en su punto de referencia (main.ts): «hasta ~20 oct». */
let ventana: (id: string) => Ventana | null = () => null;
let ultimoOrden: { activas: string[]; inactivas: { id: string; etiqueta: EtiquetaInactiva }[]; lugares: Record<string, string | null>; sinHabitat: string[] } =
  { activas: [], inactivas: [], lugares: {}, sinHabitat: [] };
/** Orden de la última lista pintada (e2e: window.__setas.selector()). */
export const ordenSelector = () => ultimoOrden;

/** Nombre común (de la guía, si hay ficha), científico y URL de la miniatura de una especie del mapa. */
export function datosEspecie(e: Especie): { comun: string; cientifico: string; miniatura: string | null } {
  const ficha = fichaGuia(fichaDeEspecieMapa(e.id));
  if (ficha && DESCRITA_EN_OTRA_FICHA.has(e.id)) {
    return { comun: e.nombre, cientifico: textoFichaDe(ficha), miniatura: miniaturaEspecie(e.id, indiceGuia()) };
  }
  const comun = ficha ? nombreComun(ficha) : '';
  return { comun: comun || e.nombre, cientifico: comun ? e.nombre : (ficha ? binomio(ficha) : ''),
    miniatura: miniaturaEspecie(e.id, indiceGuia()) };
}

function miniatura(caja: HTMLElement, url: string | null) {
  caja.replaceChildren();
  const icono = () => {
    caja.replaceChildren();
    caja.classList.add('sin-foto');
    caja.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-seta"/></svg>';
  };
  if (!url) return icono();
  caja.classList.remove('sin-foto');
  const img = document.createElement('img');
  img.alt = ''; img.decoding = 'async'; img.width = 128; img.height = 128;
  img.onerror = icono;
  img.src = url;
  caja.append(img);
}

/** Repinta el botón y la lista con la especie elegida y lo que haya cargado de la guía. */
export function pintarSelectorEspecie() {
  const sel = $<HTMLSelectElement>('#sel-especie');
  const lista = especies();
  const actual = lista.find((e) => e.id === sel.value) ?? lista[0];
  const btn = $('#btn-especie');
  if (actual) {
    const d = datosEspecie(actual);
    $('#btn-especie-nombre').textContent = d.comun;
    $('#btn-especie-cientifico').textContent = d.cientifico;
    miniatura(btn.querySelector('.miniatura-especie')!, d.miniatura);
    btn.dataset.especie = actual.id;
    const leyenda = $('#txt-fiabilidad');
    if (leyenda) {
      leyenda.textContent = textoFiabilidad(actual.fiabilidad, actual.n_citas);
      leyenda.className = `insignia-fiabilidad fiab-${nivelFiabilidad(actual.fiabilidad)}`;
      leyenda.dataset.fiabilidad = nivelFiabilidad(actual.fiabilidad);
      $('#txt-fiabilidad-expl').textContent = EXPLICACION_FIABILIDAD;
      const cal = $('#txt-calibrado');
      if (cal) { cal.hidden = !sinCalibrar(actual); cal.textContent = TEXTO_SIN_CALIBRAR; }
    }
  }
  const caja = $('#lista-especies');
  caja.replaceChildren();
  // Arriba «Activas ahora» (verde/amarillo en su punto de referencia); debajo, tras «Ver más», las demás en gris
  // con su motivo, elegibles igual, y las que no tienen hábitat en la región (no elegibles).
  const orden = ordenarSelector(lista.map((e) => ({ id: e.id, especie: e, fiabilidad: nivelFiabilidad(e.fiabilidad),
    resultado: estadoHoy(e.id), meses: e.tiempo?.meses ?? [] })), hoy());
  const lugares: Record<string, string | null> = Object.fromEntries(lista.map((e) => [e.id, lugar(e.id)]));
  const sh = sinHabitat();
  ultimoOrden = { activas: orden.activas.map((x) => x.id), inactivas: orden.inactivas.map((x) => ({ id: x.item.id, etiqueta: x.etiqueta })), lugares,
    sinHabitat: sh.map((e) => e.id) };

  const opcion = (e: Especie) => {
    const d = datosEspecie(e);
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.id = `opc-especie-${e.id}`;
    li.dataset.especie = e.id;
    const elegida = e.id === actual?.id;
    li.setAttribute('aria-selected', String(elegida));
    li.tabIndex = elegida ? 0 : -1;
    const mini = document.createElement('span'); mini.className = 'miniatura-especie'; mini.setAttribute('aria-hidden', 'true');
    miniatura(mini, d.miniatura);
    const txt = document.createElement('span'); txt.className = 'se-texto';
    const b = document.createElement('b'); b.textContent = d.comun;
    const i = document.createElement('i'); i.textContent = d.cientifico;
    txt.append(b, i);
    const pie = document.createElement('span'); pie.className = 'se-pie';
    txt.append(pie);
    const marca = document.createElement('span'); marca.className = 'se-marca'; marca.setAttribute('aria-hidden', 'true');
    if (elegida) marca.innerHTML = '<svg class="ico"><use href="#i-check"/></svg>';
    li.append(mini, txt, marca);
    return { li, pie, elegida };
  };
  const insignias = (e: Especie, pie: HTMLElement) => {
    pie.append(insigniaFiabilidad(e.fiabilidad, e.n_citas));
    if (sinCalibrar(e)) { const s = document.createElement('span'); s.className = 'se-sin-calibrar'; s.textContent = TEXTO_SIN_CALIBRAR; pie.append(s); }
  };
  const lista_ = (id: string, etiqueta: string) => {
    const ul = document.createElement('ul'); ul.id = id; ul.className = 'se-lista'; ul.setAttribute('role', 'listbox');
    ul.setAttribute('aria-labelledby', etiqueta);
    return ul;
  };
  const titulo = (id: string, texto: string) => {
    const h = document.createElement('p'); h.id = id; h.className = 'se-grupo'; h.textContent = texto;
    return h;
  };

  // 1. Activas ahora (o, sin datos del tiempo, todas sin rotular como activas)
  const tAct = titulo('se-tit-activas', orden.sinTiempo ? 'Todas las especies' : 'Activas ahora');
  const ulAct = lista_('lista-activas', 'se-tit-activas');
  caja.append(tAct);
  if (orden.sinTiempo) {
    const n = document.createElement('p'); n.className = 'se-nota'; n.textContent = 'Sin datos del tiempo todavía: no se sabe cuáles están activas.';
    caja.append(n);
  }
  let elegidaEnMas = false;
  for (const x of orden.activas) {
    const e = x.especie, estado = x.resultado;
    const { li, pie } = opcion(e);
    if (estado) {
      const c = document.createElement('span'); c.className = 'chip-estado se-estado'; c.dataset.estado = estado.estado; c.textContent = NOMBRE_ESTADO[estado.estado];
      pie.append(c);
      const donde = lugares[e.id];
      if (donde) { const l = document.createElement('span'); l.className = 'se-lugar'; l.textContent = `activa cerca de ${donde}`; pie.append(l); }
      const fin = ventana(e.id);
      const t = fin && (fin.tipo === 'activa' || fin.tipo === 'pronto') ? textoFinVentana(fin) : '';
      if (t) { const h = document.createElement('span'); h.className = 'se-hasta'; h.textContent = t; pie.append(h); }
    }
    insignias(e, pie);
    ulAct.append(li);
  }
  if (orden.activas.length) caja.append(ulAct);
  else {
    const n = document.createElement('p'); n.className = 'se-ninguna'; n.id = 'se-ninguna';
    n.textContent = 'Ahora ninguna está activa en la zona que miras. Las tienes todas abajo, en gris: se pueden elegir igual.';
    caja.append(n);
  }

  // 2. «Ver más»: no activas (gris, con su motivo) y sin hábitat en esta zona
  if (orden.inactivas.length || sh.length) {
    const ulMas = lista_('lista-mas', 'se-tit-mas');
    for (const { item, etiqueta } of orden.inactivas) {
      const e = item.especie;
      const { li, pie, elegida } = opcion(e);
      if (elegida) elegidaEnMas = true;
      li.classList.add('inactiva');
      li.dataset.motivo = etiqueta;
      const x = document.createElement('span'); x.className = 'se-inactiva';
      const donde = lugares[e.id];
      x.textContent = TEXTO_INACTIVA[etiqueta] + (donde && (etiqueta === 'seco' || etiqueta === 'pasó su lluvia') ? ` (mirado cerca de ${donde})` : '');
      pie.append(x);
      insignias(e, pie);
      ulMas.append(li);
    }
    // Especies de la guía sin hábitat en esta región (spec §4.4): grises, sin capa y no elegibles. La guía sigue teniendo su ficha.
    if (sh.length) {
      const sep = document.createElement('li');
      sep.className = 'se-divisor'; sep.setAttribute('role', 'presentation'); sep.textContent = 'Sin hábitat en esta zona';
      ulMas.append(sep);
    }
    for (const e of sh) {
      const d = datosEspecie(e);
      const li = document.createElement('li');
      li.setAttribute('role', 'option'); li.setAttribute('aria-disabled', 'true'); li.setAttribute('aria-selected', 'false');
      li.tabIndex = -1; li.className = 'sin-habitat'; li.dataset.sinHabitat = e.id;
      const mini = document.createElement('span'); mini.className = 'miniatura-especie'; mini.setAttribute('aria-hidden', 'true');
      miniatura(mini, d.miniatura);
      const txt = document.createElement('span'); txt.className = 'se-texto';
      const b = document.createElement('b'); b.textContent = d.comun;
      const i = document.createElement('i'); i.textContent = d.cientifico;
      const pie = document.createElement('span'); pie.className = 'se-pie';
      const x = document.createElement('span'); x.className = 'se-inactiva'; x.textContent = 'Sin hábitat en esta zona';
      pie.append(x); txt.append(b, i, pie);
      li.append(mini, txt);
      ulMas.append(li);
    }
    const n = orden.inactivas.length;
    const btn = document.createElement('button'); btn.type = 'button'; btn.id = 'btn-ver-mas'; btn.className = 'se-ver-mas';
    btn.setAttribute('aria-controls', 'lista-mas');
    const tMas = document.createElement('span'); tMas.id = 'se-tit-mas';
    tMas.textContent = n ? `Ver más · ${n} no ${n === 1 ? 'activa' : 'activas'} ahora` : `Ver más · ${sh.length} sin hábitat en esta zona`;
    btn.append(tMas);
    btn.insertAdjacentHTML('beforeend', '<svg class="ico" aria-hidden="true"><use href="#i-abajo"/></svg>');
    // Abierto si lo dejó abierto, si no hay ninguna activa o si la especie elegida está aquí abajo.
    const abierto = verMasGuardado() || (!orden.activas.length && !orden.sinTiempo) || elegidaEnMas;
    btn.setAttribute('aria-expanded', String(abierto));
    ulMas.hidden = !abierto;
    btn.onclick = () => {
      const abrir = btn.getAttribute('aria-expanded') !== 'true';
      ulMas.hidden = !abrir;
      btn.setAttribute('aria-expanded', String(abrir));
      guardarVerMas(abrir);
      if (abrir) ulMas.querySelector<HTMLElement>('[role=option]')?.scrollIntoView({ block: 'nearest' });
    };
    caja.append(btn, ulMas);
  }
}

const CLAVE_VER_MAS = 'setas:selector-ver-mas';
function verMasGuardado(): boolean { try { return localStorage.getItem(CLAVE_VER_MAS) === '1'; } catch { return false; } }
function guardarVerMas(v: boolean) { try { localStorage.setItem(CLAVE_VER_MAS, v ? '1' : '0'); } catch { /* solo esta sesión */ } }

function elegir(id: string) {
  const sel = $<HTMLSelectElement>('#sel-especie');
  const dlg = $<HTMLDialogElement>('#dlg-especie');
  dlg.close();
  if (sel.value !== id) { sel.value = id; sel.dispatchEvent(new Event('change')); }
  pintarSelectorEspecie();
}

export function iniciarSelectorEspecie(deManifest: () => Especie[], o: { estadoHoy?: (id: string) => ResultadoSemaforo | null; hoy?: () => string;
  lugar?: (id: string) => string | null; sinHabitat?: () => Especie[]; ventana?: (id: string) => Ventana | null } = {}) {
  especies = deManifest;
  if (o.ventana) ventana = o.ventana;
  if (o.sinHabitat) sinHabitat = o.sinHabitat;
  if (o.lugar) lugar = o.lugar;
  if (o.estadoHoy) estadoHoy = o.estadoHoy;
  if (o.hoy) hoy = o.hoy;
  const btn = $('#btn-especie');
  const dlg = $<HTMLDialogElement>('#dlg-especie');
  const ul = $('#lista-especies');
  const opciones = () => [...ul.querySelectorAll<HTMLLIElement>('[role=option]')].filter((o) => !o.closest('[hidden]'));
  const enfocar = (li: HTMLLIElement | undefined) => {
    if (!li) return;
    for (const o of opciones()) o.tabIndex = o === li ? 0 : -1;
    li.focus();
  };
  btn.addEventListener('click', () => {
    if (!especies().length) return;
    pintarSelectorEspecie();
    dlg.showModal();
    btn.setAttribute('aria-expanded', 'true');
    enfocar(ul.querySelector<HTMLLIElement>('[aria-selected=true]') ?? opciones()[0]);
  });
  dlg.addEventListener('close', () => { btn.setAttribute('aria-expanded', 'false'); btn.focus(); });
  dlg.addEventListener('click', (ev) => {   // toque en el fondo oscurecido, fuera de la hoja
    if (ev.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) dlg.close();
  });
  ul.addEventListener('click', (ev) => {
    const li = (ev.target as HTMLElement).closest<HTMLLIElement>('[role=option]');
    if (li?.dataset.especie) elegir(li.dataset.especie);
  });
  ul.addEventListener('keydown', (ev) => {
    const os = opciones();
    const i = os.indexOf(document.activeElement as HTMLLIElement);
    const ir: Record<string, number> = { ArrowDown: Math.min(i + 1, os.length - 1), ArrowUp: Math.max(i - 1, 0), Home: 0, End: os.length - 1 };
    if (ev.key in ir) { ev.preventDefault(); enfocar(os[ir[ev.key]]); }
    else if ((ev.key === 'Enter' || ev.key === ' ') && os[i]?.dataset.especie) { ev.preventDefault(); elegir(os[i].dataset.especie!); }
  });
}
