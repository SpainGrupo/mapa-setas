// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { aGPX, deGPX, aJSON, deJSON } from './intercambio';
import type { Sitio } from './tipos';

const raros = 'Ñandú & <castaños> "junto" al \'arroyo\' — 50 m → ✓ 🍄\nsegunda línea';
const sitios: Sitio[] = [
  { id: 'a1', lat: 36.7213028, lon: -4.4216366, estrellas: 3, nota: raros, especie: 'amanita_caesarea', fecha: '2026-10-13T08:15:00.000Z' },
  { id: 'b2', lat: 36.9, lon: -5.1, estrellas: 1, nota: '', especie: '', fecha: '2026-09-01T17:00:00.000Z' },
];
const nombres = { amanita_caesarea: 'Amanita caesarea' };

describe('GPX', () => {
  it('ida y vuelta conserva todo menos la foto', () => {
    const gpx = aGPX(sitios, nombres);
    expect(gpx).toContain('<wpt lat="36.7213028" lon="-4.4216366">');
    expect(gpx).toContain('<name>★★★ Amanita caesarea</name>');
    expect(gpx).toContain('&lt;castaños&gt;');
    expect(deGPX(gpx)).toEqual(sitios);
  });

  it('importa un GPX ajeno sin extensiones', () => {
    const ajeno = `<?xml version="1.0"?><gpx version="1.1" creator="OsmAnd" xmlns="http://www.topografix.com/GPX/1/1">
      <wpt lat="37.1" lon="-4.2"><name>Pinar</name><desc>bajo los pinos</desc></wpt></gpx>`;
    const [s] = deGPX(ajeno);
    expect(s.lat).toBe(37.1);
    expect(s.lon).toBe(-4.2);
    expect(s.nota).toBe('Pinar — bajo los pinos');
    expect(s.estrellas).toBe(1);
    expect(s.id).toBeTruthy();
  });

  it('rechaza un XML que no es GPX', () => {
    expect(() => deGPX('<hola/>')).toThrow();
  });
});

describe('JSON', () => {
  it('ida y vuelta con foto en base64', async () => {
    const foto = new Blob([new Uint8Array([0, 1, 2, 250, 255])], { type: 'image/jpeg' });
    const con = [{ ...sitios[0], foto }, sitios[1]];
    const txt = await aJSON(con);
    expect(JSON.parse(txt).sitios[0].foto.base64).toBe('AAEC+v8=');
    const { sitios: vuelta, descartados } = deJSON(txt);
    expect(descartados).toBe(0);
    expect(vuelta[1]).toEqual(sitios[1]);
    const { foto: f2, ...resto } = vuelta[0];
    expect(resto).toEqual(sitios[0]);
    expect(f2!.type).toBe('image/jpeg');
    expect([...new Uint8Array(await f2!.arrayBuffer())]).toEqual([0, 1, 2, 250, 255]);
  });

  it('rechaza un JSON de otro formato', () => {
    expect(() => deJSON('{"x":1}')).toThrow();
  });

  it('valida cada entrada: descarta las inválidas y normaliza el resto', () => {
    const txt = JSON.stringify({ formato: 'mapa-setas', version: 1, sitios: [
      { id: 'ok', lat: 36.5, lon: -5.2, estrellas: 2, nota: 'n', especie: 'x', fecha: '2026-10-01T10:00:00.000Z' },
      { lat: '37.1', lon: '-4.2', estrellas: 7, nota: 5, especie: null, fecha: 'ayer' },
      { id: 'sin-lon', lat: 36 },
      { id: 'fuera', lat: 95, lon: 0 },
      { id: 'inf', lat: 1e999, lon: 0 },
      { id: 'vacio', lat: '', lon: '' },
      null, 'texto', 42,
    ] });
    const antes = Date.now();
    const { sitios: l, descartados } = deJSON(txt);
    expect(descartados).toBe(7);
    expect(l).toHaveLength(2);
    expect(l[0]).toEqual({ id: 'ok', lat: 36.5, lon: -5.2, estrellas: 2, nota: 'n', especie: 'x', fecha: '2026-10-01T10:00:00.000Z' });
    const s = l[1];
    expect(s.id).toBeTruthy();
    expect([s.lat, s.lon, s.estrellas, s.nota, s.especie]).toEqual([37.1, -4.2, 1, '', '']);
    expect(Date.parse(s.fecha)).toBeGreaterThanOrEqual(antes - 1000);
  });

  it('una foto corrupta no descarta el sitio', () => {
    const txt = JSON.stringify({ formato: 'mapa-setas', sitios: [{ id: 'f', lat: 1, lon: 2, foto: { tipo: 'image/jpeg', base64: '%%%' } }] });
    const { sitios: [s], descartados } = deJSON(txt);
    expect(descartados).toBe(0);
    expect(s.foto).toBeUndefined();
  });
});
