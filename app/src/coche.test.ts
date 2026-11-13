import { describe, expect, it, vi } from 'vitest';
import {
  CacheMinutos, MAX_COORDENADAS, celdaOrigen, claveOrigen, distanciaRectaKm, estimarMinutos, formatoMinutos, minutosEnCoche,
  parsearPosicion, parsearTabla, serializarPosicion, textoHace, trocear, urlTabla, type Punto,
} from './coche';

const MARBELLA: Punto = { lat: 36.5101, lon: -4.8825 };
const RONDA: Punto = { lat: 36.7462, lon: -5.1613 };

const respuesta = (durations: (number | null)[][], code = 'Ok') =>
  ({ ok: true, status: 200, json: async () => ({ code, durations }) }) as unknown as Response;

describe('formato', () => {
  it('«🚗 25 min» hasta 60 min y «1 h 10 min» por encima', () => {
    expect(formatoMinutos(25)).toBe('🚗 25 min');
    expect(formatoMinutos(60)).toBe('🚗 60 min');
    expect(formatoMinutos(61)).toBe('🚗 1 h 1 min');
    expect(formatoMinutos(70)).toBe('🚗 1 h 10 min');
    expect(formatoMinutos(120)).toBe('🚗 2 h');
    expect(formatoMinutos(125.4)).toBe('🚗 2 h 5 min');
  });
  it('mínimo 1 min y redondeo', () => {
    expect(formatoMinutos(0)).toBe('🚗 1 min');
    expect(formatoMinutos(24.6)).toBe('🚗 25 min');
  });
  it('estimado: «≈ N min (estimado)»', () => {
    expect(formatoMinutos(25, true)).toBe('🚗 ≈ 25 min (estimado)');
    expect(formatoMinutos(70, true)).toBe('🚗 ≈ 1 h 10 min (estimado)');
  });
});

describe('estimación en línea recta', () => {
  it('distancia: Marbella–Ronda ≈ 36 km', () => {
    expect(distanciaRectaKm(MARBELLA, RONDA)).toBeGreaterThan(35);
    expect(distanciaRectaKm(MARBELLA, RONDA)).toBeLessThan(37);
    expect(distanciaRectaKm(MARBELLA, MARBELLA)).toBe(0);
  });
  it('× 1,4 a 50 km/h: 25 km en línea recta = 42 min', () => {
    const b = { lat: MARBELLA.lat + 25 / 111.195, lon: MARBELLA.lon };
    expect(estimarMinutos(MARBELLA, b)).toBe(42);
  });
  it('nunca menos de 1 min', () => { expect(estimarMinutos(MARBELLA, MARBELLA)).toBe(1); });
});

describe('troceo', () => {
  it('trozos de n y el último más corto', () => {
    expect(trocear([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(trocear([], 3)).toEqual([]);
    expect(trocear([1, 2], 0)).toEqual([[1], [2]]);
  });
});

describe('URL y parseo de OSRM', () => {
  it('table/v1/driving con lon,lat, sources=0 y annotations=duration', () => {
    const u = urlTabla(MARBELLA, [RONDA]);
    expect(u).toBe('https://router.project-osrm.org/table/v1/driving/-4.88250,36.51010;-5.16130,36.74620?sources=0&annotations=duration');
  });
  it('segundos → minutos redondeados, sin la columna del origen; null = sin ruta', () => {
    expect(parsearTabla({ code: 'Ok', durations: [[0, 1500, 4200, null, 10]] }, 4)).toEqual([25, 70, null, 1]);
  });
  it('lanza con código distinto de Ok o forma rara', () => {
    expect(() => parsearTabla({ code: 'NoTable', durations: [] }, 1)).toThrow();
    expect(() => parsearTabla({ code: 'Ok', durations: [[0, 60]] }, 2)).toThrow();
    expect(() => parsearTabla({ code: 'Ok' }, 1)).toThrow();
    expect(() => parsearTabla(null, 1)).toThrow();
  });
});

describe('celda de origen y caché', () => {
  it('posiciones a ~500 m caen en la misma celda; a más, en otra', () => {
    expect(claveOrigen({ lat: 36.5101, lon: -4.8825 })).toBe(claveOrigen({ lat: 36.5114, lon: -4.8808 }));
    expect(claveOrigen({ lat: 36.5101, lon: -4.8825 })).not.toBe(claveOrigen({ lat: 36.5301, lon: -4.8825 }));
    expect(celdaOrigen({ lat: 36.5101, lon: -4.8825 })).toEqual({ lat: 36.51, lon: -4.88 });
  });
  it('guarda y devuelve por celda y destino', () => {
    const c = new CacheMinutos();
    c.set(MARBELLA, RONDA, 40);
    expect(c.get({ lat: 36.5112, lon: -4.8811 }, RONDA)).toBe(40);
    expect(c.get({ lat: 36.55, lon: -4.8825 }, RONDA)).toBeUndefined();
    expect(c.get(MARBELLA, { lat: 36.7, lon: -5.1 })).toBeUndefined();
    expect(c.tamano).toBe(1);
    c.vaciar(); expect(c.tamano).toBe(0);
  });
});

describe('minutosEnCoche', () => {
  const destinos: Punto[] = [RONDA, { lat: 36.6, lon: -5.0 }];

  it('una sola petición con el origen redondeado; devuelve minutos reales y los cachea', async () => {
    const f = vi.fn().mockResolvedValue(respuesta([[0, 2400, 900]]));
    const cache = new CacheMinutos();
    const r = await minutosEnCoche(MARBELLA, destinos, { fetch: f as unknown as typeof fetch, cache });
    expect(r).toEqual([{ min: 40, estimado: false }, { min: 15, estimado: false }]);
    expect(f).toHaveBeenCalledTimes(1);
    const url = f.mock.calls[0][0] as string;
    expect(url).toContain('/table/v1/driving/-4.88000,36.51000;');   // la celda, no la posición exacta
    const r2 = await minutosEnCoche({ lat: 36.5108, lon: -4.8821 }, destinos, { fetch: f as unknown as typeof fetch, cache });
    expect(r2).toEqual(r);
    expect(f).toHaveBeenCalledTimes(1);   // todo de la caché
  });

  it('destinos repetidos: una sola coordenada en la petición', async () => {
    const f = vi.fn().mockResolvedValue(respuesta([[0, 600]]));
    const r = await minutosEnCoche(MARBELLA, [RONDA, RONDA], { fetch: f as unknown as typeof fetch });
    expect(r).toEqual([{ min: 10, estimado: false }, { min: 10, estimado: false }]);
    expect((f.mock.calls[0][0] as string).split(';').length).toBe(2);
  });

  it('más de 99 destinos: se trocean en varias peticiones', async () => {
    const muchos = Array.from({ length: 150 }, (_, i) => ({ lat: 36.5 + i * 0.001, lon: -4.9 }));
    const f = vi.fn().mockImplementation(async (url: string) => {
      const n = url.split('/driving/')[1].split('?')[0].split(';').length;   // origen + destinos
      return respuesta([[0, ...Array.from({ length: n - 1 }, () => 600)]]);
    });
    const r = await minutosEnCoche(MARBELLA, muchos, { fetch: f as unknown as typeof fetch });
    expect(f).toHaveBeenCalledTimes(2);
    expect((f.mock.calls[0][0] as string).split(';').length).toBe(MAX_COORDENADAS);
    expect(r).toHaveLength(150);
    expect(r.every((x) => x.min === 10 && !x.estimado)).toBe(true);
  });

  it('si OSRM falla, estimación en línea recta marcada como estimada y sin guardarla en la caché', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('red caída'));
    const cache = new CacheMinutos();
    const r = await minutosEnCoche(MARBELLA, destinos, { fetch: f as unknown as typeof fetch, cache });
    expect(r.every((x) => x.estimado)).toBe(true);
    expect(r[0].min).toBe(estimarMinutos({ lat: 36.51, lon: -4.88 }, RONDA));
    expect(cache.tamano).toBe(0);
  });

  it('HTTP 429, código de error o JSON roto: respaldo estimado', async () => {
    for (const mala of [
      { ok: false, status: 429, json: async () => ({}) },
      { ok: true, status: 200, json: async () => ({ code: 'InvalidQuery' }) },
      { ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } },
    ]) {
      const r = await minutosEnCoche(MARBELLA, [RONDA], { fetch: vi.fn().mockResolvedValue(mala) as unknown as typeof fetch });
      expect(r[0].estimado).toBe(true);
    }
  });

  it('un destino sin ruta (null) sale estimado y el resto, real', async () => {
    const f = vi.fn().mockResolvedValue(respuesta([[0, null, 900]]));
    const r = await minutosEnCoche(MARBELLA, destinos, { fetch: f as unknown as typeof fetch });
    expect(r[0].estimado).toBe(true);
    expect(r[1]).toEqual({ min: 15, estimado: false });
  });

  it('tiempo agotado (6 s): se aborta la petición y se estima', async () => {
    vi.useFakeTimers();
    try {
      const f = vi.fn().mockImplementation((_u: string, init: RequestInit) => new Promise((_res, rej) => {
        init.signal!.addEventListener('abort', () => rej(new DOMException('abortado', 'AbortError')));
      }));
      const p = minutosEnCoche(MARBELLA, [RONDA], { fetch: f as unknown as typeof fetch });
      await vi.advanceTimersByTimeAsync(6001);
      const r = await p;
      expect(r[0].estimado).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it('sin conexión: ni se llama a la red, todo estimado', async () => {
    const f = vi.fn();
    const r = await minutosEnCoche(MARBELLA, destinos, { fetch: f as unknown as typeof fetch, enLinea: false });
    expect(f).not.toHaveBeenCalled();
    expect(r.every((x) => x.estimado)).toBe(true);
  });

  it('lista vacía: sin peticiones', async () => {
    const f = vi.fn();
    expect(await minutosEnCoche(MARBELLA, [], { fetch: f as unknown as typeof fetch })).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('última posición guardada', () => {
  it('serializa y vuelve a leer; descarta lo inválido', () => {
    const p = { lat: 36.5, lon: -4.9, t: 1_700_000_000_000 };
    expect(parsearPosicion(serializarPosicion(p))).toEqual(p);
    expect(parsearPosicion(null)).toBeNull();
    expect(parsearPosicion('no es json')).toBeNull();
    expect(parsearPosicion('{"lat":"a","lon":1,"t":1}')).toBeNull();
    expect(parsearPosicion('{"lat":99,"lon":1,"t":1}')).toBeNull();
  });
  it('«hace …»', () => {
    expect(textoHace(10_000)).toBe('hace un momento');
    expect(textoHace(5 * 60_000)).toBe('hace 5 min');
    expect(textoHace(3 * 3_600_000)).toBe('hace 3 h');
    expect(textoHace(24 * 3_600_000)).toBe('hace 1 día');
    expect(textoHace(50 * 3_600_000)).toBe('hace 2 días');
  });
});
