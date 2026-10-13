// Enlaza <app>/<dir>/data → pipeline/data/out/app (los datos no se versionan ni se copian).
import { rmSync, symlinkSync, existsSync, lstatSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2] ?? 'public';
const enlace = join(app, dir, 'data');
const destino = '../../pipeline/data/out/app';
if (!existsSync(join(app, dir, destino))) console.warn(`Aviso: no existe ${destino}; ejecuta el pipeline (exportar).`);
try { lstatSync(enlace); rmSync(enlace, { recursive: true, force: true }); } catch { /* no existía */ }
symlinkSync(destino, enlace);
console.log(`${dir}/data → ${destino}`);
