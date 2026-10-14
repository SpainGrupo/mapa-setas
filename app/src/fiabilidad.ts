// Fiabilidad del mapa de cada especie (manifest.especies[].fiabilidad, calculada en pipeline/exportar.py a partir
// de la validación por bloques de calibracion.py).
export type Fiabilidad = 'buena' | 'media' | 'baja' | 'sin_validar';

export const EXPLICACION_FIABILIDAD =
  'Mide cuántos hallazgos reales de GBIF caen donde el mapa marca zona buena. Se comprueba en zonas que no se usaron para ajustarlo.';

const TEXTO: Record<Fiabilidad, string> = {
  buena: 'Mapa comprobado: acierta bien', media: 'Mapa comprobado: acierta a medias', baja: 'Mapa comprobado: acierta poco', sin_validar: 'Mapa sin comprobar',
};

/** Normaliza el valor del manifest: lo ausente o desconocido cuenta como «sin_validar». */
export function nivelFiabilidad(f: unknown): Fiabilidad {
  return typeof f === 'string' && Object.hasOwn(TEXTO, f) ? (f as Fiabilidad) : 'sin_validar';
}

/** «Mapa comprobado: acierta bien / a medias / poco» o «Mapa sin comprobar» (palabras llanas). */
export function textoFiabilidad(f: unknown): string {
  return TEXTO[nivelFiabilidad(f)];
}

/** Insignia de texto (con la explicación como tooltip). */
export function insigniaFiabilidad(f: unknown): HTMLSpanElement {
  const s = document.createElement('span');
  const n = nivelFiabilidad(f);
  s.className = `insignia-fiabilidad fiab-${n}`;
  s.dataset.fiabilidad = n;
  s.textContent = textoFiabilidad(n);
  s.title = EXPLICACION_FIABILIDAD;
  return s;
}
