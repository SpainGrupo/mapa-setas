---
type: Reference
title: «Explorar aquí» y «Mis observaciones»
description: Barrido de 8 fotos con cámara y brújula, descripción por Gemini y mejor dirección decidida por la app; reglas de privacidad y límites.
tags: [app, explorar, gemini, privacidad]
timestamp: 2026-11-13T12:00:00Z
---

# Notes

- Pantalla con cámara y brújula que hace un barrido de 8 fotos alrededor del usuario, pinta marcas AR de microzonas y propone la mejor dirección. Spec: `docs/specs/2026-10-20-explorar-aqui-design.md`. Contrato del Worker (`POST /explorar`): `stages/06_gemini/CONTEXT.md`.
- Gemini solo describe (árbol, copas, sotobosque, suelo, humedad; `no_se_ve` si no distingue). La dirección la decide la app: pesos árbol 0,5 / copas 0,2 / humedad 0,2 / sotobosque 0,1; total = 0,5 · observado + 0,5 · modelo. Lo desconocido es «sin dato» y no suma ni resta.
- Privacidad: nada sale sin pulsar «Analizar» y aceptar el aviso la primera vez; coordenadas a 0,01°; fotos de 1024 px, JPEG ≤ 400 KB, re-codificadas sin EXIF; sin conexión la observación queda pendiente.
- «Mis observaciones»: IndexedDB (`setas-observaciones`), exportación GeoJSON sin fotos. El pipeline todavía no consume los hallazgos.
- Límite: en apaisado no hay disparo automático; el campo de visión es provisional. PENDIENTE: medirlo en iPhone (`stages/02_pwa/explorar-fase0-iphone.md`) y confirmar que la clave de Gemini es de pago.

# Citations

- `docs/specs/2026-10-20-explorar-aqui-design.md`
