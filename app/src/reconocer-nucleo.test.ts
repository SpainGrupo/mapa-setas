import { describe, expect, it } from 'vitest';
import { aTensor, banda, decodificarTexto, f16, promediar, recorteCentral, topK, UMBRAL_MEDIO, UMBRAL_NO_RECONOCIDO, type MetaModelo } from './reconocer-nucleo';
import ref from '../../modelo/referencia.json';

describe('preproceso', () => {
  it('recorte central del lado corto', () => {
    expect(recorteCentral(400, 300)).toEqual({ sx: 50, sy: 0, lado: 300 });
    expect(recorteCentral(300, 401)).toEqual({ sx: 0, sy: 50, lado: 300 });
    expect(recorteCentral(224, 224)).toEqual({ sx: 0, sy: 0, lado: 224 });
  });
  it('RGBA → CHW normalizado (canal a canal, ignora alfa)', () => {
    const rgba = new Uint8ClampedArray([255, 0, 51, 7, 0, 255, 102, 9]);   // 2 píxeles: no cuadra con tam=2
    const t = aTensor(rgba.slice(0, 4), 1, [0.5, 0, 0.2], [0.5, 1, 0.1]);
    expect(Array.from(t)).toEqual([1, 0, expect.closeTo(0, 6)]);
    const t2 = aTensor(new Uint8ClampedArray(2 * 2 * 4).fill(255), 2, [0, 0, 0], [1, 1, 1]);
    expect(t2.length).toBe(12);
    expect(Array.from(t2).every((v) => v === 1)).toBe(true);
    expect(() => aTensor(rgba, 2, [0, 0, 0], [1, 1, 1])).toThrow(/píxeles/);
  });
  it('orden de canales: R en el primer plano, G en el segundo, B en el tercero', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 255]);
    const t = aTensor(rgba, 2, [0, 0, 0], [1, 1, 1]);
    expect(Array.from(t)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
  });
});

describe('float16', () => {
  it.each([[0x3c00, 1], [0xc000, -2], [0x0000, 0], [0x7bff, 65504], [0x3555, 0.333251953125], [0x0001, 2 ** -24]])('%i → %f', (h, v) => {
    expect(f16(h)).toBeCloseTo(v, 10);
  });
  it('infinito y NaN', () => { expect(f16(0x7c00)).toBe(Infinity); expect(f16(0x7e00)).toBeNaN(); });
  it('decodifica un buffer N×dim y valida el tamaño', () => {
    const b = new Uint16Array([0x3c00, 0x0000, 0xbc00, 0x3800]).buffer;
    expect(Array.from(decodificarTexto(b, 2, 2))).toEqual([1, 0, -1, 0.5]);
    expect(() => decodificarTexto(b, 3, 2)).toThrow();
  });
});

describe('top-5', () => {
  // 2 dimensiones, embeddings de texto unitarios.
  const meta: MetaModelo = {
    ort_version: '1.20.1', dim: 2, logit_scale: 100, preproceso: { tam: 224, media: [0, 0, 0], desv: [1, 1, 1] },
    etiquetas: [
      { n: 'Amanita caesarea', g: 'amanita_caesarea', t: 'guia' },
      { n: 'Boletus aestivalis', g: 'boletus_reticulatus', t: 'sinonimo' },
      { n: 'Boletus reticulatus', g: 'boletus_reticulatus', t: 'guia' },
      { n: 'Lactarius vinosus', g: 'lactarius_deliciosus', t: 'afin' },
      { n: 'Lactarius deliciosus', g: 'lactarius_deliciosus', t: 'guia' },
      { n: 'Trametes versicolor' },
    ],
  };
  const ang = (a: number) => [Math.cos(a), Math.sin(a)];
  const texto = new Float32Array([...ang(0), ...ang(1.2), ...ang(1.21), ...ang(2), ...ang(2.01), ...ang(3)]);
  it('ordena por coseno, funde sinónimos y deja las afines aparte', () => {
    const r = topK(new Float32Array(ang(1.203)), texto, meta, 5);
    expect(r.candidatos.map((c) => c.nombre)).toEqual(['Boletus aestivalis', 'Lactarius vinosus', 'Lactarius deliciosus', 'Amanita caesarea', 'Trametes versicolor']);
    expect(r.candidatos[0].idGuia).toBe('boletus_reticulatus');
    expect(r.candidatos[1]).toMatchObject({ idGuia: 'lactarius_deliciosus', afin: true });
    expect(r.candidatos[2].afin).toBeUndefined();
    expect(r.candidatos[4].idGuia).toBeUndefined();
    const total = r.candidatos.reduce((s, c) => s + c.prob, 0);
    expect(total).toBeCloseTo(1, 5);   // aquí caben todas las etiquetas
    expect(r.candidatos[0].prob).toBeGreaterThan(0.9);   // suma de los dos sinónimos
  });
  it('k limita los candidatos', () => {
    expect(topK(new Float32Array(ang(0)), texto, meta, 2).candidatos).toHaveLength(2);
  });
  it('«no reconocido» si el coseno máximo no llega al umbral', () => {
    const lejos = new Float32Array([0, 0]);
    expect(topK(lejos, texto, meta).noReconocido).toBe(0 < UMBRAL_NO_RECONOCIDO);
    expect(topK(new Float32Array(ang(0)), texto, meta).noReconocido).toBe(false);
  });
});

describe('bandas y media', () => {
  it('bandas cualitativas', () => {
    expect(banda(0.38)).toBe('alto'); expect(banda(0.30)).toBe('medio'); expect(banda(0.2)).toBe('bajo');
  });
  it('media de embeddings normalizada', () => {
    const m = promediar([new Float32Array([1, 0]), new Float32Array([0, 1])]);
    expect(m[0]).toBeCloseTo(Math.SQRT1_2, 6); expect(m[1]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(Array.from(promediar([new Float32Array([0, 0])]))).toEqual([0, 0]);
  });
});

describe('umbral «no reconocido» calibrado con modelo/referencia.json', () => {
  it('deja pasar al menos el 95 % de las fotos de la guía', () => {
    expect(UMBRAL_NO_RECONOCIDO).toBeLessThanOrEqual(ref.coseno_max_fotos_guia.p05);
  });
  it('queda por encima del ruido, de la imagen azul y de todas las fotos reales sin setas medidas', () => {
    expect(UMBRAL_NO_RECONOCIDO).toBeGreaterThan(ref.coseno_max_ajenas.ruido);
    expect(UMBRAL_NO_RECONOCIDO).toBeGreaterThan(ref.coseno_max_ajenas.azul);
    expect(ref.coseno_max_ajenas_reales.n).toBeGreaterThanOrEqual(30);
    expect(UMBRAL_NO_RECONOCIDO).toBeGreaterThan(ref.coseno_max_ajenas_reales.max);
  });
  it('por debajo de la banda «medio»', () => expect(UMBRAL_NO_RECONOCIDO).toBeLessThan(UMBRAL_MEDIO));
});
