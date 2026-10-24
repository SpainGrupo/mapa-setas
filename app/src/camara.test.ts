import { describe, expect, it } from 'vitest';
import { BYTES_MAX, codificarHastaCaber, dimensionesFoto, LADO_MAX } from './camara';

describe('dimensionesFoto', () => {
  it('el lado mayor a 1024 manteniendo la proporción', () => {
    expect(dimensionesFoto(1920, 1080)).toEqual({ w: 1024, h: 576 });
    expect(dimensionesFoto(1080, 1920)).toEqual({ w: 576, h: 1024 });
    expect(dimensionesFoto(4000, 3000)).toEqual({ w: LADO_MAX, h: 768 });
  });
  it('no amplía fotos pequeñas', () => { expect(dimensionesFoto(640, 480)).toEqual({ w: 640, h: 480 }); });
});

describe('codificarHastaCaber', () => {
  const blob = (n: number) => new Blob([new Uint8Array(n)]);
  it('la primera calidad si cabe', async () => {
    const q: number[] = [];
    const b = await codificarHastaCaber(async (c) => { q.push(c); return blob(BYTES_MAX - 1); });
    expect(q).toEqual([0.8]);
    expect(b.size).toBe(BYTES_MAX - 1);
  });
  it('baja la calidad a 0,7 y luego 0,6 hasta que cabe', async () => {
    const q: number[] = [];
    const tam: Record<number, number> = { 0.8: 500_000, 0.7: 450_000, 0.6: 300_000 };
    const b = await codificarHastaCaber(async (c) => { q.push(c); return blob(tam[c]); });
    expect(q).toEqual([0.8, 0.7, 0.6]);
    expect(b.size).toBe(300_000);
  });
  it('si ninguna cabe, devuelve la de menor calidad', async () => {
    const b = await codificarHastaCaber(async () => blob(900_000));
    expect(b.size).toBe(900_000);
  });
});
