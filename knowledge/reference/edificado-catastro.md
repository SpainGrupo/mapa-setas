---
type: Reference
title: Máscara de edificado (Catastro)
description: Cómo se excluye el suelo urbanizado de la idoneidad y por qué.
tags: [pipeline, edificado, catastro]
timestamp: 2026-10-16T09:00:00Z
---

# Notes

- Causa: el MFE da un único valor a recintos de decenas de hectáreas que contienen urbanizaciones (falso positivo de La Mairena).
- `edificado.tif` (uint8, malla común): 0 libre, 1 edificio a ≤ 100 m del centro de la celda, 2 excluido, 255 fuera de la zona.
- Excluido (2): huella edificada ≥ 2 % de la celda, recinto MFE «Msc arb/artificial» o landuse OSM residencial/industrial.
- Fuente principal: Catastro INSPIRE (edificios BU, descarga ATOM por municipio); las provincias van por región en `regiones/<id>.yaml` (`edificado.catastro_provincias`).
- Licencia: uso libre citando a la D. G. del Catastro; solo se publica la máscara, nunca los edificios.
- Orden: `uv run python -m setas_pipeline.ejecutar edificado [--region <id>]`.

# Citations

- pipeline/setas_pipeline/edificado.py (docstring del módulo)
