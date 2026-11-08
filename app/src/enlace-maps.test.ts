// Enlaces de Google Maps del chat: detección en el texto, coordenadas de todos los formatos (incluido el ejemplo real
// de Alexander) y resolución de los cortos a través del Worker.
import { describe, expect, it, vi } from 'vitest';
import { buscarEnlacesMaps, coordenadasDeUrl, esEnlaceCorto, esEnlaceMaps, resolvedorWorker, ubicacionesDeEnlaces, urlResolverEnlace } from './enlace-maps';

const CORTO = 'https://maps.app.goo.gl/zcKpg1MnaUy2fDZd7?g_st=ic';
const TEXTO_REAL = `${CORTO} aquí estaban con gusanos ya`;

describe('coordenadasDeUrl', () => {
  const casos: [string, string, { lat: number; lon: number }][] = [
    ['el ejemplo real (a donde redirige el enlace corto)', 'https://maps.google.com/?q=36.6315310,-4.7924210', { lat: 36.631531, lon: -4.792421 }],
    ['?q= con coma codificada', 'https://www.google.com/maps?q=36.6315%2C-4.7924', { lat: 36.6315, lon: -4.7924 }],
    ['?q= con espacio', 'https://www.google.com/maps?q=36.6315,%20-4.7924', { lat: 36.6315, lon: -4.7924 }],
    ['?q=loc:', 'https://maps.google.com/?q=loc:36.6315,-4.7924', { lat: 36.6315, lon: -4.7924 }],
    ['?q=lat,lon+(nombre)', 'https://maps.google.com/?q=36.6315,-4.7924+(Bosque)', { lat: 36.6315, lon: -4.7924 }],
    ['?query=', 'https://www.google.com/maps/search/?api=1&query=36.6315,-4.7924', { lat: 36.6315, lon: -4.7924 }],
    ['?ll=', 'https://maps.google.es/?ll=36.6315,-4.7924&z=15', { lat: 36.6315, lon: -4.7924 }],
    ['?center=', 'https://www.google.com/maps?center=36.6315,-4.7924&zoom=14', { lat: 36.6315, lon: -4.7924 }],
    ['?destination=', 'https://www.google.com/maps/dir/?api=1&destination=36.6315,-4.7924', { lat: 36.6315, lon: -4.7924 }],
    ['/@lat,lon,zoom', 'https://www.google.com/maps/@36.6315,-4.7924,17z', { lat: 36.6315, lon: -4.7924 }],
    ['/place/nombre/@lat,lon', 'https://www.google.com/maps/place/Ojén/@36.5649,-4.8586,15z/data=!3m1!4b1', { lat: 36.5649, lon: -4.8586 }],
    ['!3d!4d (marcador) gana sobre @ (vista)', 'https://www.google.com/maps/place/Bar/@36.6000,-4.8000,17z/data=!4m6!3m5!1s0xd72:0x5!8m2!3d36.6315310!4d-4.7924210', { lat: 36.631531, lon: -4.792421 }],
    ['!3d!4d sin @', 'https://www.google.com/maps/place/X/data=!8m2!3d36.1!4d-5.35', { lat: 36.1, lon: -5.35 }],
    ['/place/lat,lon', 'https://www.google.com/maps/place/36.6315,-4.7924', { lat: 36.6315, lon: -4.7924 }],
    ['/place/lat%2Clon', 'https://www.google.com/maps/place/36.6315%2C-4.7924', { lat: 36.6315, lon: -4.7924 }],
    ['/search/lat,lon', 'https://www.google.com/maps/search/36.6315,-4.7924', { lat: 36.6315, lon: -4.7924 }],
    ['sur y este', 'https://www.google.com/maps/@-33.8688,151.2093,12z', { lat: -33.8688, lon: 151.2093 }],
  ];
  for (const [n, u, e] of casos) it(n, () => expect(coordenadasDeUrl(u)).toEqual(e));
  for (const u of ['https://maps.google.com/?q=Casa+Pepe', 'https://www.google.com/maps/place/Marbella', CORTO, 'https://maps.google.com/?q=95,-4', 'https://maps.google.com/?q=36,-200', 'https://maps.google.com/?q=0,0', 'basura', '']) {
    it(`null: ${u.slice(0, 45) || '(vacío)'}`, () => expect(coordenadasDeUrl(u)).toBeNull());
  }
});

describe('buscarEnlacesMaps', () => {
  it('el ejemplo real de Alexander: enlace corto + texto', () => {
    const e = buscarEnlacesMaps(TEXTO_REAL);
    expect(e).toHaveLength(1);
    expect(e[0].corto).toBe(true);
    expect(e[0].original).toBe(CORTO);
    expect(e[0].url.hostname).toBe('maps.app.goo.gl');
  });
  it('detecta cada familia de enlaces y los largos no son cortos', () => {
    for (const [t, corto] of [
      ['mira maps.app.goo.gl/abc123 qué sitio', true], ['https://goo.gl/maps/xyz', true], ['https://www.google.com/maps/@36.6,-4.7,15z', false],
      ['https://www.google.es/maps/place/X', false], ['https://maps.google.com/?q=36.5,-4.5', false], ['(https://maps.google.es/?ll=36.5,-4.5).', false],
    ] as [string, boolean][]) {
      const e = buscarEnlacesMaps(t);
      expect(e, t).toHaveLength(1);
      expect(e[0].corto, t).toBe(corto);
    }
  });
  it('ignora lo que no es de Google Maps (y los dominios que lo imitan)', () => {
    for (const t of ['https://example.com/maps/@1,2,3z', 'https://google.com.evil.com/maps/@1,2,3z', 'https://evilmaps.app.goo.gl.evil.com/abc', 'https://www.google.com/search?q=maps', 'https://drive.google.com/maps', 'hola, ¿qué tal? 36.5, -4.5', 'ftp://maps.google.com/?q=1,2', 'javascript:alert(1)']) {
      expect(buscarEnlacesMaps(t), t).toEqual([]);
    }
  });
  it('sin repetidos y como mucho 3', () => {
    expect(buscarEnlacesMaps(`${CORTO} ${CORTO}`)).toHaveLength(1);
    const cuatro = [1, 2, 3, 4].map((i) => `https://maps.app.goo.gl/a${i}`).join(' ');
    expect(buscarEnlacesMaps(cuatro)).toHaveLength(3);
  });
  it('esEnlaceMaps / esEnlaceCorto', () => {
    expect(esEnlaceMaps(new URL(CORTO))).toBe(true);
    expect(esEnlaceCorto(new URL('https://goo.gl/maps/a'))).toBe(true);
    expect(esEnlaceCorto(new URL('https://goo.gl/otra'))).toBe(false);
    expect(esEnlaceMaps(new URL('https://maps.google.com.evil.com/?q=1,2'))).toBe(false);
  });
});

describe('ubicacionesDeEnlaces', () => {
  it('los largos se resuelven en local, sin llamar al Worker', async () => {
    const resolver = vi.fn();
    const r = await ubicacionesDeEnlaces('mira https://www.google.com/maps/@36.6315,-4.7924,17z', resolver);
    expect(r.ubicaciones).toEqual([{ lat: 36.6315, lon: -4.7924, origen: 'enlace' }]);
    expect(resolver).not.toHaveBeenCalled();
  });
  it('el enlace corto del ejemplo se resuelve con el Worker', async () => {
    const resolver = vi.fn(async () => ({ lat: 36.631531, lon: -4.792421 }));
    const r = await ubicacionesDeEnlaces(TEXTO_REAL, resolver);
    expect(resolver).toHaveBeenCalledWith(CORTO);
    expect(r.ubicaciones).toEqual([{ lat: 36.631531, lon: -4.792421, origen: 'enlace' }]);
    expect(r.sinResolver).toEqual([]);
  });
  it('un corto que no se resuelve (o sin resolvedor) queda en sinResolver', async () => {
    expect((await ubicacionesDeEnlaces(TEXTO_REAL, async () => null)).sinResolver).toEqual([CORTO]);
    expect((await ubicacionesDeEnlaces(TEXTO_REAL)).sinResolver).toEqual([CORTO]);
    expect(await ubicacionesDeEnlaces('sin enlaces')).toEqual({ ubicaciones: [], sinResolver: [] });
  });
});

describe('resolvedorWorker', () => {
  it('urlResolverEnlace quita /identificar y /chat', () => {
    for (const u of ['https://w.test', 'https://w.test/', 'https://w.test/identificar', 'https://w.test/chat']) expect(urlResolverEnlace(u)).toBe('https://w.test/resolver-enlace');
  });
  it('POST {url} y devuelve lat/lon', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ lat: 36.631531, lon: -4.792421 }), { status: 200 }));
    expect(await resolvedorWorker('https://w.test/identificar', f as never)(CORTO)).toEqual({ lat: 36.631531, lon: -4.792421 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://w.test/resolver-enlace');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ url: CORTO });
  });
  it('nunca lanza: error HTTP, respuesta rara o red caída -> null', async () => {
    for (const f of [async () => new Response('{}', { status: 422 }), async () => new Response('{"lat":"x"}', { status: 200 }), async () => new Response('{"lat":99,"lon":0}', { status: 200 }), async () => new Response('no json', { status: 200 }), async () => { throw new TypeError('red'); }]) {
      expect(await resolvedorWorker('https://w.test', f as never)(CORTO)).toBeNull();
    }
  });
});
