// «Mis observaciones» (2026-10-25): lista de los barridos de «Explorar aquí» guardados en el teléfono, con resumen,
// detalle (8 fotos con su rumbo y análisis, hallazgo y nota editables, «Analizar», «Ver en el mapa», «Borrar») y
// «Exportar GeoJSON» (sin fotos). La entrada está en Mis sitios, debajo de Mis rutas. Datos y resumen: observaciones-datos.ts,
// observaciones-resumen.ts; el análisis y la lista de direcciones, explorar-resultado.ts (el mismo que en Explorar).
import './campo.css';
import { cardinalCorto, normalizar } from './brujula';
import { MAX_NOTA } from './grabacion';
import { aGeoJSON, type Observacion } from './observaciones-datos';
import { borrarObservacion, guardarObservacion, listarObservaciones } from './observaciones';
import { nombreArchivoGeoJSON, resumenObservaciones, textoResumen } from './observaciones-resumen';
import { analizarObservacion, EVENTO_CAMBIO, mejorDe, perfilDe, pintarResultado, urlAnalisis } from './explorar-resultado';

export interface ContextoObservaciones {
  especies: () => { id: string; nombre: string }[];
  avisar: (texto: string) => void;
  /** Lleva el mapa principal a ese punto (cierra «Mis observaciones» antes). */
  verEnMapa: (p: { lat: number; lon: number; especie: string }) => void;
}

let ctx: ContextoObservaciones;
let dlg: HTMLDialogElement;
let urls: string[] = [];
let vista: { tipo: 'lista' } | { tipo: 'detalle'; id: string } = { tipo: 'lista' };

const $ = <T extends HTMLElement = HTMLElement>(s: string) => dlg.querySelector(s) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, clase = '', texto?: string) => {
  const n = document.createElement(tag); if (clase) n.className = clase; if (texto != null) n.textContent = texto; return n;
};
const boton = (texto: string, f: () => void, clase = 'btn') => { const b = el('button', clase, texto); b.type = 'button'; b.onclick = f; return b; };
const nombreEspecie = (id: string) => ctx.especies().find((e) => e.id === id)?.nombre ?? (id || 'sin seta');
const nombreDir = (r: number) => `${cardinalCorto(r)} ${Math.round(normalizar(r)) % 360}°`;
const fecha = (t: number) => { const d = new Date(t); return `${d.toLocaleDateString('es-ES')} ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`; };
const url = (b: Blob) => { const u = URL.createObjectURL(b); urls.push(u); return u; };
const soltarUrls = () => { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; };
const TEXTO_HALLAZGO = { no_mirado: 'Sin mirar', nada: 'No encontraste nada', encontrada: 'Encontraste algo' } as const;

function html() {
  const d = document.createElement('dialog');
  d.id = 'dlg-observaciones'; d.className = 'dlg dlg-ir dlg-obs'; d.setAttribute('aria-labelledby', 'ob-titulo');
  d.innerHTML = `
    <div class="ex-cab ob-cab">
      <h2 id="ob-titulo">Mis observaciones</h2>
      <span></span>
      <button id="ob-cerrar" class="btn" type="button">Cerrar</button>
    </div>
    <div id="ob-cuerpo" class="ob-cuerpo"></div>`;
  document.body.append(d);
  return d;
}

// ---------------------------------------------------------------- lista

async function pintarLista() {
  const cuerpo = $('#ob-cuerpo');
  const l = await listarObservaciones().catch(() => [] as Observacion[]);
  if (vista.tipo !== 'lista') return;
  soltarUrls();
  const nodos: HTMLElement[] = [];
  const r = resumenObservaciones(l);
  const res = el('div', 'ob-resumen'); res.id = 'ob-resumen';
  res.append(...textoResumen(r).split('\n').map((t) => el('p', '', t)));
  if (r.distinto.length) {
    const ul = el('ul', 'ob-distinto');
    for (const c of r.distinto) ul.append(el('li', '', `${fecha(c.t)}: ${c.textos.join('; ')}`));
    res.append(ul);
  }
  const exp = boton('Exportar GeoJSON', () => { void exportar(); }, 'btn btn-primario'); exp.id = 'ob-exportar'; exp.disabled = !l.length;
  nodos.push(res, exp);
  if (!l.length) nodos.push(el('p', 'nota ob-vacio', 'Aún no hay observaciones. Se crean con «Explorar aquí» en Modo campo.'));
  const ul = el('ul', 'lista ob-lista'); ul.id = 'ob-lista';
  for (const o of l) {
    const li = el('li', 'sitio ob-item'); li.dataset.id = o.id;
    const foto = o.direcciones.find((d) => d.foto)?.foto;
    const mini = el('div', 'ob-mini');
    if (foto) { const im = el('img'); im.alt = ''; im.src = url(foto); mini.append(im); }
    const t = el('div', 'meta', `${fecha(o.t)} · ${nombreEspecie(o.especie)}`);
    const d = el('div', 'txt ob-datos', [TEXTO_HALLAZGO[o.hallazgo] + (o.hallazgo === 'encontrada' && o.especieHallada ? `: ${nombreEspecie(o.especieHallada)}` : ''),
      o.modelo ? `modelo ${o.modelo.idon}/100 aquí` : 'sin modelo aquí',
      o.estado === 'pendiente' ? 'análisis pendiente' : ''].filter(Boolean).join(' · '));
    const cab = el('div', 'ob-item-cab'); cab.append(t, d);
    const mejor = el('div', 'txt ob-mejor');
    void mejorDe(o).then((m) => { if (m) mejor.textContent = `Mejor: ${nombreDir(m.rumbo)}`; }).catch(() => {});
    cab.append(mejor);
    const abrir = boton('Ver', () => { vista = { tipo: 'detalle', id: o.id }; void pintar(); }, 'btn ob-ver');
    abrir.setAttribute('aria-label', `Ver la observación del ${fecha(o.t)}`);
    li.append(mini, cab, abrir);
    ul.append(li);
  }
  nodos.push(ul);
  cuerpo.replaceChildren(...nodos);
}

async function exportar() {
  const l = await listarObservaciones();
  const u = URL.createObjectURL(new Blob([JSON.stringify(aGeoJSON(l))], { type: 'application/geo+json' }));
  const a = el('a'); a.href = u; a.download = nombreArchivoGeoJSON(new Date());
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 10000);
}

// ---------------------------------------------------------------- detalle

async function pintarDetalle(id: string) {
  const cuerpo = $('#ob-cuerpo');
  const o = (await listarObservaciones().catch(() => [] as Observacion[])).find((x) => x.id === id);
  if (vista.tipo !== 'detalle' || vista.id !== id) return;
  soltarUrls();
  if (!o) { vista = { tipo: 'lista' }; void pintar(); return; }
  const nodos: HTMLElement[] = [];
  const volver = boton('← Volver a la lista', () => { vista = { tipo: 'lista' }; void pintar(); }); volver.id = 'ob-volver';
  nodos.push(volver, el('h3', 'ob-fecha', `${fecha(o.t)} · ${nombreEspecie(o.especie)}`),
    el('p', 'nota', `${o.modelo ? `El modelo daba ${o.modelo.idon}/100 en esta celda` : 'Sin datos del modelo en este punto'} · GPS ±${Math.round(o.precGps)} m`));
  // Fotos con su rumbo
  const gal = el('div', 'ob-fotos'); gal.setAttribute('role', 'group'); gal.setAttribute('aria-label', 'Fotos por dirección');
  for (const d of o.direcciones) {
    const f = el('figure', 'ob-foto');
    if (d.foto) { const im = el('img'); im.alt = `Foto hacia ${nombreDir(d.rumbo)}`; im.src = url(d.foto); f.append(im); }
    f.append(el('figcaption', '', nombreDir(d.rumbo)));
    gal.append(f);
  }
  nodos.push(gal);
  // Análisis
  const an = el('div', 'ex-an-res'); an.id = 'ob-analisis';
  const perfil = o.estado === 'analizada' ? await perfilDe(o.especie).catch(() => null) : null;
  pintarResultado(an, o, perfil);
  nodos.push(an);
  if (urlAnalisis() && o.estado !== 'analizada') {
    const b = boton(o.estado === 'error' ? 'Probar otra vez' : o.estado === 'pendiente' ? 'Analizar ahora' : 'Analizar', async () => {
      b.disabled = true;
      try { await analizarObservacion(o); } catch (e) { console.warn('analizar', e); ctx.avisar('No se pudo analizar el barrido. Prueba otra vez.'); }
      if (vista.tipo === 'detalle' && vista.id === id) void pintarDetalle(id);
    }, 'btn btn-primario btn-ancho'); b.id = 'ob-analizar';
    nodos.push(b);
  }
  // Hallazgo y nota
  const sel = el('select'); sel.id = 'ob-h';
  for (const [v, t] of Object.entries(TEXTO_HALLAZGO)) sel.append(Object.assign(el('option'), { value: v, textContent: t }));
  sel.value = o.hallazgo;
  const esp = el('select'); esp.id = 'ob-h-especie';
  esp.append(...ctx.especies().map((e) => Object.assign(el('option'), { value: e.id, textContent: e.nombre })), Object.assign(el('option'), { value: '', textContent: 'Otra cosa / no lo sé' }));
  esp.value = ctx.especies().some((e) => e.id === o.especieHallada) ? o.especieHallada : '';
  const nota = el('textarea'); nota.id = 'ob-nota'; nota.rows = 3; nota.maxLength = MAX_NOTA; nota.value = o.nota;
  const campo = (etq: string, c: HTMLElement) => { const l = el('label', 'campo'); l.append(el('span', 'etq', etq), c); return l; };
  const campoEsp = campo('¿Qué encontraste?', esp);
  const ajustar = () => { campoEsp.hidden = sel.value !== 'encontrada'; };
  sel.onchange = ajustar; ajustar();
  const guardar = boton('Guardar cambios', async () => {
    const n: Observacion = { ...o, hallazgo: sel.value as Observacion['hallazgo'], especieHallada: sel.value === 'encontrada' ? esp.value : '', nota: nota.value.slice(0, MAX_NOTA) };
    try { await guardarObservacion(n); ctx.avisar('Observación guardada'); } catch { ctx.avisar('No se pudieron guardar los cambios.'); return; }
    void pintarDetalle(id);
  }); guardar.id = 'ob-guardar';
  const form = el('div', 'ob-form'); form.append(campo('¿Encontraste algo aquí?', sel), campoEsp, campo('Nota', nota), guardar);
  nodos.push(form);
  // Acciones
  const acc = el('div', 'ex-fin-acciones');
  acc.append(
    boton('Ver en el mapa', () => { dlg.close(); ctx.verEnMapa({ lat: o.lat, lon: o.lon, especie: o.especie }); }),
    boton('Borrar', async () => {
      if (!confirm('¿Borrar esta observación y sus fotos del móvil?')) return;
      await borrarObservacion(o.id).catch(() => ctx.avisar('No se pudo borrar.'));
      vista = { tipo: 'lista' }; void pintar();
    }, 'btn btn-peligro'));
  nodos.push(acc);
  cuerpo.replaceChildren(...nodos);
}

async function pintar() {
  if (vista.tipo === 'lista') await pintarLista(); else await pintarDetalle(vista.id);
}

// ---------------------------------------------------------------- abrir

/** Etiqueta del botón de Mis sitios con el número de observaciones. */
export async function pintarEntradaObservaciones() {
  const b = document.querySelector<HTMLButtonElement>('#btn-observaciones');
  if (!b) return;
  const n = (await listarObservaciones().catch(() => [])).length;
  b.textContent = n ? `Mis observaciones (${n})` : 'Mis observaciones';
}

export async function abrirObservaciones() {
  if (!dlg) return;
  vista = { tipo: 'lista' };
  if (!dlg.open) dlg.showModal();
  await pintar();
}

export function iniciarObservaciones(c: ContextoObservaciones) {
  ctx = c;
  dlg = html();
  $('#ob-cerrar').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => { soltarUrls(); void pintarEntradaObservaciones(); });
  document.querySelector('#btn-observaciones')?.addEventListener('click', () => { void abrirObservaciones(); });
  document.addEventListener(EVENTO_CAMBIO, () => { if (dlg.open) void pintar(); });
  void pintarEntradaObservaciones();
}
