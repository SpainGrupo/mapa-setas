#!/usr/bin/env bash
# Migra pipeline/data del esquema plano (raw/, out/) al multi-región (spec multi-región §3.2):
#   raw/                 → marbella/raw/
#   raw/andalucia.osm.pbf → marbella/raw/osm/andalucia.osm.pbf   (extractos OSM por región)
#   raw/gbif/            → _comun/gbif/                           (clave = hash del WKT de la zona)
#   out/                 → marbella/out/
# Idempotente: si ya existe <data>/marbella, no hace nada.
#   pipeline/scripts/migrar_datos.sh /ruta/a/pipeline/data
set -euo pipefail
D="${1:?uso: migrar_datos.sh <pipeline/data>}"
cd "$D"
if [[ -d marbella ]]; then echo "Ya migrado: existe $D/marbella"; exit 0; fi
[[ -d raw && -d out ]] || { echo "No hay raw/ y out/ en $D" >&2; exit 1; }
mkdir marbella
mv raw marbella/raw
mv out marbella/out
mkdir -p marbella/raw/osm _comun
[[ -f marbella/raw/andalucia.osm.pbf ]] && mv marbella/raw/andalucia.osm.pbf marbella/raw/osm/andalucia.osm.pbf
[[ -d marbella/raw/gbif ]] && mv marbella/raw/gbif _comun/gbif
echo "Migrado $D → marbella/{raw,out}, _comun/gbif, marbella/raw/osm/"
