import { describe, expect, it } from 'vitest';
import { avisosNavegacion, estadoNavegacion, FUERA_SENDERO_M, LLEGADA_M, subidaRestante, type Sendero } from './navegar';

const M = 1 / 111195;          // grados de latitud por metro
const k = Math.cos((36.5 * Math.PI) / 180);
const DEST = { lat: 36.5 + 1000 * M, lon: -5 };
/** Sendero recto hacia el norte de 1 km, del aparcamiento (36.5, -5) al destino, con vértices cada 250 m. */
const SENDERO: Sendero = {
  linea: [0, 250, 500, 750, 1000].map((d) => [-5, 36.5 + d * M] as [number, number]),
  dist: [0, 250, 500, 750, 1000],
  alt: [400, 450, 440, 500, 520],
};

describe('subida restante por el perfil', () => {
  it('desde el inicio suma todas las subidas', () => {
    expect(subidaRestante(SENDERO.dist!, SENDERO.alt!, 0)).toBe(50 + 60 + 20);
  });
  it('a mitad de un tramo interpola', () => {
    // a 125 m: 425 → 450 (+25), 440, 500 (+60), 520 (+20)
    expect(subidaRestante(SENDERO.dist!, SENDERO.alt!, 125)).toBe(105);
  });
  it('al final no queda nada; sin altitudes, null', () => {
    expect(subidaRestante(SENDERO.dist!, SENDERO.alt!, 1000)).toBe(0);
    expect(subidaRestante([0, 10], [NaN, NaN], 0)).toBeNull();
  });
});

describe('estado de la navegación', () => {
  it('sin sendero: línea recta y rumbo', () => {
    const e = estadoNavegacion({ lat: 36.5, lon: -5 }, DEST, null);
    expect(e.medida).toBe('recta');
    expect(e.restante_m).toBeCloseTo(1000, -1);
    expect(e.rumbo).toBeCloseTo(0, 3);
    expect(e.fuera).toBeNull();
    expect(e.llegado).toBe(false);
  });
  it('llegada a menos de 30 m', () => {
    expect(estadoNavegacion({ lat: DEST.lat - 25 * M, lon: -5 }, DEST, null).llegado).toBe(true);
    expect(estadoNavegacion({ lat: DEST.lat - 35 * M, lon: -5 }, DEST, null).llegado).toBe(false);
    expect(LLEGADA_M).toBe(30);
  });
  it('lejos del sendero sin haber estado en él: no avisa', () => {
    const e = estadoNavegacion({ lat: 36.4, lon: -5 }, DEST, SENDERO);
    expect(e.unido).toBe(false);
    expect(e.fuera).toBe(false);
    expect(e.medida).toBe('recta');
  });
  it('en el sendero: lo que queda por él y la subida restante', () => {
    const e = estadoNavegacion({ lat: 36.5 + 500 * M, lon: -5 + (10 * M) / k }, DEST, SENDERO);
    expect(e.unido).toBe(true);
    expect(e.fuera).toBe(false);
    expect(e.medida).toBe('sendero');
    expect(e.restante_m).toBeCloseTo(500, -1);
    expect(e.subidaSendero_m).toBe(80);
  });
  it('salirse más de 50 m tras haber estado en él', () => {
    const fuera = { lat: 36.5 + 500 * M, lon: -5 + ((FUERA_SENDERO_M + 20) * M) / k };
    const e = estadoNavegacion(fuera, DEST, SENDERO, true);
    expect(e.fuera).toBe(true);
    expect(e.aSendero_m).toBeCloseTo(70, -1);
    expect(e.medida).toBe('recta');
  });
});

describe('avisos', () => {
  const base = estadoNavegacion({ lat: 36.5, lon: -5 }, DEST, SENDERO);
  it('llegada y salida del sendero una sola vez', () => {
    const fuera = { ...base, fuera: true };
    expect(avisosNavegacion(base, fuera)).toEqual(['fuera']);
    expect(avisosNavegacion(fuera, fuera)).toEqual([]);
    expect(avisosNavegacion(fuera, { ...base, fuera: false })).toEqual(['vuelta']);
    expect(avisosNavegacion(base, { ...base, llegado: true })).toEqual(['llegada']);
    expect(avisosNavegacion(null, { ...base, llegado: true })).toEqual(['llegada']);
    expect(avisosNavegacion(fuera, { ...base, fuera: false, llegado: true })).toEqual(['llegada']);
  });
});
