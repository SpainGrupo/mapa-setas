// Selector de especie del mapa con fotos: botón (miniatura + nombre) → hoja con la lista (role=listbox).
// El valor vive en el <select id="sel-especie"> oculto, que sigue siendo la fuente de verdad para el resto de
// la app: elegir aquí cambia su valor y lanza «change»; cualquier otro cambio se refleja con pintarSelectorEspecie().
// Teclado: ↑/↓/Inicio/Fin mueven el foco, Intro/Espacio eligen, Esc cierra (el propio <dialog>).
import { binomio, fichaDeEspecieMapa, miniaturaEspecie, nombreComun } from './guia';
import { fichaGuia, indiceGuia } from './guia-ui';
import type { Especie } from './tipos';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
let especies: () => Especie[] = () => [];

/** Nombre común (de la guía, si hay ficha), científico y URL de la miniatura de una especie del mapa. */
export function datosEspecie(e: Especie): { comun: string; cientifico: string; miniatura: string | null } {
  const ficha = fichaGuia(fichaDeEspecieMapa(e.id));
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
  }
  const ul = $('#lista-especies');
  ul.replaceChildren();
  for (const e of lista) {
    const d = datosEspecie(e);
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.id = `opc-especie-${e.id}`;
    li.dataset.especie = e.id;
    const elegida = e.id === actual?.id;
    li.setAttribute('aria-selected', String(elegida));
    li.tabIndex = elegida ? 0 : -1;
    const caja = document.createElement('span'); caja.className = 'miniatura-especie'; caja.setAttribute('aria-hidden', 'true');
    miniatura(caja, d.miniatura);
    const txt = document.createElement('span'); txt.className = 'se-texto';
    const b = document.createElement('b'); b.textContent = d.comun;
    const i = document.createElement('i'); i.textContent = d.cientifico;
    txt.append(b, i);
    const marca = document.createElement('span'); marca.className = 'se-marca'; marca.setAttribute('aria-hidden', 'true'); marca.textContent = elegida ? '✓' : '';
    li.append(caja, txt, marca);
    ul.append(li);
  }
}

function elegir(id: string) {
  const sel = $<HTMLSelectElement>('#sel-especie');
  const dlg = $<HTMLDialogElement>('#dlg-especie');
  dlg.close();
  if (sel.value !== id) { sel.value = id; sel.dispatchEvent(new Event('change')); }
  pintarSelectorEspecie();
}

export function iniciarSelectorEspecie(deManifest: () => Especie[]) {
  especies = deManifest;
  const btn = $('#btn-especie');
  const dlg = $<HTMLDialogElement>('#dlg-especie');
  const ul = $('#lista-especies');
  const opciones = () => [...ul.querySelectorAll<HTMLLIElement>('[role=option]')];
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
