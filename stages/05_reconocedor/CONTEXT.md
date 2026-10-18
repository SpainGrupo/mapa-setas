# Stage 05_reconocedor — Contract (ICM Layer 2)

The control point for this stage. Define exactly what it reads, does, and writes. The **Inputs table is the most important part** — name the specific files (and sections) to load, nothing more.

## Inputs
- Layer 4 (working):   ../04_guia/output/
- Layer 3 (reference): ../../knowledge/index.md (solo los conceptos pertinentes)
- Layer 3 (reference): ../../_config/conventions.md

## Process
Spike de viabilidad del modelo offline (licencia, tamaño, precisión) y luego integración con comprobación guiada. Desde 2026-10-18 el modelo local es el respaldo sin conexión y el contraste de Gemini; flujo, dobles relevantes y límites en ../../knowledge/reference/reconocedor.md.

## Outputs
- modelo ONNX y comprobación guiada

## Verify
Puerta de revisión: code-review (max): una phalloides nunca sale sin alerta roja. Antes de dar la etapa por hecha, verification-before-completion.
