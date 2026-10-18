// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { dentroDe, generarEnlace, MAX_PUNTOS, parsearEnlace, puntosDeKml, urlSinEnlace } from './enlaces';

describe('enlaces con puntos', () => {
  it('un punto con nombre y nota', () => {
    const e = parsearEnlace('?ir=36.60071,-4.81962&n=Arroyo%20aereus&nota=Bajo%20alcornoques');
    expect(e).toEqual({ puntos: [{ lat: 36.60071, lon: -4.81962, nombre: 'Arroyo aereus', nota: 'Bajo alcornoques' }], descartados: 0 });
  });
  it('varios puntos; el nombre puede llevar comas', () => {
    const e = parsearEnlace('?pts=36.6,-4.8,Arroyo%20aereus;36.61,-4.82,Loma,%20umbría;36.62,-4.83');
    expect(e.puntos.map((p) => p.nombre)).toEqual(['Arroyo aereus', 'Loma, umbría', '']);
    expect(e.puntos[2]).toMatchObject({ lat: 36.62, lon: -4.83 });
  });
  it('en el hash: #ir=…, #ir?ir=… y #pts=…', () => {
    expect(parsearEnlace('', '#ir=36.6,-4.8&n=A').puntos[0]).toMatchObject({ lat: 36.6, nombre: 'A' });
    expect(parsearEnlace('', '#ir?ir=36.6,-4.8').puntos).toHaveLength(1);
    expect(parsearEnlace('', '#pts=36.6,-4.8;36.7,-4.9').puntos).toHaveLength(2);
    expect(parsearEnlace('', '#ir').puntos).toHaveLength(0);
  });
  it('descarta coordenadas inválidas y limita el número', () => {
    expect(parsearEnlace('?ir=136.6,-4.8').descartados).toBe(1);
    expect(parsearEnlace('?pts=abc,1;36.6,-4.8;36.6').descartados).toBe(2);
    const muchos = Array.from({ length: 30 }, (_, i) => `36.${i},-4.8`).join(';');
    const e = parsearEnlace(`?pts=${muchos}`);
    expect(e.puntos).toHaveLength(MAX_PUNTOS);
    expect(e.descartados).toBe(5);
  });
  it('limpia caracteres de control y recorta', () => {
    const e = parsearEnlace(`?ir=36.6,-4.8&n=${encodeURIComponent('a\u0000b'.padEnd(200, 'x'))}`);
    expect(e.puntos[0].nombre).toHaveLength(80);
    expect(e.puntos[0].nombre.startsWith('a b')).toBe(true);
  });
  it('sin parámetros, vacío', () => {
    expect(parsearEnlace('?e2e=1&hoy=2026-10-14', '')).toEqual({ puntos: [], descartados: 0 });
  });
  it('quita del URL solo lo del enlace', () => {
    expect(urlSinEnlace('https://x.io/mapa-setas/?e2e=1&ir=36.6,-4.8&n=A#ir')).toBe('https://x.io/mapa-setas/?e2e=1');
    expect(urlSinEnlace('https://x.io/?pts=1,2')).toBe('https://x.io/');
    expect(urlSinEnlace('https://x.io/#otro')).toBe('https://x.io/#otro');
  });
  it('generar y volver a leer (ida y vuelta)', () => {
    const base = 'https://spaingrupo.github.io/mapa-setas/';
    const uno = generarEnlace(base, [{ lat: 36.600714, lon: -4.819623, nombre: 'Arroyo aereus', nota: 'ojo, finca' }]);
    expect(uno).toBe('https://spaingrupo.github.io/mapa-setas/?ir=36.600714%2C-4.819623&n=Arroyo+aereus&nota=ojo%2C+finca');
    const u = new URL(uno);
    expect(parsearEnlace(u.search).puntos[0]).toEqual({ lat: 36.600714, lon: -4.819623, nombre: 'Arroyo aereus', nota: 'ojo, finca' });
    const varios = new URL(generarEnlace(base, [{ lat: 36.6, lon: -4.8, nombre: 'A;B' }, { lat: 36.7, lon: -4.9 }]));
    expect(parsearEnlace(varios.search).puntos.map((p) => p.nombre)).toEqual(['A,B', '']);
  });
  it('dentro de la caja de la región', () => {
    expect(dentroDe({ lat: 36.6, lon: -4.8 }, [-5.5, 36.2, -4.5, 37])).toBe(true);
    expect(dentroDe({ lat: 38.3, lon: -0.5 }, [-5.5, 36.2, -4.5, 37])).toBe(false);
  });
});

describe('KML', () => {
  it('lee los Placemark con Point (como el «Exportar día»)', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><name>1 · Boletus aereus (82)</name><description>Por qué: hábitat</description><Point><coordinates>-4.81962,36.60071,0</coordinates></Point></Placemark>
      <Placemark><name>línea</name><LineString><coordinates>-4.8,36.6 -4.9,36.7</coordinates></LineString></Placemark>
      <Placemark><name>mal</name><Point><coordinates>x,y</coordinates></Point></Placemark>
    </Document></kml>`;
    expect(puntosDeKml(kml)).toEqual([{ lat: 36.60071, lon: -4.81962, nombre: '1 · Boletus aereus (82)', nota: 'Por qué: hábitat' }]);
  });
  it('rechaza lo que no es KML', () => {
    expect(() => puntosDeKml('<gpx/>')).toThrow(/KML/);
  });
});
