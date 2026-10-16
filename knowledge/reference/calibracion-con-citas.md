---
type: Reference
title: Calibración con citas ampliadas
description: Fuentes de citas, filtros y validación espacial que sostienen la fiabilidad del mapa.
tags: [pipeline, calibracion, citas]
timestamp: 2026-10-16T09:00:00Z
---

# Notes

- `citas.py` reúne GBIF, iNaturalist, Observation (solo vía GBIF) y sitios de foros/literatura (`sitios_csv` por región) en un radio alrededor del centro de la región; salida `data/<region>/out/citas.geojson`.
- Uso personal y no comercial: no se excluye ninguna licencia; cada registro guarda licencia y atribución.
- Dedupe: misma especie, < 100 m y misma fecha. Observation.org no se consulta directo (OAuth y anti-bot).
- IMBA: sin servicio de puntos; solicitud de datos enviada a REDIAM el 2026-10-15/16, PENDIENTE de respuesta. No hay datos IMBA en el pipeline.
- Calibración: se descartan citas con incertidumbre > 1000 m (las que no la declaran se conservan); foros y literatura solo calibran con precisión «punto».
- Validación espacial con bloques de 10 km en 5 pliegues; con n < 10 la especie no se juzga («modelo sin calibrar»). Los perfiles no se ajustan con la validación.
- Exportación: el calibrado solo se aplica si la validación confirma el modelo (lift ≥ 1,3).
- La app avisa «Mapa sin comprobar (N citas, hacen falta 10)» en ficha y selector, y la capa «Citas y sitios conocidos» las muestra.

# Citations

- pipeline/setas_pipeline/citas.py, pipeline/setas_pipeline/calibracion.py
- commits 57292c9, c25e995, d814c2e, 56b61c3
