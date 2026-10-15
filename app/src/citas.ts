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
