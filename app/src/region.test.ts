import { beforeEach, describe, expect, it, vi } from 'vitest';
import { baseDatos, CLAVE_REGION, regionesDeRespaldo, CLAVE_REGIONES, cargarRegiones, claveRegion, establecerActiva, parsearRegiones, regionMasCercana,
  resolverRegion, textoEstadoRegion, type Almacen, type RegionIndice } from './region';

class Memoria implements Almacen {
  d = new Map<string, string>();
  getItem(k: string) { return this.d.get(k) ?? null; }
  setItem(k: string, v: string) { this.d.set(k, v); }
  removeItem(k: string) { this.d.delete(k); }
}
const reg = (id: string, lat: number, lon: number): RegionIndice =>
  ({ id, nombre: id[0].toUpperCase() + id.slice(1), origen: { lat, lon }, bbox: [lon - 1, lat - 1, lon + 1, lat + 1], total_bytes: 185e6, generado: 'G' });
const MARBELLA = reg('marbella', 36.5101, -4.8825), ALICANTE = reg('alicante', 38.3452, -0.481);

describe('parsearRegiones', () => {
  it('acepta las válidas y descarta ids peligrosos, reservados, repetidos o datos rotos', () => {
    const rs = parsearRegiones([MARBELLA, { ...ALICANTE, id: '../x' }, { ...ALICANTE, id: 'modelo' }, MARBELLA,
      { ...ALICANTE, origen: { lat: 'x', lon: 0 } }, { ...ALICANTE, bbox: [1, 2] }, ALICANTE, null]);
    expect(rs.map((r) => r.id)).toEqual(['marbella', 'alicante']);
    expect(parsearRegiones({ no: 'lista' })).toEqual([]);
  });
  it('acepta origen [lon, lat] (forma de exportar.py escribir_regiones)', () => {
    expect(parsearRegiones([{ ...MARBELLA, origen: [-4.8825, 36.5101] }])[0].origen).toEqual({ lat: 36.5101, lon: -4.8825 });
  });
});

describe('regionMasCercana', () => {
  it('elige por distancia al origen', () => {
    expect(regionMasCercana([MARBELLA, ALICANTE], { lat: 38.7, lon: -0.5 }).id).toBe('alicante');
    expect(regionMasCercana([MARBELLA, ALICANTE], { lat: 36.6, lon: -5.2 }).id).toBe('marbella');
  });
});

describe('claves y rutas por región', () => {
  it('claveRegion y baseDatos usan la región activa', () => {
    establecerActiva('alicante');
    expect(claveRegion('capa')).toBe('setas:capa:alicante');
    expect(claveRegion('punto-meteo', 'marbella')).toBe('setas:punto-meteo:marbella');
    expect(baseDatos()).toMatch(/data\/alicante\/$/);
  });
  it('establecerActiva rechaza ids no válidos', () => {
    expect(() => establecerActiva('../mapas')).toThrow(/región/);
  });
});

describe('cargarRegiones', () => {
  let a: Memoria;
  beforeEach(() => { a = new Memoria(); });
  it('con red guarda una copia; sin red la usa', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify([MARBELLA, ALICANTE])));
    expect((await cargarRegiones({ fetchFn: ok as any, almacen: a, raiz: 'data/' })).length).toBe(2);
    expect(ok).toHaveBeenCalledWith('data/regiones.json', { cache: 'no-cache' });
    const caida = vi.fn(async () => { throw new TypeError('sin red'); });
    expect((await cargarRegiones({ fetchFn: caida as any, almacen: a, raiz: 'data/' })).map((r) => r.id)).toEqual(['marbella', 'alicante']);
  });
  it('404 sin copia: lista vacía', async () => {
    const no = vi.fn(async () => new Response('', { status: 404 }));
    expect(await cargarRegiones({ fetchFn: no as any, almacen: a, raiz: 'data/' })).toEqual([]);
    expect(a.getItem(CLAVE_REGIONES)).toBeNull();
  });
});

describe('resolverRegion', () => {
  const nunca = async () => { throw new Error('no debería preguntar'); };
  it('respeta la guardada si sigue existiendo', async () => {
    const a = new Memoria(); a.setItem(CLAVE_REGION, 'alicante');
    expect(await resolverRegion([MARBELLA, ALICANTE], { almacen: a, posicion: async () => null, preguntar: nunca })).toBe('alicante');
  });
  it('una sola región: sin GPS ni pregunta', async () => {
    const a = new Memoria(); const pos = vi.fn(async () => null);
    expect(await resolverRegion([MARBELLA], { almacen: a, posicion: pos, preguntar: nunca })).toBe('marbella');
    expect(pos).not.toHaveBeenCalled();
    expect(a.getItem(CLAVE_REGION)).toBe('marbella');
  });
  it('guardada que ya no existe (spec §6) → GPS → la más cercana', async () => {
    const a = new Memoria(); a.setItem(CLAVE_REGION, 'desaparecida');
    expect(await resolverRegion([MARBELLA, ALICANTE], { almacen: a, posicion: async () => ({ lat: 38.5, lon: -0.6 }), preguntar: nunca })).toBe('alicante');
  });
  it('sin GPS pregunta; si la respuesta no vale, la primera', async () => {
    const a = new Memoria();
    expect(await resolverRegion([MARBELLA, ALICANTE], { almacen: a, posicion: async () => null, preguntar: async () => 'alicante' })).toBe('alicante');
    expect(a.getItem(CLAVE_REGION)).toBe('alicante');
    const b = new Memoria();
    expect(await resolverRegion([MARBELLA, ALICANTE], { almacen: b, posicion: async () => null, preguntar: async () => null })).toBe('marbella');
    expect(b.getItem(CLAVE_REGION)).toBeNull();   // hoja cerrada sin elegir: se vuelve a preguntar la próxima vez
  });
  it('sin regiones: null', async () => {
    expect(await resolverRegion([], { almacen: new Memoria(), posicion: async () => null, preguntar: nunca })).toBeNull();
  });
});

describe('textoEstadoRegion', () => {
  it('descargada, sin descargar con y sin conexión', () => {
    expect(textoEstadoRegion(MARBELLA, { bytes: 184e6 }, true)).toBe('Descargada · 184 MB');
    expect(textoEstadoRegion(MARBELLA, null, true)).toBe('Sin descargar · 185 MB');
    expect(textoEstadoRegion(MARBELLA, null, false)).toBe('Sin descargar · necesita conexión');
  });
});

describe('regionesDeRespaldo', () => {
  it('sin índice: la región guardada si tiene mapas descargados', () => {
    const a = new Memoria();
    expect(regionesDeRespaldo(a, () => true)).toEqual([]);
    a.setItem(CLAVE_REGION, 'marbella');
    expect(regionesDeRespaldo(a, () => false)).toEqual([]);
    expect(regionesDeRespaldo(a, (id) => id === 'marbella').map((r) => r.id)).toEqual(['marbella']);
    a.setItem(CLAVE_REGION, '../x');
    expect(regionesDeRespaldo(a, () => true)).toEqual([]);
  });
});
