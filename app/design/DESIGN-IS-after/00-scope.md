# 00 — Scope (gate 4, independent re-audit after the rebuild)

**Audited:** the rebuilt "Mapa de setas" PWA (direction "Instrumento" + Liquid Glass, commit `e32af96` plus uncommitted gate-3 changes in `app/index.html`, `src/estilos.css`, `src/hoja.ts`, `src/main.ts`, `src/reconocer-ui.ts`).
- Source read: `app/index.html`, `app/src/estilos.css`, `hoja.ts`, `comparar.ts`, `reconocer-ui.ts`, `hoy-ui.ts`, `guia-ui.ts`, `guia.ts`, `main.ts`, `zona.ts`; built `app/dist/assets/`.
- Screenshots: `app/design/capturas/final/01…28-*.png` (30 screens, 860×1864 = 430×932 @2x, simulated Dynamic Island and safe areas). Pixel coordinates below are in that 860×1864 frame.
- Measurements: `app/design/capturas/final/contraste-vidrio.json` (10 scenes, glass text on real vector and PNOA tiles).
- Other gate artifacts read (claims, not evidence): `AUDIT-impeccable-2026-10-14.md`, `MOTION-review-2026-10-14.md`, `COPY-humanizer-2026-10-14.md`.
- Baseline: `app/design/DESIGN-IS-2026-10-14/` (12/30, REDESIGN). Same ten principles, same 0–3 anchors, same tie-break (lower) and worst-instance rules, so scores are comparable.

**Screens:** Mapa (pill, crosshair "Aquí", Acceso sheet, Ruta a pie + profile + GPS follow + off-route, Capas, satélite, species picker), Hoy (day chips, first result, overflow, calendar, Zona), Nuevo sitio, Mis sitios, Guía (list, ficha), Ajustes, Reconocer (photos, summary, per-pair comparison, drawings, trait table, false-positive block, Matamoscas pair, discarded pair, questions, ficha opened from the result).

**Primary user / task:** unchanged from baseline — Alexander, adult forager around Marbella; decide where to go today and walk there from the car; secondarily identify a find without the app ever implying edibility.
**Use context:** iPhone Pro Max 430×932, one hand, sunlight, gloves, offline.
**Non-negotiables:** `app/design/design-spec.md` §4 (never claim edibility; no "Apreciada" badge in the recognizer; red reserved for danger; expert warning always visible) and §5 (no "semáforo", "fiabilidad", "idoneidad", "sin cobertura", "heurístico").
**Method:** orchestrator read the code and every screenshot directly (contact sheets + full-resolution crops); no source file was modified. The running build at `127.0.0.1:8765` was not driven; behaviour claims rest on code and screenshots.
