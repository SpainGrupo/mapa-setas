---
type: Reference
title: Malla y capas
description: CRS, celda y códigos compartidos de las capas del pipeline.
tags: [pipeline, malla]
timestamp: 2026-10-16T09:00:00Z
---

# Notes

- CRS de trabajo EPSG:25830 (ETRS89 / UTM 30N), celda de 100 m; todas las capas alineadas con `malla.json`.
- Origen y zona por región (`pipeline/regiones/<id>.yaml`). Marbella: lat 36.5101, lon -4.8825; Alicante: lat 38.3452, lon -0.4810. Límite: 7200 s en coche. Ver multi-region.md.
- Códigos compartidos (ARBOL, SUELO, NODATA_F; `sabina` añadido al final de ARBOL para Alicante) definidos en `pipeline/setas_pipeline/malla.py`.

# Citations

- docs/superpowers/plans/2026-10-13-mapa-setas-fase1-terreno.md (Global Constraints)
