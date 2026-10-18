import { describe, expect, it } from 'vitest';
import { aUtm30 } from './acceso';
import {
  buenaMasCercana, celdaMicro, celdasEnRadio, leerCelda, LECTURAS_SALIDA, parsearCabeceraMicro, pasoZona, PRECISION_MAX_M,
  razonCelda, seleccionarMicrozonas, situar, textoLadera, UMBRAL_BAJA, UMBRAL_BUENA, ZONA_INICIAL, type EstadoZona,
} from './micro';

const CAPAS = ['arbol', 'fcc', 'sat', 'cubierta', 'orient', 'pend', 'humedad', 'cauce'].map((id) => ({ id, nodata: 255,
  ...(id === 'orient' ? { escala: 2, llano: 254 } : id === 'cauce' ? { escala: 10, max: 250 } : {}) }));
const [X, Y] = aUtm30(36.6, -4.9);
const json = (extra: Record<string, unknown> = {}) => ({ version: 1, crs: 'EPSG:25830', res_m: 100, origen_xy: [Math.floor(X / 100) * 100 - 1000, Math.ceil(Y / 100) * 100 + 1000],
  ancho: 40, alto: 40, tesela: 4, bytes: 100, capas: [...CAPAS, { id: 'idon_boletus_aereus', nodata: null }], especies: ['boletus_aereus'],
  perfiles: {}, indice: [[0, 0, 0, 50], [1, 2, 50, 50]], ...extra });

describe('micro.json', () => {
  it('lee la cabecera y el índice de teselas', () => {
    const c = parsearCabeceraMicro(json());
    expect(c.indice.get('1,2')).toEqual([50, 50]);
    expect(c.indice.has('0,1')).toBe(false);
  });
  it('rechaza formatos que no sabe leer', () => {
    expect(() => parsearCabeceraMicro(json({ version: 2 }))).toThrow(/versión/);
    expect(() => parsearCabeceraMicro(json({ indice: [[0, 0, 90, 50]] }))).toThrow(/fuera/);
    expect(() => parsearCabeceraMicro(json({ especies: ['amanita_caesarea'] }))).toThrow(/idon_amanita/);
  });
});

describe('celdas en el radio', () => {
  const cab = parsearCabeceraMicro(json());
  it('incluye la celda donde estás y solo centros a ≤ radio', () => {
    const cs = celdasEnRadio(cab, 36.6, -4.9, 500);
    const aqui = celdaMicro(cab, 36.6, -4.9)!;
    expect(cs.some((c) => c.fila === aqui.fila && c.col === aqui.col)).toBe(true);
    expect(cs.every((c) => c.dist_m <= 500)).toBe(true);
    expect(cs.length).toBeGreaterThan(70);           // π·5² ≈ 78 hectáreas
    expect(cs.length).toBeLessThan(90);
  });
  it('fuera de la malla no hay celdas', () => {
    expect(celdasEnRadio(cab, 37.5, -4.9, 500)).toEqual([]);
    expect(celdaMicro(cab, 37.5, -4.9)).toBeNull();
  });
});

describe('leer una celda de la tesela', () => {
  const cab = parsearCabeceraMicro(json());
  const n = 16;
  const bloque = new Uint8Array(CAPAS.length * n + n).fill(255);
  const pon = (capa: number, i: number, v: number) => { bloque[capa * n + i] = v; };
  // celda (fila 5, col 9) → dentro de la tesela (1, 2), índice (1, 1) → 5
  pon(0, 5, 1); pon(1, 5, 40); pon(2, 5, 35); pon(4, 5, 0); pon(5, 5, 18); pon(6, 5, 70); pon(7, 5, 6); pon(8, 5, 82);
  it('decodifica factores y su NODATA', () => {
    const v = leerCelda(cab, bloque, { fila: 5, col: 9 }, 'boletus_aereus');
    expect(v).toMatchObject({ idon: 82, arbol: 1, fcc: 40, sat: 35, cubierta: null, orient: 0, pend: 18, humedad: 70, cauce_m: 60, cauceTope: false });
    const s = situar(cab, v, { lat: 36.6, lon: -4.9 });
    expect(razonCelda(s)).toBe('82/100 · alcornoque, 35 % de copas (satélite, claro) · umbría al norte, 18° · fresco (vaguada o arroyo), cauce a 60 m');
  });
  it('sin tesela (sin hábitat) la idoneidad es 0', () => {
    expect(leerCelda(cab, null, { fila: 0, col: 0 }, 'boletus_aereus').idon).toBe(0);
  });
  it('ladera: llano por debajo de 5° y solana al sur', () => {
    expect(textoLadera(180, 3)).toBe('llano');
    expect(textoLadera(180, 20)).toBe('solana al sur, 20°');
    expect(textoLadera(90, 20)).toBe('ladera al este, 20°');
    expect(textoLadera('llano', null)).toBe('llano');
  });
});

describe('selección de microzonas', () => {
  const c = (fila: number, col: number, idon: number, dist_m = 100) => ({ fila, col, idon, dist_m });
  it('las mejores primero, nunca dos pegadas en cruz y como mucho max', () => {
    const celdas = [c(0, 0, 90), c(0, 1, 89), c(1, 1, 88), c(5, 5, 70), c(9, 9, 40), c(3, 0, 60)];
    const s = seleccionarMicrozonas(celdas, { max: 3 });
    expect(s.map((x) => [x.fila, x.col])).toEqual([[0, 0], [1, 1], [5, 5]]);   // (0,1) a 100 m de (0,0): fuera; (1,1) en diagonal, 141 m: dentro
  });
  it('por debajo del umbral no hay microzonas', () => {
    expect(seleccionarMicrozonas([c(0, 0, UMBRAL_BUENA - 1)])).toEqual([]);
  });
  it('a igualdad de idoneidad, la más cercana', () => {
    const s = seleccionarMicrozonas([c(0, 0, 80, 400), c(4, 4, 80, 120)], { max: 1 });
    expect(s[0]).toMatchObject({ fila: 4, col: 4 });
  });
  it('máximo 10 por defecto aunque haya muchas buenas', () => {
    const muchas = Array.from({ length: 100 }, (_, i) => c(Math.floor(i / 10) * 2, (i % 10) * 2, 60 + (i % 7)));
    expect(seleccionarMicrozonas(muchas).length).toBe(10);
  });
  it('la buena más cercana', () => {
    expect(buenaMasCercana([c(0, 0, 90, 300), c(1, 1, 55, 120), c(2, 2, 20, 10)])).toMatchObject({ dist_m: 120 });
    expect(buenaMasCercana([c(2, 2, 20, 10)])).toBeNull();
  });
});

describe('histéresis «te sales de la zona buena»', () => {
  const pasos = (idons: number[], prec = 5) => {
    let e: EstadoZona = ZONA_INICIAL; const av: (string | null)[] = [];
    for (const i of idons) { const r = pasoZona(e, i, prec); e = r.estado; av.push(r.aviso); }
    return { e, av };
  };
  it('empezar fuera no avisa (vienes del coche)', () => {
    expect(pasos([10, 10, 10, 10]).av.every((a) => a === null)).toBe(true);
  });
  it('sale tras LECTURAS_SALIDA lecturas bajas seguidas, no con una sola', () => {
    const { av } = pasos([80, 20, 80, 20, 20]);
    expect(LECTURAS_SALIDA).toBe(2);
    expect(av).toEqual([null, null, null, null, 'sale']);
  });
  it('la zona intermedia no cambia nada (ni entra ni sale)', () => {
    const { av, e } = pasos([80, UMBRAL_BAJA + 5, UMBRAL_BAJA + 5, UMBRAL_BAJA + 5]);
    expect(av.every((a) => a === null)).toBe(true);
    expect(e.dentro).toBe(true);
  });
  it('avisa de vuelta al entrar otra vez en zona buena', () => {
    expect(pasos([80, 10, 10, 40, 60]).av).toEqual([null, null, 'sale', null, 'vuelve']);
  });
  it('lecturas con mala precisión no cuentan', () => {
    let e = pasoZona(ZONA_INICIAL, 80, 5).estado;
    e = pasoZona(e, 10, PRECISION_MAX_M + 1).estado;
    const r = pasoZona(e, 10, PRECISION_MAX_M + 1);
    expect(r.aviso).toBeNull();
    expect(r.estado.dentro).toBe(true);
  });
});

