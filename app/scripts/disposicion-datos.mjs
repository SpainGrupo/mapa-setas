// Dónde están los datos de la app en disco (pipeline/data), en la disposición multi-región o en la plana antigua.
//   multi-región: regiones.json + <id>/out/app/ + modelo/ (compartido; si no existe, <id>/out/app/modelo/)
//   legado:       out/app/ (una sola región: Marbella) → se sintetiza regiones.json
// Lo usan enlazar-datos.mjs (desarrollo y e2e) y publicar.sh. Uso CLI: node disposicion-datos.mjs --json <raiz>
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LEGADO_MARBELLA = { id: 'marbella', nombre: 'Marbella', origen: { lat: 36.5101, lon: -4.8825 } };
// Entra en URLs y rutas de OPFS. 'modelo' está reservado (data/modelo/); '_comun' no pasa por empezar con '_'.
const ID = /^[a-z][a-z0-9_-]{0,31}$/;

function validarId(id) {
  if (typeof id !== 'string' || !ID.test(id) || id === 'modelo') throw new Error(`id de región no válido: ${JSON.stringify(id)}`);
  return id;
}

export function disposicion(raiz) {
  const indice = join(raiz, 'regiones.json');
  if (existsSync(indice)) {
    const regiones = JSON.parse(readFileSync(indice, 'utf8'));
    const dirs = Object.fromEntries(regiones.map((r) => [validarId(r.id), join(raiz, r.id, 'out', 'app')]));
    const candidatos = [join(raiz, 'modelo'), ...Object.values(dirs).map((d) => join(d, 'modelo'))];
    return { legado: false, regiones, indice, dirs, modelo: candidatos.find((d) => existsSync(d)) ?? null };
  }
  const plano = join(raiz, 'out', 'app');
  if (!existsSync(join(plano, 'manifest.json'))) return null;
  const m = JSON.parse(readFileSync(join(plano, 'manifest.json'), 'utf8'));
  return {
    legado: true,
    regiones: [{ ...LEGADO_MARBELLA, bbox: m.bbox, total_bytes: m.total_bytes, generado: m.generado }],
    indice: null,
    dirs: { marbella: plano },
    modelo: existsSync(join(plano, 'modelo')) ? join(plano, 'modelo') : null,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === '--json') {
  const d = disposicion(process.argv[3]);
  if (!d) process.exit(1);
  process.stdout.write(JSON.stringify(d));
}
