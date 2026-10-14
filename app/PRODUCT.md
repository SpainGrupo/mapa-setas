# Product

<!-- impeccable:product-schema 1 -->

> Written by the executor from `design/design-spec.md`, `design/DESIGN-IS-2026-10-14/03-verdict.md` and the repo (2026-10-14). No live interview was possible in this run (subagent without a question channel): every line below is inferred from those written sources, which Alexander authored or approved. Correct anything stale.

## Platform

web

## Users

One primary user: Alexander, adult forager based in Marbella. Uses the installed PWA on an iPhone Pro Max (430×932, Dynamic Island), one-handed, on slopes, often in direct sunlight, with gloves or wet fingers, frequently without signal. Checks it in short glances between steps. Reads Spanish. Knows the species and wants evidence to judge for himself rather than verdicts.

## Product Purpose

Find wild mushrooms (mainly boletus and *Amanita caesarea*) within two hours' drive of Marbella: where the forest is favourable for each species, whether today is a good day, how far it is to walk from where you can park, and, in the field, compare a found mushroom against its dangerous lookalikes. Success: he picks a place and walks to it, and never mistakes a deadly species because the app sounded certain.

## Positioning

Offline suitability maps per species built from his own pipeline (terrain, forest, weather rules, GBIF validation), plus a walk-from-the-car estimate and an on-device recognizer that shows evidence per dangerous lookalike instead of a verdict.

## Operating Context

Six areas: Mapa (suitability raster, layers, long-press Acceso card, Ruta a pie with elevation profile and GPS follow), Hoy (day up to +15, confidence, top places, 12×12 season calendar), Mis sitios, Guía (30 species sheets), Reconocer (on-device model, guided questions, optional Gemini second opinion), Ajustes (offline downloads, regulations). Zona (weather detail) hangs off Hoy.

## Capabilities and Constraints

- Vite + vanilla TypeScript, MapLibre, onnxruntime-web; offline-first service worker; data in OPFS.
- All behaviour and the e2e suite (`e2e/offline.e2e.mjs`) must keep working.
- Plain Spanish, no jargon; never invent a fact (unknown → TODO).

## Brand Commitments

- Safety (spec §2, non-negotiable): never claim edibility; deadly lookalikes stay red and listed until ruled out; "No sé" never rules out; expert warning always visible on the recognizer result.
- Red reserved for danger; forest green identity; rust for the one primary map action.

## Evidence on Hand

Real species facts and photos (`guia/especies.json`, `guia/fotos`, credits in `guia/CREDITOS.md`), anatomy drawings (`design/shared/anatomia.js`). Places and scores in the design mock-ups are samples, not data.

## Product Principles

1. Evidence over verdicts: show what to look at, never say "it is".
2. The map is the figure; controls are the ground.
3. Works with no signal, in the sun, one-handed.
4. Answer first (where, how far, today), details on demand.

## Accessibility & Inclusion

Sunlight legibility (primary text ≥ 7:1), touch targets ≥ 48 px (56 primary, 64 main FAB), reduced-motion and reduced-transparency respected.
