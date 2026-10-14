// Pestaña «Hoy» (fase 9): selector de día, confianza de la previsión, mejores sitios (general y por seta) y calendario.
// La lógica está en ranking.ts y calendario.ts; aquí solo el DOM. main.ts le pasa lo que necesita en iniciarHoy().
import { cargarJson } from './datos';
import type { Manifest } from './tipos';
import type { ResultadoSemaforo } from './semaforo';
import { nivelFiabilidad, type Fiabilidad } from './fiabilidad';
import { distanciaM, MARBELLA, parsearSitios, topEspecie, topGeneral, type Entrada, type FilaGeneral, type Opciones, type SitiosJson } from './ranking';
import { acotarDia, confianza, diasChips, estadoCalendario, etiquetaDia, mejorResultado, MESES_CORTOS, ordenarCalendario, sumarDiasMax,
  TEXTO_CONFIANZA, type FilaCalendario } from './calendario';
import { NOMBRE_DIFICULTAD, type Dificultad } from './ruta';
import { textoSubida, textoTiempo } from './acceso';
import { ICONO_ESTADO, NOMBRE_ESTADO } from './zona';
import { datosEspecie } from './selector-especie';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

export interface ContextoHoy {
  manifest: () => Manifest | null;
  hoy: () => string;
  hayMeteo: () => boolean;
  textoMeteo: () => string;
  /** Semáforo de la especie en el punto meteo `id` el día `fecha` (null sin datos). */
  estadoPunto: (id: number, especie: string, fecha: string) => ResultadoSemaforo | null;
  posicion: () => { lat: number; lon: number } | null;
  verEnMapa: (especie: string, lat: number, lon: number) => void;
  rutaAPie: (especie: string, lat: number, lon: number) => void;
  coche: (lat: number, lon: number) => void;
  guardar: (especie: string, lat: number, lon: number) => void;
  hayFicha: (especie: string) => Promise<boolean>;
  verFicha: (especie: string) => void;
  irZona: () => void;
}

const CLAVE_DIF = 'setas:dificultad-max';
const CLAVE_N = 'setas:top-n';
const leer = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const escribir = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* solo esta sesión */ } };

let ctx: ContextoHoy;
let sitios: Promise<SitiosJson | null> | null = null;
let fechaSel: string | null = null;
let ultimo: { fecha: string; confianza: string; general: FilaGeneral[]; especie: string; top: Entrada[]; calendario: FilaCalendario[]; sinSitios: boolean } | null = null;

export const maxDificultad = (): Dificultad | null => {
  const v = leer(CLAVE_DIF);
  return v === 'facil' || v === 'moderada' || v === 'dificil' ? v : null;
};
export const topN = () => (leer(CLAVE_N) === '3' ? 3 : 2);

function cargarSitios(): Promise<SitiosJson | null> {
  const m = ctx.manifest();
  if (!m?.sitios?.archivo) return Promise.resolve(null);
  sitios ??= cargarJson<unknown>(m.sitios.archivo).then(parsearSitios).catch(() => { sitios = null; return null; });
  return sitios;
}

const nombre = (id: string) => ctx.manifest()?.especies.find((e) => e.id === id)?.nombre ?? id;
const fiab = (id: string): Fiabilidad => nivelFiabilidad(ctx.manifest()?.especies.find((e) => e.id === id)?.fiabilidad);

function textoLejania(p: { lat: number; lon: number }): string {
  const yo = ctx.posicion();
  const km = distanciaM(yo ?? MARBELLA, p) / 1000;
  const n = km < 10 ? km.toLocaleString('es-ES', { maximumFractionDigits: 1 }) : Math.round(km).toLocaleString('es-ES');
  return `a ${n} km ${yo ? 'de ti' : 'de Marbella'} en línea recta`;
}

function boton(texto: string, f: () => void, clase = 'btn') {
  const b = document.createElement('button'); b.type = 'button'; b.className = clase; b.textContent = texto; b.onclick = f;
  return b;
}

function miniatura(id: string): HTMLElement {
  const caja = document.createElement('span'); caja.className = 'miniatura-especie'; caja.setAttribute('aria-hidden', 'true');
  const e = ctx.manifest()?.especies.find((x) => x.id === id);
  const url = e ? datosEspecie(e).miniatura : null;
  if (url) {
    const img = document.createElement('img'); img.alt = ''; img.decoding = 'async'; img.loading = 'lazy'; img.width = 128; img.height = 128;
    img.onerror = () => { img.remove(); caja.classList.add('sin-foto'); caja.innerHTML = '<svg class="ico"><use href="#i-seta"/></svg>'; };
    img.src = url; caja.append(img);
  } else { caja.classList.add('sin-foto'); caja.innerHTML = '<svg class="ico"><use href="#i-seta"/></svg>'; }
  return caja;
}

/** Una fila de top: una o varias setas en el mismo sitio. */
function fila(principal: Entrada, entradas: Entrada[], pos: number): HTMLLIElement {
  const s = principal.sitio;
  const li = document.createElement('li'); li.className = 'top-fila';
  li.dataset.especies = entradas.map((e) => e.especie).join(' ');
  li.dataset.estado = principal.estado; li.dataset.dificultad = principal.dificultad; li.dataset.puntuacion = String(principal.puntuacion);
  li.dataset.id = String(s.id);
  const cab = document.createElement('div'); cab.className = 'tf-cab';
  const num = document.createElement('span'); num.className = 'tf-pos'; num.textContent = String(pos);
  const minis = document.createElement('span'); minis.className = 'tf-minis';
  for (const e of entradas.slice(0, 3)) minis.append(miniatura(e.especie));
  const tit = document.createElement('div'); tit.className = 'tf-tit';
  const b = document.createElement('b'); b.textContent = entradas.map((e) => nombre(e.especie)).join(' · ');
  const est = document.createElement('span'); est.className = 'tf-estado';
  est.textContent = entradas.length > 1
    ? entradas.map((e) => `${ICONO_ESTADO[e.estado]} ${NOMBRE_ESTADO[e.estado]}`).filter((t, i, a) => a.indexOf(t) === i).join(' / ')
    : `${ICONO_ESTADO[principal.estado]} ${NOMBRE_ESTADO[principal.estado]}`;
  tit.append(b, est);
  const pts = document.createElement('span'); pts.className = 'tf-puntos';
  pts.innerHTML = `<b>${principal.puntuacion}</b><small>de 100</small>`;
  pts.title = 'Puntuación del sitio para ese día: calidad del monte, semáforo y fiabilidad del mapa';
  cab.append(num, minis, tit, pts);
  const meta = document.createElement('p'); meta.className = 'tf-meta';
  const dif = document.createElement('span'); dif.className = `insignia-dif dif-${principal.dificultad}`; dif.textContent = NOMBRE_DIFICULTAD[principal.dificultad];
  meta.append(`${textoTiempo(s.t_pie_min)} a pie · ${textoSubida(s.subida_m)} · `, dif, ` · ${textoLejania(s)}`);
  li.append(cab, meta);
  if (s.restringido) {
    const r = document.createElement('p'); r.className = 'chip-restriccion tf-restr';
    r.textContent = '⚠ Zona con autorización: recoger exige permiso';
    li.append(r);
  }
  const acc = document.createElement('div'); acc.className = 'tf-acciones';
  const esp = principal.especie;
  acc.append(boton('Ver en mapa', () => ctx.verEnMapa(esp, s.lat, s.lon)), boton('Ruta a pie', () => ctx.rutaAPie(esp, s.lat, s.lon), 'btn btn-primario'),
    boton('Cómo llegar en coche', () => ctx.coche(s.lat, s.lon)), boton('Guardar', () => ctx.guardar(esp, s.lat, s.lon)));
  li.append(acc);
  return li;
}

function vacio(ul: HTMLElement, texto: string) {
  const li = document.createElement('li'); li.className = 'vacio'; li.textContent = texto; ul.append(li);
}

function pintarDias(hoy: string, fecha: string) {
  const caja = $('#hoy-dias');
  caja.replaceChildren(...diasChips(hoy).map((f) => {
    const b = boton(etiquetaDia(hoy, f), () => elegirDia(f), 'chip');
    b.dataset.fecha = f;
    b.setAttribute('aria-pressed', String(f === fecha));
    b.classList.toggle('activa', f === fecha);
    return b;
  }));
  const inp = $<HTMLInputElement>('#hoy-fecha');
  inp.min = hoy; inp.max = sumarDiasMax(hoy); inp.value = fecha;
  const c = confianza(hoy, fecha);
  const el = $('#hoy-confianza');
  el.dataset.confianza = c;
  el.replaceChildren();
  const b = document.createElement('b'); b.textContent = `Confianza ${c}`;
  el.append(b, ` · ${etiquetaDia(hoy, fecha) === 'hoy' ? 'hoy' : `${etiquetaDia(hoy, fecha)} (${fecha.slice(8, 10)}/${fecha.slice(5, 7)})`}. ${TEXTO_CONFIANZA[c]}`);
}

export function elegirDia(f: string) {
  fechaSel = acotarDia(ctx.hoy(), f);
  pintarHoy();
}

function opciones(fecha: string): Opciones {
  const cache = new Map<string, ResultadoSemaforo | null>();
  return {
    estadoEn: (e, id) => {
      const k = `${e}:${id}`;
      if (!cache.has(k)) cache.set(k, ctx.estadoPunto(id, e, fecha));
      return cache.get(k)?.estado ?? null;
    },
    fiabilidad: fiab,
    maxDificultad: maxDificultad(),
  };
}

async function pintarTopEspecie(datos: SitiosJson | null, o: Opciones) {
  const sel = $<HTMLSelectElement>('#hoy-especie');
  const ul = $('#top-especie');
  ul.replaceChildren();
  const id = sel.value;
  const top = datos ? topEspecie(datos, id, o, 10) : [];
  if (!datos) vacio(ul, 'Esta versión de los mapas no trae sitios candidatos.');
  else if (!top.length) vacio(ul, (datos.especies[id]?.length ?? 0) ? 'Ningún sitio con esa dificultad. Prueba a subir el máximo.' : 'Sin sitios candidatos para esta seta.');
  top.forEach((e, i) => ul.append(fila(e, [e], i + 1)));
  if (ultimo) { ultimo.especie = id; ultimo.top = top; }
  $('#hoy-ver-ficha').hidden = !(await ctx.hayFicha(id));
}

function pintarCalendario(datos: SitiosJson | null, fecha: string): FilaCalendario[] {
  const m = ctx.manifest();
  const caja = $('#calendario');
  caja.replaceChildren();
  if (!m) return [];
  const mes = +fecha.slice(5, 7);
  const filas = ordenarCalendario(m.especies.map((e) => {
    const ids = [...new Set((datos?.especies[e.id] ?? []).slice(0, 10).map((s) => s.meteo_id))];
    const r = mejorResultado(ids.map((id) => ctx.estadoPunto(id, e.id, fecha)));
    return { id: e.id, fiabilidad: nivelFiabilidad(e.fiabilidad), estado: estadoCalendario(fecha, e.tiempo?.meses ?? [], r), meses: e.tiempo?.meses ?? [] };
  }));
  const cab = document.createElement('div'); cab.className = 'cal-cab'; cab.setAttribute('aria-hidden', 'true');
  const vacioN = document.createElement('span'); cab.append(vacioN);
  const ms = document.createElement('span'); ms.className = 'cal-meses';
  MESES_CORTOS.forEach((t, i) => { const x = document.createElement('i'); x.textContent = t[0].toUpperCase(); if (i + 1 === mes) x.className = 'actual'; ms.append(x); });
  cab.append(ms);
  const ol = document.createElement('ol'); ol.className = 'cal-lista';
  for (const f of filas) {
    const li = document.createElement('li');
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cal-fila';
    b.dataset.especie = f.id; b.dataset.clase = f.estado.clase;
    const txt = document.createElement('span'); txt.className = 'cal-texto';
    const n = document.createElement('b'); n.textContent = nombre(f.id);
    const st = document.createElement('span'); st.className = 'cal-estado'; st.textContent = f.estado.texto;
    txt.append(n, st);
    const tira = document.createElement('span'); tira.className = 'cal-meses';
    tira.setAttribute('aria-label', `Temporada: ${f.meses.length ? [...f.meses].sort((a, c) => a - c).map((x) => MESES_CORTOS[x - 1]).join(', ') : 'sin datos'}`);
    for (let i = 1; i <= 12; i++) {
      const x = document.createElement('i');
      if (f.meses.includes(i)) x.classList.add('si');
      if (i === mes) x.classList.add('actual');
      tira.append(x);
    }
    b.append(txt, tira);
    b.onclick = () => {
      const sel = $<HTMLSelectElement>('#hoy-especie');
      sel.value = f.id;
      sel.dispatchEvent(new Event('change'));
      $('#tit-top-especie').scrollIntoView({ block: 'start' });
    };
    li.append(b); ol.append(li);
  }
  caja.append(cab, ol);
  return filas;
}

export async function pintarHoy() {
  const m = ctx.manifest();
  const hoy = ctx.hoy();
  const fecha = acotarDia(hoy, fechaSel);
  fechaSel = fecha;
  pintarDias(hoy, fecha);
  $('#hoy-meteo').textContent = ctx.textoMeteo();
  $<HTMLSelectElement>('#hoy-dificultad').value = maxDificultad() ?? '';
  const sel = $<HTMLSelectElement>('#hoy-especie');
  if (m && sel.options.length !== m.especies.length) {
    const previo = sel.value;
    sel.replaceChildren(...m.especies.map((e) => new Option(e.nombre, e.id)));
    sel.value = previo && m.especies.some((e) => e.id === previo) ? previo : (m.especies.find((e) => e.id.startsWith('boletus_'))?.id ?? m.especies[0]?.id ?? '');
  }
  const datos = await cargarSitios();
  if (fecha !== fechaSel) return;   // otro día elegido mientras cargaba
  const o = opciones(fecha);
  const n = topN();
  const general = datos && m ? topGeneral(datos, m.especies.map((e) => e.id), o, n) : [];
  const ul = $('#top-general');
  ul.replaceChildren();
  $('#hoy-general-nota').textContent = `Los ${n} mejores sitios de cada seta que no está en rojo ese día, juntos y ordenados (máximo 20). Si dos setas caen a menos de 300 m, van en la misma fila.`;
  if (!datos) vacio(ul, 'Esta versión de los mapas no trae sitios candidatos.');
  else if (!general.length) vacio(ul, 'Ese día todas las setas están en rojo o ningún sitio cumple la dificultad elegida.');
  general.forEach((f, i) => ul.append(fila(f.principal, f.entradas, i + 1)));
  ultimo = { fecha, confianza: confianza(hoy, fecha), general, especie: sel.value, top: [], calendario: [], sinSitios: !datos };
  await pintarTopEspecie(datos, o);
  ultimo.calendario = pintarCalendario(datos, fecha);
  document.body.dataset.hoy = fecha;
}

/** Resumen para el e2e (window.__setas.tops()). */
export function resumenHoy() {
  if (!ultimo) return null;
  const e = (x: Entrada) => ({ especie: x.especie, id: x.sitio.id, puntuacion: x.puntuacion, estado: x.estado, dificultad: x.dificultad, score: x.score });
  return { fecha: ultimo.fecha, confianza: ultimo.confianza, sinSitios: ultimo.sinSitios,
    general: ultimo.general.map((f) => ({ ...e(f.principal), especies: f.especies })), especie: ultimo.especie, top: ultimo.top.map(e),
    calendario: ultimo.calendario.map((f) => ({ id: f.id, clase: f.estado.clase, texto: f.estado.texto })) };
}

export function iniciarHoy(c: ContextoHoy) {
  ctx = c;
  $<HTMLInputElement>('#hoy-fecha').addEventListener('change', (ev) => {
    const v = (ev.target as HTMLInputElement).value;
    if (v) elegirDia(v);
  });
  $<HTMLSelectElement>('#hoy-dificultad').addEventListener('change', (ev) => {
    escribir(CLAVE_DIF, (ev.target as HTMLSelectElement).value);
    pintarHoy();
  });
  $<HTMLSelectElement>('#hoy-especie').addEventListener('change', () => {
    const fecha = acotarDia(ctx.hoy(), fechaSel);
    cargarSitios().then((d) => pintarTopEspecie(d, opciones(fecha)));
  });
  $('#hoy-ver-ficha').addEventListener('click', () => ctx.verFicha($<HTMLSelectElement>('#hoy-especie').value));
  $('#hoy-zona').addEventListener('click', () => ctx.irZona());
  const n = $<HTMLSelectElement>('#ajuste-top-n');
  n.value = String(topN());
  n.addEventListener('change', () => escribir(CLAVE_N, n.value));
  document.querySelectorAll<HTMLAnchorElement>('#p-hoy .saltos a').forEach((a) => a.addEventListener('click', (ev) => {
    ev.preventDefault();
    document.querySelector(a.getAttribute('href')!)?.scrollIntoView({ block: 'start' });
  }));
}
