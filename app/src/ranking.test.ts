/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calidad, CALIDAD_MAX, distanciaM, fusionar, mejorPublico, parsearSitios, puntuacion100, puntuar, topEspecie, topGeneral,
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
    expect(calidad(sitio({ factor_cubierta: 0.5 }))).toBeCloseTo(80 * Math.log(51) * 0.5, 9);
    expect(calidad(sitio({ factor_cubierta: undefined }))).toBeCloseTo(80 * Math.log(51), 9);
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
  it('comodidad del terreno (sitios v5): ×1 cómodo, ×0,85 algo de sube y baja, ×0,65 quebrado; sin campo ×1', () => {
    const base = calidad(sitio());
    const con = (desnivel_km: number) => puntuar('x', sitio({ terreno: { desnivel_km } }), opc())!.score;
    expect(con(20)).toBeCloseTo(base, 9);
    expect(con(60)).toBeCloseTo(base * 0.85, 9);
    expect(con(150)).toBeCloseTo(base * 0.65, 9);
    expect(puntuar('x', sitio(), opc())!.score).toBeCloseTo(base, 9);
    // No hunde un verde muy bueno: quebrado con hábitat 95 y 80 ha sigue por delante de uno cómodo de hábitat 60 y 10 ha.
    const bueno = sitio({ punt_media: 95, area_ha: 80, terreno: { desnivel_km: 200 } }), flojo = sitio({ punt_media: 60, area_ha: 10, terreno: { desnivel_km: 10 } });
    expect(puntuar('x', bueno, opc())!.score).toBeGreaterThan(puntuar('x', flojo, opc())!.score);
  });
  it('parsearSitios conserva un terreno válido y quita uno raro', () => {
    const d = parsearSitios({ version: 5, generado: '', especies: { a: [sitio({ terreno: { desnivel_km: 30, pendiente_media: 4 } }),
      sitio({ terreno: 'x' as never })] } })!;
    expect(d.especies.a[0].terreno).toEqual({ desnivel_km: 30, pendiente_media: 4 });
    expect('terreno' in d.especies.a[1]).toBe(false);
  });
  it('con probabilidad (semáforo v3) el factor es continuo: 0,1 + 0,9 × min(1, p/90); en gris no se usa', () => {
    const s = sitio();
    const base = calidad(s);
    const conP = (p: number | null, estado: Estado = 'verde') => puntuar('x', s, opc({ x: estado }, { probabilidadEn: () => p }))!;
    expect(conP(90).score).toBeCloseTo(base, 9);
    expect(conP(45, 'amarillo').score).toBeCloseTo(base * 0.55, 9);
    expect(conP(0, 'rojo').score).toBeCloseTo(base * 0.1, 9);
    expect(conP(45, 'amarillo').probabilidad).toBe(45);
    expect(conP(null, 'amarillo').score).toBeCloseTo(base * 0.5, 9);
    expect(conP(60, 'gris')).toMatchObject({ estado: 'gris' });
    expect(conP(60, 'gris').probabilidad).toBeUndefined();
    expect(conP(60, 'gris').score).toBeCloseTo(base * 0.3, 9);
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
  it('«solo montes públicos» quita los sitios privados o sin dato de titularidad', () => {
    const junta = sitio({ titularidad: { clase: 'monte_junta', monte: 'El Meliche' } });
    const muni = sitio({ titularidad: { clase: 'monte_municipal' } });
    const priv = sitio({ titularidad: { clase: 'privado', refuerzos: ['coto'] } });
    const sin = sitio();
    const o = opc({}, { soloPublicos: true });
    expect([junta, muni, priv, sin].map((s) => !!puntuar('x', s, o))).toEqual([true, true, false, false]);
    expect([junta, muni, priv, sin].every((s) => !!puntuar('x', s, opc()))).toBe(true);
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
  const p = fileURLToPath(new URL('../../pipeline/data/marbella/out/app/sitios.json', import.meta.url));
  it.skipIf(!existsSync(p))('el del pipeline se lee y da un top general', () => {
    const d = parsearSitios(JSON.parse(readFileSync(p, 'utf8')))!;
    const t = topGeneral(d, Object.keys(d.especies), opc(), 2);
    expect(t.length).toBeGreaterThan(5);
    expect(t.length).toBeLessThanOrEqual(20);
    expect(t.every((f) => f.principal.puntuacion > 0 && f.principal.puntuacion <= 100)).toBe(true);
  });
});

describe('mejor monte público', () => {
  const pub = (o: Partial<SitioCandidato> = {}) => sitio({ titularidad: { clase: 'monte_junta', monte: 'X' }, lat: 37, ...o });
  const priv = (o: Partial<SitioCandidato> = {}) => sitio({ titularidad: { clase: 'privado', refuerzos: ['coto'] }, punt_media: 95, ...o });
  it('si el top no tiene ninguno público, el mejor público no restringido aunque esté en amarillo', () => {
    const ambar = pub({ meteo_id: 2, punt_media: 70 }), restr = pub({ punt_media: 90, restringido: true }), rojo = pub({ meteo_id: 3, punt_media: 99 });
    const muni = sitio({ titularidad: { clase: 'monte_municipal' }, lat: 37.2, meteo_id: 4, punt_media: 50 });
    const d: SitiosJson = { version: 4, generado: '', especies: { a: [priv(), ambar, restr, rojo], b: [priv({ lat: 36.2 }), muni] } };
    const o = opc({ 'a:2': 'amarillo', 'a:3': 'rojo', 'b:4': 'amarillo' });
    const general = topGeneral(d, ['a', 'b'], o, 1);
    expect(general.every((f) => f.principal.sitio.titularidad?.clase === 'privado')).toBe(true);
    const m = mejorPublico(d, ['a', 'b'], o, general)!;
    expect(m.sitio).toBe(ambar);
    expect(m.estado).toBe('amarillo');
  });
  it('nada si el top ya trae uno público, si está vacío o si no hay público que valga', () => {
    const d: SitiosJson = { version: 4, generado: '', especies: { a: [pub({ punt_media: 99 }), priv()] } };
    const o = opc();
    expect(mejorPublico(d, ['a'], o, topGeneral(d, ['a'], o, 2))).toBeNull();
    expect(mejorPublico(d, ['a'], o, [])).toBeNull();
    const solo: SitiosJson = { version: 4, generado: '', especies: { a: [priv(), pub({ restringido: true })] } };
    expect(mejorPublico(solo, ['a'], o, topGeneral(solo, ['a'], o, 1))).toBeNull();
  });
  it('respeta el filtro de dificultad', () => {
    const lejos = pub({ t_pie_min: 200, subida_m: 900 });
    const d: SitiosJson = { version: 4, generado: '', especies: { a: [priv(), lejos] } };
    const o = opc({}, { maxDificultad: 'facil' });
    expect(mejorPublico(d, ['a'], o, topGeneral(d, ['a'], o, 1))).toBeNull();
  });
});
