import { describe, expect, it } from 'vitest';
import { FACTOR_SOTOBOSQUE, FCC_COPAS, PESOS, mejorDireccion, puntuarDirecciones, puntuarObservado, type PuntuacionDir } from './explorar';
import { nuevaObservacion, type DireccionGemini, type Observacion } from './observaciones-datos';
import type { PerfilMicro } from './micro';

const PERFIL: PerfilMicro = { arboles: { alcornoque: 1, encina: 0.8 }, dosel: { opt: [40, 70] }, humedad: 0.5 };
const dir = (p: Partial<DireccionGemini> = {}): DireccionGemini => ({
  rumbo: 0, arbol_dominante: 'alcornoque', confianza_arbol: 'media', densidad_copas: 'media', sotobosque: 'despejado',
  suelo_visible: [], humedad_aparente: 'humeda', notas: '', ...p,
});
const NADA: Partial<DireccionGemini> = { arbol_dominante: 'no_se_ve', confianza_arbol: 'baja', densidad_copas: 'no_se_ve', sotobosque: 'no_se_ve', humedad_aparente: 'no_se_ve' };
function obs(dirs: DireccionGemini[], modeloSector: (number | null)[]): Observacion {
  const o = nuevaObservacion({ lat: 36.5, lon: -5.2, precGps: 5, altGps: null, altModelo: null, especie: 'boletus_aereus', rutaId: null });
  o.direcciones = dirs.map((d) => ({ rumbo: d.rumbo, precBrujula: null, foto: null, analisis: d }));
  o.modeloSector = modeloSector;
  return o;
}

describe('constantes', () => {
  it('los pesos suman 1 y los factores son los fijados', () => {
    expect(PESOS.arbol + PESOS.copas + PESOS.humedad + PESOS.sotobosque).toBeCloseTo(1);
    expect(FCC_COPAS).toEqual({ abierta: 15, media: 50, cerrada: 85 });
    expect(FACTOR_SOTOBOSQUE).toEqual({ despejado: 1, matorral_bajo: 0.8, matorral_denso: 0.5 });
  });
});

describe('puntuarObservado', () => {
  it('alcornoque / copas medias / húmedo / despejado con ese perfil → 1', () => {
    const r = puntuarObservado(dir(), PERFIL);
    expect(r.valor).toBe(1);
    expect(r.razones).toEqual(expect.arrayContaining(['alcornoque visto (confianza media)', 'copas medias', 'se ve húmedo']));
  });
  it('encina con confianza baja: el árbol no cuenta', () => {
    const r = puntuarObservado(dir({ ...NADA, arbol_dominante: 'encina', confianza_arbol: 'baja' }), PERFIL);
    expect(r.valor).toBeNull();
    expect(r.razones.join(' ')).not.toMatch(/encina/);
  });
  it('mezcla de componentes con los pesos: árbol 1, copas fuera del óptimo 0,6, sotobosque denso 0,5', () => {
    const r = puntuarObservado(dir({ confianza_arbol: 'alta', densidad_copas: 'cerrada', humedad_aparente: 'no_se_ve', sotobosque: 'matorral_denso' }), PERFIL);
    expect(r.valor).toBeCloseTo((0.5 * 1 + 0.2 * 0.6 + 0.1 * 0.5) / 0.8, 6);
  });
  it('humedad: seca 0, media 0,5, húmeda 1 (perfil que la prefiere); con peso negativo se invierte', () => {
    const solo = (h: DireccionGemini['humedad_aparente'], p: PerfilMicro) => puntuarObservado(dir({ ...NADA, humedad_aparente: h }), p).valor;
    expect(solo('seca', PERFIL)).toBe(0);
    expect(solo('media', PERFIL)).toBe(0.5);
    expect(solo('humeda', PERFIL)).toBe(1);
    expect(solo('seca', { humedad: -0.5 })).toBe(1);
  });
  it('árbol que no es hospedador (eucalipto, otro, castaño sin perfil) vale 0 si el perfil lista árboles', () => {
    expect(puntuarObservado(dir({ ...NADA, arbol_dominante: 'eucalipto', confianza_arbol: 'alta' }), PERFIL).valor).toBe(0);
    expect(puntuarObservado(dir({ ...NADA, arbol_dominante: 'otro', confianza_arbol: 'media' }), PERFIL).valor).toBe(0);
    expect(puntuarObservado(dir({ ...NADA, arbol_dominante: 'castano', confianza_arbol: 'media' }), PERFIL).valor).toBe(0);
    expect(puntuarObservado(dir({ ...NADA, arbol_dominante: 'castano', confianza_arbol: 'media' }), { arboles: { castano: 0.9 } }).valor).toBe(0.9);
  });
  it('sin perfil no se inventa nada: solo cuenta el sotobosque', () => {
    expect(puntuarObservado(dir(), null).valor).toBe(1);
    expect(puntuarObservado(dir({ sotobosque: 'matorral_bajo' }), null).valor).toBeCloseTo(0.8, 9);
    expect(puntuarObservado(dir({ ...NADA }), null).valor).toBeNull();
  });
  it('la razón del suelo y la del sotobosque salen de lo visto', () => {
    const r = puntuarObservado(dir({ ...NADA, sotobosque: 'matorral_denso', suelo_visible: ['hojarasca', 'musgo'] }), PERFIL);
    expect(r.razones).toEqual(expect.arrayContaining(['hojarasca y musgo', 'sotobosque con matorral denso']));
  });
});

describe('puntuarDirecciones', () => {
  it('total = 0,5·observado + 0,5·modelo/100 (en 0–100); con uno solo, ese', () => {
    const o = obs([dir({ rumbo: 0, arbol_dominante: 'alcornoque', confianza_arbol: 'alta', densidad_copas: 'cerrada', humedad_aparente: 'no_se_ve', sotobosque: 'matorral_denso' }),
      dir({ rumbo: 45, ...NADA }), dir({ rumbo: 90 })], [60, 40, null]);
    const [a, b, c] = puntuarDirecciones(o, PERFIL, [null, null, null]);
    expect(a.observado).toBeCloseTo(0.8375, 4);
    expect(a.total).toBeCloseTo(0.5 * 83.75 + 0.5 * 60, 3);
    expect(b.observado).toBeNull();
    expect(b.total).toBe(40);
    expect(c.modelo).toBeNull();
    expect(c.total).toBe(100);
    expect(a.razones).toContain('modelo 60 en ese sector');
  });
  it('todo no_se_ve y sin modelo → total null', () => {
    const [p] = puntuarDirecciones(obs([dir({ ...NADA })], [null]), PERFIL, [null]);
    expect(p.total).toBeNull();
    expect(p.observado).toBeNull();
  });
  it('dirección sin análisis: vale lo que dice el modelo', () => {
    const o = obs([dir()], [72]);
    o.direcciones[0].analisis = null;
    const [p] = puntuarDirecciones(o, PERFIL, [null]);
    expect(p.observado).toBeNull();
    expect(p.total).toBe(72);
    expect(p.razones).toEqual(['modelo 72 en ese sector']);
  });
  it('contradicción: el modelo da pino y en la foto se ve alcornoque (confianza media)', () => {
    const [p] = puntuarDirecciones(obs([dir()], [50]), PERFIL, ['pino']);
    expect(p.razones).toContain('el modelo da pino; en la foto se ve alcornoque');
  });
  it('no hay contradicción con confianza baja, sin árbol del modelo, con «sin arbolado» o con el mismo árbol', () => {
    const casos: [Partial<DireccionGemini>, string | null][] = [
      [{ confianza_arbol: 'baja' }, 'pino'], [{}, null], [{}, 'sin arbolado'], [{}, 'alcornoque'], [{ arbol_dominante: 'otro' }, 'pino'], [{ arbol_dominante: 'no_se_ve' }, 'pino'],
    ];
    for (const [d, a] of casos) {
      const [p] = puntuarDirecciones(obs([dir(d)], [50]), PERFIL, [a]);
      expect(p.razones.join('|')).not.toMatch(/el modelo da/);
    }
  });
  it('castaño del modelo frente a castano observado no es contradicción; frente a encina sí, con el nombre bien escrito', () => {
    const [a] = puntuarDirecciones(obs([dir({ arbol_dominante: 'castano' })], [50]), PERFIL, ['castaño']);
    expect(a.razones.join('|')).not.toMatch(/el modelo da/);
    const [b] = puntuarDirecciones(obs([dir({ arbol_dominante: 'encina', confianza_arbol: 'alta' })], [50]), PERFIL, ['castaño']);
    expect(b.razones).toContain('el modelo da castaño; en la foto se ve encina');
  });
  it('ninguna razón habla de comer', () => {
    const o = obs([dir({ notas: 'es comestible', suelo_visible: ['hojarasca', 'musgo', 'pasto', 'roca', 'tierra_desnuda'] }), dir({ rumbo: 45, ...NADA })], [80, 10]);
    for (const p of puntuarDirecciones(o, PERFIL, ['pino', null])) for (const r of p.razones) expect(r).not.toMatch(/comest/i);
  });
  it('lleva los rumbos de la observación', () => {
    const ps = puntuarDirecciones(obs([dir({ rumbo: 0 }), dir({ rumbo: 135 })], [1, 2]), PERFIL, [null, null]);
    expect(ps.map((p) => p.rumbo)).toEqual([0, 135]);
  });
});

describe('mejorDireccion', () => {
  const p = (rumbo: number, total: number | null, modelo: number | null): PuntuacionDir => ({ rumbo, total, observado: null, modelo, razones: [] });
  it('la de mayor total', () => expect(mejorDireccion([p(0, 50, null), p(45, 80, null), p(90, 70, null)])?.rumbo).toBe(45));
  it('empate: la de mayor modelo', () => expect(mejorDireccion([p(0, 70, 40), p(45, 70, 90), p(90, 70, null)])?.rumbo).toBe(45));
  it('empate sin modelo: la primera', () => expect(mejorDireccion([p(90, 70, null), p(0, 70, null)])?.rumbo).toBe(90));
  it('ignora las que no tienen total', () => expect(mejorDireccion([p(0, null, null), p(45, 10, null)])?.rumbo).toBe(45));
  it('ninguna con total → null', () => { expect(mejorDireccion([p(0, null, null)])).toBeNull(); expect(mejorDireccion([])).toBeNull(); });
});
