import { describe, expect, it } from 'vitest';
import { razonSitio, textoCubierta, densidad } from './razones';
import type { Entrada, SitioCandidato } from './ranking';

const s: SitioCandidato = { id: 1, lat: 36.5, lon: -4.9, area_ha: 12, punt_media: 78, punt_max: 90, t_pie_min: 20, subida_m: 50,
  dist_camino_m: 100, aparcamiento_id: 1, restringido: false, meteo_id: 0 };
const e = (o: Partial<Entrada> = {}, so: Partial<SitioCandidato> = {}): Entrada =>
  ({ especie: 'x', sitio: { ...s, ...so }, estado: 'verde', dificultad: 'facil', score: 1, puntuacion: 64, ...o });

describe('razonSitio', () => {
  it('usa puntuación, hábitat y mancha', () => {
    const r = razonSitio(e(), { fiabilidad: 'buena' });
    expect(r).toContain('Puntuación 64/100');
    expect(r).toContain('hábitat muy favorable');
    expect(r).toContain('mancha de 12 ha');
    expect(r).toContain('Buen momento');
    expect(r).not.toMatch(/fiabilidad/);
  });
  it('prefiere las citas reales a la mancha', () => {
    const r = razonSitio(e({}, { citas: { n: 3, ultima: '2023', nivel: 'punto', origenes: ['inat'], refs: [] } }), { fiabilidad: 'buena' });
    expect(r).toContain('3 citas publicadas de la especie en el mismo punto');
    expect(r).not.toContain('mancha');
  });
  it('usa el motivo real del semáforo y avisa de fiabilidad baja', () => {
    const r = razonSitio(e({ estado: 'amarillo' }), { fiabilidad: 'baja', motivo: 'Lluvia de 30 mm el 10/10.' });
    expect(r).toContain('Esperar: Lluvia de 30 mm el 10/10.');
    expect(r).toContain('fiabilidad baja');
  });
  it('1–2 frases (más aviso opcional) y nunca habla de comestibilidad', () => {
    for (const est of ['verde', 'amarillo', 'rojo', 'gris'] as const) {
      const r = razonSitio(e({ estado: est }, { punt_media: 40 }), { fiabilidad: 'sin_validar' });
      expect(r).not.toMatch(/comest|consum|recog/i);
      expect(r.split(/\.\s/).length).toBeLessThanOrEqual(3);
    }
  });
  it('dice el árbol y la cubierta de copas (sitios v3)', () => {
    const r = razonSitio(e({}, { arbol: 'alcornoque', fcc_mfe: 25 }), { fiabilidad: 'buena' });
    expect(r).toContain('Alcornocal claro, 25 % de copas.');
    expect(r).not.toContain('satélite');
  });
  it('prefiere el satélite y avisa de la discrepancia con el mapa forestal y de la penalización', () => {
    const t = textoCubierta({ ...s, arbol: 'alcornoque', fcc_mfe: 30, cubierta_sat: 8, factor_cubierta: 0.37 });
    expect(t).toBe('Alcornocal muy abierto, 8 % de copas (el mapa forestal dice 30 %, el satélite 2021 ve 8 %), lo que baja la puntuación.');
  });
  it('avisa si el punto marcado está más despejado que la mancha', () => {
    const t = textoCubierta({ ...s, arbol: 'pino', fcc_mfe: 50, cubierta_sat: 60, cubierta_sat_punto: 20 });
    expect(t).toContain('Pinar de densidad media, 60 % de copas.');
    expect(t).toContain('Alrededor del punto marcado el satélite solo ve 20 %');
  });
  it('datos antiguos sin campos de cubierta: no cambia la razón', () => {
    expect(textoCubierta(s)).toBe('');
    expect(razonSitio(e(), { fiabilidad: 'buena' })).not.toMatch(/copas|undefined|null|NaN/);
    expect(textoCubierta({ ...s, cubierta_sat: null, arbol: 'encina' })).toBe('Encinar.');
  });
  it('umbrales de densidad', () => {
    expect([5, 10, 39, 40, 69, 70].map(densidad)).toEqual(['muy abierto', 'claro', 'claro', 'de densidad media', 'de densidad media', 'denso']);
  });
});
