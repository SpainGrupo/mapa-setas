// Capa «Citas y sitios conocidos» (pipeline exportar.py → citas.pmtiles, capa 'citas'): utilidades sin DOM.
// Cada punto es una cita real (GBIF, iNaturalist, Observation.org vía GBIF, foros o literatura) con su licencia y
// atribución. Una cita dice que alguien vio la seta ahí; no dice que se pueda recoger ni comer.

export type OrigenCita = 'foro' | 'literatura' | 'inat' | 'observation' | 'gbif' | 'imba';
export const ORIGENES_CITA: OrigenCita[] = ['foro', 'literatura', 'inat', 'observation', 'gbif'];
export const COLOR_ORIGEN: Record<OrigenCita, string> = {
  foro: '#d84315', literatura: '#6a1b9a', inat: '#2e7d32', observation: '#00838f', gbif: '#1565c0', imba: '#5d4037',
};
export const NOMBRE_ORIGEN: Record<OrigenCita, string> = {
  foro: 'Foro o comentario', literatura: 'Literatura', inat: 'iNaturalist', observation: 'Observation.org', gbif: 'GBIF', imba: 'IMBA',
};
export const AVISO_CITAS = 'Una cita es un hallazgo publicado por otra persona: no dice que se pueda recoger ahí ni que se pueda consumir.';

/** Expresión MapLibre del color del punto según el origen. */
export function expresionColorOrigen(): unknown[] {
  return ['match', ['get', 'origen'], ...ORIGENES_CITA.flatMap((o) => [o, COLOR_ORIGEN[o]]), COLOR_ORIGEN.imba];
}

/** Filtro MapLibre: solo la especie del mapa (clave de especies.yaml, `especie_mapa`), o todas con null. */
export function filtroCitas(especie: string | null): unknown[] | null {
  return especie ? ['==', ['get', 'especie_mapa'], especie] : null;
}

export interface FilaCita { etiqueta: string; valor: string; enlace?: string }

/** «12 m», «1,5 km», «sin dato». */
export function textoPrecision(m: unknown): string {
  const v = Number(m);
  if (m == null || m === '' || !Number.isFinite(v)) return 'sin dato';
  return v < 1000 ? `${Math.round(v)} m` : `${(v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} km`;
}

/** «2020-11-15» → «15/11/2020»; sin fecha, «sin fecha». */
export function textoFecha(f: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : 'sin fecha';
}

/** Filas del popup de una cita: especie, fecha, precisión, origen, fuente (enlace) y atribución/licencia. */
export function filasCita(p: Record<string, unknown>, nombreEspecie: (id: string) => string): FilaCita[] {
  const origen = String(p.origen ?? '') as OrigenCita;
  const url = typeof p.url === 'string' && /^https?:\/\//.test(p.url) ? p.url : undefined;
  return [
    { etiqueta: 'Especie', valor: nombreEspecie(String(p.especie ?? '')) },
    { etiqueta: 'Fecha', valor: textoFecha(p.fecha) },
    { etiqueta: 'Precisión', valor: textoPrecision(p.precision_m) },
    { etiqueta: 'Origen', valor: NOMBRE_ORIGEN[origen] ?? (origen || '—') },
    { etiqueta: 'Fuente', valor: String(p.fuente ?? (url ? 'ver la cita' : '—')), enlace: url },
    { etiqueta: 'Atribución', valor: [p.atribucion, p.licencia].filter(Boolean).map(String).join(' · ') || '—' },
  ];
}

// ---------------------------------------------------------------- citas cerca de un sitio candidato (Top de «Hoy»)
// Las asigna el pipeline (citas_sitios.py) a cada sitio de sitios.json: citas de la misma especie a ≤ max(1 km,
// precisión) con tope 5 km. Nivel «punto» si alguna es precisa (≤ 1 km) y está a ≤ 1 km; si no, «paraje».

export type NivelCitas = 'punto' | 'paraje';
export interface RefCita {
  origen: OrigenCita | string;
  fecha: string | null;
  precision_m: number | null;
  dist_m: number;
  url: string | null;
  fuente: string | null;
  atribucion: string | null;
  licencia: string | null;
}
export interface CitasSitio { n: number; ultima: string | null; nivel: NivelCitas; origenes: string[]; refs: RefCita[] }

/** Nombres cortos para la etiqueta del Top (los largos, NOMBRE_ORIGEN, en la lista de fuentes). */
export const ABREV_ORIGEN: Record<OrigenCita, string> = {
  foro: 'foro', literatura: 'literatura', inat: 'iNat', observation: 'Observation', gbif: 'GBIF', imba: 'IMBA',
};

const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Valida el campo `citas` de un sitio de sitios.json; null si falta o no tiene la forma esperada. */
export function parsearCitasSitio(c: unknown): CitasSitio | null {
  const o = c as Partial<CitasSitio> | null;
  if (!o || typeof o !== 'object' || !Number.isFinite(o.n) || (o.n as number) < 1 || !Array.isArray(o.refs)) return null;
  const refs: RefCita[] = o.refs.filter((r) => r && typeof r === 'object').map((r) => ({
    origen: String(r.origen ?? ''), fecha: txt(r.fecha), precision_m: num(r.precision_m), dist_m: num(r.dist_m) ?? 0,
    url: typeof r.url === 'string' && /^https?:\/\//.test(r.url) ? r.url : null,
    fuente: txt(r.fuente), atribucion: txt(r.atribucion), licencia: txt(r.licencia),
  }));
  const ultima = typeof o.ultima === 'string' && /^\d{4}$/.test(o.ultima) ? o.ultima : null;
  return { n: Math.round(o.n as number), ultima, nivel: o.nivel === 'punto' ? 'punto' : 'paraje',
    origenes: Array.isArray(o.origenes) ? o.origenes.map(String) : [...new Set(refs.map((r) => r.origen))], refs };
}

/** «Citado: foro / iNat (3 citas, última 2023)»; sin año conocido, sin «última». */
export function textoCitado(c: CitasSitio): string {
  const orden = (o: string) => { const i = (ORIGENES_CITA as string[]).indexOf(o); return i < 0 ? 99 : i; };
  const nombres = [...new Set(c.origenes)].sort((a, b) => orden(a) - orden(b)).map((o) => ABREV_ORIGEN[o as OrigenCita] ?? o);
  const cuantas = `${c.n} ${c.n === 1 ? 'cita' : 'citas'}`;
  return `Citado: ${nombres.join(' / ') || 'otras fuentes'} (${cuantas}${c.ultima ? `, última ${c.ultima}` : ''})`;
}

/** «a 350 m», «a 1,2 km». */
export function textoDistancia(m: number): string {
  return `a ${textoPrecision(m)}`;
}

export interface FilaRefCita { origen: string; fecha: string; precision: string; distancia: string; enlace?: string; fuente: string; atribucion: string }

/** Una fuente de la lista desplegable: origen, fecha, precisión, distancia al sitio, enlace y atribución · licencia. */
export function filaRefCita(r: RefCita): FilaRefCita {
  return {
    origen: NOMBRE_ORIGEN[r.origen as OrigenCita] ?? (r.origen || '—'),
    fecha: /^\d{4}(-\d{2})?$/.test(r.fecha ?? '') ? r.fecha!.split('-').reverse().join('/') : textoFecha(r.fecha),   // «2018», «10/2018»
    precision: `precisión ${textoPrecision(r.precision_m)}`,
    distancia: `${textoDistancia(r.dist_m)} del sitio`,
    enlace: r.url ?? undefined,
    fuente: r.fuente ?? (r.url ? 'ver la cita' : '—'),
    atribucion: [r.atribucion, r.licencia].filter(Boolean).join(' · ') || '—',
  };
}
