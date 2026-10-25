import { describe, expect, it } from 'vitest';
import { aGeoJSON, notaDeObservacion, nuevaObservacion, validarObservacion, type DireccionGemini, type Observacion } from './observaciones-datos';
import { MAX_NOTA } from './grabacion';

const T0 = Date.UTC(2026, 9, 25, 9, 30, 0);
const base = { lat: 36.589, lon: -5.244, precGps: 6, altGps: 301, altModelo: 298, especie: 'boletus_aereus', rutaId: null, t: T0, id: 'o1' };
const dir = (rumbo: number): DireccionGemini => ({ rumbo, arbol_dominante: 'alcornoque', confianza_arbol: 'media', densidad_copas: 'media',
  sotobosque: 'despejado', suelo_visible: ['hojarasca', 'musgo'], humedad_aparente: 'humeda', notas: 'bosque abierto' });
const conDirs = (n: number, analisis = false): Observacion => ({ ...nuevaObservacion(base),
  direcciones: Array.from({ length: n }, (_, i) => ({ rumbo: i * 45, precBrujula: 10, foto: new Blob(['x'], { type: 'image/jpeg' }), analisis: analisis ? dir(i * 45) : null })) });

describe('nuevaObservacion', () => {
  it('valores iniciales', () => {
    const o = nuevaObservacion(base);
    expect(o).toMatchObject({ id: 'o1', t: T0, lat: 36.589, lon: -5.244, precGps: 6, altGps: 301, altModelo: 298, especie: 'boletus_aereus', rutaId: null,
      modelo: null, modeloSector: [], arbolSector: [], direcciones: [], estado: 'sin_analizar', error: null,
      hallazgo: 'no_mirado', especieHallada: '', nota: '' });
  });
  it('sin id ni t los genera', () => {
    const { id, t, ...resto } = base;
    const o = nuevaObservacion(resto);
    expect(o.id).toBeTruthy();
    expect(Math.abs(o.t - Date.now())).toBeLessThan(5000);
  });
});

describe('validarObservacion', () => {
  it('rechaza lo que no es una observación o no tiene lat', () => {
    expect(validarObservacion(null)).toBeNull();
    expect(validarObservacion('x')).toBeNull();
    const { lat, ...sinLat } = nuevaObservacion(base);
    expect(validarObservacion(sinLat)).toBeNull();
    expect(validarObservacion({ ...nuevaObservacion(base), id: 5 })).toBeNull();
  });
  it('acepta y rellena lo que falta (error: null, listas vacías)', () => {
    const { error, modeloSector, arbolSector, estado, ...resto } = nuevaObservacion(base) as any;
    const o = validarObservacion(resto)!;
    expect(o.error).toBeNull();
    expect(o.modeloSector).toEqual([]);
    expect(o.arbolSector).toEqual([]);
    expect(o.estado).toBe('sin_analizar');
  });
  it('descarta direcciones mal formadas y normaliza el análisis', () => {
    const o = conDirs(2, true);
    const sucio: any = { ...o, direcciones: [...o.direcciones, { rumbo: 'norte', foto: null }, null, 7,
      { rumbo: 180, precBrujula: 'x', foto: 'no-es-blob', analisis: { rumbo: 180, arbol_dominante: 'secuoya', densidad_copas: 'media' } }] };
    const v = validarObservacion(sucio)!;
    expect(v.direcciones.map((d) => d.rumbo)).toEqual([0, 45, 180]);
    const d3 = v.direcciones[2];
    expect(d3.precBrujula).toBeNull();
    expect(d3.foto).toBeNull();
    expect(d3.analisis?.arbol_dominante).toBe('no_se_ve');
    expect(d3.analisis?.confianza_arbol).toBe('baja');
    expect(d3.analisis?.densidad_copas).toBe('media');
    expect(d3.analisis?.suelo_visible).toEqual([]);
    expect(v.direcciones[0].analisis).toEqual(dir(0));
  });
  it('estado, hallazgo y numéricos inválidos', () => {
    const v = validarObservacion({ ...nuevaObservacion(base), estado: 'raro', hallazgo: 'quizá', altGps: 'x', error: 3, nota: 'n'.repeat(900) })!;
    expect(v.estado).toBe('sin_analizar');
    expect(v.hallazgo).toBe('no_mirado');
    expect(v.altGps).toBeNull();
    expect(v.error).toBeNull();
    expect(v.nota.length).toBe(MAX_NOTA);
  });
});

describe('aGeoJSON', () => {
  it('puntos [lon, lat], sin fotos, idon null sin modelo', () => {
    const g = aGeoJSON([conDirs(2, true)]);
    expect(g.type).toBe('FeatureCollection');
    const f = g.features[0];
    expect(f.geometry).toEqual({ type: 'Point', coordinates: [-5.244, 36.589] });
    const p = f.properties!;
    expect(p.id).toBe('o1');
    expect(p.fecha).toBe(new Date(T0).toISOString());
    expect(p.especie).toBe('boletus_aereus');
    expect(p.hallazgo).toBe('no_mirado');
    expect(p.idon).toBeNull();
    expect(p.arbol_modelo).toBeNull();
    expect(p.direcciones).toEqual([
      { rumbo: 0, arbol: 'alcornoque', copas: 'media', sotobosque: 'despejado', humedad: 'humeda' },
      { rumbo: 45, arbol: 'alcornoque', copas: 'media', sotobosque: 'despejado', humedad: 'humeda' }]);
    const txt = JSON.stringify(g);
    expect(txt).not.toMatch(/foto|blob/i);
  });
  it('con modelo: idoneidad y árbol; direcciones sin análisis no salen', () => {
    const o = conDirs(2, false);
    o.modelo = { fila: 1, col: 2, lat: 36.589, lon: -5.244, idon: 72, arbol: 1, fcc: 40, sat: null, cubierta: null, orient: 0, pend: 10, humedad: 50, cauce_m: null, cauceTope: false };
    const p = aGeoJSON([o]).features[0].properties!;
    expect(p.idon).toBe(72);
    expect(p.arbol_modelo).toBe('alcornoque');
    expect(p.direcciones).toEqual([]);
  });
});

describe('notaDeObservacion', () => {
  it('misma posición y hora, sin estrellas y texto acotado', () => {
    const n = notaDeObservacion(conDirs(8));
    expect(n).toMatchObject({ t: T0, lat: 36.589, lon: -5.244, alt: 301, estrellas: 0 });
    expect(n.texto.startsWith('Observación: ')).toBe(true);
    expect(n.texto.length).toBeLessThanOrEqual(MAX_NOTA);
    expect(n.texto).toContain('8 fotos');
    expect(n.id).toContain('o1');
  });
  it('recoge el hallazgo si ya está', () => {
    const o = { ...conDirs(1), hallazgo: 'encontrada' as const };
    expect(notaDeObservacion(o).texto).toMatch(/1 foto\b/);
    expect(notaDeObservacion(o).texto).toContain('encontrada');
  });
});
