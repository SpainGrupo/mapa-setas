#!/usr/bin/env bash
# Publica la app en GitHub Pages (rama huérfana gh-pages de SpainGrupo/mapa-setas).
# Los datos (pipeline/data/out/app) no se versionan en main ni se pueden generar en CI: este script hace el
# build, copia (archivos reales, no enlaces) solo lo que la app pide —manifest.json, manifest.archivos y el
# paquete del reconocedor (manifest.modelo)— y fuerza la rama gh-pages con un único commit.
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
DATOS="$RAIZ/pipeline/data/out/app"
REMOTO="${REMOTO:-https://github.com/SpainGrupo/mapa-setas.git}"
SALIDA="${SALIDA:-$(mktemp -d)/gh-pages}"
LIMITE=$((95 * 1024 * 1024))   # GitHub rechaza archivos de más de 100 MB

[[ -f "$DATOS/manifest.json" ]] || { echo "Falta $DATOS/manifest.json: ejecuta el pipeline (exportar)." >&2; exit 1; }

# Worker de Gemini (segunda opinión); sobrescribible con VITE_WORKER_URL en el entorno
export VITE_WORKER_URL="${VITE_WORKER_URL:-https://setas-identificar.setas-worker.workers.dev}"
(cd "$APP" && npm run build)

rm -rf "$SALIDA"; mkdir -p "$SALIDA/data"
# dist sin el enlace data/ (-L resuelve los enlaces de la guía si quedara alguno)
rsync -aL --exclude '/data' "$APP/dist/" "$SALIDA/"

python3 - "$DATOS" "$SALIDA/data" <<'PY'
import json, os, shutil, sys
src, dst = sys.argv[1], sys.argv[2]
m = json.load(open(os.path.join(src, 'manifest.json')))
lista = ['manifest.json'] + [a['nombre'] for a in m['archivos']]
if m.get('modelo'):
    lista += [m['modelo']['dir'] + a['nombre'] for a in m['modelo']['archivos']]
for n in lista:
    o = os.path.join(src, n)
    if not os.path.isfile(o): sys.exit(f'Falta {o}')
    os.makedirs(os.path.dirname(os.path.join(dst, n)), exist_ok=True)
    shutil.copyfile(o, os.path.join(dst, n))
print(f'data/: {len(lista)} archivos copiados')
PY

touch "$SALIDA/.nojekyll"

grandes=$(find "$SALIDA" -type f -size +"$((LIMITE / 1024))"k)
[[ -z "$grandes" ]] || { echo "Archivos por encima del límite de GitHub:" >&2; echo "$grandes" >&2; exit 1; }
[[ -z "$(find "$SALIDA" -type l)" ]] || { echo "Quedan enlaces simbólicos en $SALIDA" >&2; exit 1; }
echo "Preparado en $SALIDA ($(du -sh "$SALIDA" | cut -f1))"

[[ "${1:-}" == "--local" ]] && exit 0

cd "$SALIDA"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$RAIZ" config user.name)" -c user.email="$(git -C "$RAIZ" config user.email)" \
  commit -q -m "Publicación $(git -C "$RAIZ" rev-parse --short HEAD)"
git push -f "$REMOTO" gh-pages
echo "Publicado: https://spaingrupo.github.io/mapa-setas/"
