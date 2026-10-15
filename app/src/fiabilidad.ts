// Fiabilidad del mapa de cada especie (manifest.especies[].fiabilidad, calculada en pipeline/exportar.py a partir
// de la validación por bloques de calibracion.py).
export type Fiabilidad = 'buena' | 'media' | 'baja' | 'sin_validar';

export const EXPLICACION_FIABILIDAD =
  'Mide cuántos hallazgos reales (GBIF, iNaturalist, Observation.org, foros) caen donde el mapa marca zona buena. Se comprueba en zonas que no se usaron para ajustarlo.';
/** Citas mínimas en la zona (precisión ≤ 1 km) para comprobar el mapa de una seta (= calibracion.MIN_OBS). */
export const MIN_CITAS = 10;

const TEXTO: Record<Fiabilidad, string> = {
  buena: 'Mapa comprobado: acierta bien', media: 'Mapa comprobado: acierta a medias', baja: 'Mapa comprobado: acierta poco', sin_validar: 'Mapa sin comprobar',
};

/** Normaliza el valor del manifest: lo ausente o desconocido cuenta como «sin_validar». */
export function nivelFiabilidad(f: unknown): Fiabilidad {
  return typeof f === 'string' && Object.hasOwn(TEXTO, f) ? (f as Fiabilidad) : 'sin_validar';
}

/** «Mapa comprobado: acierta bien / a medias / poco» o «Mapa sin comprobar» (palabras llanas). Sin comprobar y
 * con el número de citas: «Mapa sin comprobar (3 citas, hacen falta 10)». */
export function textoFiabilidad(f: unknown, nCitas?: number | null): string {
  const n = nivelFiabilidad(f);
  if (n === 'sin_validar' && Number.isFinite(nCitas) && (nCitas as number) < MIN_CITAS) {
    const c = nCitas as number;
    return `${TEXTO[n]} (${c} ${c === 1 ? 'cita' : 'citas'}, hacen falta ${MIN_CITAS})`;
  }
  return TEXTO[n];
}

/** Insignia de texto (con la explicación como tooltip). */
export function insigniaFiabilidad(f: unknown, nCitas?: number | null): HTMLSpanElement {
  const s = document.createElement('span');
  const n = nivelFiabilidad(f);
  s.className = `insignia-fiabilidad fiab-${n}`;
  s.dataset.fiabilidad = n;
  s.textContent = textoFiabilidad(n, nCitas);
  s.title = EXPLICACION_FIABILIDAD;
  return s;
}
