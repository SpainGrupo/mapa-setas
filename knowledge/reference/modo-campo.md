---
type: Reference
title: Modo campo (microzonas a escala de celda)
description: Qué hace el Modo campo, de dónde salen sus datos (micro.bin) y sus umbrales y límites.
tags: [app, campo, microzonas, idoneidad]
timestamp: 2026-10-18T18:00:00Z
---

# Notes

- Para cuando ya estás en el monte. Se entra desde el botón «Campo» del mapa (solo aparece con tu posición dentro de la región y con datos de microzonas) y desde «Navegar aquí» (botón «Modo campo», se abre encima).
- Datos: `micro.json` + `micro.bin` por región (pipeline `exportar micro`, `setas_pipeline/micro.py`). La malla de 100 m se parte en teselas de 32×32 celdas con capas uint8 (árbol, FCC del MFE, copas por satélite, cubierta desarbolada, orientación, pendiente, índice de humedad, distancia a cauce e idoneidad de cada especie), cada tesela en gzip propio. La app lee solo las teselas del radio (OPFS o HTTP Range). Va en `archivos` del manifest, así que entra en la descarga offline (Marbella 9,5 MB, Alicante 12,3 MB).
- La puntuación de cada celda es la idoneidad del modelo (ya combina árbol, dosel, cubierta, orientación × pendiente, humedad TWI/cauce, suelo, altitud, incendios y edificado). El modo campo solo la ordena y explica: «96/100 · alcornoque, 90 % de copas (satélite, denso) · umbría al noroeste, 17° · fresco (vaguada o arroyo)».
- Microzonas: radio 500 m; celdas ≥ 50/100; de mejor a peor; una celda elegida debe estar a ≥ 120 m de las demás (nunca dos iconos vecinos en cruz); máx. 10. Icono = miniatura de la guía o un dibujito; tocarlo da el porqué, «Ir aquí» y «Guardar».
- Aviso «te sales de la zona buena»: entras con ≥ 50; sales tras 2 lecturas seguidas < 35 (entre 35 y 49 nada cambia); solo si antes estuviste dentro; las lecturas con precisión peor que ±40 m no cuentan. Dice distancia y rumbo a la celda buena más cercana del radio.
- «Cómo buscar <seta>» (modo campo y ficha de la guía): cada línea cita su fuente (perfil del modelo, ficha de la guía o la investigación del 14-10-2026); hojarasca/musgo y distancia al tronco están PENDIENTE porque ninguna fuente de la app lo dice.
- Límite: resolución 100 m (una hectárea); la UI lo dice. Ni el icono ni la ficha dicen nada de comestibilidad ni de si se puede recoger.

# Citations

- pipeline/setas_pipeline/micro.py, app/src/micro.ts, app/src/micro-datos.ts, app/src/como-buscar.ts, app/src/campo-ui.ts
- app/e2e/campo-micro.e2e.mjs
- docs/investigacion/2026-10-14-factores-y-trucos.md
