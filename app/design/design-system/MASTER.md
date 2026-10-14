# MASTER: Mapa de setas design system (phase 2)

Authoritative token set for the rebuild. Direction: **B "Instrumento"** (chosen by Alexander, 2026-10-14) + **C's numbered field marks** in the recognizer comparison + **Liquid Glass** floating chrome (iOS 26 style). Inputs: `../design-direction-candidates.md`, `../DESIGN-IS-2026-10-14/03-verdict.md` (Preserve list, binding), `../design-spec.md`, `../directions/b-instrumento.html`. Database consulted: ui-ux-pro-max (`--design-system`, `--domain style/ux/google-fonts/web`). Phase 1 direction wins over database defaults; the database filled gaps (glass parameters, touch spacing, contrast pairs, safe areas).

Target: iPhone Pro Max 430×932 CSS px, safe areas 59 top / 34 bottom, Dynamic Island, home indicator. One hand, sunlight, gloves, no signal.

Hex is the authoring value; OKLCH is the production value (converted at phase 3 entry, used in `src/estilos.css`).

## 1. Colour

| Token | Hex | OKLCH | Role | Contrast |
|---|---|---|---|---|
| `--papel` | `#eef1ec` | `oklch(95.4% 0.007 132.4)` | screen ground behind lists | — |
| `--hoja` | `#ffffff` | `oklch(100% 0 0)` | solid surfaces, sheet body | — |
| `--tinta` | `#0d1a13` | `oklch(20.3% 0.023 159.9)` | primary text | 17.9:1 on white, 15.7:1 on papel |
| `--tinta-2` | `#36443c` | `oklch(37.2% 0.023 160)` | secondary text | 10.3:1 on white |
| `--regla` | `#7f8a83` | `oklch(62.2% 0.017 158)` | borders, dividers (non-text) | 3.6:1 on white |
| `--lavado` | `#e3e9e4` | `oklch(92.8% 0.009 150.7)` | quiet fills, pressed state | — |
| `--bosque` | `#1b4332` | `oklch(34.8% 0.055 163.4)` | identity, primary button, active tab, "Buen momento" | 11.1:1 white on it |
| `--bosque-t` | `#d6e6db` | `oklch(91% 0.023 155.9)` | good-forest tint | — |
| `--oxido` | `#b23a0b` | `oklch(51.8% 0.164 38)` | the one primary map action (Aquí FAB), saved-site dots | 6.0:1 white on it |
| `--ambar` | `#6b4700` on `--ambar-t #f2e2b8` | `oklch(42.8% 0.09 75.9)` / `oklch(91.5% 0.058 89.7)` | "Puede salir", confianza media | 6.5:1 |
| `--peligro` | `#a4161a` on `--peligro-t #f9e3e1` | `oklch(46.2% 0.175 26.6)` / `oklch(93.3% 0.024 23.9)` | **danger only** (mortal/tóxica, NO DESCARTADA, destructive) | 7.8:1 on white, 6.3:1 on tint |
| `--ruta` | `#1565c0` | `oklch(51.3% 0.16 255.7)` | walking route line and P marker on the map (kept from the app) | 5.8:1 |

Rules: red never decorates (Preserve). Rust is never used for anything but the one map action and saved-site dots. 12 colour tokens; no gradients except the suitability ramp (data) and the glass specular highlight.

## 2. Liquid Glass material

Floating chrome only: tab bar, map top bar (species pill, Ficha, Capas), map FABs, hint pill, bottom-sheet header and body over the map, Capas sheet, species picker sheet, the Zona card. Lists and reading screens are solid (`--papel`/`--hoja`): glass over text is never used (never stack glass on glass).

| Token | Value | Why |
|---|---|---|
| `--vidrio-tinte` | `oklch(99% 0.004 140 / 0.80)` | regular glass; 80% opaque tint keeps `--tinta` ≥ 10:1 even over black satellite pixels |
| `--vidrio-tinte-denso` | `oklch(99% 0.004 140 / 0.90)` | sheets with body text (Acceso, Ruta, Capas) |
| `--vidrio-filtro` | `blur(22px) saturate(170%)` | frost + vibrancy (`-webkit-` prefix for iOS Safari) |
| `--vidrio-borde` | `1px solid oklch(100% 0 0 / 0.65)` + outer hairline `oklch(20% 0.02 160 / 0.14)` | light-catching rim; hairline keeps the edge ≥ visible on pale tiles |
| `--vidrio-brillo` | `inset 0 1px 0 oklch(100% 0 0 / 0.9)`, `inset 0 -1px 0 oklch(100% 0 0 / 0.25)` | specular top edge = "refraction" cue |
| `--vidrio-sombra` | small: `0 2px 10px oklch(15% 0.02 160 / 0.18)`; large: `0 -8px 32px oklch(15% 0.02 160 / 0.22)` | bigger surface reads thicker |

Fallbacks (mandatory):
- `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))` → tint becomes solid `--hoja` (alpha 1).
- `@media (prefers-reduced-transparency: reduce)` → solid `--hoja`, no blur, 1.5px `--regla` border.
- `@media (prefers-contrast: more)` → solid, 2px `--tinta` border.

Contrast is measured on real tiles (light vector map and PNOA satellite) in phase 4: pixel-sampled composite under every glass text element, worst pixel, target ≥ 4.5:1 (AA) for all text, ≥ 7:1 for body.

## 3. Typography

Self-hosted (offline, precached): Atkinson Hyperlegible Next 400/700/800 + 400 italic, Atkinson Hyperlegible Mono 400/700 (OFL), latin subset (covers Spanish). `font-display: swap`. System fallback `-apple-system, system-ui`.

| Role | Size / line-height | Weight | Tracking |
|---|---|---|---|
| Display numeral (minutes, metres) | 44 / 1.0, Mono | 700 | -0.03em |
| Title (screen h1) | 28 / 1.1 | 800 | -0.015em |
| Section (h2) | 20 / 1.2 | 800 | -0.01em |
| Row title | 18 / 1.25 | 700 | 0 |
| Body | 17 / 1.45 | 400 | 0 |
| Label / secondary | 15 / 1.35 | 700 | 0.005em |
| Caption (credits, legends) | 13 / 1.3 | 400–700 | 0.01em |
| Overline (CAPS) | 13 / 1.2 | 800 | 0.06em |

Body ≥ 16 px, labels ≥ 13 px (spec §8). Figures use `font-variant-numeric: tabular-nums` (Mono for big numerals). Scientific names in italic.

## 4. Space, shape, layout

- Spacing scale (4 pt): 4, 8, 12, 16, 20, 24, 32, 40, 48. Screen gutter 16; sheet padding 20.
- Radii: 10 (chips, inputs), 14 (buttons, rows), 22 (cards, pill), 28 (sheets, tab bar), 999 (FAB, pill ends).
- Touch: ≥ 48 px every target, 56 px primary actions, 64 px main FAB, ≥ 8 px between targets. Primary actions in the bottom 40%.
- Safe areas: `env(safe-area-inset-*)`, with floor values 59/34 not hard-coded (the browser supplies them).
- z-index: map 0 · map chrome 10 · sheets 20 · tab bar 30 · toast 40 · dialogs (top layer).
- Floating tab bar: 6 top-level destinations (Mapa · Hoy · Mis sitios · Guía · Reconocer · Ajustes), 64 px tall, inset 8 px from the edges, sits on the home-indicator safe area. Content scrolls under it with a bottom inset.

## 5. Components (three button styles)

1. **Primary** — `--bosque` fill, white text, 56 px, radius 14. One per surface.
2. **Secondary** — `--hoja` fill, 2 px `--tinta` border, 48–56 px.
3. **Quiet** — text + icon, no border, 48 px (overflow items, close, "Ficha").
The Aquí FAB (rust, 64 px) is the map's single primary action; destructive buttons are Secondary with `--peligro` text/border.

Other: segmented control (Mapa/Satélite), switch rows (layers), day chips (label + 3-bar confidence), departure-board rows (rank, thumbnail, name, state chip, big minutes numeral, ascent, one "Ruta a pie" + overflow ⋯), field mark (black numbered square; dashed outline = evidence missing), comparison table (rasgo | candidata | peligrosa | tú), false-positive block (4 fixed questions).

## 6. Motion

| Token | Value | Use |
|---|---|---|
| Sheet spring | damping 0.85, response 0.32 s (k = (2π/0.32)², c = 2·0.85·√k) | bottom sheet to detents after drag/flick (momentum → slight bounce allowed) |
| Settle spring | damping 1.0, response 0.3 s | programmatic open/close of sheets |
| Projection | `v/1000 · 0.998/(1−0.998)` | choose detent from release velocity |
| Rubber band | `(x·d·0.55)/(d+0.55·|x|)` | dragging past top detent / below closed |
| Press | `scale(0.97)`, 100 ms `cubic-bezier(0.2, 0, 0, 1)` on `:active` | buttons, rows, tabs |
| Fade / materialize | 180 ms `cubic-bezier(0.2, 0, 0, 1)` opacity + `scale(0.98→1)` | toast, hint, popovers |

Never `ease-in`. Only `transform`/`opacity`. No idle animation. Tab switches and frequent actions (≥100/day) do not animate. `prefers-reduced-motion: reduce` → sheets jump to detent with a 150 ms opacity cross-fade; no springs, no scale.

## 7. Content rules carried from the spec

Plain words: "Zonas favorables" (not idoneidad), "Previsión fiable / media / poco fiable", "Sin conexión", "Lejos del acceso → Mínimo a pie desde el coche". Never "comestible" in the recognizer; "Se parece mucho a tu foto". Expert warning pinned on the recognizer result.

## 8. Rejected database suggestions (one line each)

- Pattern "Newsletter / Content First" — marketing pattern; this is a field tool.
- Style "Vibrant & Block-based" — playful energy conflicts with a safety instrument (direction B).
- Primary `#DC2626` red — red is reserved for danger (Preserve list).
- Accent `#D97706` amber as CTA — amber is a state ("Puede salir"), not an action.
- Background `#FFFBEB` warm cream — cliché look; B's cool green-grey paper wins.
- Inter via Google Fonts `@import` — direction picked Atkinson Hyperlegible; CDN breaks offline.
- Liquid Glass style row: iridescent gradients, chromatic aberration, morphing 400–600 ms — fails sunlight contrast and the < 300 ms UI motion rule.
- Glassmorphism row: 15–30% white tint — measured too transparent over satellite; raised to 80–90%.
- "Large sections 48px+ gaps, animated patterns" — density matters on a 430 px phone; no idle animation.
- Hover states / cursor-pointer emphasis — touch-only PWA; pressed states instead.
- "Bottom tabs ≤ 5" — kept 6 because each is a top-level destination the user asked for; each tab is 69 px wide with icon + label, above the 48 px floor. Revisit if a seventh appears.

## 9. Overrides log (phase 3–4)

- (phase 3) Field marks on photos: no per-photo coordinates exist in the data, so the numbers appear on the table rows and drawings and as a "Busca en tus fotos" legend under the photos instead of pinned points. Pinned points need per-photo coordinates (data work).
- (phase 3) Dark/dim theme first deferred; (phase 4, after design-is #9 = 0) added: dusk tokens under `prefers-color-scheme: dark` plus a manual "Colores" setting in Ajustes (`data-tema`). Text-colour tokens `--bosque-tx`, `--peligro-tx`, `--ambar-tx`, `--oxido-tx` split from fill tokens; charts and anatomy drawings stay on light paper. Glass in dark: `oklch(22% 0.014 160 / 0.82)`, measured ≥ 6:1 on real tiles (`capturas/final/contraste-vidrio-oscuro.json`).
- (phase 4) Emoji icons (☠ ⚠ 🟢 ✓) replaced by sprite SVG / CSS mask icons; state dots are CSS.
- (phase 4) Vocabulary: "Fiabilidad: …" → "Mapa comprobado: acierta bien / a medias / poco" · "Mapa sin comprobar"; "sin cobertura" → "sin conexión"; day chips say "previsión fiable / media / solo tendencia" in text.
- (phase 4) Honesty: no "Apreciada" badge in the recognizer, nor on a ficha opened from a result with an unresolved mortal; "Peligrosas sin descartar" comes before "Se parecen a tu foto"; similarity chip is a light outline.
- (phase 4) Toast moved to the bottom, above the tab bar.
