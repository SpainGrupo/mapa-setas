// Monta <app>/<dir>/data con la disposición publicada (los datos no se versionan ni se copian):
//   data/regiones.json (archivo), data/<id> → carpeta de la región, data/modelo → reconocedor compartido.
// Raíz de los datos: $SETAS_DATOS o <repo>/pipeline/data.
import { lstatSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { disposicion } from './disposicion-datos.mjs';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2] ?? 'public';
const raiz = resolve(process.env.SETAS_DATOS ?? join(app, '..', 'pipeline', 'data'));
const destino = join(app, dir, 'data');
try { lstatSync(destino); rmSync(destino, { recursive: true, force: true }); } catch { /* no existía */ }

const d = disposicion(raiz);
if (!d) {
  console.warn(`Aviso: no hay datos en ${raiz}; ejecuta el pipeline (exportar) o define SETAS_DATOS.`);
} else {
  mkdirSync(destino, { recursive: true });
  writeFileSync(join(destino, 'regiones.json'), JSON.stringify(d.regiones));
  for (const [id, p] of Object.entries(d.dirs)) symlinkSync(p, join(destino, id));
  if (d.modelo) symlinkSync(d.modelo, join(destino, 'modelo'));
  console.log(`${dir}/data → ${raiz} (${d.legado ? 'legado plano' : 'multi-región'}: ${Object.keys(d.dirs).join(', ')}${d.modelo ? ' + modelo' : ''})`);
}
