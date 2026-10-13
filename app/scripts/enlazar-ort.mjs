// Copia el arranque .mjs de onnxruntime-web (versión fijada en package.json) a public/ort/, para servirlo desde la
// propia app (y que entre en el precache): el reconocedor funciona sin red. El .wasm (11 MB) no va aquí: viaja en el
// paquete opcional del reconocedor (modelo/construir.py) y se pasa a ORT como wasmBinary desde OPFS.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const ort = join(app, 'node_modules', 'onnxruntime-web');
const fijada = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')).dependencies['onnxruntime-web'];
const instalada = JSON.parse(readFileSync(join(ort, 'package.json'), 'utf8')).version;
if (instalada !== fijada) throw new Error(`onnxruntime-web instalada ${instalada} ≠ fijada ${fijada}: npm ci`);
mkdirSync(join(app, 'public', 'ort'), { recursive: true });
copyFileSync(join(ort, 'dist', 'ort-wasm-simd-threaded.mjs'), join(app, 'public', 'ort', 'ort-wasm-simd-threaded.mjs'));
console.log(`public/ort ← onnxruntime-web ${instalada}`);
