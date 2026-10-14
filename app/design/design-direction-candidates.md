# Design direction candidates: Mapa de setas

Phase 1 of the design pipeline (driver: huashu-design; frontend-design genericity gate applied). Inputs:

- `design-spec.md`
- `DESIGN-IS-2026-10-14/` (verdict REDESIGN, 12/30; Preserve list in `03-verdict.md`)

**Status:** three directions are ready, and Alexander has not chosen one yet. Phase 2 starts only after he picks one direction, or a mix.

## Shared across all three (built once, reused)

- **Anatomy drawings** (`shared/anatomia.js`, sheet `shared/anatomia.html`): 14 clean SVG line drawings.
  - volva en saco / volva en verrugas
  - anillo membranoso / doble móvil / ausente
  - láminas / poros / pliegues
  - huevo cortado: caesarea (orange cap, yellow gills, stem yellow outside and white in the centre) / phalloides and verna (all white, sometimes greenish)
  - pie con retículo / piel de serpiente / jaspeado verdoso
  - carne que azulea

  The facts come from `guia/especies.json`. Colours that carry meaning (orange, yellow, blue, olive) are fixed, so a theme cannot repaint them.
- **Content** (`shared/datos.js`):
  - Real: species facts, season months (`public/data/manifest.json`), the three lookalike pairs for *A. caesarea* (phalloides, verna, muscaria) taken from `no_confundir_con`, and the false-positive text built from them.
  - Sample only: places, scores and the recognizer session ("Tu foto (ejemplo)" is guide photo `amanita_caesarea_2`, Louis Aureglia, CC BY 4.0).
- **Photos:** `shared/fotos/` holds resized copies from `guia/fotos/`. Every photo shown in a comparison is credited on screen. Licences are in `guia/CREDITOS.md`.
- **Map:** `shared/mapa/` holds real renders of the current app (suitability raster over topo), captured with the UI hidden.
- **iOS chrome:** `shared/frame.js` (Pro Max, 430×932, safe areas 59/34, Dynamic Island, home indicator).
- **Renderer:** `shared/render.mjs`. The PNGs are 430×932 CSS px at 2x and live in `capturas/`.

All three directions keep the safety rules:

- The result never claims edibility; the wording is "Se parece mucho a tu foto".
- Deadly lookalikes are red and marked "NO DESCARTADA". The muscaria pair stays visible as "DESCARTADA POR TU RESPUESTA".
- The expert warning is pinned and cannot be dismissed on every recognizer screen.
- Each pair gets four things: photos side by side, the table *rasgo | candidato | peligrosa | tú / se ve*, the drawings, and a "Riesgo de falso positivo" block (why they look alike, what separates them, how far to trust it, which photo is missing).

---

## A. "Memphis de campo" (logic: seconds roulette → web style #3, Memphis Maximalism)

- **File:** `directions/a-memphis.html`
- **Key screenshots:**
  - `capturas/a-memphis-01-mapa.png`
  - `capturas/a-memphis-02-hoy.png`
  - `capturas/a-memphis-05-reconocer-comparar.png`
  - the rest: 03 calendario, 04/04b resumen, 05b dibujos, 06 falso positivo, 07 muscaria, 08 ruta a pie
- **Signature element:** "el garabato de cota". The walk's real elevation profile is drawn as a fat yellow squiggle with a hard ink offset shadow. It appears in the Acceso card and in Ruta a pie.
- **Palette:**

  | Colour | Hex | Role |
  |---|---|---|
  | ink | `#111111` | text, borders, 4 px hard shadows |
  | paper | `#f4f1ea` | background |
  | bosque | `#1b4332` | identity |
  | óxido | `#983208` | primary action (rust darkened for 7.3:1) |
  | sol | `#ffcf33` | FAB, current month |
  | cielo | `#5bb8e6` | collage block |
  | lila | `#c9b6f2` | collage block; replaces Memphis red |
  | peligro | `#a4161a` | danger only |
- **Type:** Bungee for titles and big numerals only. Archivo 16–18 px at weights 600–900 for everything else.
- **Navigation:** five tabs (Mapa · Hoy · Reconocer · Guía · Más). Mis sitios and Ajustes sit under Más.
- **Pros:**
  - Flat blocks and 3 px borders hold up best in direct sun.
  - It is the most distinctive and memorable of the three.
  - The collage is kept away from the recognizer, so the danger screens stay sober.
- **Cons:**
  - Can feel toy-like for a safety tool.
  - The hard shadows add weight on dense screens.
  - The comparison needs the most scrolling.
- **Genericity gate:**
  - Dropped a serif display face to avoid the cream-and-serif cliché.
  - Removed rotation and squiggles from the danger screens.
  - Memphis texture is downgraded to flat blocks; this is documented at the top of the HTML.

## B. "Instrumento" (logic: real-world benchmark → Flighty, Apple Design Award 2023, principles only)

- **File:** `directions/b-instrumento.html`
- **Key screenshots:**
  - `capturas/b-instrumento-01-mapa.png`
  - `capturas/b-instrumento-02-hoy.png`
  - `capturas/b-instrumento-05-reconocer-comparar.png`
  - the rest: 03 calendario, 04 resumen, 05b rasgos, 06 falso positivo, 07 muscaria, 08 ruta a pie
- **Signature element:** the walk as a "route progress strip". A single P → point line, drawn as the elevation profile, sits between two big tabular numerals (36 min · +138 m). It works like Flighty's flight-progress bar.
- **Palette:**

  | Colour | Hex | Role |
  |---|---|---|
  | paper | `#eef1ec` | background |
  | sheet | `#ffffff` | sheet surface |
  | ink | `#0d1a13` | primary text (18:1) |
  | ink-2 | `#36443c` | secondary text |
  | rule | `#7f8a83` | borders (3.6:1) |
  | forest | `#1b4332` | identity, primary buttons |
  | rust | `#b23a0b` | the one map FAB |
  | amber | `#6b4700` on `#f2e2b8` | "puede salir" |
  | danger | `#a4161a` on `#f9e3e1` | danger only |
- **Type:** Atkinson Hyperlegible Next for text, Atkinson Hyperlegible Mono for figures (tabular numerals).
- **Navigation:** the map is home. A persistent bottom sheet with detents carries Hoy, Mis sitios, Guía, Reconocer and Ajustes in its header. Hoy and Reconocer are shown as the sheet at full height.
- **Pros:**
  - It is the most map-first of the three: the Acceso sheet leaves most of the map visible, and the long-press has a visible "Aquí" equivalent.
  - Rows like a departure board make Hoy answer at a glance, with one primary action per place.
  - The recognizer is the calmest and clearest: a pair switcher ("Par 1 de 3"), each deadly photo framed in red, and the "tú / se ve" column highlighted.
- **Cons:**
  - It is the least ownable visually; it could read as "a well-made iOS app".
  - The sheet header carries five destinations, which is dense at the top edge and less reachable with the thumb.
  - Its strength depends on motion (sheet detents), which the static PNGs cannot show.
- **Genericity gate:** it avoids all three clichés (cool green-grey paper, a hyperlegible sans, no serif, no acid accent). It earns its specificity from the profile strip and the field data, not from styling.

## C. "Guía de campo" (logic: best designer → Roger Tory Peterson's field marks + Otl Aicher's signage discipline)

- **File:** `directions/c-guia-de-campo.html`
- **Key screenshots:**
  - `capturas/c-guia-de-campo-01-mapa.png`
  - `capturas/c-guia-de-campo-02-hoy.png`
  - `capturas/c-guia-de-campo-05-reconocer-comparar.png`
  - the rest: 03 calendario, 04 resumen, 05b tabla, 06 falso positivo, 07 ruta a pie, 08 matamoscas
- **Signature element:** the numbered field mark. A black numbered square (1, 2, 3…) appears on the user's photo, on the guide photo, on the anatomy drawing and in the table row, so the same feature is shown three ways. A dashed mark means a feature not yet seen.
- **Palette:**

  | Colour | Hex | Role |
  |---|---|---|
  | ink | `#0e1813` | text, field marks |
  | ink-2 | `#3a4740` | secondary text |
  | line | `#76837b` | borders (3.9:1) |
  | paper | `#ffffff` | surface |
  | ground | `#e8ece8` | screen background |
  | forest | `#1b4332` | identity, active mode |
  | rust | `#b23a0b` | the main action of each screen |
  | danger | `#a4161a` on `#f8e3e3` | danger only |
  | sign-blue | `#1f4e8c` | P for parking (Spanish road-sign convention) |
- **Type:** Barlow Semi Condensed (road-sign lineage) for labels and tables; Atkinson Hyperlegible for running text. Square corners throughout.
- **Navigation:** three big thumb-zone modes (Ir / Reconocer / Guía). Mis sitios and Ajustes sit in the header, and Hoy/Mapa is a toggle inside Ir.
- **Pros:**
  - It answers the new recognizer requirement best: the field marks link photo, drawing and table, which is exactly "where do I look to judge myself".
  - It has the strongest one-hand ergonomics (three huge targets).
  - Its signage look is ownable, serious and sun-proof.
- **Cons:**
  - The field-mark callouts on photos are hand-placed. In production they would need per-species coordinates (new data work for 30 species × 3 photos).
  - The three modes hide Mis sitios and Ajustes one level deeper.
  - It is visually austere; the map screen is less refined than B's.
- **Genericity gate:**
  - It deliberately moves away from cream paper and serif (cool white, signage grotesque).
  - No rounded cards.
  - Colour is used only by function.

---

## Recommendation

**B "Instrumento" as the base, with C's numbered field marks transplanted into the recognizer comparison.**

Why B as the base:

- It fixes most directly what the audit failed on: #5 (chrome over the map), #2 (Hoy answers first, one action per result) and #4 (plain words, a visible alternative to the long-press).
- Its map-as-home sheet suits the main job: decide where to go, then walk there.

Why add C's field marks:

- They are the clearest answer to "give me data to judge by myself". The numbered link between photo, drawing and table turns the comparison from a table into evidence you can point at.

Why not A:

- It is the most memorable. But on a tool that sits next to deadly species, its playfulness works against trust, so I would keep it only if Alexander wants a strong personality.

Open risks for phase 2:

- C's photo pointers need per-photo coordinates; this is data work.
- B's sheet detents need a motion pass (emil-design-eng).
- Webfonts must be self-hosted for offline use.
