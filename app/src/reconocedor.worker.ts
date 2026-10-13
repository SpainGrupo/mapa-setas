/// <reference lib="webworker" />
// Inferencia del reconocedor offline en un Web Worker: onnxruntime-web (wasm, versión fijada 1.20.1, un hilo).
// Los archivos llegan como File de OPFS (los valida la página con su tamaño). El .wasm de ORT viene en el mismo
// paquete (wasmBinary, sin red) y su .mjs de arranque lo sirve la app (public/ort/, en el precache).
import * as ort from 'onnxruntime-web/wasm';
import { aTensor, decodificarTexto, promediar, recorteCentral, topK, type MetaModelo, type ResultadoModelo } from './reconocer-nucleo';

const ambito = self as unknown as DedicatedWorkerGlobalScope;

export type OrdenReconocedor =
  | { tipo: 'cargar'; modelo: File; texto: File; etiquetas: File; wasm: File; urlMjs: string }
  | { tipo: 'reconocer'; fotos: Blob[] };
export type RespuestaReconocedor =
  | { tipo: 'listo'; ms: number; version: string; etiquetas: number }
  | { tipo: 'resultado'; resultado: ResultadoModelo; ms: number; msPorFoto: number[]; msInferencia: number[] }
  | { tipo: 'error'; mensaje: string };

let sesion: ort.InferenceSession | null = null;
let meta: MetaModelo | null = null;
let texto: Float32Array | null = null;

async function cargar(o: Extract<OrdenReconocedor, { tipo: 'cargar' }>) {
  const t0 = performance.now();
  meta = JSON.parse(await o.etiquetas.text()) as MetaModelo;
  if (ort.env.versions.web !== meta.ort_version) {
    throw new Error(`El reconocedor descargado es para el motor ${meta.ort_version} y la app trae ${ort.env.versions.web}. Vuelve a descargarlo en Ajustes.`);
  }
  texto = decodificarTexto(await o.texto.arrayBuffer(), meta.etiquetas.length, meta.dim);
  // Hilos solo con aislamiento de origen (COOP/COEP); en GitHub Pages o el servidor PHP no lo hay → un hilo.
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = { mjs: o.urlMjs };
  ort.env.wasm.wasmBinary = new Uint8Array(await o.wasm.arrayBuffer());
  sesion = await ort.InferenceSession.create(new Uint8Array(await o.modelo.arrayBuffer()),
    { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  return { ms: performance.now() - t0, version: ort.env.versions.web, etiquetas: meta.etiquetas.length };
}

async function preprocesar(foto: Blob, m: MetaModelo): Promise<Float32Array> {
  const bmp = await createImageBitmap(foto);          // respeta la orientación EXIF
  const { tam, media, desv } = m.preproceso;
  const { sx, sy, lado } = recorteCentral(bmp.width, bmp.height);
  const lienzo = new OffscreenCanvas(tam, tam);
  const ctx = lienzo.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx, sy, lado, lado, 0, 0, tam, tam);
  bmp.close();
  return aTensor(ctx.getImageData(0, 0, tam, tam).data, tam, media, desv);
}

async function reconocer(fotos: Blob[]) {
  if (!sesion || !meta || !texto) throw new Error('El reconocedor no está cargado.');
  const t0 = performance.now();
  const embs: Float32Array[] = [];
  const msPorFoto: number[] = [], msInferencia: number[] = [];
  for (const f of fotos) {
    const t = performance.now();
    const x = new ort.Tensor('float32', await preprocesar(f, meta), [1, 3, meta.preproceso.tam, meta.preproceso.tam]);
    const ti = performance.now();
    const out = await sesion.run({ [sesion.inputNames[0]]: x });
    msInferencia.push(performance.now() - ti);
    embs.push(new Float32Array(out[sesion.outputNames[0]].data as Float32Array));
    msPorFoto.push(performance.now() - t);
  }
  // Varias fotos del mismo ejemplar: media de los embeddings (re-normalizada).
  return { resultado: topK(promediar(embs), texto, meta, 5), ms: performance.now() - t0, msPorFoto, msInferencia };
}

ambito.onmessage = async (e: MessageEvent<OrdenReconocedor>) => {
  const o = e.data;
  try {
    if (o.tipo === 'cargar') ambito.postMessage({ tipo: 'listo', ...(await cargar(o)) } satisfies RespuestaReconocedor);
    else ambito.postMessage({ tipo: 'resultado', ...(await reconocer(o.fotos)) } satisfies RespuestaReconocedor);
  } catch (err) {
    ambito.postMessage({ tipo: 'error', mensaje: String((err as Error)?.message ?? err) } satisfies RespuestaReconocedor);
  }
};
