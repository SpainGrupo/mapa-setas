import { describe, expect, it, vi } from 'vitest';
import { CLAVE_MIGRACION, migrarARegiones, type DepsMigracion } from './migracion';
import { DirFalso, raizFalsa } from './opfs-falso';
import type { Almacen } from './region';

class Memoria implements Almacen {
  d = new Map<string, string>();
  getItem(k: string) { return this.d.get(k) ?? null; }
  setItem(k: string, v: string) { this.d.set(k, v); }
  removeItem(k: string) { this.d.delete(k); }
}

function deps(raiz: DirFalso | null, almacen = new Memoria()) {
  const meteo = vi.fn(async () => {});
  const d: DepsMigracion = {
    almacen,
    raiz: async () => raiz as unknown as FileSystemDirectoryHandle,
    // Igual que la orden 'mover' del worker, sobre el OPFS falso.
    moverArchivos: async (desde, hacia, nombres) => {
      const o = await raiz!.getDirectoryHandle(desde);
      let h: DirFalso = raiz!;
      for (const x of hacia.split('/')) h = await h.getDirectoryHandle(x, { create: true });
      for (const n of nombres) await (await o.getFileHandle(n)).move(h, n);
    },
    renombrarMeteo: meteo,
  };
  return { d, almacen, meteo };
}
const ESTADO = JSON.stringify({ fecha: 'F', bytes: 2, generado: 'G', archivos: { 'manifest.json': 1, 'base.pmtiles': 1 } });

describe('migrarARegiones', () => {
  it('instalación plana con descarga completa → mapas/marbella, claves renombradas, región marbella', async () => {
    const raiz = raizFalsa();
    await raiz.escribir('mapas/manifest.json', '{}');
    await raiz.escribir('mapas/base.pmtiles', 'x');
    await raiz.escribir('modelo/modelo.onnx', 'm');
    const { d, almacen, meteo } = deps(raiz);
    almacen.setItem('setas:mapas-descargados', ESTADO);
    almacen.setItem('setas:capa', '{"especie":"boletus_edulis","umbral":200}');
    almacen.setItem('setas:punto-meteo', '17');
    expect(await migrarARegiones(d)).toBe('migrada');
    expect(raiz.arbol()).toEqual(['mapas/marbella/base.pmtiles', 'mapas/marbella/manifest.json', 'modelo/modelo.onnx']);
    expect(almacen.getItem('setas:mapas-descargados:marbella')).toBe(ESTADO);
    expect(almacen.getItem('setas:mapas-descargados')).toBeNull();
    expect(almacen.getItem('setas:capa:marbella')).toBe('{"especie":"boletus_edulis","umbral":200}');
    expect(almacen.getItem('setas:capa')).toBeNull();
    expect(almacen.getItem('setas:punto-meteo:marbella')).toBe('17');
    expect(almacen.getItem('setas:region')).toBe('marbella');
    expect(almacen.getItem(CLAVE_MIGRACION)).toBe('1');
    expect(meteo).toHaveBeenCalledWith('datos', 'datos:marbella');
  });

  it('es idempotente: la segunda vez no toca nada', async () => {
    const raiz = raizFalsa();
    const { d, almacen } = deps(raiz);
    almacen.setItem(CLAVE_MIGRACION, '1');
    almacen.setItem('setas:capa', 'x');
    expect(await migrarARegiones(d)).toBe('hecha-antes');
    expect(almacen.getItem('setas:capa')).toBe('x');
  });

  it('descarga a medias (archivos sin clave) y staging antiguo: se borran', async () => {
    const raiz = raizFalsa();
    await raiz.escribir('mapas/base.pmtiles', 'x');
    await raiz.escribir('mapas-nuevo/base.pmtiles', 'y');
    const { d, almacen } = deps(raiz);
    almacen.setItem('setas:mapas-nuevo-generado', 'G2');
    expect(await migrarARegiones(d)).toBe('migrada');
    expect(raiz.arbol()).toEqual([]);
    expect(almacen.getItem('setas:mapas-nuevo-generado')).toBeNull();
    expect(almacen.getItem('setas:mapas-descargados:marbella')).toBeNull();
    expect(almacen.getItem('setas:region')).toBe('marbella');
  });

  it('respeta la disposición nueva: no toca subcarpetas de mapas/ ni una región ya elegida', async () => {
    const raiz = raizFalsa();
    await raiz.escribir('mapas/alicante/base.pmtiles', 'x');
    const { d, almacen } = deps(raiz);
    almacen.setItem('setas:region', 'alicante');
    almacen.setItem('setas:aviso-visto', '1');
    expect(await migrarARegiones(d)).toBe('migrada');
    expect(raiz.arbol()).toEqual(['mapas/alicante/base.pmtiles']);
    expect(almacen.getItem('setas:region')).toBe('alicante');
  });

  it('instalación nueva (nada guardado, sin OPFS): no fija región', async () => {
    const { d, almacen } = deps(null);
    expect(await migrarARegiones(d)).toBe('sin-instalacion');
    expect(almacen.getItem('setas:region')).toBeNull();
    expect(almacen.getItem(CLAVE_MIGRACION)).toBe('1');
  });
});
