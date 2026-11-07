import { describe, it, expect } from 'vitest';
import { componer, PIE } from './aviso-ventanas.mts';
import { razonSitio } from '../src/razones.ts';

const ap = { especie: 'boletus_edulis', nombre: 'Boletus edulis', grupo: 'Boletus', fecha: '2026-10-21', dias: 5, motivo: 'ventana abierta: 30 mm',
  sitios: [{ probabilidad: 62, puntuacion: 80, t_pie_min: 10, subida_m: 50, km: 12.34, titularidad: 'Monte público', mapa: 'https://www.google.com/maps/search/?api=1&query=36.6,-4.8', razon: 'Buen hábitat' }] };

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
    expect(r.texto).toContain('probabilidad estimada ≈ 62 % · puntuación 80');
    expect(r.html).toContain('probabilidad estimada ≈ 62 %');
    expect(r.html).toContain(PIE);
    expect((r.html + r.texto + r.asunto).toLowerCase()).not.toContain('comestible');
  });
  it('la razón de cada sitio dice cómo es el terreno (comodidad, sitios v5)', () => {
    const sitio = { id: 1, lat: 36.6, lon: -4.8, area_ha: 12, punt_media: 78, punt_max: 90, t_pie_min: 20, subida_m: 50, dist_camino_m: 100,
      aparcamiento_id: 1, restringido: false, meteo_id: 0, terreno: { desnivel_km: 110, pendiente_media: 12 } };
    const razon = razonSitio({ especie: 'x', sitio, estado: 'verde', dificultad: 'facil', score: 1, puntuacion: 52 }, { fiabilidad: 'buena' });
    const r = componer([{ ...ap, sitios: [{ ...ap.sitios[0], razon }] }], '2026-10-18');
    expect(r.texto).toContain('Terreno quebrado · 110 m/km: mucho sube y baja (pendiente media 12 %), lo que baja la puntuación.');
    expect(r.html).toContain('Terreno quebrado · 110 m/km');
  });
});
