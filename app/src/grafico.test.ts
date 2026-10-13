// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { pasoLimpio, pintarGrafico, textoDia } from './grafico';
import { sumarDias } from './semaforo';

const HOY = '2026-10-13';
const serie = Array.from({ length: 37 }, (_, i) => ({ fecha: sumarDias(HOY, i - 30), lluvia: i % 5 === 0 ? 12 : 0, tmin: 10 + (i % 3), tmax: 20 + (i % 4) }));

describe('gráfico', () => {
  it('pasos limpios de eje', () => {
    expect(pasoLimpio(23, 3)).toBe(10);
    expect(pasoLimpio(9, 3)).toBe(5);
    expect(pasoLimpio(40, 2)).toBe(20);
  });
  it('dibuja columnas de lluvia, dos líneas, hoy, previsión y ventana', () => {
    const div = document.createElement('div');
    let dato = '';
    pintarGrafico(div, serie, HOY, { desde: sumarDias(HOY, -2), hasta: sumarDias(HOY, 4), etiqueta: 'ventana' }, (t) => (dato = t));
    const textos = [...div.querySelectorAll('text')].map((t) => t.textContent);
    expect(div.querySelectorAll('path[fill="#2a78d6"]').length).toBe(8);      // días con lluvia
    expect(div.querySelectorAll('path[stroke]').length).toBe(2);
    expect(textos).toEqual(expect.arrayContaining(['hoy', 'previsión', 'ventana', 'máx', 'mín', 'Lluvia (mm/día)', 'Temperatura (°C)']));
    expect(dato).toBe(textoDia(serie[30], HOY));
    expect(dato).toMatch(/^mar 13\/10 \(hoy\) · lluvia 12 mm · máx 22 °C · mín 10 °C$/);
  });
});
