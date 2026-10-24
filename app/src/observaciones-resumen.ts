// «Mis observaciones» (2026-10-25): resumen sencillo de las observaciones y nombre del archivo GeoJSON. Puro, sin DOM
// (observaciones-resumen.test.ts); observaciones-ui.ts lo pinta.
//  - Dos resúmenes: «el modelo acertó / falló donde fuiste» (idoneidad del modelo en tu celda contra lo que tú marcaste:
//    encontraste / nada) y «árbol visto distinto del modelo» (la misma contradicción que explorar.ts, con confianza media/alta).
//  - Sin estadística inventada: con menos de MIN_PARA_PORCENTAJE observaciones contables solo se dan los recuentos y
//    los casos; con más, además el porcentaje de cada tramo. «Contable» = con modelo en el punto y con hallazgo respondido.
import { contradiccion } from './explorar';
import type { Observacion } from './observaciones-datos';

export const UMBRAL_MODELO = 50;
export const MIN_PARA_PORCENTAJE = 10;

export interface CasoArbol { id: string; t: number; textos: string[] }
export interface ResumenObservaciones {
  total: number;
  altoEncontro: number; altoNada: number; bajoEncontro: number; bajoNada: number;
  /** Hallazgo sin responder («Luego»/sin mirar). */
  sinRespuesta: number;
  /** Respondidas pero sin modelo en el punto. */
  sinModelo: number;
  /** % de «encontraste» con modelo ≥ 50 y con modelo < 50; null con pocos datos o sin casos en el tramo. */
  pctAlto: number | null; pctBajo: number | null;
  distinto: CasoArbol[];
}

export function resumenObservaciones(obs: Observacion[]): ResumenObservaciones {
  const r: ResumenObservaciones = { total: obs.length, altoEncontro: 0, altoNada: 0, bajoEncontro: 0, bajoNada: 0, sinRespuesta: 0, sinModelo: 0, pctAlto: null, pctBajo: null, distinto: [] };
  for (const o of obs) {
    if (o.hallazgo === 'no_mirado') r.sinRespuesta++;
    else if (!o.modelo) r.sinModelo++;
    else {
      const alto = o.modelo.idon >= UMBRAL_MODELO, si = o.hallazgo === 'encontrada';
      if (alto) { if (si) r.altoEncontro++; else r.altoNada++; } else if (si) r.bajoEncontro++; else r.bajoNada++;
    }
    if (o.estado === 'analizada') {
      const textos = o.direcciones.map((d, i) => (d.analisis ? contradiccion(d.analisis, o.arbolSector[i] ?? null) : null)).filter((t): t is string => !!t);
      if (textos.length) r.distinto.push({ id: o.id, t: o.t, textos: [...new Set(textos)] });
    }
  }
  const contables = r.altoEncontro + r.altoNada + r.bajoEncontro + r.bajoNada;
  if (contables >= MIN_PARA_PORCENTAJE) {
    const altos = r.altoEncontro + r.altoNada, bajos = r.bajoEncontro + r.bajoNada;
    r.pctAlto = altos ? (100 * r.altoEncontro) / altos : null;
    r.pctBajo = bajos ? (100 * r.bajoEncontro) / bajos : null;
  }
  return r;
}

/** Líneas del resumen separadas por «\n». */
export function textoResumen(r: ResumenObservaciones): string {
  const l = [`Modelo ≥ ${UMBRAL_MODELO} y encontraste: ${r.altoEncontro} · Modelo ≥ ${UMBRAL_MODELO} y nada: ${r.altoNada} · Modelo < ${UMBRAL_MODELO} y encontraste: ${r.bajoEncontro}`];
  if (r.pctAlto !== null || r.pctBajo !== null) {
    const pc = (x: number | null) => (x === null ? 'sin casos' : `${Math.round(x)} %`);
    l.push(`Con el modelo ≥ ${UMBRAL_MODELO} encontraste en ${pc(r.pctAlto)} de las veces que respondiste; con el modelo < ${UMBRAL_MODELO}, en ${pc(r.pctBajo)}.`);
  }
  l.push(`Árbol visto distinto del modelo: ${r.distinto.length} ${r.distinto.length === 1 ? 'caso' : 'casos'}`);
  return l.join('\n');
}

const dos = (n: number) => String(n).padStart(2, '0');
export const nombreArchivoGeoJSON = (d: Date) => `observaciones-${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}.geojson`;
