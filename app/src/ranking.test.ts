/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calidad, CALIDAD_MAX, distanciaM, fusionar, parsearSitios, puntuacion100, puntuar, topEspecie, topGeneral,
  type Opciones, type SitioCandidato, type SitiosJson } from './ranking';
import type { Estado } from './semaforo';

let n = 0;
const sitio = (o: Partial<SitioCandidato> = {}): SitioCandidato => ({ id: ++n, lat: 36.5, lon: -5, area_ha: 50, punt_media: 80, punt_max: 95,
  t_pie_min: 20, subida_m: 100, dist_camino_m: 400, aparcamiento_id: 1, restringido: false, meteo_id: 1, bonus_pisado: 1, ...o });
const opc = (estados: Record<string, Estado> = {}, o: Partial<Opciones> = {}): Opciones => ({
  estadoEn: (e, m) => estados[`${e}:${m}`] ?? estados[e] ?? 'verde', fiabilidad: () => 'buena', maxDificultad: null, ...o });

describe('puntuación', () => {
  it('calidad = punt_media × ln(1 + área) × bonus', () => {
    expect(calidad(sitio({ punt_media: 80, area_ha: 50, bonus_pisado: 0.5 }))).toBeCloseTo(80 * Math.log(51) * 0.5, 9);
    expect(calidad(sitio({ bonus_pisado: undefined }))).toBeCloseTo(80 * Math.log(51), 9);
  });
  it('factores de semáforo y fiabilidad', () => {
    const s = sitio();
    const base = calidad(s);
    expect(puntuar('x', s, opc({ x: 'verde' }))!.score).toBeCloseTo(base, 9);
    expect(puntuar('x', s, opc({ x: 'amarillo' }))!.score).toBeCloseTo(base * 0.5, 9);
    expect(puntuar('x', s, opc({ x: 'gris' }))!.score).toBeCloseTo(base * 0.3, 9);
    expect(puntuar('x', s, opc({ x: 'rojo' }))!.score).toBeCloseTo(base * 0.1, 9);
    expect(puntuar('x', s, opc({}, { fiabilidad: () => 'media' }))!.score).toBeCloseTo(base * 0.85, 9);
    expect(puntuar('x', s, opc({}, { fiabilidad: () => 'sin_validar' }))!.score).toBeCloseTo(base * 0.75, 9);
    expect(puntuar('x', s, opc({}, { fiabilidad: () => 'baja' }))!.score).toBeCloseTo(base * 0.6, 9);
    expect(puntuar('x', s, opc({}, { estadoEn: () => null }))!.estado).toBe('gris');
  });
  it('0–100 contra el máximo teórico', () => {
    expect(puntuacion100(CALIDAD_MAX)).toBe(100);
    expect(puntuacion100(CALIDAD_MAX * 2)).toBe(100);
    expect(puntuacion100(CALIDAD_MAX / 2)).toBe(50);
    expect(puntuacion100(0)).toBe(0);
  });
  it('el filtro de dificultad quita el sitio, no lo rebaja', () => {
    const dificil = sitio({ t_pie_min: 90, subida_m: 400 });
    expect(puntuar('x', dificil, opc({}, { maxDificultad: 'moderada' }))).toBeNull();
    expect(puntuar('x', dificil, opc({}, { maxDificultad: 'dificil' }))!.dificultad).toBe('dificil');
  });
});

describe('top por especie', () => {
  it('ordena por puntuación, corta a 10 y aplica el semáforo de cada punto meteo', () => {
    const l = Array.from({ length: 14 }, (_, i) => sitio({ punt_media: 60 + i, meteo_id: i % 2 }));
    const d: SitiosJson = { version: 1, generado: '', especies: { x: l } };
    const t = topEspecie(d, 'x', opc({ 'x:0': 'verde', 'x:1': 'rojo' }));
    expect(t).toHaveLength(10);
    expect(t.slice(0, 7).every((e) => e.estado === 'verde')).toBe(true);   // los 7 verdes delante
    expect(t[0].sitio.punt_media).toBe(72);
    expect(topEspecie(d, 'nada', opc())).toEqual([]);
  });
});

describe('top general', () => {
  const lejos = (k: number) => ({ lat: 36 + k * 0.05, lon: -5 });
  it('N por especie activa, sin rojos, ordenado y como mucho 20', () => {
    const d: SitiosJson = { version: 1, generado: '', especies: {
      a: [sitio({ ...lejos(1), punt_media: 90 }), sitio({ ...lejos(2), punt_media: 85 }), sitio({ ...lejos(3), punt_media: 99 })],
      b: [sitio({ ...lejos(4), punt_media: 70 }), sitio({ ...lejos(5), punt_media: 65 })],
      c: [sitio({ ...lejos(6), punt_media: 99 })],
    } };
    const est = { a: 'verde', b: 'amarillo', c: 'rojo' } as Record<string, Estado>;
    const t = topGeneral(d, ['a', 'b', 'c'], opc(est), 2);
    expect(t.map((f) => [f.principal.especie, f.principal.sitio.punt_media])).toEqual([['a', 99], ['a', 90], ['b', 70], ['b', 65]]);
    expect(topGeneral(d, ['a', 'b', 'c'], opc(est), 3)).toHaveLength(5);
    const muchas: SitiosJson = { version: 1, generado: '', especies: Object.fromEntries(Array.from({ length: 12 }, (_, i) =>
      [`e${i}`, [sitio(lejos(i * 3 + 1)), sitio(lejos(i * 3 + 2))]])) };
    expect(topGeneral(muchas, Object.keys(muchas.especies), opc(), 2)).toHaveLength(20);
  });
  it('fusiona puntos a ≤300 m en una fila con varias especies', () => {
    const d: SitiosJson = { version: 1, generado: '', especies: {
      a: [sitio({ lat: 36.5, lon: -5, punt_media: 90 })],
      b: [sitio({ lat: 36.5 + 200 / 111320, lon: -5, punt_media: 80 })],       // a 200 m
      c: [sitio({ lat: 36.5 + 400 / 111320, lon: -5, punt_media: 70 })],       // a 400 m: fila aparte
    } };
    const t = topGeneral(d, ['a', 'b', 'c'], opc(), 2);
    expect(t).toHaveLength(2);
    expect(t[0].especies).toEqual(['a', 'b']);
    expect(t[1].especies).toEqual(['c']);
  });
  it('una especie no se repite en la misma fila', () => {
    const e = puntuar('a', sitio({ lat: 36.5, lon: -5 }), opc())!;
    const e2 = puntuar('a', sitio({ lat: 36.5005, lon: -5 }), opc())!;
    expect(fusionar([e, e2])[0].entradas).toHaveLength(1);
  });
  it('distancia haversine', () => {
    expect(distanciaM({ lat: 36.5, lon: -5 }, { lat: 36.5, lon: -5 })).toBe(0);
    expect(distanciaM({ lat: 36.5, lon: -5 }, { lat: 37.5, lon: -5 })).toBeCloseTo(111195, -2);
  });
});

describe('sitios.json', () => {
  it('descarta entradas rotas', () => {
    expect(parsearSitios(null)).toBeNull();
    expect(parsearSitios({ especies: { a: [sitio(), { lat: 'x' }], b: 3 } })!.especies).toEqual({ a: [expect.objectContaining({ punt_media: 80 })] });
  });
  const p = fileURLToPath(new URL('../../pipeline/data/out/app/sitios.json', import.meta.url));
  it.skipIf(!existsSync(p))('el del pipeline se lee y da un top general', () => {
    const d = parsearSitios(JSON.parse(readFileSync(p, 'utf8')))!;
    const t = topGeneral(d, Object.keys(d.especies), opc(), 2);
    expect(t.length).toBeGreaterThan(5);
    expect(t.length).toBeLessThanOrEqual(20);
    expect(t.every((f) => f.principal.puntuacion > 0 && f.principal.puntuacion <= 100)).toBe(true);
  });
});
