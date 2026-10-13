// Prepara app/public/guia (no versionado): enlaces a ../../guia/especies.json y ../../guia/fotos, más
// indice.json con un hash corto por foto. Vite copia public/ a dist/ en el build (los enlaces se resuelven y
// los archivos reales quedan en dist/guia), así que la guía no se duplica en git.
// El hash va en la URL de cada foto (?v=…): si una foto cambia, la caché «guia-fotos» la trata como nueva.
import { createHash } from 'node:crypto';
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
writeFileSync(join(destino, 'indice.json'), JSON.stringify({
  especies: createHash('sha256').update(json).digest('hex').slice(0, 10), fotos }, null, 1));
console.log(`public/guia → ../../guia (${Object.keys(fotos).length} fotos indexadas)`);
