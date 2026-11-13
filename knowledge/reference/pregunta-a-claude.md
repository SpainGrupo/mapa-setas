---
type: Reference
title: «Pregunta a Claude» (chat) y sus límites de seguridad
description: Qué es el chat de la app, cómo reparte el trabajo entre iPhone y Worker y qué topes y saneados aplica el Worker en /chat.
tags: [app, worker, chat, seguridad]
timestamp: 2026-11-13T12:00:00Z
---

# Notes

- Chat dentro de la PWA: Claude contesta con los datos locales de la app (sitios, semáforo, Mis sitios, notas de ruta) mediante 7 herramientas que se ejecutan en el iPhone. Spec: `docs/specs/2026-10-20-pregunta-a-claude-design.md`. Desde 2026-11-08 admite fotos y enlaces de Google Maps.
- Worker `setas-identificar`, ruta `POST /chat`, sin estado: el cliente guarda y reenvía el historial. El system prompt y las herramientas viven en el Worker. Modelo en `CLAUDE_MODEL` (`worker/wrangler.toml`, hoy `claude-opus-5-5`); la clave es un secreto del Worker.
- Límites (valores de `wrangler.toml` a 2026-11-08): 30 consultas nuevas por IP y día; 150 peticiones por IP y día (cuentan también las rondas de herramientas); tope de gasto 1,5 USD/día y 25 USD/mes globales y 0,5 USD/día por IP, calculados con el `usage` real; cuerpo ≤ 200 KB, ≤ 40 mensajes, ≤ 6 rondas, 45 s.
- Saneado: el historial se reconstruye campo a campo (el usuario solo manda `text` y `tool_result` de texto; el asistente solo `text`, `tool_use` de las 7 herramientas propias, `thinking` y `fallback`). Imágenes o documentos por URL se rechazan con 400. La IP del límite es `CF-Connecting-IP`; IPv6 se agrupa por prefijo.
- Filtro de comestibilidad en la salida: multilingüe y normalizado frente a caracteres invisibles. Queda riesgo residual: no sustituye a la regla de `principio-de-seguridad.md`.
- Auditoría completa (18 hallazgos, estado de cada uno): `docs/investigacion/2026-11-08-auditoria-seguridad.md`. Propuestos, sin hacer: Turnstile (el `Origin` no autentica fuera del navegador), tope global atómico ante ráfagas y firma de los mensajes del asistente.
- PENDIENTE (Alexander): pasar PentAGI contra la app y el Worker desde el PC con Windows (`HANDOFF-PENTAGI-WINDOWS.md`).

# Citations

- `docs/investigacion/2026-11-08-auditoria-seguridad.md`
- `docs/specs/2026-10-20-pregunta-a-claude-design.md`
