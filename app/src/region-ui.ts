// Selector de región (spec §4.2): chip en la cabecera del mapa y hoja #dlg-region; lista con descargas en Ajustes.
// Con una sola región en regiones.json no se enseña nada. Cambiar de región recarga la página (main.ts, cambiar).
import { textoEstadoRegion, type Punto, type RegionIndice } from './region';
import { mb } from './unidades';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

export interface OpcionesRegionUi {
  regiones: () => RegionIndice[];
  activa: () => string;
  estado: (id: string) => { bytes: number } | null;
  cambiar: (id: string) => void;
}

export function posicionRapida(): Promise<Punto | null> {
  return new Promise((ok) => {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition((p) => ok({ lat: p.coords.latitude, lon: p.coords.longitude }), () => ok(null),
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 10 * 60 * 1000 });
  });
}

function opcion(r: RegionIndice, elegida: boolean, est: { bytes: number } | null): HTMLLIElement {
  const li = document.createElement('li');
  li.setAttribute('role', 'option'); li.setAttribute('aria-selected', String(elegida));
  li.dataset.region = r.id; li.tabIndex = elegida ? 0 : -1;
  const b = document.createElement('b'); b.textContent = r.nombre;
  const s = document.createElement('span'); s.className = 'nota'; s.textContent = textoEstadoRegion(r, est, navigator.onLine);
  const marca = document.createElement('span'); marca.className = 'se-marca'; marca.setAttribute('aria-hidden', 'true');
  if (elegida) marca.innerHTML = '<svg class="ico"><use href="#i-check"/></svg>';
  li.append(b, marca, s);
  if (!est && !navigator.onLine) li.setAttribute('aria-disabled', 'true');
  return li;
}

/** Abre la hoja y resuelve con el id elegido (null si se cierra sin elegir). */
function abrirHoja(rs: RegionIndice[], activa: string | null, estado: (id: string) => { bytes: number } | null, primera: boolean): Promise<string | null> {
  const dlg = $<HTMLDialogElement>('#dlg-region');
  const ul = $('#lista-regiones');
  $('#regiones-intro').hidden = !primera;
  ul.replaceChildren(...rs.map((r) => opcion(r, r.id === activa, estado(r.id))));
  return new Promise((ok) => {
    let elegido: string | null = null;
    const elegir = (li: HTMLLIElement | null) => {
      if (!li?.dataset.region || li.getAttribute('aria-disabled') === 'true') return;
      elegido = li.dataset.region; dlg.close();
    };
    const clic = (ev: Event) => elegir((ev.target as HTMLElement).closest<HTMLLIElement>('[role=option]'));
    const tecla = (ev: KeyboardEvent) => {
      const os = [...ul.querySelectorAll<HTMLLIElement>('[role=option]')];
      const i = os.indexOf(document.activeElement as HTMLLIElement);
      const ir: Record<string, number> = { ArrowDown: Math.min(i + 1, os.length - 1), ArrowUp: Math.max(i - 1, 0), Home: 0, End: os.length - 1 };
      if (ev.key in ir) { ev.preventDefault(); os.forEach((o) => (o.tabIndex = -1)); os[ir[ev.key]].tabIndex = 0; os[ir[ev.key]].focus(); }
      else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); elegir(os[i] ?? null); }
    };
    ul.addEventListener('click', clic); ul.addEventListener('keydown', tecla);
    dlg.addEventListener('close', () => { ul.removeEventListener('click', clic); ul.removeEventListener('keydown', tecla); ok(elegido); }, { once: true });
    dlg.showModal();
    (ul.querySelector<HTMLLIElement>('[aria-selected=true]') ?? ul.querySelector<HTMLLIElement>('[role=option]'))?.focus();
  });
}

/** Primera vez sin GPS: espera a que se cierre el aviso de inicio (dos modales a la vez no) y pregunta. */
export async function preguntarRegion(rs: RegionIndice[]): Promise<string | null> {
  const inicio = $<HTMLDialogElement>('#dlg-inicio');
  if (inicio.open) await new Promise((r) => inicio.addEventListener('close', r, { once: true }));
  return abrirHoja(rs, null, () => null, true);
}

export function pintarChipRegion(o: OpcionesRegionUi) {
  const btn = $<HTMLButtonElement>('#btn-region');
  const r = o.regiones().find((x) => x.id === o.activa());
  btn.hidden = o.regiones().length < 2 || !r;
  if (!r) return;
  $('#btn-region-nombre').textContent = r.nombre;
  btn.setAttribute('aria-label', `Región: ${r.nombre}. Cambiar de región`);
}

export function iniciarSelectorRegion(o: OpcionesRegionUi) {
  pintarChipRegion(o);
  const btn = $<HTMLButtonElement>('#btn-region');
  btn.addEventListener('click', async () => {
    btn.setAttribute('aria-expanded', 'true');
    const id = await abrirHoja(o.regiones(), o.activa(), o.estado, false);
    btn.setAttribute('aria-expanded', 'false'); btn.focus();
    if (id && id !== o.activa()) o.cambiar(id);
  });
}

export function pintarAjustesRegion(o: OpcionesRegionUi & {
  descargar: (id: string, boton: HTMLButtonElement) => Promise<void>; borrar: (id: string) => Promise<void>;
  descargando?: (id: string) => boolean;
}) {
  const rs = o.regiones();
  $('#ajustes-region').hidden = rs.length < 2;
  const activa = rs.find((r) => r.id === o.activa());
  $('#tit-mapas-offline').textContent = rs.length > 1 && activa ? `Mapas sin conexión · ${activa.nombre}` : 'Mapas sin conexión';
  if (rs.length < 2) return;
  const boton = (texto: string, accion: string, clase: string, f: (b: HTMLButtonElement) => void) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = clase; b.textContent = texto; b.dataset.accion = accion;
    b.onclick = () => f(b); return b;
  };
  $('#ajustes-lista-regiones').replaceChildren(...rs.map((r) => {
    const est = o.estado(r.id);
    const li = document.createElement('li'); li.dataset.region = r.id;
    const b = document.createElement('b'); b.textContent = r.nombre;
    const s = document.createElement('span'); s.className = 'nota'; s.textContent = textoEstadoRegion(r, est, navigator.onLine);
    const acc = document.createElement('div'); acc.className = 'acciones-region';
    if (r.id === o.activa()) {
      const x = document.createElement('span'); x.className = 'chip-en-uso'; x.textContent = 'En uso'; acc.append(x);
    } else {
      const usar = boton('Usar esta región', 'usar', 'btn', () => o.cambiar(r.id));
      usar.disabled = !est && !navigator.onLine;
      acc.append(usar);
      if (est) acc.append(boton('Borrar', 'borrar', 'btn btn-peligro', () => o.borrar(r.id)));
      else {
        const enCurso = o.descargando?.(r.id) ?? false;
        const d = boton(enCurso ? 'Descargando…' : `Descargar (${mb(r.total_bytes)})`, 'descargar', 'btn', (bt) => o.descargar(r.id, bt));
        d.disabled = enCurso || !navigator.onLine;
        acc.append(d);
      }
    }
    li.append(b, s, acc);
    return li;
  }));
}
