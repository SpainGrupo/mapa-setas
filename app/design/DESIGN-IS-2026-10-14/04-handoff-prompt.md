# 04 — Handoff

Within the design pipeline this verdict routes to phase 1 (huashu-design direction exploration); the Preserve list is the phase-1 constraint set. The `/make-plan` prompt below is the self-contained version for a plan session.

````
/make-plan Redesign the "Mapa de setas" PWA (setas/app: Mapa, Hoy, Mis sitios, Guía, Reconocer, Ajustes). Current design failed a Dieter Rams audit at 12/30 with critical gaps in principles #2 useful (1), #4 understandable (1), #6 honest (1), #5 unobtrusive (1), #10 as little design as possible (1), #9 environmentally friendly (0).

Verdict paragraph (quoted from 03-verdict.md):
> The app's logic, data and safety rules are sound, but the interface scores 12/30 because its surfaces present everything at once, hide the main gestures, speak in internal jargon and, on the recognizer, give the user verdict-shaped chips instead of evidence to judge with — so the structure must be rebuilt around one-hand outdoor use, not restyled.

Why redesign and not refine: total 12/30 is below the 20 threshold and the failures are structural (screen composition, hidden long-press entry, four duplicate species pickers), not token-level.

Preserve from current design:
- Safety rules: mortals always listed, "No sé" never discards, caution wins when merging Gemini, edibility words stripped (src/seguridad.ts:199-226, 261-265; src/gemini.ts:78-100).
- Red reserved for danger (--peligro #a4161a) and gravity tokens (src/estilos.css:244-248); forest green --verde #1b4332; rust accent --acento #b23a0b for the one primary map action (src/estilos.css:1-16).
- 48 px touch floor, 56 px primary, 64 px FAB, safe-area gutters, 3 px focus ring (src/estilos.css:12-23).
- Text contrast ≥ 16:1 for body (#111 on #f4f1ea) and bold weights for sunlight.
- Species picker with photo (src/selector-especie.ts) — reuse everywhere.
- Acceso card data (aparcar en / min a pie / subida / "Estimación…" caveat) and elevation profile (src/perfil-grafico.ts).
- 12-month season strip (src/calendario.ts); Guía photo pair comparison (src/guia-ui.ts:165-185); candid caveat copy; offline-first, no idle animation.

Discard:
- Top control card covering ~33% of the map. Evidence: e2e/capturas/01-inicio.png, index.html:28-55. Caused failure on #5.
- Unhinted long-press as the only entry to Acceso/Ruta. Evidence: src/main.ts:259. Caused failure on #2/#4.
- Four buttons per Hoy result and the filter stack above the first result. Evidence: src/hoy-ui.ts:117-118, e2e/capturas/hoy-general.png. Caused failure on #2/#10.
- Recognizer verdict chips ("Parecido alto" green, "Apreciada" insignia) and the always-on edible banner on fichas reached from a result with unexcluded deadly lookalikes. Evidence: src/reconocer-ui.ts:179,220; src/guia-ui.ts:205. Caused failure on #6 and breaks spec §2.
- Four different species-choice widgets; jargon labels Semáforo/Fiabilidad/Idoneidad/sin cobertura/Lejos del acceso. Evidence: index.html:35,127,164,347; index.html:49,53,67,247. Caused failure on #4/#10.

Top moves from the audit:
1. #2/#5 — map first: compact species pill + layers button; slider/legend in a detented bottom sheet; Acceso sheet leaves ≥55% of map visible; visible "Mantén pulsado" hint or crosshair "Aquí" mode. Evidence: 01-inicio.png, acceso-online.png, main.ts:259.
2. #6 — recognizer as evidence: per pair (top candidate vs each dangerous lookalike) side-by-side photos (user vs guide), feature table (rasgo | candidato | peligrosa | lo que tú respondiste), SVG anatomy drawings (volva saco vs verrugas, anillo, láminas/poros/pliegues, huevo cortado, retículo, piel de serpiente, carne que azulea), explicit "Riesgo de falso positivo" block; block the edible banner while a deadly lookalike is open. Evidence: reconocer-ui.ts:179,220; guia-ui.ts:205.
3. #2/#10 — Hoy answers first: day strip + top result above the fold; one compact filter row; one primary action per result plus overflow. Evidence: hoy-ui.ts:117-118.
4. #4 — plain words and one species picker component. Evidence: §3 C4, §1 S3 of 01-evidence.md (jargon list above).
5. #3/#9 — a real system: spacing and type scales, ≤12 colour tokens, 3 button styles, borders ≥3:1, a sunlight theme plus a dim theme for dusk.

Redesign principles in priority order:
1. #6 Honest — the recognizer never looks like a verdict; danger is red, visible and unexcluded until the user rules it out with evidence.
2. #2 Useful — "where do I go today" answered in one screen and "get me there" in two taps, one-handed, with gloves.
3. #4 Understandable — every label in plain Spanish; every gesture has a visible equivalent.

Deliverables for the plan:
- New information architecture for iPhone Pro Max (430×932, Dynamic Island, home indicator, thumb zone)
- New primary flows (low-fi, labeled, side-by-side with current): Mapa→Acceso→Ruta; Hoy→top→Ruta; Reconocer→comparison
- States checklist (empty, loading, error, success, focus, disabled, offline)
- Migration path (same data, same localStorage/OPFS keys; Mis sitios untouched)
- Cutover criteria (e2e suite green, safety tests 100% coverage kept, owner sign-off on 430×932 screenshots)

Anti-patterns to guard against:
- Porting old structure under new styling
- Keeping both designs behind a flag indefinitely
- Redesigning to follow a trend rather than the principles above
- Treating the Preserve list as optional
````
