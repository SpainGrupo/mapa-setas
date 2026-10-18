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
  it('ventana actual y próxima: dos franjas separadas con su etiqueta; la próxima, con barra a trazos', () => {
    const div = document.createElement('div');
    pintarGrafico(div, serie, HOY, [{ desde: sumarDias(HOY, -2), hasta: sumarDias(HOY, 1), etiqueta: 'ventana actual' },
      { desde: sumarDias(HOY, 3), hasta: sumarDias(HOY, 5), etiqueta: 'próxima', proxima: true }], () => {});
    const actual = [...div.querySelectorAll('.banda-ventana')], prox = [...div.querySelectorAll('.banda-proxima')];
    expect(actual.length).toBe(2);          // temperatura y lluvia
    expect(prox.length).toBe(2);
    const fin = Number(actual[0].getAttribute('x')) + Number(actual[0].getAttribute('width'));
    expect(Number(prox[0].getAttribute('x'))).toBeGreaterThan(fin);   // hay hueco: no parecen una sola ventana
    expect([...div.querySelectorAll('text')].map((t) => t.textContent)).toEqual(expect.arrayContaining(['ventana actual', 'próxima']));
    expect(div.querySelector('line[stroke-dasharray]')).not.toBeNull();
  });
  it('sin humedad del suelo no hay tercer panel; con ella, línea propia y su dato al tocar', () => {
    const div = document.createElement('div');
    pintarGrafico(div, serie, HOY, null, () => {});
    expect(div.querySelector('.linea-suelo')).toBeNull();
    const conSuelo = serie.map((d, i) => ({ ...d, suelo: 0.1 + i / 400 }));
    let dato = '';
    pintarGrafico(div, conSuelo, HOY, null, (t) => (dato = t));
    expect(div.querySelectorAll('.linea-suelo').length).toBe(1);
    expect([...div.querySelectorAll('text')].map((t) => t.textContent)).toContain('Humedad del suelo (m³/m³)');
    expect(dato).toMatch(/· suelo 0,18$/);
    expect(div.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 360 412');
  });
});
