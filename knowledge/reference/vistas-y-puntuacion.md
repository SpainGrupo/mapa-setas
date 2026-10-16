---
type: Reference
title: Vistas de la app y Puntuación del día
description: Cómo decide la app qué especies muestra, qué pinta y qué significa la puntuación.
tags: [app, ux]
timestamp: 2026-10-16T09:00:00Z
---

# Notes

- «Puntuación del día» (antes «Calidad del monte») = hábitat × tamaño × lejanía del camino × tiempo × fiabilidad del mapa.
- Las capas de idoneidad no pintan valores < 30.
- Selector de especies: con GPS manda el punto meteo del usuario; sin GPS, una seta está activa si lo está en algún punto meteo de la vista del mapa (o a ≤ 40 km del centro si la vista es enorme).
- Desde el Top se abre la ficha de la especie.
- Las fichas buscadas llevan aviso neutro, sin la palabra «comestible».

# Citations

- commits 56b61c3, 5ba88dd, 42a885c
