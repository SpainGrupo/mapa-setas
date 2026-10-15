import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { disposicion, LEGADO_MARBELLA } from './disposicion-datos.mjs';

let raiz;
const nueva = () => (raiz = mkdtempSync(join(tmpdir(), 'setas-dispo-')));
const json = (p, o) => { mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, JSON.stringify(o)); };
afterEach(() => raiz && rmSync(raiz, { recursive: true, force: true }));

// El pipeline (exportar.py escribir_regiones) emite origen como [lon, lat].
const indice = (id) => ({ id, nombre: id, origen: [-0.5, 38], bbox: [-1, 37, 0, 39], total_bytes: 10, generado: '2026-10-15' });

describe('disposicion', () => {
  it('sin datos devuelve null', () => {
    expect(disposicion(nueva())).toBeNull();
  });

  it('legado plano: sintetiza marbella desde out/app/manifest.json', () => {
    nueva();
    json(join(raiz, 'out/app/manifest.json'), { bbox: [1, 2, 3, 4], total_bytes: 99, generado: 'G' });
    mkdirSync(join(raiz, 'out/app/modelo'));
    const d = disposicion(raiz);
    expect(d.legado).toBe(true);
    expect(d.indice).toBeNull();
    expect(d.regiones).toEqual([{ ...LEGADO_MARBELLA, bbox: [1, 2, 3, 4], total_bytes: 99, generado: 'G' }]);
    expect(d.dirs).toEqual({ marbella: join(raiz, 'out/app') });
    expect(d.modelo).toBe(join(raiz, 'out/app/modelo'));
  });

  it('multi-región: lee regiones.json, una carpeta por región y el modelo compartido primero', () => {
    nueva();
    json(join(raiz, 'regiones.json'), [indice('marbella'), indice('alicante')]);
    mkdirSync(join(raiz, 'modelo'));
    mkdirSync(join(raiz, 'marbella/out/app/modelo'), { recursive: true });
    const d = disposicion(raiz);
    expect(d.legado).toBe(false);
    expect(d.indice).toBe(join(raiz, 'regiones.json'));
    expect(d.regiones[0].origen).toEqual([-0.5, 38]);
    expect(d.dirs).toEqual({ marbella: join(raiz, 'marbella/out/app'), alicante: join(raiz, 'alicante/out/app') });
    expect(d.modelo).toBe(join(raiz, 'modelo'));
  });

  it('sin modelo compartido usa el de la primera región que lo tenga', () => {
    nueva();
    json(join(raiz, 'regiones.json'), [indice('marbella')]);
    mkdirSync(join(raiz, 'marbella/out/app/modelo'), { recursive: true });
    expect(disposicion(raiz).modelo).toBe(join(raiz, 'marbella/out/app/modelo'));
  });

  it('rechaza ids peligrosos o reservados', () => {
    for (const id of ['../x', 'Marbella', 'modelo', '', 'a/b', '_comun']) {
      nueva();
      json(join(raiz, 'regiones.json'), [indice(id)]);
      expect(() => disposicion(raiz), id).toThrow(/id de región/);
      rmSync(raiz, { recursive: true, force: true });
    }
    raiz = undefined;
  });
});
