import { describe, expect, it } from 'vitest';
import { especiesDeValor, GRUPOS, grupoDe, gruposDe, topGrupo, valorGrupo } from './grupos';
import type { Opciones, SitioCandidato, SitiosJson } from './ranking';

const MARBELLA = ['boletus_aereus', 'boletus_aestivalis', 'boletus_edulis', 'boletus_pinophilus', 'amanita_caesarea', 'lactarius_deliciosus',
  'lactarius_sanguifluus', 'cantharellus_cibarius', 'amanita_ponderosa', 'macrolepiota_procera', 'pleurotus_eryngii', 'terfezia_arenaria'];
const ALICANTE = ['boletus_aereus', 'lactarius_deliciosus', 'lactarius_sanguifluus', 'pleurotus_eryngii', 'hygrophorus_latitabundus',
  'suillus_collinitus', 'lepista_nuda', 'agaricus_campestris', 'hydnum_repandum', 'morchella_spp', 'terfezia_claveryi'];

describe('taxonomía de grupos', () => {
  it('ninguna especie está en dos grupos y los ids de grupo son únicos', () => {
    const vistos = new Set<string>();
    for (const g of GRUPOS) for (const e of g.especies) { expect(vistos.has(e)).toBe(false); vistos.add(e); }
    expect(new Set(GRUPOS.map((g) => g.id)).size).toBe(GRUPOS.length);
  });
  it('todas las especies modeladas de Marbella y Alicante tienen grupo (ninguna en «otras»)', () => {
    for (const id of [...MARBELLA, ...ALICANTE]) expect(grupoDe(id).id, id).not.toBe('otras');
  });
  it('Boletus agrupa las cuatro; níscalos las dos Lactarius; trufas a las Terfezia de ambas regiones', () => {
    expect(gruposDe(MARBELLA).find((g) => g.grupo.id === 'boletus')!.especies)
      .toEqual(['boletus_aereus', 'boletus_aestivalis', 'boletus_edulis', 'boletus_pinophilus']);
    expect(grupoDe('lactarius_sanguifluus').id).toBe('niscalos');
    expect(grupoDe('terfezia_claveryi').id).toBe('trufas');
    expect(grupoDe('tuber_melanosporum').id).toBe('trufas');
    expect(grupoDe('suillus_bellinii').id).toBe('babosillos');
  });
  it('las Amanita tóxicas y los Lactarius tóxicos no entran en grupos de valor', () => {
    for (const id of ['amanita_phalloides', 'amanita_muscaria', 'amanita_pantherina', 'lactarius_torminosus', 'lactarius_chrysorrheus'])
      expect(grupoDe(id).id, id).toBe('otras');
  });
  it('por región solo salen los grupos con especies, en el orden de GRUPOS', () => {
    const ids = gruposDe(ALICANTE).map((g) => g.grupo.id);
    expect(ids).not.toContain('amanita');
    expect(ids).toContain('babosillos');
    expect(ids.indexOf('boletus')).toBeLessThan(ids.indexOf('niscalos'));
    expect(gruposDe(['raro_x']).map((g) => g.grupo.id)).toEqual(['otras']);
  });
  it('especiesDeValor: grupo → sus especies de la región; especie → ella sola', () => {
    expect(especiesDeValor(valorGrupo('boletus'), ALICANTE)).toEqual(['boletus_aereus']);
    expect(especiesDeValor(valorGrupo('niscalos'), MARBELLA)).toEqual(['lactarius_deliciosus', 'lactarius_sanguifluus']);
    expect(especiesDeValor('amanita_caesarea', MARBELLA)).toEqual(['amanita_caesarea']);
    expect(especiesDeValor('amanita_caesarea', ALICANTE)).toEqual([]);
    expect(especiesDeValor(valorGrupo('nada'), MARBELLA)).toEqual([]);
  });
});

const sitio = (id: number, lat: number, lon: number, punt = 80): SitioCandidato =>
  ({ id, lat, lon, punt_media: punt, area_ha: 10, punt_max: punt, t_pie_min: 5, subida_m: 10, dist_camino_m: 50, aparcamiento_id: null, restringido: false, meteo_id: 1 } as unknown as SitioCandidato);
const op: Opciones = { estadoEn: () => 'verde', fiabilidad: () => 'buena', maxDificultad: null, soloPublicos: false } as unknown as Opciones;

describe('topGrupo', () => {
  const datos: SitiosJson = { version: 2, generado: '', factor_citas: false, especies: {
    boletus_edulis: [sitio(1, 36.5, -4.9, 90), sitio(2, 36.7, -4.7, 50)],
    boletus_aereus: [sitio(3, 36.5005, -4.9, 85), sitio(4, 36.9, -4.5, 70)],
    lactarius_deliciosus: [sitio(5, 36.6, -4.8, 99)],
  } } as SitiosJson;
  it('combina las especies del grupo, ordena por puntuación y no mezcla otros grupos', () => {
    const f = topGrupo(datos, ['boletus_edulis', 'boletus_aereus'], op);
    expect(f.every((x) => x.especies.every((e) => e.startsWith('boletus_')))).toBe(true);
    expect(f[0].principal.sitio.id).toBe(1);
    for (let i = 1; i < f.length; i++) expect(f[i - 1].principal.score).toBeGreaterThanOrEqual(f[i].principal.score);
  });
  it('desduplica sitios a menos de 300 m en una sola fila con las dos especies', () => {
    const f = topGrupo(datos, ['boletus_edulis', 'boletus_aereus'], op);
    expect(f).toHaveLength(3);
    expect(f[0].especies).toEqual(['boletus_edulis', 'boletus_aereus']);
  });
  it('respeta n y tolera especies sin sitios', () => {
    expect(topGrupo(datos, ['boletus_edulis', 'boletus_aereus', 'boletus_pinophilus'], op, 2)).toHaveLength(2);
    expect(topGrupo(datos, ['boletus_pinophilus'], op)).toEqual([]);
  });
});
