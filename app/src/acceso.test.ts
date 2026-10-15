/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  aparcamiento, aUtm30, celdaDe, centroCelda, consultar, deUtm30, esIOS, lectorBlob, nombreVia, parsearCabecera,
  simplificar, textoSubida, textoTiempo, trazar, urlAppleMaps, urlGeo, urlGoogleCoche, urlOtraApp, type Lector,
  descomprimir, nombreBinario, altitudes, celdaDeIndice,
} from './acceso';
import { gzipSync } from 'node:zlib';

// ---------------------------------------------------------------- rejilla sintética (mismo formato que acceso.py)

const SIN32 = 0xffffffff, SIN16 = 0xffff, SIN8 = 255;
const al4 = (n: number) => Math.ceil(n / 4) * 4;
/** Rejilla de ancho×alto con origen en (x0, y1) y celdas de 100 m; valores por celda (null = sin dato). */
function rejilla(ancho: number, alto: number, celdas: Record<string, [number, number, number, number]>, x0 = 300000, y1 = 4100000,
  alt?: (fila: number, col: number) => number | null) {
  const n = ancho * alto;
  const off = { origen_id: 0, tiempo_pie_min: al4(4 * n), subida_m: 0, direccion: 0, altitud: 0 };
  off.subida_m = off.tiempo_pie_min + al4(2 * n);
  off.direccion = off.subida_m + al4(2 * n);
  off.altitud = off.direccion + al4(n);
  const total = alt ? off.altitud + al4(2 * n) : off.altitud;
  const buf = new ArrayBuffer(total), v = new DataView(buf);
  for (let i = 0; i < n; i++) {
    v.setUint32(off.origen_id + 4 * i, SIN32, true); v.setUint16(off.tiempo_pie_min + 2 * i, SIN16, true);
    v.setUint16(off.subida_m + 2 * i, SIN16, true); v.setUint8(off.direccion + i, SIN8);
  }
  for (const [k, [o, t, s, d]] of Object.entries(celdas)) {
    const [f, c] = k.split(',').map(Number), i = f * ancho + c;
    v.setUint32(off.origen_id + 4 * i, o, true); v.setUint16(off.tiempo_pie_min + 2 * i, t, true);
    v.setUint16(off.subida_m + 2 * i, s, true); v.setUint8(off.direccion + i, d);
  }
  if (alt) for (let i = 0; i < n; i++) v.setUint16(off.altitud + 2 * i, alt(Math.floor(i / ancho), i % ancho) ?? SIN16, true);
  const j: any = {
    version: alt ? 2 : 1, crs: 'EPSG:25830', res_m: 100, origen_xy: [x0, y1], ancho, alto, endianness: 'little', bytes: total,
    capas: {
      origen_id: { dtype: 'uint32', offset: off.origen_id, bytes: 4 * n, nodata: SIN32 },
      tiempo_pie_min: { dtype: 'uint16', offset: off.tiempo_pie_min, bytes: 2 * n, nodata: SIN16 },
      subida_m: { dtype: 'uint16', offset: off.subida_m, bytes: 2 * n, nodata: SIN16 },
      direccion: { dtype: 'uint8', offset: off.direccion, bytes: n, nodata: SIN8 },
    },
  };
  if (alt) j.capas.altitud = { dtype: 'uint16', offset: off.altitud, bytes: 2 * n, nodata: SIN16 };
  return { j, cab: parsearCabecera(j), blob: new Blob([buf]) };
}
/** Centro (lat, lon) de una celda de la rejilla. */
const latlon = (cab: ReturnType<typeof parsearCabecera>, fila: number, col: number) => {
  const [lon, lat] = centroCelda(cab, { fila, col });
  return [lat, lon] as const;
};
const contado = (l: Lector) => {
  const r = { lecturas: 0, bytes: 0 };
  return { r, l: { leer: (o: number, n: number) => { r.lecturas++; r.bytes += n; return l.leer(o, n); } } as Lector };
};

// Camino de (3,4) al aparcamiento en (0,0): W, W, NW, NW, N (códigos 7, 7, 8, 8, 1).
//   fila 0: [P]  .   .   .   .
//   fila 1: [N]  .   .   .   .     (1,0) N → (0,0)
//   fila 2:  .  [NW] .   .   .     (2,1) NW → (1,0)
//   fila 3:  .   .  [NW][W] [W]    (3,4) W → (3,3) W → (3,2) NW → (2,1)
const CAMINO = {
  '0,0': [7, 0, 0, 0], '1,0': [7, 2, 5, 1], '2,1': [7, 4, 9, 8], '3,2': [7, 6, 12, 8], '3,3': [7, 8, 12, 7], '3,4': [7, 9, 15, 7],
} as Record<string, [number, number, number, number]>;

describe('cabecera', () => {
  it('lee la de una rejilla válida', () => {
    const { cab } = rejilla(5, 4, CAMINO);
    expect(cab).toMatchObject({ res: 100, x0: 300000, y1: 4100000, ancho: 5, alto: 4 });
    expect(cab.capas.direccion.offset % 4).toBe(0);
    expect(cab.capas.subida_m.nodata).toBe(SIN16);
  });
  it.each([
    ['no es objeto', () => null],
    ['versión', (j: any) => ({ ...j, version: 3 })],
    ['v2 sin altitud', (j: any) => ({ ...j, version: 2 })],
    ['CRS', (j: any) => ({ ...j, crs: 'EPSG:4326' })],
    ['endianness', (j: any) => ({ ...j, endianness: 'big' })],
    ['dimensiones', (j: any) => ({ ...j, ancho: 0 })],
    ['resolución', (j: any) => ({ ...j, res_m: 0 })],
    ['origen', (j: any) => ({ ...j, origen_xy: [1] })],
    ['falta capa', (j: any) => ({ ...j, capas: { ...j.capas, direccion: undefined } })],
    ['dtype', (j: any) => ({ ...j, capas: { ...j.capas, subida_m: { ...j.capas.subida_m, dtype: 'int16' } } })],
    ['alineación', (j: any) => ({ ...j, capas: { ...j.capas, direccion: { ...j.capas.direccion, offset: j.capas.direccion.offset + 1 } } })],
    ['bytes de capa', (j: any) => ({ ...j, capas: { ...j.capas, tiempo_pie_min: { ...j.capas.tiempo_pie_min, bytes: 3 } } })],
    ['fuera del archivo', (j: any) => ({ ...j, bytes: 10 })],
  ])('rechaza: %s', (_, mutar) => {
    const { j } = rejilla(5, 4, CAMINO);
    expect(() => parsearCabecera(mutar(j))).toThrow(/acceso\.json/);
  });
  it('acepta la versión 2 con la capa altitud', () => {
    const { cab } = rejilla(5, 4, CAMINO, 300000, 4100000, (f, c) => 100 + f * 10 + c);
    expect(cab.version).toBe(2);
    expect(cab.altitud?.offset).toBe(cab.capas.direccion.offset + 20);
    expect(cab.altitud?.nodata).toBe(SIN16);
  });
  it('la versión 1 no trae altitud', () => {
    expect(rejilla(5, 4, CAMINO).cab.altitud).toBeUndefined();
  });
  it.each([
    ['dtype de altitud', (j: any) => ({ ...j, capas: { ...j.capas, altitud: { ...j.capas.altitud, dtype: 'int16' } } })],
    ['bytes de altitud', (j: any) => ({ ...j, capas: { ...j.capas, altitud: { ...j.capas.altitud, bytes: 4 } } })],
  ])('v2 rechaza: %s', (_, mutar) => {
    const { j } = rejilla(5, 4, CAMINO, 300000, 4100000, () => 1);
    expect(() => parsearCabecera(mutar(j))).toThrow(/acceso\.json/);
  });
  it('la cabecera real del pipeline (si existe) se lee', () => {
    const p = fileURLToPath(new URL('../../pipeline/data/out/app/acceso.json', import.meta.url));
    if (!existsSync(p)) return;
    const cab = parsearCabecera(JSON.parse(readFileSync(p, 'utf8')));
    expect(cab.ancho * cab.alto).toBeGreaterThan(1e6);
  });
});

describe('UTM 30 (contra pyproj EPSG:4326 → EPSG:25830)', () => {
  it.each([
    [36.589, -5.244, 299253.22994, 4051624.31503],
    [37.57555, -4.42322, 374324.98775, 4159675.05637],
    [36.0, -6.2, 211544.88537, 3988686.04168],
    [37.5, -3.46, 459340.45176, 4150440.70364],
  ])('(%f, %f) → (%f, %f) a menos de 1 cm, e inversa', (lat, lon, x, y) => {
    const [ux, uy] = aUtm30(lat, lon);
    expect(Math.abs(ux - x)).toBeLessThan(0.01);
    expect(Math.abs(uy - y)).toBeLessThan(0.01);
    const [la, lo] = deUtm30(x, y);
    expect(Math.abs(la - lat)).toBeLessThan(1e-7);
    expect(Math.abs(lo - lon)).toBeLessThan(1e-7);
  });
});

describe('celdas y consulta', () => {
  const { cab, blob } = rejilla(5, 4, CAMINO);
  it('celdaDe y centroCelda son inversas; fuera de la rejilla → null', () => {
    for (const [f, c] of [[0, 0], [3, 4], [2, 1]]) expect(celdaDe(cab, ...latlon(cab, f, c))).toEqual({ fila: f, col: c });
    const [lat, lon] = deUtm30(300000 - 1, 4100000 - 50);
    expect(celdaDe(cab, lat, lon)).toBeNull();
    expect(celdaDe(cab, ...(deUtm30(300250, 4100000 + 1)))).toBeNull();
    expect(celdaDe(cab, ...(deUtm30(300501, 4099950)))).toBeNull();
    expect(celdaDe(cab, ...(deUtm30(300250, 4100000 - 401)))).toBeNull();
  });
  it('lee los cuatro valores de la celda con 4 lecturas pequeñas', async () => {
    const { r, l } = contado(lectorBlob(blob));
    expect(await consultar(cab, l, ...latlon(cab, 3, 4))).toEqual(
      { estado: 'ok', celda: { fila: 3, col: 4 }, origen: 7, tiempo_min: 9, subida_m: 15, direccion: 7 });
    expect(r).toEqual({ lecturas: 4, bytes: 9 });
  });
  it('sin dato, fuera y subida sin dato', async () => {
    expect(await consultar(cab, lectorBlob(blob), ...latlon(cab, 0, 4))).toEqual({ estado: 'sin_dato', celda: { fila: 0, col: 4 } });
    const [lat, lon] = deUtm30(299000, 4099950);
    expect(await consultar(cab, lectorBlob(blob), lat, lon)).toEqual({ estado: 'fuera' });
    const otra = rejilla(2, 1, { '0,0': [1, 5, SIN16, 0], '0,1': [1, 5, 0, 9] });
    expect(await consultar(otra.cab, lectorBlob(otra.blob), ...latlon(otra.cab, 0, 0))).toMatchObject({ estado: 'ok', subida_m: 0 });
    expect((await consultar(otra.cab, lectorBlob(otra.blob), ...latlon(otra.cab, 0, 1))).estado).toBe('sin_dato');
  });
});

describe('acceso.bin.gz', () => {
  it('se descomprime a un Blob y se lee igual', async () => {
    const { cab, blob } = rejilla(5, 4, CAMINO);
    const gz = gzipSync(new Uint8Array(await blob.arrayBuffer()));
    const b = await descomprimir(new Blob([gz]).stream());
    expect(b.size).toBe(cab.bytes);
    expect(await consultar(cab, lectorBlob(b), ...latlon(cab, 3, 4))).toMatchObject({ estado: 'ok', tiempo_min: 9 });
  });
});

describe('trazado', () => {
  it('sigue los punteros hasta el aparcamiento leyendo bloques de filas', async () => {
    const { cab, blob } = rejilla(5, 4, CAMINO);
    const { r, l } = contado(lectorBlob(blob));
    const t = await trazar(cab, l, { fila: 3, col: 4 });
    expect(t.completa).toBe(true);
    expect(t.celdas.map((c) => `${c.fila},${c.col}`)).toEqual(['3,4', '3,3', '3,2', '2,1', '1,0', '0,0']);
    expect(t.bloquesLeidos).toBe(1);
    expect(r.lecturas).toBe(1);
    expect(simplificar(t.celdas).map((c) => `${c.fila},${c.col}`)).toEqual(['3,4', '3,2', '1,0', '0,0']);
  });
  it('desde el propio aparcamiento: una celda', async () => {
    const { cab, blob } = rejilla(5, 4, CAMINO);
    expect(await trazar(cab, lectorBlob(blob), { fila: 0, col: 0 })).toEqual({ celdas: [{ fila: 0, col: 0 }], completa: true, bloquesLeidos: 1 });
  });
  it('varios bloques: una columna de 70 filas hacia el norte lee 3 bloques', async () => {
    const c: Record<string, [number, number, number, number]> = { '0,0': [0, 0, 0, 0] };
    for (let f = 1; f < 70; f++) c[`${f},0`] = [0, f, 0, 1];
    const { cab, blob } = rejilla(1, 70, c);
    const t = await trazar(cab, lectorBlob(blob), { fila: 69, col: 0 });
    expect(t).toMatchObject({ completa: true, bloquesLeidos: 3 });
    expect(t.celdas).toHaveLength(70);
    expect(simplificar(t.celdas)).toEqual([{ fila: 69, col: 0 }, { fila: 0, col: 0 }]);
  });
  it.each([
    ['celda sin dato en el camino', { '0,0': [0, 1, 0, 3] }, 3],              // E → (0,1) sin dato
    ['sale de la rejilla', { '0,0': [0, 1, 0, 1] }, 1],                     // N desde la fila 0
    ['bucle', { '0,0': [0, 1, 0, 3], '0,1': [0, 1, 0, 7] }, 2],             // E ↔ W
  ] as [string, Record<string, [number, number, number, number]>, number][])('se corta si %s', async (_, celdas, n) => {
    const { cab, blob } = rejilla(3, 2, celdas);
    const t = await trazar(cab, lectorBlob(blob), { fila: 0, col: 0 });
    expect(t.completa).toBe(false);
    expect(t.celdas.length).toBe(n === 3 ? 2 : n === 1 ? 1 : 2);
  });
  it('se corta en maxPasos', async () => {
    const { cab, blob } = rejilla(5, 4, CAMINO);
    const t = await trazar(cab, lectorBlob(blob), { fila: 3, col: 4 }, 2);
    expect(t).toMatchObject({ completa: false });
    expect(t.celdas).toHaveLength(3);
  });
  it('simplificar deja igual las trazas de 1 o 2 celdas', () => {
    expect(simplificar([{ fila: 0, col: 0 }, { fila: 1, col: 1 }])).toHaveLength(2);
  });
});

describe('datos reales del pipeline (si existen): mismo resultado que acceso.py --consultar', () => {
  const dir = fileURLToPath(new URL('../../pipeline/data/out/app/', import.meta.url));
  const hay = existsSync(dir + 'acceso.bin') && existsSync(dir + 'aparcamientos.json');
  it.skipIf(!hay)('36.589, −5.244: 8 min, +1 m, 4 pasos, aparcamiento 86597', async () => {
    const cab = parsearCabecera(JSON.parse(readFileSync(dir + 'acceso.json', 'utf8')));
    const buf = readFileSync(dir + 'acceso.bin');
    const { r, l } = contado(lectorBlob(new Blob([buf])));
    const c = await consultar(cab, l, 36.589, -5.244);
    expect(c).toMatchObject({ estado: 'ok', celda: { fila: 1080, col: 853 }, tiempo_min: 8, subida_m: 1, origen: 86597 });
    if (c.estado !== 'ok') return;
    const t = await trazar(cab, l, c.celda);
    expect(t.completa).toBe(true);
    expect(t.celdas.length - 1).toBe(4);
    expect(r.bytes).toBeLessThan(200_000);
    const ap = aparcamiento(JSON.parse(readFileSync(dir + 'aparcamientos.json', 'utf8')), c.origen);
    expect(ap).toMatchObject({ lat: 36.59074, lon: -5.24772, tipo: 'service' });
    if (cab.version === 2) {
      const a = await altitudes(cab, l, t.celdas);
      expect(a.every((v) => v > 0 && v < 3500)).toBe(true);   // Serranía de Ronda / Sierra de las Nieves
    }
  });
});

describe('aparcamientos y textos', () => {
  const comp = { vias: [[null, null, 'track'], ['Vereda del Camino Real', null, 'track'], [null, 'CO-6202', 'tertiary'],
    ['Carretera de Ronda', 'A-397', 'primary'], [null, null, 'trunk']] as [string | null, string | null, string][],
  datos: [[37.1, -4.2, 0], [37.2, -4.3, 2]] as [number, number, number][] };
  it('aparcamiento por id (posición) y null si no existe', () => {
    expect(aparcamiento(comp, 1)).toEqual({ id: 1, lat: 37.2, lon: -4.3, nombre: null, ref: 'CO-6202', tipo: 'tertiary' });
    expect(aparcamiento(comp, 5)).toBeNull();
    expect(aparcamiento({ vias: [], datos: [[1, 2, 3]] }, 0)).toBeNull();
  });
  it('nombre de la vía', () => {
    const v = (i: number) => ({ nombre: comp.vias[i][0], ref: comp.vias[i][1], tipo: comp.vias[i][2] });
    expect([0, 1, 2, 3, 4].map((i) => nombreVia(v(i)))).toEqual(
      ['pista sin nombre', 'Vereda del Camino Real', 'CO-6202', 'Carretera de Ronda (A-397)', 'carretera sin nombre']);
    expect(nombreVia({ nombre: null, ref: null, tipo: 'residential' })).toBe('calle sin nombre');
  });
  it('tiempo y subida', () => {
    expect([0, 1, 45, 60, 85, 171].map(textoTiempo)).toEqual(['menos de 1 min', '1 min', '45 min', '1 h', '1 h 25 min', '2 h 51 min']);
    expect(textoSubida(120.4)).toBe('+120 m');
  });
});

describe('enlaces', () => {
  it('Google Maps en coche al aparcamiento', () => {
    expect(urlGoogleCoche(36.59074, -5.24772)).toBe('https://www.google.com/maps/dir/?api=1&destination=36.59074,-5.24772&travelmode=driving');
  });
  it('geo: con etiqueta codificada y Apple Maps en iOS', () => {
    expect(urlGeo(36.5, -5.25, 'Aparcamiento: CO-6202 (pista)')).toBe('geo:36.50000,-5.25000?q=36.50000,-5.25000(Aparcamiento%3A%20CO-6202%20(pista))');
    expect(urlAppleMaps(36.5, -5.25, 'P & P')).toBe('https://maps.apple.com/?daddr=36.50000,-5.25000&dirflg=d&q=P%20%26%20P');
    expect(urlOtraApp(36.5, -5.25, 'x', true)).toMatch(/^https:\/\/maps\.apple\.com\//);
    expect(urlOtraApp(36.5, -5.25, 'x', false)).toMatch(/^geo:/);
  });
  it('detección de iOS', () => {
    expect(esIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(esIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
    expect(esIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(esIOS('Mozilla/5.0 (Linux; Android 14; Pixel 7)')).toBe(false);
  });
  it('nombre del binario: el del manifest, si no .gz si está en la lista, si no .bin', () => {
    expect(nombreBinario({ acceso: { cabecera: 'a', datos: 'acceso.bin.gz', aparcamientos: 'b' }, archivos: [] })).toBe('acceso.bin.gz');
    expect(nombreBinario({ archivos: [{ nombre: 'acceso.bin.gz', bytes: 1 }] })).toBe('acceso.bin.gz');
    expect(nombreBinario({ archivos: [] })).toBe('acceso.bin');
  });
});

describe('altitudes', () => {
  it('lee la altitud de cada celda (NaN fuera, sin dato o con v1)', async () => {
    const { cab, blob } = rejilla(5, 40, CAMINO, 300000, 4100000, (f, c) => (f === 2 && c === 2 ? null : 100 + f * 10 + c));
    const { r, l } = contado(lectorBlob(blob));
    const a = await altitudes(cab, l, [{ fila: 0, col: 0 }, { fila: 3, col: 4 }, { fila: 2, col: 2 }, { fila: 39, col: 1 }, { fila: 40, col: 0 }]);
    expect(a.slice(0, 2)).toEqual([100, 134]);
    expect(a[2]).toBeNaN();
    expect(a[3]).toBe(491);
    expect(a[4]).toBeNaN();
    expect(r.lecturas).toBe(2);   // dos bloques de 32 filas
    const v1 = rejilla(5, 4, CAMINO);
    expect((await altitudes(v1.cab, lectorBlob(v1.blob), [{ fila: 0, col: 0 }]))[0]).toBeNaN();
  });
  it('índice plano → celda', () => {
    expect(celdaDeIndice({ ancho: 2451 }, 2451 * 7 + 12)).toEqual({ fila: 7, col: 12 });
  });
});
