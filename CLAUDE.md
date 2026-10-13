# Mapa de setas — Agent Identity (ICM Layer 0)

Proyecto: web app (PWA) para buscar setas (boletus y Amanita caesarea) a ≤2 h en coche de Marbella. Pipeline Python en el Mac + PWA estática.

## ICM (Layer 0)
- Orden de lectura: este archivo → `CONTEXT.md` → solo los Inputs del stage que toca.
- Stages: `01_terreno` · `02_pwa` · `03_tiempo` · `04_guia` · `05_reconocedor` · `06_gemini` · `07_exportacion` (las 7 fases de la hoja de ruta).
- Spec: `docs/specs/2026-10-13-mapa-setas-design.md`. Plan Fase 1: `docs/superpowers/plans/2026-10-13-mapa-setas-fase1-terreno.md`.
- Conocimiento estable: `knowledge/` (bundle OKF). Reglas: `_config/` (hereda de `../_config/`).
- Código: `pipeline/` (Python 3.12, uv; nunca pip ni el python del sistema).
- Regla de seguridad no negociable: la app nunca afirma que una seta sea comestible (spec §2).
- Nunca inventar un hecho: lo desconocido es `TODO` / `PENDIENTE`. Edita la fuente, no el output.
