import { describe, expect, it } from 'vitest';
import { COLOR_ESTADO, expresionColores, haceTexto, puntoMasCercano } from './zona';

describe('zona', () => {
  const ps = [{ id: 0, lat: 36.0, lon: -5.0, alt_media: 0 }, { id: 1, lat: 36.1, lon: -5.0, alt_media: 0 },
    { id: 2, lat: 36.0, lon: -5.13, alt_media: 0 }];
  it('punto meteo más cercano (distancia real, no en grados)', () => {
    expect(puntoMasCercano(ps, 36.06, -5.0)?.id).toBe(1);
    // 0,12° de longitud a 36° N son ~10,8 km; 0,1° de latitud, ~11,1 km
    expect(puntoMasCercano(ps, 36.0, -5.12)?.id).toBe(2);
    expect(puntoMasCercano([], 36, -5)).toBeNull();
  });
  it('«hace X» legible', () => {
    expect(haceTexto(0.2)).toBe('hace unos minutos');
    expect(haceTexto(0.75)).toBe('hace 45 min');
    expect(haceTexto(1)).toBe('hace 1 h');
    expect(haceTexto(5.4)).toBe('hace 5 h');
    expect(haceTexto(30)).toBe('hace 1 día');
    expect(haceTexto(80)).toBe('hace 3 días');
  });
  it('expresión de colores por id de punto para la capa Semáforo', () => {
    expect(expresionColores({ 3: 'verde', 7: 'rojo' })).toEqual(
      ['match', ['get', 'id'], 3, COLOR_ESTADO.verde, 7, COLOR_ESTADO.rojo, COLOR_ESTADO.gris]);
    expect(expresionColores({})).toBe(COLOR_ESTADO.gris);
  });
});
