// «Pregunta a Claude»: hoja inferior sobre el mapa con el chat (spec docs/specs/2026-10-20-pregunta-a-claude-design.md §7).
// La lógica del bucle está en chat.ts y las herramientas en chat-herramientas.ts; aquí solo el DOM.
//  - Las tarjetas de sitio se pintan SOLO con los resultados de las herramientas (Tarjeta), nunca con el texto del modelo.
//  - El pie de seguridad lo pone la app bajo cada respuesta, no el modelo.
//  - Sin conexión no se envía: el botón queda atenuado («Necesita conexión»).
import './chat.css';
import { Hoja } from './hoja';
import {
  AVISO_CHAT, MENSAJE_SIN_CONEXION, borrarConversacion, construirContexto, conversacionNueva, enviar, guardarConversacion, leerConversacion,
  urlChat, type Conversacion, type DatosContexto, type Turno,
} from './chat';
import { ejecutarHerramienta, type AccionChat, type ContextoHerramientas, type Tarjeta } from './chat-herramientas';
import { NOMBRE_ESTADO } from './zona';
import { NOMBRE_DIFICULTAD } from './ruta';
import { textoSubida, textoTiempo, urlGoogleCoche } from './acceso';

export interface ContextoChatUi {
  /** URL del Worker (la de Gemini o la base); '' si esta copia de la app no lo tiene. */
  urlWorker: () => string;
  /** Contexto de las herramientas con los datos de este momento. */
  herramientas: () => Promise<ContextoHerramientas>;
  datosContexto: (pestana: string) => DatosContexto;
  pestanaActual: () => string;
  /** Lleva la app a la pestaña del mapa (el chat vive sobre él). */
  irAlMapa: () => void;
  /** Marca y encuadra puntos; `abajoPx` = lo que tapa la hoja por abajo. */
  mostrarEnMapa: (puntos: { lat: number; lon: number }[], abajoPx: number) => void;
  limpiarMapa: () => void;
  borrarSitio: (id: string) => Promise<void>;
  abrirEnlace: (url: string) => void;
  avisar: (t: string, ms?: number) => void;
}

export const SUGERENCIAS = ['¿Adónde voy hoy?', 'Algo nuevo cerca', '¿Qué tal mañana?', 'Resume mi última ruta'];
const RETEN_MEDIO = 430;
const RETEN_BAJO = 150;

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
let ctx: ContextoChatUi;
let hoja: Hoja | null = null;
let conv: Conversacion = conversacionNueva();
let cargada = false;
let ocupado = false;
let error = '';
let pestanaOrigen = 'mapa';
let pensando: { fase: 'pensando' | 'herramientas'; pregunta: string } | null = null;

// ---------------------------------------------------------------- estado de los botones

function motivoNoDisponible(): string {
  if (!ctx.urlWorker()) return 'Sin configurar en esta copia de la app';
  if (!navigator.onLine) return 'Necesita conexión';
  return '';
}
function pintarBotones() {
  const motivo = motivoNoDisponible();
  for (const b of [$('#btn-chat'), $('#hoy-pregunta'), $('#tz-ia')]) {
    b.setAttribute('aria-disabled', String(!!motivo));
    b.classList.toggle('atenuado', !!motivo);
    b.title = motivo ? `Pregunta a Claude: ${motivo}` : 'Pregunta a Claude';
    b.dataset.motivo = motivo;
  }
  $('#btn-chat').setAttribute('aria-label', motivo ? `Pregunta a Claude: ${motivo}` : 'Pregunta a Claude');
  $('#tz-ia span').textContent = motivo ? `Preguntar a la IA · ${motivo}` : 'Preguntar a la IA';
  $('#hoy-pregunta span').textContent = motivo ? `Pregunta a Claude · ${motivo}` : 'Pregunta a Claude';
  if (!$('#chat').hidden) pintarEstado();
}

// ---------------------------------------------------------------- texto del modelo (sin HTML: solo nodos de texto)

/** Párrafos, listas con guion y **negrita** del texto del modelo, construidos con nodos de texto. */
export function nodosDeTexto(texto: string): HTMLElement[] {
  const inline = (el: HTMLElement, t: string) => {
    t.split(/(\*\*[^*]+\*\*)/).filter(Boolean).forEach((p) => {
      if (/^\*\*[^*]+\*\*$/.test(p)) { const b = document.createElement('b'); b.textContent = p.slice(2, -2); el.append(b); } else el.append(p.replace(/\*\*/g, ''));
    });
  };
  const salida: HTMLElement[] = [];
  let lista: HTMLUListElement | null = null;
  for (const linea of texto.split('\n')) {
    const item = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(linea);
    if (item) {
      if (!lista) { lista = document.createElement('ul'); salida.push(lista); }
      const li = document.createElement('li'); inline(li, item[1]); lista.append(li);
      continue;
    }
    lista = null;
    if (!linea.trim()) continue;
    const p = document.createElement('p'); inline(p, linea.replace(/^#+\s*/, '')); salida.push(p);
  }
  return salida;
}

// ---------------------------------------------------------------- tarjetas

function boton(texto: string, f: () => void, clase = 'btn') {
  const b = document.createElement('button'); b.type = 'button'; b.className = clase; b.textContent = texto; b.onclick = f;
  return b;
}
const km = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 });

function tarjetaDom(t: Tarjeta): HTMLElement {
  const li = document.createElement('li'); li.className = 'chat-tarjeta'; li.dataset.id = t.id; li.dataset.estado = t.semaforo;
  const cab = document.createElement('div'); cab.className = 'ct-cab';
  const nombre = document.createElement('b'); nombre.className = 'ct-nombre'; nombre.textContent = [t.seta, ...t.otras_setas].join(' · ');
  const est = document.createElement('span'); est.className = 'chip-estado'; est.dataset.estado = t.semaforo; est.textContent = NOMBRE_ESTADO[t.semaforo];
  cab.append(nombre, est);
  const datos = document.createElement('p'); datos.className = 'ct-datos';
  const punt = document.createElement('b'); punt.textContent = `${t.puntuacion}`;
  datos.append(punt, `/100 · ${NOMBRE_DIFICULTAD[t.dificultad]} · ${textoTiempo(t.a_pie_min)} a pie · ${textoSubida(t.subida_m)}`
    + (t.distancia_km !== null ? ` · a ${km(t.distancia_km)} km` : ''));
  const tit = document.createElement('p'); tit.className = 'chip-titularidad ct-titularidad'; tit.dataset.clase = t.titularidad.clase;
  const tb = document.createElement('b'); tb.textContent = t.titularidad.texto; tit.append(tb);
  li.append(cab, datos, tit);
  if (t.restriccion) { const r = document.createElement('p'); r.className = 'chip-restriccion ct-restriccion'; r.textContent = t.restriccion; li.append(r); }
  if (t.aparcamiento) { const a = document.createElement('p'); a.className = 'ct-aparcar'; a.textContent = `Aparcar en ${t.aparcamiento.via}`; li.append(a); }
  if (t.por_que_nuevo) { const n = document.createElement('p'); n.className = 'ct-nuevo'; n.textContent = t.por_que_nuevo; li.append(n); }
  if (t.citas) { const c = document.createElement('p'); c.className = 'ct-citas nota'; c.textContent = t.citas; li.append(c); }
  const det = document.createElement('details'); det.className = 'ct-razon';
  const sm = document.createElement('summary'); sm.textContent = 'Por qué';
  const rz = document.createElement('p'); rz.textContent = t.razon;
  det.append(sm, rz); li.append(det);
  const bs = document.createElement('div'); bs.className = 'ct-botones';
  const ver = boton('Ver', () => mostrar([{ lat: t.lat, lon: t.lon }]), 'btn ct-ver');
  ver.setAttribute('aria-label', `Ver ${t.seta} en el mapa`);
  const ir = boton('Ir', () => ctx.abrirEnlace(urlGoogleCoche(t.aparcamiento?.lat ?? t.lat, t.aparcamiento?.lon ?? t.lon)), 'btn btn-primario ct-ir');
  ir.title = t.aparcamiento ? 'En coche hasta el aparcamiento (Google Maps)' : 'En coche hasta el sitio (Google Maps)';
  ir.setAttribute('aria-label', `Ir a ${t.seta} en coche con Google Maps`);
  const gu = boton('Guardar', () => guardar(t, gu), 'btn ct-guardar');
  gu.setAttribute('aria-label', `Guardar ${t.seta} en Mis sitios`);
  bs.append(ver, ir, gu); li.append(bs);
  return li;
}

function accionDom(a: AccionChat, turno: number, i: number): HTMLElement {
  const d = document.createElement('div'); d.className = 'chat-accion'; d.dataset.tipo = a.tipo;
  const t = document.createElement('span'); t.textContent = a.deshecho ? `${a.texto} (deshecho)` : a.texto;
  d.append(t);
  if (!a.deshecho) d.append(boton('Deshacer', () => deshacer(turno, i), 'btn ca-deshacer'));
  return d;
}

// ---------------------------------------------------------------- pintado

function turnoDom(t: Turno, idx: number): HTMLElement {
  if (t.rol === 'usuario') { const p = document.createElement('p'); p.className = 'chat-usuario'; p.textContent = t.texto; return p; }
  const art = document.createElement('article'); art.className = 'chat-asistente';
  const b = document.createElement('div'); b.className = 'chat-burbuja'; b.append(...nodosDeTexto(t.texto));
  if (t.cortado) { const n = document.createElement('p'); n.className = 'nota'; n.textContent = 'La respuesta se cortó por longitud; pídele que continúe.'; b.append(n); }
  art.append(b);
  if (t.tarjetas.length) {
    const ul = document.createElement('ul'); ul.className = 'chat-tarjetas'; ul.setAttribute('aria-label', 'Sitios de la respuesta');
    ul.append(...t.tarjetas.map(tarjetaDom)); art.append(ul);
  }
  t.acciones.forEach((a, i) => art.append(accionDom(a, idx, i)));
  const aviso = document.createElement('p'); aviso.className = 'chat-aviso'; aviso.setAttribute('role', 'note');
  aviso.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-alerta"/></svg>';
  aviso.append(AVISO_CHAT); art.append(aviso);
  return art;
}

function pintar(desplazar = true) {
  const cont = $('#chat-mensajes');
  cont.replaceChildren();
  if (!conv.turnos.length && !pensando) {
    const p = document.createElement('p'); p.className = 'chat-vacio';
    p.textContent = 'Pregúntame por los mejores sitios, el tiempo de un día, tus rutas o algo nuevo cerca. Uso los datos de la app: si no los tengo, te lo digo.';
    cont.append(p);
  }
  conv.turnos.forEach((t, i) => cont.append(turnoDom(t, i)));
  if (pensando) {
    const u = document.createElement('p'); u.className = 'chat-usuario'; u.textContent = pensando.pregunta; cont.append(u);
    const p = document.createElement('p'); p.className = 'chat-pensando'; p.setAttribute('role', 'status');
    p.textContent = pensando.fase === 'herramientas' ? 'Consultando los datos de la app…' : 'Pensando…';
    cont.append(p);
  }
  if (error) { const e = document.createElement('p'); e.className = 'chat-error'; e.setAttribute('role', 'alert'); e.textContent = error; cont.append(e); }
  if (desplazar) cont.scrollTop = cont.scrollHeight;
  pintarEstado();
}

function pintarEstado() {
  const sin = !navigator.onLine;
  $('#chat-cupo').textContent = conv.restantes === null ? '' : `quedan ${conv.restantes} hoy`;
  $('#chat-estado').textContent = sin ? MENSAJE_SIN_CONEXION : '';
  const env = $<HTMLButtonElement>('#chat-enviar');
  env.disabled = ocupado;
  env.setAttribute('aria-disabled', String(ocupado || sin));
  env.classList.toggle('atenuado', sin);
  $<HTMLTextAreaElement>('#chat-texto').disabled = ocupado;
  $<HTMLButtonElement>('#chat-nueva').disabled = ocupado;
  $('#chat-sugerencias').hidden = !!conv.turnos.length || ocupado;
}

function pintarSugerencias() {
  $('#chat-sugerencias').replaceChildren(...SUGERENCIAS.map((s) => boton(s, () => { void enviarTexto(s); }, 'chip chat-sugerencia')));
}

// ---------------------------------------------------------------- mapa

/** Marca y encuadra los puntos dejando la hoja a media altura para que se vean detrás. */
function mostrar(puntos: { lat: number; lon: number }[]) {
  if (!puntos.length) return;
  hoja?.ir(1);
  const el = $('#chat'), mapa = document.querySelector('#mapa');
  const nav = document.querySelector('.pestanas')?.getBoundingClientRect();
  const visible = Math.min(RETEN_MEDIO, el.offsetHeight);
  const fondo = mapa?.getBoundingClientRect().bottom ?? window.innerHeight;
  const techo = (nav?.top ?? fondo) - 6 - visible;       // borde superior de la hoja a media altura
  ctx.mostrarEnMapa(puntos, Math.max(0, fondo - techo) + 12);
}

// ---------------------------------------------------------------- acciones

async function herramientasCtx(): Promise<ContextoHerramientas> {
  const c = await ctx.herramientas();
  return { ...c, mostrarEnMapa: (p) => { mostrar(p); c.mostrarEnMapa(p); } };
}

async function guardar(t: Tarjeta, bt: HTMLButtonElement) {
  bt.disabled = true;
  try {
    const r = await ejecutarHerramienta('guardar_en_mis_sitios', { sitio_id: t.id, nota: null, estrellas: null }, await herramientasCtx());
    if (r.error) { ctx.avisar('No se pudo guardar el sitio.'); return; }
    if (!r.acciones.length) { ctx.avisar('Ya estaba en Mis sitios'); return; }
    // La acción cuelga de la respuesta que contiene esa tarjeta.
    let i = -1;
    for (let k = conv.turnos.length - 1; k >= 0; k--) { const u = conv.turnos[k]; if (u.rol === 'asistente' && u.tarjetas.some((x) => x.id === t.id)) { i = k; break; } }
    const turno = conv.turnos[i];
    if (turno?.rol === 'asistente') turno.acciones.push(...r.acciones);
    await guardarConversacion(conv);
    pintar(false);
    ctx.avisar('Guardado en Mis sitios');
  } finally { bt.disabled = false; }
}

async function deshacer(turno: number, i: number) {
  const t = conv.turnos[turno];
  const a = t?.rol === 'asistente' ? t.acciones[i] : null;
  if (!a || a.deshecho) return;
  await ctx.borrarSitio(a.sitioId);
  a.deshecho = true;
  await guardarConversacion(conv);
  pintar(false);
  ctx.avisar('Sitio quitado de Mis sitios');
}

async function enviarTexto(texto: string) {
  const q = texto.trim();
  if (!q || ocupado) return;
  if (!navigator.onLine) { ctx.avisar(MENSAJE_SIN_CONEXION); pintarEstado(); return; }
  const url = ctx.urlWorker();
  if (!url) { error = 'El chat no está configurado en esta copia de la app.'; pintar(); return; }
  ocupado = true; error = '';
  pensando = { fase: 'pensando', pregunta: q };
  $<HTMLTextAreaElement>('#chat-texto').value = ''; ajustarAlto();
  pintar();
  const salida = await enviar(conv, q, {
    url: urlChat(url),
    enLinea: () => navigator.onLine,
    contexto: () => construirContexto({ ...ctx.datosContexto(pestanaOrigen), enLinea: navigator.onLine }),
    ejecutar: async (n, e) => ejecutarHerramienta(n, e, await herramientasCtx()),
    alProgreso: (fase) => { if (pensando) { pensando.fase = fase; pintar(); } },
  });
  ocupado = false; pensando = null;
  if (salida.ok) await guardarConversacion(conv);
  else { error = salida.error; $<HTMLTextAreaElement>('#chat-texto').value = q; ajustarAlto(); }
  pintar();
}

function ajustarAlto() {
  const t = $<HTMLTextAreaElement>('#chat-texto');
  t.style.height = 'auto';
  // scrollHeight no cuenta el borde: sin sumarlo, la última línea queda recortada.
  t.style.height = `${Math.min(t.scrollHeight + (t.offsetHeight - t.clientHeight), 240)}px`;
}

async function nueva() {
  if (ocupado) return;
  conv = conversacionNueva(); error = '';
  await borrarConversacion();
  ctx.limpiarMapa();
  pintar();
}

// ---------------------------------------------------------------- abrir / cerrar

/** `precarga`: pregunta que se deja escrita (y editable) en la caja, p. ej. desde la tarjeta de un punto del mapa. */
export async function abrirChat(desde?: string, precarga?: string) {
  if (motivoNoDisponible()) { ctx.avisar(motivoNoDisponible()); return; }
  pestanaOrigen = desde ?? ctx.pestanaActual();
  ctx.irAlMapa();
  if (!cargada) { cargada = true; conv = await leerConversacion(); }
  pintar();
  $('#chat').hidden = false;
  if (precarga) {
    const t = $<HTMLTextAreaElement>('#chat-texto');
    t.value = precarga; ajustarAlto();
    hoja?.expandir();   // a media altura la caja de texto queda tapada
  }
}
export function cerrarChat() { $('#chat').hidden = true; }

/** Estado para el e2e (window.__setas.chat). */
export const estadoChat = () => ({ abierto: !$('#chat').hidden, ocupado, error, turnos: conv.turnos.map((t) => ({ ...t })), mensajes: conv.mensajes.length, restantes: conv.restantes });

export function iniciarChat(c: ContextoChatUi) {
  ctx = c;
  const el = $('#chat');
  hoja = new Hoja(el, $('#chat .hoja-asa'), { retenes: (h) => [Math.min(h, RETEN_BAJO), Math.min(h, RETEN_MEDIO), h], cerrable: true });
  $('#chat .ta-cab').addEventListener('click', () => hoja?.expandir());
  $('#chat-cerrar').addEventListener('click', cerrarChat);
  $('#chat-nueva').addEventListener('click', () => { void nueva(); });
  pintarSugerencias();
  const form = $<HTMLFormElement>('#chat-form'), texto = $<HTMLTextAreaElement>('#chat-texto');
  form.addEventListener('submit', (ev) => { ev.preventDefault(); void enviarTexto(texto.value); });
  texto.addEventListener('input', ajustarAlto);
  texto.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); void enviarTexto(texto.value); }
  });
  const abrir = (desde?: string) => { void abrirChat(desde); };
  $('#btn-chat').addEventListener('click', () => abrir('mapa'));
  $('#hoy-pregunta').addEventListener('click', () => abrir('hoy'));
  // «Preguntar a la IA» de la tarjeta del punto lo abre main.ts (lleva la pregunta con los datos del punto).
  window.addEventListener('online', pintarBotones);
  window.addEventListener('offline', pintarBotones);
  pintarBotones();
}
