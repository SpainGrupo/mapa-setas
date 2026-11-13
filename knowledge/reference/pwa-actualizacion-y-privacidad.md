---
type: Reference
title: Actualización de la PWA, cookies (Clarity) y CSP
description: Cuándo se aplica sola una versión nueva, cómo se carga Microsoft Clarity solo con consentimiento y qué política de contenido lleva el build.
tags: [app, pwa, privacidad, seguridad]
timestamp: 2026-11-13T12:00:00Z
---

# Notes

- Versión nueva (2026-11-07): se aplica sola salvo que haya grabación, Modo campo o navegación en marcha (entonces avisa «se aplicará al terminar» y reintenta). Máximo una recarga automática por minuto; si se repite, aviso con botón. Antes de recargar guarda dónde estabas. Lógica pura en `app/src/actualizar.ts`.
- Microsoft Clarity (grabaciones anónimas y mapas de calor) solo se carga tras «Aceptar» en el aviso de cookies; «Rechazar» no carga nada de clarity.ms. Se cambia en Ajustes › Cookies. El id de proyecto llega por `VITE_CLARITY_ID` en el build; vacío = sin aviso ni carga.
- Content-Security-Policy por `<meta>` en el build (desde 2026-11-08, `vite.config.ts`), con `*.clarity.ms` en `script-src`. GitHub Pages no permite cabeceras, así que `frame-ancestors` no se puede aplicar.
- Los enlaces de citas y de créditos de la guía solo se pintan si son http(s).

# Citations

- `app/src/actualizar.ts`, `app/src/clarity.ts`
- `docs/investigacion/2026-11-08-auditoria-seguridad.md`
