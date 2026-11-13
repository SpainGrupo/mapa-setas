# Stage 03_tiempo — Contract (ICM Layer 2)

The control point for this stage. Define exactly what it reads, does, and writes. The **Inputs table is the most important part** — name the specific files (and sections) to load, nothing more.

## Inputs
- Layer 4 (working):   ../02_pwa/output/
- Layer 3 (reference): ../../knowledge/index.md (solo los conceptos pertinentes)
- Layer 3 (reference): ../../_config/conventions.md

## Process
Integrar Open-Meteo, indicadores de lluvia y temperatura y semáforo por especie. TODO: plan detallado pendiente.

## Outputs
- módulo de tiempo y semáforo en la PWA

## Verify
Puerta de revisión: code-review (high). Antes de dar la etapa por hecha, verification-before-completion.

## Estado a 2026-11-13
Semáforo v3 con probabilidad estimada (0–100) y color derivado de ella; aviso diario de ventanas con `--region`. Detalle y calibración (281 citas, 843 controles): `../../knowledge/reference/vistas-y-puntuacion.md` y `../../docs/investigacion/2026-11-07-semaforo-probabilidad.md`.
