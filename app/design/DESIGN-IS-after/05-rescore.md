# 05 — Rescore, round 2 (after commit `b3bed52`)

Same rules as rounds 0–1: ten Rams principles, 0–3 anchors from `02-scorecard.md`, tie → lower, score the worst instance. Evidence: code at `b3bed52`, `capturas/final/*.png` (light, re-shot) and `capturas/final-oscuro/*.png` (dark, 30 screens), `capturas/final/contraste-vidrio-oscuro.json`, rebuilt `dist/`. No source modified.

## Builder's claims, verified

| Claim | Verified? | Evidence |
|---|---|---|
| No group badge on recognizer candidates except Tóxica/MORTAL | Yes | `reconocer-ui.ts:192`; `20-reconocer-resumen.png` (light + dark) shows only "⚠ MORTAL" chips |
| Ficha from an unresolved result: red banner, no "Apreciada", no "Precaución… comestible" box | Yes | `guia-ui.ts:188,242,245`; `28-ficha-desde-reconocer.png` (header has no badge; body goes straight to "Rasgos clave") |
| "Peligrosas sin descartar" before "Se parecen a tu foto" | Yes | `20` opens on the red list |
| Similarity chip is a light outline | Yes | `estilos.css:609` (`.banda` 1.5 px `--regla` border, `--tinta-2` text); also covers Gemini "Confianza del modelo" |
| Back button "Tu resultado" returns to Reconocer | Yes | `guia-ui.ts:218-220`, `28`; the tab bar still highlights **Guía** while the ficha is open (`28`, both themes) |
| "Fiabilidad" → "Mapa comprobado: acierta bien / a medias / poco" · "Mapa sin comprobar" | Yes | `09-elegir-especie.png`, `07-capas.png` |
| "sin cobertura" → "sin conexión" | Yes | `18-ajustes.png`, `19` toast; grep finds no UI string left |
| "Calidad del monte: 85 de 100", plain Zona line, m³/m³ on tile, day-chip text | Yes | `10-hoy.png`, `13-zona.png` |
| FABs labelled Guardar / Centrar | Yes | `01-mapa.png` |
| Dusk theme via `prefers-color-scheme` + "Colores" setting | Yes, UI only | `estilos.css:752-808`, pre-paint script `dist/index.html:15`; the **map tiles are not dimmed** (`final-oscuro/01`, `03`, `13a`: bright vector map under dark chrome) |
| Emoji icons gone | Yes | grep for ☠ ⚠ 🟢🟡🔴⚪ ✓ in `src/*.ts` + `index.html` returns nothing |
| Dark glass contrast 0 failures | Yes | `contraste-vidrio-oscuro.json`: 10 scenes, 0 failures, worst 6.00:1 (mapa-reposo-2) |
| Toast at the bottom above the tab bar | Yes, with a regression (below) | `estilos.css:742-743` |
| Mis sitios one primary | Yes | `15-mis-sitios.png` ("Cómo llegar" filled) |

## New finding (regression)

**The toast now lands on the expert warning.** `.toast` is `position: fixed; bottom: calc(var(--pie) + 12px); z-index: 40` (`estilos.css:742-743`). `.aviso-fijo` is `position: sticky; bottom: calc(var(--pie) + 8px); z-index: 4` (`estilos.css:692-693`). They occupy the same slot, so for 3.5 s (`main.ts:51-57`) the toast hides the warning "No consumas ninguna seta sin la confirmación de un experto". It is captured doing so on the result, comparison and drawings screens in both themes: `20`, `21`, `22` (`final/` and `final-oscuro/`). Spec §4 says the warning is *always visible*.

The same toast also covers sheet content and actions while it shows:
- the Acceso buttons "En coche / Ruta a pie" (`final-oscuro/08-satelite-acceso.png`)
- the Ruta figures (`06b`)
- the Capas list (`07`)

## Scorecard

1. Good design is innovative — **2/3** (round 1: 2)
   Evidence: per-pair comparison with linked field marks, dashed unverified state and persistent DESCARTADA, unchanged (`21`–`26`). The trait table is still long paragraph cells (`23`).
   Justification: the pattern is still novel but not yet restrained, so not 3.

2. Good design makes a product useful — **2/3** (round 1: 2)
   Evidence: Hoy is answer-first (`10`). Labelled FABs (`01`). The ficha now returns to the result (`guia-ui.ts:220`). Adjacent extra steps remain:
   - day chips plus a separate date input for +8…+15 (`10`)
   - a native species `<select>` in Nuevo sitio and in Mis sitios beside the photo picker (`14`, `15`)
   - the tab bar shows Guía while you are inside the result flow (`28`)
   Justification: the primary tasks are direct and only the adjacent surfaces add steps, which is the 2 anchor.

3. Good design is aesthetic — **2/3** (round 1: 2)
   Evidence: one token system carried into a coherent dark theme. Glass passes on real tiles in both themes (worst 6.68 light, 6.00 dark). Remaining issues:
   - the "Calendario" heading still ghosts under the glass header (`12`, both themes; `estilos.css:403` unchanged)
   - the browser-default "Choose File / No file chosen" control at 44 px (`14`, both themes)
   - in dark, bright untoned map tiles sit against near-black chrome (`final-oscuro/01`, `13a`)
   Justification: about two rendered inconsistencies on a visible system, which is the 2 anchor.

4. Good design makes a product understandable — **2/3** (round 1: 1)
   Evidence: every term the spec bans is gone. Plain readouts: "Calidad del monte", "previsión fiable / media / solo tendencia" on the day chips, "Zona elegida en el mapa…", "Guardar" and "Centrar". Remaining:
   - "Balance 30 días −14 mm" and "0,20 m³/m³" are technical, and only explained behind "Qué significan" (`13`)
   - the dashed-box legend still needs its explanatory paragraph (`21`)
   Justification: no jargon on the primary controls and about one readout that still needs a gloss, which is the 2 anchor.

5. Good design is unobtrusive — **2/3** (round 1: 2)
   Evidence: the map chrome is quiet and labelled (`01`). The toast no longer covers titles. Worst instance: the toast covers Acceso's primary actions (`final-oscuro/08`) and the expert warning (`20`–`22`).
   Justification: the chrome is quiet at rest, but transient chrome still sits on content and actions, so not 3.

6. Good design is honest — **2/3** (round 1: 1)
   Evidence: on the recognizer path there is no appetite badge, no edibility box and no heavy confidence chip, and danger comes first (`20`, `28`). One minor inflation remains: "Mejores sitios" for a heuristic ranking (`index.html:199`).
   Justification: this is the ≤1 minor inflation anchor (2). Not 3 because the always-visible expert warning is briefly hidden by the toast on the result.

   Separate spec-reading question, not scored here: "Considerada comestible por la bibliografía" is still the banner of an edible ficha opened from the Guía (`17`). It is attributed and paired with the expert warning, but spec §4 reads "No 'comestible' … anywhere". The owner should confirm that the guide context is exempt.

7. Good design is long-lasting — **2/3** (round 1: 1)
   Evidence: the emoji icons are replaced by sprite/mask SVG. Liquid Glass remains as the one dated marker, kept by the owner's decision and fenced to floating chrome.
   Justification: one dated marker is the 2 anchor.

8. Good design is thorough down to the last detail — **2/3** (round 1: 2)
   Evidence: all six states are present in both themes, and the reduced-transparency and contrast fallbacks are kept. Rough edges:
   - feedback placement collides with the safety warning and with sheet actions (regression above)
   - the calendar heading scroll offset is unfixed (`12`)
   - the file control (`14`)
   Justification: no state is missing; feedback is the one rough state.

9. Good design is environmentally friendly — **1/3** (round 1: 0)
   Evidence: the dark theme is honoured for the UI with a manual override, but the map, which is the largest surface, stays at full daylight brightness (`final-oscuro/01`, `03`, `13a`). The entry chunk is unchanged at 1,265,873 B raw / ≈351 KB gzip with MapLibre inside (`dist/assets/index-CoQWsnJ9.js`). There is no idle animation and reduced motion is respected.
   Justification: the 0 trigger ("dark mode ignored") no longer applies. The entry still falls in the 500 KB–2 MB band on raw size (it is under 500 KB only gzipped), and the dark mode is partial. Under tie → lower this is 1, not 2.

10. Good design is as little design as possible — **2/3** (round 1: 2)
    Evidence: Mis sitios now has one primary per row. Removable or mergeable remainders: the date input next to the chips (the chips could run to +15) and the two native species selects.
    Justification: two removable patterns is the 2 anchor.

| # | Principle | Round 0 (before rebuild) | Round 1 | Round 2 |
|---|---|---|---|---|
| 1 | Innovative | 2 | 2 | 2 |
| 2 | Useful | 1 | 2 | 2 |
| 3 | Aesthetic | 1 | 2 | 2 |
| 4 | Understandable | 1 | 1 | 2 |
| 5 | Unobtrusive | 1 | 2 | 2 |
| 6 | Honest | 1 | 1 | 2 |
| 7 | Long-lasting | 2 | 1 | 2 |
| 8 | Thorough | 2 | 2 | 2 |
| 9 | Environmentally friendly | 0 | 0 | 1 |
| 10 | Less design | 1 | 2 | 2 |
| | **Total** | **12/30** | **15/30** | **19/30** |

## Verdict: REDESIGN (unchanged, by rule)

The total is 19/30. That is one point under the REFINE threshold of 20, and no principle is at 0. The Phase 3 rule is mechanical, so the verdict stays REDESIGN, and the first line of `03-verdict.md` is unchanged.

In substance, every remaining gap is local, not structural. The two moves that would most directly lift the score:
1. **Blocker (spec §4):** keep the expert warning visible while a toast shows. Either stack the toast above `.aviso-fijo` (offset it by the warning's height when `#rec-aviso-final` is on screen) or suppress non-safety toasts on Reconocer. Also keep toasts off open sheet actions. Evidence: `estilos.css:692-693` vs `742-743`; screenshots `20`–`22` and `final-oscuro/08`.
2. **#9 → 2 (total 20, REFINE):** split MapLibre out of the entry chunk (lazy `import()` on first map paint) so raw initial JS drops under 500 KB, and/or dim the map tiles in the dark theme (raster/vector paint opacity or a `.maplibregl-canvas` filter scoped to `[data-tema=oscuro]` / dark scheme).

Further polish, not needed for the threshold:
- `scroll-margin-top` on the calendar heading (`estilos.css:403`)
- highlight Reconocer in the tab bar while a ficha opened from a result is shown (`28`)
- let the day chips run to +15 and drop the date input (`10`)
