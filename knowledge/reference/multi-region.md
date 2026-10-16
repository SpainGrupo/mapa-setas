---
type: Reference
title: Arquitectura multi-región
description: Una configuración por región, datos separados y una app con selector de región.
tags: [pipeline, app, regiones]
timestamp: 2026-10-16T09:00:00Z
---

# Notes

- Regiones activas: marbella (marbella.yaml) y alicante (alicante.yaml, fases A–D1 hechas en main). Marbella no cambia: test de regresión contra `pipeline/tests/dorado/marbella.json`.
- Un flag `--region` en los CLIs; datos en `pipeline/data/<region>/{raw,out}`; adaptadores de fuente declarados en la config, sin ramas por región.
- Lo nacional va en `fuentes.yaml`; el catálogo común de especies en `especies.yaml`, con `overrides_especies` y `sin_habitat` por región (gris en el selector, sin capa).
- La app lee `data/regiones.json` y `data/<region>/manifest.json`; región activa en `setas:region`; OPFS por región; modelo del reconocedor compartido en `data/modelo`.
- Publicación: límite GitHub Pages 1 GB (`publicar.sh` comprueba ≤ 950 MB y 95 MB por archivo); el zoom del mapa base se acota por región (Alicante 14).
- Alicante: vocabulario del reconocedor de 1611 etiquetas, umbral «no reconocido» 0,28; cada comestible activa exige una confusión tóxica con ficha (spec §7.5); la negrilla tiene ficha tóxica por decisión de Alexander.

# Citations

- docs/specs/2026-10-15-multi-region-alicante-design.md
- docs/superpowers/plans/2026-10-15-multi-region-fase-{a,b,c,d1}-*.md
