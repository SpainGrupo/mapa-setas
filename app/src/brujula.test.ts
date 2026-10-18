import { describe, expect, it } from 'vitest';
import { cardinal, desnivel, distanciaM, giroFlecha, normalizar, orientacionDe, rumbo, suavizarAngulo, textoDesnivel, textoRumbo,
  urlNavegarGoogle } from './brujula';

const A = { lat: 36.5, lon: -5.0 };

describe('rumbo', () => {
  it('da los cuatro puntos cardinales', () => {
    expect(rumbo(A, { lat: 36.6, lon: -5.0 })).toBeCloseTo(0, 6);
    expect(rumbo(A, { lat: 36.4, lon: -5.0 })).toBeCloseTo(180, 6);
    expect(rumbo(A, { lat: 36.5, lon: -4.9 })).toBeCloseTo(90, 1);
    expect(rumbo(A, { lat: 36.5, lon: -5.1 })).toBeCloseTo(270, 1);
  });
  it('noreste a 45° con la corrección de la latitud', () => {
    const k = Math.cos((36.5 * Math.PI) / 180);
    expect(rumbo(A, { lat: 36.51, lon: -5.0 + 0.01 / k })).toBeCloseTo(45, 0);
  });
  it('siempre en [0, 360)', () => {
    for (const b of [{ lat: 36.49, lon: -5.01 }, { lat: 36.51, lon: -5.01 }]) {
      const r = rumbo(A, b);
      expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThan(360);
    }
  });
});

describe('distancia', () => {
  it('0,01° de latitud ≈ 1112 m', () => {
    expect(distanciaM(A, { lat: 36.51, lon: -5.0 })).toBeCloseTo(1112, -1);
  });
  it('es simétrica', () => {
    const b = { lat: 36.62, lon: -5.31 };
    expect(distanciaM(A, b)).toBeCloseTo(distanciaM(b, A), 6);
  });
});

describe('brújula', () => {
  it('normaliza ángulos negativos y mayores de 360', () => {
    expect(normalizar(-90)).toBe(270); expect(normalizar(725)).toBe(5);
  });
  it('la flecha apunta al sitio restando hacia dónde miras', () => {
    expect(giroFlecha(90, 0)).toBe(90);
    expect(giroFlecha(90, 90)).toBe(0);
    expect(giroFlecha(10, 350)).toBe(20);
    expect(giroFlecha(45, null)).toBe(45);
  });
  it('iOS: webkitCompassHeading manda', () => {
    expect(orientacionDe({ webkitCompassHeading: 120, alpha: 10, absolute: false })).toBe(120);
    expect(orientacionDe({ webkitCompassHeading: 350 }, 90)).toBe(80);
  });
  it('Android: 360 − alpha solo si es absoluto', () => {
    expect(orientacionDe({ alpha: 90, absolute: true })).toBe(270);
    expect(orientacionDe({ alpha: 90, absolute: false })).toBeNull();
    expect(orientacionDe({ alpha: null, absolute: true })).toBeNull();
    expect(orientacionDe({ webkitCompassHeading: -1 })).toBeNull();
  });
  it('suaviza por el camino corto al cruzar el norte', () => {
    expect(suavizarAngulo(null, 370)).toBe(10);
    const s = suavizarAngulo(350, 10, 0.5);
    expect(s).toBeCloseTo(0, 6);
  });
  it('textos de rumbo', () => {
    expect(cardinal(44)).toBe('noreste'); expect(cardinal(359)).toBe('norte'); expect(cardinal(200)).toBe('sur');
    expect(textoRumbo(225.4)).toBe('al suroeste (225°)');
  });
});

describe('desnivel restante', () => {
  it('sitio menos GPS', () => {
    expect(desnivel(500, 620)).toBe(120);
    expect(desnivel(700, 620)).toBe(-80);
  });
  it('PENDIENTE si falta una altitud', () => {
    expect(desnivel(null, 620)).toBeNull();
    expect(desnivel(500, NaN)).toBeNull();
    expect(desnivel(undefined, undefined)).toBeNull();
    expect(textoDesnivel(null, 'sin altitud del GPS')).toBe('Desnivel: PENDIENTE (sin altitud del GPS)');
  });
  it('texto redondeado a 5 m', () => {
    expect(textoDesnivel(122)).toBe('≈ 120 m por subir');
    expect(textoDesnivel(-38)).toBe('≈ 40 m por bajar');
    expect(textoDesnivel(4)).toBe('Casi a la misma altura');
  });
});

it('Google Maps navega desde tu posición (sin origin)', () => {
  const u = new URL(urlNavegarGoogle({ lat: 36.512345, lon: -5.123456 }, 'walking'));
  expect(u.origin + u.pathname).toBe('https://www.google.com/maps/dir/');
  expect(u.searchParams.get('destination')).toBe('36.51235,-5.12346');
  expect(u.searchParams.get('travelmode')).toBe('walking');
  expect(u.searchParams.get('dir_action')).toBe('navigate');
  expect(u.searchParams.has('origin')).toBe(false);
});
