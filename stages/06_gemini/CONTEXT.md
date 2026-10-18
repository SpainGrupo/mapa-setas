# Stage 06_gemini — Contract (ICM Layer 2)

The control point for this stage. Define exactly what it reads, does, and writes. The **Inputs table is the most important part** — name the specific files (and sections) to load, nothing more.

## Inputs
- Layer 4 (working):   ../05_reconocedor/output/
- Layer 3 (reference): ../../knowledge/index.md (solo los conceptos pertinentes)
- Layer 3 (reference): ../../_config/conventions.md

## Process
Worker de Cloudflare como proxy a Gemini; la clave la crea Alexander y va como secreto del Worker. Modelo: GEMINI_MODEL en worker/wrangler.toml. Desde 2026-10-18 Gemini es la primera opinión con conexión (ver ../../knowledge/reference/reconocedor.md).

## Outputs
- worker/ desplegado

## Verify
Puerta de revisión: security-review del Worker antes de desplegar + code-review (high). Antes de dar la etapa por hecha, verification-before-completion.
