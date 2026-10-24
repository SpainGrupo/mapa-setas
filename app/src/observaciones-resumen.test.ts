import { describe, expect, it } from 'vitest';
import { MIN_PARA_PORCENTAJE, nombreArchivoGeoJSON, resumenObservaciones, textoResumen } from './observaciones-resumen';
import { nuevaObservacion, type DireccionGemini, type Observacion } from './observaciones-datos';

const A = (p: Partial<DireccionGemini> = {}): DireccionGemini => ({ rumbo: 0, arbol_dominante: 'alcornoque', confianza_arbol: 'alta', densidad_copas: 'media', sotobosque: 'despejado', suelo_visible: [], humedad_aparente: 'media', notas: '', ...p });
function o(idon: number | null, hallazgo: Observacion['hallazgo'], extra: Partial<Observacion> = {}): Observacion {
  const x = nuevaObservacion({ lat: 36.5, lon: -5.2, precGps: 5, altGps: null, altModelo: null, especie: 'boletus_aereus', rutaId: null });
  x.hallazgo = hallazgo;
  x.modelo = idon === null ? null : ({ idon } as Observacion['modelo']);
  return Object.assign(x, extra);
}
const conArbol = (visto: DireccionGemini['arbol_dominante'], modelo: string | null, conf: DireccionGemini['confianza_arbol'] = 'alta') =>
  o(60, 'nada', { estado: 'analizada', direcciones: [{ rumbo: 90, precBrujula: null, foto: null, analisis: A({ rumbo: 90, arbol_dominante: visto, confianza_arbol: conf }) }], arbolSector: [modelo] });

describe('resumenObservaciones', () => {
  it('cuenta modelo ≥ 50 / < 50 contra lo que encontraste', () => {
    const r = resumenObservaciones([o(72, 'encontrada'), o(50, 'nada'), o(49, 'encontrada'), o(10, 'nada'), o(80, 'no_mirado'), o(null, 'encontrada')]);
    expect(r).toMatchObject({ total: 6, altoEncontro: 1, altoNada: 1, bajoEncontro: 1, bajoNada: 1, sinModelo: 1, sinRespuesta: 1 });
  });
  it('sin porcentajes con menos de 10 observaciones contables', () => {
    const r = resumenObservaciones([o(72, 'encontrada'), o(60, 'nada')]);
    expect(r.pctAlto).toBeNull();
    expect(r.pctBajo).toBeNull();
    expect(textoResumen(r)).not.toMatch(/%/);
  });
  it('con 10 o más: % de aciertos de cada tramo (encontraste / respondidas)', () => {
    const l = [...Array(4).fill(0).map(() => o(70, 'encontrada')), ...Array(2).fill(0).map(() => o(70, 'nada')),
      o(20, 'encontrada'), ...Array(3).fill(0).map(() => o(20, 'nada'))];
    expect(l.length).toBe(MIN_PARA_PORCENTAJE);
    const r = resumenObservaciones(l);
    expect(r.pctAlto).toBeCloseTo(4 / 6 * 100, 5);
    expect(r.pctBajo).toBeCloseTo(25, 5);
    expect(textoResumen(r)).toMatch(/67 ?%/);
  });
  it('árbol visto distinto del modelo: solo con confianza media/alta y árbol comparable', () => {
    const r = resumenObservaciones([conArbol('alcornoque', 'pino'), conArbol('alcornoque', 'alcornoque'), conArbol('alcornoque', 'pino', 'baja'), conArbol('otro', 'pino'), conArbol('alcornoque', 'sin arbolado'), o(50, 'nada')]);
    expect(r.distinto).toHaveLength(1);
    expect(r.distinto[0].textos).toEqual(['el modelo da pino; en la foto se ve alcornoque']);
    expect(textoResumen(r)).toMatch(/Árbol visto distinto del modelo: 1 caso/);
  });
  it('lista vacía: todo a cero', () => {
    const r = resumenObservaciones([]);
    expect(r.total).toBe(0);
    expect(textoResumen(r)).toMatch(/Modelo ≥ 50 y encontraste: 0/);
  });
  it('el texto nunca habla de comer', () => {
    expect(textoResumen(resumenObservaciones([o(72, 'encontrada')]))).not.toMatch(/comest/i);
  });
});

describe('nombreArchivoGeoJSON', () => {
  it('observaciones-AAAA-MM-DD.geojson con la fecha local', () => {
    expect(nombreArchivoGeoJSON(new Date(2026, 9, 5))).toBe('observaciones-2026-10-05.geojson');
  });
});
