// «Explorar aquí» (2026-10-25): lo común al análisis del barrido en la pantalla de Explorar y en «Mis observaciones»:
// aviso de privacidad (la primera vez), contexto del análisis (árboles de la región y perfil de la seta, de micro.json),
// envío con «Analizar», cola de pendientes y la lista de 8 direcciones con su puntuación y su mejor dirección.
//  - Nada sale a la red sin pulsar «Analizar» y aceptar el aviso (se recuerda en localStorage, con try/catch).
//  - La mejor dirección la calcula explorar.ts con factores reales; Gemini solo describe. La línea fija de abajo
//    recuerda que es una orientación por el aspecto del bosque y no garantiza setas.
//  - Cuando cambian las observaciones por detrás (se analizan las pendientes al volver la conexión) se emite
//    «setas:observaciones-cambiadas» en document para que las pantallas abiertas se repinten.
import { cardinalCorto, normalizar } from './brujula';
import { datosMicro } from './micro-datos';
import type { ManifestApp } from './manifest-region';
import type { PerfilMicro } from './micro';
import { ARBOLES_OBS, type Observacion } from './observaciones-datos';
import { guardarObservacion } from './observaciones';
import { analizar, analizarPendientes, urlExplorar, type ContextoAnalisis } from './explorar-red';
import { mejorDireccion, puntuarDirecciones } from './explorar';
import { urlWorker } from './gemini';

export interface ContextoResultado {
  manifest: () => ManifestApp | null;
  especies: () => { id: string; nombre: string }[];
  avisar: (texto: string) => void;
}

export const PRIVACIDAD = 'Las 8 fotos se envían a Google (Gemini) para describir el bosque. No se guardan en nuestro servidor.';
export const AVISO_ORIENTACION = 'Es una orientación por el aspecto del bosque, no garantiza setas.';
export const EVENTO_CAMBIO = 'setas:observaciones-cambiadas';
const CLAVE_PRIVACIDAD = 'setas:explorar-privacidad';
const E2E = new URLSearchParams(location.search).get('e2e') === '1';
const URL_WORKER = urlWorker(import.meta.env.VITE_WORKER_URL, E2E, (() => { try { return localStorage; } catch { return null; } })());

let ctx: ContextoResultado;
export const urlAnalisis = () => urlExplorar(URL_WORKER);

const privacidadAceptada = () => { try { return localStorage.getItem(CLAVE_PRIVACIDAD) === '1'; } catch { return false; } };
const recordarPrivacidad = () => { try { localStorage.setItem(CLAVE_PRIVACIDAD, '1'); } catch { /* sin almacenamiento: se vuelve a preguntar */ } };

/** Pide aceptar el aviso la primera vez. false = no se envía nada. */
export function aceptarPrivacidad(): boolean {
  if (privacidadAceptada()) return true;
  if (!confirm(`${PRIVACIDAD}\n\n¿Enviar?`)) return false;
  recordarPrivacidad();
  return true;
}

/** Perfil de la seta, árboles de la región y nombre de la seta, de micro.json (sin inventar nada si faltan). */
export async function contextoDeAnalisis(): Promise<{ perfiles: Record<string, PerfilMicro>; contextoDe: (o: Observacion) => ContextoAnalisis }> {
  const m = ctx.manifest();
  const d = m?.micro ? await datosMicro(m).catch(() => null) : null;
  const perfiles = d?.cab.perfiles ?? {};
  const hospedadores = new Set<string>();
  for (const p of Object.values(perfiles)) for (const a of Object.keys(p.arboles ?? {})) hospedadores.add(a);
  const arbolesRegion = ARBOLES_OBS.filter((a) => hospedadores.has(a) && a !== 'otro' && a !== 'no_se_ve');
  const nombres = new Map(ctx.especies().map((e) => [e.id, e.nombre]));
  return { perfiles, contextoDe: (o) => ({ especieNombre: nombres.get(o.especie) ?? '', arbolesRegion: [...arbolesRegion] }) };
}

export async function perfilDe(especie: string): Promise<PerfilMicro | null> {
  return (await contextoDeAnalisis()).perfiles[especie] ?? null;
}

/**
 * «Analizar»: aviso de privacidad la primera vez, envío y guardado. Devuelve la observación nueva (analizada, pendiente o
 * con error) o null si no se envió nada (sin Worker o sin aceptar el aviso).
 */
export async function analizarObservacion(o: Observacion): Promise<Observacion | null> {
  if (!urlAnalisis()) { ctx.avisar('El análisis con Gemini no está configurado en esta copia de la app.'); return null; }
  if (!aceptarPrivacidad()) return null;
  const { contextoDe } = await contextoDeAnalisis();
  const r = await analizar(o, contextoDe(o), urlAnalisis());
  await guardarObservacion(r);
  document.dispatchEvent(new CustomEvent(EVENTO_CAMBIO, { detail: { id: r.id } }));
  return r;
}

/** Analiza las pendientes si hay Worker y conexión (al abrir Explorar y al volver la red). */
export async function reintentarPendientes(): Promise<number> {
  if (!urlAnalisis() || (typeof navigator !== 'undefined' && navigator.onLine === false) || !privacidadAceptada()) return 0;
  const { contextoDe } = await contextoDeAnalisis();
  const n = await analizarPendientes(contextoDe, urlAnalisis()).catch((e) => { console.warn('pendientes', e); return 0; });
  document.dispatchEvent(new CustomEvent(EVENTO_CAMBIO, { detail: { id: null } }));
  if (n) ctx.avisar(n === 1 ? 'Se ha analizado 1 barrido pendiente.' : `Se han analizado ${n} barridos pendientes.`);
  return n;
}

export function iniciarAnalisis(c: ContextoResultado) {
  ctx = c;
  window.addEventListener('online', () => { void reintentarPendientes(); });
}

// ---------------------------------------------------------------- pintar

const nombreDir = (r: number) => `${cardinalCorto(r)} ${Math.round(normalizar(r)) % 360}°`;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, clase = '', texto?: string) => {
  const n = document.createElement(tag); if (clase) n.className = clase; if (texto != null) n.textContent = texto; return n;
};

/** Estado del análisis y, si lo hay, la lista de direcciones con su puntuación. Sustituye el contenido de `cont`. */
export function pintarResultado(cont: HTMLElement, o: Observacion, perfil: PerfilMicro | null) {
  cont.replaceChildren();
  if (o.estado === 'pendiente') { cont.append(el('p', 'ex-an-estado', 'Pendiente: se analizará con conexión.')); return; }
  if (o.estado === 'error') { cont.append(el('p', 'ex-an-estado ex-an-error', o.error || 'El análisis ha fallado. Prueba otra vez.')); return; }
  if (o.estado !== 'analizada') return;
  const ps = puntuarDirecciones(o, perfil, o.arbolSector);
  const mejor = mejorDireccion(ps);
  cont.append(el('p', 'ex-mejor-txt', mejor ? `Mejor dirección: ${nombreDir(mejor.rumbo)}` : 'Sin datos suficientes para elegir una dirección.'));
  const ul = el('ul', 'ex-res');
  ps.forEach((p, i) => {
    const li = el('li', 'ex-res-dir'); li.dataset.rumbo = String(p.rumbo); if (p === mejor) li.dataset.mejor = '1';
    const flecha = el('span', 'ex-flecha', '↑'); flecha.style.transform = `rotate(${p.rumbo}deg)`; flecha.setAttribute('aria-hidden', 'true');
    const cab = el('div', 'ex-res-cab');
    cab.append(el('b', '', nombreDir(p.rumbo)), el('span', 'ex-total', p.total === null ? 'sin dato' : String(Math.round(p.total))));
    const cuerpo = el('div', 'ex-res-cuerpo'); cuerpo.append(cab);
    cuerpo.append(el('div', 'ex-razones', p.razones.length ? p.razones.join(' · ') : 'Sin datos de esta dirección.'));
    const nota = o.direcciones[i]?.analisis?.notas;
    if (nota) cuerpo.append(el('div', 'ex-res-nota', nota));
    li.append(flecha, cuerpo);
    ul.append(li);
  });
  cont.append(ul, el('p', 'nota ex-orientacion', AVISO_ORIENTACION));
}

/** Mejor dirección de una observación analizada (null si no hay datos para elegir). */
export async function mejorDe(o: Observacion): Promise<{ rumbo: number; total: number } | null> {
  if (o.estado !== 'analizada') return null;
  const m = mejorDireccion(puntuarDirecciones(o, await perfilDe(o.especie), o.arbolSector));
  return m ? { rumbo: m.rumbo, total: m.total! } : null;
}
