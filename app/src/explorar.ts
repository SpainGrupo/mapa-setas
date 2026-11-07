// «Explorar aquí» (2026-10-25): puntuación por dirección del barrido y mejor dirección. Puro, sin DOM ni red
// (explorar.test.ts). Gemini solo DESCRIBE el bosque de cada foto; la decisión es de esta función, con factores reales.
//  - Observado (0–1): media ponderada (PESOS) de los componentes que se pueden evaluar contra el perfil de la seta
//    (árbol hospedador, copas, humedad, sotobosque). Un componente sin dato («no_se_ve», confianza baja, sin perfil) no
//    cuenta ni suma ni resta: nunca se rellena con un valor por defecto.
//  - Modelo (0–100): la idoneidad máxima de las celdas de ese sector de 45° (Observacion.modeloSector).
//  - Total (0–100) = 0,5·observado·100 + 0,5·modelo; con uno solo de los dos, ese; con ninguno, null.
//  - Las razones son una línea cada una y salen de los factores usados. Si el árbol visto contradice al del modelo se dice.
//  - Nunca habla de comer: ni razón ni texto de aquí contiene «comestible» (test).
import type { PerfilMicro } from './micro';
import { sinComestible } from './seguridad';
import type { DireccionGemini, Observacion } from './observaciones-datos';

export const PESOS = { arbol: 0.5, copas: 0.2, humedad: 0.2, sotobosque: 0.1 } as const;
/** Cobertura de copas (%) que representa cada clase, para compararla con el dosel óptimo del perfil. */
export const FCC_COPAS = { abierta: 15, media: 50, cerrada: 85 } as const;
export const FACTOR_SOTOBOSQUE = { despejado: 1, matorral_bajo: 0.8, matorral_denso: 0.5 } as const;
/** Valor de copas fuera del dosel óptimo (dentro vale 1). */
const COPAS_FUERA = 0.6;

export interface PuntuacionDir { rumbo: number; total: number | null; observado: number | null; modelo: number | null; razones: string[] }

const NOMBRE_ARBOL: Record<string, string> = { alcornoque: 'alcornoque', encina: 'encina', quejigo: 'quejigo', castano: 'castaño', pino: 'pino', eucalipto: 'eucalipto' };
/** Árbol del modelo (ARBOL de micro.ts, con tilde) → clave de lo observado; null = el modelo no da un árbol comparable. */
const CLAVE_MODELO: Record<string, string> = { alcornoque: 'alcornoque', encina: 'encina', quejigo: 'quejigo', 'castaño': 'castano', pino: 'pino' };
const COPAS_TXT = { abierta: 'copas abiertas', media: 'copas medias', cerrada: 'copas cerradas' } as const;
const SOTO_TXT = { despejado: 'sotobosque despejado', matorral_bajo: 'sotobosque con matorral bajo', matorral_denso: 'sotobosque con matorral denso' } as const;
const SUELO_TXT: Record<string, string> = { hojarasca: 'hojarasca', musgo: 'musgo', pasto: 'pasto', roca: 'roca', tierra_desnuda: 'tierra desnuda' };

const lista = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);

export function puntuarObservado(d: DireccionGemini, p: PerfilMicro | null): { valor: number | null; razones: string[] } {
  const partes: { peso: number; valor: number }[] = [];
  const razones: string[] = [];
  // Árbol: solo si se distingue y la confianza es media/alta; contra los hospedadores del perfil.
  if (d.arbol_dominante !== 'no_se_ve' && d.confianza_arbol !== 'baja' && p?.arboles) {
    partes.push({ peso: PESOS.arbol, valor: p.arboles[d.arbol_dominante] ?? 0 });
    razones.push(`${NOMBRE_ARBOL[d.arbol_dominante] ?? 'otro árbol'} visto (confianza ${d.confianza_arbol})`);
  }
  if (d.densidad_copas !== 'no_se_ve' && p?.dosel) {
    const [lo, hi] = p.dosel.opt;
    const fcc = FCC_COPAS[d.densidad_copas];
    partes.push({ peso: PESOS.copas, valor: fcc >= lo && fcc <= hi ? 1 : COPAS_FUERA });
    razones.push(COPAS_TXT[d.densidad_copas]);
  }
  const suelo = d.suelo_visible.map((s) => SUELO_TXT[s]).filter(Boolean);
  if (d.humedad_aparente !== 'no_se_ve' && p?.humedad) {
    const v = d.humedad_aparente === 'humeda' ? 1 : d.humedad_aparente === 'seca' ? -1 : 0;
    partes.push({ peso: PESOS.humedad, valor: (Math.sign(p.humedad) * v + 1) / 2 });
    razones.push(d.humedad_aparente === 'humeda' ? 'se ve húmedo' : d.humedad_aparente === 'seca' ? 'se ve seco' : 'humedad media');
  }
  if (d.sotobosque !== 'no_se_ve') {
    partes.push({ peso: PESOS.sotobosque, valor: FACTOR_SOTOBOSQUE[d.sotobosque] });
    razones.push(SOTO_TXT[d.sotobosque]);
  }
  if (suelo.length) razones.push(lista(suelo));
  if (!partes.length) return { valor: null, razones: suelo.length ? [lista(suelo)] : [] };
  const w = partes.reduce((a, x) => a + x.peso, 0);
  return { valor: partes.reduce((a, x) => a + x.peso * x.valor, 0) / w, razones };
}

/** Contradicción solo con árbol visto con confianza media/alta y un árbol del modelo comparable (no «sin arbolado»). */
export function contradiccion(d: DireccionGemini, arbolModelo: string | null): string | null {
  if (!arbolModelo || d.arbol_dominante === 'no_se_ve' || d.arbol_dominante === 'otro' || d.confianza_arbol === 'baja') return null;
  const clave = CLAVE_MODELO[arbolModelo];
  if (!clave || clave === d.arbol_dominante) return null;
  return `el mapa da ${arbolModelo}; en la foto se ve ${NOMBRE_ARBOL[d.arbol_dominante] ?? d.arbol_dominante}`;
}

/** Una puntuación por dirección de la observación, en su orden. `arbolModeloSector[i]` es el nombre de ARBOL (micro.ts). */
export function puntuarDirecciones(o: Observacion, p: PerfilMicro | null, arbolModeloSector: (string | null)[]): PuntuacionDir[] {
  return o.direcciones.map((dir, i) => {
    const modelo = o.modeloSector[i] ?? null;
    const a = dir.analisis;
    const obsv = a ? puntuarObservado(a, p) : { valor: null, razones: [] as string[] };
    const razones = [...obsv.razones];
    const contra = a ? contradiccion(a, arbolModeloSector[i] ?? null) : null;
    if (contra) razones.push(contra);
    if (modelo !== null) razones.push(`mapa: ${Math.round(modelo)} en ese sector`);
    const total = obsv.valor !== null && modelo !== null ? 50 * obsv.valor + 0.5 * modelo
      : obsv.valor !== null ? 100 * obsv.valor : modelo;
    return { rumbo: dir.rumbo, total, observado: obsv.valor, modelo, razones: razones.map(sinComestible) };
  });
}

/** La de mayor total; empate → la de mayor modelo; ninguna con total → null («Sin datos suficientes para elegir»). */
export function mejorDireccion(ps: PuntuacionDir[]): PuntuacionDir | null {
  let mejor: PuntuacionDir | null = null;
  for (const x of ps) {
    if (x.total === null) continue;
    if (!mejor || x.total > mejor.total! || (x.total === mejor.total && (x.modelo ?? -1) > (mejor.modelo ?? -1))) mejor = x;
  }
  return mejor;
}
