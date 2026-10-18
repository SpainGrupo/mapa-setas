import { describe, it, expect } from 'vitest';
import { componer, PIE } from './aviso-ventanas.mts';

const ap = { especie: 'boletus_edulis', nombre: 'Boletus edulis', grupo: 'Boletus', fecha: '2026-10-21', dias: 5, motivo: 'ventana abierta: 30 mm',
  sitios: [{ puntuacion: 80, t_pie_min: 10, subida_m: 50, km: 12.34, titularidad: 'Monte público', mapa: 'https://www.google.com/maps/search/?api=1&query=36.6,-4.8', razon: 'Buen hábitat' }] };

describe('componer aviso', () => {
  it('sin aperturas: hay_aviso=false y pie', () => {
    const r = componer([], '2026-10-18');
    expect(r.hay_aviso).toBe(false);
    expect(r.texto).toContain(PIE);
  });
  it('con apertura: grupo, fecha, enlace, pie y nunca «comestible»', () => {
    const r = componer([ap], '2026-10-18');
    expect(r.hay_aviso).toBe(true);
    expect(r.asunto).toContain('Boletus edulis');
    expect(r.texto).toContain('miércoles 21/10');
    expect(r.html).toContain('<h2>Boletus</h2>');
    expect(r.html).toContain('query=36.6,-4.8');
    expect(r.html).toContain(PIE);
    expect((r.html + r.texto + r.asunto).toLowerCase()).not.toContain('comestible');
  });
});
