# Stage 01_terreno — Contract (ICM Layer 2)

The control point for this stage. Define exactly what it reads, does, and writes. The **Inputs table is the most important part** — name the specific files (and sections) to load, nothing more.

## Inputs
- Layer 4 (working):   pipeline/fuentes.yaml (Tarea 1), docs/superpowers/plans/2026-10-13-mapa-setas-fase1-terreno.md
- Layer 3 (reference): ../../knowledge/index.md (solo los conceptos pertinentes)
- Layer 3 (reference): ../../_config/conventions.md

## Process
Ejecutar las tareas 0–10 del plan de la Fase 1: descargar fuentes, generar capas GeoTIFF alineadas en EPSG:25830 y puntuar idoneidad por especie.

## Outputs
- capas en pipeline/data/out/ (no versionadas), informe de calibración y PNG de vista previa -> output/

## Verify
Puerta de revisión: code-review (high) + revisión del informe de calibración con Alexander. Antes de dar la etapa por hecha, verification-before-completion.
