#!/usr/bin/env bash
# pipeline/scripts/regresion_marbella.sh
# Regresión de Marbella (spec multi-región §7.1). Rehace SIN RED todo lo que se puede rehacer desde la caché
# y genera (antes) o compara (despues) la huella dorada tests/dorado/marbella.json.
#
#   pipeline/scripts/regresion_marbella.sh antes     # código previo al refactor: data/out, sin --region → genera
#   pipeline/scripts/regresion_marbella.sh despues   # código multi-región: data/marbella/out, --region marbella → compara
#
# Sin red: los proxies apuntan a un puerto cerrado y cualquier petición HTTP falla en el acto (prueba de que todo
# sale de la caché). CON_RED=1 lo desactiva (solo para rellenar una caché incompleta; nunca para generar el dorado).
# Fuera de la regresión (necesitan red sin caché): `ejecutar zona` (OSRM) y `exportar base` (Protomaps).
# zona.geojson, malla.json y base.pmtiles se reutilizan tal cual (ver ENTRADAS y NO_REGENERADOS en dorado.py).
set -euo pipefail
cd "$(dirname "$0")/.."
MODO="${1:?uso: regresion_marbella.sh antes|despues}"
if [[ "${CON_RED:-0}" != 1 ]]; then
  export HTTP_PROXY=http://127.0.0.1:9 HTTPS_PROXY=http://127.0.0.1:9 http_proxy=http://127.0.0.1:9 \
         https_proxy=http://127.0.0.1:9 ALL_PROXY=http://127.0.0.1:9 NO_PROXY= no_proxy=
fi
case "$MODO" in
  antes)   R=();                  OUT=data/out;          ACCION=generar ;;
  despues) R=(--region marbella); OUT=data/marbella/out; ACCION=comparar ;;
  *) echo "modo desconocido: $MODO" >&2; exit 2 ;;
esac
paso() { echo "[$(date +%H:%M:%S)] $*"; }
T0=$(date +%s)
paso "ejecutar (todo menos zona) --forzar"
uv run python -m setas_pipeline.ejecutar relieve vegetacion suelo estructura cubierta incendios humedad \
  protegidos accesos idoneidad calibracion vista --forzar ${R[@]+"${R[@]}"}
paso "exportar capas meteo acceso sitios rutas (+ manifest)"
uv run python -m setas_pipeline.exportar capas meteo acceso sitios rutas ${R[@]+"${R[@]}"}
paso "exportar respaldo"
uv run python -m setas_pipeline.exportar respaldo ${R[@]+"${R[@]}"}
paso "dorado $ACCION"
uv run python -m setas_pipeline.dorado "$ACCION" --out "$OUT" --dorado tests/dorado/marbella.json --desde "$T0"
paso FIN
