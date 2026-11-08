// Fotos del chat: GPS del EXIF (se lee antes de quitar el EXIF al reducir) y límite de 3 por mensaje.
import { describe, expect, it, vi } from 'vitest';
import { MAX_FOTOS, adjuntarFotos, leerGpsExif, type FotoAdjunta } from './chat-fotos';
import { dimensionesFoto } from './camara';

/** JPEG mínimo con un bloque APP1/EXIF que lleva el GPS IFD indicado. */
function jpegConGps(o: { lat: [number, number, number]; lon: [number, number, number]; latRef?: string; lonRef?: string; le?: boolean; sinGps?: boolean }): ArrayBuffer {
  const le = o.le ?? true;
  const tiff: number[] = [];
  const u16 = (v: number) => (le ? [v & 255, v >> 8] : [v >> 8, v & 255]);
  const u32 = (v: number) => (le ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255] : [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255]);
  tiff.push(...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8));
  // IFD0 en 8: una entrada (GPSInfo 0x8825 → GPS IFD en 26)
  tiff.push(...u16(o.sinGps ? 0 : 1));
  if (!o.sinGps) tiff.push(...u16(0x8825), ...u16(4), ...u32(1), ...u32(26));
  tiff.push(...u32(0));   // sin IFD1
  while (tiff.length < 26) tiff.push(0);
  // GPS IFD en 26: 4 entradas (12 B) = 2 + 48 + 4 = 54 → datos desde 80
  const base = 80;
  const rac = (g: number[]) => g.flatMap((n) => [...u32(Math.round(n * 100)), ...u32(100)]);
  tiff.push(...u16(4));
  tiff.push(...u16(1), ...u16(2), ...u32(2), (o.latRef ?? 'N').charCodeAt(0), 0, 0, 0);
  tiff.push(...u16(2), ...u16(5), ...u32(3), ...u32(base));
  tiff.push(...u16(3), ...u16(2), ...u32(2), (o.lonRef ?? 'E').charCodeAt(0), 0, 0, 0);
  tiff.push(...u16(4), ...u16(5), ...u32(3), ...u32(base + 24));
  tiff.push(...u32(0));
  while (tiff.length < base) tiff.push(0);
  tiff.push(...rac(o.lat), ...rac(o.lon));
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const largo = exif.length + 2;
  const bytes = [0xff, 0xd8, 0xff, 0xe1, largo >> 8, largo & 255, ...exif, 0xff, 0xda, 0, 2, 0xff, 0xd9];
  return new Uint8Array(bytes).buffer;
}

describe('leerGpsExif', () => {
  it('lee latitud y longitud (little endian) en grados, minutos y segundos', () => {
    const r = leerGpsExif(jpegConGps({ lat: [36, 37, 53.35], lon: [4, 47, 32.7], lonRef: 'W' }));
    expect(r?.lat).toBeCloseTo(36.631486, 4);
    expect(r?.lon).toBeCloseTo(-4.792417, 4);
  });
  it('big endian, sur y este', () => {
    const r = leerGpsExif(jpegConGps({ lat: [33, 52, 7.68], lon: [151, 12, 33.48], latRef: 'S', lonRef: 'E', le: false }));
    expect(r?.lat).toBeCloseTo(-33.868800, 4);
    expect(r?.lon).toBeCloseTo(151.209300, 4);
  });
  it('null sin GPS, sin EXIF, vacío, truncado o con basura (y nunca lanza)', () => {
    expect(leerGpsExif(jpegConGps({ lat: [1, 0, 0], lon: [1, 0, 0], sinGps: true }))).toBeNull();
    expect(leerGpsExif(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer)).toBeNull();
    expect(leerGpsExif(new ArrayBuffer(0))).toBeNull();
    expect(leerGpsExif(new TextEncoder().encode('no soy una foto en absoluto').buffer as ArrayBuffer)).toBeNull();
    const bueno = jpegConGps({ lat: [36, 0, 0], lon: [4, 0, 0] });
    for (const n of [10, 30, 60, 100, 120]) expect(() => leerGpsExif(bueno.slice(0, n))).not.toThrow();
    expect(leerGpsExif(bueno.slice(0, 60))).toBeNull();
  });
  it('rechaza coordenadas fuera de rango o 0,0', () => {
    expect(leerGpsExif(jpegConGps({ lat: [95, 0, 0], lon: [4, 0, 0] }))).toBeNull();
    expect(leerGpsExif(jpegConGps({ lat: [0, 0, 0], lon: [0, 0, 0] }))).toBeNull();
  });
});

describe('reducción y adjuntos', () => {
  it('el lado mayor se queda en 1280 px y no se amplía', () => {
    expect(dimensionesFoto(4000, 3000, 1280)).toEqual({ w: 1280, h: 960 });
    expect(dimensionesFoto(3000, 4000, 1280)).toEqual({ w: 960, h: 1280 });
    expect(dimensionesFoto(800, 600, 1280)).toEqual({ w: 800, h: 600 });
  });
  const falsa = (id: string): FotoAdjunta => ({ id, media_type: 'image/jpeg', data: 'AAAA', miniatura: `blob:${id}`, gps: null });
  it(`como mucho ${MAX_FOTOS} fotos por mensaje contando las que ya hay`, async () => {
    const preparar = vi.fn(async (b: Blob) => falsa(String((b as unknown as { n: number }).n)));
    const archivos = [1, 2, 3, 4, 5].map((n) => Object.assign(new Blob(['x']), { n }));
    const r = await adjuntarFotos(archivos, 1, preparar);
    expect(r.fotos).toHaveLength(2);
    expect(r.sobran).toBe(3);
    expect(preparar).toHaveBeenCalledTimes(2);
    expect((await adjuntarFotos(archivos, 3, preparar)).fotos).toHaveLength(0);
  });
  it('las fotos que no se pueden leer se cuentan aparte y no tumban las demás', async () => {
    const preparar = vi.fn(async (b: Blob) => { if ((b as unknown as { n: number }).n === 2) throw new Error('mal'); return falsa('ok'); });
    const r = await adjuntarFotos([1, 2, 3].map((n) => Object.assign(new Blob(['x']), { n })), 0, preparar);
    expect(r.fotos).toHaveLength(2);
    expect(r.fallidas).toBe(1);
  });
});
