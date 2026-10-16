---
type: Reference
title: Titularidad del terreno y acceso
description: Capa de titularidad (montes públicos, pasos públicos, probablemente privado) y sus límites.
tags: [pipeline, titularidad, legal, acceso]
timestamp: 2026-10-16T09:00:00Z
---

# Notes

- `titularidad.pmtiles` clases: monte_junta, monte_municipal, coto, senal_privado, paso_publico; el resto es «probablemente privado».
- «Probablemente privado» no sale de ningún dato: es la clase por defecto fuera de un monte público. Cotos, vallas y access=private solo refuerzan el aviso; su ausencia no significa acceso libre.
- Montes públicos de Andalucía: Catálogo REDIAM; pasos públicos: vías pecuarias y senderos de uso público.
- Búferes de diseño (PENDIENTE de calibrar): señal privada 30 m, paso público 20 m.
- Los caminos privados quedan fuera de la ruta de acceso.
- Atribución, norma y textos por región en `regiones/<id>.yaml` (`legal.titularidad`).

# Citations

- pipeline/setas_pipeline/titularidad.py
- commits 3dca6a7, d814c2e
