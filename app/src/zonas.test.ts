import { describe, expect, it } from 'vitest';
import { agruparZonas, scoreZona, zonasDelDia, MAX_ZONAS } from './zonas';
import { puntuacion100, type Opciones, type SitioCandidato, type SitiosJson } from './ranking';
import { razonZona } from './razones';
import type { Estado } from './semaforo';

// 0,001° de latitud ≈ 111 m.
let sig = 0;
const sitio = (lat: number, lon: number, p: Partial<SitioCandidato> = {}): SitioCandidato => ({
  id: ++sig, lat, lon, area_ha: 20, punt_media: 70, punt_max: 80, t_pie_min: 20, subida_m: 50, dist_camino_m: 50,
  aparcamiento_id: 1, restringido: false, meteo_id: 0, titularidad: { clase: 'monte_junta', monte: 'X' }, ...p,
});
const datos = (especies: Record<string, SitioCandidato[]>): SitiosJson => ({ version: 3, generado: 'x', especies });
const op = (estados: Record<string, Estado>): Opciones => ({ estadoEn: (e) => estados[e] ?? 'verde', fiabilidad: () => 'buena', maxDificultad: null });

describe('scoreZona', () => {
  it('la mejor cuenta entera, la segunda la mitad, la tercera un cuarto; sin verde, la mitad', () => {
    expect(scoreZona([100, 80, 40], true)).toBe(100 + 40 + 10);
    expect(scoreZona([100, 80, 40], false)).toBe(75);
    expect(scoreZona([100], true)).toBe(100);
  });
  it('una zona nunca vale el doble de su mejor sitio', () => {
    expect(scoreZona(Array(20).fill(100), true)).toBeLessThan(200);
  });
});

describe('zonasDelDia', () => {
  it('junta las especies a ≤ 400 m en una zona, con una entrada por especie', () => {
    const d = datos({
      boletus_aereus: [sitio(36.6, -4.82), sitio(36.6005, -4.82)],     // dos del mismo a 55 m: solo cuenta el mejor
      amanita_caesarea: [sitio(36.6025, -4.82)],                       // 278 m
      boletus_aestivalis: [sitio(36.6035, -4.82)],                     // 389 m
      lactarius_deliciosus: [sitio(36.61, -4.82)],                     // 1,1 km: otra zona
    });
    const z = zonasDelDia(d, Object.keys(d.especies), op({}));
    expect(z).toHaveLength(2);
    expect(z[0].entradas.map((e) => e.especie).sort()).toEqual(['amanita_caesarea', 'boletus_aereus', 'boletus_aestivalis']);
    expect(z[0].verdes).toBe(3);
    expect(z[0].extension_m).toBeGreaterThan(380);
    expect(z[0].extension_m).toBeLessThanOrEqual(400);
    expect(z[1].entradas.map((e) => e.especie)).toEqual(['lactarius_deliciosus']);
  });

  it('la zona que concentra setas va por delante de un sitio solo algo mejor; puntuación en 0–100', () => {
    const d = datos({
      boletus_aereus: [sitio(36.6, -4.82), sitio(37, -4.5, { punt_media: 85 })],
      amanita_caesarea: [sitio(36.601, -4.82)],
    });
    const z = zonasDelDia(d, Object.keys(d.especies), op({}));
    expect(z[0].entradas).toHaveLength(2);
    expect(z[1].entradas).toHaveLength(1);
    expect(z[0].puntuacion).toBe(puntuacion100(z[0].score));
    expect(z[0].puntuacion).toBeLessThanOrEqual(100);
  });

  it('prioriza zonas con verde y no cuenta las setas en rojo', () => {
    const d = datos({
      boletus_aereus: [sitio(36.6, -4.82, { punt_media: 90 })],          // amarillo: 0,5
      amanita_caesarea: [sitio(36.7, -4.82, { punt_media: 50 })],        // verde
      boletus_aestivalis: [sitio(36.7005, -4.82, { punt_media: 90 })],   // rojo: fuera
    });
    const z = zonasDelDia(d, Object.keys(d.especies), op({ boletus_aereus: 'amarillo', boletus_aestivalis: 'rojo' }));
    expect(z.map((x) => x.principal.especie)).toEqual(['amanita_caesarea', 'boletus_aereus']);
    expect(z[0].entradas).toHaveLength(1);
    expect(z[1].verdes).toBe(0);
    expect(z[1].score).toBeCloseTo(z[1].principal.score * 0.5);
  });

  it('filtra por grupo (especies dadas) y por especie requerida; corta a 15', () => {
    const d = datos({
      boletus_aereus: Array.from({ length: 20 }, (_, i) => sitio(36 + i * 0.05, -4.82)),
      amanita_caesarea: [sitio(36.0005, -4.82), sitio(38, -4)],
    });
    expect(zonasDelDia(d, Object.keys(d.especies), op({}))).toHaveLength(MAX_ZONAS);
    expect(zonasDelDia(d, ['amanita_caesarea'], op({})).every((z) => z.entradas.every((e) => e.especie === 'amanita_caesarea'))).toBe(true);
    const req = zonasDelDia(d, Object.keys(d.especies), op({}), { requerida: 'amanita_caesarea' });
    expect(req).toHaveLength(2);
    expect(req.every((z) => z.entradas.some((e) => e.especie === 'amanita_caesarea'))).toBe(true);
  });

  it('respeta la dificultad máxima y solo montes públicos (usa puntuar)', () => {
    const d = datos({
      boletus_aereus: [sitio(36.6, -4.82, { t_pie_min: 200, subida_m: 900 })],
      amanita_caesarea: [sitio(36.7, -4.82, { titularidad: undefined })],
    });
    expect(zonasDelDia(d, Object.keys(d.especies), { ...op({}), maxDificultad: 'facil' })).toHaveLength(1);
    expect(zonasDelDia(d, Object.keys(d.especies), { ...op({}), soloPublicos: true }).map((z) => z.principal.especie)).toEqual(['boletus_aereus']);
  });
});

describe('agruparZonas + razonZona', () => {
  it('la frase dice cuántas setas, el radio, las verdes y la razón real del mejor sitio, sin hablar de comer', () => {
    const d = datos({ boletus_aereus: [sitio(36.6, -4.82)], amanita_caesarea: [sitio(36.602, -4.82)] });
    const o = op({ amanita_caesarea: 'amarillo' });
    const z = zonasDelDia(d, Object.keys(d.especies), o)[0];
    const t = razonZona(z, { fiabilidad: 'buena' }, (e) => e === 'boletus_aereus' ? 'Boletus aereus' : 'Oronja');
    expect(t).toMatch(/^Zona \d+\/100: 2 setas posibles a menos de 250 m entre sí \(1 en verde\)\. Mejor sitio, Boletus aereus: Puntuación/);
    expect(t).not.toMatch(/comestib|recoger|comer/i);
    expect(agruparZonas([])).toEqual([]);
  });
});
