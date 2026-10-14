import { describe, expect, it } from 'vitest';
import { dentroDeDificultad, dificultad, pasoM, perfil, seguir, textoDistancia, FUERA_DE_RUTA_M } from './ruta';

describe('dificultad', () => {
  it.each([
    [0, 0, 'facil'], [30, 150, 'facil'], [31, 0, 'moderada'], [10, 151, 'moderada'], [60, 350, 'moderada'],
    [61, 10, 'dificil'], [20, 351, 'dificil'], [120, 700, 'dificil'], [121, 0, 'muy_dificil'], [10, 701, 'muy_dificil'],
  ])('%i min, +%i m → %s', (t, s, d) => expect(dificultad(t, s)).toBe(d));
  it('filtro de dificultad máxima', () => {
    expect(dentroDeDificultad('dificil', null)).toBe(true);
    expect(dentroDeDificultad('dificil', 'dificil')).toBe(true);
    expect(dentroDeDificultad('dificil', 'moderada')).toBe(false);
    expect(dentroDeDificultad('facil', 'facil')).toBe(true);
    expect(dentroDeDificultad('muy_dificil', 'dificil')).toBe(false);
  });
});

describe('perfil y distancia', () => {
  it('100 m en recto y 141 m en diagonal', () => {
    expect(pasoM({ fila: 0, col: 0 }, { fila: 0, col: 1 }, 100)).toBe(100);
    expect(pasoM({ fila: 0, col: 0 }, { fila: 1, col: 1 }, 100)).toBeCloseTo(141.42, 2);
  });
  it('acumula distancia, subida y bajada; ignora los huecos sin dato', () => {
    const celdas = [{ fila: 5, col: 0 }, { fila: 5, col: 1 }, { fila: 4, col: 2 }, { fila: 3, col: 2 }, { fila: 2, col: 2 }];
    const p = perfil(celdas, [500, 520, NaN, 510, 560], 100);
    expect(p.dist.map((d) => Math.round(d))).toEqual([0, 100, 241, 341, 441]);
    expect(Math.round(p.total_m)).toBe(441);
    expect(p).toMatchObject({ subida_m: 70, bajada_m: 10, min: 500, max: 560 });
  });
  it('sin altitudes: NaN y cero de subida', () => {
    const p = perfil([{ fila: 0, col: 0 }], [NaN], 100);
    expect(p.total_m).toBe(0);
    expect(p.subida_m).toBe(0);
    expect(p.min).toBeNaN();
  });
  it('textos de distancia', () => {
    expect(textoDistancia(0)).toBe('0 m');
    expect(textoDistancia(847)).toBe('850 m');
    expect(textoDistancia(1234)).toBe('1,2 km');
    expect(textoDistancia(10000)).toBe('10,0 km');
  });
});

describe('seguir con GPS', () => {
  // Ruta en L: 0,01° al este (≈ 895 m a 36,5°) y luego 0,01° al norte (≈ 1113 m).
  const lat0 = 36.5, lon0 = -5;
  const linea: [number, number][] = [[lon0, lat0], [lon0 + 0.01, lat0], [lon0 + 0.01, lat0 + 0.01]];
  it('al salir del coche queda toda la ruta', () => {
    const s = seguir(linea, { lat: lat0, lon: lon0 });
    expect(s.recorrido_m).toBe(0);
    expect(s.restante_m).toBeGreaterThan(1990);
    expect(s.restante_m).toBeLessThan(2020);
    expect(s.fuera).toBe(false);
  });
  it('a mitad del primer tramo, un poco desviado: dentro de ruta', () => {
    const s = seguir(linea, { lat: lat0 + 30 / 111320, lon: lon0 + 0.005 });
    expect(s.aRuta_m).toBeCloseTo(30, 0);
    expect(s.fuera).toBe(false);
    expect(s.recorrido_m).toBeGreaterThan(440);
    expect(s.recorrido_m).toBeLessThan(455);
  });
  it(`a más de ${FUERA_DE_RUTA_M} m: fuera de ruta`, () => {
    const s = seguir(linea, { lat: lat0 + 0.005, lon: lon0 + 0.005 });
    expect(s.fuera).toBe(true);
    expect(s.aRuta_m).toBeGreaterThan(400);
  });
  it('en el destino no queda nada', () => {
    const s = seguir(linea, { lat: lat0 + 0.01, lon: lon0 + 0.01 });
    expect(s.restante_m).toBeLessThan(1);
    expect(s.cercano[1]).toBeCloseTo(lat0 + 0.01, 6);
  });
  it('ruta de un solo punto', () => {
    expect(seguir([[lon0, lat0]], { lat: lat0, lon: lon0 })).toMatchObject({ restante_m: 0, fuera: false });
  });
});
