import { describe, expect, it, vi } from 'vitest';
import { conReintentos } from './opfs';

describe('conReintentos', () => {
  it('reintenta con backoff y devuelve el primer éxito', async () => {
    const pausas: number[] = [];
    const fn = vi.fn(async (i: number) => { if (i < 2) throw new Error('falla ' + i); return 'ok'; });
    await expect(conReintentos(fn, 3, (i) => 100 * 2 ** i, async (ms) => { pausas.push(ms); })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(pausas).toEqual([100, 200]);
  });

  it('tras agotar los intentos lanza el último error', async () => {
    const fn = vi.fn(async (i: number) => { throw new Error('falla ' + i); });
    await expect(conReintentos(fn, 3, () => 0, async () => {})).rejects.toThrow('falla 2');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
