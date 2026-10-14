// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EXPLICACION_FIABILIDAD, insigniaFiabilidad, nivelFiabilidad, textoFiabilidad } from './fiabilidad';

describe('fiabilidad por especie', () => {
  it('texto de cada nivel', () => {
    expect(textoFiabilidad('buena')).toBe('Mapa comprobado: acierta bien');
    expect(textoFiabilidad('media')).toBe('Mapa comprobado: acierta a medias');
    expect(textoFiabilidad('baja')).toBe('Mapa comprobado: acierta poco');
    expect(textoFiabilidad('sin_validar')).toBe('Mapa sin comprobar');
  });
  it('lo ausente o desconocido es «sin validar»', () => {
    expect(nivelFiabilidad(undefined)).toBe('sin_validar');
    expect(nivelFiabilidad('excelente')).toBe('sin_validar');
    expect(nivelFiabilidad('toString')).toBe('sin_validar');
  });
  it('la insignia lleva el nivel y la explicación como tooltip', () => {
    const s = insigniaFiabilidad('baja');
    expect(s.textContent).toBe('Mapa comprobado: acierta poco');
    expect(s.dataset.fiabilidad).toBe('baja');
    expect(s.title).toBe(EXPLICACION_FIABILIDAD);
    expect(EXPLICACION_FIABILIDAD).not.toMatch(/[—–]/);
  });
});
