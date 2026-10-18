---
type: Reference
title: Calibración con citas ampliadas
description: Fuentes de citas, filtros y validación espacial que sostienen la fiabilidad del mapa.
tags: [pipeline, calibracion, citas]
timestamp: 2026-10-17T20:00:00Z
---

# Notes

- `citas.py` reúne GBIF, iNaturalist, Observation (solo vía GBIF) y sitios de foros/literatura (`sitios_csv` por región) en un radio alrededor del centro de la región; salida `data/<region>/out/citas.geojson`.
- Uso personal y no comercial: no se excluye ninguna licencia; cada registro guarda licencia y atribución.
- Dedupe: misma especie, < 100 m y misma fecha. Observation.org no se consulta directo (OAuth y anti-bot).
- IMBA: sin servicio de puntos; solicitud de datos enviada a REDIAM el 2026-10-15/16, PENDIENTE de respuesta. No hay datos IMBA en el pipeline.
- Calibración: se descartan citas con incertidumbre > 1000 m (las que no la declaran se conservan); foros y literatura solo calibran con precisión «punto».
- Validación espacial con bloques de 10 km en 5 pliegues; con n < 10 la especie no se juzga («modelo sin calibrar»). Los perfiles no se ajustan con la validación.
- Exportación: el calibrado solo se aplica si la validación confirma el modelo (lift ≥ 1,3).
- Citas en los sitios candidatos (2026-10-17, `citas_sitios.py`, lo llama `sitios.py`): a cada sitio, las citas de su especie a ≤ max(1 km, precisión) con tope 5 km (precisión > 5 km no se asigna; sin precisión, ≤ 1 km y cuenta como paraje). Nivel «punto» si alguna es precisa (≤ 1 km) y está a ≤ 1 km; si no, «paraje». Campo `citas` en sitios.json (versión 2); textos que hablen de comestibilidad no pasan.
- Calibración del factor de citas del ranking (×1,15 punto / ×1,05 paraje): validación por bloques (los mismos 10 km × 5 pliegues). En cada pliegue el factor sale solo de las citas de los otros pliegues y se evalúan las citas del pliegue que tienen algún sitio a ≤ 1 km («alcanzables»): lift = aciertos en el top 10 / aciertos de un top al azar. Activo por región si hay ≥ 10 alcanzables y el lift con factor no baja; si no, solo etiqueta. Informe: `data/<region>/out/validacion_citas.md`, con un complemento temporal informativo.
- Resultado 2026-10-17: Marbella 14 alcanzables, lift 1,09 sin y 1,09 con → factor activo (prueba de poca potencia: solo 10 sitios evaluados cambian de factor). Alicante 6 alcanzables (lift 0,46 = 0,46) → sin prueba, solo etiqueta. Sitios con citas: Marbella 9 punto + 36 paraje; Alicante 5 punto + 1 paraje. Los sitios casi nunca caen a ≤ 1 km de una cita, así que la validación tiene poca potencia en ambas regiones.
- Auditoría de fuentes abiertas (2026-10-18, `docs/investigacion/2026-10-18-citas-abiertas.md`): GBIF sin registros nuevos desde el 15/10, iNat +1/−3, Mushroom Observer 0 citas de nuestras especies (y ya llega vía GBIF), iNat «casual» 1 útil → no se integra nada. Hueco de *Lactarius* en Pinar del Rey/San Roque: lo causa la altitud mínima de 200 m de los perfiles (6 citas abiertas a ≤4 km con idoneidad 0); override de altitud solo para Marbella PROPUESTO, no aplicado.
- La app avisa «Mapa sin comprobar (N citas, hacen falta 10)» en ficha y selector, y la capa «Citas y sitios conocidos» las muestra.

# Citations

- pipeline/setas_pipeline/citas.py, pipeline/setas_pipeline/calibracion.py, pipeline/setas_pipeline/citas_sitios.py
- commits 57292c9, c25e995, d814c2e, 56b61c3
