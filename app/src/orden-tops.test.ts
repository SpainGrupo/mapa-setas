import { describe, expect, it } from 'vitest';
import { clavesEntrada, ordenarTops, type ClavesOrden } from './orden-tops';
import type { Entrada, SitioCandidato } from './ranking';

const sitio = (id: number, o: Partial<SitioCandidato> = {}): SitioCandidato => ({ id, lat: 36.5, lon: -4.9, area_ha: 10, punt_media: 60, punt_max: 80,
  t_pie_min: 20, subida_m: 50, dist_camino_m: 100, aparcamiento_id: 1, restringido: false, meteo_id: 0, ...o });
const entrada = (id: number, score: number, o: Partial<SitioCandidato> = {}): Entrada =>
  ({ especie: 'x', sitio: sitio(id, o), estado: 'verde', dificultad: 'facil', score, puntuacion: 50 });
const k = (id: number, score: number, distancia_m: number | null, dif: ClavesOrden['dificultad']): ClavesOrden => ({ id, score, distancia_m, dificultad: dif });

describe('ordenarTops', () => {
  const xs = [k(1, 5, 3000, { nivel: 'dificil', minutos: 90, subida_m: 400 }), k(2, 9, null, { nivel: 'facil', minutos: 25, subida_m: 100 }),
    k(3, 7, 1000, null), k(4, 7, 2000, { nivel: 'facil', minutos: 10, subida_m: 20 })];
  const ids = (o: Parameters<typeof ordenarTops>[1]) => ordenarTops(xs, o, (x) => x).map((x) => x.id);
  it('probabilidad: score desc, desempate por id', () => expect(ids('probabilidad')).toEqual([2, 3, 4, 1]));
  it('distancia: asc y PENDIENTE (null) al final', () => expect(ids('distancia')).toEqual([3, 4, 1, 2]));
  it('dificultad: nivel, luego minutos; PENDIENTE al final', () => expect(ids('dificultad')).toEqual([4, 2, 1, 3]));
  it('no muta la entrada', () => { const c = [...xs]; ordenarTops(xs, 'distancia', (x) => x); expect(xs).toEqual(c); });
});

describe('clavesEntrada', () => {
  it('sin origen la distancia queda PENDIENTE', () => expect(clavesEntrada(entrada(1, 1), null).distancia_m).toBeNull());
  it('con origen da metros en línea recta', () => expect(clavesEntrada(entrada(1, 1), { lat: 36.5, lon: -4.8 }).distancia_m).toBeGreaterThan(8000));
  it('dificultad desde tiempo y subida de ruta.ts', () => expect(clavesEntrada(entrada(1, 1, { t_pie_min: 45 }), null).dificultad?.nivel).toBe('moderada'));
  it('sin tiempo a pie válido, dificultad PENDIENTE', () => expect(clavesEntrada(entrada(1, 1, { t_pie_min: NaN }), null).dificultad).toBeNull());
});
