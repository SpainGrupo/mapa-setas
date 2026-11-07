// Herramientas del chat «Pregunta a Claude» (spec docs/specs/2026-10-20-pregunta-a-claude-design.md §4 y §5).
// Claude no ve los datos: pide cosas a la app y estas funciones se ejecutan en el iPhone sobre los datos locales
// (sitios.json de la región, meteo en caché, Mis sitios, rutas grabadas). Los nombres y campos exactos son los de
// worker/src/chat-herramientas.ts (todos los campos llegan siempre; los opcionales como null).
//
// Reglas:
//  - Puro y sin DOM: todo lo que toca la app (datos, GPS, efectos) entra por `ContextoHerramientas`.
//  - Los ids de sitio son `especie:id_celda`. Un id que no existe, o un rango fuera de límites, devuelve un
//    resultado de error (`error: true` → `is_error` en la API) y NO produce ningún efecto.
//  - Los sitios salen del mismo ranking y de la misma razón que ve el usuario en «Hoy» (ranking.ts, razones.ts).
//  - Las tarjetas del chat se construyen SOLO con lo que devuelven estas funciones, nunca con el texto del modelo.
//  - Sin GPS las distancias se miden desde el origen de la región y el resultado lo dice.
//  - Nunca se habla de comestibilidad: no hay ningún dato de ese tipo aquí.
import type { AccesoSitio, Sitio } from './tipos';
import { distanciaM, fusionar, puntuar, topEspecie, type Entrada, type FilaGeneral, type Opciones, type SitioCandidato, type SitiosJson } from './ranking';
import { especiesDeValor, gruposDe, topGrupo, valorGrupo } from './grupos';
import { clavesEntrada, esOrdenTop, ordenarTops, type OrdenTop } from './orden-tops';
import { razonSitio } from './razones';
import { ORDEN_DIFICULTAD, textoDistancia, type Dificultad } from './ruta';
import { AGUACERO_MM, bandaAltitud, humedadAcumulada, semaforo, sumarDias, textoBanda, type Estado, type Reglas, type ResultadoSemaforo } from './semaforo';
import { edadHoras, type DatosMeteo, type PuntoMeteo } from './meteo';
import type { Fiabilidad } from './fiabilidad';
import { esPublico, textoTitularidad, type ClaseTitularidad } from './titularidad';
import { textoCitado } from './citas';
import { resumen, textoResumen, type Track } from './grabacion';

export const NOMBRES_HERRAMIENTAS_APP = ['buscar_sitios', 'semaforo', 'ruta_a', 'mostrar_en_mapa', 'guardar_en_mis_sitios', 'notas_de_ruta', 'proponer_sitios_nuevos'] as const;
export type NombreHerramientaApp = (typeof NOMBRES_HERRAMIENTAS_APP)[number];

// ---------------------------------------------------------------- límites (spec §4)

export const DIA_MAX = 15;
export const N_MAX_BUSCAR = 10;
export const N_MAX_NUEVOS = 5;
export const N_MAX_NOTAS = 30;
export const IDS_MAX_MAPA = 10;
export const NOTA_MAX = 200;
export const RADIO_MAX_KM = 300;
/** Distancia a la que un sitio cuenta como «el mismo sitio» que uno guardado, una nota o el top a la vista. */
export const RADIO_CONOCIDO_M = 300;

// ---------------------------------------------------------------- tipos públicos

export interface AccesoCalculado {
  estado: string;
  texto: string;
  /** Aparcamiento, tiempo y subida a pie (la misma ficha «Acceso» del mapa). */
  acceso?: AccesoSitio;
  /** Perfil resumido del trazado aparcamiento → sitio. */
  perfil?: { distancia_m: number; subida_m: number; bajada_m: number; alt_min: number | null; alt_max: number | null };
}

export interface ContextoHerramientas {
  region: string;
  /** Origen de la región (centro desde el que se miden las distancias sin GPS) y su etiqueta. */
  origenRegion: { lat: number; lon: number } | null;
  etiquetaOrigen: string | null;
  /** «Hoy» de la app (Europe/Madrid), AAAA-MM-DD. */
  hoy: string;
  datos: SitiosJson | null;
  /** Ids de las setas del mapa de la región. */
  especies: string[];
  nombreEspecie: (id: string) => string;
  reglas: (especie: string) => Reglas | null;
  fiabilidad: (especie: string) => Fiabilidad;
  meteo: DatosMeteo | null;
  puntoMeteo: (id: number) => PuntoMeteo | null;
  /** GPS real del usuario, o null. */
  posicion: { lat: number; lon: number } | null;
  /** Filtros actuales de la app (los que valen cuando la herramienta recibe null). */
  filtros: { soloPublicos: boolean; maxDificultad: Dificultad | null };
  /** Ids `especie:id` de los sitios que el usuario ve ahora en «Hoy». */
  topVisible: string[];
  misSitios: () => Promise<Sitio[]>;
  rutas: () => Promise<Track[]>;
  acceso: (lat: number, lon: number) => Promise<AccesoCalculado>;
  /** Efectos. */
  guardarSitio: (s: Sitio) => Promise<void>;
  mostrarEnMapa: (puntos: { lat: number; lon: number }[]) => void;
  nuevoId: () => string;
  ahora: () => Date;
  /** Texto del aviso de recinto restringido (manifest.chip_sitio_restringido). */
  textoRestringido?: string | null;
}

/** Lo que enseña (y lo que ve Claude de) un sitio: la tarjeta del chat se pinta con esto y nada más. */
export interface Tarjeta {
  id: string;
  especie: string;
  seta: string;
  otras_setas: string[];
  lat: number;
  lon: number;
  puntuacion: number;
  semaforo: Estado;
  dificultad: Dificultad;
  a_pie_min: number;
  subida_m: number;
  /** En línea recta desde el GPS o, sin él, desde el origen de la región. */
  distancia_km: number | null;
  titularidad: { clase: ClaseTitularidad; texto: string; publico: boolean };
  restriccion: string | null;
  citas: string | null;
  razon: string;
  por_que_nuevo?: string;
  /** Solo en ruta_a: dónde aparcar. */
  aparcamiento?: { lat: number; lon: number; via: string };
}

/** Efecto reversible que el chat enseña con «Deshacer». */
export interface AccionChat {
  tipo: 'guardado';
  texto: string;
  /** Id del sitio creado en Mis sitios. */
  sitioId: string;
  deshecho?: boolean;
}

export interface ResultadoHerramienta {
  /** JSON compacto: lo que verá Claude en el tool_result. */
  contenido: string;
  error: boolean;
  tarjetas: Tarjeta[];
  acciones: AccionChat[];
}

type Manejador = (entrada: unknown, ctx: ContextoHerramientas) => Promise<ResultadoHerramienta>;

// ---------------------------------------------------------------- utilidades de validación

class ErrorEntrada extends Error {}
const falla = (m: string): never => { throw new ErrorEntrada(m); };

const ok = (json: unknown, tarjetas: Tarjeta[] = [], acciones: AccionChat[] = []): ResultadoHerramienta =>
  ({ contenido: JSON.stringify(json), error: false, tarjetas, acciones });
export const errorHerramienta = (mensaje: string): ResultadoHerramienta =>
  ({ contenido: JSON.stringify({ error: mensaje }), error: true, tarjetas: [], acciones: [] });

const r5 = (v: number) => Math.round(v * 1e5) / 1e5;
const r3 = (v: number) => Math.round(v * 1e3) / 1e3;
const r1 = (v: number) => Math.round(v * 10) / 10;
const esObjeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const esNulo = (x: unknown) => x === null || x === undefined;
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function objeto(entrada: unknown): Record<string, unknown> {
  return esObjeto(entrada) ? entrada : falla('La entrada debe ser un objeto con los campos de la herramienta.');
}
function entero(v: unknown, nombre: string, min: number, max: number, porDefecto?: number): number {
  if (esNulo(v) && porDefecto !== undefined) return porDefecto;
  if (!num(v) || !Number.isInteger(v)) return falla(`${nombre} debe ser un número entero.`);
  if (v < min || v > max) return falla(`${nombre} debe estar entre ${min} y ${max} (recibido ${v}).`);
  return v;
}
function radio(v: unknown): number | null {
  if (esNulo(v)) return null;
  if (!num(v) || v <= 0 || v > RADIO_MAX_KM) return falla(`radio_km debe ser un número entre 0 y ${RADIO_MAX_KM}, o null.`);
  return v;
}
function booleanoONulo(v: unknown, nombre: string): boolean | null {
  if (esNulo(v)) return null;
  return typeof v === 'boolean' ? v : falla(`${nombre} debe ser true, false o null.`);
}
function dificultadONula(v: unknown): Dificultad | null {
  if (esNulo(v)) return null;
  return typeof v === 'string' && (ORDEN_DIFICULTAD as string[]).includes(v) ? (v as Dificultad)
    : falla(`max_dificultad debe ser uno de ${ORDEN_DIFICULTAD.join(', ')} o null.`);
}

// ---------------------------------------------------------------- selección de setas y sitios

interface Seleccion { especies: string[]; grupo: boolean }

function seleccion(ctx: ContextoHerramientas, especie: unknown, grupo: unknown): Seleccion {
  const hayE = !esNulo(especie) && especie !== '', hayG = !esNulo(grupo) && grupo !== '';
  if (!hayE && !hayG) return falla('Indica una especie o un grupo.');
  if (hayE && hayG) return falla('Indica solo una cosa: la especie o el grupo, no las dos (la otra, null).');
  if (hayE) {
    if (typeof especie !== 'string' || !ctx.especies.includes(especie))
      return falla(`Especie desconocida: ${String(especie)}. Las de esta región: ${ctx.especies.join(', ')}.`);
    return { especies: [especie], grupo: false };
  }
  const g = typeof grupo === 'string' ? especiesDeValor(valorGrupo(grupo), ctx.especies) : [];
  if (!g.length) return falla(`Grupo desconocido o sin setas en esta región: ${String(grupo)}. Grupos: ${gruposDe(ctx.especies).map((x) => x.grupo.id).join(', ')}.`);
  return { especies: g, grupo: true };
}

function parsearId(id: unknown): { especie: string; n: number } | null {
  if (typeof id !== 'string') return null;
  const i = id.indexOf(':');
  if (i <= 0) return null;
  const n = Number(id.slice(i + 1));
  return Number.isInteger(n) && id.slice(i + 1).trim() !== '' ? { especie: id.slice(0, i), n } : null;
}

/** Busca el sitio de un id `especie:id_celda` en sitios.json; error si no existe. */
function sitioDe(ctx: ContextoHerramientas, id: unknown, nombre = 'sitio_id'): { especie: string; sitio: SitioCandidato; id: string } {
  const p = parsearId(id);
  const s = p && ctx.datos?.especies[p.especie]?.find((x) => x.id === p.n);
  if (!p || !s) return falla(`${nombre} desconocido: ${String(id)}. Usa un id devuelto por buscar_sitios o proponer_sitios_nuevos (formato especie:id).`);
  return { especie: p.especie, sitio: s, id: `${p.especie}:${s.id}` };
}

function requiereDatos(ctx: ContextoHerramientas): SitiosJson {
  return ctx.datos ?? falla('Esta versión de los mapas no trae sitios candidatos.');
}

const origenDe = (ctx: ContextoHerramientas) => ctx.posicion ?? ctx.origenRegion;
/** Aviso que acompaña a toda distancia cuando no hay GPS. */
function avisoPosicion(ctx: ContextoHerramientas): string | undefined {
  if (ctx.posicion) return undefined;
  const lugar = ctx.etiquetaOrigen?.replace(/^de /, '');
  return ctx.origenRegion ? `Sin GPS: las distancias (en línea recta) se miden desde el origen de la región${lugar ? ` (${lugar})` : ''}, no desde el usuario.`
    : 'Sin GPS ni origen de la región: no hay distancias.';
}

// ---------------------------------------------------------------- semáforo y opciones del día

interface DiaCalculado {
  fecha: string;
  opciones: Opciones;
  estado: (especie: string, meteoId: number) => ResultadoSemaforo | null;
}

function estadoPuntoCon(ctx: ContextoHerramientas, meteoId: number, especie: string, fecha: string): ResultadoSemaforo | null {
  const r = ctx.reglas(especie);
  const serie = ctx.meteo?.puntos[String(meteoId)];
  if (!r || !serie || !ctx.meteo) return null;
  return semaforo(serie, r, fecha, { edadHoras: edadHoras(ctx.meteo, ctx.ahora()) });
}

/** Opciones de ranking idénticas a las de «Hoy» (hoy-ui.ts opciones()) para un día y unos filtros. */
function diaCon(ctx: ContextoHerramientas, dia: number, soloPublicos: boolean, maxDificultad: Dificultad | null): DiaCalculado {
  const fecha = sumarDias(ctx.hoy, dia);
  const cache = new Map<string, ResultadoSemaforo | null>();
  const estado = (e: string, id: number) => {
    const k = `${e}:${id}`;
    if (!cache.has(k)) cache.set(k, estadoPuntoCon(ctx, id, e, fecha));
    return cache.get(k) ?? null;
  };
  return { fecha, estado, opciones: { estadoEn: (e, id) => estado(e, id)?.estado ?? null, fiabilidad: ctx.fiabilidad, maxDificultad, soloPublicos } };
}

// ---------------------------------------------------------------- tarjetas

function tarjetaDe(ctx: ContextoHerramientas, d: DiaCalculado, fila: FilaGeneral, extra: { por_que_nuevo?: string } = {}): Tarjeta {
  const e = fila.principal, s = e.sitio;
  const org = origenDe(ctx);
  const tit = s.titularidad ?? { clase: 'privado' as const };
  const razon = razonSitio(e, { fiabilidad: ctx.fiabilidad(e.especie), motivo: d.estado(e.especie, s.meteo_id)?.motivo ?? null });
  return {
    id: `${e.especie}:${s.id}`, especie: e.especie, seta: ctx.nombreEspecie(e.especie),
    otras_setas: fila.entradas.filter((x) => x !== e).map((x) => ctx.nombreEspecie(x.especie)),
    lat: r5(s.lat), lon: r5(s.lon), puntuacion: e.puntuacion, semaforo: e.estado, dificultad: e.dificultad,
    a_pie_min: s.t_pie_min, subida_m: s.subida_m, distancia_km: org ? r1(distanciaM(org, s) / 1000) : null,
    titularidad: { clase: tit.clase, texto: textoTitularidad(tit), publico: esPublico(tit) },
    restriccion: s.restringido ? ctx.textoRestringido ?? 'Recogida con autorización' : null,
    citas: s.citas ? textoCitado(s.citas) : null,
    razon, ...(extra.por_que_nuevo ? { por_que_nuevo: extra.por_que_nuevo } : {}),
  };
}

/** Candidatos de una selección ordenados por puntuación (todos, sin recortar), con la fusión a 300 m de «Hoy» en grupos. */
function filasDe(datos: SitiosJson, sel: Seleccion, o: Opciones): FilaGeneral[] {
  if (!sel.grupo) return topEspecie(datos, sel.especies[0], o, Infinity).map((e) => ({ principal: e, entradas: [e], especies: [e.especie] }));
  return topGrupo(datos, sel.especies, o, Infinity);
}

const dentroDelRadio = (ctx: ContextoHerramientas, f: FilaGeneral, km: number | null) => {
  const org = origenDe(ctx);
  return km === null || !org || distanciaM(org, f.principal.sitio) / 1000 <= km;
};

// ---------------------------------------------------------------- buscar_sitios

const buscarSitios: Manejador = async (entrada, ctx) => {
  const e = objeto(entrada);
  const sel = seleccion(ctx, e.especie, e.grupo);
  const dia = entero(e.dia, 'dia', 0, DIA_MAX);
  const km = radio(e.radio_km);
  const soloPublicos = booleanoONulo(e.solo_publicos, 'solo_publicos') ?? ctx.filtros.soloPublicos;
  const maxDif = dificultadONula(e.max_dificultad) ?? ctx.filtros.maxDificultad;
  const n = entero(e.n, 'n', 1, N_MAX_BUSCAR);
  if (!esNulo(e.orden) && !esOrdenTop(e.orden)) falla('orden debe ser probabilidad, distancia, dificultad o null.');
  const orden: OrdenTop = esOrdenTop(e.orden) ? e.orden : 'probabilidad';
  const datos = requiereDatos(ctx);

  const d = diaCon(ctx, dia, soloPublicos, maxDif);
  // Como «Los 10 mejores» de Hoy: los 10 de más puntuación que cumplen los filtros, y luego se reordenan.
  const pool = filasDe(datos, sel, d.opciones).filter((f) => dentroDelRadio(ctx, f, km)).slice(0, N_MAX_BUSCAR);
  const org = origenDe(ctx);
  const filas = ordenarTops(pool, orden, (f) => clavesEntrada(f.principal, org)).slice(0, n);
  const tarjetas = filas.map((f) => tarjetaDe(ctx, d, f));
  return ok({
    fecha: d.fecha, dia, orden, filtros: { solo_publicos: soloPublicos, max_dificultad: maxDif, radio_km: km },
    ...(km !== null && !org ? { aviso_radio: 'Sin posición ni origen de región: no se aplicó el radio.' } : {}),
    ...(avisoPosicion(ctx) ? { aviso_posicion: avisoPosicion(ctx) } : {}),
    ...(tarjetas.length ? {} : { sin_resultados: 'Ningún sitio cumple esos filtros ese día.' }),
    resultados: tarjetas,
  }, tarjetas);
};

// ---------------------------------------------------------------- semaforo

const herramientaSemaforo: Manejador = async (entrada, ctx) => {
  const e = objeto(entrada);
  if (typeof e.especie !== 'string' || !ctx.especies.includes(e.especie))
    return falla(`Especie desconocida: ${String(e.especie)}. Las de esta región: ${ctx.especies.join(', ')}.`);
  const sitio = sitioDe(ctx, e.sitio_id);
  const dia = entero(e.dia, 'dia', 0, DIA_MAX);
  const fecha = sumarDias(ctx.hoy, dia);
  const serie = ctx.meteo?.puntos[String(sitio.sitio.meteo_id)];
  const reglas = ctx.reglas(e.especie);
  const base = { especie: e.especie, sitio_id: sitio.id, fecha, dia };
  if (!ctx.meteo || !serie) return ok({ ...base, estado: 'gris', motivo: 'No hay datos del tiempo para este sitio (la app aún no los ha descargado).' });
  if (!reglas) return ok({ ...base, estado: 'gris', motivo: 'Esta seta no tiene reglas del tiempo en la app.' });
  const horas = edadHoras(ctx.meteo, ctx.ahora());
  const r = semaforo(serie, reglas, fecha, { edadHoras: horas });
  const h = humedadAcumulada(serie, fecha);
  const alt = ctx.puntoMeteo(sitio.sitio.meteo_id)?.alt_media;
  const banda = num(alt) ? bandaAltitud(serie, fecha, reglas, alt) : null;
  const dato = serie.find((x) => x.fecha === fecha);
  const avisos: string[] = [];
  if (dato && dato.lluvia >= AGUACERO_MM) avisos.push(`Aguacero previsto ese día (${Math.round(dato.lluvia)} mm): barro y accesos difíciles.`);
  if (horas > 24) avisos.push(`Los datos del tiempo tienen ${Math.round(horas)} h.`);
  return ok({
    ...base, estado: r.estado, motivo: r.motivo,
    ...(r.desde ? { ventana_desde: r.desde } : {}), ...(r.hasta ? { ventana_hasta: r.hasta } : {}),
    ...(r.proxima ? { proxima_ventana: { desde: r.proxima.desde, hasta: r.proxima.hasta, lluvia_mm: r.proxima.lluvia_mm, prevista: r.proxima.prevista } } : {}),
    humedad_30d: { balance_mm: Number.isFinite(h.balance_mm) ? h.balance_mm : null, dias_lluvia: h.dias_lluvia, suelo: Number.isFinite(h.suelo) ? h.suelo : null },
    banda_altitud: banda && num(alt) ? textoBanda(banda, alt) : null, avisos,
  });
};

// ---------------------------------------------------------------- ruta_a

const rutaA: Manejador = async (entrada, ctx) => {
  const e = objeto(entrada);
  const { especie, sitio, id } = sitioDe(ctx, e.sitio_id);
  const d = diaCon(ctx, 0, false, null);
  const ent = puntuar(especie, sitio, d.opciones);
  const a = await ctx.acceso(sitio.lat, sitio.lon);
  const tarjeta = ent ? tarjetaDe(ctx, d, { principal: ent, entradas: [ent], especies: [especie] }) : null;
  if (a.estado !== 'ok' || !a.acceso) {
    return ok({ sitio_id: id, sin_acceso_calculado: a.texto,
      segun_sitios_json: { a_pie_min: sitio.t_pie_min, subida_m: sitio.subida_m, nota: 'Estimación del pipeline, sin aparcamiento concreto.' } },
    tarjeta ? [tarjeta] : []);
  }
  const ac = a.acceso;
  const conAparcamiento = tarjeta ? { ...tarjeta, aparcamiento: { lat: ac.lat, lon: ac.lon, via: ac.via } } : null;
  return ok({
    sitio_id: id, aparcar_en: ac.via, aparcamiento: { lat: ac.lat, lon: ac.lon }, a_pie_min: ac.tiempo_min, subida_m: ac.subida_m,
    dificultad: tarjeta?.dificultad ?? null,
    ...(a.perfil ? { perfil: { camino_m: Math.round(a.perfil.distancia_m), subida_m: Math.round(a.perfil.subida_m), bajada_m: Math.round(a.perfil.bajada_m),
      altitud_min_m: a.perfil.alt_min === null ? null : Math.round(a.perfil.alt_min), altitud_max_m: a.perfil.alt_max === null ? null : Math.round(a.perfil.alt_max) } } : {}),
    aviso: 'Estimación con rejilla de 100 m: puede cruzar fincas, vallas o barrancos.',
  }, conAparcamiento ? [conAparcamiento] : []);
};

// ---------------------------------------------------------------- mostrar_en_mapa

const mostrarEnMapa: Manejador = async (entrada, ctx) => {
  const e = objeto(entrada);
  if (!Array.isArray(e.sitio_ids) || !e.sitio_ids.length) return falla('sitio_ids debe ser una lista con al menos un id.');
  if (e.sitio_ids.length > IDS_MAX_MAPA) return falla(`sitio_ids admite como máximo ${IDS_MAX_MAPA} ids.`);
  // Se valida todo antes de tocar nada: un id desconocido no deja el mapa a medias.
  const sitios = e.sitio_ids.map((id) => sitioDe(ctx, id, 'id'));
  ctx.mostrarEnMapa(sitios.map((s) => ({ lat: s.sitio.lat, lon: s.sitio.lon })));
  return ok({ mostrados: sitios.length, ids: sitios.map((s) => s.id) });
};

// ---------------------------------------------------------------- guardar_en_mis_sitios

const guardarEnMisSitios: Manejador = async (entrada, ctx) => {
  const e = objeto(entrada);
  const { especie, sitio, id } = sitioDe(ctx, e.sitio_id);
  const estrellas = entero(e.estrellas, 'estrellas', 1, 3, 1) as 1 | 2 | 3;
  if (!esNulo(e.nota) && typeof e.nota !== 'string') falla('nota debe ser un texto o null.');
  const nota = typeof e.nota === 'string' ? e.nota.trim() : '';
  if (nota.length > NOTA_MAX) return falla(`La nota admite como máximo ${NOTA_MAX} caracteres (tiene ${nota.length}).`);
  const lat = r5(sitio.lat), lon = r5(sitio.lon);
  const ya = (await ctx.misSitios()).some((x) => Math.abs(x.lat - lat) < 5e-5 && Math.abs(x.lon - lon) < 5e-5 && x.nota === nota && x.especie === especie);
  if (ya) return ok({ guardado: false, ya_estaba: true, sitio_id: id });
  let acceso: AccesoSitio | undefined;
  try { const a = await ctx.acceso(lat, lon); if (a.estado === 'ok' && a.acceso) acceso = a.acceso; } catch { /* se guarda sin acceso */ }
  const nuevo: Sitio = { id: ctx.nuevoId(), lat, lon, estrellas, nota, especie, fecha: ctx.ahora().toISOString(), ...(acceso ? { acceso } : {}) };
  await ctx.guardarSitio(nuevo);
  const nombre = ctx.nombreEspecie(especie);
  return ok({ guardado: true, sitio_id: id, estrellas, con_acceso: !!acceso, deshacer: 'El usuario ve un botón «Deshacer» en el chat.' }, [],
    [{ tipo: 'guardado', texto: `Guardado en Mis sitios: ${nombre}${nota ? ` · ${nota}` : ''}`, sitioId: nuevo.id }]);
};

// ---------------------------------------------------------------- notas_de_ruta

const notasDeRuta: Manejador = async (entrada, ctx) => {
  const e = objeto(entrada);
  if (!esNulo(e.ruta) && typeof e.ruta !== 'string') falla('ruta debe ser un id, "ultima" o null.');
  const n = entero(e.n, 'n', 1, N_MAX_NOTAS, N_MAX_NOTAS);
  const rutas = await ctx.rutas();
  const sitios = await ctx.misSitios();
  const misSitios = sitios.slice(0, 50).map((s) => ({
    id: s.id, seta: s.especie ? ctx.nombreEspecie(s.especie) : null, estrellas: s.estrellas, nota: s.nota, lat: r3(s.lat), lon: r3(s.lon),
    fecha: s.fecha.slice(0, 10), ...(s.acceso ? { aparcar_en: s.acceso.via, a_pie_min: s.acceso.tiempo_min } : {}),
  }));
  const pedida = typeof e.ruta === 'string' ? e.ruta.trim() : '';
  const ultima = !pedida || /^[uú]ltima$/i.test(pedida);
  const ruta = ultima ? rutas[0] : rutas.find((r) => r.id === pedida);
  if (!ultima && !ruta) return falla(`Ruta desconocida: ${pedida}. Disponibles: ${rutas.slice(0, 5).map((r) => `${r.id} (${r.nombre})`).join('; ') || 'ninguna'}.`);
  const otras = rutas.filter((r) => r !== ruta).slice(0, 5).map((r) => ({ id: r.id, nombre: r.nombre }));
  if (!ruta) return ok({ ruta: null, aviso: 'No hay rutas grabadas.', mis_sitios: misSitios, otras_rutas: otras });
  const res = resumen(ruta);
  return ok({
    ruta: { id: ruta.id, nombre: ruta.nombre, inicio: new Date(ruta.inicio).toISOString(), resumen: textoResumen(res),
      distancia_m: res.distancia_m, subida_m: res.subida_m, bajada_m: res.bajada_m, duracion_s: res.duracion_s },
    total_notas: ruta.notas.length,
    notas: ruta.notas.slice(0, n).map((x) => ({ texto: x.texto, estrellas: x.estrellas, lat: r3(x.lat), lon: r3(x.lon), fecha: new Date(x.t).toISOString() })),
    aviso_privacidad: 'Posiciones redondeadas a ~100 m.',
    mis_sitios: misSitios, otras_rutas: otras,
  });
};

// ---------------------------------------------------------------- proponer_sitios_nuevos

type TipoConocido = 'top' | 'sitio' | 'nota';
const TEXTO_CONOCIDO: Record<TipoConocido, string> = { top: 'un sitio del top que ve', sitio: 'uno de sus sitios guardados', nota: 'una nota de sus rutas' };

const proponerNuevos: Manejador = async (entrada, ctx) => {
  const e = objeto(entrada);
  const sel = seleccion(ctx, e.especie, e.grupo);
  const dia = entero(e.dia, 'dia', 0, DIA_MAX);
  const km = radio(e.radio_km);
  const n = entero(e.n, 'n', 1, N_MAX_NUEVOS);
  const datos = requiereDatos(ctx);

  const conocidos: { lat: number; lon: number; tipo: TipoConocido }[] = [];
  const idsTop = new Set(ctx.topVisible);
  for (const id of ctx.topVisible) {
    const p = parsearId(id), s = p && datos.especies[p.especie]?.find((x) => x.id === p.n);
    if (s) conocidos.push({ lat: s.lat, lon: s.lon, tipo: 'top' });
  }
  for (const s of await ctx.misSitios()) conocidos.push({ lat: s.lat, lon: s.lon, tipo: 'sitio' });
  for (const r of await ctx.rutas()) for (const x of r.notas) conocidos.push({ lat: x.lat, lon: x.lon, tipo: 'nota' });
  const masCercano = (p: { lat: number; lon: number }) =>
    conocidos.reduce<{ m: number; tipo: TipoConocido } | null>((mejor, c) => { const m = distanciaM(c, p); return !mejor || m < mejor.m ? { m, tipo: c.tipo } : mejor; }, null);

  const d = diaCon(ctx, dia, ctx.filtros.soloPublicos, ctx.filtros.maxDificultad);
  const entradas: Entrada[] = [];
  for (const sp of sel.especies) for (const x of topEspecie(datos, sp, d.opciones, Infinity)) {
    if (x.estado === 'rojo' || idsTop.has(`${x.especie}:${x.sitio.id}`)) continue;
    const c = masCercano(x.sitio);
    if (c && c.m <= RADIO_CONOCIDO_M) continue;
    entradas.push(x);
  }
  entradas.sort((a, b) => b.score - a.score || a.sitio.id - b.sitio.id);
  const filas: FilaGeneral[] = sel.grupo ? fusionar(entradas) : entradas.map((x) => ({ principal: x, entradas: [x], especies: [x.especie] }));
  const elegidas = filas.filter((f) => dentroDelRadio(ctx, f, km)).slice(0, n);
  const tarjetas = elegidas.map((f) => {
    const c = masCercano(f.principal.sitio);
    const porQue = c
      ? `Fuera del top que ves y a más de ${RADIO_CONOCIDO_M} m de tus sitios guardados y notas de ruta; lo más cercano que conoces (${TEXTO_CONOCIDO[c.tipo]}) queda a ${textoDistancia(c.m)}.`
      : 'No tienes sitios guardados, notas de ruta ni top a la vista con los que compararlo: es nuevo por falta de referencias.';
    return tarjetaDe(ctx, d, f, { por_que_nuevo: porQue });
  });
  const org = origenDe(ctx);
  return ok({
    fecha: d.fecha, dia, filtros: { solo_publicos: ctx.filtros.soloPublicos, max_dificultad: ctx.filtros.maxDificultad, radio_km: km },
    excluidos: { top_visible: ctx.topVisible.length, mis_sitios_y_notas: conocidos.filter((c) => c.tipo !== 'top').length },
    ...(km !== null && !org ? { aviso_radio: 'Sin posición ni origen de región: no se aplicó el radio.' } : {}),
    ...(avisoPosicion(ctx) ? { aviso_posicion: avisoPosicion(ctx) } : {}),
    ...(tarjetas.length ? {} : { sin_resultados: 'No queda ningún sitio bien puntuado que no conozcas ya con esos filtros.' }),
    resultados: tarjetas,
  }, tarjetas);
};

// ---------------------------------------------------------------- despacho

export const MANEJADORES: Record<NombreHerramientaApp, Manejador> = {
  buscar_sitios: buscarSitios,
  semaforo: herramientaSemaforo,
  ruta_a: rutaA,
  mostrar_en_mapa: mostrarEnMapa,
  guardar_en_mis_sitios: guardarEnMisSitios,
  notas_de_ruta: notasDeRuta,
  proponer_sitios_nuevos: proponerNuevos,
};

/** Ejecuta una herramienta. Nunca lanza: los errores de entrada y los fallos internos son un resultado `error: true`. */
export async function ejecutarHerramienta(nombre: string, entrada: unknown, ctx: ContextoHerramientas): Promise<ResultadoHerramienta> {
  const m = (MANEJADORES as Record<string, Manejador | undefined>)[nombre];
  if (!m) return errorHerramienta(`Herramienta desconocida: ${nombre}.`);
  try {
    return await m(entrada, ctx);
  } catch (err) {
    if (err instanceof ErrorEntrada) return errorHerramienta(err.message);
    console.warn('herramienta', nombre, err);
    return errorHerramienta('Fallo interno de la herramienta; inténtalo con otros parámetros o dilo al usuario.');
  }
}
