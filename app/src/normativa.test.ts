import { describe, expect, it } from 'vitest';
import type { Geometry } from 'geojson';
import { ccaaEnPunto, PENDIENTE, textoCupo, vistaNormativa } from './normativa';
import type { EntradaLegal } from './manifest-region';

const cuadrado = (x0: number, y0: number, x1: number, y1: number): Geometry =>
  ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const CV: EntradaLegal = { id: 'comunitat_valenciana', nombre: 'Comunitat Valenciana', norma: 'DOGV', sigla: 'DOGV', cupo_kg_dia: null, texto: 'T', verificado: false, fuente_url: '' };
const MU: EntradaLegal = { id: 'region_murcia', nombre: 'Región de Murcia', norma: 'Decreto x (BORM núm. 1)', sigla: 'BORM', cupo_kg_dia: 2, texto: 'U', verificado: true, fuente_url: 'https://borm.es' };

describe('ccaaEnPunto', () => {
  it('ids de los polígonos que contienen el punto, sin repetir', () => {
    const fs = [{ properties: { id: 'comunitat_valenciana' }, geometry: cuadrado(-1, 38, 0, 39) },
      { properties: { id: 'comunitat_valenciana' }, geometry: cuadrado(-1, 38, 0, 39) },
      { properties: { id: 'region_murcia' }, geometry: cuadrado(-2, 37, -1, 38) }];
    expect(ccaaEnPunto(fs, 38.5, -0.5)).toEqual(['comunitat_valenciana']);
    expect(ccaaEnPunto(fs, 10, 10)).toEqual([]);
  });
  it('acepta los códigos cortos del pipeline (CV, MUR…) y descarta los desconocidos', () => {
    const fs = [{ properties: { id: 'CV' }, geometry: cuadrado(-1, 38, 0, 39) }, { properties: { id: 'XX' }, geometry: cuadrado(-1, 38, 0, 39) }];
    expect(ccaaEnPunto(fs, 38.5, -0.5)).toEqual(['comunitat_valenciana']);
  });
});

describe('vistaNormativa', () => {
  it('con punto dentro de una CCAA conocida: solo esa', () => {
    const v = vistaNormativa([CV, MU], ['region_murcia'], []);
    expect(v.ambito).toBe('punto');
    expect(v.entradas).toEqual([MU]);
    expect(v.nota).toBe('Información orientativa: comprueba la normativa vigente (BORM) antes de recoger.');
  });
  it('sin punto, o punto fuera de todas: todas las de la región (spec §4.4)', () => {
    expect(vistaNormativa([CV, MU], null, []).ambito).toBe('todas');
    expect(vistaNormativa([CV, MU], ['andalucia'], []).entradas).toEqual([CV, MU]);
  });
  it('legado sin legal: sin entradas y nota con las normas de legado (BOJA)', () => {
    expect(vistaNormativa([], null, ['BOJA'])).toEqual({ ambito: 'todas', entradas: [],
      nota: 'Información orientativa: comprueba la normativa vigente (BOJA) antes de recoger.' });
  });
});

describe('textos', () => {
  it('cupo y pendiente', () => {
    expect(textoCupo(3)).toBe('Cupo: hasta 3 kg por persona y día.');
    expect(textoCupo(1.5)).toBe('Cupo: hasta 1,5 kg por persona y día.');
    expect(PENDIENTE).toBe('Pendiente de verificar');
  });
});
