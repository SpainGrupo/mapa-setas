# 03 — Verdict: REDESIGN (by rule; scoped to the language, honesty and theme layer)

The rebuild fixed the structure — map as figure, crosshair "Aquí", Hoy answer-first, a per-pair evidence view on the recognizer — and moved the score from 12 to 15/30, but it still ships a spec-forbidden "Apreciada" badge and edible wording on an unresolved recognizer result, the very jargon the spec bans by name, emoji icons plus a trend material, and no dark/dim theme, so it stays below the 20-point REFINE threshold with #9 at 0.

Why REDESIGN and not REFINE: the Phase 3 rule is mechanical — total 15 < 20 and one principle at 0. Honest scoping: the information architecture, sheets, Hoy layout and comparison structure are not what failed (#2, #3, #5, #10 all rose to 2). What must be redesigned from purpose is (a) how the recognizer speaks about appeal and confidence, (b) the vocabulary and number readouts, (c) the theme (light-only) and icon language. Porting these under new styling would not fix them; they need a decision, not a tweak.

Gains confirmed on evidence (do not lose them):
- #2: first Hoy result + one action above the fold (`10-hoy.png`); crosshair mode (`02-mapa-aqui.png`); Acceso leaves ≈56% map (`03`).
- #3/#5: one token set, one family, glass only on floating chrome with 0/182 contrast failures, worst 6.68:1 (`contraste-vidrio.json`).
- #6 partial: red "Mortal sin descartar en tu foto" banner on the ficha from a result (`28`), NO DESCARTADA / DESCARTADA POR TU RESPUESTA states (`21`, `26`).
- #10: Hoy rows one primary + overflow (`11`).

## Highest-leverage moves
1. **#6 Honest — strip appeal and verdict weight from the recognizer.** Remove `insignia(f.grupo)` from candidate rows (`reconocer-ui.ts:191`) and from the ficha header when opened from a result (`guia-ui.ts:232`); do not render the "Precaución — Considerada comestible…" body box while any mortal is unresolved (`guia-ui.ts:235`, `28`); render "Peligrosas sin descartar" before "Se parecen a tu foto" (`20`); restyle `.banda.b-alto/.b-alta` so similarity/model confidence is never the heaviest chip (`estilos.css:597-598`). Evidence: §3 C1–C4.
2. **#4 Understandable — finish the vocabulary pass the spec already mandates.** Replace "Fiabilidad: …" (`index.html:76-77`, picker `09`) and "sin cobertura" (`index.html:325,333`, toasts `19`) with plain words ("Mapa comprobado / sin comprobar", "sin conexión"); give "Monte 85 de 100" a plain meaning or drop it (`hoy-ui.ts:120`); drop "Zona del punto 29" (`main.ts:916`); show units on tiles (`13`); label the day-chip confidence bars in text (`estilos.css:387`); label the map "Sitio aquí" control (`main.ts:746` vs `01`). Evidence: §3 C5, C6, C9.
3. **#9 Environmentally friendly — a dim/dark theme for dusk.** Remap the `:root` tokens under `prefers-color-scheme: dark` (and a manual toggle in Ajustes) with the same ≥7:1 targets; keep sunlight light as default. Split MapLibre out of the 351 KB gzip entry chunk. Evidence: `estilos.css:15`, `MASTER.md:117`, §4.
4. **#7 Long-lasting — one icon language, glass kept as the exception.** Replace ☠ ⚠ 🟢🟡🔴⚪ ✓ with sprite SVG icons (`guia-ui.ts:227-228`, `guia.ts:29`, `reconocer-ui.ts:264`, `main.ts:419`, `zona.ts:7`, `selector-especie.ts:79`); keep glass only where it earns contrast over the map and make the solid fallback the visual reference. Evidence: §3 C10, §2 V1.
5. **#5/#8 Unobtrusive/Thorough — feedback that doesn't cover the screen.** Move the toast off titles and the pill (bottom, above the tab bar, or inline) (`estilos.css:731-736`, `06b`, `15`–`21`); fix `scroll-margin-top` so jump-linked headings clear the glass header (`estilos.css:403`, `12`); open the ficha from a result inside the Reconocer tab with "← Resultado" (`guia-ui.ts:212-214`); drop the duplicate date input (`10`) and the two native species selects in favour of the photo picker (`14`, `15`).

## Preserve
- Safety logic: mortals always listed, "No sé" never discards, red banner naming unresolved mortals (`guia-ui.ts:217-218`), expert warning fixed and non-dismissible (`index.html:313`).
- Per-pair comparison structure: photo row, numbered field marks shared by table/drawings/"Busca en tus fotos", dashed unverified cells, four-part false-positive block (`comparar.ts`, `reconocer-ui.ts:447`, `21`–`27`).
- Map chrome composition: species pill, two round buttons, Aquí FAB in óxido, crosshair mode, sheets with detents and springs (`hoja.ts`, `01`–`08`).
- Hoy answer-first layout with one primary + overflow (`10`, `11`); calendar 12-month grid with current month marked (`12`).
- OKLCH token roles, red reserved for danger, Atkinson Hyperlegible Next + Mono, 48/56 px touch floor, glass contrast harness `e2e/contraste-vidrio.mjs` and its 0-failure result.
- Candid caveat copy ("No indican que haya setas ni qué setas son", "Estimación: puede haber fincas privadas…").
