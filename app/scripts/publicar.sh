#!/usr/bin/env bash
# Publica la app en GitHub Pages (rama huérfana gh-pages de SpainGrupo/mapa-setas).
# Los datos (pipeline/data o $SETAS_DATOS) no se versionan en main ni se pueden generar en CI: este script hace el
# build, copia (archivos reales, no enlaces) regiones.json, cada data/<id>/ (manifest y archivos) y el modelo una
# sola vez; comprueba 95 MB por archivo y 950 MB en total ($PRESUPUESTO_MB), y fuerza gh-pages con un único commit.
#
#   app/scripts/publicar.sh            build + preparar + publicar
#   app/scripts/publicar.sh --local    build + preparar (sin push); deja la carpeta en $SALIDA
#
# Servir la carpeta preparada bajo /mapa-setas/ para probarla (Range incluido):
#   mkdir -p /tmp/raiz && ln -sfn "$SALIDA" /tmp/raiz/mapa-setas
#   php -S 127.0.0.1:8766 -t /tmp/raiz app/servidor.php
#   URL_APP=http://127.0.0.1:8766/mapa-setas/ npm --prefix app run e2e
set -euo pipefail

APP="$(cd "$(dirname "$0")/.." && pwd)"
RAIZ="$(cd "$APP/.." && pwd)"
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

touch "$SALIDA/.nojekyll"

grandes=$(find "$SALIDA" -type f -size +"$((LIMITE / 1024))"k)
[[ -z "$grandes" ]] || { echo "Archivos por encima del límite de GitHub:" >&2; echo "$grandes" >&2; exit 1; }
[[ -z "$(find "$SALIDA" -type l)" ]] || { echo "Quedan enlaces simbólicos en $SALIDA" >&2; exit 1; }
total=$(python3 -c 'import os,sys; print(sum(os.path.getsize(os.path.join(r,f)) for r,_,fs in os.walk(sys.argv[1]) for f in fs))' "$SALIDA")
(( total <= PRESUPUESTO )) || { echo "El sitio ocupa $((total / 1000000)) MB y el presupuesto es $((PRESUPUESTO / 1000000)) MB (spec §5). Aplica las palancas de §5 o pregunta a Alexander." >&2; exit 1; }
echo "Preparado en $SALIDA ($(du -sh "$SALIDA" | cut -f1))"

[[ "${1:-}" == "--local" ]] && exit 0

cd "$SALIDA"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$RAIZ" config user.name)" -c user.email="$(git -C "$RAIZ" config user.email)" \
  commit -q -m "Publicación $(git -C "$RAIZ" rev-parse --short HEAD)"
# ~285 MB en un solo commit: sin buffer grande GitHub corta por HTTP 408
git -c http.postBuffer=1048576000 -c http.version=HTTP/1.1 push -f "$REMOTO" gh-pages
echo "Publicado: https://spaingrupo.github.io/mapa-setas/"
