#!/usr/bin/env bash
# Fuentes (glyphs) y sprites del estilo de Protomaps, servidos en local para uso sin cobertura.
# Origen: github.com/protomaps/basemaps-assets (fuentes Noto, OFL; sprites CC0).
set -euo pipefail
cd "$(dirname "$0")/../public"
B=https://protomaps.github.io/basemaps-assets
for f in "Noto Sans Regular" "Noto Sans Medium" "Noto Sans Italic"; do
  mkdir -p "fonts/$f"
  for r in 0-255 256-511 512-767 768-1023 1536-1791 7680-7935 8192-8447 8448-8703 64256-64511 65024-65279 65280-65535; do
    curl -sfL -o "fonts/$f/$r.pbf" "$B/fonts/${f// /%20}/$r.pbf"
  done
done
mkdir -p sprites
for s in light.json light.png light@2x.json light@2x.png; do curl -sfL -o "sprites/$s" "$B/sprites/v4/$s"; done
