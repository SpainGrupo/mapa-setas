import { describe, expect, it } from 'vitest';
import { analizar, analizarPendientes, peticionExplorar, redondear2, urlExplorar, validarRespuestaExplorar } from './explorar-red';
import { nuevaObservacion, type DireccionGemini, type Observacion } from './observaciones-datos';

const CTX = { especieNombre: 'Boletus aereus', arbolesRegion: ['alcornoque', 'encina', 'quejigo', 'castano', 'pino'] };
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);
const RUMBOS = [0, 45, 90, 135, 180, 225, 270, 315];
const resp = (rumbo: number, p: Partial<DireccionGemini> = {}): DireccionGemini => ({
  rumbo, arbol_dominante: 'alcornoque', confianza_arbol: 'media', densidad_copas: 'media', sotobosque: 'despejado',
  suelo_visible: ['hojarasca'], humedad_aparente: 'media', notas: '', ...p,
});
function obs(rumbos = RUMBOS, extra: Partial<Observacion> = {}): Observacion {
  const o = nuevaObservacion({ lat: 36.6149, lon: -5.0851, precGps: 5, altGps: 641.4, altModelo: 640.2, especie: 'boletus_aereus', rutaId: null, t: Date.UTC(2026, 9, 20) });
  o.direcciones = rumbos.map((r) => ({ rumbo: r, precBrujula: 5, foto: new Blob([JPEG], { type: 'image/jpeg' }), analisis: null }));
  o.modeloSector = rumbos.map((_, i) => (i % 3 === 1 ? null : 40 + i));
  return Object.assign(o, extra);
}
const json = (cuerpo: unknown, estado = 200) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

describe('redondear2', () => {
  it('a 2 decimales', () => { expect(redondear2(36.6149)).toBe(36.61); expect(redondear2(-5.0851)).toBe(-5.09); });
});

describe('urlExplorar', () => {
  it('cambia /identificar por /explorar y añade la ruta a la base sin ella', () => {
    expect(urlExplorar('https://w.example/identificar')).toBe('https://w.example/explorar');
    expect(urlExplorar('https://w.example')).toBe('https://w.example/explorar');
    expect(urlExplorar('https://w.example/')).toBe('https://w.example/explorar');
    expect(urlExplorar('')).toBe('');
  });
});

describe('peticionExplorar', () => {
  it('lat/lon a 2 decimales, fotos en base64 sin prefijo y solo los campos del contrato', async () => {
    const p = await peticionExplorar(obs(), CTX) as any;
    expect(Object.keys(p).sort()).toEqual(['contexto', 'fotos']);
    expect(p.contexto.lat).toBe(36.61);
    expect(p.contexto.lon).toBe(-5.09);
    expect(Object.keys(p.contexto).sort()).toEqual(['altitud', 'arboles_region', 'especie', 'especie_nombre', 'lat', 'lon', 'mes', 'modelo_sector']);
    expect(p.contexto.mes).toBe(10);
    expect(p.contexto.altitud).toBe(640);
    expect(p.contexto.especie).toBe('boletus_aereus');
    expect(p.contexto.especie_nombre).toBe('Boletus aereus');
    expect(p.contexto.arboles_region).toEqual(CTX.arbolesRegion);
    expect(p.fotos).toHaveLength(8);
    expect(p.fotos[0]).toEqual({ rumbo: 0, jpeg: Buffer.from(JPEG).toString('base64') });
    expect(p.fotos[0].jpeg).not.toMatch(/^data:/);
    expect(p.contexto.modelo_sector).toHaveLength(8);
    expect(p.contexto.modelo_sector[1]).toBeNull();
    expect(JSON.stringify(p)).not.toMatch(/36\.6149|-5\.0851|641/);
  });
  it('rumbo entero 0–359 (359,6 → 0; 12,4 → 12)', async () => {
    const p = await peticionExplorar(obs([359.6, 12.4]), CTX) as any;
    expect(p.fotos.map((f: any) => f.rumbo)).toEqual([0, 12]);
  });
  it('altitud: la del modelo; sin ella la del GPS; sin ninguna, null', async () => {
    expect(((await peticionExplorar(obs(RUMBOS, { altModelo: null }), CTX)) as any).contexto.altitud).toBe(641);
    expect(((await peticionExplorar(obs(RUMBOS, { altModelo: null, altGps: null }), CTX)) as any).contexto.altitud).toBeNull();
  });
  it('sin seta o sin árboles de la región no se envían esos campos; direcciones sin foto se saltan (y su modelo)', async () => {
    const o = obs([0, 90, 180], { especie: '' });
    o.direcciones[1].foto = null;
    const p = await peticionExplorar(o, { especieNombre: '', arbolesRegion: [] }) as any;
    expect(p.contexto.especie).toBeUndefined();
    expect(p.contexto.especie_nombre).toBeUndefined();
    expect(p.contexto.arboles_region).toBeUndefined();
    expect(p.fotos.map((f: any) => f.rumbo)).toEqual([0, 180]);
    expect(p.contexto.modelo_sector).toEqual([o.modeloSector[0], o.modeloSector[2]]);
  });
});

describe('validarRespuestaExplorar', () => {
  const ok = { direcciones: RUMBOS.map((r) => resp(r)), aviso: 'x' };
  it('devuelve una dirección por rumbo, en orden', () => {
    expect(validarRespuestaExplorar(ok, RUMBOS).map((d) => d.rumbo)).toEqual(RUMBOS);
  });
  it('con 7 direcciones para 8 rumbos lanza', () => {
    expect(() => validarRespuestaExplorar({ direcciones: ok.direcciones.slice(0, 7) }, RUMBOS)).toThrow();
  });
  it('lanza si no es un objeto, no hay lista o un rumbo no coincide', () => {
    expect(() => validarRespuestaExplorar(null, RUMBOS)).toThrow();
    expect(() => validarRespuestaExplorar({}, RUMBOS)).toThrow();
    expect(() => validarRespuestaExplorar({ direcciones: [resp(1)] }, [0])).toThrow();
    expect(() => validarRespuestaExplorar({ direcciones: [{ nada: 1 }] }, [0])).toThrow();
  });
  it('valores fuera de lista pasan a no_se_ve y las notas nunca dicen «comestible»', () => {
    const [d] = validarRespuestaExplorar({ direcciones: [{ ...resp(0), arbol_dominante: 'secuoya', notas: 'bosque comestible' }] }, [0]);
    expect(d.arbol_dominante).toBe('no_se_ve');
    expect(d.notas).not.toMatch(/comestible/i);
  });
});

describe('analizar', () => {
  const URL = 'https://w.example/explorar';
  it('éxito: estado analizada y análisis en cada dirección, con la petición POST', async () => {
    let visto: { url: string; init: RequestInit } | null = null;
    const f = (async (url: string, init: RequestInit) => { visto = { url, init }; return json({ direcciones: RUMBOS.map((r) => resp(r)), aviso: 'x' }); }) as unknown as typeof fetch;
    const r = await analizar(obs(), CTX, URL, f);
    expect(r.estado).toBe('analizada');
    expect(r.error).toBeNull();
    expect(r.direcciones.map((d) => d.analisis?.rumbo)).toEqual(RUMBOS);
    expect(r.direcciones[0].foto).toBeInstanceOf(Blob);
    expect(visto!.url).toBe(URL);
    expect(visto!.init.method).toBe('POST');
    expect(JSON.parse(String(visto!.init.body)).contexto.lat).toBe(36.61);
  });
  it('sin red (fetch rechaza) → pendiente, sin error', async () => {
    const r = await analizar(obs(), CTX, URL, (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch);
    expect(r.estado).toBe('pendiente');
    expect(r.error).toBeNull();
    expect(r.direcciones.every((d) => d.analisis === null)).toBe(true);
  });
  it('429 → error con el mensaje del worker', async () => {
    const msg = 'Has alcanzado el límite de barridos por día.';
    const r = await analizar(obs(), CTX, URL, (async () => json({ error: { codigo: 'limite_diario_superado', mensaje: msg } }, 429)) as unknown as typeof fetch);
    expect(r.estado).toBe('error');
    expect(r.error).toBe(msg);
  });
  it('respuesta 200 inválida → error', async () => {
    const r = await analizar(obs(), CTX, URL, (async () => json({ direcciones: [resp(0)] })) as unknown as typeof fetch);
    expect(r.estado).toBe('error');
    expect(r.error).toMatch(/respuesta/i);
  });
  it('sin URL del worker → pendiente (nada sale)', async () => {
    let llamado = false;
    const r = await analizar(obs(), CTX, '', (async () => { llamado = true; return json({}); }) as unknown as typeof fetch);
    expect(llamado).toBe(false);
    expect(r.estado).toBe('pendiente');
  });
  it('sin ninguna foto → error, sin llamar a la red', async () => {
    const o = obs([0]); o.direcciones[0].foto = null;
    let llamado = false;
    const r = await analizar(o, CTX, URL, (async () => { llamado = true; return json({}); }) as unknown as typeof fetch);
    expect(llamado).toBe(false);
    expect(r.estado).toBe('error');
  });
  it('un 503 usa el mensaje común de Gemini, no un código crudo', async () => {
    const r = await analizar(obs(), CTX, URL, (async () => json({ error: { codigo: 'servicio_no_disponible', mensaje: 'x' } }, 503)) as unknown as typeof fetch);
    expect(r.error).toMatch(/saturado/);
  });
});

describe('analizarPendientes', () => {
  it('analiza solo las pendientes, las guarda y cuenta las que quedan analizadas', async () => {
    const a = obs(RUMBOS, { id: 'a', estado: 'pendiente' }), b = obs(RUMBOS, { id: 'b', estado: 'sin_analizar' }), c = obs(RUMBOS, { id: 'c', estado: 'pendiente' });
    const guardadas: Observacion[] = [];
    const f = (async () => json({ direcciones: RUMBOS.map((r) => resp(r)), aviso: 'x' })) as unknown as typeof fetch;
    const n = await analizarPendientes(() => CTX, 'https://w.example/explorar', f, { listar: async () => [a, b, c], guardar: async (o) => { guardadas.push(o); } });
    expect(n).toBe(2);
    expect(guardadas.map((o) => o.id)).toEqual(['a', 'c']);
    expect(guardadas.every((o) => o.estado === 'analizada')).toBe(true);
  });
  it('si sigue sin red no cuenta ninguna y las deja pendientes', async () => {
    const a = obs(RUMBOS, { id: 'a', estado: 'pendiente' });
    const guardadas: Observacion[] = [];
    const n = await analizarPendientes(() => CTX, 'https://w.example/explorar', (() => Promise.reject(new TypeError('x'))) as unknown as typeof fetch,
      { listar: async () => [a], guardar: async (o) => { guardadas.push(o); } });
    expect(n).toBe(0);
    expect(guardadas.every((o) => o.estado === 'pendiente')).toBe(true);
  });
});
