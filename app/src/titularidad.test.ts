import { describe, expect, it } from 'vitest';
import type { Geometry } from 'geojson';
import { AVISO_TITULARIDAD, detallesTitularidad, esPublico, etiquetaTitularidad, NORMA_TITULARIDAD, TEXTO_TITULARIDAD, textoTitularidad } from './titularidad';

const caja = (o: number, s: number, e: number, n: number): Geometry => ({ type: 'Polygon', coordinates: [[[o, s], [e, s], [e, n], [o, n], [o, s]]] });
const f = (clase: string, g: Geometry, nombre?: string) => ({ properties: { clase, ...(nombre ? { nombre } : {}) }, geometry: g });

describe('titularidad', () => {
  const capa = [
    f('monte_junta', caja(-5, 36, -4.9, 36.1), 'El Meliche'),
    f('monte_municipal', caja(-4.9, 36, -4.8, 36.1), 'Sierra Blanca'),
    f('coto', caja(-5, 36, -4.7, 36.1), 'La Albuqueria'),
    f('senal_privado', caja(-4.75, 36.05, -4.74, 36.06)),
    f('paso_publico', caja(-4.76, 36.0, -4.759, 36.1), 'Cordel de Benahavís a Ojén'),
  ];
  it('monte público de la Junta manda aunque haya coto', () => {
    const t = etiquetaTitularidad(capa, 36.05, -4.95);
    expect(t).toEqual({ clase: 'monte_junta', monte: 'El Meliche' });
    expect(textoTitularidad(t)).toBe('Monte público (Junta) · El Meliche');
    expect(esPublico(t)).toBe(true);
  });
  it('monte municipal: consulta al ayuntamiento', () => {
    expect(textoTitularidad(etiquetaTitularidad(capa, 36.05, -4.85))).toBe('Monte público municipal: consulta al ayuntamiento · Sierra Blanca');
  });
  it('fuera de los montes: probablemente privado; coto y valla solo refuerzan', () => {
    const t = etiquetaTitularidad(capa, 36.055, -4.745);
    expect(t.clase).toBe('privado');
    expect(t.refuerzos).toEqual(['coto', 'senal_privado']);
    expect(textoTitularidad(t)).toBe(TEXTO_TITULARIDAD.privado);
    expect(detallesTitularidad(t)[0]).toContain('coto de caza («La Albuqueria»)');
    expect(esPublico(t)).toBe(false);
    expect(etiquetaTitularidad([], 36.5, -4.8)).toEqual({ clase: 'privado' });
  });
  it('paso público: «no recoger fuera», y sigue siendo privado', () => {
    const t = etiquetaTitularidad(capa, 36.05, -4.7595);
    expect(t.clase).toBe('privado');
    expect(t.paso).toBe(true);
    expect(detallesTitularidad(t)).toContain('Cordel de Benahavís a Ojén: paso público, no recoger fuera');
  });
  it('cita la norma y nunca habla de comestibilidad', () => {
    expect(NORMA_TITULARIDAD).toMatch(/Ley 43\/2003.*art\. 36/);
    expect(NORMA_TITULARIDAD).toMatch(/Resolución de 23-09-2026 \(BOJA 196\), punto 8/);
    expect(`${AVISO_TITULARIDAD} ${NORMA_TITULARIDAD} ${Object.values(TEXTO_TITULARIDAD).join(' ')}`).not.toMatch(/comestible|se puede comer/i);
  });
});
