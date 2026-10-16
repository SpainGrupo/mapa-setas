// Reconocedor offline: preproceso, decodificación de los embeddings y top-5 (sin DOM ni ORT, se prueba en Node).
// El modelo (BioCLIP zero-shot, modelo/construir.py) solo PROPONE candidatos; nunca descarta nada (ver seguridad.ts).

export interface Etiqueta { n: string; g?: string; t?: 'guia' | 'sinonimo' | 'afin' }
export interface MetaModelo {
  ort_version: string;
  dim: number;
  logit_scale: number;
  preproceso: { tam: number; media: number[]; desv: number[] };
  etiquetas: Etiqueta[];
}
export type Banda = 'alto' | 'medio' | 'bajo';
export interface Candidato {
  nombre: string;          // nombre científico de la etiqueta del modelo
  idGuia?: string;         // ficha de la guía (misma especie o sinónimo)
  afin?: boolean;          // true: especie distinta pero parecida a la ficha idGuia
  coseno: number;
  prob: number;            // softmax con logit_scale (no calibrada: nunca se muestra como certeza)
  banda: Banda;
}
export interface ResultadoModelo { candidatos: Candidato[]; noReconocido: boolean; cosenoMax: number }

/**
 * Bandas de parecido sobre el coseno imagen-texto. Calibradas con modelo/referencia.json: el coseno máximo en las
 * 110 fotos de la guía va de 0,24 a ~0,40 (p05 0,29, mediana 0,34); el top-1 correcto suele pasar de 0,33.
 */
export const UMBRAL_ALTO = 0.33;
export const UMBRAL_MEDIO = 0.29;
/**
 * Por debajo, «no reconocido» (sin top-5 forzado). Calibrado con modelo/referencia.json (1611 etiquetas): queda por
 * encima de todas las fotos reales sin setas medidas (37, máx 0,272; con el vocabulario anterior, 0,276), del ruido
 * (0,26) y de una imagen azul (0,25), y deja fuera 3 de las 110 fotos de la guía (las criadillas y una seta de cardo,
 * por debajo del p05 de 0,293). Ojo: una imagen gris lisa da 0,31, así que esto NO garantiza detectar fotos que no son
 * setas. Con «no reconocido» las mortales se siguen listando todas (seguridad.ts).
 */
export const UMBRAL_NO_RECONOCIDO = 0.28;

export function banda(coseno: number): Banda {
  return coseno >= UMBRAL_ALTO ? 'alto' : coseno >= UMBRAL_MEDIO ? 'medio' : 'bajo';
}
export const TEXTO_BANDA: Record<Banda, string> = { alto: 'Parecido alto', medio: 'Parecido medio', bajo: 'Parecido bajo' };

/** float16 (IEEE 754 half) → float32. */
export function f16(h: number): number {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
  if (e === 0) return s * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + f / 1024);
}

/** Buffer N×dim de float16 little-endian → Float32Array. */
export function decodificarTexto(buf: ArrayBuffer, n: number, dim: number): Float32Array {
  const u = new Uint16Array(buf);
  if (u.length !== n * dim) throw new Error(`Embeddings de texto: ${u.length} valores, se esperaban ${n * dim}`);
  const out = new Float32Array(u.length);
  for (let i = 0; i < u.length; i++) out[i] = f16(u[i]);
  return out;
}

/**
 * Lado corto a `tam` y recorte central (como open_clip: Resize + CenterCrop). Devuelve el rectángulo de origen
 * (sx, sy, lado) a dibujar en un lienzo de tam×tam.
 */
export function recorteCentral(w: number, h: number): { sx: number; sy: number; lado: number } {
  const lado = Math.min(w, h);
  return { sx: Math.floor((w - lado) / 2), sy: Math.floor((h - lado) / 2), lado };
}

/** RGBA (tam×tam, de un canvas) → tensor CHW float32 normalizado con la media y desviación de CLIP. */
export function aTensor(rgba: Uint8ClampedArray | Uint8Array, tam: number, media: number[], desv: number[]): Float32Array {
  const n = tam * tam;
  if (rgba.length !== n * 4) throw new Error(`Imagen de ${rgba.length / 4} píxeles, se esperaban ${n}`);
  const t = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) t[c * n + i] = (rgba[i * 4 + c] / 255 - media[c]) / desv[c];
  }
  return t;
}

/** Media de varios embeddings (varias fotos del mismo ejemplar), re-normalizada. */
export function promediar(embs: Float32Array[]): Float32Array {
  const d = embs[0].length, m = new Float32Array(d);
  for (const e of embs) for (let i = 0; i < d; i++) m[i] += e[i];
  const nrm = Math.hypot(...m) || 1;
  for (let i = 0; i < d; i++) m[i] /= nrm;
  return m;
}

/**
 * Top-k sobre el vocabulario. Los sinónimos de una misma ficha (p. ej. B. aestivalis y B. reticulatus) se funden en
 * un solo candidato (gana el coseno mayor); las especies afines conservan su nombre y enlazan a la ficha parecida.
 */
export function topK(emb: Float32Array, texto: Float32Array, meta: MetaModelo, k = 5): ResultadoModelo {
  const { dim, etiquetas, logit_scale } = meta;
  const n = etiquetas.length;
  const cos = new Float32Array(n);
  let max = -Infinity;
  for (let j = 0; j < n; j++) {
    let s = 0;
    for (let i = 0; i < dim; i++) s += texto[j * dim + i] * emb[i];
    cos[j] = s;
    if (s > max) max = s;
  }
  let z = 0;
  const p = new Float64Array(n);
  for (let j = 0; j < n; j++) { p[j] = Math.exp(logit_scale * (cos[j] - max)); z += p[j]; }
  const orden = Array.from({ length: n }, (_, j) => j).sort((a, b) => cos[b] - cos[a]);
  const vistos = new Map<string, Candidato>();
  const candidatos: Candidato[] = [];
  for (const j of orden) {
    const e = etiquetas[j];
    const clave = e.g && e.t !== 'afin' ? `g:${e.g}` : `n:${e.n}`;
    const prob = p[j] / z;
    const ya = vistos.get(clave);
    if (ya) { ya.prob += prob; continue; }
    if (candidatos.length >= k) continue;
    const c: Candidato = { nombre: e.n, coseno: cos[j], prob, banda: banda(cos[j]) };
    if (e.g) { c.idGuia = e.g; if (e.t === 'afin') c.afin = true; }
    vistos.set(clave, c);
    candidatos.push(c);
  }
  return { candidatos, noReconocido: max < UMBRAL_NO_RECONOCIDO, cosenoMax: max };
}

export const genero = (nombre: string) => nombre.trim().split(/\s+/)[0];
