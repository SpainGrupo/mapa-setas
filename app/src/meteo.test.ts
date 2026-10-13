import { describe, expect, it, vi } from 'vitest';
import { consultar, corregirAltitud, edadHoras, fechaMadrid, lotes, MAX_URL, necesitaRefresco, obtener, urlOpenMeteo,
  type DatosMeteo, type PuntoMeteo } from './meteo';

const punto = (id: number, alt = 500): PuntoMeteo => ({ id, lat: 36 + id / 100, lon: -5 - id / 100, alt_media: alt });

/** Respuesta de Open-Meteo para n ubicaciones (2 días), con la elevación de la celda del modelo. */
function respuesta(ps: PuntoMeteo[], elev = 300) {
  const una = (p: PuntoMeteo) => ({ latitude: p.lat, longitude: p.lon, elevation: elev,
    daily: { time: ['2026-10-12', '2026-10-13'], precipitation_sum: [4.2, null],
      temperature_2m_max: [20, 22], temperature_2m_min: [10, 12] } });
  return ps.length === 1 ? una(ps[0]) : ps.map(una);
}
function fetchFalso() {
  return vi.fn(async (url: string) => {
    const lat = new URL(url).searchParams.get('latitude')!.split(',');
    const ps = lat.map((_, i) => punto(i));
    return new Response(JSON.stringify(respuesta(ps)), { status: 200 });
  });
}

describe('lotes y URL', () => {
  it('parte en lotes de 40', () => {
    expect(lotes(Array.from({ length: 99 }, (_, i) => i)).map((l) => l.length)).toEqual([40, 40, 19]);
  });
  it('la URL lleva coordenadas, variables y parámetros', () => {
    const u = new URL(urlOpenMeteo([punto(1), punto(2)]));
    expect(u.origin + u.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(u.searchParams.get('latitude')).toBe('36.01,36.02');
    expect(u.searchParams.get('longitude')).toBe('-5.01,-5.02');
    expect(u.searchParams.get('daily')).toBe('precipitation_sum,temperature_2m_max,temperature_2m_min');
    expect(u.searchParams.get('past_days')).toBe('30');
    expect(u.searchParams.get('forecast_days')).toBe('7');
    expect(u.searchParams.get('timezone')).toBe('Europe/Madrid');
  });
  it('pocos puntos: una sola petición; si la URL es larga, lotes de 40', async () => {
    const f1 = fetchFalso();
    await consultar([punto(1), punto(2)], f1, new Date('2026-10-13T10:00:00Z'));
    expect(f1).toHaveBeenCalledTimes(1);
    const muchos = Array.from({ length: 99 }, (_, i) => ({ ...punto(i), lat: 36.123456 + i / 1000, lon: -5.123456 - i / 1000 }));
    expect(urlOpenMeteo(muchos).length).toBeGreaterThan(MAX_URL);
    const f2 = fetchFalso();
    const d = await consultar(muchos, f2, new Date('2026-10-13T10:00:00Z'));
    expect(f2).toHaveBeenCalledTimes(3);
    expect(Object.keys(d.puntos)).toHaveLength(99);
    expect(d.puntos['98']).toHaveLength(2);
  });
  it('error HTTP → excepción', async () => {
    const f = vi.fn(async () => new Response('x', { status: 429 }));
    await expect(consultar([punto(1)], f)).rejects.toThrow(/429/);
  });
});

describe('corrección por altitud', () => {
  it('−0,65 °C por cada 100 m por encima de la celda del modelo', () => {
    expect(corregirAltitud(20, 300, 800)).toBeCloseTo(16.75);
    expect(corregirAltitud(20, 800, 300)).toBeCloseTo(23.25);
  });
  it('consultar aplica la corrección y la lluvia nula cuenta como 0', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(respuesta([punto(0, 1300)], 300))));
    const d = await consultar([punto(0, 1300)], f, new Date('2026-10-13T10:00:00Z'));
    expect(d.puntos['0']).toEqual([
      { fecha: '2026-10-12', lluvia: 4.2, tmin: 3.5, tmax: 13.5 },
      { fecha: '2026-10-13', lluvia: 0, tmin: 5.5, tmax: 15.5 },
    ]);
    expect(d.hoy).toBe('2026-10-13');
    expect(d.fecha_consulta).toBe('2026-10-13T10:00:00.000Z');
  });
});

describe('caché y caducidad', () => {
  const datos = (iso: string): DatosMeteo => ({ fecha_consulta: iso, hoy: iso.slice(0, 10), puntos: {} });
  const ahora = new Date('2026-10-13T12:00:00Z');
  it('edad en horas', () => {
    expect(edadHoras(datos('2026-10-13T09:00:00Z'), ahora)).toBeCloseTo(3);
  });
  it('refresca si no hay caché o tiene más de 3 h, y solo con red', () => {
    expect(necesitaRefresco(null, ahora, true)).toBe(true);
    expect(necesitaRefresco(datos('2026-10-13T10:00:00Z'), ahora, true)).toBe(false);
    expect(necesitaRefresco(datos('2026-10-13T08:59:00Z'), ahora, true)).toBe(true);
    expect(necesitaRefresco(datos('2026-10-13T08:59:00Z'), ahora, false)).toBe(false);
  });
  it('obtener: caché fresca no llama a la red', async () => {
    const f = fetchFalso();
    const r = await obtener([punto(1)], { fetchFn: f, leer: async () => datos('2026-10-13T11:00:00Z'), guardar: async () => {}, ahora, enLinea: true });
    expect(f).not.toHaveBeenCalled();
    expect(r.origen).toBe('cache');
  });
  it('obtener: caché vieja + red → consulta y guarda', async () => {
    const f = fetchFalso();
    const guardar = vi.fn(async () => {});
    const r = await obtener([punto(1)], { fetchFn: f, leer: async () => datos('2026-10-12T11:00:00Z'), guardar, ahora, enLinea: true });
    expect(r.origen).toBe('red');
    expect(guardar).toHaveBeenCalledWith(r.datos);
  });
  it('obtener: forzar consulta aunque la caché sea fresca; si la red falla, devuelve la caché y el error', async () => {
    const f = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const c = datos('2026-10-13T11:30:00Z');
    const r = await obtener([punto(1)], { fetchFn: f, leer: async () => c, guardar: async () => {}, ahora, enLinea: true, forzar: true });
    expect(f).toHaveBeenCalled();
    expect(r).toMatchObject({ origen: 'cache', datos: c });
    expect(r.error).toMatch(/Failed to fetch/);
  });
  it('obtener: sin red ni caché → null', async () => {
    const r = await obtener([punto(1)], { fetchFn: fetchFalso(), leer: async () => null, guardar: async () => {}, ahora, enLinea: false });
    expect(r.datos).toBeNull();
  });
  it('fecha de hoy en Madrid', () => {
    expect(fechaMadrid(new Date('2026-10-13T22:30:00Z'))).toBe('2026-10-14');
  });
});
