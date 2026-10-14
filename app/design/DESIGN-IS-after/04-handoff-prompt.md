# 04 — Handoff prompt

````
/make-plan Redesign the language, honesty and theme layer of the "Mapa de setas" PWA (setas/app, Vite + vanilla TS, offline-first, iPhone Pro Max 430×932, one hand, sunlight, gloves). Current design failed a Dieter Rams audit at 15/30 (up from 12/30 before the "Instrumento + Liquid Glass" rebuild) with critical gaps in principles #6 honest (1), #4 understandable (1), #9 environmentally friendly (0) and #7 long-lasting (1).

Verdict paragraph (quoted from 03-verdict.md):
> The rebuild fixed the structure — map as figure, crosshair "Aquí", Hoy answer-first, a per-pair evidence view on the recognizer — and moved the score from 12 to 15/30, but it still ships a spec-forbidden "Apreciada" badge and edible wording on an unresolved recognizer result, the very jargon the spec bans by name, emoji icons plus a trend material, and no dark/dim theme, so it stays below the 20-point REFINE threshold with #9 at 0.

Why redesign and not refine: total 15 < 20 with #9 at 0; the failing layer (how the recognizer speaks about appeal and confidence, the vocabulary and number readouts, a light-only theme and emoji icon language) needs new decisions, not token tweaks. The information architecture is NOT in scope: #2 useful, #3 aesthetic, #5 unobtrusive and #10 less design all rose to 2/3.

Non-negotiable safety rules (design-spec §4/§5): never claim edibility (no "comestible", "se puede comer", "apta"); no "Apreciada" badge in the recognizer; mortal/toxic lookalikes red until ruled out; red reserved for danger; expert warning always visible; similarity is not certainty; avoid "semáforo", "fiabilidad", "idoneidad", "sin cobertura", "heurístico".

Preserve from current design:
- Safety logic: mortals always listed, "No sé" never discards, red ficha banner naming unresolved mortals (src/guia-ui.ts:217-218), fixed non-dismissible expert warning (index.html:313).
- Per-pair comparison: photo row, numbered field marks shared by table, drawings and "Busca en tus fotos", dashed unverified cells, four-part "Riesgo de falso positivo" block, DESCARTADA POR TU RESPUESTA state that stays visible (src/comparar.ts, src/reconocer-ui.ts:447; screenshots 21–27).
- Map chrome: species pill, Ficha + Capas round glass buttons, óxido "Aquí" FAB, crosshair mode, sheets with detents and rAF springs (src/hoja.ts; screenshots 01–08).
- Hoy answer-first layout, one primary action ("Ruta a pie") + overflow per result (screenshots 10, 11); 12-month calendar grid (12).
- OKLCH token roles on :root (src/estilos.css:14-49), red only for danger, Atkinson Hyperlegible Next + Mono, 48/56 px touch floor, glass contrast harness e2e/contraste-vidrio.mjs (0 failures / 182 lines, worst 6.68:1).
- Candid caveats: "No indican que haya setas ni qué setas son", "Estimación: puede haber fincas privadas…".

Discard:
- "Apreciada"/group insignia on recognizer candidates and on the ficha opened from a result. Evidence: src/reconocer-ui.ts:191, src/guia-ui.ts:232, screenshots 20, 28. Caused failure on #6.
- Unconditional "Precaución — Considerada comestible por la bibliografía…" box in the ficha body, shown even with an unresolved mortal. Evidence: src/guia-ui.ts:235, screenshot 28. Caused failure on #6.
- Ink-filled similarity/model-confidence chips as the heaviest element ("Parecido alto", "Confianza del modelo: alta"), and listing look-alikes before "Peligrosas sin descartar". Evidence: src/estilos.css:597-598, src/reconocer-ui.ts:186,547, screenshot 20. Caused failure on #6.
- Banned and internal vocabulary: "Fiabilidad: …", "sin cobertura", "Monte 85 de 100", "Zona del punto 29", unitless "Humedad del suelo 0,20", tooltip-only 3-bar confidence glyph on day chips. Evidence: index.html:76-77,325,333; src/hoy-ui.ts:120,153-154; src/main.ts:916; src/estilos.css:387; screenshots 07, 09, 10, 13, 18, 19. Caused failure on #4.
- Light-only theme (`color-scheme: light`, no prefers-color-scheme). Evidence: src/estilos.css:15, design/design-system/MASTER.md:117. Caused failure on #9.
- Emoji as UI icons (☠ ⚠ 🟢🟡🔴⚪ ✓). Evidence: src/guia-ui.ts:227-228, src/guia.ts:29, src/reconocer-ui.ts:264, src/main.ts:419, src/zona.ts:7, src/selector-especie.ts:79. Caused failure on #7.

Top 5 moves from the audit (verbatim):
1. #6 Honest — strip appeal and verdict weight from the recognizer. Remove insignia(f.grupo) from candidate rows (reconocer-ui.ts:191) and from the ficha header when opened from a result (guia-ui.ts:232); do not render the "Precaución — Considerada comestible…" body box while any mortal is unresolved (guia-ui.ts:235, screenshot 28); render "Peligrosas sin descartar" before "Se parecen a tu foto" (screenshot 20); restyle .banda.b-alto/.b-alta so similarity/model confidence is never the heaviest chip (estilos.css:597-598).
2. #4 Understandable — finish the vocabulary pass the spec already mandates. Replace "Fiabilidad: …" (index.html:76-77, picker screenshot 09) and "sin cobertura" (index.html:325,333, toasts screenshot 19) with plain words ("Mapa comprobado / sin comprobar", "sin conexión"); give "Monte 85 de 100" a plain meaning or drop it (hoy-ui.ts:120); drop "Zona del punto 29" (main.ts:916); show units on tiles (screenshot 13); label the day-chip confidence bars in text (estilos.css:387); label the map "Sitio aquí" control (main.ts:746 vs screenshot 01).
3. #9 Environmentally friendly — a dim/dark theme for dusk. Remap the :root tokens under prefers-color-scheme: dark (and a manual toggle in Ajustes) with the same ≥7:1 targets; keep sunlight light as default. Split MapLibre out of the 351 KB gzip / 1.26 MB entry chunk. Evidence: estilos.css:15, MASTER.md:117.
4. #7 Long-lasting — one icon language, glass kept as the exception. Replace ☠ ⚠ 🟢🟡🔴⚪ ✓ with sprite SVG icons (files above); keep glass only where it earns contrast over the map and make the solid fallback the visual reference.
5. #5/#8 Unobtrusive/Thorough — feedback that doesn't cover the screen. Move the toast off titles and the species pill (estilos.css:731-736; screenshots 06b, 15–21); fix scroll-margin-top so jump-linked headings clear the glass header (estilos.css:403; screenshot 12); open the ficha from a result inside the Reconocer tab with "← Resultado" (guia-ui.ts:212-214); drop the duplicate "Otro día" date input (screenshot 10) and the two native species selects in favour of the photo picker (screenshots 14, 15).

Redesign principles in priority order:
1. #6 Honest — the recognizer result shows evidence and danger first; no appetite or edibility signal anywhere on a path that starts at a photo; similarity reads as a description, never as the loudest element.
2. #4 Understandable — every word and number on screen is plain Spanish a first-time forager names correctly without a tooltip; zero spec-banned terms (grep-verifiable).
3. #9 Environmentally friendly — a dim/dark theme honoured via prefers-color-scheme with a manual override, no idle animation, entry chunk < 250 KB gzip with MapLibre split.

Deliverables for the plan:
- Copy inventory: every user-facing string touching recognizer, Hoy, Zona, Ajustes, picker, with old → new and a grep check for the banned list.
- Recognizer result: new order and chip hierarchy (low-fi, labelled, side by side with screenshot 20).
- Dark/dim token map with measured contrast (extend e2e/contraste-vidrio.mjs to the dark theme on vector and satellite tiles).
- Icon set replacing every emoji glyph.
- States checklist (empty, loading, error, success, focus, disabled) with the toast's new placement shown on map, Mis sitios and Reconocer.
- Migration: none for data; cutover = all screenshots in design/capturas/final re-shot in light and dark, and a re-audit with design-is targeting ≥ 20/30 with no principle at 0.

Anti-patterns to guard against:
- Porting old wording under new styling (e.g. "Fiabilidad" → "Fiabilidad del mapa").
- Re-opening the map/Hoy/comparison structure that already scores 2; this redesign is the language, honesty and theme layer.
- Keeping both themes behind a flag indefinitely, or a dark theme that fails ≥7:1 on glass over satellite.
- Redesigning to follow a trend (more glass) rather than the principles above.
````
