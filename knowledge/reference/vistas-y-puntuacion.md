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

# Citations

- commits 56b61c3, 5ba88dd, 42a885c
- app/src/ranking.ts, app/src/hoy-ui.ts, app/src/citas.ts, pipeline/setas_pipeline/citas_sitios.py
