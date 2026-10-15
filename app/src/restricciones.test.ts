import { describe, expect, it } from 'vitest';
import type { Geometry } from 'geojson';
import { aRestriccion, dentroDe, nombreLegible, orientativo, restriccionesEn, teselaDe, textoChip } from './restricciones';

const cuadrado = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const conHueco: Geometry = { type: 'Polygon', coordinates: [cuadrado(0, 0, 10, 10), cuadrado(4, 4, 6, 6)] };

describe('restricciones: punto en polígono', () => {
  it('dentro, fuera y dentro de un hueco', () => {
    expect(dentroDe(conHueco, 2, 2)).toBe(true);
    expect(dentroDe(conHueco, 5, 5)).toBe(false);
    expect(dentroDe(conHueco, 11, 2)).toBe(false);
  });
  it('MultiPolygon y geometrías que no son polígonos', () => {
    const multi: Geometry = { type: 'MultiPolygon', coordinates: [[cuadrado(0, 0, 1, 1)], [cuadrado(5, 5, 6, 6)]] };
    expect(dentroDe(multi, 5.5, 5.5)).toBe(true);
    expect(dentroDe(multi, 3, 3)).toBe(false);
    expect(dentroDe({ type: 'Point', coordinates: [0, 0] }, 0, 0)).toBe(false);
  });
  it('teselaDe coincide con el esquema XYZ (Sierra de las Nieves en z14) y se acota al borde', () => {
    expect(teselaDe(36.67638, -4.97927, 14)).toEqual({ x: 7965, y: 6395 });
    expect(teselaDe(0, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(teselaDe(89.9, 180, 2)).toEqual({ x: 3, y: 0 });
  });
});

describe('restricciones: textos', () => {
  it('nombres en mayúsculas pasan a forma legible', () => {
    expect(nombreLegible('SIERRAS DE TEJEDA, ALMIJARA Y ALHAMA')).toBe('Sierras de Tejeda, Almijara y Alhama');
    expect(nombreLegible('DEL ESTRECHO')).toBe('Del Estrecho');
    expect(nombreLegible('Los Alcornocales')).toBe('Los Alcornocales');
  });
  it('aRestriccion usa el texto del manifest si la entidad no lo trae, y el chip', () => {
    const r = aRestriccion({ tipo: 'parque_nacional', nombre: 'SIERRA DE LAS NIEVES', zona: 'Parque Nacional' }, { parque_nacional: 'Autorización.' });
    expect(r).toEqual({ tipo: 'parque_nacional', nombre: 'Sierra de las Nieves', zona: 'Parque Nacional', texto: 'Autorización.' });
    expect(textoChip(r)).toBe('Parque Nacional · Sierra de las Nieves');
    expect(textoChip(aRestriccion({ tipo: 'otro', zona: 'B. Zona X' }))).toBe('B. Zona X');
    expect(aRestriccion({}).texto).toBe('');
  });
  it('restriccionesEn: solo las que contienen el punto y sin duplicados (recinto partido entre teselas)', () => {
    const p = { tipo: 'zona_reserva', nombre: 'GRAZALEMA', texto: 't' };
    const fs = [{ properties: p, geometry: conHueco }, { properties: p, geometry: conHueco },
      { properties: { tipo: 'reserva_natural', nombre: 'LAGUNA' }, geometry: { type: 'Polygon', coordinates: [cuadrado(20, 20, 21, 21)] } as Geometry }];
    expect(restriccionesEn(fs, 2, 2).map((r) => r.nombre)).toEqual(['Grazalema']);
    expect(restriccionesEn(fs, 5, 5)).toEqual([]);
  });
});

describe('orientativo', () => {
  it('con BOJA da exactamente el texto de antes (e2e de Marbella)', () => {
    expect(orientativo(['BOJA'])).toBe('Información orientativa: comprueba la normativa vigente (BOJA) antes de recoger.');
  });
  it('varias normas sin repetir, y sin normas', () => {
    expect(orientativo(['DOGV', 'BORM', 'DOGV'])).toBe('Información orientativa: comprueba la normativa vigente (DOGV, BORM) antes de recoger.');
    expect(orientativo([])).toBe('Información orientativa: comprueba la normativa vigente antes de recoger.');
    expect(orientativo(['', 'DOCM'])).toBe('Información orientativa: comprueba la normativa vigente (DOCM) antes de recoger.');
  });
});
