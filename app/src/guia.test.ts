import { describe, expect, it } from 'vitest';
import { agrupar, binomio, coincide, ETIQUETA_GRUPO, filtrar, nombreComun, normalizar, ORDEN_GRUPOS, urlFoto, type Ficha } from './guia';
import datos from '../../guia/especies.json';

const fichas = datos as Ficha[];
const ids = (l: Ficha[]) => l.map((f) => f.id);

describe('guía: normalización y búsqueda', () => {
  it('quita tildes y diéresis y pasa a minúsculas', () => {
    expect(normalizar('Amanita de los Césares')).toBe('amanita de los cesares');
    expect(normalizar('  PINGÜINO   ñandú ')).toBe('pinguino nandu');
    expect(normalizar('amanita_caesarea')).toBe('amanita caesarea');
  });
  it('«cesar» encuentra la oronja por su nombre común con tilde', () => {
    expect(ids(filtrar(fichas, 'cesar'))).toContain('amanita_caesarea');
  });
  it('busca por nombre común, científico o id, sin importar tildes ni mayúsculas', () => {
    expect(ids(filtrar(fichas, 'NÍSCALO'))).toEqual(ids(filtrar(fichas, 'niscalo')));
    expect(ids(filtrar(fichas, 'phalloides'))).toEqual(['amanita_phalloides']);
    expect(ids(filtrar(fichas, 'boletus edulis'))).toEqual(['boletus_edulis']);
    const f = fichas.find((x) => x.id === 'boletus_edulis')!;
    expect(coincide(f, 'calabaza')).toBe(true);
    expect(coincide(f, 'oronja')).toBe(false);
    expect(coincide(f, '')).toBe(true);
  });
  it('el filtro de grupo se combina con la búsqueda', () => {
    expect(filtrar(fichas, '', 'mortal').every((f) => f.grupo === 'mortal')).toBe(true);
    expect(ids(filtrar(fichas, 'amanita', 'mortal')).sort()).toEqual(['amanita_phalloides', 'amanita_verna']);
    expect(filtrar(fichas, 'zzz')).toEqual([]);
  });
});

describe('guía: agrupación y etiquetas', () => {
  it('agrupa en el orden fijado, sin grupos vacíos, ordenado por nombre científico', () => {
    const g = agrupar(fichas);
    expect(g.map((x) => x.grupo)).toEqual(ORDEN_GRUPOS);
    expect(g.reduce((n, x) => n + x.fichas.length, 0)).toBe(fichas.length);
    for (const x of g) {
      expect(x.fichas.every((f) => f.grupo === x.grupo)).toBe(true);
      const nombres = x.fichas.map((f) => f.nombre_cientifico);
      expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, 'es')));
    }
    expect(agrupar(filtrar(fichas, '', 'toxica')).map((x) => x.grupo)).toEqual(['toxica']);
  });
  it('ninguna etiqueta dice «comestible» y la mortal lo dice en mayúsculas', () => {
    for (const t of Object.values(ETIQUETA_GRUPO)) expect(t.toLowerCase()).not.toContain('comestible');
    expect(ETIQUETA_GRUPO.apreciada).toBe('Apreciada');
    expect(ETIQUETA_GRUPO.comestible_menor).toBe('Poco valor');
    expect(ETIQUETA_GRUPO.mortal).toContain('MORTAL');
  });
  it('nombres para mostrar y URL de foto versionada', () => {
    const f = fichas.find((x) => x.id === 'boletus_edulis')!;
    expect(binomio(f)).toBe('Boletus edulis');
    expect(nombreComun(f)).toBe('Calabaza');
    expect(urlFoto('fotos/a.jpg', { especies: 'x', fotos: { 'fotos/a.jpg': 'abc' } })).toBe('guia/fotos/a.jpg?v=abc');
    expect(urlFoto('fotos/a.jpg', null)).toBe('guia/fotos/a.jpg');
  });
  it('todas las confusiones apuntan a fichas existentes', () => {
    const todas = new Set(ids(fichas));
    for (const f of fichas) for (const c of f.no_confundir_con) expect(todas.has(c.id)).toBe(true);
  });
});

describe('especies del mapa ↔ fichas', () => {
  it('boletus_aestivalis (mapa) abre la ficha de boletus_reticulatus, y al revés', async () => {
    const { fichaDeEspecieMapa, especieMapaDeFicha } = await import('./guia');
    expect(fichaDeEspecieMapa('boletus_aestivalis')).toBe('boletus_reticulatus');
    expect(fichaDeEspecieMapa('amanita_caesarea')).toBe('amanita_caesarea');
    const mapa = ['amanita_caesarea', 'boletus_aestivalis', 'boletus_edulis'];
    expect(especieMapaDeFicha('boletus_reticulatus', mapa)).toBe('boletus_aestivalis');
    expect(especieMapaDeFicha('amanita_caesarea', mapa)).toBe('amanita_caesarea');
    expect(especieMapaDeFicha('lactarius_deliciosus', mapa)).toBe('lactarius_deliciosus');
  });
  it('lactarius_sanguifluus se describe en la ficha del níscalo; la ficha del níscalo sigue llevando a L. deliciosus', async () => {
    const { fichaDeEspecieMapa, especieMapaDeFicha, DESCRITA_EN_OTRA_FICHA } = await import('./guia');
    expect(fichaDeEspecieMapa('lactarius_sanguifluus')).toBe('lactarius_deliciosus');
    expect(DESCRITA_EN_OTRA_FICHA.has('lactarius_sanguifluus')).toBe(true);
    expect(especieMapaDeFicha('lactarius_deliciosus', ['lactarius_sanguifluus', 'lactarius_deliciosus'])).toBe('lactarius_deliciosus');
    expect(especieMapaDeFicha('lactarius_deliciosus', ['lactarius_sanguifluus'])).toBe('lactarius_sanguifluus');
  });
});
