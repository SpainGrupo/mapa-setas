// Pestaña Guía: lista con buscador y filtros, ficha con fotos, rasgos y «No confundir con…», créditos,
// y la copia sin cobertura de las fotos.
//
// Sin cobertura: especies.json e indice.json van en el precache de Workbox (con el app shell; son ~110 KB y
// la interfaz depende de su forma). Las fotos (~18 MB) van en una caché propia, «guia-fotos», que la página
// rellena sola al arrancar con conexión y el service worker sirve con CacheFirst. No van en el precache porque
// su instalación es todo o nada: 18 MB de fotos retrasarían o romperían la instalación del app shell con mala
// cobertura. Tampoco van en la descarga OPFS de mapas: esa la decide el usuario (cientos de MB) y la guía debe
// funcionar aunque nunca descargue mapas; además un <img> no puede leer OPFS sin crear blob URLs a mano.
import {
  agrupar, bannerFicha, binomio, COMESTIBLES, ETIQUETA_GRUPO, filtrar, nombreComun, notaBajoPeligro, TITULO_GRUPO, urlFoto,
  type Ficha, type Foto, type Grupo, type IndiceGuia,
} from './guia';
import { AVISO_EXPERTO } from './seguridad';

export const CACHE_FOTOS = 'guia-fotos';
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

let fichas: Ficha[] = [];
let porId = new Map<string, Ficha>();
let indice: IndiceGuia | null = null;
let carga: Promise<boolean> | null = null;
let grupoSel: Grupo | '' = '';
/** Mortales sin descartar del resultado del reconocedor desde el que se abrió la ficha (null: no viene de ahí). */
let avisoReconocer: (() => string[]) | null = null;
/** La ficha se abrió desde un resultado del reconocedor: «atrás» vuelve al resultado. */
let desdeReconocer = false;
/** Bloque «Cuándo está activa» de una ficha (main.ts lo construye con el manifest y el tiempo); null: sin bloque. */
let bloqueTiempo: ((idFicha: string) => HTMLElement | null) | null = null;
export const ponerBloqueTiempo = (f: (idFicha: string) => HTMLElement | null) => { bloqueTiempo = f; };
let bloqueTop: ((idFicha: string) => Promise<HTMLElement | null>) | null = null;
/** Top de sitios de la especie (hoy-ui.bloqueTopGuia, lo conecta main.ts). */
export const ponerBloqueTop = (f: (idFicha: string) => Promise<HTMLElement | null>) => { bloqueTop = f; };

async function json<T>(ruta: string): Promise<T | null> {
  try {
    const r = await fetch(ruta);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/** Carga la guía una sola vez (red o precache del service worker). */
export function cargarGuia(): Promise<boolean> {
  carga ??= (async () => {
    const [e, i] = await Promise.all([json<Ficha[]>('guia/especies.json'), json<IndiceGuia>('guia/indice.json')]);
    if (!e) { carga = null; return false; }
    fichas = e; indice = i;
    porId = new Map(e.map((f) => [f.id, f]));
    return true;
  })();
  return carga;
}

export const hayFicha = (id: string) => porId.has(id);
export const fichaGuia = (id: string): Ficha | undefined => porId.get(id);
/** indice.json cargado (null hasta que cargarGuia() termina o si falta). */
export const indiceGuia = (): IndiceGuia | null => indice;
/** Fichas cargadas (vacío hasta que cargarGuia() termina). */
export const fichasGuia = (): Ficha[] => fichas;

// ---------------------------------------------------------------- utilidades de DOM

function el<K extends keyof HTMLElementTagNameMap>(tag: K, clase = '', texto?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto != null) n.textContent = texto;
  return n;
}

export function insignia(g: Grupo): HTMLSpanElement {
  const s = el('span', `insignia g-${g}`, ETIQUETA_GRUPO[g]);
  s.dataset.grupo = g;
  return s;
}

/** URL de una foto de la guía (con su hash de versión). */
export const urlFotoGuia = (f: Foto) => urlFoto(f.archivo, indice);

function imagen(f: Foto | undefined, alt: string, perezosa = true): HTMLImageElement {
  const img = el('img');
  img.alt = alt;
  img.decoding = 'async';
  if (perezosa) img.loading = 'lazy';
  if (f) img.src = urlFoto(f.archivo, indice);
  return img;
}

function enlace(url: string, texto: string, clase = ''): HTMLAnchorElement {
  const a = el('a', clase, texto);
  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  return a;
}

// ---------------------------------------------------------------- lista

export async function mostrarGuia() {
  const ok = await cargarGuia();
  $('#guia-error').hidden = ok;
  if (!ok) return;
  pintarLista();
  const id = (history.state as { guia?: string } | null)?.guia;
  if (id && porId.has(id)) { if ($('#guia-ficha').hidden) pintarFicha(id); } else verLista();
}

function pintarLista() {
  const cont = $('#guia-lista');
  cont.replaceChildren();
  const lista = filtrar(fichas, $<HTMLInputElement>('#guia-buscar').value, grupoSel);
  if (!lista.length) { cont.append(el('p', 'vacio', 'Ninguna especie coincide con la búsqueda.')); return; }
  for (const { grupo, fichas: fs } of agrupar(lista)) {
    const sec = el('section', `grupo-guia g-${grupo}`);
    sec.append(el('h2', '', `${TITULO_GRUPO[grupo]} (${fs.length})`));
    const ul = el('ul', 'tarjetas-guia');
    for (const f of fs) {
      const li = el('li');
      const b = el('button', 'tarjeta-guia');
      b.dataset.id = f.id;
      const txt = el('span', 'tg-texto');
      txt.append(el('b', '', nombreComun(f)), el('i', '', binomio(f)), insignia(f.grupo));
      b.append(imagen(f.fotos[0], ''), txt);
      b.addEventListener('click', () => abrirFicha(f.id, 'lista'));
      li.append(b); ul.append(li);
    }
    sec.append(ul); cont.append(sec);
  }
}

function verLista() {
  $('#guia-vista-lista').hidden = false;
  $('#guia-ficha').hidden = true;
  $('#guia-ficha').replaceChildren();
}

// ---------------------------------------------------------------- ficha

/**
 * Abre una ficha y la apila en el historial (el «atrás» del móvil vuelve a la lista o a la ficha anterior).
 * `desde`: «reconocer» con `mortales` (las mortales sin descartar del resultado, ya nombradas) mantiene ese contexto
 * para el aviso de la ficha; «guia» (enlaces dentro de la guía) lo conserva; cualquier otro origen lo borra.
 */
export async function abrirFicha(id: string, desde: 'reconocer' | 'guia' | 'lista' | 'otro' = 'otro', mortales?: () => string[]) {
  if (desde === 'reconocer') { avisoReconocer = mortales ?? null; desdeReconocer = true; }
  else if (desde !== 'guia') { avisoReconocer = null; desdeReconocer = false; }
  if (!await cargarGuia() || !porId.has(id)) return;
  history.pushState({ guia: id }, '');
  pintarFicha(id);
}

window.addEventListener('popstate', (e) => {
  const id = (e.state as { guia?: string } | null)?.guia;
  if (id && porId.has(id)) pintarFicha(id);
  else if (fichas.length) verLista();
});

function caja(clase: string, titulo: string, texto: string, rol = 'note'): HTMLDivElement {
  const d = el('div', clase);
  d.setAttribute('role', rol);
  const b = el('b', '', titulo);
  if (/peligro/.test(clase)) b.insertAdjacentHTML('afterbegin', '<svg class="ico" aria-hidden="true"><use href="#i-alerta"/></svg>');
  d.append(b, el('p', '', texto));
  return d;
}

function carrusel(f: Ficha): HTMLElement {
  const fig = el('div', 'carrusel-guia');
  const pista = el('div', 'pista');
  pista.tabIndex = 0;
  pista.setAttribute('aria-label', 'Fotos (desliza)');
  f.fotos.forEach((foto, i) => {
    const fi = el('figure');
    const cap = el('figcaption');
    if (foto.descripcion) cap.append(el('span', 'desc', foto.descripcion));
    cap.append(enlace(foto.url_fuente, `Foto: ${foto.autor} · ${foto.licencia}`, 'credito'));
    fi.append(imagen(foto, `${binomio(f)}, foto ${i + 1} de ${f.fotos.length}${foto.descripcion ? `: ${foto.descripcion}` : ''}`, i > 0), cap);
    pista.append(fi);
  });
  const cont = el('div', 'contador', `1 / ${f.fotos.length}`);
  pista.addEventListener('scroll', () => {
    cont.textContent = `${Math.round(pista.scrollLeft / Math.max(1, pista.clientWidth)) + 1} / ${f.fotos.length}`;
  }, { passive: true });
  fig.append(pista);
  if (f.fotos.length > 1) fig.append(cont);
  return fig;
}

function comparativa(f: Ficha, c: { id: string; diferencias: string[] }, sinApreciada = false): HTMLElement {
  const otra = porId.get(c.id)!;
  const card = el('article', `comparar g-${otra.grupo}`);
  card.dataset.id = otra.id;
  const lado = (x: Ficha, etiqueta: string) => {
    const fig = el('figure');
    const cap = el('figcaption');
    cap.append(el('small', '', etiqueta), el('b', '', nombreComun(x)), el('i', '', binomio(x)));
    if (!(sinApreciada && COMESTIBLES.has(x.grupo))) cap.append(insignia(x.grupo));
    fig.append(imagen(x.fotos[0], binomio(x)), cap);
    return fig;
  };
  const par = el('div', 'par');
  par.append(lado(f, 'Esta'), lado(otra, 'Se confunde con'));
  const ul = el('ul', 'diferencias');
  for (const d of c.diferencias) ul.append(el('li', '', d));
  const ir = el('button', 'btn ir-ficha', `Ver ficha de ${binomio(otra)} ›`);
  ir.addEventListener('click', (e) => { e.stopPropagation(); abrirFicha(otra.id, 'guia'); });
  card.addEventListener('click', () => abrirFicha(otra.id, 'guia'));
  card.append(par, el('h4', '', 'Cómo distinguirlas'), ul, ir);
  return card;
}

const CAMPOS: [keyof Ficha, string][] = [
  ['sombrero', 'Sombrero'], ['himenio', 'Láminas o poros'], ['pie', 'Pie'], ['volva', 'Volva'], ['anillo', 'Anillo'],
  ['carne_y_corte', 'Carne y corte'], ['olor_sabor', 'Olor y sabor'], ['esporada', 'Esporada'],
];

function pintarFicha(id: string) {
  const f = porId.get(id)!;
  const v = $('#guia-ficha');
  v.replaceChildren();
  v.dataset.id = f.id;
  v.dataset.grupo = f.grupo;

  const fija = el('div', 'ficha-fija');
  const barra = el('div', 'ficha-barra');
  const volver = el('button', 'btn-volver');
  volver.innerHTML = `<svg class="ico" aria-hidden="true"><use href="#i-atras"/></svg>${desdeReconocer ? 'Tu resultado' : 'Guía'}`;
  volver.addEventListener('click', () => {
    if (desdeReconocer) { document.querySelector<HTMLButtonElement>('.pestanas button[data-p=p-reconocer]')?.click(); return; }
    if (history.state?.guia) history.back(); else verLista();
  });
  barra.append(volver, el('span', 'ficha-barra-tit', binomio(f)));
  fija.append(barra);
  // Spec §2: desde un resultado con mortales sin descartar, nunca «Considerada comestible…»: aviso rojo que las nombra.
  const aviso = bannerFicha(f, avisoReconocer?.() ?? [], AVISO_EXPERTO);
  const peligroAbierto = aviso.clase === 'banner-peligro';
  const b = el('div', aviso.clase);
  b.setAttribute('role', aviso.rol);
  if (aviso.titulo) b.append(el('b', '', aviso.titulo), el('span', '', aviso.texto));
  else b.textContent = aviso.texto;
  fija.append(b);
  v.append(fija);

  const cuerpo = el('div', 'cuerpo ficha-cuerpo');
  if (f.grupo === 'mortal') cuerpo.append(caja('caja-peligro mortal', 'MORTAL', f.toxicidad_nota, 'alert'));
  else if (f.grupo === 'toxica') cuerpo.append(caja('caja-peligro toxica', 'TÓXICA', f.toxicidad_nota, 'alert'));

  const cab = el('header', 'ficha-cab');
  const h = el('h1', '', nombreComun(f));
  cab.append(h, el('p', 'cientifico', f.nombre_cientifico));
  if (!peligroAbierto) cab.append(insignia(f.grupo));   // sin «Apreciada» mientras una mortal siga sin descartar
  if (f.nombres_comunes.length > 1) cab.append(el('p', 'otros-nombres', `También: ${f.nombres_comunes.slice(1).join(', ')}`));
  cuerpo.append(cab);
  // Sin el bloque de temporada mientras una mortal del resultado siga sin descartar (no animar a salir a por ella).
  const cuando = peligroAbierto ? null : bloqueTiempo?.(f.id);
  if (cuando) cuerpo.append(cuando);
  cuerpo.append(carrusel(f));
  // Top de sitios de la especie (asíncrono: sitios.json); tampoco con una mortal sin descartar.
  if (!peligroAbierto && bloqueTop) {
    const hueco = el('div', 'ficha-top-hueco');
    cuerpo.append(hueco);
    bloqueTop(f.id).then((b) => { if (b && hueco.isConnected && v.dataset.id === f.id) hueco.replaceWith(b); else hueco.remove(); }).catch(() => hueco.remove());
  }
  // Con mortales sin descartar se quita el aviso del grupo, pero no el de que la propia especie es tóxica (colmenilla).
  const nota = COMESTIBLES.has(f.grupo) ? (peligroAbierto ? notaBajoPeligro(f.toxicidad_nota) : f.toxicidad_nota) : '';
  if (nota) cuerpo.append(caja('caja-nota', 'Precaución', nota));

  const rasgos = el('section', 'rasgos');
  rasgos.append(el('h2', '', 'Rasgos clave: compruébalos todos'));
  const ul = el('ul', 'checklist');
  for (const r of f.rasgos_clave) ul.append(el('li', '', r));
  rasgos.append(ul);
  cuerpo.append(rasgos);
  if (f.fase_huevo) cuerpo.append(caja('caja-huevo', 'En fase de huevo', f.fase_huevo));

  if (f.no_confundir_con.length) {
    const sec = el('section', 'no-confundir');
    sec.append(el('h2', '', 'No confundir con…'));
    for (const c of f.no_confundir_con) if (porId.has(c.id)) sec.append(comparativa(f, c, peligroAbierto));
    cuerpo.append(sec);
  }

  const desc = el('section', 'descripcion');
  desc.append(el('h2', '', 'Descripción'));
  const dl = el('dl');
  for (const [k, t] of CAMPOS) dl.append(el('dt', '', t), el('dd', '', String(f[k])));
  desc.append(dl);
  const hab = el('dl', 'habitat');
  hab.append(el('dt', '', 'Hábitat'), el('dd', '', f.habitat), el('dt', '', 'Temporada'), el('dd', '', f.temporada));
  desc.append(el('h2', '', 'Dónde y cuándo'), hab);
  cuerpo.append(desc);

  const fu = el('section', 'fuentes');
  fu.append(el('h2', '', 'Fuentes'));
  const ol = el('ol');
  for (const s of f.fuentes) { const li = el('li'); li.append(enlace(s.url, s.titulo)); ol.append(li); }
  fu.append(ol);
  cuerpo.append(fu);
  v.append(cuerpo);

  $('#guia-vista-lista').hidden = true;
  v.hidden = false;
  $('#p-guia').scrollTop = 0;
}

// ---------------------------------------------------------------- créditos (Ajustes)

export async function pintarCreditos() {
  const cont = $('#lista-creditos');
  if (cont.childElementCount || !await cargarGuia()) return;
  for (const f of [...fichas].sort((a, b) => a.nombre_cientifico.localeCompare(b.nombre_cientifico, 'es'))) {
    const sec = el('div', 'credito-especie');
    sec.append(el('b', '', binomio(f)));
    const ol = el('ol');
    for (const foto of f.fotos) {
      const li = el('li');
      li.append(`${foto.autor} · ${foto.licencia}${foto.descripcion ? ` (${foto.descripcion})` : ''} · `, enlace(foto.url_fuente, 'fuente'));
      ol.append(li);
    }
    sec.append(ol); cont.append(sec);
  }
}

// ---------------------------------------------------------------- fotos sin cobertura

export interface EstadoFotos { guardadas: number; total: number; trabajando: boolean }
let estadoFotos: EstadoFotos = { guardadas: 0, total: 0, trabajando: false };
let enCurso: Promise<EstadoFotos> | null = null;
export const fotosSinConexion = () => estadoFotos;

/**
 * Guarda en la caché «guia-fotos» las fotos que falten (y borra las de versiones anteriores). Sin conexión solo
 * cuenta lo que hay. Se puede llamar las veces que se quiera: no repite lo ya guardado.
 */
export function guardarFotosSinConexion(alAvanzar: (e: EstadoFotos) => void = () => {}): Promise<EstadoFotos> {
  enCurso ??= (async () => {
    if (!('caches' in window) || !await cargarGuia()) return estadoFotos;
    const urls = [...new Set(fichas.flatMap((f) => f.fotos.map((x) => new URL(urlFoto(x.archivo, indice), document.baseURI).href)))];
    const cache = await caches.open(CACHE_FOTOS);
    const vigentes = new Set(urls);
    for (const r of await cache.keys()) if (!vigentes.has(r.url)) await cache.delete(r);
    const faltan: string[] = [];
    for (const u of urls) if (!await cache.match(u)) faltan.push(u);
    estadoFotos = { guardadas: urls.length - faltan.length, total: urls.length, trabajando: faltan.length > 0 && navigator.onLine };
    alAvanzar(estadoFotos);
    if (estadoFotos.trabajando) {
      const cola = [...faltan];
      const hilo = async () => {
        for (let u = cola.shift(); u; u = cola.shift()) {
          try {
            const r = await fetch(u);
            if (r.ok) { await cache.put(u, r); estadoFotos.guardadas++; alAvanzar(estadoFotos); }
          } catch { /* sin red: se reintenta en el siguiente arranque o desde Ajustes */ }
        }
      };
      await Promise.all([hilo(), hilo(), hilo()]);
      estadoFotos.trabajando = false;
      alAvanzar(estadoFotos);
    }
    document.body.dataset.guiaFotos = estadoFotos.guardadas === estadoFotos.total ? 'completas' : 'incompletas';
    return estadoFotos;
  })().finally(() => { enCurso = null; });
  return enCurso;
}

// ---------------------------------------------------------------- controles de la lista

$('#guia-buscar').addEventListener('input', () => pintarLista());
document.querySelectorAll<HTMLButtonElement>('#p-guia .chip').forEach((c) => c.addEventListener('click', () => {
  grupoSel = (c.dataset.grupo ?? '') as Grupo | '';
  document.querySelectorAll<HTMLButtonElement>('#p-guia .chip').forEach((x) => {
    x.classList.toggle('activa', x === c);
    x.setAttribute('aria-pressed', String(x === c));
  });
  pintarLista();
}));
