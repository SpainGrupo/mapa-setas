# Multi-región, fase B (app): implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Goal:** La PWA pasa a ser multi-región (índice `data/regiones.json`, región activa, selector, descargas offline por región) mientras solo existen los datos de Marbella, y Marbella se comporta exactamente igual que hoy.

**Architecture:** Un módulo nuevo `region.ts` fija la región activa antes de arrancar el mapa. Todo lo que hoy cuelga de `data/` pasa a colgar de `data/<region>/`: URLs, OPFS (`mapas/<region>`), claves `setas:<clave>:<region>` y la caché de meteo `datos:<region>`. Una migración de un solo uso mueve la instalación plana antigua a `marbella`. Los textos que hoy están fijos en el código (origen, atribuciones, normativa, BOJA) salen del manifest de la región. Si un manifest antiguo no trae esos campos, los rellena una tabla de legado de Marbella que guarda exactamente los textos actuales. Cambiar de región guarda la elección y recarga la página. La app ya recarga igual cuando cambian los mapas de OPFS, y así ninguna caché de módulo (PMTiles, `acceso-datos`, `sitios`) arrastra datos de la región anterior.

**Tech Stack:** TypeScript 7, Vite 8, vite-plugin-pwa, MapLibre 6, pmtiles 4, idb-keyval, vitest 5 (entorno `node`), Playwright (e2e en `app/e2e/*.e2e.mjs`), Cloudflare Worker (`worker/`, vitest).

**Spec:** `docs/specs/2026-10-15-multi-region-alicante-design.md` (§4 app, §4.1–4.4, §5 presupuesto, §6 casos límite, §7.3–7.4 pruebas, §8 puertas). Leer también `app/design/design-system/MASTER.md` (tokens y movimiento) antes de las tareas 11–12.

## Global Constraints

- Marbella no cambia: los textos visibles, las capas, los tops y el e2e actual (`app/e2e/offline.e2e.mjs`) siguen dando lo mismo. Los únicos cambios permitidos en ese e2e son rutas (`data/` → `data/marbella/`) y claves (`setas:mapas-descargados` → `setas:mapas-descargados:marbella`).
- Regla de seguridad no negociable: la app nunca afirma que una seta sea comestible (SPEC §2). Ningún texto nuevo dice «permitido» ni da un cupo que no esté `verificado: true` (spec §1.5, §3.6).
- Nunca inventar un hecho. Lo que no venga en el manifest se omite, o usa el texto de legado de Marbella que ya está hoy en el código.
- Identificadores en castellano y sin tildes. Código en TypeScript. Tests con vitest (`npm test` en `app/`, `npm test` en `worker/`).
- Cobertura del 100 % en `src/seguridad.ts` y `src/reconocer-nucleo.ts` (`npm run cobertura`). Este plan no los toca, pero la puerta se pasa igual.
- No hay dependencias nuevas. El OPFS falso de los tests es un archivo propio de unas 60 líneas.
- Ids de región: `^[a-z][a-z0-9_-]{0,31}$`. Se prohíbe el id `modelo`, que chocaría con `data/modelo/`. Se validan en la app y en los scripts, porque el id entra en URLs y en rutas de OPFS.
- Diseño «Instrumento» liquid glass: clase `.vidrio`, solo tokens de `src/estilos.css`, que ya traen el modo oscuro. Pulsación `scale(0.97)` a 100 ms `var(--curva)`. Las hojas entran con la animación `subir` existente (`var(--entrada)`). Solo `transform`/`opacity`. Con `prefers-reduced-motion` no hay escala. Área de toque ≥ 44 px.
- Copy en castellano. **Todas las cadenas visibles nuevas pasan por la skill `humanizer` antes del commit de su tarea** (regla `_config/voice.md` §«Pase humanizer»). Las cadenas de este plan son el borrador.
- Presupuesto publicado (spec §5): total ≤ 950 MB (decimal, 950·10⁶ bytes) y ≤ 95 MiB por archivo.
- Commits: solo los archivos de la tarea (`git add <rutas>`, nunca `git add -A`). El mensaje termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Datos para build y e2e en el worktree: el worktree no tiene `pipeline/data`. Se apunta al checkout principal con `SETAS_DATOS=/Users/alexanderkrupnov/Documents/Claude/setas/pipeline/data`, que leen `enlazar-datos.mjs` y `publicar.sh` (tarea 1).

## Contrato de datos (pipeline → app)

Los fija este plan y los emite el plan del pipeline (fase A). La app acepta que falten todos los campos nuevos, para poder seguir leyendo los datos actuales.

**`data/regiones.json`** (en disco: `pipeline/data/regiones.json`):
```json
[{ "id": "marbella", "nombre": "Marbella", "origen": { "lat": 36.5101, "lon": -4.8825 },
   "bbox": [-6.19595, 35.97676, -3.45946, 37.57618], "total_bytes": 184586749, "generado": "2026-10-14T11:06:55+00:00" }]
```

**Disposición en disco y publicada:**
- `pipeline/data/<id>/out/app/` → `data/<id>/`, con `manifest.json` y sus `archivos`.
- `pipeline/data/modelo/` → `data/modelo/` (reconocedor compartido). La app sigue leyendo `manifest.modelo` del manifest de la región activa, con `dir: "modelo/"` **relativo a `data/`** y no a `data/<id>/`. Todas las regiones que lo lleven deben tener la misma `version`, y `publicar.sh` falla si no coinciden. Si `pipeline/data/modelo/` no existe, los scripts buscan `<id>/out/app/modelo/` (transición).

**Campos nuevos del manifest** (`data/<id>/manifest.json`), todos opcionales para la app:
```ts
region: { id: string; nombre: string; origen: { lat: number; lon: number }; etiqueta_origen: string }   // etiqueta con preposición: "de Marbella", "de Alicante"
legal: {
  ccaa: { id: IdCcaa; nombre: string; norma: string; cupo_kg_dia: number | null; texto: string; verificado: boolean; fuente_url: string }[];
  texto_protegido: string;          // popup de espacio protegido (hoy fijo: "Consulta la normativa de recolección del espacio.")
  chip_sitio_restringido: string;   // chip de un top con restringido=true (hoy fijo: "Recoger aquí exige autorización")
}
atribuciones: {
  mapa: string;                     // control del mapa, Ajustes y diálogo de inicio (hoy fijo en mapa.ts:14 e index.html:373/400)
  fuentes: Record<string, string>;  // valor de la propiedad `fuente` de rutas.pmtiles → nombre legible (hoy fijo en mapa.ts:143)
}
ccaa: string | null                 // nombre del PMTiles de CCAA ("ccaa.pmtiles"), también en `archivos` para que vaya en la descarga offline
avisos: string[]                    // spec §6: capas que salieron NODATA, fuentes caídas…; se muestran en Ajustes
especies[].sin_habitat?: boolean    // true: sin pmtiles de idoneidad; la app la pinta gris y sin capa
```
- `IdCcaa` es una lista cerrada: `"andalucia" | "comunitat_valenciana" | "region_murcia" | "castilla_la_mancha"`. La comparten el manifest, `ccaa.pmtiles` y el Worker de Gemini.
- `legal.ccaa[].norma` es la **sigla corta del boletín**: `"BOJA"`, `"DOGV"`, `"BORM"`, `"DOCM"`. Va en la nota «comprueba la normativa vigente (BOJA)». El detalle (resolución, fecha) va en `texto`.
- Para Marbella, el pipeline emite `legal.ccaa = [{ id: "andalucia", nombre: "Andalucía", norma: "BOJA", cupo_kg_dia: null, texto: <aviso actual de exportar.py>, verificado: true, fuente_url: <URL BOJA> }]`. `texto_protegido`, `chip_sitio_restringido` y `atribuciones` llevan los textos de hoy, citados arriba. Con eso el e2e de Marbella no cambia ni una línea de texto.
- `fuente_url` solo se muestra si empieza por `https://`.

**`ccaa.pmtiles`:** capa vectorial **`ccaa`** con propiedades **`id`** (`IdCcaa`) y **`nombre`** (texto). Son polígonos recortados a la zona. La app lee la tesela del nivel máximo del archivo, igual que con `restricciones.pmtiles`, así que basta con un `maxzoom` de 10.

**Compatibilidad hacia atrás (decisión):** la app **no** tiene camino de respaldo a `data/manifest.json`. La transición se resuelve en los scripts. Si `pipeline/data/regiones.json` no existe pero sí `pipeline/data/out/app/manifest.json` (disposición plana actual), `enlazar-datos.mjs` y `publicar.sh` sintetizan `regiones.json` con una sola región `marbella` y montan `data/marbella/` sobre la carpeta plana. Por qué:
1. App y datos se publican juntos y de una vez (`publicar.sh` fuerza un único commit en `gh-pages`). Nunca hay en producción una app nueva frente a datos planos.
2. Los únicos que leen datos planos son el desarrollo local y los e2e, y ambos pasan por `enlazar-datos.mjs`.
3. Un respaldo en la app añadiría un segundo esquema de URLs y de OPFS que se ejecutaría en cada arranque sin que ningún e2e lo cubra.
4. Las instalaciones antiguas (OPFS plano) se resuelven con la migración de la tarea 6, que sí lleva test.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `app/scripts/disposicion-datos.mjs` (nuevo) | Dónde están en disco el índice, cada región y el modelo. Sintetiza el legado plano. Lo usan `enlazar-datos.mjs` y `publicar.sh`. |
| `app/scripts/disposicion-datos.test.mjs` (nuevo) | Tests de lo anterior con carpetas temporales. |
| `app/scripts/enlazar-datos.mjs` | Monta `app/<dir>/data/` como carpeta real con `regiones.json` y enlaces `<id>` y `modelo`. |
| `app/scripts/publicar.sh` | Copia todas las regiones y el modelo una vez. Presupuesto ≤ 950 MB. |
| `app/src/unidades.ts` (nuevo) | `mb()`. Sale de `datos.ts` para que `region.ts` no cree un ciclo. |
| `app/src/region.ts` (nuevo) | Índice de regiones, región activa, claves por región, `baseDatos()`, `raizDatos()`, elección inicial. Sin DOM. |
| `app/src/manifest-region.ts` (nuevo) | Tipos del contrato nuevo, `prepararManifest()` (validación más legado de Marbella) y `nombreFuente()`. Sin DOM. |
| `app/src/opfs-rutas.ts` (nuevo) | Rutas anidadas en OPFS (`dirDe`, `quitarRuta`). Lo comparten `opfs.ts` y el worker de descarga. |
| `app/src/opfs-falso.ts` (nuevo, solo tests) | OPFS en memoria para vitest. |
| `app/src/opfs.ts` | Paquete de mapas por región. El del modelo no cambia. |
| `app/src/descarga.worker.ts` | `dir`/`desde`/`hacia` aceptan rutas `a/b`. |
| `app/src/migracion.ts` (nuevo) | Pasa la instalación plana a `marbella`, una sola vez. |
| `app/src/meteo.ts` | Caché IndexedDB con clave `datos:<region>`, más `renombrarCache`. |
| `app/src/datos.ts` | `cargarJson`/`cargarManifest` por región. |
| `app/src/normativa.ts` (nuevo) | CCAA del punto, vista de la normativa y texto del cupo. Sin DOM. |
| `app/src/restricciones.ts` | `orientativo(normas)` sustituye a `ORIENTATIVO`. |
| `app/src/ranking.ts` | Se quita `MARBELLA`. |
| `app/src/hoy-ui.ts` | Origen, etiqueta y chip de restringido desde el manifest. |
| `app/src/mapa.ts` | Atribuciones, nombres de fuente y texto de protegido desde el manifest. `entidadesEn` genérico y `ccaaEn`. |
| `app/src/selector-especie.ts` | Filas «Sin hábitat en esta zona». |
| `app/src/region-ui.ts` (nuevo) | Chip de región, hoja `#dlg-region`, lista de Ajustes, `posicionRapida()`. |
| `app/src/main.ts` | Arranque (migración → región → mapa), claves por región, Ajustes. |
| `app/src/gemini.ts` + `app/src/reconocer-ui.ts` | `elegirCcaaGemini()` y envío de `contexto.ccaa`. |
| `worker/src/validar.ts`, `worker/src/gemini.ts` | `contexto.ccaa` de lista cerrada; el prompt se construye por CCAA. |
| `app/index.html`, `app/src/estilos.css` | Chip, hoja, sección «Región», avisos, normativa por CCAA. |
| `app/e2e/offline.e2e.mjs` | Rutas y claves nuevas. |
| `app/e2e/regiones.e2e.mjs` (nuevo) + `app/e2e/fixtures/region-prueba/manifest.json` (nuevo) | Región falsa «prueba», migración, cambio de región, primera elección. |

---

### Task 1: Disposición de datos y enlace multi-región

**Files:**
- Create: `app/scripts/disposicion-datos.mjs`
- Create: `app/scripts/disposicion-datos.test.mjs`
- Modify: `app/scripts/enlazar-datos.mjs` (reescritura completa)
- Modify: `app/vitest.config.ts` (incluir `scripts/**/*.test.mjs`)

**Interfaces:**
- Consumes: —
- Produces:
  - `disposicion(raiz: string): null | { legado: boolean; regiones: RegionIndice[]; indice: string | null; dirs: Record<string, string>; modelo: string | null }`, donde `RegionIndice = { id, nombre, origen:{lat,lon}, bbox:[o,s,e,n], total_bytes, generado }`.
  - CLI: `node app/scripts/disposicion-datos.mjs --json <raiz>` imprime el objeto en JSON (sale con código 1 si es `null`).
  - `LEGADO_MARBELLA = { id: 'marbella', nombre: 'Marbella', origen: { lat: 36.5101, lon: -4.8825 } }`.
  - Variable de entorno `SETAS_DATOS` (raíz de `pipeline/data`); por defecto `<repo>/pipeline/data`.
  - En disco tras `enlazar-datos.mjs <dir>`: `app/<dir>/data/regiones.json` (archivo real), `app/<dir>/data/<id>` → enlace a la carpeta de la región, `app/<dir>/data/modelo` → enlace al modelo (si existe).

- [x] **Step 1: Write the failing test**

`app/scripts/disposicion-datos.test.mjs`:
```js
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { disposicion, LEGADO_MARBELLA } from './disposicion-datos.mjs';

let raiz;
const nueva = () => (raiz = mkdtempSync(join(tmpdir(), 'setas-dispo-')));
const json = (p, o) => { mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, JSON.stringify(o)); };
afterEach(() => raiz && rmSync(raiz, { recursive: true, force: true }));

const indice = (id) => ({ id, nombre: id, origen: { lat: 38, lon: -0.5 }, bbox: [-1, 37, 0, 39], total_bytes: 10, generado: '2026-10-15' });

describe('disposicion', () => {
  it('sin datos devuelve null', () => {
    expect(disposicion(nueva())).toBeNull();
  });

  it('legado plano: sintetiza marbella desde out/app/manifest.json', () => {
    nueva();
    json(join(raiz, 'out/app/manifest.json'), { bbox: [1, 2, 3, 4], total_bytes: 99, generado: 'G' });
    mkdirSync(join(raiz, 'out/app/modelo'));
    const d = disposicion(raiz);
    expect(d.legado).toBe(true);
    expect(d.indice).toBeNull();
    expect(d.regiones).toEqual([{ ...LEGADO_MARBELLA, bbox: [1, 2, 3, 4], total_bytes: 99, generado: 'G' }]);
    expect(d.dirs).toEqual({ marbella: join(raiz, 'out/app') });
    expect(d.modelo).toBe(join(raiz, 'out/app/modelo'));
  });

  it('multi-región: lee regiones.json, una carpeta por región y el modelo compartido primero', () => {
    nueva();
    json(join(raiz, 'regiones.json'), [indice('marbella'), indice('alicante')]);
    mkdirSync(join(raiz, 'modelo'));
    mkdirSync(join(raiz, 'marbella/out/app/modelo'), { recursive: true });
    const d = disposicion(raiz);
    expect(d.legado).toBe(false);
    expect(d.indice).toBe(join(raiz, 'regiones.json'));
    expect(d.dirs).toEqual({ marbella: join(raiz, 'marbella/out/app'), alicante: join(raiz, 'alicante/out/app') });
    expect(d.modelo).toBe(join(raiz, 'modelo'));
  });

  it('sin modelo compartido usa el de la primera región que lo tenga', () => {
    nueva();
    json(join(raiz, 'regiones.json'), [indice('marbella')]);
    mkdirSync(join(raiz, 'marbella/out/app/modelo'), { recursive: true });
    expect(disposicion(raiz).modelo).toBe(join(raiz, 'marbella/out/app/modelo'));
  });

  it('rechaza ids peligrosos o reservados', () => {
    for (const id of ['../x', 'Marbella', 'modelo', '', 'a/b']) {
      nueva();
      json(join(raiz, 'regiones.json'), [indice(id)]);
      expect(() => disposicion(raiz), id).toThrow(/id de región/);
      rmSync(raiz, { recursive: true, force: true });
    }
    raiz = undefined;
  });
});
```

`app/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'], environment: 'node' } });
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run scripts/disposicion-datos.test.mjs`
Expected: FAIL, «Failed to resolve import "./disposicion-datos.mjs"».

- [x] **Step 3: Write minimal implementation**

`app/scripts/disposicion-datos.mjs`:
```js
// Dónde están los datos de la app en disco (pipeline/data), en la disposición multi-región o en la plana antigua.
//   multi-región: regiones.json + <id>/out/app/ + modelo/ (compartido)
//   legado:       out/app/ (una sola región: Marbella) → se sintetiza regiones.json
// Lo usan enlazar-datos.mjs (desarrollo y e2e) y publicar.sh. Uso CLI: node disposicion-datos.mjs --json <raiz>
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LEGADO_MARBELLA = { id: 'marbella', nombre: 'Marbella', origen: { lat: 36.5101, lon: -4.8825 } };
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
```

`app/scripts/enlazar-datos.mjs` (sustituye el archivo entero):
```js
// Monta <app>/<dir>/data con la disposición publicada (los datos no se versionan ni se copian):
//   data/regiones.json (archivo), data/<id> → carpeta de la región, data/modelo → reconocedor compartido.
// Raíz de los datos: $SETAS_DATOS o <repo>/pipeline/data (en un worktree, apunta al checkout principal).
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
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run scripts/disposicion-datos.test.mjs`
Expected: PASS (5 tests).

Run: `cd app && SETAS_DATOS=/Users/alexanderkrupnov/Documents/Claude/setas/pipeline/data node scripts/enlazar-datos.mjs public && ls -l public/data && head -c 200 public/data/regiones.json`
Expected: «public/data → … (legado plano: marbella + modelo)», enlaces `marbella` y `modelo`, y `regiones.json` con `"id":"marbella"`.

- [x] **Step 5: Commit**

```bash
git add app/scripts/disposicion-datos.mjs app/scripts/disposicion-datos.test.mjs app/scripts/enlazar-datos.mjs app/vitest.config.ts
git commit -m "feat(app): disposición de datos multi-región con legado plano sintetizado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `publicar.sh` multi-región con presupuesto de 950 MB

**Files:**
- Modify: `app/scripts/publicar.sh` (bloque de datos, entre `DATOS=` y `touch "$SALIDA/.nojekyll"`, y comprobaciones finales)

**Interfaces:**
- Consumes: CLI `node app/scripts/disposicion-datos.mjs --json <raiz>` (tarea 1).
- Produces: `$SALIDA/data/regiones.json`, `$SALIDA/data/<id>/…` y `$SALIDA/data/modelo/…`. Variables `SETAS_DATOS` (raíz de datos) y `PRESUPUESTO_MB` (por defecto 950).

- [x] **Step 1: Write the failing check**

Antes de cambiar nada, comprueba que el script actual no conoce el presupuesto:
Run: `grep -c PRESUPUESTO_MB app/scripts/publicar.sh`
Expected: `0`.

- [x] **Step 2: Implement**

Sustituye en `app/scripts/publicar.sh` las líneas desde `DATOS="$RAIZ/pipeline/data/out/app"` hasta el final del bloque `PY` (incluido) por:
```bash
DATOS_RAIZ="$(cd "${SETAS_DATOS:-$RAIZ/pipeline/data}" 2>/dev/null && pwd)" || { echo "No existe la raíz de datos (SETAS_DATOS o pipeline/data)." >&2; exit 1; }
REMOTO="${REMOTO:-https://github.com/SpainGrupo/mapa-setas.git}"
SALIDA="${SALIDA:-$(mktemp -d)/gh-pages}"
LIMITE=$((95 * 1024 * 1024))                              # GitHub rechaza archivos de más de 100 MB
PRESUPUESTO=$(( ${PRESUPUESTO_MB:-950} * 1000 * 1000 ))   # spec §5: Pages admite 1 GB por sitio

DISPO="$(node "$APP/scripts/disposicion-datos.mjs" --json "$DATOS_RAIZ")" \
  || { echo "Sin datos en $DATOS_RAIZ: ejecuta el pipeline (exportar)." >&2; exit 1; }

# Worker de Gemini (segunda opinión); sobrescribible con VITE_WORKER_URL en el entorno
export VITE_WORKER_URL="${VITE_WORKER_URL:-https://setas-identificar.setas-worker.workers.dev}"
(cd "$APP" && npm run build)

rm -rf "$SALIDA"; mkdir -p "$SALIDA/data"
# dist sin el enlace data/ (-L resuelve los enlaces de la guía si quedara alguno)
rsync -aL --exclude '/data' "$APP/dist/" "$SALIDA/"

DISPO="$DISPO" python3 - "$SALIDA/data" <<'PY'
import json, os, shutil, sys
d = json.loads(os.environ['DISPO']); dst = sys.argv[1]
def copiar(origen, nombre):
    if not os.path.isfile(origen): sys.exit(f'Falta {origen}')
    os.makedirs(os.path.dirname(os.path.join(dst, nombre)), exist_ok=True)
    shutil.copyfile(origen, os.path.join(dst, nombre))
n, modelos = 0, {}
for r in d['regiones']:
    src = d['dirs'][r['id']]
    m = json.load(open(os.path.join(src, 'manifest.json')))
    for a in ['manifest.json'] + [a['nombre'] for a in m['archivos']]:
        copiar(os.path.join(src, a), f"{r['id']}/{a}"); n += 1
    if m.get('modelo'): modelos[m['modelo']['version']] = m['modelo']
if len(modelos) > 1: sys.exit(f'Las regiones traen modelos distintos: {sorted(modelos)}')
for mod in modelos.values():
    if mod['dir'] != 'modelo/': sys.exit(f"modelo.dir debe ser 'modelo/' (es {mod['dir']!r})")
    if not d['modelo']: sys.exit('Hay modelo en el manifest pero no su carpeta')
    for a in mod['archivos']:
        copiar(os.path.join(d['modelo'], a['nombre']), 'modelo/' + a['nombre']); n += 1
with open(os.path.join(dst, 'regiones.json'), 'w') as f: json.dump(d['regiones'], f, ensure_ascii=False)
print(f"data/: {n + 1} archivos copiados ({len(d['regiones'])} región/es{', legado plano' if d['legado'] else ''})")
PY
```
Borra también la línea antigua `[[ -f "$DATOS/manifest.json" ]] || …` y las definiciones duplicadas de `REMOTO`, `SALIDA` y `LIMITE` que quedaban arriba. Tras la comprobación de enlaces simbólicos y antes de `echo "Preparado en …"`, añade:
```bash
total=$(python3 -c 'import os,sys; print(sum(os.path.getsize(os.path.join(r,f)) for r,_,fs in os.walk(sys.argv[1]) for f in fs))' "$SALIDA")
(( total <= PRESUPUESTO )) || { echo "El sitio ocupa $((total / 1000000)) MB y el presupuesto es $((PRESUPUESTO / 1000000)) MB (spec §5). Aplica las palancas de §5 o pregunta a Alexander." >&2; exit 1; }
```
Actualiza el comentario de cabecera: «copia regiones.json, cada data/<id>/ (manifest y archivos) y el modelo una sola vez; comprueba 95 MB por archivo y 950 MB en total».

- [x] **Step 3: Verify**

Run: `SETAS_DATOS=/Users/alexanderkrupnov/Documents/Claude/setas/pipeline/data SALIDA=/private/tmp/setas-pub/gh-pages app/scripts/publicar.sh --local`
Expected: «data/: N archivos copiados (1 región/es, legado plano)» y «Preparado en …». `ls /private/tmp/setas-pub/gh-pages/data` muestra `marbella modelo regiones.json`.

Run: `PRESUPUESTO_MB=1 SETAS_DATOS=/Users/alexanderkrupnov/Documents/Claude/setas/pipeline/data SALIDA=/private/tmp/setas-pub/gh-pages app/scripts/publicar.sh --local; echo "salida=$?"`
Expected: «El sitio ocupa … MB y el presupuesto es 1 MB …» y `salida=1`.

- [x] **Step 4: Commit**

```bash
git add app/scripts/publicar.sh
git commit -m "feat(app): publicar.sh copia todas las regiones y el modelo una vez; presupuesto 950 MB

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Contrato del manifest y legado de Marbella (`manifest-region.ts`)

**Files:**
- Create: `app/src/manifest-region.ts`
- Create: `app/src/manifest-region.test.ts`
- Modify: `app/src/tipos.ts` (campos opcionales nuevos en `Manifest` y `Especie`)

**Interfaces:**
- Consumes: —
- Produces:
```ts
export type IdCcaa = 'andalucia' | 'comunitat_valenciana' | 'region_murcia' | 'castilla_la_mancha';
export const IDS_CCAA: readonly IdCcaa[];
export interface RegionManifest { id: string; nombre: string; origen: { lat: number; lon: number }; etiqueta_origen: string }
export interface EntradaLegal { id: IdCcaa; nombre: string; norma: string; cupo_kg_dia: number | null; texto: string; verificado: boolean; fuente_url: string }
export interface Atribuciones { mapa: string; fuentes: Record<string, string> }
export interface ManifestApp extends Manifest {
  region: RegionManifest; legal: EntradaLegal[]; texto_protegido: string; chip_sitio_restringido: string;
  atribuciones: Atribuciones; normas_legado: string[]; avisos: string[]; especies_sin_habitat: Especie[];
}   // `especies` ya solo trae las activas (sin `sin_habitat`)
export const LEGADO_MARBELLA: { region: RegionManifest; atribuciones: Atribuciones; texto_protegido: string; chip_sitio_restringido: string; normas: string[] };
export function prepararManifest(m: Manifest, idRegion: string): ManifestApp;
export function nombreFuente(f: string, fuentes: Record<string, string>): string;
```
`tipos.ts` añade a `Especie`: `sin_habitat?: boolean`; y a `Manifest`: `region?: unknown; legal?: unknown; atribuciones?: unknown; ccaa?: string | null; avisos?: unknown`. Se tipan como `unknown` porque `prepararManifest` los valida.

- [x] **Step 1: Write the failing test**

`app/src/manifest-region.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { LEGADO_MARBELLA, nombreFuente, prepararManifest } from './manifest-region';
import type { Manifest } from './tipos';

const base = (extra: Partial<Manifest> = {}): Manifest => ({
  generado: 'G', bbox: [-1, 37, 1, 39], umbrales: [0], zoom: { idoneidad: [8, 13], sombreado: [8, 12], base_max: 15 }, base: null,
  especies: [{ id: 'a', nombre: 'A' }, { id: 'b', nombre: 'B', sin_habitat: true }, { id: 'c', nombre: 'C' }],
  archivos: [], total_bytes: 0, ...extra,
});

describe('prepararManifest: manifest antiguo de Marbella (sin campos nuevos)', () => {
  const m = prepararManifest(base({ especies: [{ id: 'a', nombre: 'A' }] }), 'marbella');
  it('rellena con los textos de hoy', () => {
    expect(m.region).toEqual({ id: 'marbella', nombre: 'Marbella', origen: { lat: 36.5101, lon: -4.8825 }, etiqueta_origen: 'de Marbella' });
    expect(m.atribuciones.mapa).toBe('IGN CC BY 4.0, © MITECO MFE, IGME, REDIAM CC BY 4.0, © OpenStreetMap ODbL, Protomaps');
    expect(m.atribuciones.fuentes).toEqual({ rediam: 'REDIAM (Junta de Andalucía)', osm: 'OpenStreetMap' });
    expect(m.texto_protegido).toBe('Consulta la normativa de recolección del espacio.');
    expect(m.chip_sitio_restringido).toBe('Recoger aquí exige autorización');
    expect(m.normas_legado).toEqual(['BOJA']);
    expect(m.legal).toEqual([]);
    expect(m.avisos).toEqual([]);
    expect(m.ccaa).toBeNull();
  });
});

describe('prepararManifest: región sin campos nuevos que no es Marbella', () => {
  it('no inventa nada: origen en el centro del bbox, sin normas ni atribución de legado', () => {
    const m = prepararManifest(base(), 'prueba');
    expect(m.region).toEqual({ id: 'prueba', nombre: 'prueba', origen: { lat: 38, lon: 0 }, etiqueta_origen: 'del centro de la zona' });
    expect(m.normas_legado).toEqual([]);
    expect(m.atribuciones).toEqual({ mapa: '', fuentes: { osm: 'OpenStreetMap' } });
  });
});

describe('prepararManifest: campos nuevos', () => {
  const legal = { ccaa: [
    { id: 'comunitat_valenciana', nombre: 'Comunitat Valenciana', norma: 'DOGV', cupo_kg_dia: 2, texto: 'T', verificado: false, fuente_url: 'javascript:alert(1)' },
    { id: 'region_murcia', nombre: 'Región de Murcia', norma: 'BORM', cupo_kg_dia: null, texto: 'U', verificado: true, fuente_url: 'https://www.borm.es/x' },
    { id: 'galicia', nombre: 'X', norma: 'DOG', cupo_kg_dia: 1, texto: 'V', verificado: true, fuente_url: '' },
  ], texto_protegido: 'Puede haber limitaciones propias; consulta su PRUG.', chip_sitio_restringido: 'Espacio protegido: consulta sus normas' };
  const m = prepararManifest(base({ region: { id: 'alicante', nombre: 'Alicante', origen: { lat: 38.3452, lon: -0.481 }, etiqueta_origen: 'de Alicante' },
    legal, atribuciones: { mapa: 'ICV CC BY 4.0', fuentes: { icv: 'Institut Cartogràfic Valencià' } }, ccaa: 'ccaa.pmtiles', avisos: ['MFE de Murcia sin datos', 7] }), 'alicante');
  it('separa las especies sin hábitat', () => {
    expect(m.especies.map((e) => e.id)).toEqual(['a', 'c']);
    expect(m.especies_sin_habitat.map((e) => e.id)).toEqual(['b']);
  });
  it('valida la normativa: quita CCAA fuera de la lista cerrada, URLs no https y el cupo no verificado', () => {
    expect(m.legal.map((e) => e.id)).toEqual(['comunitat_valenciana', 'region_murcia']);
    expect(m.legal[0]).toMatchObject({ fuente_url: '', cupo_kg_dia: null, verificado: false });
    expect(m.legal[1]).toMatchObject({ fuente_url: 'https://www.borm.es/x', verificado: true });
    expect(m.texto_protegido).toBe('Puede haber limitaciones propias; consulta su PRUG.');
    expect(m.normas_legado).toEqual([]);
  });
  it('región, atribuciones, ccaa y avisos (solo textos)', () => {
    expect(m.region.etiqueta_origen).toBe('de Alicante');
    expect(m.atribuciones.fuentes).toEqual({ osm: 'OpenStreetMap', icv: 'Institut Cartogràfic Valencià' });
    expect(m.ccaa).toBe('ccaa.pmtiles');
    expect(m.avisos).toEqual(['MFE de Murcia sin datos']);
  });
  it('una región del manifest con id distinto del pedido se rechaza (índice y manifest desalineados)', () => {
    expect(() => prepararManifest(base({ region: { id: 'otra', nombre: 'O', origen: { lat: 0, lon: 0 }, etiqueta_origen: 'de O' } }), 'alicante'))
      .toThrow(/no coincide/);
  });
});

describe('nombreFuente', () => {
  it('nombre legible, osm por defecto y guion si no hay fuente', () => {
    expect(nombreFuente('rediam', LEGADO_MARBELLA.atribuciones.fuentes)).toBe('REDIAM (Junta de Andalucía)');
    expect(nombreFuente('osm', {})).toBe('OpenStreetMap');
    expect(nombreFuente('icv', {})).toBe('icv');
    expect(nombreFuente('', {})).toBe('—');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/manifest-region.test.ts`
Expected: FAIL, «Failed to resolve import "./manifest-region"».

- [x] **Step 3: Write minimal implementation**

`app/src/tipos.ts`. Sustituye la línea de `Especie` y añade los campos al final de `Manifest`, antes de `archivos`:
```ts
export interface Especie { id: string; nombre: string; tiempo?: Reglas; fiabilidad?: Fiabilidad; sin_habitat?: boolean }
```
```ts
  /** Multi-región (contrato en docs/superpowers/plans/2026-10-15-multi-region-fase-b-app.md). Validados en manifest-region.ts. */
  region?: unknown;
  legal?: unknown;
  atribuciones?: unknown;
  /** PMTiles de comunidades autónomas (capa 'ccaa', propiedades id y nombre). */
  ccaa?: string | null;
  avisos?: unknown;
```

`app/src/manifest-region.ts`:
```ts
// Campos multi-región del manifest (región, normativa por CCAA, atribuciones, avisos, especies sin hábitat) ya
// validados, con los textos de legado de Marbella para los manifests anteriores a la fase B. Sin DOM.
import type { Especie, Manifest } from './tipos';

export type IdCcaa = 'andalucia' | 'comunitat_valenciana' | 'region_murcia' | 'castilla_la_mancha';
export const IDS_CCAA: readonly IdCcaa[] = ['andalucia', 'comunitat_valenciana', 'region_murcia', 'castilla_la_mancha'];

export interface RegionManifest { id: string; nombre: string; origen: { lat: number; lon: number }; etiqueta_origen: string }
export interface EntradaLegal { id: IdCcaa; nombre: string; norma: string; cupo_kg_dia: number | null; texto: string; verificado: boolean; fuente_url: string }
export interface Atribuciones { mapa: string; fuentes: Record<string, string> }
export interface ManifestApp extends Manifest {
  region: RegionManifest;
  legal: EntradaLegal[];
  texto_protegido: string;
  chip_sitio_restringido: string;
  atribuciones: Atribuciones;
  /** Normas de la nota «orientativa» cuando el manifest no trae `legal` (solo el legado de Marbella: BOJA). */
  normas_legado: string[];
  avisos: string[];
  /** Especies de la región sin hábitat: fuera de `especies` (que ya solo trae las activas). */
  especies_sin_habitat: Especie[];
}

const TEXTO_PROTEGIDO = 'Consulta la normativa de recolección del espacio.';
const CHIP_RESTRINGIDO = 'Recoger aquí exige autorización';
const OSM = { osm: 'OpenStreetMap' };

/** Lo que hoy está fijo en el código para Marbella (mapa.ts, index.html, ranking.ts, restricciones.ts, hoy-ui.ts). */
export const LEGADO_MARBELLA = {
  region: { id: 'marbella', nombre: 'Marbella', origen: { lat: 36.5101, lon: -4.8825 }, etiqueta_origen: 'de Marbella' } as RegionManifest,
  atribuciones: { mapa: 'IGN CC BY 4.0, © MITECO MFE, IGME, REDIAM CC BY 4.0, © OpenStreetMap ODbL, Protomaps',
    fuentes: { rediam: 'REDIAM (Junta de Andalucía)', ...OSM } } as Atribuciones,
  texto_protegido: TEXTO_PROTEGIDO,
  chip_sitio_restringido: CHIP_RESTRINGIDO,
  normas: ['BOJA'],
};

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);
const txt = (v: unknown, def = '') => (typeof v === 'string' ? v.trim() : def);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function region(v: unknown, id: string, bbox: Manifest['bbox']): RegionManifest {
  const r = obj(v), o = obj(r?.origen);
  if (r) {
    if (r.id !== id) throw new Error(`La región del manifest (${String(r.id)}) no coincide con la pedida (${id})`);
    const lat = num(o?.lat), lon = num(o?.lon);
    if (lat !== null && lon !== null) return { id, nombre: txt(r.nombre, id), origen: { lat, lon }, etiqueta_origen: txt(r.etiqueta_origen) };
  }
  if (id === 'marbella') return { ...LEGADO_MARBELLA.region };
  return { id, nombre: id, origen: { lat: (bbox[1] + bbox[3]) / 2, lon: (bbox[0] + bbox[2]) / 2 }, etiqueta_origen: 'del centro de la zona' };
}

function entradaLegal(v: unknown): EntradaLegal | null {
  const e = obj(v);
  if (!e || !IDS_CCAA.includes(e.id as IdCcaa) || !txt(e.texto)) return null;
  const verificado = e.verificado === true;
  const url = txt(e.fuente_url);
  return { id: e.id as IdCcaa, nombre: txt(e.nombre, String(e.id)), norma: txt(e.norma), texto: txt(e.texto), verificado,
    // Spec §1.5: un cupo sin cotejar no se enseña nunca.
    cupo_kg_dia: verificado ? num(e.cupo_kg_dia) : null,
    fuente_url: /^https:\/\//.test(url) ? url : '' };
}

export function prepararManifest(m: Manifest, idRegion: string): ManifestApp {
  const legadoMarbella = idRegion === 'marbella';
  const legal = obj(m.legal);
  const atr = obj(m.atribuciones);
  const fuentesAtr = obj(atr?.fuentes) ?? {};
  const fuentes: Record<string, string> = atr ? { ...OSM } : legadoMarbella ? { ...LEGADO_MARBELLA.atribuciones.fuentes } : { ...OSM };
  for (const [k, v] of Object.entries(fuentesAtr)) if (typeof v === 'string') fuentes[k] = v;
  const entradas = Array.isArray(legal?.ccaa) ? legal.ccaa.map(entradaLegal).filter((e): e is EntradaLegal => !!e) : [];
  return {
    ...m,
    especies: m.especies.filter((e) => !e.sin_habitat),
    especies_sin_habitat: m.especies.filter((e) => e.sin_habitat),
    region: region(m.region, idRegion, m.bbox),
    legal: entradas,
    texto_protegido: txt(legal?.texto_protegido) || TEXTO_PROTEGIDO,
    chip_sitio_restringido: txt(legal?.chip_sitio_restringido) || CHIP_RESTRINGIDO,
    atribuciones: { mapa: atr ? txt(atr.mapa) : legadoMarbella ? LEGADO_MARBELLA.atribuciones.mapa : '', fuentes },
    normas_legado: !legal && legadoMarbella ? [...LEGADO_MARBELLA.normas] : [],
    avisos: Array.isArray(m.avisos) ? m.avisos.filter((a): a is string => typeof a === 'string' && a.trim() !== '') : [],
    ccaa: typeof m.ccaa === 'string' && m.ccaa ? m.ccaa : null,
  };
}

/** Nombre legible del valor `fuente` de una entidad (rutas.pmtiles). */
export function nombreFuente(f: string, fuentes: Record<string, string>): string {
  return fuentes[f] ?? (f === 'osm' ? 'OpenStreetMap' : f || '—');
}
```
Nota: `texto_protegido` y `chip_sitio_restringido` usan por defecto el texto genérico de hoy en todas las regiones. No es un dato de Marbella: es el aviso neutro que ya se enseña.

- [x] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/manifest-region.test.ts && npx tsc --noEmit`
Expected: PASS y `tsc` sin errores.

- [x] **Step 5: Commit**

```bash
git add app/src/manifest-region.ts app/src/manifest-region.test.ts app/src/tipos.ts
git commit -m "feat(app): contrato multi-región del manifest con legado de Marbella

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Región activa (`region.ts`) y `unidades.ts`

**Files:**
- Create: `app/src/region.ts`
- Create: `app/src/region.test.ts`
- Create: `app/src/unidades.ts`
- Modify: `app/src/datos.ts` (re-exporta `mb` desde `unidades.ts`; el resto cambia en la tarea 7)

**Interfaces:**
- Consumes: `distanciaM(a, b)` de `app/src/ranking.ts` (ya existe).
- Produces:
```ts
export interface Punto { lat: number; lon: number }
export interface RegionIndice { id: string; nombre: string; origen: Punto; bbox: [number, number, number, number]; total_bytes: number; generado: string }
export interface Almacen { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export const CLAVE_REGION = 'setas:region';
export const CLAVE_REGIONES = 'setas:regiones';
export const ID_REGION: RegExp;                       // /^[a-z][a-z0-9_-]{0,31}$/
export function parsearRegiones(j: unknown): RegionIndice[];
export function regionMasCercana(rs: RegionIndice[], p: Punto): RegionIndice;
export function establecerActiva(id: string): void;
export function hayRegionActiva(): boolean;
export function regionActiva(): string;               // lanza si no hay
export function claveRegion(nombre: string, region?: string): string;   // `setas:${nombre}:${region}`
export function raizDatos(): string;                  // URL absoluta de data/ (o 'data/' sin document)
export function baseDatos(region?: string): string;   // raizDatos() + region + '/'
export function cargarRegiones(o?: { fetchFn?: typeof fetch; almacen?: Almacen; raiz?: string }): Promise<RegionIndice[]>;
export function resolverRegion(rs: RegionIndice[], o: { almacen: Almacen; posicion: () => Promise<Punto | null>; preguntar: (rs: RegionIndice[]) => Promise<string | null> }): Promise<string | null>;
export function textoEstadoRegion(r: RegionIndice, est: { bytes: number } | null, enLinea: boolean): string;
```
`app/src/unidades.ts`: `export const mb = (b: number) => \`${Math.round(b / 1e6)} MB\`;`

- [x] **Step 1: Write the failing test**

`app/src/region.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { baseDatos, CLAVE_REGION, CLAVE_REGIONES, cargarRegiones, claveRegion, establecerActiva, parsearRegiones, regionMasCercana,
  resolverRegion, textoEstadoRegion, type Almacen, type RegionIndice } from './region';

class Memoria implements Almacen {
  d = new Map<string, string>();
  getItem(k: string) { return this.d.get(k) ?? null; }
  setItem(k: string, v: string) { this.d.set(k, v); }
  removeItem(k: string) { this.d.delete(k); }
}
const reg = (id: string, lat: number, lon: number): RegionIndice =>
  ({ id, nombre: id[0].toUpperCase() + id.slice(1), origen: { lat, lon }, bbox: [lon - 1, lat - 1, lon + 1, lat + 1], total_bytes: 185e6, generado: 'G' });
const MARBELLA = reg('marbella', 36.5101, -4.8825), ALICANTE = reg('alicante', 38.3452, -0.481);

describe('parsearRegiones', () => {
  it('acepta las válidas y descarta ids peligrosos, reservados, repetidos o datos rotos', () => {
    const rs = parsearRegiones([MARBELLA, { ...ALICANTE, id: '../x' }, { ...ALICANTE, id: 'modelo' }, MARBELLA,
      { ...ALICANTE, origen: { lat: 'x', lon: 0 } }, { ...ALICANTE, bbox: [1, 2] }, ALICANTE, null]);
    expect(rs.map((r) => r.id)).toEqual(['marbella', 'alicante']);
    expect(parsearRegiones({ no: 'lista' })).toEqual([]);
  });
});

describe('regionMasCercana', () => {
  it('elige por distancia al origen', () => {
    expect(regionMasCercana([MARBELLA, ALICANTE], { lat: 38.7, lon: -0.5 }).id).toBe('alicante');
    expect(regionMasCercana([MARBELLA, ALICANTE], { lat: 36.6, lon: -5.2 }).id).toBe('marbella');
  });
});

describe('claves y rutas por región', () => {
  it('claveRegion y baseDatos usan la región activa', () => {
    establecerActiva('alicante');
    expect(claveRegion('capa')).toBe('setas:capa:alicante');
    expect(claveRegion('punto-meteo', 'marbella')).toBe('setas:punto-meteo:marbella');
    expect(baseDatos()).toMatch(/data\/alicante\/$/);
  });
  it('establecerActiva rechaza ids no válidos', () => {
    expect(() => establecerActiva('../mapas')).toThrow(/región/);
  });
});

describe('cargarRegiones', () => {
  let a: Memoria;
  beforeEach(() => { a = new Memoria(); });
  it('con red guarda una copia; sin red la usa', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify([MARBELLA, ALICANTE])));
    expect((await cargarRegiones({ fetchFn: ok as any, almacen: a, raiz: 'data/' })).length).toBe(2);
    expect(ok).toHaveBeenCalledWith('data/regiones.json', { cache: 'no-cache' });
    const caida = vi.fn(async () => { throw new TypeError('sin red'); });
    expect((await cargarRegiones({ fetchFn: caida as any, almacen: a, raiz: 'data/' })).map((r) => r.id)).toEqual(['marbella', 'alicante']);
  });
  it('404 sin copia: lista vacía', async () => {
    const no = vi.fn(async () => new Response('', { status: 404 }));
    expect(await cargarRegiones({ fetchFn: no as any, almacen: a, raiz: 'data/' })).toEqual([]);
    expect(a.getItem(CLAVE_REGIONES)).toBeNull();
  });
});

describe('resolverRegion', () => {
  const nunca = async () => { throw new Error('no debería preguntar'); };
  it('respeta la guardada si sigue existiendo', async () => {
    const a = new Memoria(); a.setItem(CLAVE_REGION, 'alicante');
    expect(await resolverRegion([MARBELLA, ALICANTE], { almacen: a, posicion: async () => null, preguntar: nunca })).toBe('alicante');
  });
  it('una sola región: sin GPS ni pregunta', async () => {
    const a = new Memoria(); const pos = vi.fn(async () => null);
    expect(await resolverRegion([MARBELLA], { almacen: a, posicion: pos, preguntar: nunca })).toBe('marbella');
    expect(pos).not.toHaveBeenCalled();
    expect(a.getItem(CLAVE_REGION)).toBe('marbella');
  });
  it('guardada que ya no existe (spec §6) → GPS → la más cercana', async () => {
    const a = new Memoria(); a.setItem(CLAVE_REGION, 'desaparecida');
    expect(await resolverRegion([MARBELLA, ALICANTE], { almacen: a, posicion: async () => ({ lat: 38.5, lon: -0.6 }), preguntar: nunca })).toBe('alicante');
  });
  it('sin GPS pregunta; si la respuesta no vale, la primera', async () => {
    const a = new Memoria();
    expect(await resolverRegion([MARBELLA, ALICANTE], { almacen: a, posicion: async () => null, preguntar: async () => 'alicante' })).toBe('alicante');
    const b = new Memoria();
    expect(await resolverRegion([MARBELLA, ALICANTE], { almacen: b, posicion: async () => null, preguntar: async () => null })).toBe('marbella');
  });
  it('sin regiones: null', async () => {
    expect(await resolverRegion([], { almacen: new Memoria(), posicion: async () => null, preguntar: nunca })).toBeNull();
  });
});

describe('textoEstadoRegion', () => {
  it('descargada, sin descargar con y sin conexión', () => {
    expect(textoEstadoRegion(MARBELLA, { bytes: 184e6 }, true)).toBe('Descargada · 184 MB');
    expect(textoEstadoRegion(MARBELLA, null, true)).toBe('Sin descargar · 185 MB');
    expect(textoEstadoRegion(MARBELLA, null, false)).toBe('Sin descargar · necesita conexión');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/region.test.ts`
Expected: FAIL, «Failed to resolve import "./region"».

- [x] **Step 3: Write minimal implementation**

`app/src/unidades.ts`:
```ts
export const mb = (b: number) => `${Math.round(b / 1e6)} MB`;
```
`app/src/datos.ts`: sustituye la última línea (`export const mb = …`) por `export { mb } from './unidades';`.

`app/src/region.ts`:
```ts
// Región activa (spec §4.1): índice data/regiones.json, elección inicial (GPS → la más cercana; sin GPS, se pregunta),
// claves de almacenamiento por región y base de las URLs de datos. Sin DOM salvo document.baseURI (si existe).
import { distanciaM } from './ranking';
import { mb } from './unidades';

export interface Punto { lat: number; lon: number }
export interface RegionIndice { id: string; nombre: string; origen: Punto; bbox: [number, number, number, number]; total_bytes: number; generado: string }
export interface Almacen { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export const CLAVE_REGION = 'setas:region';
export const CLAVE_REGIONES = 'setas:regiones';
/** Entra en URLs y en rutas de OPFS: sin barras, puntos ni mayúsculas. 'modelo' está reservado (data/modelo/). */
export const ID_REGION = /^[a-z][a-z0-9_-]{0,31}$/;
const idValido = (id: unknown): id is string => typeof id === 'string' && ID_REGION.test(id) && id !== 'modelo';
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function parsearRegiones(j: unknown): RegionIndice[] {
  if (!Array.isArray(j)) return [];
  const r: RegionIndice[] = [];
  for (const x of j) {
    const o = x as RegionIndice | null;
    if (!o || !idValido(o.id) || r.some((y) => y.id === o.id)) continue;
    if (!fin(o.origen?.lat) || !fin(o.origen?.lon) || !Array.isArray(o.bbox) || o.bbox.length !== 4 || !o.bbox.every(fin)) continue;
    r.push({ id: o.id, nombre: typeof o.nombre === 'string' && o.nombre ? o.nombre : o.id, origen: { lat: o.origen.lat, lon: o.origen.lon },
      bbox: [o.bbox[0], o.bbox[1], o.bbox[2], o.bbox[3]], total_bytes: fin(o.total_bytes) ? o.total_bytes : 0,
      generado: typeof o.generado === 'string' ? o.generado : '' });
  }
  return r;
}

export function regionMasCercana(rs: RegionIndice[], p: Punto): RegionIndice {
  return rs.reduce((a, b) => (distanciaM(p, b.origen) < distanciaM(p, a.origen) ? b : a));
}

let activa: string | null = null;
export function establecerActiva(id: string) {
  if (!idValido(id)) throw new Error(`Id de región no válido: ${id}`);
  activa = id;
}
export const hayRegionActiva = () => activa !== null;
export function regionActiva(): string {
  if (!activa) throw new Error('Todavía no hay región activa');
  return activa;
}
export const claveRegion = (nombre: string, region = regionActiva()) => `setas:${nombre}:${region}`;
export const raizDatos = () => (typeof document !== 'undefined' ? new URL('data/', document.baseURI).href : 'data/');
export const baseDatos = (region = regionActiva()) => `${raizDatos()}${region}/`;

const leer = (a: Almacen, k: string) => { try { return a.getItem(k); } catch { return null; } };
const escribir = (a: Almacen, k: string, v: string) => { try { a.setItem(k, v); } catch { /* solo esta sesión */ } };

/** Índice de regiones: de la red (y se guarda una copia para usarlo sin conexión) o, si no hay red, la copia. */
export async function cargarRegiones(o: { fetchFn?: typeof fetch; almacen?: Almacen; raiz?: string } = {}): Promise<RegionIndice[]> {
  const almacen = o.almacen ?? localStorage;
  try {
    const r = await (o.fetchFn ?? fetch)((o.raiz ?? raizDatos()) + 'regiones.json', { cache: 'no-cache' });
    if (r.ok) {
      const rs = parsearRegiones(await r.json());
      if (rs.length) { escribir(almacen, CLAVE_REGIONES, JSON.stringify(rs)); return rs; }
    }
  } catch { /* sin red */ }
  try { return parsearRegiones(JSON.parse(leer(almacen, CLAVE_REGIONES) ?? 'null')); } catch { return []; }
}

/** Región con la que arrancar: la guardada si sigue en el índice; si no, la única, la más cercana por GPS o la que se elija. */
export async function resolverRegion(rs: RegionIndice[], o: {
  almacen: Almacen; posicion: () => Promise<Punto | null>; preguntar: (rs: RegionIndice[]) => Promise<string | null>;
}): Promise<string | null> {
  if (!rs.length) return null;
  const guardada = leer(o.almacen, CLAVE_REGION);
  if (guardada && rs.some((r) => r.id === guardada)) return guardada;
  let id: string | null;
  if (rs.length === 1) id = rs[0].id;
  else {
    const p = await o.posicion().catch(() => null);
    id = p ? regionMasCercana(rs, p).id : await o.preguntar(rs);
  }
  if (!id || !rs.some((r) => r.id === id)) id = rs[0].id;
  escribir(o.almacen, CLAVE_REGION, id);
  return id;
}

export function textoEstadoRegion(r: RegionIndice, est: { bytes: number } | null, enLinea: boolean): string {
  if (est) return `Descargada · ${mb(est.bytes)}`;
  return enLinea ? `Sin descargar · ${mb(r.total_bytes)}` : 'Sin descargar · necesita conexión';
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/region.test.ts && npx tsc --noEmit`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add app/src/region.ts app/src/region.test.ts app/src/unidades.ts app/src/datos.ts
git commit -m "feat(app): región activa, índice de regiones y claves por región

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: OPFS por región (rutas anidadas, worker de descarga, paquete de mapas)

**Files:**
- Create: `app/src/opfs-rutas.ts`
- Create: `app/src/opfs-falso.ts`
- Create: `app/src/opfs-rutas.test.ts`
- Modify: `app/src/descarga.worker.ts` (funciones `descargar` y `mover`)
- Modify: `app/src/opfs.ts` (paquete `MAPAS` → `paqueteMapas(region)`, `archivoDe`, `descargarPaquete`, `borrarPaquete`, exports)
- Modify: `app/src/opfs.test.ts` (nombres de paquete)

**Interfaces:**
- Consumes: `regionActiva()` de la tarea 4.
- Produces:
```ts
// opfs-rutas.ts
export function partes(ruta: string): string[];   // lanza con '', '.', '..'
export function dirDe(raiz: FileSystemDirectoryHandle, ruta: string, crear?: boolean): Promise<FileSystemDirectoryHandle>;
export function quitarRuta(raiz: FileSystemDirectoryHandle, ruta: string): Promise<void>;  // recursivo; luego quita los padres que queden vacíos
// opfs.ts (las firmas cambian; el modelo sigue igual)
export function paqueteMapas(region: string): { clave: string; claveStaging: string; dir: string; dirNuevo: string };
export const estadoDescarga: (region?: string) => EstadoDescarga | null;
export const archivoOpfs: (nombre: string, region?: string) => Promise<File | null>;
export const descargarMapas: (m: Manifest, region: string, base: string, alAvanzar: (hecho: number, total: number) => void) => Promise<{ estado: EstadoDescarga; persistente: boolean }>;
export const borrarMapas: (region?: string) => Promise<void>;
// opfs-falso.ts (solo tests)
export class DirFalso { … } ; export class ArchivoFalso { … }; export function raizFalsa(): DirFalso;
```
Claves y carpetas: `setas:mapas-descargados:<r>`, `setas:mapas-nuevo-generado:<r>`, `mapas/<r>`, `mapas-nuevo/<r>`.

- [x] **Step 1: Write the failing test**

`app/src/opfs-falso.ts`:
```ts
// OPFS en memoria para vitest (entorno node): lo justo de FileSystemDirectoryHandle/FileSystemFileHandle.
const noEsta = (n: string) => Object.assign(new Error(`NotFoundError: ${n}`), { name: 'NotFoundError' });

export class ArchivoFalso {
  readonly kind = 'file';
  constructor(public name: string, public padre: DirFalso, public datos: Uint8Array = new Uint8Array()) {}
  async getFile() { return new File([this.datos], this.name); }
  async move(destino: DirFalso, nombre: string) {
    this.padre.entradas.delete(this.name);
    this.name = nombre; this.padre = destino;
    destino.entradas.set(nombre, this);
  }
}

export class DirFalso {
  readonly kind = 'directory';
  entradas = new Map<string, ArchivoFalso | DirFalso>();
  constructor(public name = '') {}
  async getDirectoryHandle(n: string, o: { create?: boolean } = {}) {
    const e = this.entradas.get(n);
    if (e instanceof DirFalso) return e;
    if (e) throw Object.assign(new Error('TypeMismatchError'), { name: 'TypeMismatchError' });
    if (!o.create) throw noEsta(n);
    const d = new DirFalso(n); this.entradas.set(n, d); return d;
  }
  async getFileHandle(n: string, o: { create?: boolean } = {}) {
    const e = this.entradas.get(n);
    if (e instanceof ArchivoFalso) return e;
    if (e) throw Object.assign(new Error('TypeMismatchError'), { name: 'TypeMismatchError' });
    if (!o.create) throw noEsta(n);
    const f = new ArchivoFalso(n, this); this.entradas.set(n, f); return f;
  }
  async removeEntry(n: string, o: { recursive?: boolean } = {}) {
    const e = this.entradas.get(n);
    if (!e) throw noEsta(n);
    if (e instanceof DirFalso && e.entradas.size && !o.recursive) throw Object.assign(new Error('InvalidModificationError'), { name: 'InvalidModificationError' });
    this.entradas.delete(n);
  }
  async *entries(): AsyncIterable<[string, ArchivoFalso | DirFalso]> { for (const x of [...this.entradas]) yield x; }
  async *keys(): AsyncIterable<string> { for (const k of [...this.entradas.keys()]) yield k; }
  /** Ayuda de test: escribe un archivo en una ruta 'a/b/c.txt'. */
  async escribir(ruta: string, texto: string) {
    const p = ruta.split('/'); let d: DirFalso = this;
    for (const x of p.slice(0, -1)) d = await d.getDirectoryHandle(x, { create: true });
    (await d.getFileHandle(p.at(-1)!, { create: true })).datos = new TextEncoder().encode(texto);
  }
  /** Ayuda de test: lista de rutas de archivos bajo este directorio. */
  arbol(prefijo = ''): string[] {
    return [...this.entradas].flatMap(([k, v]) => (v instanceof DirFalso ? v.arbol(`${prefijo}${k}/`) : [`${prefijo}${k}`])).sort();
  }
}
export const raizFalsa = () => new DirFalso();
```

`app/src/opfs-rutas.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { dirDe, partes, quitarRuta } from './opfs-rutas';
import { raizFalsa } from './opfs-falso';

const comoRaiz = (d: unknown) => d as FileSystemDirectoryHandle;

describe('opfs-rutas', () => {
  it('partes rechaza rutas vacías o con . y ..', () => {
    expect(partes('mapas/marbella')).toEqual(['mapas', 'marbella']);
    for (const r of ['', '/', 'mapas/../x', './mapas']) expect(() => partes(r), r).toThrow(/Ruta OPFS/);
  });
  it('dirDe crea la cadena y la reutiliza', async () => {
    const raiz = raizFalsa();
    const d = await dirDe(comoRaiz(raiz), 'mapas-nuevo/alicante', true);
    expect(await dirDe(comoRaiz(raiz), 'mapas-nuevo/alicante')).toBe(d);
    await expect(dirDe(comoRaiz(raiz), 'mapas/alicante')).rejects.toThrow(/NotFound/);
  });
  it('quitarRuta borra la región y el padre solo si queda vacío', async () => {
    const raiz = raizFalsa();
    await raiz.escribir('mapas-nuevo/marbella/a.pmtiles', 'x');
    await raiz.escribir('mapas/marbella/a.pmtiles', 'x');
    await raiz.escribir('mapas/alicante/b.pmtiles', 'y');
    await quitarRuta(comoRaiz(raiz), 'mapas-nuevo/marbella');
    expect([...raiz.entradas.keys()]).toEqual(['mapas']);
    await quitarRuta(comoRaiz(raiz), 'mapas/marbella');
    expect(raiz.arbol()).toEqual(['mapas/alicante/b.pmtiles']);
    await quitarRuta(comoRaiz(raiz), 'mapas/no-existe');   // no lanza
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/opfs-rutas.test.ts`
Expected: FAIL, «Failed to resolve import "./opfs-rutas"».

- [x] **Step 3: Write minimal implementation**

`app/src/opfs-rutas.ts`:
```ts
// Rutas anidadas en OPFS ('mapas/marbella'): getDirectoryHandle solo acepta un nombre por llamada.
// Lo usan opfs.ts (hilo principal) y descarga.worker.ts.
export function partes(ruta: string): string[] {
  const p = ruta.split('/').filter(Boolean);
  if (!p.length || p.some((x) => x === '.' || x === '..')) throw new Error(`Ruta OPFS no válida: ${ruta}`);
  return p;
}

export async function dirDe(raiz: FileSystemDirectoryHandle, ruta: string, crear = false): Promise<FileSystemDirectoryHandle> {
  let d = raiz;
  for (const x of partes(ruta)) d = await d.getDirectoryHandle(x, { create: crear });
  return d;
}

/** Borra la última entrada de la ruta (recursiva) y después los padres que hayan quedado vacíos. Nunca lanza. */
export async function quitarRuta(raiz: FileSystemDirectoryHandle, ruta: string): Promise<void> {
  const p = partes(ruta);
  const cadena: FileSystemDirectoryHandle[] = [raiz];
  try { for (const x of p.slice(0, -1)) cadena.push(await cadena[cadena.length - 1].getDirectoryHandle(x)); } catch { return; }
  await cadena[cadena.length - 1].removeEntry(p[p.length - 1], { recursive: true }).catch(() => {});
  // Sin `recursive`, removeEntry falla si el directorio no está vacío: así solo caen los vacíos.
  for (let i = p.length - 2; i >= 0; i--) {
    try { await cadena[i].removeEntry(p[i]); } catch { break; }
  }
}
```

`app/src/descarga.worker.ts`. Añade `import { dirDe } from './opfs-rutas';` tras la referencia `/// <reference lib="webworker" />`. Luego:
- en `descargar`: `const dir = await dirDe(raiz, dirNombre, true);` (en lugar de `raiz.getDirectoryHandle(dirNombre, { create: true })`);
- en `mover`: `const origen = await dirDe(raiz, desde);` y `const destino = await dirDe(raiz, hacia, true);`;
- en el bucle de «sobran» de `mover`, quita solo **archivos** (`for await (const [n, h] of (destino as any).entries()) if (h.kind === 'file' && !quedan.has(n)) sobran.push(n);`), para no borrar subcarpetas por accidente. Ajusta el comentario de cabecera: «dir/desde/hacia admiten rutas 'mapas/<region>'».

`app/src/opfs.ts`. Cambios:
```ts
import type { Manifest, PaqueteModelo } from './tipos';
import { regionActiva } from './region';
import { dirDe, quitarRuta } from './opfs-rutas';

interface Paquete { clave: string; claveStaging: string; dir: string; dirNuevo: string }
/** Mapas de una región: staging en mapas-nuevo/<region>, definitivos en mapas/<region>. */
export const paqueteMapas = (region: string): Paquete => ({
  clave: `setas:mapas-descargados:${region}`, claveStaging: `setas:mapas-nuevo-generado:${region}`,
  dir: `mapas/${region}`, dirNuevo: `mapas-nuevo/${region}`,
});
const MODELO: Paquete = { clave: 'setas:modelo-descargado', claveStaging: 'setas:modelo-nuevo-version', dir: 'modelo', dirNuevo: 'modelo-nuevo' };
```
- `export const estadoDescarga = (region = regionActiva()) => estadoDe(paqueteMapas(region));`
- en `archivoDe`: `const f = await (await (await dirDe(raiz, p.dir)).getFileHandle(nombre)).getFile();`
- `export const archivoOpfs = (nombre: string, region = regionActiva()) => archivoDe(paqueteMapas(region), nombre);`
- en `descargarPaquete`: `borrarStaging` pasa a `await quitarRuta(raiz, p.dirNuevo); localStorage.removeItem(p.claveStaging);` y `const nuevo = await dirDe(raiz, p.dirNuevo, true);`
- `export const descargarMapas = (m: Manifest, region: string, base: string, alAvanzar: (hecho: number, total: number) => void) => descargarPaquete(paqueteMapas(region), m.generado, [...m.archivos, { nombre: 'manifest.json', bytes: 0 }], m.total_bytes, base, alAvanzar);`
- `borrarPaquete`: `await quitarRuta(raiz, p.dir); await quitarRuta(raiz, p.dirNuevo);` (en lugar de los dos `removeEntry`).
- `export const borrarMapas = (region = regionActiva()) => borrarPaquete(paqueteMapas(region));`

`quitarRuta('modelo')` borra `modelo` igual que antes: una ruta de un solo nivel no tiene padres.

Añade a `app/src/opfs.test.ts`:
```ts
import { paqueteMapas } from './opfs';
describe('paqueteMapas', () => {
  it('claves y carpetas por región', () => {
    expect(paqueteMapas('alicante')).toEqual({ clave: 'setas:mapas-descargados:alicante', claveStaging: 'setas:mapas-nuevo-generado:alicante',
      dir: 'mapas/alicante', dirNuevo: 'mapas-nuevo/alicante' });
  });
});
```
(junta el import con el existente de `./opfs`).

- [x] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/opfs-rutas.test.ts src/opfs.test.ts`
Expected: PASS. `npx tsc --noEmit` todavía falla en `main.ts`, `mapa.ts`, `datos.ts`, `acceso-datos.ts` y `reconocer-ui.ts` (firmas nuevas). Lo arregla la tarea 7, que va inmediatamente después de la 6. Las tareas 5, 6 y 7 se revisan juntas antes de seguir.

- [x] **Step 5: Commit**

```bash
git add app/src/opfs-rutas.ts app/src/opfs-rutas.test.ts app/src/opfs-falso.ts app/src/descarga.worker.ts app/src/opfs.ts app/src/opfs.test.ts
git commit -m "feat(app): OPFS por región (mapas/<region>, mapas-nuevo/<region>)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Migración de la instalación plana a `marbella` y caché de meteo por región

**Files:**
- Create: `app/src/migracion.ts`
- Create: `app/src/migracion.test.ts`
- Modify: `app/src/meteo.ts:121-146` (caché con clave, `renombrarCache`, opción `clave` en `obtener`)
- Modify: `app/src/meteo.test.ts` (test de `claveMeteo` y de la clave obligatoria)

**Interfaces:**
- Consumes: `paqueteMapas` (tarea 5), `Almacen` (tarea 4), `DirFalso` (tarea 5).
- Produces:
```ts
// migracion.ts
export const CLAVE_MIGRACION = 'setas:migracion-regiones';
export interface DepsMigracion {
  almacen: Almacen;
  raiz: () => Promise<FileSystemDirectoryHandle | null>;
  /** Mueve archivos con el worker de descarga (orden 'mover'). */
  moverArchivos: (desde: string, hacia: string, nombres: string[]) => Promise<void>;
  renombrarMeteo: (de: string, a: string) => Promise<void>;
}
export type ResultadoMigracion = 'hecha-antes' | 'sin-instalacion' | 'migrada';
export function migrarARegiones(d: DepsMigracion): Promise<ResultadoMigracion>;
// meteo.ts
export const claveMeteo: (region: string) => string;          // 'datos:' + region
export const leerCache: (clave: string) => Promise<DatosMeteo | null>;
export const guardarCache: (d: DatosMeteo, clave: string) => Promise<void>;
export function renombrarCache(de: string, a: string): Promise<void>;
// obtener(puntos, { …, clave?: string }): sin `leer`/`guardar` exige `clave`
```
Comportamiento (spec §4.3), una sola vez (marca `setas:migracion-regiones = '1'`):
1. `setas:capa` y `setas:punto-meteo` → `setas:capa:marbella` y `setas:punto-meteo:marbella`, si la nueva no existe.
2. Hay archivos sueltos en `mapas/` y existe `setas:mapas-descargados`: se mueven a `mapas/marbella/` y la clave pasa a `setas:mapas-descargados:marbella`.
3. Hay archivos sueltos en `mapas/` pero no la clave (descarga a medias): se borran esos archivos. Hay clave pero no archivos: se borra la clave.
4. Archivos sueltos en `mapas-nuevo/` y `setas:mapas-nuevo-generado`: se borran (staging antiguo).
5. Caché de meteo `datos` → `datos:marbella`.
6. Si había cualquier rastro de uso (`setas:aviso-visto`, alguna de las claves antiguas o archivos) y no hay `setas:region`: `setas:region = 'marbella'`. Antes de esta versión solo existía Marbella, así que a quien ya usaba la app no se le pide GPS ni se le pregunta.

- [ ] **Step 1: Write the failing test**

`app/src/migracion.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { CLAVE_MIGRACION, migrarARegiones, type DepsMigracion } from './migracion';
import { DirFalso, raizFalsa } from './opfs-falso';
import type { Almacen } from './region';

class Memoria implements Almacen {
  d = new Map<string, string>();
  getItem(k: string) { return this.d.get(k) ?? null; }
  setItem(k: string, v: string) { this.d.set(k, v); }
  removeItem(k: string) { this.d.delete(k); }
}

function deps(raiz: DirFalso | null, almacen = new Memoria()) {
  const meteo = vi.fn(async () => {});
  const d: DepsMigracion = {
    almacen,
    raiz: async () => raiz as unknown as FileSystemDirectoryHandle,
    // Igual que la orden 'mover' del worker, sobre el OPFS falso.
    moverArchivos: async (desde, hacia, nombres) => {
      const o = await raiz!.getDirectoryHandle(desde);
      let h: DirFalso = raiz!;
      for (const x of hacia.split('/')) h = await h.getDirectoryHandle(x, { create: true });
      for (const n of nombres) await (await o.getFileHandle(n)).move(h, n);
    },
    renombrarMeteo: meteo,
  };
  return { d, almacen, meteo };
}
const ESTADO = JSON.stringify({ fecha: 'F', bytes: 2, generado: 'G', archivos: { 'manifest.json': 1, 'base.pmtiles': 1 } });

describe('migrarARegiones', () => {
  it('instalación plana con descarga completa → mapas/marbella, claves renombradas, región marbella', async () => {
    const raiz = raizFalsa();
    await raiz.escribir('mapas/manifest.json', '{}');
    await raiz.escribir('mapas/base.pmtiles', 'x');
    await raiz.escribir('modelo/modelo.onnx', 'm');
    const { d, almacen, meteo } = deps(raiz);
    almacen.setItem('setas:mapas-descargados', ESTADO);
    almacen.setItem('setas:capa', '{"especie":"boletus_edulis","umbral":200}');
    almacen.setItem('setas:punto-meteo', '17');
    expect(await migrarARegiones(d)).toBe('migrada');
    expect(raiz.arbol()).toEqual(['mapas/marbella/base.pmtiles', 'mapas/marbella/manifest.json', 'modelo/modelo.onnx']);
    expect(almacen.getItem('setas:mapas-descargados:marbella')).toBe(ESTADO);
    expect(almacen.getItem('setas:mapas-descargados')).toBeNull();
    expect(almacen.getItem('setas:capa:marbella')).toBe('{"especie":"boletus_edulis","umbral":200}');
    expect(almacen.getItem('setas:capa')).toBeNull();
    expect(almacen.getItem('setas:punto-meteo:marbella')).toBe('17');
    expect(almacen.getItem('setas:region')).toBe('marbella');
    expect(almacen.getItem(CLAVE_MIGRACION)).toBe('1');
    expect(meteo).toHaveBeenCalledWith('datos', 'datos:marbella');
  });

  it('es idempotente: la segunda vez no toca nada', async () => {
    const raiz = raizFalsa();
    const { d, almacen } = deps(raiz);
    almacen.setItem(CLAVE_MIGRACION, '1');
    almacen.setItem('setas:capa', 'x');
    expect(await migrarARegiones(d)).toBe('hecha-antes');
    expect(almacen.getItem('setas:capa')).toBe('x');
  });

  it('descarga a medias (archivos sin clave) y staging antiguo: se borran', async () => {
    const raiz = raizFalsa();
    await raiz.escribir('mapas/base.pmtiles', 'x');
    await raiz.escribir('mapas-nuevo/base.pmtiles', 'y');
    const { d, almacen } = deps(raiz);
    almacen.setItem('setas:mapas-nuevo-generado', 'G2');
    expect(await migrarARegiones(d)).toBe('migrada');
    expect(raiz.arbol()).toEqual([]);
    expect(almacen.getItem('setas:mapas-nuevo-generado')).toBeNull();
    expect(almacen.getItem('setas:mapas-descargados:marbella')).toBeNull();
    expect(almacen.getItem('setas:region')).toBe('marbella');
  });

  it('respeta la disposición nueva: no toca subcarpetas de mapas/ ni una región ya elegida', async () => {
    const raiz = raizFalsa();
    await raiz.escribir('mapas/alicante/base.pmtiles', 'x');
    const { d, almacen } = deps(raiz);
    almacen.setItem('setas:region', 'alicante');
    almacen.setItem('setas:aviso-visto', '1');
    expect(await migrarARegiones(d)).toBe('migrada');
    expect(raiz.arbol()).toEqual(['mapas/alicante/base.pmtiles']);
    expect(almacen.getItem('setas:region')).toBe('alicante');
  });

  it('instalación nueva (nada guardado, sin OPFS): no fija región', async () => {
    const { d, almacen } = deps(null);
    expect(await migrarARegiones(d)).toBe('sin-instalacion');
    expect(almacen.getItem('setas:region')).toBeNull();
    expect(almacen.getItem(CLAVE_MIGRACION)).toBe('1');
  });
});
```

Añade a `app/src/meteo.test.ts` (junta el import con el existente):
```ts
import { claveMeteo } from './meteo';
describe('caché por región', () => {
  it('claveMeteo', () => expect(claveMeteo('alicante')).toBe('datos:alicante'));
  it('obtener sin leer/guardar ni clave lanza (no hay caché global)', async () => {
    await expect(obtener([], { enLinea: false })).rejects.toThrow(/clave/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/migracion.test.ts src/meteo.test.ts`
Expected: FAIL («Failed to resolve import "./migracion"» y `claveMeteo` no exportada).

- [ ] **Step 3: Write minimal implementation**

`app/src/meteo.ts`. Sustituye desde `// ---------------------------------------------------------------- caché` hasta el principio de `obtener`, y el arranque de `obtener`:
```ts
// ---------------------------------------------------------------- caché (IndexedDB 'setas-meteo', una entrada por región)

let almacen: ReturnType<typeof createStore> | null = null;
const tienda = () => (almacen ??= createStore('setas-meteo', 'cache'));
export const claveMeteo = (region: string) => `datos:${region}`;
export const leerCache = async (clave: string) => (await get<DatosMeteo>(clave, tienda())) ?? null;
export const guardarCache = (d: DatosMeteo, clave: string) => set(clave, d, tienda());
/** Migración: mueve la entrada `de` a `a` si `a` no existe todavía. */
export async function renombrarCache(de: string, a: string) {
  const d = await get<DatosMeteo>(de, tienda());
  if (d === undefined) return;
  if ((await get(a, tienda())) === undefined) await set(a, d, tienda());
  await del(de, tienda());
}

export interface Resultado { datos: DatosMeteo | null; origen: 'red' | 'cache' | 'ninguno'; error?: string }

/** Caché si está fresca (o no hay red); si no, consulta y guarda. Si la consulta falla, la caché que haya. */
export async function obtener(puntos: PuntoMeteo[], o: {
  forzar?: boolean; fetchFn?: Fetch; leer?: () => Promise<DatosMeteo | null>; guardar?: (d: DatosMeteo) => Promise<unknown>;
  ahora?: Date; enLinea?: boolean; clave?: string;
} = {}): Promise<Resultado> {
  if ((!o.leer || !o.guardar) && !o.clave) throw new Error('obtener: falta la clave de la caché (claveMeteo(region))');
  const leer = o.leer ?? (() => leerCache(o.clave!));
  const guardar = o.guardar ?? ((d: DatosMeteo) => guardarCache(d, o.clave!));
  const ahora = o.ahora ?? new Date();
  const enLinea = o.enLinea ?? navigator.onLine;
  const cache = await leer().catch(() => null);
```
y en el resto de `obtener` usa `guardar(d)` en lugar de `(o.guardar ?? guardarCache)(d)`. El import queda `import { createStore, del, get, set } from 'idb-keyval';`.

`app/src/migracion.ts`:
```ts
// Primer arranque tras la fase B (spec §4.3): la instalación plana de antes (solo Marbella) pasa a la disposición por
// región. Una sola vez (setas:migracion-regiones). Las dependencias se inyectan para probarla con un OPFS falso.
import type { Almacen } from './region';
import { paqueteMapas } from './opfs';

export const CLAVE_MIGRACION = 'setas:migracion-regiones';
export interface DepsMigracion {
  almacen: Almacen;
  raiz: () => Promise<FileSystemDirectoryHandle | null>;
  moverArchivos: (desde: string, hacia: string, nombres: string[]) => Promise<void>;
  renombrarMeteo: (de: string, a: string) => Promise<void>;
}
export type ResultadoMigracion = 'hecha-antes' | 'sin-instalacion' | 'migrada';

const LEGADO = 'marbella';
const POR_REGION = ['capa', 'punto-meteo'];

/** Archivos (no carpetas) que hay directamente en `dir`; [] si no existe. */
async function archivosSueltos(raiz: FileSystemDirectoryHandle | null, dir: string): Promise<{ h: FileSystemDirectoryHandle | null; nombres: string[] }> {
  if (!raiz) return { h: null, nombres: [] };
  try {
    const h = await raiz.getDirectoryHandle(dir);
    const nombres: string[] = [];
    for await (const [n, e] of (h as any).entries() as AsyncIterable<[string, FileSystemHandle]>) if (e.kind === 'file') nombres.push(n);
    return { h, nombres };
  } catch { return { h: null, nombres: [] }; }
}

export async function migrarARegiones(d: DepsMigracion): Promise<ResultadoMigracion> {
  const a = d.almacen;
  if (a.getItem(CLAVE_MIGRACION) === '1') return 'hecha-antes';
  let uso = a.getItem('setas:aviso-visto') !== null;

  for (const k of POR_REGION) {
    const v = a.getItem(`setas:${k}`);
    if (v === null) continue;
    uso = true;
    if (a.getItem(`setas:${k}:${LEGADO}`) === null) a.setItem(`setas:${k}:${LEGADO}`, v);
    a.removeItem(`setas:${k}`);
  }

  const raiz = await d.raiz().catch(() => null);
  const p = paqueteMapas(LEGADO);
  const estado = a.getItem('setas:mapas-descargados');
  const mapas = await archivosSueltos(raiz, 'mapas');
  if (mapas.nombres.length && estado !== null) {
    await d.moverArchivos('mapas', p.dir, mapas.nombres);
    a.setItem(p.clave, estado);
  } else {
    for (const n of mapas.nombres) await mapas.h!.removeEntry(n).catch(() => {});
  }
  if (estado !== null || mapas.nombres.length) uso = true;
  a.removeItem('setas:mapas-descargados');

  const staging = await archivosSueltos(raiz, 'mapas-nuevo');
  for (const n of staging.nombres) await staging.h!.removeEntry(n).catch(() => {});
  if (staging.h && staging.nombres.length) await raiz!.removeEntry('mapas-nuevo').catch(() => {});   // solo si quedó vacío
  if (a.getItem('setas:mapas-nuevo-generado') !== null) { uso = true; a.removeItem('setas:mapas-nuevo-generado'); }
  if (mapas.h && mapas.nombres.length && estado === null) await raiz!.removeEntry('mapas').catch(() => {});

  await d.renombrarMeteo('datos', `datos:${LEGADO}`).catch(() => {});
  if (uso && a.getItem('setas:region') === null) a.setItem('setas:region', LEGADO);
  a.setItem(CLAVE_MIGRACION, '1');
  return uso ? 'migrada' : 'sin-instalacion';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/migracion.test.ts src/meteo.test.ts`
Expected: PASS (5 + los de meteo).

- [ ] **Step 5: Commit**

```bash
git add app/src/migracion.ts app/src/migracion.test.ts app/src/meteo.ts app/src/meteo.test.ts
git commit -m "feat(app): migración de la instalación plana a marbella y caché de meteo por región

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Cablear la región en datos, mapa, acceso, reconocedor y arranque

**Files:**
- Modify: `app/src/datos.ts` (entero)
- Modify: `app/src/mapa.ts:9-10,29-39,46-64` (`pm`, `restriccionEn`)
- Modify: `app/src/acceso-datos.ts:5-6,51-61`
- Modify: `app/src/reconocer-ui.ts:4,612`
- Modify: `app/src/main.ts` (imports 5/20, `manifest` tipo, 113, 159, 814, 896, 1016, 1029-1030, 1055-1110, 1167)

**Interfaces:**
- Consumes: tareas 3–6.
- Produces:
  - `datos.ts`: `cargarJson<T>(nombre: string, region?: string): Promise<T | null>`; `cargarManifest(region?: string): Promise<ManifestApp | null>`; re-exporta `mb`, `baseDatos`, `raizDatos`. `BASE_DATOS` deja de existir.
  - `main.ts`: `arrancar()` (migración → índice → región → mapa); variables `regiones: RegionIndice[]`; `manifest: ManifestApp | null`.
  - `window.__setas.region()` (solo e2e): `{ activa: string; regiones: string[] }`.

- [ ] **Step 1: Write the failing check**

Run: `cd app && npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: un número > 0 (las firmas de la tarea 5 rompen `main.ts`, `mapa.ts`, `datos.ts`, `acceso-datos.ts` y `reconocer-ui.ts`).

- [ ] **Step 2: Implement**

`app/src/datos.ts` (entero):
```ts
import type { Manifest } from './tipos';
import { archivoOpfs } from './opfs';
import { baseDatos, raizDatos, regionActiva } from './region';
import { prepararManifest, type ManifestApp } from './manifest-region';

export { mb } from './unidades';
export { baseDatos, raizDatos };

/** JSON de datos de una región desde la red; sin cobertura, la copia descargada en OPFS. */
export async function cargarJson<T>(nombre: string, region = regionActiva()): Promise<T | null> {
  try {
    const r = await fetch(baseDatos(region) + nombre, { cache: 'no-cache' });
    if (r.ok) return await r.json();
  } catch { /* sin red */ }
  const f = await archivoOpfs(nombre, region);
  return f ? JSON.parse(await f.text()) : null;
}

export async function cargarManifest(region = regionActiva()): Promise<ManifestApp | null> {
  const m = await cargarJson<Manifest>('manifest.json', region);
  return m ? prepararManifest(m, region) : null;
}
```

`app/src/mapa.ts`: el import `BASE_DATOS` pasa a `import { baseDatos } from './datos';`. En `pm()`, `const url = baseDatos() + nombre;`. En `restriccionEn`, `const a = archivosPm.get(baseDatos() + capa)!;`.

`app/src/acceso-datos.ts`: `import { baseDatos, cargarJson } from './datos';` y las dos apariciones de `BASE_DATOS + nombre` pasan a `baseDatos() + nombre`.

`app/src/reconocer-ui.ts`: `import { mb, raizDatos } from './datos';` y `await descargarModelo(m, raizDatos(), …)`. El modelo es compartido: `data/modelo/`.

`app/src/main.ts`:
1. Imports. Sustituye la línea 5 por `import { baseDatos, cargarJson, cargarManifest, mb } from './datos';` y añade:
```ts
import { cargarRegiones, claveRegion, establecerActiva, hayRegionActiva, regionActiva, resolverRegion, type RegionIndice } from './region';
import { migrarARegiones } from './migracion';
import { claveMeteo, renombrarCache } from './meteo';
import type { ManifestApp } from './manifest-region';
```
(junta `claveMeteo, renombrarCache` con el import existente de `./meteo`).
2. `let manifest: ManifestApp | null = null;` y `let regiones: RegionIndice[] = [];`
3. Línea 113: `localStorage.setItem(claveRegion('capa'), JSON.stringify({ especie, umbral }));`. Línea 159: `localStorage.getItem(claveRegion('capa'))`.
4. Línea 814: `const clavePunto = () => claveRegion('punto-meteo');`. En 896 y 1030 usa `clavePunto()` en lugar de `CLAVE_PUNTO`.
5. Línea 1016: `const r = await obtener(puntosMeteo, { forzar, clave: claveMeteo(regionActiva()) });`
6. En `iniciarMapa`: `manifest = await cargarManifest();` (sin cambios de forma). Exponer en `__setas`: `region: () => ({ activa: regionActiva(), regiones: regiones.map((r) => r.id) }),`.
7. `pintarAjustes()` empieza con `if (!hayRegionActiva()) return;`. Botón de descarga: `await descargarMapas(manifest, regionActiva(), baseDatos(), (h, t) => { … })`.
8. Sustituye la última línea del archivo por:
```ts
/** Arranque: migración de la instalación plana (una vez) → índice de regiones → región activa → mapa. */
async function arrancar() {
  await migrarARegiones({
    almacen: localStorage,
    raiz: async () => (navigator.storage?.getDirectory ? navigator.storage.getDirectory() : null),
    moverArchivos: (desde, hacia, nombres) => moverEnOpfs(desde, hacia, nombres),
    renombrarMeteo: renombrarCache,
  }).catch((e) => console.warn('migración a regiones', e));
  regiones = await cargarRegiones();
  const id = await resolverRegion(regiones, { almacen: localStorage, posicion: posicionRapida, preguntar: preguntarRegion });
  if (!id) { $('#sin-datos').hidden = false; return; }
  establecerActiva(id);
  await iniciarMapa();
}
arrancar().then(pintarAjustes).finally(() => guardarFotosSinConexion(pintarEstadoGuia));
```
`moverEnOpfs` sale de `opfs.ts` (añádelo allí, exportado, usando el `trabajador` interno):
```ts
/** Orden 'mover' del worker de descarga (también la usa la migración a regiones). */
export const moverEnOpfs = (desde: string, hacia: string, nombres: string[]) =>
  trabajador({ tipo: 'mover', desde, hacia, nombres }).then(() => {});
```
`posicionRapida` y `preguntarRegion` vienen de `region-ui.ts` (tarea 11). Hasta esa tarea, defínelos en `main.ts` así, y la tarea 11 los sustituye por el import:
```ts
const posicionRapida = async () => null;
const preguntarRegion = async (rs: RegionIndice[]) => rs[0]?.id ?? null;
```

- [ ] **Step 3: Verify**

Run: `cd app && npx tsc --noEmit && npm test`
Expected: sin errores de tipos; todos los tests en verde (los de antes y los nuevos).

Run: `cd app && SETAS_DATOS=/Users/alexanderkrupnov/Documents/Claude/setas/pipeline/data npm run build && (php -S 127.0.0.1:8765 -t dist servidor.php >/private/tmp/setas-php.log 2>&1 &) && sleep 1 && curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8765/data/regiones.json http://127.0.0.1:8765/data/marbella/manifest.json`
Expected: `200` y `200`. Para el servidor después (`pkill -f "php -S 127.0.0.1:8765"`).

- [ ] **Step 4: Commit**

```bash
git add app/src/datos.ts app/src/mapa.ts app/src/acceso-datos.ts app/src/reconocer-ui.ts app/src/main.ts app/src/opfs.ts
git commit -m "feat(app): datos, OPFS, claves y meteo por región; arranque con migración y región activa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Quitar lo que está fijo para Marbella (origen, atribuciones, BOJA, textos legales)

**Files:**
- Modify: `app/src/restricciones.ts:12` (`ORIENTATIVO` → `orientativo()`)
- Modify: `app/src/restricciones.test.ts` (test de `orientativo`)
- Modify: `app/src/ranking.ts:37` (quitar `MARBELLA`)
- Modify: `app/src/hoy-ui.ts:3-7,17,60-68,127-131`
- Modify: `app/src/mapa.ts:12,14,94-103,130-147,198-245`
- Modify: `app/src/main.ts:9,1082` y el relleno de atribuciones
- Modify: `app/index.html:373,400`

**Interfaces:**
- Consumes: `ManifestApp`, `nombreFuente` (tarea 3).
- Produces:
  - `restricciones.ts`: `export function orientativo(normas: string[]): string`.
  - `mapa.ts`: `crearMapa(contenedor: HTMLElement, m: ManifestApp)`. `ATRIBUCION` desaparece y `ATRIBUCION_PNOA` se queda.
  - `hoy-ui.ts`: `ContextoHoy.manifest: () => ManifestApp | null`.
  - `index.html`: `<p class="atribucion" id="atrib-datos">` y `<p class="atribucion" id="atrib-inicio">`, vacíos; los rellena `main.ts`.

- [ ] **Step 1: Write the failing test**

Añade a `app/src/restricciones.test.ts` (junta el import):
```ts
import { orientativo } from './restricciones';
describe('orientativo', () => {
  it('con BOJA da exactamente el texto de antes (e2e de Marbella)', () => {
    expect(orientativo(['BOJA'])).toBe('Información orientativa: comprueba la normativa vigente (BOJA) antes de recoger.');
  });
  it('varias normas sin repetir, y sin normas', () => {
    expect(orientativo(['DOGV', 'BORM', 'DOGV'])).toBe('Información orientativa: comprueba la normativa vigente (DOGV, BORM) antes de recoger.');
    expect(orientativo([])).toBe('Información orientativa: comprueba la normativa vigente antes de recoger.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/restricciones.test.ts`
Expected: FAIL, «orientativo is not a function».

- [ ] **Step 3: Implement**

`app/src/restricciones.ts`. Sustituye la línea de `ORIENTATIVO` por:
```ts
/** Nota bajo la normativa: cita las siglas de los boletines de la zona (legal.ccaa[].norma; legado de Marbella: BOJA). */
export function orientativo(normas: string[]): string {
  const n = [...new Set(normas.filter(Boolean))];
  return `Información orientativa: comprueba la normativa vigente${n.length ? ` (${n.join(', ')})` : ''} antes de recoger.`;
}
```

`app/src/ranking.ts`: borra la línea `export const MARBELLA = { lat: 36.5101, lon: -4.8825 };`.

`app/src/hoy-ui.ts`:
- import: `import { distanciaM, parsearSitios, topEspecie, topGeneral, … } from './ranking';` (sin `MARBELLA`) y `import type { ManifestApp } from './manifest-region';`; `ContextoHoy.manifest: () => ManifestApp | null;`
- `textoLejania`:
```ts
function textoLejania(p: { lat: number; lon: number }): string {
  const yo = ctx.posicion();
  const region = ctx.manifest()?.region;
  const desde = yo ?? region?.origen;
  if (!desde) return '';
  const km = distanciaM(desde, p) / 1000;
  const n = km < 10 ? km.toLocaleString('es-ES', { maximumFractionDigits: 1 }) : Math.round(km).toLocaleString('es-ES');
  return `a ${n} km ${yo ? 'de ti' : region!.etiqueta_origen} en línea recta`;
}
```
- chip de restringido: `r.textContent = ctx.manifest()?.chip_sitio_restringido ?? '';`

`app/src/mapa.ts`:
- imports: `import { aRestriccion, NOMBRE_TIPO_RESTRICCION, orientativo, restriccionesEn, teselaDe, type Restriccion } from './restricciones';` y `import { nombreFuente, type ManifestApp } from './manifest-region';`. Borra `export const ATRIBUCION = …`.
- `popupRestriccion(r: Restriccion, nota: string)`: `a.textContent = nota;`.
- `popupRuta(p: Record<string, unknown>, fuentes: Record<string, string>)`: `const fu = linea(\`Fuente: ${nombreFuente(String(p.fuente ?? ''), fuentes)}\`);`.
- `crearMapa(contenedor: HTMLElement, m: ManifestApp)`:
  - `attributionControl: { compact: true, customAttribution: m.atribuciones.mapa || undefined },`
  - nota de normativa: `const nota = orientativo(m.legal.length ? m.legal.map((e) => e.norma) : m.normas_legado);`
  - popups: `popupRuta(ruta.properties, m.atribuciones.fuentes)`, `popupRestriccion(aRestriccion(…), nota)` y `a.textContent = m.texto_protegido;` en el de espacio protegido.

`app/index.html`: línea 373 → `<p class="atribucion" id="atrib-datos"></p>`; línea 400 → `<p class="atribucion" id="atrib-inicio"></p>`.

`app/src/main.ts`:
- línea 9: `import { orientativo, textoChip, type Restriccion } from './restricciones';`
- en `pintarAjustes`, la línea de `#normativa-orientativo` la reescribe la tarea 9. Mientras tanto: `$('#normativa-orientativo').textContent = orientativo(manifest!.legal.length ? manifest!.legal.map((e) => e.norma) : manifest!.normas_legado);`
- en `iniciarMapa`, justo después de `if (!manifest) { … return; }`:
```ts
  const atrib = manifest.atribuciones.mapa ? `Datos: ${manifest.atribuciones.mapa}` : '';
  $('#atrib-datos').textContent = atrib;
  $('#atrib-inicio').textContent = atrib;
```

- [ ] **Step 4: Verify**

Run: `cd app && npx vitest run && npx tsc --noEmit && grep -rn "Marbella\|MARBELLA\|BOJA\|REDIAM" src/*.ts index.html | grep -v "\.test\.ts" | grep -v "manifest-region.ts"`
Expected: tests y tipos en verde. El grep no devuelve nada; el único sitio con esos nombres es la tabla de legado de `manifest-region.ts`.

- [ ] **Step 5: Commit**

```bash
git add app/src/restricciones.ts app/src/restricciones.test.ts app/src/ranking.ts app/src/hoy-ui.ts app/src/mapa.ts app/src/main.ts app/index.html
git commit -m "refactor(app): origen, atribuciones y textos legales desde el manifest de la región

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Normativa por comunidad autónoma del punto y avisos de datos

**Files:**
- Create: `app/src/normativa.ts`
- Create: `app/src/normativa.test.ts`
- Modify: `app/src/mapa.ts` (`entidadesEn` genérico; `restriccionEn` lo usa; `ccaaEn`)
- Modify: `app/index.html:363-369` (sección `#normativa`) y la sección «Datos» (`#avisos-datos`)
- Modify: `app/src/main.ts` (`pintarNormativa()`, llamada desde `pintarAjustes`, avisos)
- Modify: `app/src/estilos.css` (normativa por CCAA)

**Interfaces:**
- Consumes: `EntradaLegal`, `ManifestApp` (tarea 3); `dentroDe` (restricciones.ts); `orientativo` (tarea 8).
- Produces:
```ts
// normativa.ts
export function ccaaEnPunto(fs: { properties: Record<string, unknown>; geometry: Geometry }[], lat: number, lon: number): string[];
export interface VistaNormativa { ambito: 'punto' | 'todas'; entradas: EntradaLegal[]; nota: string }
export function vistaNormativa(legal: EntradaLegal[], idsPunto: string[] | null, normasLegado: string[]): VistaNormativa;
export function textoCupo(kg: number): string;      // "Cupo: hasta 3 kg por persona y día."
export const PENDIENTE = 'Pendiente de verificar';
// mapa.ts
export async function entidadesEn(archivo: string, capa: string, lat: number, lon: number): Promise<{ properties: Record<string, unknown>; geometry: any }[] | null>;
export async function ccaaEn(m: ManifestApp, lat: number, lon: number): Promise<string[] | null>;  // null: sin capa o sin poder leerla
```

- [ ] **Step 1: Write the failing test**

`app/src/normativa.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Geometry } from 'geojson';
import { ccaaEnPunto, PENDIENTE, textoCupo, vistaNormativa } from './normativa';
import type { EntradaLegal } from './manifest-region';

const cuadrado = (x0: number, y0: number, x1: number, y1: number): Geometry =>
  ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const CV: EntradaLegal = { id: 'comunitat_valenciana', nombre: 'Comunitat Valenciana', norma: 'DOGV', cupo_kg_dia: null, texto: 'T', verificado: false, fuente_url: '' };
const MU: EntradaLegal = { id: 'region_murcia', nombre: 'Región de Murcia', norma: 'BORM', cupo_kg_dia: 2, texto: 'U', verificado: true, fuente_url: 'https://borm.es' };

describe('ccaaEnPunto', () => {
  it('ids de los polígonos que contienen el punto, sin repetir', () => {
    const fs = [{ properties: { id: 'comunitat_valenciana' }, geometry: cuadrado(-1, 38, 0, 39) },
      { properties: { id: 'comunitat_valenciana' }, geometry: cuadrado(-1, 38, 0, 39) },
      { properties: { id: 'region_murcia' }, geometry: cuadrado(-2, 37, -1, 38) }];
    expect(ccaaEnPunto(fs, 38.5, -0.5)).toEqual(['comunitat_valenciana']);
    expect(ccaaEnPunto(fs, 10, 10)).toEqual([]);
  });
});

describe('vistaNormativa', () => {
  it('con punto dentro de una CCAA conocida: solo esa', () => {
    const v = vistaNormativa([CV, MU], ['region_murcia'], []);
    expect(v.ambito).toBe('punto');
    expect(v.entradas).toEqual([MU]);
    expect(v.nota).toBe('Información orientativa: comprueba la normativa vigente (BORM) antes de recoger.');
  });
  it('sin punto, o punto fuera de todas: todas las de la región (spec §4.4)', () => {
    expect(vistaNormativa([CV, MU], null, []).ambito).toBe('todas');
    expect(vistaNormativa([CV, MU], ['andalucia'], []).entradas).toEqual([CV, MU]);
  });
  it('legado sin legal: sin entradas y nota con las normas de legado (BOJA)', () => {
    expect(vistaNormativa([], null, ['BOJA'])).toEqual({ ambito: 'todas', entradas: [],
      nota: 'Información orientativa: comprueba la normativa vigente (BOJA) antes de recoger.' });
  });
});

describe('textos', () => {
  it('cupo y pendiente', () => {
    expect(textoCupo(3)).toBe('Cupo: hasta 3 kg por persona y día.');
    expect(textoCupo(1.5)).toBe('Cupo: hasta 1,5 kg por persona y día.');
    expect(PENDIENTE).toBe('Pendiente de verificar');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/normativa.test.ts`
Expected: FAIL, «Failed to resolve import "./normativa"».

- [ ] **Step 3: Implement**

`app/src/normativa.ts`:
```ts
// Normativa de recogida por comunidad autónoma (spec §3.6, §4.4): qué entradas de legal.ccaa enseñar para un punto.
// La CCAA del punto sale de ccaa.pmtiles (capa 'ccaa', propiedades id y nombre; consulta en mapa.ts, ccaaEn). Sin DOM.
import type { Geometry } from 'geojson';
import { dentroDe, orientativo } from './restricciones';
import type { EntradaLegal } from './manifest-region';

export const PENDIENTE = 'Pendiente de verificar';

export function ccaaEnPunto(fs: { properties: Record<string, unknown>; geometry: Geometry }[], lat: number, lon: number): string[] {
  const ids: string[] = [];
  for (const f of fs) {
    const id = String(f.properties.id ?? '');
    if (id && !ids.includes(id) && dentroDe(f.geometry, lat, lon)) ids.push(id);
  }
  return ids;
}

export interface VistaNormativa { ambito: 'punto' | 'todas'; entradas: EntradaLegal[]; nota: string }

/** Con un punto dentro de alguna CCAA de la región, solo esas; si no (sin punto, fuera o sin capa), todas. */
export function vistaNormativa(legal: EntradaLegal[], idsPunto: string[] | null, normasLegado: string[]): VistaNormativa {
  const delPunto = idsPunto?.length ? legal.filter((e) => idsPunto.includes(e.id)) : [];
  const entradas = delPunto.length ? delPunto : legal;
  return { ambito: delPunto.length ? 'punto' : 'todas', entradas,
    nota: orientativo(legal.length ? entradas.map((e) => e.norma) : normasLegado) };
}

export const textoCupo = (kg: number) => `Cupo: hasta ${kg.toLocaleString('es-ES')} kg por persona y día.`;
```

`app/src/mapa.ts`. Sustituye `restriccionEn` por:
```ts
/**
 * Entidades de la capa `capa` del PMTiles `archivo` en la tesela del nivel máximo que contiene el punto. Usa la misma
 * Source OPFS/HTTP que el mapa: sin conexión sale de OPFS y no depende de que la capa esté visible. Sin tesela → [].
 * Si no se puede leer (sin red y sin descarga) → null.
 */
export async function entidadesEn(archivo: string, capa: string, lat: number, lon: number) {
  pm(archivo);
  const a = archivosPm.get(baseDatos() + archivo)!;
  try {
    const z = (await a.getHeader()).maxZoom;
    const { x, y } = teselaDe(lat, lon, z);
    const t = await a.getZxy(z, x, y);
    if (!t) return [];
    const l = new VectorTile(new PbfReader(new Uint8Array(t.data))).layers[capa];
    if (!l) return [];
    return Array.from({ length: l.length }, (_, i) => l.feature(i).toGeoJSON(x, y, z) as { properties: Record<string, unknown>; geometry: any });
  } catch (e) {
    console.warn(capa, e);
    return null;
  }
}

/** Recintos restringidos (restricciones.pmtiles) que contienen el punto; null si no se puede leer. */
export async function restriccionEn(m: Manifest, lat: number, lon: number): Promise<Restriccion[] | null> {
  if (!m.restricciones) return null;
  const fs = await entidadesEn(m.restricciones.capa, 'restricciones', lat, lon);
  return fs && restriccionesEn(fs, lat, lon, m.restricciones.tipos);
}

/** Comunidades autónomas (ccaa.pmtiles, capa 'ccaa') que contienen el punto; null sin capa o sin poder leerla. */
export async function ccaaEn(m: ManifestApp, lat: number, lon: number): Promise<string[] | null> {
  if (!m.ccaa) return null;
  const fs = await entidadesEn(m.ccaa, 'ccaa', lat, lon);
  return fs && ccaaEnPunto(fs, lat, lon);
}
```
(añade `import { ccaaEnPunto } from './normativa';`).

`app/index.html`, sección `#normativa`, entera:
```html
        <section id="normativa" class="grupo-ajustes normativa" aria-labelledby="tit-normativa" hidden>
          <h2 id="tit-normativa">Normativa de recogida</h2>
          <p id="normativa-ambito" class="nota" hidden></p>
          <div id="normativa-ccaa" class="normativa-ccaa"></div>
          <p id="normativa-aviso"></p>
          <p id="normativa-tipos-intro" class="nota">En el mapa, con rayado rojo (capa «Recogida con autorización»):</p>
          <ul id="normativa-tipos" class="normativa-tipos"></ul>
          <p id="normativa-orientativo" class="aviso-normativa"></p>
        </section>
```
En la sección «Datos», después de `#info-datos`:
```html
          <div id="avisos-datos" class="avisos-datos" role="note" hidden>
            <p class="nota"><b>Avisos de estos datos</b></p>
            <ul id="avisos-datos-lista"></ul>
          </div>
```

`app/src/main.ts`. Sustituye el bloque `const nr = manifest?.restricciones; … }` de `pintarAjustes` por `pintarNormativa();` y añade:
```ts
/** Normativa en Ajustes: por la CCAA del último punto consultado (o del GPS); sin punto, todas las de la región. */
let normativaN = 0;
async function pintarNormativa() {
  const m = manifest;
  const nr = m?.restricciones;
  $('#normativa').hidden = !m || (!nr && !m.legal.length);
  if (!m) return;
  const n = ++normativaN;
  const p = ultimoAcceso?.punto ?? gps?.ultima ?? null;
  const ids = p && M ? await M.ccaaEn(m, p.lat, p.lon) : null;
  if (n !== normativaN) return;
  const v = vistaNormativa(m.legal, ids, m.normas_legado);
  const amb = $('#normativa-ambito');
  amb.hidden = !m.legal.length;
  amb.textContent = v.ambito === 'punto' ? `En el punto elegido: ${v.entradas.map((e) => e.nombre).join(', ')}`
    : m.legal.length > 1 ? 'Todas las comunidades de esta región. Elige un punto en el mapa para ver solo la suya.' : '';
  amb.hidden = !amb.textContent;
  $('#normativa-ccaa').replaceChildren(...v.entradas.map(entradaLegal));
  $('#normativa-aviso').hidden = !!m.legal.length || !nr;   // con legal por CCAA, el aviso general sobra
  $('#normativa-aviso').textContent = nr?.aviso ?? '';
  $('#normativa-tipos-intro').hidden = !nr;
  $('#normativa-tipos').replaceChildren(...Object.values(nr?.tipos ?? {}).map((t) => { const li = document.createElement('li'); li.textContent = t; return li; }));
  $('#normativa-orientativo').textContent = v.nota;
  const avisos = m.avisos;
  $('#avisos-datos').hidden = !avisos.length;
  $('#avisos-datos-lista').replaceChildren(...avisos.map((a) => { const li = document.createElement('li'); li.textContent = a; return li; }));
}

function entradaLegal(e: EntradaLegal): HTMLElement {
  const art = document.createElement('article'); art.className = 'normativa-entrada'; art.dataset.ccaa = e.id;
  const h = document.createElement('h3'); h.textContent = e.nombre;
  art.append(h);
  if (!e.verificado) {
    const b = document.createElement('span'); b.className = 'insignia-pendiente'; b.textContent = PENDIENTE;
    h.append(' ', b);
  }
  const t = document.createElement('p'); t.textContent = e.texto;
  art.append(t);
  if (e.verificado && e.cupo_kg_dia !== null) { const c = document.createElement('p'); c.className = 'nota'; c.textContent = textoCupo(e.cupo_kg_dia); art.append(c); }
  if (e.fuente_url) {
    const a = document.createElement('a'); a.href = e.fuente_url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.textContent = `Texto oficial${e.norma ? ` (${e.norma})` : ''}`;
    art.append(a);
  }
  return art;
}
```
Imports: `import { PENDIENTE, textoCupo, vistaNormativa } from './normativa';` y `import type { EntradaLegal, ManifestApp } from './manifest-region';`. Quita `orientativo` del import de `restricciones` si ya no se usa en `main.ts`.

`app/src/estilos.css`, junto a `.normativa`:
```css
.normativa-ccaa { display: grid; gap: 12px; }
.normativa-entrada h3 { margin: 0 0 4px; font-size: 17px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.normativa-entrada p { margin: 0 0 4px; }
.normativa-entrada a { font-weight: 700; color: var(--bosque-tx); }
.insignia-pendiente { font-size: 13px; font-weight: 800; padding: 2px 8px; border-radius: 999px; color: var(--ambar-tx); background: var(--ambar-t); }
.avisos-datos ul { margin: 4px 0 0; padding-left: 20px; color: var(--tinta-2); font-size: 15px; }
```

- [ ] **Step 4: Verify**

Run: `cd app && npx vitest run && npx tsc --noEmit`
Expected: PASS. Con los datos de legado (sin `legal`), Ajustes enseña lo mismo que hoy: `#normativa-aviso` visible, `#normativa-ambito` oculto y la nota «(BOJA)». Lo cubre el e2e de la tarea 13.

- [ ] **Step 5: Humanizer y commit**

Pasa por la skill `humanizer` las cadenas nuevas: «En el punto elegido: …», «Todas las comunidades de esta región. Elige un punto en el mapa para ver solo la suya.», «Pendiente de verificar», «Cupo: hasta N kg por persona y día.», «Texto oficial (…)», «Avisos de estos datos». Si cambia alguna, actualiza el test que la cita.
```bash
git add app/src/normativa.ts app/src/normativa.test.ts app/src/mapa.ts app/index.html app/src/main.ts app/src/estilos.css
git commit -m "feat(app): normativa por comunidad autónoma del punto y avisos de los datos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Especies sin hábitat en el selector

**Files:**
- Modify: `app/src/selector-especie.ts` (opción `sinHabitat`, filas al final, `ordenSelector`)
- Modify: `app/src/main.ts:149` (pasar `sinHabitat`)
- Modify: `app/src/estilos.css` (fila `.sin-habitat`)
- Test: `app/src/manifest-region.test.ts` (ya cubre la separación). La fila se comprueba en el e2e de la tarea 13.

**Interfaces:**
- Consumes: `ManifestApp.especies_sin_habitat` (tarea 3).
- Produces: `iniciarSelectorEspecie(deManifest, { estadoHoy?, hoy?, sinHabitat?: () => Especie[] })`; `ordenSelector()` devuelve además `sinHabitat: string[]`. Cada fila es `<li role="option" aria-disabled="true" class="sin-habitat" data-sin-habitat="<id>">` y lleva el texto «Sin hábitat en esta zona».

- [ ] **Step 1: Implement**

En `app/src/selector-especie.ts`:
- estado del módulo: `let sinHabitat: () => Especie[] = () => [];`, y `ultimoOrden` gana `sinHabitat: string[]` (inicial `[]`).
- en `iniciarSelectorEspecie`: `if (o.sinHabitat) sinHabitat = o.sinHabitat;` (añade `sinHabitat?: () => Especie[]` al tipo de `o`).
- al final de `pintarSelectorEspecie`, después del bucle `for (const { e, estado, etiqueta } of filas)`:
```ts
  // Especies de la guía sin hábitat en esta región (spec §4.4): grises, sin capa y no elegibles. La guía sigue teniendo su ficha.
  const sh = sinHabitat();
  ultimoOrden.sinHabitat = sh.map((e) => e.id);
  if (sh.length) {
    const sep = document.createElement('li');
    sep.className = 'se-divisor'; sep.setAttribute('role', 'presentation'); sep.textContent = 'Sin hábitat en esta zona';
    ul.append(sep);
  }
  for (const e of sh) {
    const d = datosEspecie(e);
    const li = document.createElement('li');
    li.setAttribute('role', 'option'); li.setAttribute('aria-disabled', 'true'); li.setAttribute('aria-selected', 'false');
    li.tabIndex = -1; li.className = 'sin-habitat'; li.dataset.sinHabitat = e.id;
    const caja = document.createElement('span'); caja.className = 'miniatura-especie'; caja.setAttribute('aria-hidden', 'true');
    miniatura(caja, d.miniatura);
    const txt = document.createElement('span'); txt.className = 'se-texto';
    const b = document.createElement('b'); b.textContent = d.comun;
    const i = document.createElement('i'); i.textContent = d.cientifico;
    const pie = document.createElement('span'); pie.className = 'se-pie';
    const x = document.createElement('span'); x.className = 'se-inactiva'; x.textContent = 'Sin hábitat en esta zona';
    pie.append(x); txt.append(b, i, pie);
    li.append(caja, txt);
    ul.append(li);
  }
```
Al principio de `pintarSelectorEspecie`, `ultimoOrden = { activas: …, inactivas: …, sinHabitat: [] }`: añade la propiedad en la asignación que ya existe. Los manejadores de clic y de teclado ya ignoran estas filas, porque no tienen `data-especie`.

`app/src/main.ts:149`: `iniciarSelectorEspecie(() => manifest?.especies ?? [], { estadoHoy: estadoHoyRef, hoy: hoyZona, sinHabitat: () => manifest?.especies_sin_habitat ?? [] });`

`app/src/estilos.css`, junto a `.lista-especies .inactiva`:
```css
.lista-especies .sin-habitat { cursor: default; }
.lista-especies .sin-habitat .miniatura-especie { filter: grayscale(1); opacity: 0.5; }
.lista-especies .sin-habitat .se-texto b, .lista-especies .sin-habitat .se-texto i { color: var(--tinta-2); }
```
El texto se queda en `--tinta-2` (10,3:1) y no se apaga con `opacity`: tiene que leerse al sol.

- [ ] **Step 2: Verify**

Run: `cd app && npx tsc --noEmit && npx vitest run`
Expected: PASS. En Marbella `especies_sin_habitat` está vacío: ni separador ni filas, y el selector queda igual que hoy.

- [ ] **Step 3: Humanizer y commit**

Humanizer sobre «Sin hábitat en esta zona», el texto fijado por la spec §4.4. Si propone otro, se mantiene el de la spec y se anota la propuesta para Alexander.
```bash
git add app/src/selector-especie.ts app/src/main.ts app/src/estilos.css
git commit -m "feat(app): especies sin hábitat en gris en el selector, sin capa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Selector de región (chip, hoja y Ajustes) y primera elección

**Files:**
- Create: `app/src/region-ui.ts`
- Modify: `app/index.html` (chip en `.mapa-cab`, `#dlg-region` junto a `#dlg-especie`, sección `#ajustes-region` como primera de Ajustes)
- Modify: `app/src/estilos.css` (chip y lista de regiones)
- Modify: `app/src/main.ts` (stubs de la tarea 7 → import; `iniciarSelectorRegion`; lista en Ajustes; título de «Mapas sin conexión»)

**Interfaces:**
- Consumes: `RegionIndice`, `textoEstadoRegion`, `CLAVE_REGION` (tarea 4); `estadoDescarga`, `descargarMapas`, `borrarMapas` (tarea 5); `cargarJson`, `baseDatos` (tarea 7).
- Produces:
```ts
export function posicionRapida(): Promise<Punto | null>;   // getCurrentPosition, timeout 6 s, maximumAge 10 min; null si falla
export function preguntarRegion(rs: RegionIndice[]): Promise<string | null>;   // abre #dlg-region en modo «primera vez»
export interface OpcionesRegionUi {
  regiones: () => RegionIndice[]; activa: () => string;
  estado: (id: string) => { bytes: number } | null; cambiar: (id: string) => void;
}
export function iniciarSelectorRegion(o: OpcionesRegionUi): void;   // chip → hoja
export function pintarChipRegion(o: OpcionesRegionUi): void;
export function pintarAjustesRegion(o: OpcionesRegionUi & { descargar: (id: string, boton: HTMLButtonElement) => Promise<void>; borrar: (id: string) => Promise<void> }): void;
```
IDs del DOM: `#btn-region`, `#btn-region-nombre`, `#dlg-region`, `#tit-regiones`, `#regiones-intro`, `#lista-regiones` (opciones `li[role=option][data-region]`), `#ajustes-region`, `#ajustes-lista-regiones` (filas `li[data-region]` con botones `[data-accion=usar|descargar|borrar]`), `#tit-mapas-offline`.

- [ ] **Step 1: Markup**

`app/index.html`, dentro de `<header class="mapa-cab">` y antes de `<div class="fila-especie">`:
```html
        <button id="btn-region" class="chip-region vidrio" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="dlg-region" hidden>
          <svg class="ico" aria-hidden="true"><use href="#i-pin"/></svg><span id="btn-region-nombre"></span><svg class="ico se-flecha" aria-hidden="true"><use href="#i-abajo"/></svg>
        </button>
```
Después de `</dialog>` de `#dlg-especie`:
```html
  <dialog id="dlg-region" class="dlg dlg-hoja hoja-regiones" aria-labelledby="tit-regiones">
    <div class="hoja-cab">
      <h2 id="tit-regiones">Elige región</h2>
      <form method="dialog"><button class="btn-x" value="cerrar"><svg class="ico" aria-hidden="true"><use href="#i-cerrar"/></svg><span class="sr">Cerrar</span></button></form>
    </div>
    <p id="regiones-intro" class="nota regiones-intro" hidden>No tenemos tu ubicación. Elige dónde vas a buscar setas; la puedes cambiar cuando quieras.</p>
    <ul id="lista-regiones" class="lista-regiones" role="listbox" aria-labelledby="tit-regiones"></ul>
  </dialog>
```
Primera sección de `#p-ajustes .cuerpo`:
```html
        <section id="ajustes-region" class="grupo-ajustes" aria-labelledby="tit-ajustes-region" hidden>
          <h2 id="tit-ajustes-region">Región</h2>
          <p class="nota">Cada región se descarga aparte. Puedes tener varias en el teléfono.</p>
          <ul id="ajustes-lista-regiones" class="lista-regiones lista-regiones-ajustes"></ul>
        </section>
```
En «Mapas sin conexión», el `<h2>` pasa a `<h2 id="tit-mapas-offline">Mapas sin conexión</h2>`.

- [ ] **Step 2: `region-ui.ts`**

```ts
// Selector de región (spec §4.2): chip en la cabecera del mapa y hoja #dlg-region; lista con descargas en Ajustes.
// Con una sola región en regiones.json no se enseña nada. Cambiar de región recarga la página (main.ts, cambiar).
import { textoEstadoRegion, type Punto, type RegionIndice } from './region';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

export interface OpcionesRegionUi {
  regiones: () => RegionIndice[];
  activa: () => string;
  estado: (id: string) => { bytes: number } | null;
  cambiar: (id: string) => void;
}

export function posicionRapida(): Promise<Punto | null> {
  return new Promise((ok) => {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition((p) => ok({ lat: p.coords.latitude, lon: p.coords.longitude }), () => ok(null),
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 10 * 60 * 1000 });
  });
}

function opcion(r: RegionIndice, elegida: boolean, est: { bytes: number } | null): HTMLLIElement {
  const li = document.createElement('li');
  li.setAttribute('role', 'option'); li.setAttribute('aria-selected', String(elegida));
  li.dataset.region = r.id; li.tabIndex = elegida ? 0 : -1;
  const b = document.createElement('b'); b.textContent = r.nombre;
  const s = document.createElement('span'); s.className = 'nota'; s.textContent = textoEstadoRegion(r, est, navigator.onLine);
  const marca = document.createElement('span'); marca.className = 'se-marca'; marca.setAttribute('aria-hidden', 'true');
  if (elegida) marca.innerHTML = '<svg class="ico"><use href="#i-check"/></svg>';
  li.append(b, marca, s);
  if (!est && !navigator.onLine) li.setAttribute('aria-disabled', 'true');
  return li;
}

/** Abre la hoja y resuelve con el id elegido (null si se cierra sin elegir). */
function abrirHoja(rs: RegionIndice[], activa: string | null, estado: (id: string) => { bytes: number } | null, primera: boolean): Promise<string | null> {
  const dlg = $<HTMLDialogElement>('#dlg-region');
  const ul = $('#lista-regiones');
  $('#regiones-intro').hidden = !primera;
  ul.replaceChildren(...rs.map((r) => opcion(r, r.id === activa, estado(r.id))));
  return new Promise((ok) => {
    let elegido: string | null = null;
    const elegir = (li: HTMLLIElement | null) => {
      if (!li?.dataset.region || li.getAttribute('aria-disabled') === 'true') return;
      elegido = li.dataset.region; dlg.close();
    };
    const clic = (ev: Event) => elegir((ev.target as HTMLElement).closest<HTMLLIElement>('[role=option]'));
    const tecla = (ev: KeyboardEvent) => {
      const os = [...ul.querySelectorAll<HTMLLIElement>('[role=option]')];
      const i = os.indexOf(document.activeElement as HTMLLIElement);
      const ir: Record<string, number> = { ArrowDown: Math.min(i + 1, os.length - 1), ArrowUp: Math.max(i - 1, 0), Home: 0, End: os.length - 1 };
      if (ev.key in ir) { ev.preventDefault(); os.forEach((o) => (o.tabIndex = -1)); os[ir[ev.key]].tabIndex = 0; os[ir[ev.key]].focus(); }
      else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); elegir(os[i] ?? null); }
    };
    ul.addEventListener('click', clic); ul.addEventListener('keydown', tecla);
    dlg.addEventListener('close', () => { ul.removeEventListener('click', clic); ul.removeEventListener('keydown', tecla); ok(elegido); }, { once: true });
    dlg.showModal();
    (ul.querySelector<HTMLLIElement>('[aria-selected=true]') ?? ul.querySelector<HTMLLIElement>('[role=option]'))?.focus();
  });
}

/** Primera vez sin GPS: espera a que se cierre el aviso de inicio (dos modales a la vez no) y pregunta. */
export async function preguntarRegion(rs: RegionIndice[]): Promise<string | null> {
  const inicio = $<HTMLDialogElement>('#dlg-inicio');
  if (inicio.open) await new Promise((r) => inicio.addEventListener('close', r, { once: true }));
  return abrirHoja(rs, null, () => null, true);
}

export function pintarChipRegion(o: OpcionesRegionUi) {
  const btn = $<HTMLButtonElement>('#btn-region');
  const r = o.regiones().find((x) => x.id === o.activa());
  btn.hidden = o.regiones().length < 2 || !r;
  if (!r) return;
  $('#btn-region-nombre').textContent = r.nombre;
  btn.setAttribute('aria-label', `Región: ${r.nombre}. Cambiar de región`);
}

export function iniciarSelectorRegion(o: OpcionesRegionUi) {
  pintarChipRegion(o);
  const btn = $<HTMLButtonElement>('#btn-region');
  btn.addEventListener('click', async () => {
    btn.setAttribute('aria-expanded', 'true');
    const id = await abrirHoja(o.regiones(), o.activa(), o.estado, false);
    btn.setAttribute('aria-expanded', 'false'); btn.focus();
    if (id && id !== o.activa()) o.cambiar(id);
  });
}

export function pintarAjustesRegion(o: OpcionesRegionUi & {
  descargar: (id: string, boton: HTMLButtonElement) => Promise<void>; borrar: (id: string) => Promise<void>;
}) {
  const rs = o.regiones();
  $('#ajustes-region').hidden = rs.length < 2;
  const activa = rs.find((r) => r.id === o.activa());
  $('#tit-mapas-offline').textContent = rs.length > 1 && activa ? `Mapas sin conexión · ${activa.nombre}` : 'Mapas sin conexión';
  if (rs.length < 2) return;
  const boton = (texto: string, accion: string, clase: string, f: (b: HTMLButtonElement) => void) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = clase; b.textContent = texto; b.dataset.accion = accion;
    b.onclick = () => f(b); return b;
  };
  $('#ajustes-lista-regiones').replaceChildren(...rs.map((r) => {
    const est = o.estado(r.id);
    const li = document.createElement('li'); li.dataset.region = r.id;
    const b = document.createElement('b'); b.textContent = r.nombre;
    const s = document.createElement('span'); s.className = 'nota'; s.textContent = textoEstadoRegion(r, est, navigator.onLine);
    const acc = document.createElement('div'); acc.className = 'acciones-region';
    if (r.id === o.activa()) {
      const x = document.createElement('span'); x.className = 'chip-en-uso'; x.textContent = 'En uso'; acc.append(x);
    } else {
      const usar = boton('Usar esta región', 'usar', 'btn', () => o.cambiar(r.id));
      usar.disabled = !est && !navigator.onLine;
      acc.append(usar);
      if (est) acc.append(boton('Borrar', 'borrar', 'btn btn-peligro', () => o.borrar(r.id)));
      else {
        const d = boton(`Descargar (${Math.round(r.total_bytes / 1e6)} MB)`, 'descargar', 'btn', (bt) => o.descargar(r.id, bt));
        d.disabled = !navigator.onLine;
        acc.append(d);
      }
    }
    li.append(b, s, acc);
    return li;
  }));
}
```

- [ ] **Step 3: Wiring en `main.ts`**

- Borra los stubs `posicionRapida` y `preguntarRegion` de la tarea 7 e importa `import { iniciarSelectorRegion, pintarAjustesRegion, posicionRapida, preguntarRegion, type OpcionesRegionUi } from './region-ui';` y `import { CLAVE_REGION } from './region';` (junto al import existente de `./region`).
- Opciones compartidas:
```ts
const opcionesRegion: OpcionesRegionUi = {
  regiones: () => regiones,
  activa: () => regionActiva(),
  estado: (id) => estadoDescarga(id),
  cambiar: (id) => {
    try { localStorage.setItem(CLAVE_REGION, id); } catch { /* solo esta sesión */ }
    recargarTrasCambioDeMapas(`Región: ${regiones.find((r) => r.id === id)?.nombre ?? id}`);
  },
};
```
- En `arrancar()`, tras `establecerActiva(id);`: `iniciarSelectorRegion(opcionesRegion);`.
- En `pintarAjustes()`, tras la guarda:
```ts
  pintarAjustesRegion({ ...opcionesRegion,
    descargar: async (id, b) => {
      b.disabled = true;
      try {
        const m = await cargarJson<Manifest>('manifest.json', id);
        if (!m) throw new Error('No se pudo leer el manifest de la región');
        await descargarMapas(m, id, baseDatos(id), (h, t) => { b.textContent = `Descargando… ${mb(h)} de ${mb(t)}`; });
        avisar(`${regiones.find((r) => r.id === id)?.nombre ?? id}: lista sin conexión`);
      } catch (err) { avisar(`Error en la descarga: ${(err as Error).message}`, 6000); }
      pintarAjustes();
    },
    borrar: async (id) => {
      if (!confirm(`¿Borrar los mapas descargados de ${regiones.find((r) => r.id === id)?.nombre ?? id}?`)) return;
      await borrarMapas(id); pintarAjustes();
    } });
```
La región activa no se descarga aquí: usa la sección «Mapas sin conexión» de siempre, que recarga la página. Las demás regiones no las está leyendo el mapa, así que no hace falta recargar.

- [ ] **Step 4: CSS**

`app/src/estilos.css`, junto a `.fila-especie`:
```css
/* Chip de región (cabecera del mapa): vidrio, compacto, con área de toque de 44 px. */
.chip-region { justify-self: start; position: relative; display: inline-flex; align-items: center; gap: 6px; min-height: 36px;
  padding: 6px 12px 6px 10px; border: 0; border-radius: 999px; font: inherit; font-size: 15px; font-weight: 800; color: var(--tinta);
  transition: transform 100ms var(--curva); }
.chip-region::after { content: ''; position: absolute; inset: -4px; }
.chip-region:active { transform: scale(0.97); }
.chip-region .ico { width: 18px; height: 18px; }
.chip-region[aria-expanded=true] { background: var(--tinta); color: var(--hoja); }
/* Lista de regiones (hoja y Ajustes) */
.lista-regiones { list-style: none; margin: 0; padding: 4px 10px 8px; display: grid; gap: 6px; }
.lista-regiones li { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 2px 12px; min-height: var(--toque-1);
  padding: 10px 14px; border-radius: 16px; background: var(--velo); }
.lista-regiones li > b { font-size: 17px; }
.lista-regiones li > .nota { grid-column: 1; font-size: 14px; }
.lista-regiones [role=option] { cursor: pointer; transition: transform 100ms var(--curva); }
.lista-regiones [role=option]:active { transform: scale(0.98); }
.lista-regiones [role=option][aria-selected=true] { background: var(--bosque-t); }
.lista-regiones [aria-disabled=true] { opacity: 0.6; cursor: default; }
.regiones-intro { padding: 0 20px 6px; }
.lista-regiones-ajustes { padding: 0; }
.lista-regiones-ajustes .acciones-region { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.chip-en-uso { font-size: 13px; font-weight: 800; padding: 4px 10px; border-radius: 999px; background: var(--bosque-t); color: var(--bosque-tx); }
```
y dentro del bloque `@media (prefers-reduced-motion: reduce)` existente:
```css
  .chip-region:active, .lista-regiones [role=option]:active { transform: none; }
```
La hoja usa `.dlg.dlg-hoja`, que ya entra con `subir` y `var(--entrada)`, igual que `#dlg-especie`. El modo oscuro sale de los tokens (`--tinta`, `--hoja`, `--velo`, `--bosque-t`, `--vidrio-*`). No hace falta CSS propio.

- [ ] **Step 5: Verify**

Run: `cd app && npx tsc --noEmit && npx vitest run`
Expected: PASS. Con una sola región (Marbella), `#btn-region` y `#ajustes-region` siguen ocultos y el título es «Mapas sin conexión». El e2e de la tarea 13 lo cubre.

- [ ] **Step 6: Humanizer, revisión de diseño y commit**

- Humanizer sobre: «Elige región», «No tenemos tu ubicación. Elige dónde vas a buscar setas; la puedes cambiar cuando quieras.», «Región», «Cada región se descarga aparte. Puedes tener varias en el teléfono.», «Usar esta región», «En uso», «Descargar (N MB)», «Descargada · N MB», «Sin descargar · N MB», «Sin descargar · necesita conexión», «Región: X. Cambiar de región», «X: lista sin conexión», «¿Borrar los mapas descargados de X?». Si cambia `textoEstadoRegion`, actualiza `region.test.ts`.
- Comprueba las capturas `regiones-chip.png` y `regiones-chip-oscuro.png` de la tarea 13 contra `MASTER.md`: vidrio, contraste ≥ 4,5:1 y toque ≥ 44 px.
```bash
git add app/src/region-ui.ts app/index.html app/src/estilos.css app/src/main.ts
git commit -m "feat(app): selector de región (chip y hoja), lista con descargas en Ajustes y primera elección

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Gemini con la comunidad autónoma (app + Worker) — dispara `security-review`

**Files:**
- Modify: `app/src/gemini.ts` (`PeticionGemini.contexto.ccaa`, `CCAA_GEMINI`, `elegirCcaaGemini`)
- Modify: `app/src/gemini.test.ts`
- Modify: `app/src/reconocer-ui.ts:20-24,523` (operación `ccaaGemini`)
- Modify: `app/src/main.ts` (`iniciarReconocer({ …, ccaaGemini })`)
- Modify: `worker/src/validar.ts` (`Contexto.ccaa`, validación de lista cerrada)
- Modify: `worker/src/gemini.ts:10` (`NOMBRE_CCAA`, `instrucciones(ccaa)`, `cuerpoGemini`)
- Modify: `worker/test/worker.test.ts`

**Interfaces:**
- Consumes: `IdCcaa` (tarea 3), `ccaaEn` (tarea 9).
- Produces:
  - Worker: `contexto.ccaa?: 'andalucia' | 'comunitat_valenciana' | 'region_murcia' | 'castilla_la_mancha'`. Cualquier otro valor da 400 `solicitud_invalida`. Exporta `NOMBRE_CCAA: Record<Ccaa, string>`, `type Ccaa` e `instrucciones(ccaa?: Ccaa): string`. `INSTRUCCIONES` se mantiene como `instrucciones('andalucia')`.
  - App: `CCAA_GEMINI: readonly IdCcaa[]`; `elegirCcaaGemini(idsPunto: string[] | null, idsRegion: string[]): IdCcaa | null`. Devuelve `null` si sale `andalucia` o no hay nada: así la petición de Marbella es idéntica a la de hoy y la app nueva funciona con el Worker antiguo.
  - `ReconocerOps.ccaaGemini?: (p: { lat: number; lon: number } | null) => Promise<IdCcaa | null>`.

- [ ] **Step 1: Write the failing tests**

`worker/test/worker.test.ts`, dentro de `describe("llamada a Gemini", …)`:
```ts
  it("el prompt nombra la comunidad pedida y por defecto Andalucía", async () => {
    await llamar(peticion(valida));
    expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body).systemInstruction.parts[0].text).toContain("en Andalucía (España)");
    await llamar(peticion({ ...valida, contexto: { ...valida.contexto, ccaa: "comunitat_valenciana" } }));
    const t = JSON.parse(fetchMock.mock.calls.at(-1)![1].body).systemInstruction.parts[0].text;
    expect(t).toContain("en la Comunitat Valenciana (España)");
    expect(t).not.toContain("Andalucía");
  });
```
y en `describe("límites de tamaño y validación", …)`:
```ts
  it("400 con una comunidad fuera de la lista cerrada (incluidas claves de Object.prototype)", async () => {
    for (const ccaa of ["galicia", "Andalucia", "__proto__", "toString", "", 3, { a: 1 }]) {
      const r = await llamar(peticion({ ...valida, contexto: { ...valida.contexto, ccaa } }));
      expect(r.status, String(ccaa)).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
```
(Si `fetchMock` acumula llamadas de otros tests en ese `describe`, mira cómo lo reinicia el `beforeEach` del archivo y sigue el mismo patrón).

`app/src/gemini.test.ts`:
```ts
import { elegirCcaaGemini } from './gemini';
describe('elegirCcaaGemini', () => {
  it('la del punto si es conocida; si no, la primera conocida de la región; Andalucía y nada → null', () => {
    expect(elegirCcaaGemini(['region_murcia'], ['comunitat_valenciana', 'region_murcia'])).toBe('region_murcia');
    expect(elegirCcaaGemini(['galicia'], ['comunitat_valenciana'])).toBe('comunitat_valenciana');
    expect(elegirCcaaGemini(null, ['andalucia'])).toBeNull();
    expect(elegirCcaaGemini(['andalucia'], ['comunitat_valenciana'])).toBeNull();
    expect(elegirCcaaGemini(null, [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd worker && npx vitest run` y `cd app && npx vitest run src/gemini.test.ts`
Expected: FAIL en los tests nuevos (la petición con `ccaa` recibe 400 por «Campo no admitido» y el prompt nombra Andalucía; `elegirCcaaGemini` no existe).

- [ ] **Step 3: Implement**

`worker/src/gemini.ts`. Sustituye la primera línea de `INSTRUCCIONES` por una función:
```ts
/** Lista cerrada (la misma que IdCcaa en la app): el texto del prompt nunca viene del cliente, solo la clave. */
export const NOMBRE_CCAA = {
  andalucia: "Andalucía",
  comunitat_valenciana: "la Comunitat Valenciana",
  region_murcia: "la Región de Murcia",
  castilla_la_mancha: "Castilla-La Mancha",
} as const;
export type Ccaa = keyof typeof NOMBRE_CCAA;
export const esCcaa = (v: unknown): v is Ccaa => typeof v === "string" && Object.prototype.hasOwnProperty.call(NOMBRE_CCAA, v);

export function instrucciones(ccaa: Ccaa = "andalucia"): string {
  return `Eres un asistente de micología para una app de campo en ${NOMBRE_CCAA[ccaa]} (España). Ayudas a identificar setas a partir de fotos, pero NUNCA decides si algo se come.
…(resto del texto actual, sin cambios)…`;
}
export const INSTRUCCIONES = instrucciones();
```
(El resto del template se copia literal del `INSTRUCCIONES` actual). En `cuerpoGemini`: `systemInstruction: { parts: [{ text: instrucciones(p.contexto.ccaa) }] },`.

`worker/src/validar.ts`:
- `import { esCcaa, type Ccaa } from "./gemini";`
- `Contexto` gana `ccaa?: Ccaa;`
- `permitidas` gana `"ccaa"`;
- tras la validación de `lon`:
```ts
    if (contexto.ccaa != null) {
      if (!esCcaa(contexto.ccaa)) throw invalida("'contexto.ccaa' no es una comunidad admitida.");
      ctx.ccaa = contexto.ccaa;
    }
```
Hay un ciclo de imports entre `gemini.ts` y `validar.ts`, pero es solo de tipos en un sentido (`import type`) y de valores en el otro, así que no da problemas. Si se prefiere, mueve `NOMBRE_CCAA`/`esCcaa` a `worker/src/ccaa.ts` e impórtalo desde los dos.

`app/src/gemini.ts`:
```ts
import { IDS_CCAA, type IdCcaa } from './manifest-region';
/** Comunidades que conoce el Worker (worker/src/gemini.ts, NOMBRE_CCAA). */
export const CCAA_GEMINI: readonly IdCcaa[] = IDS_CCAA;
/** La del punto si se conoce; si no, la primera de la región. 'andalucia' es el valor por defecto del Worker → null (no se envía). */
export function elegirCcaaGemini(idsPunto: string[] | null, idsRegion: string[]): IdCcaa | null {
  const conocida = (ids: string[] | null) => ids?.find((i): i is IdCcaa => (CCAA_GEMINI as readonly string[]).includes(i)) ?? null;
  const c = conocida(idsPunto) ?? conocida(idsRegion);
  return c === 'andalucia' ? null : c;
}
```
y `PeticionGemini.contexto` gana `ccaa?: IdCcaa`.

`app/src/reconocer-ui.ts`: la interfaz de operaciones gana `ccaaGemini?: (p: { lat: number; lon: number } | null) => Promise<IdCcaa | null>;`. En la construcción de la petición (línea 523):
```ts
      const ccaa = await op.ccaaGemini?.(posicion).catch(() => null) ?? null;
      …
      contexto: { fecha: fechaHoy(), ...(posicion ? { lat: +posicion.lat.toFixed(5), lon: +posicion.lon.toFixed(5) } : {}), ...(ccaa ? { ccaa } : {}) },
```
`app/src/main.ts`, en `iniciarReconocer({ … })`:
```ts
  ccaaGemini: async (p) => elegirCcaaGemini(p && manifest && M ? await M.ccaaEn(manifest, p.lat, p.lon) : null, manifest?.legal.map((e) => e.id) ?? []),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd worker && npx vitest run && npx tsc --noEmit` y `cd app && npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Puerta de seguridad y commit**

- Ejecuta la skill `security-review` sobre el diff de `worker/` (spec §8: «security-review del Worker si cambia el prompt»). Qué revisar: lista cerrada con `hasOwnProperty` (sin `in`, que deja pasar `__proto__` y `toString`), el texto del prompt nunca sale del cliente, la petición antigua sin `ccaa` sigue siendo válida, y los límites de tamaño y CORS no cambian.
- **Orden de despliegue:** el Worker nuevo (`cd worker && npm run deploy`, lo hace Alexander) tiene que estar desplegado **antes** de publicar datos de Alicante. Para Marbella no hay orden: la app no envía `ccaa` cuando es Andalucía.
```bash
git add worker/src/validar.ts worker/src/gemini.ts worker/test/worker.test.ts app/src/gemini.ts app/src/gemini.test.ts app/src/reconocer-ui.ts app/src/main.ts
git commit -m "feat(worker,app): segunda opinión con la comunidad autónoma del punto (lista cerrada)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: e2e — Marbella con la disposición nueva y esqueleto de regiones con una región falsa

**Files:**
- Modify: `app/e2e/offline.e2e.mjs:55,158,220,223,375,392-400,408,610`
- Create: `app/e2e/fixtures/region-prueba/manifest.json`
- Create: `app/e2e/regiones.e2e.mjs`
- Modify: `app/package.json` (scripts `e2e`, `e2e:marbella`, `e2e:regiones`)

**Interfaces:**
- Consumes: todo lo anterior; `window.__setas.region()` y `window.__setas.selector()` (con `sinHabitat`).
- Produces: `npm run e2e` ejecuta los dos e2e; `npm run e2e:regiones` ejecuta solo el nuevo.

**Diseño de la región falsa «prueba».** Alicante todavía no tiene datos. Los e2e no deben depender de generar PMTiles, así que Playwright sirve una región inventada encima de los archivos reales de Marbella:
- `**/data/regiones.json` → el índice real más `{ id: 'prueba', nombre: 'Prueba', origen: Alicante (38.3452, −0.481), bbox pequeño alrededor de Ronda }`. El bbox cae dentro del de Marbella, así que hay teselas de base, sombreado y curvas. El origen está lejos a propósito: con el GPS en la sierra de Málaga, la región más cercana tiene que salir Marbella (paso F).
- `**/data/prueba/manifest.json` → el fixture, completado al arrancar con `zoom`, `umbrales`, `generado` y los `bytes` reales de los archivos, sacados del manifest de Marbella. También `tiempo` y `fiabilidad` de `amanita_caesarea`.
- `**/data/prueba/<archivo>` → `route.fetch` a `data/marbella/<archivo>`. Playwright reenvía la cabecera `Range`.
- El fixture tiene una especie activa (`amanita_caesarea`), una `sin_habitat` (`terfezia_arenaria`) y una entrada `legal` de la Comunitat Valenciana con `verificado: false` y un cupo que **no** se debe ver. Trae atribuciones propias y un aviso. `ccaa: null` (sin capa, así que se enseñan todas). En `archivos` solo lleva 1 PMTiles de idoneidad y `protegidos.pmtiles`, para que su descarga sea pequeña.

- [ ] **Step 1: Ajustar el e2e de Marbella (solo rutas y claves)**

En `app/e2e/offline.e2e.mjs`:
- 55: `new URL('data/marbella/meteo_puntos.json', URL_APP)`
- 158 y 220: `fetch('data/marbella/manifest.json')`
- 223: `` new URL(`data/marbella/idoneidad_${e.id}_${u}.pmtiles`, URL_APP) ``
- 375, 395, 408 y 610: `'setas:mapas-descargados:marbella'`
- 392-400: además de la lista de la raíz, lista `mapas/` y comprueba la subcarpeta:
```js
    const dirs = [];
    for await (const k of raiz.keys()) dirs.push(k);
    const enMapas = [];
    try { for await (const k of (await raiz.getDirectoryHandle('mapas')).keys()) enMapas.push(k); } catch { /* sin mapas */ }
    return { estado: localStorage.getItem('setas:mapas-descargados:marbella'), dirs, enMapas, aviso: document.querySelector('#aviso').textContent };
```
y la comprobación de la línea 400:
```js
  comprobar(!tras.dirs.includes('mapas-nuevo') && tras.dirs.includes('mapas') && tras.enMapas.includes('marbella'),
    `staging borrado, mapas antiguos en mapas/marbella (${tras.dirs.join(', ')} · mapas/${tras.enMapas.join(', ')})`);
```
Añade justo después de `ok('carga en línea con el service worker activo');`:
```js
  const reg = await p.evaluate(() => window.__setas.region());
  comprobar(reg.activa === 'marbella' && await p.locator('#btn-region').isHidden(), `región activa marbella y sin chip con una sola región (${reg.regiones})`);
```
Ningún texto esperado cambia: «(BOJA)», «km de (Marbella|ti)», «Normativa de recogida», los popups, etc.

`app/package.json`, scripts:
```json
    "e2e": "node e2e/offline.e2e.mjs && node e2e/regiones.e2e.mjs",
    "e2e:marbella": "node e2e/offline.e2e.mjs",
    "e2e:regiones": "node e2e/regiones.e2e.mjs",
```

- [ ] **Step 2: Fixture**

`app/e2e/fixtures/region-prueba/manifest.json`:
```json
{
  "region": { "id": "prueba", "nombre": "Prueba", "origen": { "lat": 38.3452, "lon": -0.481 }, "etiqueta_origen": "de Alicante (prueba)" },
  "bbox": [-5.30, 36.65, -5.05, 36.82],
  "base": null,
  "especies": [
    { "id": "amanita_caesarea", "nombre": "Amanita caesarea" },
    { "id": "terfezia_arenaria", "nombre": "Terfezia arenaria", "sin_habitat": true }
  ],
  "meteo": null, "acceso": null, "rutas": null, "restricciones": null, "sitios": null, "modelo": null, "ccaa": null,
  "legal": {
    "ccaa": [{ "id": "comunitat_valenciana", "nombre": "Comunitat Valenciana (prueba)", "norma": "DOGV", "cupo_kg_dia": 9,
      "texto": "Texto de prueba del e2e: normativa sin cotejar.", "verificado": false, "fuente_url": "https://dogv.gva.es/" }],
    "texto_protegido": "Prueba e2e: consulta el PRUG del espacio.",
    "chip_sitio_restringido": "Prueba e2e: espacio protegido"
  },
  "atribuciones": { "mapa": "Prueba e2e: IGN CC BY 4.0, © OpenStreetMap ODbL, Protomaps", "fuentes": {} },
  "avisos": ["Prueba e2e: capa de vegetación sin datos en parte de la zona."],
  "archivos": ["protegidos.pmtiles", "idoneidad_amanita_caesarea_0.pmtiles"]
}
```
(`archivos` es una lista de nombres. El e2e la convierte en `{nombre, bytes}` con los tamaños reales y rellena `generado`, `zoom`, `umbrales` y `total_bytes`).

- [ ] **Step 3: `regiones.e2e.mjs`**

```js
// e2e de regiones (multi-región, fase B): una región falsa «prueba» servida por Playwright sobre los archivos de Marbella
// (no hay datos de Alicante todavía). Cubre: migración de una instalación plana → mapas/marbella; chip y cambio de región;
// especie sin hábitat; normativa por CCAA sin cupo no verificado; atribuciones y avisos del manifest; descarga de una
// segunda región sin perder la primera; primera elección sin GPS; región guardada que ya no existe (spec §6).
// Requiere `npm run build` y el servidor: php -S 127.0.0.1:8765 -t dist servidor.php
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const AQUI = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.URL_APP ?? 'http://127.0.0.1:8765/';
const URL_APP = BASE + '?e2e=1&hoy=2026-10-14';
const CAPTURAS = join(AQUI, 'capturas'); mkdirSync(CAPTURAS, { recursive: true });
const MARBELLA_GPS = { latitude: 36.589, longitude: -5.244 };
let paso = 0;
const ok = (m) => console.log(`✔ ${++paso}. ${m}`);
const comprobar = (c, m) => { if (!c) throw new Error(`Falla: ${m}`); ok(m); };

// Manifest de la región falsa: el fixture + tamaños y metadatos reales de Marbella.
const marbella = await (await fetch(new URL('data/marbella/manifest.json', BASE))).json();
const fix = JSON.parse(readFileSync(join(AQUI, 'fixtures/region-prueba/manifest.json'), 'utf8'));
const bytes = Object.fromEntries(marbella.archivos.map((a) => [a.nombre, a.bytes]));
const caesarea = marbella.especies.find((e) => e.id === 'amanita_caesarea');
const PRUEBA = { ...fix, generado: marbella.generado, zoom: marbella.zoom, umbrales: [0],
  especies: fix.especies.map((e) => (e.id === 'amanita_caesarea' ? { ...e, tiempo: caesarea.tiempo, fiabilidad: caesarea.fiabilidad } : e)),
  archivos: fix.archivos.map((nombre) => ({ nombre, bytes: bytes[nombre] })) };
PRUEBA.total_bytes = PRUEBA.archivos.reduce((s, a) => s + a.bytes, 0);
const INDICE_PRUEBA = { id: 'prueba', nombre: 'Prueba', origen: fix.region.origen, bbox: fix.bbox, total_bytes: PRUEBA.total_bytes, generado: PRUEBA.generado };

const nav = await chromium.launch();
async function contexto(gps) {
  const ctx = await nav.newContext({ ...devices['Pixel 7'], ...(gps ? { geolocation: gps, permissions: ['geolocation'] } : {}),
    locale: 'es-ES', timezoneId: 'Europe/Madrid' });
  await ctx.route('**/api.open-meteo.com/**', (r) => r.fulfill({ status: 503, body: '' }));   // el tiempo no es objeto de este e2e
  await ctx.route('https://www.ign.es/**', (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.route('**/data/regiones.json', async (r) => r.fulfill({ json: [...await (await r.fetch()).json(), INDICE_PRUEBA] }));
  await ctx.route('**/data/prueba/**', async (r) => {
    const u = r.request().url();
    if (/\/data\/prueba\/manifest\.json/.test(u)) return r.fulfill({ json: PRUEBA });
    return r.fulfill({ response: await r.fetch({ url: u.replace('/data/prueba/', '/data/marbella/') }) });
  });
  return ctx;
}
const mapaListo = (p) => p.waitForFunction(() => document.body.dataset.mapa === 'listo', null, { timeout: 60000 });
const entendido = async (p) => { const b = p.getByRole('button', { name: 'Entendido' }); if (await b.isVisible().catch(() => false)) await b.click(); };
const opfs = (p) => p.evaluate(async () => {
  const lista = async (d, pre = '') => { const r = []; for await (const [k, h] of d.entries()) r.push(...(h.kind === 'file' ? [pre + k] : await lista(h, `${pre}${k}/`))); return r; };
  return (await lista(await navigator.storage.getDirectory())).sort();
});

try {
  // ---- A. Migración de una instalación plana (antes de la fase B) → mapas/marbella
  const ctx = await contexto(MARBELLA_GPS);
  const p = await ctx.newPage();
  await p.goto(new URL('iconos/icono-192.png', BASE).href);   // mismo origen, sin arrancar la app
  await p.evaluate(async () => {
    const raiz = await navigator.storage.getDirectory();
    const d = await raiz.getDirectoryHandle('mapas', { create: true });
    const w = await (await d.getFileHandle('legado.txt', { create: true })).createWritable(); await w.write('x'); await w.close();
    localStorage.setItem('setas:mapas-descargados', JSON.stringify({ fecha: '2026-10-01T00:00:00Z', bytes: 1, generado: 'legado', archivos: { 'legado.txt': 1 } }));
    localStorage.setItem('setas:capa', JSON.stringify({ especie: 'boletus_edulis', umbral: 200 }));
    localStorage.setItem('setas:aviso-visto', '1');
  });
  await p.goto(URL_APP);
  await mapaListo(p);
  const tras = await p.evaluate(() => ({ region: localStorage.getItem('setas:region'), marca: localStorage.getItem('setas:migracion-regiones'),
    estado: localStorage.getItem('setas:mapas-descargados:marbella'), viejo: localStorage.getItem('setas:mapas-descargados'),
    capa: localStorage.getItem('setas:capa:marbella'), especie: document.querySelector('#sel-especie').value }));
  comprobar((await opfs(p)).includes('mapas/marbella/legado.txt') && !(await opfs(p)).includes('mapas/legado.txt'), 'migración: archivos en mapas/marbella');
  comprobar(tras.region === 'marbella' && tras.marca === '1' && /legado/.test(tras.estado) && tras.viejo === null, 'migración: claves renombradas y región marbella');
  comprobar(/boletus_edulis/.test(tras.capa) && tras.especie === 'boletus_edulis', 'migración: la capa elegida se conserva');

  // ---- B. Chip y cambio de región
  comprobar(await p.locator('#btn-region').isVisible() && (await p.locator('#btn-region-nombre').textContent()) === 'Marbella', 'chip de región visible con dos regiones');
  await p.screenshot({ path: join(CAPTURAS, 'regiones-chip.png') });
  await p.emulateMedia({ colorScheme: 'dark' });
  await p.screenshot({ path: join(CAPTURAS, 'regiones-chip-oscuro.png') });
  await p.emulateMedia({ colorScheme: 'light' });
  await p.locator('#btn-region').click();
  comprobar(await p.locator('#dlg-region').isVisible() && await p.locator('#lista-regiones [data-region=prueba]').isVisible(), 'hoja de regiones con «Prueba»');
  await p.screenshot({ path: join(CAPTURAS, 'regiones-hoja.png') });
  await Promise.all([p.waitForEvent('load'), p.locator('#lista-regiones [data-region=prueba]').click()]);
  await mapaListo(p);
  const enPrueba = await p.evaluate(() => ({ r: window.__setas.region().activa, sel: [...document.querySelectorAll('#sel-especie option')].map((o) => o.value),
    pide: performance.getEntriesByType('resource').some((e) => /\/data\/prueba\//.test(e.name)),
    capaM: localStorage.getItem('setas:capa:marbella'), sh: window.__setas.selector().sinHabitat }));
  comprobar(enPrueba.r === 'prueba' && enPrueba.pide && (await p.locator('#btn-region-nombre').textContent()) === 'Prueba', 'cambio a «Prueba»: recarga y pide data/prueba/');
  comprobar(JSON.stringify(enPrueba.sel) === '["amanita_caesarea"]' && JSON.stringify(enPrueba.sh) === '["terfezia_arenaria"]', 'solo la especie activa tiene capa; terfezia sin hábitat');
  comprobar(/boletus_edulis/.test(enPrueba.capaM), 'la capa de Marbella sigue guardada aparte');
  await p.locator('#btn-especie').click();
  const fila = p.locator('#lista-especies [data-sin-habitat=terfezia_arenaria]');
  comprobar(await fila.isVisible() && /Sin hábitat en esta zona/.test(await fila.textContent()) && (await fila.getAttribute('aria-disabled')) === 'true',
    'fila gris «Sin hábitat en esta zona», no elegible');
  await p.screenshot({ path: join(CAPTURAS, 'regiones-sin-habitat.png') });
  await p.keyboard.press('Escape');

  // ---- C. Ajustes: normativa por CCAA, atribuciones y avisos de la región
  await p.getByRole('button', { name: /Ajustes/ }).click();
  const aj = await p.evaluate(() => ({ n: document.querySelector('#normativa').innerText, a: document.querySelector('#atrib-datos').textContent,
    av: document.querySelector('#avisos-datos').hidden ? '' : document.querySelector('#avisos-datos').innerText,
    tit: document.querySelector('#tit-mapas-offline').textContent }));
  comprobar(/Comunitat Valenciana \(prueba\)/.test(aj.n) && /Pendiente de verificar/.test(aj.n) && !/kg/.test(aj.n) && /\(DOGV\)/.test(aj.n),
    'normativa: entrada CV, «Pendiente de verificar», sin cupo no verificado y nota (DOGV)');
  comprobar(aj.a === 'Datos: Prueba e2e: IGN CC BY 4.0, © OpenStreetMap ODbL, Protomaps' && /capa de vegetación sin datos/.test(aj.av), 'atribución y avisos del manifest');
  comprobar(aj.tit === 'Mapas sin conexión · Prueba', 'título de la descarga con la región');
  await p.locator('#ajustes-region').screenshot({ path: join(CAPTURAS, 'regiones-ajustes.png') });

  // ---- D. Descargar «Prueba» sin perder Marbella
  await Promise.all([p.waitForEvent('load', { timeout: 600000 }), p.locator('#btn-descargar').click()]);
  await mapaListo(p);
  const archivos = await opfs(p);
  comprobar(archivos.includes('mapas/prueba/idoneidad_amanita_caesarea_0.pmtiles') && archivos.includes('mapas/marbella/legado.txt')
    && !archivos.some((a) => a.startsWith('mapas-nuevo/')), 'dos regiones descargadas a la vez; staging limpio');
  comprobar(await p.evaluate(() => !!localStorage.getItem('setas:mapas-descargados:prueba') && !!localStorage.getItem('setas:mapas-descargados:marbella')),
    'estado de descarga por región');

  // ---- E. Volver a Marbella desde Ajustes
  await p.getByRole('button', { name: /Ajustes/ }).click();
  await Promise.all([p.waitForEvent('load'), p.locator('#ajustes-lista-regiones [data-region=marbella] [data-accion=usar]').click()]);
  await mapaListo(p);
  comprobar(await p.evaluate(() => window.__setas.region().activa === 'marbella' && document.querySelector('#sel-especie').value === 'boletus_edulis'),
    'de vuelta en Marbella con su capa');

  // ---- F. Región guardada que ya no existe (spec §6) → GPS → Marbella
  await p.evaluate(() => localStorage.setItem('setas:region', 'desaparecida'));
  await p.reload(); await mapaListo(p);
  comprobar(await p.evaluate(() => localStorage.getItem('setas:region')) === 'marbella', 'región desaparecida: se vuelve a elegir (la más cercana)');
  await ctx.close();

  // ---- G. Primera vez sin GPS: se pregunta
  const ctx2 = await contexto(null);
  const q = await ctx2.newPage();
  await q.goto(URL_APP);
  await entendido(q);
  await q.locator('#dlg-region').waitFor({ state: 'visible', timeout: 15000 });
  comprobar(await q.locator('#regiones-intro').isVisible(), 'sin GPS: hoja «Elige región» con la explicación');
  await q.screenshot({ path: join(CAPTURAS, 'regiones-primera-vez.png') });
  await q.locator('#lista-regiones [data-region=prueba]').click();
  await mapaListo(q);
  comprobar(await q.evaluate(() => window.__setas.region().activa) === 'prueba', 'primera elección guardada');
  await ctx2.close();
  console.log('e2e de regiones: OK');
} finally {
  await nav.close();
}
```

- [ ] **Step 4: Run e2e**

Run:
```bash
cd app && SETAS_DATOS=/Users/alexanderkrupnov/Documents/Claude/setas/pipeline/data npm run build \
  && (php -S 127.0.0.1:8765 -t dist servidor.php >/private/tmp/setas-php.log 2>&1 &) && sleep 1 \
  && npm run e2e; s=$?; pkill -f "php -S 127.0.0.1:8765"; exit $s
```
Expected: los dos e2e terminan sin «Falla:». El de Marbella imprime los mismos pasos que antes, más «región activa marbella y sin chip con una sola región». El de regiones imprime «e2e de regiones: OK».

- [ ] **Step 5: Commit**

```bash
git add app/e2e/offline.e2e.mjs app/e2e/regiones.e2e.mjs app/e2e/fixtures/region-prueba/manifest.json app/package.json
git commit -m "test(app): e2e de Marbella con la disposición por región y e2e de regiones con una región falsa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Verificación final y puertas (spec §8)

**Files:** ninguno nuevo. Solo se corrige lo que salga.

- [ ] **Step 1:** `cd app && npm test && npm run cobertura && npx tsc --noEmit` → todo en verde, y 100 % en `seguridad.ts` y `reconocer-nucleo.ts`.
- [ ] **Step 2:** `cd worker && npm test && npm run typecheck` → en verde.
- [ ] **Step 3:** Los dos e2e (tarea 13, paso 4) en verde. Regenera las capturas de diseño: `node app/e2e/capturas-diseno.mjs` (con el servidor levantado) y revisa que las de Marbella no cambian, salvo el `<h2>` que ahora tiene id (invisible).
- [ ] **Step 4:** `grep -rn "Marbella\|MARBELLA\|BOJA\|REDIAM\|Andaluc" app/src/*.ts app/index.html | grep -v "\.test\.ts\|manifest-region.ts"` → vacío.
- [ ] **Step 5:** `PRESUPUESTO_MB=950 SETAS_DATOS=… SALIDA=/private/tmp/setas-pub/gh-pages app/scripts/publicar.sh --local` → «Preparado en …». Sirve la carpeta según la cabecera de `publicar.sh` y pasa `URL_APP=http://127.0.0.1:8766/mapa-setas/ npm --prefix app run e2e:marbella`.
- [ ] **Step 6:** skill `code-review` a nivel **high** sobre la rama (diff contra `main`). Skill `security-review` sobre `worker/` (si no se hizo en la tarea 12). Skill `verification-before-completion` antes de dar la fase por terminada.
- [ ] **Step 7:** Anota en la nota de sesión de memoria compartida lo pendiente para Alexander: desplegar el Worker antes de publicar Alicante, y el contrato de este plan para el pipeline (`legal.ccaa[].norma` = sigla del boletín; modelo en `pipeline/data/modelo/`).

---

## Riesgos

1. **El pipeline no emite el contrato tal cual.** Por ejemplo, si `norma` es «Res. 23-09-2026, BOJA 196» y no «BOJA», el e2e de Marbella falla en `(BOJA)`. Mitigación: el contrato está arriba, y la tarea 14 vuelve a pasar el e2e con los datos nuevos cuando la fase A termine.
2. **Usuarios con el service worker antiguo frente a los datos nuevos.** Durante una carga, la app vieja pide `data/manifest.json`, que ya no se publica, y enseña «No hay mapas» hasta que `autoUpdate` + `skipWaiting` activan la nueva y la página recarga. Sin conexión no les afecta, porque leen OPFS. Se acepta: es una sola carga.
3. **Migración en navegadores sin `FileSystemHandle.move`** (Safari antiguo). La orden `mover` del worker ya copia byte a byte como respaldo. La migración no lleva e2e en WebKit; el test unitario usa un OPFS falso.
4. **`ccaa.pmtiles` con `maxzoom` alto.** La consulta lee la tesela del nivel máximo; si es 14, una frontera compleja pesa más, pero solo se lee una tesela por consulta. Se pide un `maxzoom` de 10 en el contrato.
5. **Orden de despliegue del Worker.** Si se publica Alicante con el Worker antiguo, la segunda opinión con `ccaa` da 400. Marbella no se ve afectada. Lo cubre la nota de la tarea 12.
6. **El GPS en el primer arranque** pide permiso nada más abrir (solo con más de una región y sin región guardada). Lo mitigan el timeout de 6 s y la pregunta como respaldo. Los usuarios actuales no lo ven, porque la migración fija `marbella`.

---

## Desviaciones (ejecución 2026-10-15)

El código cambió desde que se escribió el plan: la fase A (pipeline multi-región) ya está hecha y `main` se fusionó (selector por vista, «Puntuación del día», citas y titularidad). La app se alinea con lo que el pipeline emite de verdad:

1. **Datos en el worktree.** `pipeline/data` ya existe en el worktree con la disposición multi-región (`regiones.json`, `marbella/out/app`, modelo en `marbella/out/app/modelo/`), así que `SETAS_DATOS` no hace falta; el legado plano se mantiene para el checkout principal.
2. **`origen` es `[lon, lat]`** en `regiones.json` y en `manifest.region` (exportar.py). La app acepta las dos formas (`[lon, lat]` y `{lat, lon}`) y las normaliza a `{lat, lon}`. Test de `disposicion` con la forma real.
3. **`legal.ccaa[].id` del pipeline es corto** (`AND`, como fija la spec §3.6 y los tests de la fase A). La app mantiene los ids canónicos (`andalucia`, `comunitat_valenciana`, `region_murcia`, `castilla_la_mancha`, compartidos con el Worker) y acepta los alias `AND`/`CV`/`MUR`/`CLM` (`idCcaa()` en `manifest-region.ts`). **Fase C:** `alicante.yaml` y `ccaa.pmtiles` deben usar uno de esos dos juegos de ids.
4. **`legal.ccaa[].norma` es la cita completa** («Resolución de 23-09-2026 … (BOJA 196, 08-10-2026)»), no la sigla. La app saca la sigla (`siglaNorma()`: BOJA, DOGV, BORM, DOCM, BOE; una norma corta se toma tal cual) y la guarda en `EntradaLegal.sigla`, que es lo que citan la nota orientativa y el enlace «Texto oficial (…)». La nota de Marbella sigue diciendo «(BOJA)».
5. **Marbella ya trae `legal`** con `verificado: false` (pendiente de Alexander) y `cupo_kg_dia: 3`. Por eso Ajustes de Marbella pasa a enseñar la entrada por CCAA («Andalucía · Pendiente de verificar», el mismo texto del aviso y el enlace al BOJA) en lugar del aviso suelto; el cupo no se pinta aparte (no está verificado), pero el texto del aviso ya lo cita. `normas_legado` solo se usa si no hay ninguna entrada válida.
