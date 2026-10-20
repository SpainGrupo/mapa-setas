import { describe, expect, it } from 'vitest';
import { ayudaIndicador, crearPercentil, MIN_OBS_TRAMO, parsearValidacion, percentilTop, scoresDia, textoIndicador, veces,
  type Validacion } from './indicador';
import { parsearSitios, puntuar, topEspecie, type Opciones, type SitioCandidato, type SitiosJson } from './ranking';

const tramos = [
  { desde: 0, hasta: 25, lift: 0.64, obs: 18 },
  { desde: 25, hasta: 50, lift: 4.62, obs: 6 },
  { desde: 50, hasta: 75, lift: 4.02, obs: 2 },          // < MIN_OBS_TRAMO
  { desde: 75, hasta: 101, lift: 12.3, obs: 3 },
];
const val: Validacion = {
  amanita_caesarea: { calibrado: true, n: 31, tramos },
  pleurotus_eryngii: { calibrado: false, n: 20, tramos },
  nula: { calibrado: true, n: 10, tramos: [{ desde: 0, hasta: 101, lift: null, obs: 0 }] },
};

describe('veces', () => {
  it('elige el tramo por punt_media y devuelve su lift', () => {
    expect(MIN_OBS_TRAMO).toBe(3);
    expect(veces(val, 'amanita_caesarea', 10)).toBe(0.64);
    expect(veces(val, 'amanita_caesarea', 25)).toBe(4.62);
    expect(veces(val, 'amanita_caesarea', 49.9)).toBe(4.62);
    expect(veces(val, 'amanita_caesarea', 100)).toBe(12.3);
  });
  it('null si el tramo tiene pocos hallazgos, la especie no está calibrada, el lift es null o no hay datos', () => {
    expect(veces(val, 'amanita_caesarea', 60)).toBeNull();
    expect(veces(val, 'pleurotus_eryngii', 30)).toBeNull();
    expect(veces(val, 'nula', 30)).toBeNull();
    expect(veces(val, 'otra', 30)).toBeNull();
    expect(veces(undefined, 'amanita_caesarea', 30)).toBeNull();
    expect(veces({ x: { calibrado: true, n: 30, tramos: [] } }, 'x', 30)).toBeNull();
  });
});

describe('percentilTop', () => {
  it('ceil(100 × (mejores + 1) / total), entre 1 y 100', () => {
    const l = Array.from({ length: 200 }, (_, i) => 200 - i);  // 200 … 1
    expect(percentilTop(200, l)).toBe(1);                     // ceil(100 × 1 / 200) = 1
    expect(percentilTop(197, l)).toBe(2);                     // 3 mejores → ceil(400 / 200)
    expect(percentilTop(1, l)).toBe(100);
    expect(percentilTop(5, [5, 5, 5, 5])).toBe(25);           // empates: nadie es estrictamente mejor
    expect(percentilTop(1, [3, 2, 1])).toBe(100);
    expect(percentilTop(9, [])).toBe(100);
  });
});

describe('textoIndicador y ayuda', () => {
  it('formato con coma decimal; entero desde 10; sin validar sin lift', () => {
    expect(textoIndicador(3.7, 2)).toBe('≈3,7× la media · top 2\u00a0% hoy');
    expect(textoIndicador(4, 10)).toBe('≈4,0× la media · top 10\u00a0% hoy');
    expect(textoIndicador(9.96, 1)).toBe('≈10× la media · top 1\u00a0% hoy');
    expect(textoIndicador(0.64, 100)).toBe('≈0,6× la media · top 100\u00a0% hoy');
    expect(textoIndicador(10.75, 1)).toBe('≈11× la media · top 1\u00a0% hoy');
    expect(textoIndicador(null, 2)).toBe('sin validar · top 2\u00a0% hoy');
  });
  it('la ayuda dice que no es una probabilidad, con las cifras del sitio', () => {
    const a = ayudaIndicador(3.7, 2).replace(/\u00a0/g, ' ');
    expect(a).toBe('No es un % de probabilidad. Solo sabemos dónde se han encontrado setas, no dónde se buscó y no había nada, así que no se puede calcular la probabilidad de encontrar una. «≈3,7× la media» quiere decir que en zonas con una puntuación como la de este sitio aparecieron unas 3,7 veces más hallazgos que si estuvieran repartidos al azar (comprobado en zonas que no se usaron para hacer el mapa). «Top 2 % hoy» quiere decir que hoy este sitio está entre el 2 % mejor puntuado de la región para esta seta. «Sin validar»: no hay hallazgos suficientes para comprobarlo.');
    const b = ayudaIndicador(null, 40);
    expect(b).not.toContain('veces más');
    expect(b).toContain('«Sin validar»: no hay hallazgos suficientes para comprobarlo.');
    expect(b).toContain('40\u00a0% mejor puntuado');
    expect(a + b).not.toMatch(/comestible/i);
  });
});

let n = 0;
const sitio = (o: Partial<SitioCandidato> = {}): SitioCandidato => ({ id: ++n, lat: 36.5, lon: -5, area_ha: 50, punt_media: 80, punt_max: 95,
  t_pie_min: 20, subida_m: 100, dist_camino_m: 400, aparcamiento_id: 1, restringido: false, meteo_id: 1, bonus_pisado: 1, ...o });

describe('percentil del día con la puntuación de ranking.ts', () => {
  const s = [sitio({ punt_media: 90 }), sitio({ punt_media: 70, t_pie_min: 200, subida_m: 900 }), sitio({ punt_media: 60 }), sitio({ punt_media: 50 })];
  const datos: SitiosJson = { version: 4, generado: '', especies: { x: s }, factor_citas: false };
  const op: Opciones = { estadoEn: (_e, m) => (m === 2 ? 'rojo' : 'verde'), fiabilidad: () => 'buena', maxDificultad: 'facil', soloPublicos: true };
  it('cuenta todos los sitios de la especie, sin dificultad ni montes públicos', () => {
    expect(topEspecie(datos, 'x', op)).toHaveLength(0);           // con los filtros no queda ninguno
    const l = scoresDia(datos, 'x', op);
    expect(l).toHaveLength(4);
    expect(l[0]).toBe(puntuar('x', s[0], { ...op, maxDificultad: null, soloPublicos: false })!.score);
    const pct = crearPercentil(datos, { ...op, maxDificultad: null, soloPublicos: false });
    const top = topEspecie(datos, 'x', { ...op, maxDificultad: null, soloPublicos: false });
    expect(top.map((e) => pct('x', e.score))).toEqual([25, 50, 75, 100]);
  });
  it('sitios.json conserva `validacion` al parsearla', () => {
    const d = parsearSitios({ ...datos, validacion: { x: { calibrado: true, n: 12, tramos: [{ desde: 75, hasta: 101, lift: 3.2, obs: 4 }, { raro: 1 }] } } });
    expect(d!.validacion).toEqual({ x: { calibrado: true, n: 12, tramos: [{ desde: 75, hasta: 101, lift: 3.2, obs: 4 }] } });
    expect(veces(d!.validacion, 'x', 80)).toBe(3.2);
    expect(parsearSitios(datos)!.validacion).toBeUndefined();
    expect(parsearValidacion('raro')).toBeUndefined();
  });
});
