import { describe, expect, it } from 'vitest';
import { sumarDias, type Reglas, type ResultadoSemaforo } from './semaforo';
import type { Dia, PuntoMeteo } from './meteo';
import type { SitioCandidato } from './ranking';
import { DIAS_VENTANA, diasEspecie, esActivo, etiquetaInactiva, ordenarSelector, puntoReferencia, ventanaEspecie,
  type DiaVentana, type OpcionSelector } from './ventana-especie';

const HOY = '2026-10-14';
const AEREUS: Reglas = { episodio_mm: 25, ventana_dias: [8, 20], tmin_media: [8, 18], tmax_media: [15, 27], meses: [9, 10, 11, 12] };

/** 30 días pasados + hoy + 15 de previsión; `lluvia` = {díasRelativosAHoy: mm}. */
function serie(lluvia: Record<number, number> = {}, tmin = 12, tmax = 22): Dia[] {
  return Array.from({ length: 46 }, (_, i) => ({ fecha: sumarDias(HOY, i - 30), lluvia: lluvia[i - 30] ?? 0, tmin, tmax }));
}

describe('días de la ventana', () => {
  it('16 días (hoy … +15) con estado, confianza y activo', () => {
    const d = diasEspecie(serie({ [-12]: 30 }), AEREUS, HOY);
    expect(d).toHaveLength(DIAS_VENTANA);
    expect(d[0]).toMatchObject({ fecha: HOY, estado: 'verde', activo: true, confianza: 'alta', abre: sumarDias(HOY, -4) });
    expect(d[5].confianza).toBe('media');
    expect(d[12].confianza).toBe('baja');
    expect(d.findIndex((x) => !x.activo)).toBe(9);    // la ventana acaba a los 20 días del episodio (+8)
  });
  it('sin serie → vacío', () => {
    expect(diasEspecie(null, AEREUS, HOY)).toEqual([]);
    expect(diasEspecie([], AEREUS, HOY)).toEqual([]);
  });
  it('datos caducados → todo gris', () => {
    expect(diasEspecie(serie({ [-12]: 30 }), AEREUS, HOY, 100).every((x) => x.estado === 'gris' && !x.activo)).toBe(true);
  });
  it('amarillo «esperar» no cuenta como activo; amarillo con la ventana abierta sí', () => {
    const r = (o: Partial<ResultadoSemaforo>): ResultadoSemaforo => ({ estado: 'amarillo', motivo: '', ...o });
    expect(esActivo(r({ desde: '2026-10-20' }), HOY)).toBe(false);
    expect(esActivo(r({ hasta: '2026-10-20' }), HOY)).toBe(true);
    expect(esActivo(r({ estado: 'rojo' }), HOY)).toBe(false);
  });
});

describe('estimación de la ventana', () => {
  it('activa hoy: desde que abrió hasta el último día activo, confianza por el final', () => {
    const v = ventanaEspecie(diasEspecie(serie({ [-12]: 30 }), AEREUS, HOY), AEREUS.meses!, HOY);
    expect(v).toMatchObject({ tipo: 'activa', desde: '2026-10-10', hasta: '2026-10-22', confianza: 'baja' });
    expect(v.texto).toBe('Activa desde ~10/10 hasta ~22/10');
  });
  it('activa hoy con la ventana recién abierta → «desde hoy»; sigue al final de la previsión → fin de la ventana', () => {
    const v = ventanaEspecie(diasEspecie(serie({ [-8]: 30 }), AEREUS, HOY), AEREUS.meses!, HOY);
    expect(v.texto).toBe(`Activa desde hoy hasta ~${'2026-10-26'.slice(8, 10)}/10`);
    expect(v.hasta).toBe('2026-10-26');
  });
  it('acaba pronto → confianza alta', () => {
    const v = ventanaEspecie(diasEspecie(serie({ [-19]: 30 }), AEREUS, HOY), AEREUS.meses!, HOY);
    expect(v).toMatchObject({ tipo: 'activa', hasta: '2026-10-15', confianza: 'alta' });
  });
  it('por llegar: «Se espera a partir de ~X» con la confianza de X', () => {
    const v = ventanaEspecie(diasEspecie(serie({ [-3]: 30 }), AEREUS, HOY), AEREUS.meses!, HOY);
    expect(v).toMatchObject({ tipo: 'pronto', desde: '2026-10-19', confianza: 'media', texto: 'Se espera a partir de ~19/10' });
  });
  it('lluvia prevista que abre después de la previsión → «Se espera…» con confianza baja', () => {
    const v = ventanaEspecie(diasEspecie(serie({ [12]: 30 }), AEREUS, HOY), AEREUS.meses!, HOY);
    expect(v).toMatchObject({ tipo: 'pronto', desde: '2026-11-03', confianza: 'baja' });
  });
  it('fuera de temporada → «Fuera de temporada hasta ~mes»', () => {
    const primavera: Reglas = { ...AEREUS, meses: [3, 4, 5] };
    const v = ventanaEspecie(diasEspecie(serie(), primavera, HOY), primavera.meses!, HOY);
    expect(v).toMatchObject({ tipo: 'fuera', desde: '2027-03-01', texto: 'Fuera de temporada hasta ~marzo' });
    expect(v.confianza).toBeUndefined();
    expect(ventanaEspecie([], [3, 4, 5], HOY).texto).toBe('Fuera de temporada hasta ~marzo');
  });
  it('en temporada y seco → «En temporada, pero…»; si acaba la temporada → «Acaba la temporada…»', () => {
    expect(ventanaEspecie(diasEspecie(serie(), AEREUS, HOY), AEREUS.meses!, HOY).tipo).toBe('espera');
    expect(ventanaEspecie(diasEspecie(serie(), AEREUS, HOY), AEREUS.meses!, HOY).texto).toMatch(/^En temporada, pero no se ve lluvia/);
    const rojos: DiaVentana[] = Array.from({ length: 16 }, (_, i) => ({ fecha: sumarDias('2026-10-20', i), estado: 'rojo', activo: false, motivo: '', confianza: 'alta' }));
    expect(ventanaEspecie(rojos, [10], '2026-10-20').texto).toMatch(/^Acaba la temporada/);
  });
  it('sin datos de tiempo (sin serie o caducada)', () => {
    expect(ventanaEspecie([], AEREUS.meses!, HOY)).toEqual({ tipo: 'sin_datos', texto: 'Sin datos de tiempo' });
    expect(ventanaEspecie(diasEspecie(serie({ [-12]: 30 }), AEREUS, HOY, 100), [], HOY).tipo).toBe('sin_datos');
  });
  it('el fin de la ventana no pasa del fin de temporada', () => {
    const dias: DiaVentana[] = Array.from({ length: 16 }, (_, i) => ({ fecha: sumarDias('2026-11-20', i), estado: 'verde', activo: true,
      motivo: '', confianza: 'alta', hasta: '2026-12-31' }));
    expect(ventanaEspecie(dias, [10, 11], '2026-11-20').hasta).toBe('2026-12-05');   // último día de la previsión (> 30/11)
    expect(ventanaEspecie(dias, [10, 11, 12], '2026-11-20').hasta).toBe('2026-12-31');
  });
});

describe('punto de referencia', () => {
  const P = (id: number, lat: number, lon: number): PuntoMeteo => ({ id, lat, lon, alt_media: 500 });
  const puntos = [P(1, 36.5, -5.0), P(2, 36.6, -5.1), P(3, 36.7, -5.2), P(4, 36.8, -5.3), P(5, 36.9, -5.4)];
  const S = (meteo_id: number, punt_media: number, area_ha: number) => ({ id: meteo_id, lat: 0, lon: 0, area_ha, punt_media, punt_max: 0,
    t_pie_min: 0, subida_m: 0, dist_camino_m: 0, aparcamiento_id: null, restringido: false, meteo_id }) as SitioCandidato;
  it('GPS cerca → el punto más cercano', () => {
    expect(puntoReferencia(puntos, { gps: { lat: 36.79, lon: -5.29 }, sitios: [S(1, 90, 10)] })).toEqual({ id: 4, origen: 'gps' });
  });
  it('GPS lejos (Madrid) → mejor sitio de la seta', () => {
    expect(puntoReferencia(puntos, { gps: { lat: 40.4, lon: -3.7 }, sitios: [S(1, 50, 5), S(5, 90, 10), S(2, 60, 5)] })).toEqual({ id: 5, origen: 'sitio' });
  });
  it('sin GPS ni sitios → el punto más cercano a la mediana de la zona', () => {
    expect(puntoReferencia(puntos, {})).toEqual({ id: 3, origen: 'zona' });
    expect(puntoReferencia(puntos, { sitios: [S(99, 90, 10)] })).toEqual({ id: 3, origen: 'zona' });   // meteo_id que no existe
  });
  it('sin puntos → null', () => expect(puntoReferencia([], {})).toBeNull());
});

describe('selector: activas primero', () => {
  const o = (id: string, estado: ResultadoSemaforo['estado'] | null, fiabilidad: OpcionSelector['fiabilidad'] = 'media', meses = [10], motivo = ''): OpcionSelector =>
    ({ id, fiabilidad, meses, resultado: estado ? { estado, motivo } : null });
  it('verde antes que amarillo, por fiabilidad; abajo seco, sin datos y fuera de temporada', () => {
    const r = ordenarSelector([
      o('a', 'amarillo', 'buena'), o('b', 'rojo', 'buena', [3, 4], 'fuera de temporada (sale en mar, abr)'), o('c', 'verde', 'baja'),
      o('d', 'verde', 'buena'), o('e', 'rojo', 'media', [10], 'seco: sin lluvia'), o('f', 'gris'), o('g', null, 'buena', [5]),
    ], HOY);
    expect(r.activas.map((x) => x.id)).toEqual(['d', 'c', 'a']);
    expect(r.inactivas.map((x) => `${x.item.id}:${x.etiqueta}`)).toEqual(['e:seco', 'f:sin datos', 'b:fuera de temporada', 'g:fuera de temporada']);
  });
  it('amarillo «fuera de temporada, pero…» cuenta como activa', () => {
    expect(etiquetaInactiva(o('t', 'amarillo', 'media', [3, 4], 'fuera de temporada (…), pero llovió fuerte'), HOY)).toBeNull();
  });
  it('sin ningún dato del tiempo no separa nada (orden del manifest)', () => {
    const r = ordenarSelector([o('x', null), o('y', null, 'buena')], HOY);
    expect(r.activas.map((x) => x.id)).toEqual(['x', 'y']);
    expect(r.inactivas).toEqual([]);
  });
  it('empates: orden del manifest', () => {
    expect(ordenarSelector([o('p', 'verde'), o('q', 'verde'), o('r', 'verde')], HOY).activas.map((x) => x.id)).toEqual(['p', 'q', 'r']);
  });
});
