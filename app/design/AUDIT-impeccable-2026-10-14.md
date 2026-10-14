# Phase 4 · Gate 1: impeccable audit + polish (2026-10-14)

Target: the rebuilt app (`index.html`, `src/estilos.css`, `src/hoja.ts`, `src/comparar.ts`, `src/reconocer-ui.ts`, `src/hoy-ui.ts`, `src/guia-ui.ts`, `src/main.ts`). Screenshots at 430×932 with simulated safe areas (59/34) and Dynamic Island: `capturas/ronda1/` (round 1) and `capturas/final/` (round 2, after fixes).

## Audit health score

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Glass text measured ≥ 4.6:1 worst-case on real tiles (AA everywhere); `prefers-reduced-transparency`, `prefers-contrast: more` and no-`backdrop-filter` fallbacks go solid. Remaining gap: scientific-name italics at 14 px in the pill. |
| 2 | Performance | 3 | `backdrop-filter` only on ~8 floating surfaces; sheets animate `transform` (+ `clip-path` while lowered) via rAF springs; `will-change` only on `.hoja`. Fonts 74 KB, precached. |
| 3 | Responsive | 3 | Built for 430×932; e2e runs at Pixel 7 (412 px). Six tabs fit at 12 px labels; no horizontal scroll. Large Dynamic Type not tested (PWA uses px). |
| 4 | Theming | 3 | One OKLCH token set on `:root`; map/chart data colours stay fixed on purpose (suitability ramp, GR/PR/SL, rain chart). Light only (sunlight-first; documented in MASTER.md). |
| 5 | Implementation integrity | 3 | Coherent "instrument" system: one pill, round glass controls, sheets with detents, departure-board rows, numbered field marks. Detector: 3 findings, all verified false positives (see below). |
| **Total** | | **15/20** | **Good** |

## Detector (`detect.mjs`), verified

- `broken-image` on `#foto-sitio` — false positive: hidden `<img>` filled from a Blob by `abrirSitio()`.
- `aphoristic-cadence` ("…No indican que haya setas…") — kept on purpose: candid caveat copy is on the Preserve list.
- `border-accent-on-rounded` (`.k-banda`, line ~482) — false positive: a 18×12 legend swatch for the weather-window band, not a card.

## Glass contrast on real tiles (`e2e/contraste-vidrio.mjs`)

Method: for every text line inside `.vidrio`, take its client rects, hide the text, screenshot, and find the worst background pixel under each rect; WCAG ratio against the computed text colour. Scenes: chrome at rest at z14 and z12, Acceso sheet, Capas sheet, Zona card — on the vector map and on PNOA satellite (real network tiles).

| Scene | Lines | Worst ratio (before fix) | Worst ratio (after) |
|---|---|---|---|
| Map · rest | 12 | 4.84:1 ("Aquí" rust word in the hint) | see `capturas/final/contraste-vidrio.json` |
| Map · Acceso | 23 | 7.13:1 (amber caveat) | |
| Map · Capas | 27 | 7.70:1 | |
| Satellite · rest | 12 | 4.64:1 ("Aquí") | |
| Satellite · Acceso | 23 | 6.95:1 | |
| Satellite · Capas / Zona | 27 / 14 | 7.28:1 / 7.32:1 | |

Fix applied: the "Aquí" word in the hint darkened from `--oxido` to `oklch(43% 0.14 38)`.

## Fixed in this gate (batch)

1. Round glass buttons (Ficha, Capas) lost their tint (`.btn-redondo` reset the background) → explicit glass background.
2. Bottom sheets resting at a middle detent showed their lower half through the tab bar → `clip-path` follows the sheet offset.
3. Sheet opened while content still loading kept the old detent target → re-target the spring on resize, keeping velocity.
4. Dragging a sheet selected text across the page → `user-select: none` on the map chrome and while dragging.
5. "Dejar de seguir" fell below the middle detent while following GPS → buttons move to the top in follow mode.
6. Ruta figures wrapped their units ("36 / min") → `nowrap`, three figure columns, difficulty on its own line.
7. Class collision `.pista` (map hint vs guide carousel track) made the guide photos circular → hint renamed `.pista-mapa`.
8. Zona back button shared `.btn-volver` with the guide (strict-mode clash in e2e) → `.btn-atras`.
9. Hoy: first result not above the fold → jump links and explanatory note moved below the list; confidence line shortened; long walk times shown as "1 h 53" numerals.
10. Recognizer comparison table: three narrow columns produced 40-line cells → each trait is a block with labelled lines (candidata / peligrosa / tú).
11. Zona card overlapped the Aquí FAB → FABs rise above it.
12. Reduced motion: replaced the global 1 ms kill with intentional cross-fades (CSS keyframes and sheet entry).

## Deferred (handoff)

- Pinned field-mark points on photos need per-photo coordinates (data work); numbers live on rows, drawings and the "Busca en tus fotos" legend.
- Dim/dark theme for dusk (MASTER.md §9).
- Dynamic Type: sizes are px; a rem pass would let iOS text size scale the UI.
