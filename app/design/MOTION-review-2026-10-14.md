# Phase 4 · Gate 2: motion review (emil-design-eng + apple-design)

Every animation and transition in the rebuilt app, run through the framework: frequency → purpose → easing → duration. Springs for gestures and anything interruptible; only `transform`/`opacity` (plus `clip-path` on lowered sheets). Applied in `src/estilos.css` and `src/hoja.ts`.

| Before | After | Why |
| --- | --- | --- |
| Sheets (Acceso, Ruta, Capas) entering with a fixed-duration CSS transition (prototype) | rAF spring, damping 1.0 / response 0.30 s on open; damping 0.85 / response 0.32 s after a drag, release velocity handed to the spring | Interruptible: a sheet grabbed mid-flight starts from its on-screen position; the flick's speed carries into the settle, no seam |
| Snap to nearest detent from the release point | Project the landing point (`v/1000·0.998/(1−0.998)`) and pick the detent nearest the projection | A small flick travels to the next detent, like iOS sheets |
| Hard stop above the top detent | Rubber band `(x·d·0.55)/(d+0.55·|x|)` | Resistance reads as "nothing more here", not frozen |
| Sheet resting at a middle detent showed its lower half through the tab bar | `clip-path: inset(0 0 <offset>px 0)` follows the spring | The hidden part stays hidden; no ghost content under the glass |
| Content loaded after the sheet opened kept the old detent target | Re-target the running spring on resize (velocity kept) | No jump when "Calculando…" turns into figures |
| Drag selected text across the page | `user-select: none` while dragging, selection cleared at drag start | Direct manipulation must not leak into other gestures |
| `.btn` press 100 ms, background and scale | `scale(0.97)` + background, 120 ms `cubic-bezier(0.2,0,0,1)` | Press feedback in the 100–160 ms band, starts instantly |
| Entry keyframes on hint, toast, Zona card, overflow menu with `--curva` | Strong ease-out `cubic-bezier(0.23,1,0.32,1)` (`--entrada`) | Things appearing should move first, settle late |
| `materializar` from `scale(0.98)` | `translateY(-4px) scale(0.97)` + opacity | Never from nothing; tiny scale makes it read as a material arriving |
| Zona card entry 200 ms | 160 ms | Shown tens of times a session from map taps: shorter |
| Overflow "Más acciones" menu centred | `transform-origin: top right` (the ⋯ trigger) | Popovers grow from their trigger |
| Species sheet / dialogs 240 ms `--curva` | 260 ms `--entrada` (modal, centred, rare) | Modal: standard entry, ease-out |
| Question highlight appeared and vanished abruptly | Appears instantly, fades out over 400 ms | Instant cause → effect; the fade tells the eye where it was |
| Tab switches | Not animated (unchanged) | Used 100+ times a day: animation would only slow it |
| Map "Aquí" crosshair, FABs, pill | No idle or entry animation; press scale only | Frequent controls; the map is the moving thing |
| `prefers-reduced-motion`: global 1 ms kill | Keyframes become opacity-only fades; sheets jump to the detent with a 150 ms cross-fade; press scales removed | Reduced motion is gentler motion, not missing feedback |
| Close buttons: animate sheet out | Kept instant hide on the ✕ (drag-to-dismiss still springs out) | Exit faster than enter; the e2e and the user both get an immediate state |
