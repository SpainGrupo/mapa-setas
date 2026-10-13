import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Gps, ESPERA_GPS_MS } from './gps';

type Exito = (p: { coords: { latitude: number; longitude: number; accuracy: number } }) => void;
type Fallo = (e: { code: number; PERMISSION_DENIED: number }) => void;

let exito: Exito, fallo: Fallo;
const geo = {
  watchPosition: vi.fn((ok: Exito, mal: Fallo) => { exito = ok; fallo = mal; return 7; }),
  clearWatch: vi.fn(),
};
const mapa = { getSource: () => ({ setData() {} }), addSource() {}, addLayer() {}, flyTo: vi.fn(), getZoom: () => 10 } as any;
const fix = { coords: { latitude: 36.5, longitude: -5.2, accuracy: 10 } };
const err = (code: number) => ({ code, PERMISSION_DENIED: 1 });

beforeEach(() => {
  vi.useFakeTimers();
  geo.watchPosition.mockClear(); geo.clearWatch.mockClear();
  vi.stubGlobal('navigator', { geolocation: geo });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Gps.posicion', () => {
  it('resuelve con la primera lectura', async () => {
    const g = new Gps(mapa, vi.fn());
    const p = g.posicion();
    exito(fix);
    await expect(p).resolves.toEqual({ lat: 36.5, lon: -5.2, precision: 10 });
  });

  it('rechaza a los que esperan si hay error', async () => {
    const g = new Gps(mapa, vi.fn());
    const p = g.posicion();
    fallo(err(2));
    await expect(p).rejects.toThrow('No se pudo obtener');
  });

  it('rechaza por tiempo a los 20 s', async () => {
    const g = new Gps(mapa, vi.fn());
    const p = g.posicion();
    const r = expect(p).rejects.toThrow('a tiempo');
    vi.advanceTimersByTime(ESPERA_GPS_MS);
    await r;
  });

  it('sin permiso para el watch para poder reintentar con otro toque', async () => {
    const g = new Gps(mapa, vi.fn());
    const p = g.posicion();
    fallo(err(1));
    await expect(p).rejects.toThrow('Sin permiso');
    expect(geo.clearWatch).toHaveBeenCalledWith(7);
    const p2 = g.posicion();
    expect(geo.watchPosition).toHaveBeenCalledTimes(2);
    exito(fix);
    await expect(p2).resolves.toMatchObject({ lat: 36.5 });
  });

  it('avisa del error una sola vez hasta una lectura buena', () => {
    const aviso = vi.fn();
    const g = new Gps(mapa, aviso);
    g.iniciar();
    fallo(err(2)); fallo(err(3)); fallo(err(2));
    expect(aviso).toHaveBeenCalledTimes(1);
    exito(fix);
    fallo(err(2));
    expect(aviso).toHaveBeenCalledTimes(2);
  });
});
