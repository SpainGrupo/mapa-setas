import { describe, expect, it } from 'vitest';
import { ayudaTerreno, claseDeTerreno, claseTerreno, factorTerreno, FACTOR_TERRENO, parsearTerreno, parsearUmbrales, textoTerreno, textoCortoTerreno, type Terreno } from './comodidad';

const t = (desnivel_km: number, extra: Partial<Terreno> = {}): Terreno =>
  ({ desnivel_km, pendiente_media: Math.round(desnivel_km / 10), pendiente_max: Math.round(desnivel_km / 5), esfuerzo: 1.2, ...extra });

describe('clase de terreno', () => {
  it('respaldo sin metadato de región: < 40 cómodo, 40–80 algo de sube y baja, > 80 quebrado', () => {
    expect(claseTerreno(0)).toBe('comodo');
    expect(claseTerreno(39.9)).toBe('comodo');
    expect(claseTerreno(40)).toBe('medio');
    expect(claseTerreno(80)).toBe('medio');
    expect(claseTerreno(81)).toBe('quebrado');
  });
  it('con los terciles de la región: < p33 cómodo, p33–p67 algo de sube y baja, > p67 quebrado (límites incluidos en el medio)', () => {
    const u = { comodo: 180, quebrado: 265 };
    expect(claseTerreno(0, u)).toBe('comodo');
    expect(claseTerreno(179.9, u)).toBe('comodo');
    expect(claseTerreno(180, u)).toBe('medio');
    expect(claseTerreno(265, u)).toBe('medio');
    expect(claseTerreno(265.1, u)).toBe('quebrado');
    expect(claseTerreno(150)).toBe('quebrado');            // sin umbrales de la región, el respaldo
    expect(claseDeTerreno(t(150, { umbrales: u }))).toBe('comodo');
    expect(claseDeTerreno(t(150))).toBe('quebrado');
  });
  it('el factor usa los umbrales del terreno, no los de respaldo', () => {
    const u = { comodo: 180, quebrado: 265 };
    expect(factorTerreno(t(150, { umbrales: u }))).toBe(1);
    expect(factorTerreno(t(200, { umbrales: u }))).toBe(0.85);
    expect(factorTerreno(t(300, { umbrales: u }))).toBe(0.65);
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
    expect(textoTerreno(t(25))).toBe('Terreno cómodo para la zona · 25 m de desnivel por km.');
    expect(textoTerreno(t(60))).toBe('Algo de sube y baja para la zona · 60 m de desnivel por km (pendiente media 6 %), lo que baja algo la puntuación.');
    expect(textoTerreno(t(110))).toBe('Terreno quebrado para la zona · 110 m/km: mucho sube y baja (pendiente media 11 %), lo que baja la puntuación.');
    expect(textoCortoTerreno(t(25))).toBe('Terreno cómodo para la zona · 25 m/km');
    expect(textoCortoTerreno(t(60))).toBe('Algo de sube y baja para la zona · 60 m/km');
    expect(textoCortoTerreno(t(110))).toBe('Terreno quebrado para la zona · 110 m/km');
  });
  it('la etiqueta sale bien en los límites de los terciles de la región', () => {
    const u = { comodo: 180, quebrado: 265 };
    expect(textoCortoTerreno(t(179, { umbrales: u }))).toBe('Terreno cómodo para la zona · 179 m/km');
    expect(textoCortoTerreno(t(180, { umbrales: u }))).toBe('Algo de sube y baja para la zona · 180 m/km');
    expect(textoCortoTerreno(t(265, { umbrales: u }))).toBe('Algo de sube y baja para la zona · 265 m/km');
    expect(textoCortoTerreno(t(266, { umbrales: u }))).toBe('Terreno quebrado para la zona · 266 m/km');
    expect(textoTerreno(t(150, { umbrales: u }))).toBe('Terreno cómodo para la zona · 150 m de desnivel por km.');
  });
  it('la ayuda explica que es relativo a la región y da los umbrales; sin ellos, los fijos', () => {
    const a = ayudaTerreno(t(150, { umbrales: { comodo: 180, quebrado: 265 } }));
    expect(a).toContain('relativo a la región');
    expect(a).toContain('tercio más llano de sus sitios (menos de 180 m/km)');
    expect(a).toContain('hasta 265');
    expect(a).toContain('tercio más movido');
    const b = ayudaTerreno(t(150));
    expect(b).toContain('Umbrales fijos');
    expect(b).toContain('menos de 40 m de desnivel por km');
    expect(ayudaTerreno(undefined)).toContain('Umbrales fijos');
    for (const x of [a, b]) expect(x).not.toMatch(/comestib|se puede comer/i);
  });
  it('añade el camino de acceso si lo hay', () => {
    expect(textoTerreno(t(25, { acceso_desnivel_km: 140 }))).toBe('Terreno cómodo para la zona · 25 m de desnivel por km. El camino desde el coche: 140 m/km.');
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

describe('parsearUmbrales', () => {
  it('acepta el metadato de sitios.json y rechaza lo raro', () => {
    expect(parsearUmbrales({ comodo: 180, quebrado: 265, metodo: 'terciles' })).toEqual({ comodo: 180, quebrado: 265 });
    expect(parsearUmbrales({ comodo: 100, quebrado: 100 })).toEqual({ comodo: 100, quebrado: 100 });
    expect(parsearUmbrales({ comodo: 300, quebrado: 100 })).toBeNull();
    expect(parsearUmbrales({ comodo: 'a', quebrado: 100 })).toBeNull();
    expect(parsearUmbrales({ comodo: -5, quebrado: 100 })).toBeNull();
    expect(parsearUmbrales(undefined)).toBeNull();
    expect(parsearUmbrales(null)).toBeNull();
  });
});
