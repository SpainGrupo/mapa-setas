---
type: Reference
title: Enlaces a puntos y modo «Navegar aquí»
description: Formato de los enlaces que abren puntos en la app (para asistentes) y qué hace la app con ellos.
tags: [app, enlaces, navegación, asistentes]
timestamp: 2026-10-18T17:00:00Z
---

# Notes

- Base de la app publicada: `https://spaingrupo.github.io/mapa-setas/`. Los enlaces funcionan en la PWA y en el navegador (no dentro de un artifact).
- Un punto: `?ir=<lat>,<lon>&n=<nombre>&nota=<nota>`. `n` y `nota` son opcionales. Ejemplo: `https://spaingrupo.github.io/mapa-setas/?ir=36.60071,-4.81962&n=Arroyo%20aereus&nota=Bajo%20alcornoques`.
- Varios puntos: `?pts=<lat>,<lon>,<nombre>;<lat>,<lon>,<nombre>;…` (el nombre es opcional y puede llevar comas; `;` separa puntos). Ejemplo: `?pts=36.6,-4.8,Arroyo%20aereus;36.61,-4.82,Loma%20umbr%C3%ADa`.
- Lo mismo vale en el hash: `#ir=…&n=…`, `#ir?ir=…` o `#pts=…`. Si hay query y hash, manda la query.
- Coordenadas WGS84 en grados decimales con punto (`36.60071`, no `36,60071` ni grados-minutos); latitud primero. Codificar nombre y nota con `encodeURIComponent` (espacios `%20`, `;` dentro de un nombre se cambia por `,`).
- Límites: 25 puntos por enlace; nombre ≤ 80 caracteres, nota ≤ 500; los puntos con coordenadas inválidas se descartan.
- Qué hace la app: al cargar el mapa pinta los puntos (morado, numerados), los encuadra y abre una hoja con cada punto: «Navegar aquí», «Guardar en Mis sitios» (nota = «nombre — nota», 1 estrella, sin especie; no duplica) y «Ver». Luego quita los parámetros del URL para que recargar no lo repita. Si un punto cae fuera de la región activa, lo dice: el mapa no llega hasta allí.
- «Navegar aquí» (tops de Hoy, mapa del Top, tarjeta del punto tocado en el mapa, ficha de acceso, Mis sitios, KML/GPX importado y enlaces): pantalla completa con el mapa siguiendo tu posición (opcionalmente girado hacia donde miras), línea recta al destino, sendero a pie aparcamiento → sitio si la app tiene acceso.bin para ese punto, distancia y desnivel restantes, rumbo, avisos al llegar (< 30 m) y al salirse del sendero (> 50 m, solo tras haber estado en él), Wake Lock y grabación del track a la vez (Mis sitios › Mis rutas, exportable a GPX).
- Generar enlaces desde código: `generarEnlace(base, puntos)` en `app/src/enlaces.ts` (ida y vuelta probada en `enlaces.test.ts`).
- Un enlace a un punto no dice nada de si se puede recoger allí ni de si una seta se puede consumir (principio de seguridad); el texto que lo acompañe tampoco debe decirlo.

# Citations

- app/src/enlaces.ts, app/src/enlace-ui.ts, app/src/navegar.ts, app/src/ir-sitio.ts
- app/e2e/campo.e2e.mjs
