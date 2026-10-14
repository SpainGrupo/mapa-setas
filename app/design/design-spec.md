# Design spec: Mapa de setas, direction exploration (phase 1)

Date: 2026-10-14. This is the shared input for the three parallel direction prototypes. Phase-0 audit: `DESIGN-IS-2026-10-14/` (REDESIGN, 12/30). Its Preserve list (`03-verdict.md`) is binding.

## 1. Product

"Mapa de setas" is an offline-first PWA for finding wild mushrooms (mainly boletus and *Amanita caesarea*) within two hours' drive of Marbella. It is built with Vite, vanilla TypeScript, MapLibre and onnxruntime-web, and installed on an iPhone. There are six areas:

- **Mapa**: suitability raster per species, a slider for minimum distance from access, layers (satellite, routes, restrictions), and long-press to open an **Acceso** card (where to park, minutes on foot, ascent, difficulty). From there: "Cómo llegar en coche", or "Ruta a pie" with an elevation profile and GPS follow.
- **Hoy**: where to go today. A day selector up to +15 days with a confidence level, the overall top list, a top 10 per species, a difficulty filter, and a 12 species × 12 months calendar.
- **Mis sitios**: saved spots.
- **Guía**: 30 species sheets, each with "No confundir con".
- **Reconocer**: an on-device model, guided safety questions, and an optional Gemini second opinion.
- **Ajustes**: offline downloads (~185 MB of maps, 102 MB model) and the official regulations.

## 2. User and context

There is one primary user: Alexander, the owner, an adult forager. The target device is an **iPhone Pro Max: 430×932 CSS px, Dynamic Island, home indicator, safe areas 59 px top and 34 px bottom.** He uses it with one hand, standing on a slope, often in direct sunlight, often wearing gloves or with wet or muddy fingers, and often with no signal. He checks it in short glances between steps. He reads Spanish. He knows the species, but he wants to judge for himself instead of being told.

## 3. Core message per screen

1. **Mapa + Acceso**: "Here is good forest; this is how far it is from where you can park." The map is the figure; controls are the ground. The Acceso card must leave at least 55% of the map visible. The long-press needs a visible equivalent: a crosshair "Aquí" mode or a hint.
2. **Hoy**: "Go here today." The first result and the day must be above the fold. Each result has one primary action ("Ruta a pie"); everything else goes into an overflow. Confidence is shown in plain words. The calendar is a dense, scannable 12×12 grid with the current month marked.
3. **Reconocer result**: "Here is the evidence. You decide, and an expert confirms." This is the screen that has to do the most new work:
   - **Comparison per pair**: the top candidate against **each** dangerous lookalike (phalloides, verna, muscaria for caesarea). For each pair:
     - side-by-side photos: his photo ("Tu foto (ejemplo)") next to guide photos;
     - a feature table with the columns **rasgo | candidato | peligrosa | lo que tú respondiste / lo que se ve**;
     - **anatomy drawings** for the deciding features;
     - a **"Riesgo de falso positivo"** block covering four things: what makes them look alike, which feature separates them, how much the separation can be trusted, and what extra photo to take.
   - Deadly lookalikes stay **red and visible** until ruled out, with the state "NO DESCARTADA".
   - A lookalike that has been ruled out says so ("DESCARTADA POR TU RESPUESTA"), stays reachable, and does not vanish.

## 4. Non-negotiable safety (spec §2)

- **Never claim edibility.** No "comestible", "se puede comer", or "apta" anywhere. No green "OK" or tick next to the candidate. No "Apreciada" badge in the recognizer.
- Mortal and toxic lookalikes show in **red** until ruled out. **Red is reserved for danger**: it is never used for brand, decoration or the map FAB.
- The expert warning is **always visible** on the result. It is not dismissible, is not collapsed, and must not be scrolled away with no trace. A sticky footer or a pinned line is acceptable.
- Similarity is not certainty. Use "Se parece mucho a tu foto", never "Es una oronja" and never a percentage presented as confidence.

## 5. Tone

The tone is calm, factual and outdoorsy, closer to a field instrument and a naturalist's field guide than to a consumer lifestyle app. There are no jokes near danger. The copy is plain Spanish with no jargon: avoid "semáforo", "fiabilidad", "idoneidad", "sin cobertura" and "heurístico". Prefer "Buen momento", "Previsión fiable", "Zonas favorables" and "Sin conexión".

## 6. Output format (same for all three)

- Each direction is **one static HTML file**, `app/design/directions/<slug>.html`. It holds several artboards, each a `<section class="screen" data-shot="NN-name">` exactly **430×932**, plus `shared/frame.js`, which injects the status bar, Dynamic Island and home indicator.
- Required artboards, at minimum:
  - `01-mapa`: Mapa with the Acceso card open, showing the route line, P marker and point.
  - `02-hoy`: Hoy with the day selector, the confidence line and the top results.
  - `03-calendario`: the 12×12 calendar.
  - `04-reconocer-resumen`: the result summary, with the candidate, the red unexcluded lookalikes and the expert warning.
  - `05-reconocer-comparar`: the caesarea vs phalloides pair, with photos, the feature table and drawings.
  - `06-reconocer-falso-positivo`: the false-positive block plus the egg-cut drawings.
  - More artboards are welcome, for example the ruta a pie profile or the muscaria pair.
- Long screens: put the content in a `.scroll` child and set `data-scroll="N"` on the section to show a scrolled state.
- Rendering: `NODE_PATH=$(npm root -g) node shared/render.mjs directions/<slug>.html capturas/<slug>` produces `capturas/<slug>-NN-name.png` at 430×932 @2x. The page must render with 0 page errors.

## 7. Shared assets (all three must use them)

- `shared/anatomia.js`: SVG anatomy drawings, filled with `<div data-anat="key">`. The keys are: volva-saco, volva-verrugas, anillo-falda, anillo-doble, anillo-ausente, himenio-laminas, himenio-poros, himenio-pliegues, huevo-caesarea, huevo-mortal, pie-reticulo, pie-serpiente, pie-jaspeado and carne-azulea. You may theme them with `--anat-ink`, `--anat-paper`, `--anat-soil` and `--anat-shade`. Do not redraw them and do not recolour the meaningful colours (orange, yellow, blue, olive). The `"huevo"` key in `datos.js` stands for the pair huevo-caesarea / huevo-mortal.
- `shared/datos.js` (`window.SETAS`): all content. Use it; do not invent other facts. Places and scores are sample values.
- `shared/fotos/*.jpg`: real guide photos. Credit each photo shown in the comparison, small but readable (≥11 px), using `SETAS.creditos`.
- `shared/mapa/mapa-z12.png`, `mapa-z14.png` and `mapa-z15.png`: real map renders from the current app (suitability raster over topo, 860×1864). Use them as the map background, and draw the route, markers and crosshair on top in SVG.

## 8. Constraints from the Preserve list

- Touch targets: at least 48 px; at least 56 px for primary actions; at least 64 px for the main floating action.
- Body text at least 16 px; labels at least 13 px. Text contrast at least 7:1 for primary text (sunlight). Non-text borders at least 3:1.
- Forest-green identity (`#1b4332` family) and the rust accent (`#b23a0b` family) may be reinterpreted, but not discarded without a reason. Danger red is `#a4161a`-family and is used only for danger.
- Primary actions sit in the thumb zone, the bottom 40% of the screen.
- Interactive elements come from at most three button styles.

## 9. Image needs

Images are content, not decoration: real photos are required in the recognizer comparison and as species thumbnails. Drawings are required for anatomy. No stock imagery, no AI-generated imagery, and no SVG drawings of people or scenery.

## 10. Visual motif hypothesis

The content offers its own motifs:

- the **field mark**: a naturalist's arrow pointing at the one feature that separates two species;
- the **contour line and elevation profile**, the shape of the walk;
- the **12-month season strip**;
- the **cut egg**, a cross-section that reveals the truth inside.

Each direction should grow its form from one of these motifs and name its **signature element**.

## 11. Genericity gate (apply before finishing)

- Ask: "Would I make the same design for any similar brief?" If yes, revise.
- Avoid these AI-cliché looks unless the brief justifies them:
  - warm cream with a high-contrast serif and terracotta;
  - near-black with a single acid accent;
  - hairline-rule broadsheet.
- No purple gradients, no emoji as icons, no rounded cards with a coloured left border.
