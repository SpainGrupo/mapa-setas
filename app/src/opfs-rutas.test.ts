import { describe, expect, it } from 'vitest';
import { dirDe, partes, quitarRuta } from './opfs-rutas';
import { raizFalsa } from './opfs-falso';

const comoRaiz = (d: unknown) => d as FileSystemDirectoryHandle;

describe('opfs-rutas', () => {
  it('partes rechaza rutas vacías o con . y ..', () => {
    expect(partes('mapas/marbella')).toEqual(['mapas', 'marbella']);
    for (const r of ['', '/', 'mapas/../x', './mapas']) expect(() => partes(r), r).toThrow(/Ruta OPFS/);
  });
  it('dirDe crea la cadena y la reutiliza', async () => {
    const raiz = raizFalsa();
    const d = await dirDe(comoRaiz(raiz), 'mapas-nuevo/alicante', true);
    expect(await dirDe(comoRaiz(raiz), 'mapas-nuevo/alicante')).toBe(d);
    await expect(dirDe(comoRaiz(raiz), 'mapas/alicante')).rejects.toThrow(/NotFound/);
  });
  it('quitarRuta borra la región y el padre solo si queda vacío', async () => {
    const raiz = raizFalsa();
    await raiz.escribir('mapas-nuevo/marbella/a.pmtiles', 'x');
    await raiz.escribir('mapas/marbella/a.pmtiles', 'x');
    await raiz.escribir('mapas/alicante/b.pmtiles', 'y');
    await quitarRuta(comoRaiz(raiz), 'mapas-nuevo/marbella');
    expect([...raiz.entradas.keys()]).toEqual(['mapas']);
    await quitarRuta(comoRaiz(raiz), 'mapas/marbella');
    expect(raiz.arbol()).toEqual(['mapas/alicante/b.pmtiles']);
    await quitarRuta(comoRaiz(raiz), 'mapas/no-existe');   // no lanza
  });
});
