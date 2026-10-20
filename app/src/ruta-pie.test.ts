import { describe, expect, it } from 'vitest';
import { buscarRuta, costePaso, desnivelMicrozonas, filtrarPorDesnivel, PEND_MAX_GRADOS, puntuacionMicro, rutaPie, tiempoPasoMin,
  toblerKmh, VELOCIDAD_MAX_KMH } from './ruta-pie';
import { centroLonLat, componerRejilla, decodificarTesela, type Rejilla } from './mdt';
import { aUtm30 } from './acceso';

const RES = 25;
/** Rejilla sintética de n × m celdas con cota f(fila, col); esquina NO en un punto de la Costa del Sol. */
function rejilla(alto: number, ancho: number, f: (fila: number, col: number) => number): Rejilla {
  const [x0, y1] = aUtm30(36.6, -4.82).map((v) => Math.round(v / 100) * 100);
  const alt = new Float32Array(alto * ancho);
  for (let i = 0; i < alto; i++) for (let j = 0; j < ancho; j++) alt[i * ancho + j] = f(i, j);
  return { res: RES, x0, y1, ancho, alto, alt };
}
const lonlat = (r: Rejilla, fila: number, col: number) => { const [lon, lat] = centroLonLat(r, { fila, col }); return { lat, lon }; };

// Barranco en V de norte a sur por las columnas 16–24 (40 m de hondo, laderas de 21,8°), cerrado al sur desde la fila 30.
const barranco = rejilla(41, 41, (f, c) => (f < 30 ? 500 - Math.max(0, 40 - 10 * Math.abs(c - 20)) : 500));

describe('Tobler y coste por paso', () => {
  it('velocidad máxima de 6 km/h bajando un 5 % y ~5 km/h en llano', () => {
    expect(toblerKmh(-0.05)).toBeCloseTo(6, 6);
    expect(VELOCIDAD_MAX_KMH).toBe(6);
    expect(toblerKmh(0)).toBeCloseTo(5.04, 2);
    expect(toblerKmh(0.3)).toBeLessThan(toblerKmh(-0.3));          // subir cuesta más que bajar
  });
  it('tiempo de un paso de 25 m en llano ≈ 0,3 min', () => {
    expect(tiempoPasoMin(25, 0)).toBeCloseTo((0.025 / 5.04) * 60, 3);
  });
  it(`pendiente > ${PEND_MAX_GRADOS}° intransitable en los dos modos`, () => {
    const dz = Math.tan(((PEND_MAX_GRADOS + 1) * Math.PI) / 180) * 25;
    expect(costePaso(25, dz, 'directa')).toBe(Infinity);
    expect(costePaso(25, -dz, 'minimo_desnivel')).toBe(Infinity);
    expect(Number.isFinite(costePaso(25, Math.tan(((PEND_MAX_GRADOS - 1) * Math.PI) / 180) * 25, 'directa'))).toBe(true);
  });
  it('«mínimo desnivel» cobra la subida y la bajada; «más directa» solo el tiempo', () => {
    expect(costePaso(25, 5, 'minimo_desnivel')).toBeGreaterThan(costePaso(25, 5, 'directa') + 2);
    expect(costePaso(25, -5, 'minimo_desnivel')).toBeGreaterThan(costePaso(25, -5, 'directa') + 1);
    expect(costePaso(25, 0, 'minimo_desnivel')).toBeCloseTo(costePaso(25, 0, 'directa'), 9);
  });
});

describe('A* sobre la rejilla de cotas', () => {
  it('meseta: línea recta, sin desnivel, tiempo de llano', () => {
    const r = rejilla(21, 21, () => 700);
    const ruta = rutaPie(r, lonlat(r, 10, 2), lonlat(r, 10, 18), 'directa');
    expect(ruta.estado).toBe('ok');
    if (ruta.estado !== 'ok') return;
    expect(ruta.distancia_m).toBeCloseTo(16 * 25, 6);
    expect(ruta.subida_m + ruta.bajada_m).toBe(0);
    expect(ruta.tiempo_min).toBeCloseTo((0.4 / 5.04) * 60, 1);
    expect(ruta.celdas.every((c) => c.fila === 10)).toBe(true);
    expect(ruta.linea[0][0]).toBeCloseTo(lonlat(r, 10, 2).lon, 9);
  });

  it('barranco entre A y B: «más directa» lo cruza y «mínimo desnivel» lo rodea por el sur', () => {
    const A = lonlat(barranco, 5, 5), B = lonlat(barranco, 5, 35);
    const d = rutaPie(barranco, A, B, 'directa'), m = rutaPie(barranco, A, B, 'minimo_desnivel');
    expect(d.estado).toBe('ok'); expect(m.estado).toBe('ok');
    if (d.estado !== 'ok' || m.estado !== 'ok') return;
    expect(d.bajada_m).toBeGreaterThanOrEqual(40);                  // baja al fondo y vuelve a subir
    expect(d.subida_m).toBeGreaterThanOrEqual(40);
    expect(Math.max(...d.celdas.map((c) => c.fila))).toBeLessThan(30);
    expect(m.subida_m + m.bajada_m).toBe(0);                        // rodea por la meseta
    expect(Math.max(...m.celdas.map((c) => c.fila))).toBeGreaterThanOrEqual(30);
    expect(m.distancia_m).toBeGreaterThan(d.distancia_m * 1.5);
    expect(m.perfil.alt.every((a) => a === 500)).toBe(true);
  });

  it(`un cortado de más de ${PEND_MAX_GRADOS}° obliga a rodear, y si cierra el paso no hay ruta`, () => {
    // Escalón de 30 m entre dos celdas (50°) en la columna 10; por el norte (filas 0–2) una rampa suave lo salva.
    const rampa = (c: number) => 500 + 30 * Math.min(1, Math.max(0, (c - 5) / 10));
    const abierto = rejilla(15, 21, (f, c) => (f <= 2 ? rampa(c) : c >= 10 ? 530 : 500));
    const r1 = rutaPie(abierto, lonlat(abierto, 10, 5), lonlat(abierto, 10, 15), 'directa');
    expect(r1.estado).toBe('ok');
    if (r1.estado === 'ok') expect(Math.min(...r1.celdas.map((c) => c.fila))).toBeLessThanOrEqual(2);
    const cerrado = rejilla(15, 21, (_f, c) => (c >= 10 ? 530 : 500));
    expect(rutaPie(cerrado, lonlat(cerrado, 10, 5), lonlat(cerrado, 10, 15), 'directa').estado).toBe('sin_ruta');
  });

  it('celdas sin dato son intransitables; origen sin dato → sin_datos', () => {
    const r = rejilla(9, 9, (_f, c) => (c === 4 ? NaN : 300));
    expect(rutaPie(r, lonlat(r, 4, 1), lonlat(r, 4, 7), 'directa').estado).toBe('sin_ruta');
    expect(rutaPie(r, lonlat(r, 4, 4), lonlat(r, 4, 7), 'directa').estado).toBe('sin_datos');
  });

  it('fuera de la ventana → fuera', () => {
    const r = rejilla(9, 9, () => 300);
    expect(rutaPie(r, lonlat(r, 4, 1), { lat: 37.5, lon: -4.8 }, 'directa').estado).toBe('fuera');
  });

  it('límite de nodos explorados', () => {
    const r = rejilla(41, 41, () => 300);
    const x = buscarRuta(r, { fila: 0, col: 0 }, { fila: 40, col: 40 }, { modo: 'directa', maxNodos: 20 });
    expect(x.estado).toBe('limite');
    expect(x.nodos).toBeLessThanOrEqual(20);
  });

  it('heurística admisible: A* da el mismo coste que Dijkstra en terreno al azar', () => {
    let semilla = 7;
    const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 6; k++) {
      const base = Array.from({ length: 13 * 13 }, () => azar() * 14);
      const r = rejilla(13, 13, (f, c) => 400 + f * 3 + base[f * 13 + c]);
      for (const modo of ['directa', 'minimo_desnivel'] as const) {
        const a = { fila: Math.floor(azar() * 13), col: Math.floor(azar() * 13) }, b = { fila: Math.floor(azar() * 13), col: Math.floor(azar() * 13) };
        const x = buscarRuta(r, a, b, { modo }), y = buscarRuta(r, a, b, { modo, heuristica: false });
        expect(x.estado).toBe(y.estado);
        if (x.estado === 'ok' && y.estado === 'ok') {
          expect(x.coste).toBeCloseTo(y.coste, 6);
          expect(x.nodos).toBeLessThanOrEqual(y.nodos);
        }
      }
    }
  });
});

describe('microzonas: desnivel y filtro', () => {
  // Ladera hacia el este: +2 m por columna. Tú en la columna 10 (cota 520).
  const ladera = rejilla(41, 41, (_f, c) => 500 + 2 * c);
  const yo = lonlat(ladera, 20, 10);
  const cand = [
    { id: 'misma-cota', idon: 70, dist_m: 300, ...lonlat(ladera, 8, 10) },
    { id: 'arriba', idon: 90, dist_m: 400, ...lonlat(ladera, 20, 35) },      // 50 m más arriba
    { id: 'poco', idon: 60, dist_m: 200, ...lonlat(ladera, 25, 16) },        // 12 m más arriba
  ];

  it('anota |Δcota| y el desnivel de la ruta de mínimo desnivel (subida + bajada)', () => {
    const r = desnivelMicrozonas(cand, ladera, yo, null);
    const p = Object.fromEntries(r.map((x) => [x.id, x]));
    expect(p['misma-cota'].dCota_m).toBe(0);
    expect(p['misma-cota'].desnivel_m).toBe(0);
    expect(p.arriba.dCota_m).toBe(50);
    expect(p.arriba.desnivel_m).toBeGreaterThanOrEqual(50);
    expect(p.poco.desnivel_m).toBeGreaterThanOrEqual(12);
  });

  it('con desnivel máximo, la criba por |Δcota| evita buscar la ruta de las que no pueden cumplir', () => {
    const r = desnivelMicrozonas(cand, ladera, yo, 30);
    const arriba = r.find((x) => x.id === 'arriba')!;
    expect(arriba.desnivel_m).toBeNull();
    expect(arriba.motivo).toBe('cota');
  });

  it('el filtro oculta las que pasan del límite y ordena por idoneidad y desnivel', () => {
    const anot = desnivelMicrozonas(cand, ladera, yo, 30);
    const { visibles, ocultas } = filtrarPorDesnivel(anot, 30);
    expect(visibles.map((x) => x.id)).toEqual(['misma-cota', 'poco']);
    expect(ocultas).toBe(1);
    expect(puntuacionMicro(70, 0)).toBeGreaterThan(puntuacionMicro(75, 40));
    const sin = filtrarPorDesnivel(desnivelMicrozonas(cand, ladera, yo, null), null);
    expect(sin.ocultas).toBe(0);
    expect(sin.visibles.map((x) => x.id)).toEqual(['arriba', 'misma-cota', 'poco']);   // sin límite: por idoneidad
  });
});

describe('mdt_campo.bin', () => {
  it('decodifica el predictor 2D + zigzag + planos (bloque generado como en el pipeline)', () => {
    const t = 4;
    const u = [100, 102, 104, 0, 101, 103, 106, 110, 2586, 2580, 1, 5, 7, 7, 7, 7];
    const pred = (i: number) => { const f = Math.floor(i / t), c = i % t; return f === 0 ? (c ? u[i - 1] : 0) : c === 0 ? u[i - t] : u[i - 1] + u[i - t] - u[i - t - 1]; };
    const b = new Uint8Array(2 * t * t);
    u.forEach((z, i) => { const r = z - pred(i); const zz = r >= 0 ? 2 * r : -2 * r - 1; b[i] = zz & 255; b[t * t + i] = zz >> 8; });
    expect(Array.from(decodificarTesela(b, t))).toEqual(u);
  });

  it('compone la ventana a partir de teselas; las que faltan quedan sin dato', () => {
    const t = 2;
    const cab = { res: 25, x0: 1000, y1: 5000, tesela: t, nodata: 0 };
    const teselas: Record<string, Uint16Array> = { '0,0': Uint16Array.from([1, 2, 3, 0]) };
    const r = componerRejilla(cab, { f0: 1, c0: 0, f1: 2, c1: 3 }, (ft, ct) => teselas[`${ft},${ct}`] ?? null);
    expect(r.ancho).toBe(3); expect(r.alto).toBe(1);
    expect(r.y1).toBe(5000 - 25);
    expect(Array.from(r.alt).map((v) => (Number.isNaN(v) ? null : v))).toEqual([3, null, null]);
  });
});
