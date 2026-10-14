# 06 — Rescore, round 3 (after commit `052fbfd`)

Same rules as the earlier rounds: ten Rams principles, 0–3 anchors from `02-scorecard.md`, tie → lower, score the worst instance. Evidence: code at `052fbfd`, the rebuilt `dist/assets/`, and the re-shot `capturas/final/` and `capturas/final-oscuro/` (screens 20, 21, 06b, 28, and dark 01, 08, 13a, 28 inspected). No source modified.

## Builder's claims, verified

| Claim | Verified? | Evidence |
|---|---|---|
| Toast below title/pill, never over the expert warning or bottom actions | Yes | `estilos.css:742-743` (`top: calc(var(--sup) + 72px)`). `20`, `21`: "No consumas…" fully visible. `06b`: Ruta figures visible. `final-oscuro/08`: Acceso "En coche / Ruta a pie" free. |
| MapLibre split into a lazy chunk | Yes, but it still loads at boot | `main.ts:153` `M = await import('./mapa')` inside `iniciarMapa()`, which runs at startup (`main.ts:1131`). Entry `index-DUhpxBjm.js` 152,138 B raw / 54,080 B gzip. `mapa-cA0lGLHB.js` 1,113,900 B raw / 297,602 B gzip. |
| Dark theme dims the map | Yes | `estilos.css:811-812` (`brightness(0.78) contrast(1.06)` on `.maplibregl-canvas`). `final-oscuro/01`, `13a` show visibly toned-down tiles. |
| Ficha from Reconocer keeps the Reconocer tab highlighted | Yes | `final/28`, `final-oscuro/28`. "Tu resultado" back button. |
| Unchanged: Hoy date input, native selects, glass, Guía edible wording | Yes | Still counted below. |

On the split: the map is the first screen, so the primary view still downloads and parses the whole of `mapa-*.js`. That is 1.27 MB raw / ≈352 KB gzip in total, the same as round 2. The split makes the app shell paint earlier; it does not reduce the bytes the primary view needs.

## New observation

The toast now sits over the top of the content for 3.5 s. On the result screen (`20`) it covers the "Peligrosas sin descartar" heading; the red cards below remain visible. This is minor, but the most important heading on that screen is the one it lands on.

## Scorecard

1. Good design is innovative — **2/3** (round 2: 2)
   No change; the trait table is still long paragraph cells (`23`).
2. Good design makes a product useful — **2/3** (round 2: 2)
   The tab-bar context is fixed (`28`). The date input next to the day chips and the native species selects remain (`10`, `14`, `15`).
3. Good design is aesthetic — **2/3** (round 2: 2)
   The dimmed map now sits with the dark chrome (`final-oscuro/01`). Still: the "Calendario" heading ghosts under the glass header (`12`, `estilos.css:403`) and the browser-default file control (`14`).
4. Good design makes a product understandable — **2/3** (round 2: 2)
   No change; "Balance 30 días" and "m³/m³" are explained only behind "Qué significan" (`13`).
5. Good design is unobtrusive — **2/3** (round 2: 2)
   The toast no longer covers actions or the warning. It still covers the danger-list heading on the result (`20`), so not 3.
6. Good design is honest — **2/3** (round 2: 2)
   The expert warning is now always visible (`20`, `21`). "Mejores sitios" remains the one minor inflation (`index.html:199`). Owner question on the Guía ficha's "Considerada comestible por la bibliografía" (`17`) is still open; not scored.
7. Good design is long-lasting — **2/3** (round 2: 2)
   Glass is the one dated marker, kept by the owner's decision.
8. Good design is thorough down to the last detail — **2/3** (round 2: 2)
   The feedback-state collision is fixed. The calendar scroll offset and the file control remain, and the toast lands on the result's key heading. That falls short of "all considered", so tie → 2.
9. Good design is environmentally friendly — **2/3** (round 2: 1)
   Evidence: dark mode is now honoured end to end, map included (`estilos.css:811-812`). There is no idle animation and reduced motion is respected. Primary-view JS is ≈352 KB gzip (54 KB entry + 298 KB map chunk).
   Justification and basis: the round-2 score of 1 rested on two doubts, a partial dark mode and the raw-vs-gzip size band. The dark-mode doubt is resolved. For the size I take the anchor's "<500KB" as transfer size, which is what costs network energy, so the score is 2.
   Disclosed: read on raw parse size (1.27 MB), this would stay 1 and the total would be 19. The lazy split itself does not change the primary-view bytes.
10. Good design is as little design as possible — **2/3** (round 2: 2)
    The date input and the two native species selects are still removable or mergeable.

| # | Principle | R0 | R1 | R2 | R3 |
|---|---|---|---|---|---|
| 1 | Innovative | 2 | 2 | 2 | 2 |
| 2 | Useful | 1 | 2 | 2 | 2 |
| 3 | Aesthetic | 1 | 2 | 2 | 2 |
| 4 | Understandable | 1 | 1 | 2 | 2 |
| 5 | Unobtrusive | 1 | 2 | 2 | 2 |
| 6 | Honest | 1 | 1 | 2 | 2 |
| 7 | Long-lasting | 2 | 1 | 2 | 2 |
| 8 | Thorough | 2 | 2 | 2 | 2 |
| 9 | Environmentally friendly | 0 | 0 | 1 | 2 |
| 10 | Less design | 1 | 2 | 2 | 2 |
| | **Total** | **12** | **15** | **19** | **20/30** |

## Verdict: REFINE

The total is 20/30 with no principle at 0. The Phase 3 rule gives REFINE, so the first line of `03-verdict.md` is updated.

This is the threshold, not a margin. Every principle sits at 2, and the #9 point depends on reading the size anchor as transfer size (see above).

Highest-leverage refine moves, none structural:
1. **#5/#8:** keep the toast off the result's danger heading. For example, place it below the sticky header and above content, or suppress non-safety toasts on Reconocer. Evidence: `20`.
2. **#9 robustness:** defer the map chunk until after first paint and idle, or trim MapLibre features, so primary-view raw JS falls under 500 KB. Evidence: `main.ts:153,1131`.
3. **#2/#10:** extend the day chips to +15 and drop the date input. Use the photo picker in Nuevo sitio and Mis sitios. Evidence: `10`, `14`, `15`.
4. **#3/#8:** fix the calendar `scroll-margin-top` (`estilos.css:403`) and the file control (48 px, Spanish label via a styled `<label>`). Evidence: `12`, `14`.
5. **#6:** owner decision on "Considerada comestible por la bibliografía" in the Guía ficha (`17`) against spec §4's "anywhere".
