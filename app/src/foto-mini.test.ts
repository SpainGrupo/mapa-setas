// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('./guia-ui', () => ({
  fichaGuia: () => null,
  indiceGuia: () => ({ especies: 'x', fotos: {}, miniaturas: { amanita_caesarea: 'abc123', boletus_reticulatus: 'def456' } }),
}));
const { fotoMini } = await import('./selector-especie');

describe('fotoMini: miniatura redonda junto al nombre de una seta', () => {
  it('usa la miniatura de la guía (precacheada), diferida, con el nombre como alt', () => {
    const img = fotoMini('amanita_caesarea', 'Oronja')!;
    expect(img.getAttribute('src')).toBe('guia/miniaturas/amanita_caesarea.jpg?v=abc123');
    expect(img.alt).toBe('Oronja');
    expect(img.loading).toBe('lazy');
    expect(img.className).toBe('foto-mini');
  });
  it('especie descrita en otra ficha: la foto de esa ficha', () => {
    expect(fotoMini('boletus_aestivalis', 'Boleto de verano')!.getAttribute('src')).toMatch(/boletus_reticulatus\.jpg/);
  });
  it('sin foto en la guía: nada (no se inventa otra)', () => {
    expect(fotoMini('pleurotus_eryngii', 'Seta de cardo')).toBeNull();
  });
  it('si la imagen falla al cargar, desaparece', () => {
    const caja = document.createElement('b');
    const img = fotoMini('amanita_caesarea', 'Oronja')!;
    caja.append(img, 'Oronja');
    img.dispatchEvent(new Event('error'));
    expect(caja.querySelector('img')).toBeNull();
    expect(caja.textContent).toBe('Oronja');
  });
});
