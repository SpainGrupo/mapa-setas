# 02 — Scorecard (Dieter Rams, 0–3 each; tie → lower; score the worst instance)

1. Good design is innovative — Score: 2/3
   Evidence: offline suitability map + walking-access estimate + elevation profile + local recognizer with a guided "No sé never discards" safety layer (§3 C6, §1 S5); visual form is a generic form-and-card UI (§2 V9).
   Justification: the safety layer and access model are a real improvement on peer foraging apps, but the interface form imitates stock patterns, so not 3.

2. Good design makes a product useful — Score: 1/3
   Evidence: on Hoy the first result starts below banner + 7 day chips + date input + confidence box + select + 3 chips (§2 V9, hoy-general.png); walking route depends on an unhinted 600 ms long-press (§1 S5, main.ts:259); Reconocer "Ver ficha" leaves the result for the Guía tab and back lands on the list (§3 C5).
   Justification: the tasks are supported but each primary flow carries an unnecessary detour or hidden entry, which is the level-1 anchor.

3. Good design is aesthetic — Score: 1/3
   Evidence: no spacing or type scale (≈20 spacing values, ≈14 px sizes), 111 colour literals with #fff hard-coded 63×, seven button variants, borders at 1.6:1 (§2 V1–V4, V9).
   Justification: more than three inconsistencies across the surface; there is a palette, so not 0.

4. Good design makes a product understandable — Score: 1/3
   Evidence: "Semáforo", "Fiabilidad", "Idoneidad / modelo heurístico", "sin cobertura", "Lejos del acceso", "m³/m³" (§3 C4); long-press with no affordance (§1 S5); four different species-picker widgets for one task (§1 S3).
   Justification: 2–3+ unclear controls with jargon present, but the primary actions are still identifiable, so not 0.

5. Good design is unobtrusive — Score: 1/3
   Evidence: Mapa control card covers ~33% of the viewport, Acceso card leaves ~20% of map visible, Ruta sheet ~40% (§2 V9); every Hoy result carries four full buttons (§1 S1).
   Justification: chrome competes with the map and the results, which are the content.

6. Good design is honest — Score: 1/3
   Evidence: copy is unusually candid (§3 C1) and there are no dark patterns (§3 C3), but: edible-sheet banner "Considerada comestible…" shown even when reached from a result with unexcluded deadly lookalikes, contrary to spec §2 (§3 C6, guia-ui.ts:205); "Apreciada" insignia beside a green "Parecido alto" chip; Gemini "Confianza alta" in green; "mejores sitios" for a heuristic score (§3 C2).
   Justification: 2+ inflations of confidence on a safety-critical surface; nothing deceptive, so not 0.

7. Good design is long-lasting — Score: 2/3
   Evidence: system font, flat surfaces, no fad gradients (the only gradient is the functional suitability legend); emoji glyphs (☠ ⚠ 🟢) used as UI icons (§3 C1, reconocer-ui.ts:242; mapa card).
   Justification: one dated marker (emoji-as-icon); otherwise neutral to the point of anonymity.

8. Good design is thorough down to the last detail — Score: 2/3
   Evidence: focus-visible, disabled, empty, error and status states exist (§2 V6); success toast overlaps content (reconocer-phalloides.png); non-text contrast of borders fails; close × ~30 px visual (§2 V4–V5).
   Justification: states are present but success/feedback is rough, which is the level-2 anchor.

9. Good design is environmentally friendly — Score: 0/3
   Evidence: dark mode not honoured (`color-scheme: light`, estilos.css:16); initial JS 1.745 MB raw / 485 KB gzip in one unsplit chunk; no idle animation (§4).
   Justification: the anchor makes "dark mode ignored" a 0; for a phone used at dusk in the mountains on battery, a dark or dim mode is a real omission even if daylight legibility justifies light as the default.

10. Good design is as little design as possible — Score: 1/3
    Evidence: removable duplicates — 4 species widgets, day chips + date input, safety banner ×6 with two wordings, attribution ×2, 4 buttons per Hoy row, anchor chips styled as filters (§1 S3).
    Justification: 3–5 removable elements/patterns.

**Total: 12/30.** Zero on #9 (not load-bearing). Load-bearing #2, #4, #6 at 1.
