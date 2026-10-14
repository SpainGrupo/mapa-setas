# 02 — Scorecard (Dieter Rams, 0–3 each; tie → lower; score the worst instance)

Same anchors as `DESIGN-IS-2026-10-14/02-scorecard.md`. Before → after per principle.

1. Good design is innovative — Score: 2/3 (before 2 → after 2)
   Evidence: per-pair comparison with numbered field marks shared by photo row, trait table and anatomy drawings, dashed "unverified" state, "DESCARTADA POR TU RESPUESTA" that stays visible, four-part false-positive block (§1 S8, `21`–`27`); crosshair "Aquí" (`02`); departure-board Hoy rows (`10`).
   Justification: the recognizer pattern is genuinely new among foraging apps, but it is not shipped with restraint yet (dense paragraph cells in `23-reconocer-tabla.png`, two sticky layers over it), so not 3.

2. Good design makes a product useful — Score: 2/3 (before 1 → after 2)
   Evidence: first Hoy result and one primary action above the fold (§1 S5); visible crosshair equivalent of the long-press (S2); Acceso leaves ≈56% of map (S3); still a day-chip row plus a separate date input (S5), and the ficha from a result opens in the Guía tab with a "Guía" back button (S8).
   Justification: primary tasks complete directly now; the adjacent surfaces still add steps, which is exactly the 2 anchor.

3. Good design is aesthetic — Score: 2/3 (before 1 → after 2)
   Evidence: one token set, one type family, glass confined to floating chrome with measured ≥6.68:1 text (§2 V1, V2, V4); red reserved for danger (V5); inconsistencies: glass header ghosting the "Calendario" heading (`12`), Mis sitios rows break the one-primary rule with three equal buttons (S7); 17 literal font sizes and 55 oklch literals behind an otherwise visible system (V1–V2).
   Justification: the system is visible on every screen and only two rendered inconsistencies stand out; not 3 because the scale lives in literals, not tokens.

4. Good design makes a product understandable — Score: 1/3 (before 1 → after 1)
   Evidence: spec-banned words still shipped — "Fiabilidad: sin validar" ×9 in the picker (`09`), "Fiabilidad: buena" in Capas (`07`), "sin cobertura" in Ajustes and toasts (`18`, `19`) (§3 C5); unexplained "Monte 85 de 100", "Zona del punto 29", unitless "0,20", unlabeled 3-bar glyph on day chips (C6); "Usa «Sitio aquí»" pointing to an unlabeled icon (C9).
   Justification: the primary controls are now identifiable (Aquí, Ruta a pie, tabs), but jargon is present and 2–3 controls/readouts need a tooltip that a phone cannot show — the 1 anchor.

5. Good design is unobtrusive — Score: 2/3 (before 1 → after 2)
   Evidence: map chrome reduced to a pill, two round buttons, three FABs and a glass tab bar (`01`); Acceso/Ruta sheets with detents (S3–S4); worst instance: on Reconocer the fixed warning + tab bar cover ≈180 of 932 px and overlap red danger cards (`20` bottom, `21`), and the top toast lands on page titles / the species pill (V6).
   Justification: chrome is visible but quiet on the map; the recognizer's stacked sticky layers and the toast placement keep it from 3.

6. Good design is honest — Score: 1/3 (before 1 → after 1)
   Evidence: large gains — red "Mortal sin descartar en tu foto" replaces the edible banner (`28`), "NO DESCARTADA"/"DESCARTADA POR TU RESPUESTA" states, candid caveats (§3 C8). Remaining: "Apreciada" badge on recognizer candidates, explicitly banned by spec §4 (C1, `reconocer-ui.ts:191`, `20`); "Considerada comestible por la bibliografía" still rendered in the ficha body when reached from an unresolved result (C2, `guia-ui.ts:235`, `28`); ink-filled "Parecido alto" / "Confianza del modelo: alta" as the strongest chip (C4); "Mejores sitios" for a heuristic (C7).
   Justification: 2+ inflations of appeal/confidence on the safety-critical surface, one of them a direct violation of a non-negotiable rule; nothing deceptive, so not 0.

7. Good design is long-lasting — Score: 1/3 (before 2 → after 1)
   Evidence: Atkinson Hyperlegible, mono figures, flat solid reading screens age well (V2); dated markers: (a) Liquid Glass material on chrome, a 2025–26 platform-trend signature (`estilos.css:31-36,70-102`), (b) emoji as UI icons still present — ☠ ⚠ 🟢🟡🔴⚪ ✓ (C10).
   Justification: two dated markers is the 1 anchor; the glass is well executed and fenced, but it will date the app to this iOS generation, and the emoji marker from the baseline was not removed.

8. Good design is thorough down to the last detail — Score: 2/3 (before 2 → after 2)
   Evidence: all six states present (V7), off-route warning, reduced-transparency/contrast fallbacks, spring re-targeting (`MOTION-review`); rough: success/error toasts cover titles and the pill (V6), browser-default file control at 44 px (V6), calendar heading under the header (`12`).
   Justification: no state is missing, but feedback states are rough in placement — the 2 anchor.

9. Good design is environmentally friendly — Score: 0/3 (before 0 → after 0)
   Evidence: initial JS 351 KB gzip / 1.26 MB raw in one chunk (down from 485 KB / 1.745 MB); no idle animation; reduced motion respected (§4); `color-scheme: light`, no `prefers-color-scheme`, dark/dim deferred (`estilos.css:15`, `MASTER.md:117`).
   Justification: the anchor makes "dark mode ignored" a 0 regardless of the real weight gains; sunlight-first is a defensible default but dusk use in the mountains on battery is in scope.

10. Good design is as little design as possible — Score: 2/3 (before 1 → after 2)
    Evidence: four buttons per Hoy row → one + overflow (`10`, `11`); safety banner unified to one sticky line; removable remainder: the date input duplicating the day chips (S5) and two native species selects beside the photo picker (S6).
    Justification: two removable elements/patterns remain — the 2 anchor.

| # | Principle | Before | After |
|---|---|---|---|
| 1 | Innovative | 2 | 2 |
| 2 | Useful | 1 | 2 |
| 3 | Aesthetic | 1 | 2 |
| 4 | Understandable | 1 | 1 |
| 5 | Unobtrusive | 1 | 2 |
| 6 | Honest | 1 | 1 |
| 7 | Long-lasting | 2 | 1 |
| 8 | Thorough | 2 | 2 |
| 9 | Environmentally friendly | 0 | 0 |
| 10 | Less design | 1 | 2 |
| | **Total** | **12/30** | **15/30** |

**Total: 15/30.** One 0 (#9, not load-bearing). Load-bearing #2 at 2, #4 and #6 at 1.
