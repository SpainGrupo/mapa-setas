// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CLAVE_CLARITY, CLAVE_CLARITY_E2E, aplicarEleccion, idClarity, leerEleccion } from './clarity';

const ls = (o: Record<string, string>) => ({ getItem: (k: string) => o[k] ?? null });

describe('idClarity', () => {
  it('vacío o inválido: no hay Clarity', () => {
    expect(idClarity(undefined, false, null)).toBe('');
    expect(idClarity('', false, null)).toBe('');
    expect(idClarity('  ', false, null)).toBe('');
    expect(idClarity('no es un id!', false, null)).toBe('');
  });
  it('id válido del build', () => { expect(idClarity(' za3tx4jkja ', false, null)).toBe('za3tx4jkja'); });
  it('en e2e se ignora el del build y solo vale el de localStorage', () => {
    expect(idClarity('za3tx4jkja', true, ls({}))).toBe('');
    expect(idClarity('za3tx4jkja', true, ls({ [CLAVE_CLARITY_E2E]: 'falso12345' }))).toBe('falso12345');
  });
});

describe('leerEleccion', () => {
  it('solo «si» o «no»', () => {
    expect(leerEleccion(ls({ [CLAVE_CLARITY]: 'si' }))).toBe('si');
    expect(leerEleccion(ls({ [CLAVE_CLARITY]: 'no' }))).toBe('no');
    expect(leerEleccion(ls({ [CLAVE_CLARITY]: 'quizá' }))).toBeNull();
    expect(leerEleccion(ls({}))).toBeNull();
    expect(leerEleccion(null)).toBeNull();
  });
});

describe('aplicarEleccion', () => {
  beforeEach(() => { document.head.innerHTML = '<script></script>'; delete (window as { clarity?: unknown }).clarity; });
  it('sin elección o «no»: no se añade ningún script de clarity.ms', () => {
    aplicarEleccion('za3tx4jkja', null);
    aplicarEleccion('za3tx4jkja', 'no');
    expect(document.querySelector('script[src*="clarity.ms"]')).toBeNull();
  });
  it('«si»: carga el script oficial una sola vez y comunica el consentimiento', () => {
    aplicarEleccion('za3tx4jkja', 'si');
    aplicarEleccion('za3tx4jkja', 'si');
    const s = document.querySelectorAll('script[src="https://www.clarity.ms/tag/za3tx4jkja"]');
    expect(s).toHaveLength(1);
    const cola = (window as unknown as { clarity: { q: unknown[][] } }).clarity.q;
    expect(cola[0]).toEqual(['consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' }]);
  });
  it('«no» con Clarity ya cargado: le dice que no hay consentimiento', () => {
    const f = vi.fn();
    (window as unknown as { clarity: unknown }).clarity = f;
    aplicarEleccion('za3tx4jkja', 'no');
    expect(f).toHaveBeenCalledWith('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
  });
});
