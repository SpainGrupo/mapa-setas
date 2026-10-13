import { describe, expect, it, vi } from 'vitest';
import type { Source } from 'pmtiles';
import { FuenteOpfsHttp } from './fuente';

const bytes = new Uint8Array(256).map((_, i) => i);
const http = (): Source & { getBytes: ReturnType<typeof vi.fn> } => ({
  getKey: () => 'http',
  getBytes: vi.fn(async (o: number, n: number) => ({ data: bytes.slice(o, o + n).buffer })),
});

describe('FuenteOpfsHttp', () => {
  it('lee el rango exacto del Blob de OPFS', async () => {
    const h = http();
    const f = new FuenteOpfsHttp('https://x/a.pmtiles', async () => new Blob([bytes]), h);
    const r = await f.getBytes(10, 5);
    expect([...new Uint8Array(r.data)]).toEqual([10, 11, 12, 13, 14]);
    const fin = await f.getBytes(250, 100);           // pide más allá del final
    expect([...new Uint8Array(fin.data)]).toEqual([250, 251, 252, 253, 254, 255]);
    expect(h.getBytes).not.toHaveBeenCalled();
    expect(f.origen).toBe('opfs');
  });

  it('sin Blob recurre a HTTP y vuelve a mirar OPFS tras olvidar()', async () => {
    const h = http();
    let blob: Blob | null = null;
    const f = new FuenteOpfsHttp('https://x/a.pmtiles', async () => blob, h);
    const r = await f.getBytes(3, 2);
    expect([...new Uint8Array(r.data)]).toEqual([3, 4]);
    expect(h.getBytes).toHaveBeenCalledTimes(1);
    expect(f.origen).toBe('http');
    blob = new Blob([bytes]);
    f.olvidar();
    await f.getBytes(0, 1);
    expect(h.getBytes).toHaveBeenCalledTimes(1);
    expect(f.origen).toBe('opfs');
    expect(f.getKey()).toBe('https://x/a.pmtiles');
  });

  it('si leer OPFS falla, usa HTTP', async () => {
    const h = http();
    const f = new FuenteOpfsHttp('k', async () => { throw new Error('sin OPFS'); }, h);
    await f.getBytes(0, 4);
    expect(h.getBytes).toHaveBeenCalledTimes(1);
  });
});
