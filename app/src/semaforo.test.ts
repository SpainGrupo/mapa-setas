import { describe, expect, it } from 'vitest';
import { semaforo, sumarDias, type Reglas } from './semaforo';
import type { Dia } from './meteo';

const HOY = '2026-10-13';
const AEREUS: Reglas = { episodio_mm: 25, ventana_dias: [8, 20], tmin_media: [8, 18], tmax_media: [15, 27] };

/** 30 días pasados + hoy + 6 de previsión; `lluvia` = {díasRelativosAHoy: mm} (negativo = pasado). */
function serie(lluvia: Record<number, number> = {}, tmin = 12, tmax = 22): Dia[] {
  return Array.from({ length: 37 }, (_, i) => {
    const rel = i - 30;
    return { fecha: sumarDias(HOY, rel), lluvia: lluvia[rel] ?? 0, tmin, tmax };
  });
}

describe('semaforo', () => {
  it('30 mm hace 12 días con temperatura templada → verde, hasta el fin de la ventana', () => {
    const r = semaforo(serie({ [-12]: 30 }), AEREUS, HOY);
    expect(r.estado).toBe('verde');
    expect(r.motivo).toMatch(/ventana abierta/);
    expect(r.hasta).toBe(sumarDias(HOY, -12 + 20));
    expect(r.episodio).toBe(sumarDias(HOY, -12));
  });

  it('30 mm hace 3 días → amarillo «esperar» con desde = episodio + ventana mínima', () => {
    const r = semaforo(serie({ [-3]: 30 }), AEREUS, HOY);
    expect(r.estado).toBe('amarillo');
    expect(r.motivo).toMatch(/esperar/);
    expect(r.desde).toBe(sumarDias(HOY, -3 + 8));
  });

  it('seco 30 días → rojo «seco»', () => {
    const r = semaforo(serie({ [-20]: 5, [-10]: 8 }), AEREUS, HOY);
    expect(r).toMatchObject({ estado: 'rojo' });
    expect(r.motivo).toMatch(/seco/);
  });

  it('30 mm hace 25 días → rojo «ventana pasada»', () => {
    const r = semaforo(serie({ [-25]: 30 }), AEREUS, HOY);
    expect(r.estado).toBe('rojo');
    expect(r.motivo).toMatch(/ventana pasada/);
  });

  it('30 mm hace 12 días con frío (tmin 3) → amarillo por temperatura, indicando cuál falla', () => {
    const r = semaforo(serie({ [-12]: 30 }, 3, 22), AEREUS, HOY);
    expect(r.estado).toBe('amarillo');
    expect(r.motivo).toMatch(/lluvia buena, temperatura justa/);
    expect(r.motivo).toMatch(/mínimas/);
    expect(r.motivo).not.toMatch(/máximas/);
  });

  it('esperar con temperatura fuera de rango: el motivo lo dice', () => {
    const r = semaforo(serie({ [-3]: 30 }, 12, 32), AEREUS, HOY);
    expect(r.estado).toBe('amarillo');
    expect(r.motivo).toMatch(/esperar/);
    expect(r.motivo).toMatch(/máximas/);
  });

  it('lluvia repartida en 3 días (10+10+10) cuenta como episodio; el episodio acaba el último día', () => {
    const r = semaforo(serie({ [-14]: 10, [-13]: 10, [-12]: 10 }), AEREUS, HOY);
    expect(r.estado).toBe('verde');
    expect(r.episodio).toBe(sumarDias(HOY, -12));
    // repartida en 4 días no llega en ninguna ventana de 3
    expect(semaforo(serie({ [-15]: 8, [-14]: 8, [-13]: 8, [-12]: 8 }), AEREUS, HOY).estado).toBe('rojo');
  });

  it('episodio solo en la previsión → amarillo «lluvia prevista el DD/MM»', () => {
    const r = semaforo(serie({ [2]: 30 }), AEREUS, HOY);
    expect(r.estado).toBe('amarillo');
    expect(r.motivo).toMatch(/lluvia prevista el 15\/10/);
    expect(r.desde).toBe(sumarDias(HOY, 2 + 8));
  });

  it('ventana abierta y además lluvia prevista: sigue verde y el motivo añade la lluvia prevista', () => {
    const r = semaforo(serie({ [-12]: 30, [3]: 40 }), AEREUS, HOY);
    expect(r.estado).toBe('verde');
    expect(r.motivo).toMatch(/lluvia prevista el 16\/10/);
  });

  it('caché de más de 72 h → gris «datos antiguos»', () => {
    const r = semaforo(serie({ [-12]: 30 }), AEREUS, HOY, { edadHoras: 73 });
    expect(r).toEqual({ estado: 'gris', motivo: 'datos antiguos' });
    expect(semaforo(serie({ [-12]: 30 }), AEREUS, HOY, { edadHoras: 71 }).estado).toBe('verde');
  });

  it('con 2 episodios manda el más reciente', () => {
    const r = semaforo(serie({ [-25]: 40, [-3]: 30 }), AEREUS, HOY);
    expect(r.estado).toBe('amarillo');
    expect(r.episodio).toBe(sumarDias(HOY, -3));
    const r2 = semaforo(serie({ [-28]: 40, [-12]: 30 }), AEREUS, HOY);
    expect(r2.estado).toBe('verde');
    expect(r2.episodio).toBe(sumarDias(HOY, -12));
  });

  it('límites de la ventana inclusivos', () => {
    expect(semaforo(serie({ [-8]: 30 }), AEREUS, HOY).estado).toBe('verde');
    expect(semaforo(serie({ [-20]: 30 }), AEREUS, HOY).estado).toBe('verde');
    expect(semaforo(serie({ [-21]: 30 }), AEREUS, HOY).estado).toBe('rojo');
    expect(semaforo(serie({ [-7]: 30 }), AEREUS, HOY).estado).toBe('amarillo');
  });

  it('el umbral de episodio es inclusivo', () => {
    expect(semaforo(serie({ [-12]: 25 }), AEREUS, HOY).estado).toBe('verde');
    expect(semaforo(serie({ [-12]: 24.9 }), AEREUS, HOY).estado).toBe('rojo');
  });

  it('media de temperaturas de los últimos 10 días (hoy incluido), no de toda la serie', () => {
    const s = serie({ [-12]: 30 }).map((d, i) => (i < 21 ? { ...d, tmin: 0 } : d));   // frío antes de los 10 últimos días
    expect(semaforo(s, AEREUS, HOY).estado).toBe('verde');
  });

  it('hoy fuera de la serie → gris', () => {
    expect(semaforo(serie(), AEREUS, '2026-12-01').estado).toBe('gris');
  });
});
