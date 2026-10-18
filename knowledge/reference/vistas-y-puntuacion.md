---
type: Reference
title: Vistas de la app y Puntuación del día
description: Cómo decide la app qué especies muestra, qué pinta y qué significa la puntuación.
tags: [app, ux]
timestamp: 2026-10-17T20:00:00Z
---

# Notes

- «Puntuación del día» (antes «Calidad del monte») = hábitat × tamaño × lejanía del camino × tiempo × fiabilidad del mapa × factor de citas.
- Factor de citas (2026-10-17): ×1,15 si el sitio tiene citas de nivel «punto», ×1,05 si solo «paraje», ×1 sin citas. Solo se aplica en las regiones con `factor_citas: true` en sitios.json (lo decide la validación por bloques del pipeline; ver «Calibración con citas»). En todas, el Top enseña «Citado: foro / iNat / … (N citas, última AAAA)» y, al pulsarlo, la lista de fuentes (origen, fecha, precisión, distancia, enlace, atribución · licencia) con el aviso de las citas.
- Las capas de idoneidad no pintan valores < 30.
- Selector de especies: con GPS manda el punto meteo del usuario; sin GPS, una seta está activa si lo está en algún punto meteo de la vista del mapa (o a ≤ 40 km del centro si la vista es enorme).
- Desde el Top se abre la ficha de la especie.
- Las fichas buscadas llevan aviso neutro, sin la palabra «comestible».

## Cubierta de copas por sitio (sitios.json v3, 2026-10-18)
- Cada sitio trae `arbol` (moda del MFE en la mancha), `fcc_mfe` (FCC media del MFE), `cubierta_sat` (% de píxeles árbol de ESA WorldCover 2021, 10 m, CC BY 4.0; `arbol_sat.tif`, paso `satelite`) y `cubierta_sat_punto` (300 m alrededor del punto, informativo).
- `factor_cubierta` = 0,3 + 0,7·smoothstep(c / m), c = satélite si hay, si no MFE; m = min(dosel.opt[0], 40). Sin `dosel` o m = 0 → 1. Multiplica la calidad en pipeline (sitios.py) y app (ranking.ts).
- La razón dice «Alcornocal claro, 25 % de copas» (< 10 muy abierto, < 40 claro, < 70 densidad media, resto denso) y avisa si el satélite ve ≥ 15 puntos menos que el MFE o que la mancha alrededor del punto.
- Se eligió WorldCover y no Copernicus HRL TCD 2018 porque esta exige cuenta para descargar. WorldCover es binaria por píxel (no densidad), así que tiende a dar más cubierta que la FCC del MFE en olivares y matorral alto.

# Citations

- commits 56b61c3, 5ba88dd, 42a885c
- app/src/ranking.ts, app/src/hoy-ui.ts, app/src/citas.ts, pipeline/setas_pipeline/citas_sitios.py
- pipeline/setas_pipeline/sitios.py, pipeline/setas_pipeline/cubierta_satelite.py, app/src/razones.ts
