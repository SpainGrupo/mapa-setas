# 03 — Verdict: REDESIGN

The app's logic, data and safety rules are sound, but the interface scores 12/30 because its surfaces present everything at once, hide the main gestures, speak in internal jargon and, on the recognizer, give the user verdict-shaped chips instead of evidence to judge with — so the structure must be rebuilt around one-hand outdoor use, not restyled.

Why not REFINE: the total is below 20, and the failures on #2, #4, #5 and #10 are structural (screen composition, navigation entry points, duplicated pickers), not token-level.

## Highest-leverage moves
1. **#2 Useful / #5 Unobtrusive — map first.** Collapse the Mapa top card (~33% of viewport) into a single compact species pill + layer button; move slider/legend into a bottom sheet with detents; make the Acceso card a sheet that leaves ≥55% of map visible and add a visible "Mantén pulsado el mapa" hint or a crosshair "Aquí" mode. Evidence: 01-inicio.png, acceso-online.png, main.ts:259.
2. **#6 Honest — recognizer as evidence, not verdict.** Replace band chips + "Apreciada" insignia with a comparison view per pair (user photo vs guide photo, feature table, anatomy drawings, explicit false-positive block); block the edible-sheet banner while any deadly lookalike is unexcluded (spec §2). Evidence: reconocer-ui.ts:179,220; guia-ui.ts:205; reconocer-phalloides.png.
3. **#2 Useful / #10 Less — Hoy answers first.** First screen = day strip + the top result; filters into one compact row; each result gets one primary action ("Ruta a pie") and an overflow, not four buttons. Evidence: hoy-ui.ts:117-118, hoy-general.png.
4. **#4 Understandable — plain words.** Rename Semáforo/Fiabilidad/Idoneidad/sin cobertura/Lejos del acceso; one species picker component everywhere. Evidence: §3 C4, §1 S3.
5. **#3 Aesthetic / #9 — a real system.** Spacing and type scales, ≤12 colour tokens, three button styles, borders ≥3:1, a sunlight (high-contrast light) theme plus a dim/dark theme for dusk. Evidence: estilos.css:1-16, §2 V1–V4.

## Preserve (constraints for phase 1)
- Safety logic and its rules: mortals always listed, "No sé" never discards, caution wins on Gemini merge, edibility words stripped (seguridad.ts:199-226, 261-265; gemini.ts:78-100).
- Red as reserved danger colour (`--peligro #a4161a`) and the gravity token set (estilos.css:244-248).
- Forest-green identity (`--verde #1b4332`) and the rust accent for the one primary map action (`--acento #b23a0b`).
- Touch floor 48 px, 56 px primary, 64 px FAB; safe-area gutters (estilos.css:12-15); 3 px focus ring.
- High text contrast (#111 on #f4f1ea, 16.7:1) and bold weights for sunlight.
- The species picker with photo (selector-especie.ts) — generalise it to every species choice.
- Acceso card data model: "Aparcar en", minutes on foot, ascent, honest "Estimación…" caveat; elevation profile with P/max/end labels (perfil-grafico.ts).
- 12-month season strip per species with the current month marked (calendario.ts).
- Guía `comparativa()` photo pair + "Cómo distinguirlas" (guia-ui.ts:165-185) — seed of the new comparison view.
- Candid caveat copy ("No indica que haya setas…", "puede haber fincas privadas…").
- Offline-first, no idle animation, reduced-motion handling.
