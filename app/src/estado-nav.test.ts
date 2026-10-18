import { describe, expect, it } from 'vitest';
import { CLAVE_NAV, guardarNav, leerNav, sanear, VIGENCIA_LOCAL_MS, type EstadoNav } from './estado-nav';

const memoria = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };
const EST: EstadoNav = { v: 1, t: 1000, region: 'marbella', pantalla: 'p-hoy', scroll: { 'p-hoy': 420 },
  mapa: { lon: -5.2, lat: 36.6, zoom: 12.5, bearing: 0 }, capas: true, hoy: { especie: 'boletus_aereus', dia: '2026-10-20' } };

describe('estado de navegación', () => {
  it('guarda en los dos almacenes y lee el de la sesión primero', () => {
    const s = memoria(), l = memoria();
    guardarNav(EST, () => s, () => l);
    expect(JSON.parse(s.m.get(CLAVE_NAV)!)).toEqual(EST);
    expect(leerNav(() => s, () => l, 99999999)).toEqual(EST);   // la sesión vale con cualquier antigüedad
  });
  it('sin sesión, localStorage solo si es reciente', () => {
    const l = memoria();
    guardarNav(EST, () => l);
    expect(leerNav(() => null, () => l, EST.t + 60_000)).toEqual(EST);
    expect(leerNav(() => null, () => l, EST.t + VIGENCIA_LOCAL_MS + 1)).toBeNull();
  });
  it('almacenes que lanzan (modo privado) o JSON roto: null, sin excepción', () => {
    const roto = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); } };
    expect(() => guardarNav(EST, () => roto)).not.toThrow();
    expect(leerNav(() => roto, () => ({ getItem: () => '{no json', setItem: () => {} }))).toBeNull();
  });
  it('sanea campo a campo', () => {
    expect(sanear({ v: 2, t: 1 })).toBeNull();
    expect(sanear({ v: 1, t: 1, pantalla: 'javascript:x', scroll: { 'p-hoy': -3, 'p-guia': 10, malo: 5 },
      mapa: { lon: 500, lat: 0, zoom: 3 }, capas: 'sí', hoy: { dia: 'mañana', especie: 'x' } }))
      .toEqual({ v: 1, t: 1, scroll: { 'p-guia': 10 }, hoy: { especie: 'x' } });
  });
});
