# 00 — Scope

**Audited:** the shipped mushroom-foraging PWA "Mapa de setas" (v0.2.0).
- Live: https://spaingrupo.github.io/mapa-setas/
- Source: `setas/app/` — `index.html`, `src/estilos.css`, `src/main.ts`, `src/mapa.ts`, `src/selector-especie.ts`, `src/hoy-ui.ts`, `src/guia-ui.ts`, `src/reconocer-ui.ts`, `src/gemini.ts`, `src/seguridad.ts`, built `dist/`.
- Screenshots: `app/e2e/capturas/*.png` (390-ish px CSS width, rendered @2.77x → 1082×2202) and `app/e2e/capturas/auditoria/despues/360x740-*.png`.

**Screens:** Mapa (species picker, distance-to-access slider, suitability legend, layers, long-press → Acceso card, Ruta a pie with elevation profile + GPS follow), Hoy (day selector to +15 days, confidence, top general, top 10 per species, difficulty filter, calendar 12×12), Mis sitios, Guía (30 fichas, "No confundir con"), Reconocer (offline ONNX model, guided safety questions, Gemini second opinion), Ajustes (offline downloads, normativa).

**Primary user:** Alexander (owner), adult forager around Marbella, ≤2 h drive radius. Spanish UI.
**Primary task:** decide where to go today and get there on foot; secondary: identify a find safely without the app ever claiming edibility.
**Use context:** iPhone Pro Max (430×932 CSS px, Dynamic Island, home indicator), one hand, direct sunlight, gloves or wet hands, offline in the mountains.
**Constraints:** static PWA (Vite + vanilla TS + MapLibre + onnxruntime-web), offline-first, spec §2 safety rules are non-negotiable (never claim edibility; deadly lookalikes red until ruled out; expert warning always visible).
**References:** none given. Owner states the current design is "unconvincing".
