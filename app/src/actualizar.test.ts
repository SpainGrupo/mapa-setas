import { describe, expect, it } from 'vitest';
import { ENFRIAMIENTO_MS, decidirVersion } from './actualizar';

const base = { pendiente: true, aplicando: false, algoEnMarcha: false, ultimaAuto: 0, ahora: 10 * ENFRIAMIENTO_MS };

describe('decidirVersion', () => {
  it('sin versión pendiente o ya aplicándose: nada', () => {
    expect(decidirVersion({ ...base, pendiente: false })).toBe('nada');
    expect(decidirVersion({ ...base, aplicando: true })).toBe('nada');
  });
  it('con algo en marcha (grabando, campo, navegación): espera, aunque no haya enfriamiento', () => {
    expect(decidirVersion({ ...base, algoEnMarcha: true })).toBe('esperar');
  });
  it('libre: se aplica sola', () => { expect(decidirVersion(base)).toBe('aplicar'); });
  it('tras terminar lo que estaba en marcha se aplica', () => {
    expect(decidirVersion({ ...base, algoEnMarcha: true })).toBe('esperar');
    expect(decidirVersion({ ...base, algoEnMarcha: false })).toBe('aplicar');
  });
  it('si ya recargó hace menos de un minuto: aviso manual, sin bucle', () => {
    expect(decidirVersion({ ...base, ultimaAuto: base.ahora - ENFRIAMIENTO_MS + 1 })).toBe('manual');
    expect(decidirVersion({ ...base, ultimaAuto: base.ahora - ENFRIAMIENTO_MS })).toBe('aplicar');
  });
});
