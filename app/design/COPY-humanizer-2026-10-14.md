# Phase 4 · Gate 3: humanizer pass on touched UI copy

Scope: every string added or changed in this rebuild (`index.html`, `src/comparar.ts`, `src/reconocer-ui.ts`, `src/hoy-ui.ts`, `src/guia.ts`, `src/guia-ui.ts`). Plain Spanish, active voice, controls named by what they do, no em dashes in prose. Safety wording (spec §2) unchanged.

| Before | After | Pattern fixed |
|---|---|---|
| Ramp legend "pocas / muchas" | "menos / más" | Wrong claim: the ramp shows how favourable, not how many zones |
| "Copia y traspaso" (Mis sitios) | "Exportar e importar" | Name the action the buttons perform |
| Dashed cell "Falta: no sé" / "Falta: sin responder" | "Sin comprobar: respondiste «No sé»" / "Sin comprobar" | Say the state of the evidence, not a fragment |
| "Ninguna de las que deciden: ya has respondido a todas." | "Ninguna: ya has respondido a todo lo que decide." | Shorter, no dangling referent |
| "<i>A. phalloides</i> — descartada por tus respuestas (…)" | "<i>A. phalloides</i>: descartada por tus respuestas (…)" | Em dash in prose |
| "Analizar (sin cobertura)" | "Comparar con la guía" | Name what the user gets, not how the system runs |
| "Hoy: dónde ir" | "Dónde ir hoy" | Natural word order |
| "Lejos del acceso: ≥ 0 m" | "Zonas lejos de pistas y carreteras ≥ 0 m" | Plain words (audit #4: "Lejos del acceso" was jargon) |
| "Semáforo (especie elegida)" | "Buen momento hoy (por zonas)" | Plain words (audit #4) |
| "Idoneidad · baja → alta" | "Zonas favorables · menos → más" | Plain words (audit #4) |
| "Candidatos" / "Peligrosas no descartadas" / "Comprobación guiada" | "Se parecen a tu foto" / "Peligrosas sin descartar" / "Comprueba tú" | Evidence framing, second person, shorter |
| "Hoy (14/10). A 3 días…" confidence line | "Confianza alta · A 3 días o menos vista, la previsión suele acertar." | Removed the date the day chip already shows |

Kept on purpose (detector flagged "aphoristic cadence"): "No indican que haya setas ni qué setas son." It is the candid caveat from the Preserve list, not a slogan.

New strings reviewed with no change needed: the map hint, crosshair bar ("Mueve el mapa hasta poner la cruz en el punto." / "Ver acceso aquí"), the four false-positive headings ("Por qué se parecen", "Qué las separa", "Cuánto fiarte", "Qué foto falta"), the origin lines ("La guía la cita como confusión de …", "Es del mismo grupo de formas: …"), the trust lines ("Todavía nada la separa: faltan N de M rasgos que deciden."), the per-question photo hints, and the red banner ("Mortal sin descartar en tu foto · Tus respuestas aún no descartan …, mortal. No la consumas sin la confirmación de un experto.").
