import { describe, expect, it } from 'vitest';
import { claseTerreno, factorTerreno, FACTOR_TERRENO, parsearTerreno, textoTerreno, textoCortoTerreno, type Terreno } from './comodidad';

const t = (desnivel_km: number, extra: Partial<Terreno> = {}): Terreno =>
  ({ desnivel_km, pendiente_media: Math.round(desnivel_km / 10), pendiente_max: Math.round(desnivel_km / 5), esfuerzo: 1.2, ...extra });

describe('clase de terreno', () => {
  it('umbrales provisionales: < 40 cómodo, 40–80 algo de sube y baja, > 80 quebrado', () => {
    expect(claseTerreno(0)).toBe('comodo');
    expect(claseTerreno(39.9)).toBe('comodo');
    expect(claseTerreno(40)).toBe('medio');
    expect(claseTerreno(80)).toBe('medio');
    expect(claseTerreno(81)).toBe('quebrado');
  });
  it('factor: ×1 cómodo, ×0,85 medio, ×0,65 quebrado; sin dato ×1', () => {
    expect(FACTOR_TERRENO).toEqual({ comodo: 1, medio: 0.85, quebrado: 0.65 });
    expect(factorTerreno(t(25))).toBe(1);
    expect(factorTerreno(t(60))).toBe(0.85);
    expect(factorTerreno(t(110))).toBe(0.65);
    expect(factorTerreno(undefined)).toBe(1);
    expect(factorTerreno(null)).toBe(1);
  });
});

describe('textos', () => {
  it('cómodo, medio y quebrado con su desnivel por km', () => {
    expect(textoTerreno(t(25))).toBe('Terreno cómodo · 25 m de desnivel por km.');
    expect(textoTerreno(t(60))).toBe('Algo de sube y baja · 60 m de desnivel por km (pendiente media 6 %), lo que baja algo la puntuación.');
    expect(textoTerreno(t(110))).toBe('Terreno quebrado · 110 m/km: mucho sube y baja (pendiente media 11 %), lo que baja la puntuación.');
    expect(textoCortoTerreno(t(25))).toBe('Terreno cómodo');
    expect(textoCortoTerreno(t(60))).toBe('Algo de sube y baja');
    expect(textoCortoTerreno(t(110))).toBe('Terreno quebrado');
  });
  it('añade el camino de acceso si lo hay', () => {
    expect(textoTerreno(t(25, { acceso_desnivel_km: 140 }))).toBe('Terreno cómodo · 25 m de desnivel por km. El camino desde el coche: 140 m/km.');
  });
  it('sin dato, nada', () => {
    expect(textoTerreno(undefined)).toBe('');
    expect(textoCortoTerreno(undefined)).toBe('');
  });
  it('nunca habla de comer', () => {
    for (const x of [10, 60, 300]) expect(textoTerreno(t(x, { acceso_desnivel_km: 50 }))).not.toMatch(/comestib|se puede comer/i);
  });
});

describe('parsearTerreno', () => {
  it('acepta el campo de sitios.json v5 y rechaza lo raro', () => {
    expect(parsearTerreno({ desnivel_km: 25, pendiente_media: 3, pendiente_max: 8, esfuerzo: 1.1 })).toEqual(t(25, { pendiente_media: 3, pendiente_max: 8, esfuerzo: 1.1 }));
    expect(parsearTerreno({ desnivel_km: 25, pendiente_media: 3, pendiente_max: 8, esfuerzo: 1.1, acceso_desnivel_km: 'x' })).toEqual(
      { desnivel_km: 25, pendiente_media: 3, pendiente_max: 8, esfuerzo: 1.1 });
    expect(parsearTerreno({ desnivel_km: -1 })).toBeNull();
    expect(parsearTerreno({ desnivel_km: 'a' })).toBeNull();
    expect(parsearTerreno(null)).toBeNull();
    expect(parsearTerreno(undefined)).toBeNull();
  });
});
