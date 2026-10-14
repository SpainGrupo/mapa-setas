import { describe, expect, it } from 'vitest';
import { acotarDia, confianza, diasChips, diasHastaTemporada, estadoCalendario, etiquetaDia, finTemporada, mejorResultado,
  ordenarCalendario, type FilaCalendario } from './calendario';
import type { ResultadoSemaforo } from './semaforo';

describe('días', () => {
  it('chips de 7 días con nombre', () => {
    const d = diasChips('2026-10-14');
    expect(d).toHaveLength(7);
    expect(d.map((f) => etiquetaDia('2026-10-14', f))).toEqual(['hoy', 'mañana', 'vie 16', 'sáb 17', 'dom 18', 'lun 19', 'mar 20']);
  });
  it('acota a hoy … +15', () => {
    expect(acotarDia('2026-10-14', '2026-11-30')).toBe('2026-10-29');
    expect(acotarDia('2026-10-14', '2026-10-01')).toBe('2026-10-14');
    expect(acotarDia('2026-10-14', 'basura')).toBe('2026-10-14');
    expect(acotarDia('2026-10-14', '2026-10-20')).toBe('2026-10-20');
  });
  it.each([[0, 'alta'], [3, 'alta'], [4, 'media'], [7, 'media'], [8, 'baja'], [15, 'baja']])('+%i días → confianza %s', (n, c) => {
    const f = new Date(Date.UTC(2026, 9, 14 + n)).toISOString().slice(0, 10);
    expect(confianza('2026-10-14', f)).toBe(c);
  });
});

describe('temporada', () => {
  it('fin de la racha de meses (cruza el año)', () => {
    expect(finTemporada('2026-10-14', [10, 11, 12, 1])).toBe('2027-01-31');
    expect(finTemporada('2026-10-14', [9, 10, 11])).toBe('2026-11-30');
    expect(finTemporada('2026-10-14', [3, 4])).toBeNull();
    expect(finTemporada('2026-02-10', [2])).toBe('2026-02-28');
  });
  it('días hasta la temporada', () => {
    expect(diasHastaTemporada('2026-10-14', [2, 3, 4])).toBe(110);   // 1 de febrero de 2027
    expect(diasHastaTemporada('2026-10-14', [10])).toBeNull();
    expect(diasHastaTemporada('2026-10-14', [])).toBeNull();
  });
});

describe('estado del calendario', () => {
  const D = '2026-10-14';
  const r = (o: Partial<ResultadoSemaforo>): ResultadoSemaforo => ({ estado: 'verde', motivo: '', ...o });
  it('verde → ya sale, aguanta hasta el fin de ventana (sin pasar de la temporada)', () => {
    expect(estadoCalendario(D, [9, 10, 11], r({ hasta: '2026-10-30' }))).toMatchObject({ clase: 'sale', texto: 'Ya sale · aguanta hasta ~30/10' });
    expect(estadoCalendario(D, [10], r({ hasta: '2026-11-10' })).texto).toBe('Ya sale · aguanta hasta ~31/10');
  });
  it('amarillo esperando → empieza en ~X días', () => {
    expect(estadoCalendario(D, [10], r({ estado: 'amarillo', desde: '2026-10-17' }))).toMatchObject({ clase: 'pronto', texto: 'Empieza en ~3 días', dias: 3 });
    expect(estadoCalendario(D, [10], r({ estado: 'amarillo', desde: '2026-10-15' })).texto).toBe('Empieza en ~1 día');
  });
  it('amarillo con la ventana abierta → puede salir', () => {
    expect(estadoCalendario(D, [10, 11], r({ estado: 'amarillo', hasta: '2026-10-25' })).texto).toBe('Puede salir · aguanta hasta ~25/10');
  });
  it('rojo fuera de temporada → días hasta la temporada', () => {
    expect(estadoCalendario(D, [2, 3, 4], r({ estado: 'rojo' }))).toMatchObject({ clase: 'fuera', texto: 'Fuera de temporada: empieza en ~110 días' });
  });
  it('rojo o sin datos en temporada', () => {
    expect(estadoCalendario(D, [10], r({ estado: 'rojo' })).texto).toBe('En temporada, falta lluvia');
    expect(estadoCalendario(D, [10], null).texto).toBe('En temporada, sin datos del tiempo');
    expect(estadoCalendario(D, [], r({ estado: 'rojo' })).texto).toBe('Falta lluvia');
  });
  it('el mejor resultado de varios sitios', () => {
    expect(mejorResultado([null, r({ estado: 'rojo' }), r({ estado: 'amarillo', desde: '2026-10-20' }), r({ estado: 'amarillo', desde: '2026-10-16' })]))
      .toMatchObject({ estado: 'amarillo', desde: '2026-10-16' });
    expect(mejorResultado([r({ estado: 'gris' }), r({ estado: 'verde' })])!.estado).toBe('verde');
    expect(mejorResultado([null])).toBeNull();
  });
  it('orden: lo que sale, luego lo que empieza antes; boletus y caesarea delante; luego fiabilidad', () => {
    const f = (id: string, clase: any, fiabilidad: any = 'buena', dias?: number): FilaCalendario => ({ id, fiabilidad, estado: { clase, texto: '', dias } });
    const o = ordenarCalendario([f('terfezia_arenaria', 'fuera', 'sin_validar', 140), f('macrolepiota_procera', 'sale', 'media'),
      f('boletus_edulis', 'sale', 'sin_validar'), f('lactarius_deliciosus', 'pronto', 'buena', 5), f('amanita_caesarea', 'temporada'),
      f('cantharellus_cibarius', 'pronto', 'sin_validar', 2), f('boletus_aereus', 'sale', 'buena'), f('pleurotus_eryngii', 'sale', 'baja')]);
    expect(o.map((x) => x.id)).toEqual(['boletus_aereus', 'boletus_edulis', 'macrolepiota_procera', 'pleurotus_eryngii',
      'lactarius_deliciosus', 'cantharellus_cibarius', 'amanita_caesarea', 'terfezia_arenaria']);
  });
});
