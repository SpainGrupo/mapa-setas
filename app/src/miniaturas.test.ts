import { describe, expect, it } from 'vitest';
import { fichaDeEspecieMapa, miniaturaEspecie, type Ficha, type IndiceGuia } from './guia';
import datos from '../../guia/especies.json';

const fichas = datos as Ficha[];
// Índice como el que escribe scripts/enlazar-guia.mjs: una miniatura por ficha con al menos una foto.
const indice: IndiceGuia = { especies: 'x', fotos: {},
  miniaturas: Object.fromEntries(fichas.filter((f) => f.fotos.length).map((f) => [f.id, `h${f.id.length}`])) };

describe('selector de especie: especie del mapa → miniatura', () => {
  it('usa la miniatura de la ficha con el mismo id, versionada con su hash', () => {
    expect(miniaturaEspecie('amanita_caesarea', indice)).toBe(`guia/miniaturas/amanita_caesarea.jpg?v=${indice.miniaturas!.amanita_caesarea}`);
  });
  it('Boletus aestivalis reutiliza la ficha (y la foto) de B. reticulatus', () => {
    expect(fichaDeEspecieMapa('boletus_aestivalis')).toBe('boletus_reticulatus');
    expect(miniaturaEspecie('boletus_aestivalis', indice)).toMatch(/^guia\/miniaturas\/boletus_reticulatus\.jpg\?v=/);
  });
  it('sin ficha, sin miniatura generada o sin índice → null (icono neutro)', () => {
    expect(miniaturaEspecie('especie_inventada', indice)).toBeNull();
    expect(miniaturaEspecie('amanita_caesarea', { especies: 'x', fotos: {} })).toBeNull();
    expect(miniaturaEspecie('amanita_caesarea', null)).toBeNull();
  });
  it('las especies del mapa actuales tienen ficha con foto en la guía', () => {
    const ids = ['boletus_aereus', 'boletus_aestivalis', 'boletus_edulis', 'boletus_pinophilus', 'amanita_caesarea',
      'lactarius_deliciosus', 'lactarius_sanguifluus', 'cantharellus_cibarius', 'amanita_ponderosa', 'macrolepiota_procera',
      'pleurotus_eryngii', 'terfezia_arenaria'];   // las 12 del manifest (pipeline v2)
    for (const id of ids) {
      const f = fichas.find((x) => x.id === fichaDeEspecieMapa(id));
      expect(f?.fotos.length, id).toBeGreaterThan(0);
      expect(miniaturaEspecie(id, indice), id).toContain(`/${f!.id}.jpg`);
    }
  });
});
