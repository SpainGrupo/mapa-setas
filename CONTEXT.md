# Mapa de setas — Task Routing (ICM Layer 1)

This file answers "where do I go?" Given what the user wants, route to the stage that handles it.

## Stages
| Stage | Handles |
| --- | --- |
| 01_terreno | Pipeline de terreno: malla de 100 m, relieve, vegetación, suelo, accesos, protegidos, idoneidad por especie y calibración con GBIF. |
| 02_pwa | PWA básica: mapa offline (PMTiles), capas, GPS, mis sitios, GitHub Pages. |
| 03_tiempo | Tiempo (Open-Meteo), semáforo por especie y zona, gráfico de lluvia y temperatura. |
| 04_guia | Guía de especies: fichas, fotos con licencia libre y sección "No confundir con". |
| 05_reconocedor | Reconocedor offline por cámara y comprobación guiada (spike de viabilidad primero). |
| 06_gemini | Cloudflare Worker como proxy a Gemini para reconocimiento online. |
| 07_exportacion | Exportación de capas y sitios a OsmAnd/Locus (GeoJSON/KML, GPX). |

## Shared resources (Layer 3, available to every stage)
- `knowledge/` — OKF bundle. Pull the specific concept(s) a stage needs; don't load the whole bundle.
- `_config/voice.md` — tone and register.
- `_config/conventions.md` — number formatting, language, branding conventions.
- `_config/design-system.md` — brand colors, document/PDF conventions.

## Routing notes
- Conceptos estables en `knowledge/reference/`: multi-región, edificado, titularidad y acceso, calibración con citas, normativa de recolección, vistas y Puntuación del día.
- A request usually enters at one stage and flows forward. The human reviews each stage's `output/` before the next runs.
- To re-run only part of the pipeline, start at the stage whose inputs changed; earlier outputs stay as they are.
