// Prepara app/public/guia (no versionado): enlaces a ../../guia/especies.json y ../../guia/fotos, más
// indice.json con un hash corto por foto. Vite copia public/ a dist/ en el build (los enlaces se resuelven y
// los archivos reales quedan en dist/guia), así que la guía no se duplica en git.
// El hash va en la URL de cada foto (?v=…): si una foto cambia, la caché «guia-fotos» la trata como nueva.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const guia = join(app, '..', 'guia');
const destino = join(app, 'public', 'guia');
if (!existsSync(join(guia, 'especies.json'))) throw new Error(`No existe ${guia}/especies.json`);

rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });
for (const n of ['especies.json', 'fotos']) {
  const enlace = join(destino, n);
  try { lstatSync(enlace); rmSync(enlace, { recursive: true, force: true }); } catch { /* no existía */ }
  symlinkSync(join('..', '..', '..', 'guia', n), enlace);
}
const fotos = {};
for (const f of readdirSync(join(guia, 'fotos')).filter((f) => f.endsWith('.jpg')).sort()) {
  fotos[`fotos/${f}`] = createHash('sha256').update(readFileSync(join(guia, 'fotos', f))).digest('hex').slice(0, 10);
}
const json = readFileSync(join(guia, 'especies.json'));

// Miniaturas del selector de especie: 128×128 px (recorte centrado) de la primera foto de cada ficha, en
// public/guia/miniaturas/<id>.jpg. Van en el precache (unos pocos KB cada una). Sin ffmpeg no se generan y
// el selector muestra el icono neutro.
const miniaturas = {};
const dirMini = join(destino, 'miniaturas');
mkdirSync(dirMini, { recursive: true });
let sinFfmpeg = false;
for (const f of JSON.parse(json)) {
  const archivo = f.fotos?.[0]?.archivo;
  if (sinFfmpeg || !archivo || !existsSync(join(guia, archivo))) continue;
  const salida = join(dirMini, `${f.id}.jpg`);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', join(guia, archivo), '-vf',
    'scale=128:128:force_original_aspect_ratio=increase,crop=128:128', '-q:v', '5', salida]);
  if (r.error) { sinFfmpeg = true; console.warn('Sin ffmpeg: el selector usará el icono neutro'); continue; }
  if (r.status !== 0) { console.warn(`Miniatura de ${f.id} fallida: ${r.stderr}`); continue; }
  miniaturas[f.id] = createHash('sha256').update(readFileSync(salida)).digest('hex').slice(0, 10);
}

writeFileSync(join(destino, 'indice.json'), JSON.stringify({
  especies: createHash('sha256').update(json).digest('hex').slice(0, 10), fotos, miniaturas }, null, 1));
console.log(`public/guia → ../../guia (${Object.keys(fotos).length} fotos indexadas, ${Object.keys(miniaturas).length} miniaturas)`);
