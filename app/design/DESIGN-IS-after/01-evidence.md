# 01 — Evidence

Collected by the orchestrator from source, built assets and the 30 screenshots in `capturas/final/`. Facts only; scoring lives in `02-scorecard.md`.

## 1. Structural
- **S1 Map chrome at rest** (`01-mapa.png`): one species pill + Ficha + Capas (top), three round controls (sitio, centrar, "Aquí" FAB) + attribution "i" (right), six-tab glass bar. A one-line hint card "Mantén pulsado el mapa o pulsa Aquí…" (y≈160–215). Map occupies the figure.
- **S2 Crosshair mode exists** (`02-mapa-aqui.png`): cross + bar "Mueve el mapa hasta poner la cruz en el punto." with Cancelar / Ver acceso aquí. Baseline's hidden long-press now has a visible equivalent.
- **S3 Acceso sheet** (`03-mapa-acceso.png`): sheet top at y≈570 of 1864 → ≈55–58% of the viewport is still map. Two actions (En coche / Ruta a pie), figures in mono.
- **S4 Ruta** (`04/05-ruta-*.png`): middle detent; elevation profile clipped under the tab bar by design (`AUDIT-impeccable` fix #2). `05-ruta-perfil.png` is pixel-identical in layout to `04` (profile never shown expanded in evidence).
- **S5 Hoy** (`10-hoy.png`): first result (#1, "Ruta a pie" + "•••" overflow) above the fold. Still present above it: 5+ day chips **and** a separate "Otro día (hasta +15)" native date input (index.html, `#hoy-fecha`, hoy-ui.ts:159-160) — two controls for one choice. Overflow (`11-hoy-mas.png`): Ver en mapa / Cómo llegar en coche / Guardar.
- **S6 Species choice widgets:** photo picker sheet (`09-elegir-especie.png`), native `<select>` in Nuevo sitio (`14-nuevo-sitio.png`, "Boletus aereus"), native `<select>` filter in Mis sitios (`15-mis-sitios.png`, "Todas"), search + chips in Guía (`16-guia.png`). Baseline asked for one picker everywhere; two native selects remain.
- **S7 Mis sitios row** (`15-mis-sitios.png`): three equal outlined buttons (Ver en mapa / Cómo llegar / Editar) — not the "one primary + overflow" rule applied in Hoy.
- **S8 Recognizer → ficha** (`28-ficha-desde-reconocer.png`): opens in the Guía tab (tab bar highlights Guía), back button reads "Guía" (`guia-ui.ts:212-214`), falls back to `verLista()` when there is no guide history state. The user leaves the Reconocer tab to read the ficha.
- **S9 Buttons:** `btn` ×15, `btn btn-primario` ×6, `+btn-ancho` ×4, `btn-peligro` ×3, `btn-redondo vidrio` ×2, `btn-x` ×6, `btn-atras` ×1 (index.html) — three visual styles plus round/close, down from seven variants.
- **S10 Interactive count:** 50 `<button>` in `index.html` + dynamic rows; six tabs.

## 2. Visual
- **V1 Tokens:** one OKLCH set on `:root` (`estilos.css:14-49`): papel, hoja, tinta, tinta-2, regla, lavado, bosque, bosque-t, óxido, ámbar(+t), peligro(+t), ruta — 14 colour roles. But `estilos.css` still holds 55 distinct `oklch(...)` literals and 29 hex literals outside the token block.
- **V2 Type:** one family pair, Atkinson Hyperlegible Next + Mono, self-hosted (`estilos.css:6-11`). Rendered sizes are literals, 17 distinct values (15px×35, 14×16, 17×15, 13×12, 18×9, 16×9, 20×7, 22×5, 12×3, 28, 32, 38, 42, 46, 11, 12.5, 13.5). No type-scale tokens.
- **V3 Spacing:** gaps 8×27, 10×25, 4×22, 2×17, 6×14, 12×9, 14×4, 3×2, 1×1 — a loose 2/4-step habit, not a declared scale.
- **V4 Glass contrast (measured, `contraste-vidrio.json`):** 10 scenes, 182 text lines, **0 failures**; worst 6.68:1 ("Aquí", satellite at rest); Acceso caveat 6.95:1 on satellite. Fallbacks to solid under `prefers-reduced-transparency`, `prefers-contrast: more` and no `backdrop-filter` (`estilos.css:76-102`). Borders `--regla` 3.6:1.
- **V5 Red reserved for danger:** FAB is óxido (`01-mapa.png`), red appears only on mortal/toxic blocks and the warning "!" (`21`, `25`, `28`). Holds.
- **V6 Glitches seen:**
  - Section heading "Calendario" scrolled under the translucent sticky header and reads as a ghost behind "Tiempo actualizado…" (`12-calendario.png` y≈170–210); `scroll-margin-top: calc(var(--sup)+110px)` (`estilos.css:403`) is shorter than the header.
  - The top toast sits over the page title / species pill: "No se pudo obtener la posición GPS." over the pill (`06b`), "Sitio guardado" over "Mis sitios" and "Guía de especies" titles (`15`, `16`, `17`), "Reconocedor descargado…" over "Reconocer una seta" (`19`, `20`, `21`). Toast is `position: fixed; top: calc(var(--sup)+8px)` (`estilos.css:731-736`), 3.5 s (`main.ts:51-57`). The persistence across tabs in the captures is partly capture timing, but placement over the title is by design.
  - File input renders browser-default "Choose File / No file chosen" (`14-nuevo-sitio.png`, `index.html:407`); button styled but 44 px (`estilos.css:153`) under the 48 px floor.
  - Zona card text wraps tight against "Ver zona" (`13a-mapa-zona.png`).
- **V7 States:** focus ring 3 px (`estilos.css:59`); disabled (`:125`); empty ("Aún no hay sitios…", `main.ts:746`); error (GPS toast `06b`, red off-route box "Fuera de ruta: estás a 170 m del trazado" `06b`); success toasts; loading ("Calculando…", `AUDIT-impeccable` fix #3). All six present; success/error feedback overlaps chrome (V6).
- **V8 Modes:** `color-scheme: light` (`estilos.css:15`), no `prefers-color-scheme` rule anywhere; dark/dim theme explicitly deferred (`MASTER.md:117`). Reduced motion handled with cross-fades (`estilos.css:741-746`).

## 3. Copy & honesty
- **C1 Recognizer result keeps an appetite badge:** each candidate row appends `insignia(f.grupo)` (`reconocer-ui.ts:191`) → "Apreciada" next to a dark filled "Parecido alto" chip (`20-reconocer-resumen.png`, Oronja row). Spec §4: *No "Apreciada" badge in the recognizer.* The ficha opened from the result also shows "Apreciada" (`28`, `guia-ui.ts:232`).
- **C2 Edibility wording reachable from an unresolved result:** the red banner correctly replaces the edible banner (`28`, `guia-ui.ts:217-218`), but the body still renders "Precaución — Considerada comestible por la bibliografía…" for edible groups unconditionally (`guia-ui.ts:235`; visible at the bottom of `28`).
- **C3 Ordering:** summary lists "Se parecen a tu foto" first (Oronja, Parecido alto, Apreciada, Ver ficha) and "Peligrosas sin descartar" below the fold behind the sticky warning and tab bar (`20`, y≈1790+). Danger is present and red but second.
- **C4 Visual weight of similarity:** `.banda.b-alto` / `.b-alta` = ink-filled pill (`estilos.css:597-598`) — the strongest chip on the page, used for "Parecido alto" and for Gemini "Confianza del modelo: alta" (`reconocer-ui.ts:547`).
- **C5 Banned vocabulary still shipped (spec §5):** "Fiabilidad: buena / sin validar / media" in the picker (`09`) and Capas (`07`, `index.html:76-77`); "sin cobertura" in Ajustes buttons (`18`, `index.html:325,333`) and the recognizer toast (`19-21`).
- **C6 Unexplained numbers/codes:** "Monte 85 de 100" (`10`, `hoy-ui.ts:120`); "Zona del punto 29" (`13`, `main.ts:916`); "Humedad del suelo 0,20" with no unit on the tile (`13`; unit only in the hidden explainer, `index.html:235`); "Balance 30 días −14 mm"; three-segment bar under each day chip encodes forecast confidence with only a `title` tooltip (`10`, `estilos.css:387`, `hoy-ui.ts:153-154`) — no hover on a phone.
- **C7 Inflation:** "Mejores sitios" for a heuristic score (`index.html:196`, `10`).
- **C8 Strong, candid copy kept:** "Zonas estimadas con reglas de terreno y bosque. No indican que haya setas ni qué setas son." (`07`); "Estimación: puede haber fincas privadas…" (`03`); "Todavía nada la separa: faltan 5 de 5 rasgos que deciden." (`21`); "DESCARTADA POR TU RESPUESTA … Vale solo si ese rasgo se ve claro en un ejemplar fresco y entero; confírmalo con un experto." (`26`). No dark patterns.
- **C9 Label/behaviour mismatch:** empty-state copy says "Usa «Sitio aquí»" (`main.ts:746`) but the map control is an unlabeled pin icon (`01`, right column).
- **C10 Emoji as UI icons:** "☠ MORTAL", "⚠ Tóxica" (`guia-ui.ts:227-228`, `guia.ts:29`), "☠ PELIGRO MORTAL" (`reconocer-ui.ts:264`), "⚠" chip (`main.ts:419`), 🟢🟡🔴⚪ (`zona.ts:7`), "✓" (`selector-especie.ts:79`).

## 4. Weight & friction
- Initial JS: `index-DtlTHTi-.js` 1,264,674 B raw / 350,761 B gzip, one chunk (`dist/index.html:14`); MapLibre worker +508 KB raw on map start; recognizer worker 51 KB; CSS 133 KB raw / 21 KB gzip; fonts ~74 KB. Baseline: 1.745 MB / 485 KB gzip.
- Idle animation: none (`@keyframes` only for toast `materializar` and sheet `subir`, `estilos.css:217,703`).
- `backdrop-filter` on ~8 floating surfaces only (`AUDIT-impeccable` perf row; `estilos.css:72,99,522,708`).
- Initial-load interruptions: one hint card on the map (`01`); no modal.
- Dark mode: not honoured (V8).

## 5. Accessibility
- Landmarks: `<main>` ×1, `<nav>` ×2 (`index.html:40,199,376`), `<header class="cab">` per screen. No skip link.
- Touch: `--toque 48px`, primary 56 px (`estilos.css:43-44`); file button 44 px (V6).
- Expert warning `#rec-aviso-final` fixed, `role="note"` (`index.html:313`) — always visible (spec §4 met) at the cost of ≈180 CSS px (banner + tab bar) over result content (`20-27`).
- Dynamic Type not supported (px sizes; `AUDIT-impeccable` deferred).

## 6. Known gaps
- The live build was not driven; history behaviour of "Guía" back from a recognizer ficha inferred from `guia-ui.ts:214`.
- Contrast of non-glass solid screens not re-measured (tokens are ≥7:1 by declaration, `estilos.css:17-29`).
- No real-device sunlight test; no TTI measurement.
