import { describe, expect, it } from 'vitest';
import { anadirNota, anadirPunto, desnivelSerie, nombreArchivoGpx, nombreNota, nuevoSegmento, nuevoTrack, resumen, textoDuracion,
  textoResumen, trackAGeojson, trackAGpx, validarTrack, type Track } from './grabacion';

const T0 = Date.UTC(2026, 9, 18, 7, 0, 0);
const M_LAT = 1 / 111195;   // grados por metro hacia el norte (esfera de 6371 km)

/** Track hacia el norte: un punto cada `paso` m y 60 s, con las altitudes dadas. */
function trackNorte(alts: (number | null)[], paso = 20): Track {
  const tr = nuevoTrack('t1', T0);
  alts.forEach((alt, i) => anadirPunto(tr, { t: T0 + i * 60000, lat: 36.5 + i * paso * M_LAT, lon: -5, alt, prec: 8 }));
  return tr;
}

describe('filtro de puntos', () => {
  it('descarta lecturas imprecisas, sin coordenadas o que no se mueven', () => {
    const tr = nuevoTrack('t', T0);
    expect(anadirPunto(tr, { t: T0, lat: 36.5, lon: -5, prec: 80 })).toBe(false);
    expect(anadirPunto(tr, { t: T0, lat: NaN, lon: -5, prec: 5 })).toBe(false);
    expect(anadirPunto(tr, { t: T0, lat: 36.5, lon: -5, prec: 5, alt: 400 })).toBe(true);
    expect(anadirPunto(tr, { t: T0 + 5000, lat: 36.5 + 3 * M_LAT, lon: -5, prec: 5 })).toBe(false);    // 3 m
    expect(anadirPunto(tr, { t: T0 + 5000, lat: 36.5 + 8 * M_LAT, lon: -5, prec: 30 })).toBe(false);   // < 15 m con ±30
    expect(anadirPunto(tr, { t: T0 + 6000, lat: 36.5 + 8 * M_LAT, lon: -5, prec: 6 })).toBe(true);
    expect(tr.puntos.map((p) => p.alt)).toEqual([400, null]);
  });
});

describe('resumen', () => {
  it('distancia, desnivel con histéresis y duración', () => {
    const tr = trackNorte([100, 102, 101, 110, 120, 118, 119, 105]);
    const r = resumen(tr);
    expect(r.distancia_m).toBeCloseTo(140, -1);
    // 100 → 110 → 120 sube 20; 120 → 105 baja 15; los 1–2 m de ruido no cuentan.
    expect(r.subida_m).toBe(20);
    expect(r.bajada_m).toBe(15);
    expect(r.duracion_s).toBe(7 * 60);
    expect(r.puntos).toBe(8);
  });
  it('sin altitud del GPS el desnivel es null (PENDIENTE)', () => {
    const r = resumen(trackNorte([null, null, null]));
    expect(r.subida_m).toBeNull();
    expect(textoResumen(r)).toMatch(/desnivel PENDIENTE/);
  });
  it('los segmentos no unen el hueco entre ellos', () => {
    const tr = trackNorte([100, 100]);
    nuevoSegmento(tr);
    anadirPunto(tr, { t: T0 + 600000, lat: 36.6, lon: -5, prec: 5 });       // ~11 km más al norte
    anadirPunto(tr, { t: T0 + 660000, lat: 36.6 + 50 * M_LAT, lon: -5, prec: 5 });
    const r = resumen(tr);
    expect(r.segmentos).toBe(2);
    expect(r.distancia_m).toBeCloseTo(70, -1);
  });
  it('una grabación en curso cuenta hasta ahora', () => {
    const tr = nuevoTrack('t', T0);
    expect(resumen(tr, T0 + 125000).duracion_s).toBe(125);
  });
  it('desnivelSerie salta los huecos', () => {
    expect(desnivelSerie([null, 10, null, 20, 5])).toEqual({ subida: 10, bajada: 15 });
    expect(desnivelSerie([null, null])).toBeNull();
  });
  it('textos de duración', () => {
    expect(textoDuracion(42)).toBe('42 s');
    expect(textoDuracion(12 * 60 + 30)).toBe('12 min');
    expect(textoDuracion(2 * 3600 + 5 * 60)).toBe('2 h 05 min');
  });
});

describe('GPX', () => {
  const tr = trackNorte([400, 410.25, 420]);
  anadirNota(tr, { id: 'n1', t: T0 + 90000, lat: 36.5002, lon: -5, alt: 405, texto: 'aquí boletus <grande> & sano', estrellas: 2 });
  anadirNota(tr, { id: 'n2', t: T0 + 100000, lat: 36.5003, lon: -5, texto: '  ', estrellas: 9 });
  const gpx = trackAGpx(tr);

  it('es XML válido con track, segmentos y waypoints', () => {
    expect(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(gpx).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
    expect(gpx.match(/<trkpt /g)).toHaveLength(3);
    expect(gpx.match(/<trkseg>/g)).toHaveLength(1);
    expect(gpx.match(/<wpt /g)).toHaveLength(2);
    expect(gpx).toContain('<ele>410.3</ele>');
    expect(gpx).toContain(`<time>${new Date(T0).toISOString()}</time>`);
  });
  it('las notas llevan estrellas y texto escapado', () => {
    expect(gpx).toContain('<name>★★ aquí boletus &lt;grande&gt; &amp; sano</name>');
    expect(gpx).toContain('<desc>aquí boletus &lt;grande&gt; &amp; sano</desc>');
    expect(gpx).toContain('<name>Nota 2</name>');
    expect(tr.notas[1].estrellas).toBe(0);
  });
  it('metadatos con el resumen', () => {
    expect(gpx).toMatch(/<metadata><name>Ruta \d\d\/10\/2026 \d\d:\d\d<\/name><desc>[^<]*m · \+20 m \/ −0 m \(aprox\.\) · 2 min<\/desc>/);
  });
  it('nunca dice comestible', () => {
    expect(gpx).not.toMatch(/comestib/i);
  });
  it('nombre del archivo y de la nota', () => {
    expect(nombreArchivoGpx(tr)).toMatch(/^ruta-2026-10-18-\d{4}\.gpx$/);
    expect(nombreNota({ ...tr.notas[0], texto: 'x'.repeat(80), estrellas: 0 }, 0)).toHaveLength(60);
  });
});

describe('recuperar la grabación en curso', () => {
  it('valida y limpia lo guardado', () => {
    const tr = trackNorte([1, 2]);
    anadirNota(tr, { id: 'n', t: T0, lat: 36.5, lon: -5, texto: 'suelo seco', estrellas: 1 });
    const copia = JSON.parse(JSON.stringify(tr));
    copia.puntos.push({ lat: 'x' });
    const v = validarTrack(copia)!;
    expect(v.puntos).toHaveLength(2);
    expect(v.notas[0].texto).toBe('suelo seco');
    expect(v.fin).toBeNull();
    expect(validarTrack(null)).toBeNull();
    expect(validarTrack({ id: 1 })).toBeNull();
  });
  it('GeoJSON: una línea por segmento con 2+ puntos y las notas', () => {
    const tr = trackNorte([1, 2, 3]);
    anadirNota(tr, { id: 'n', t: T0, lat: 36.5, lon: -5, texto: 'a' });
    const g = trackAGeojson(tr);
    expect(g.features.filter((f) => f.properties.tipo === 'track')).toHaveLength(1);
    expect(g.features.filter((f) => f.properties.tipo === 'nota')).toHaveLength(1);
  });
});
