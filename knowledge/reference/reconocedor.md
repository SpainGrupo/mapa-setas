---
type: Reference
title: Cómo funciona el reconocedor
description: Flujo de la pestaña Reconocer, qué motor responde (Gemini o el modelo local), cómo se eligen los dobles peligrosos y sus límites.
tags: [reconocedor, gemini, seguridad, app]
timestamp: 2026-10-18T18:00:00Z
---

# Notes

## Flujo
1. El usuario hace o elige de 1 a 4 fotos y pulsa «Reconocer».
2. **Con conexión responde Gemini primero.** La app reduce cada foto a JPEG de 1024 px como máximo (también las HEIC del iPhone, vía `createImageBitmap` o `<img>`) y la manda al Worker de Cloudflare (`worker/`), que llama a Gemini. Espera hasta 45 s; el Worker corta a los 30 s. Esa primera consulta va sola, sin respuestas ni candidatos del modelo local.
3. **Sin conexión, o si Gemini falla, responde el modelo local** (BioCLIP int8 en ONNX, descarga aparte de unos 100 MB en Ajustes). La pantalla dice qué motor ha respondido y, si Gemini falló, el motivo real (origen no permitido, fotos demasiado grandes, cupo diario, saturado, tiempo agotado, sin red…).
4. **Si están los dos**, el local corre en paralelo y hace de contraste. Cuando el género de su primer candidato no coincide con el de Gemini, se avisa de la discrepancia y los dobles peligrosos de ese candidato local también se suman.
5. El botón «Consultar a Gemini» / «Preguntar otra vez a Gemini con tus respuestas» repite la consulta con las respuestas guiadas (hasta 20 claves, las respondidas primero) y los candidatos del local.

## Qué se enseña y en qué orden
1. Alertas rojas, si una respuesta hace probable una tóxica o una mortal.
2. El motor que responde y el contraste.
3. **Candidatos probables:** con Gemini, sus rasgos vistos y lo que falta comprobar. Con el local, el parecido (alto, medio o bajo). Debajo van las fotos que ayudarían a confirmar.
4. **Dobles peligrosos a descartar:** solo los relevantes para esos candidatos, es decir, los del mismo grupo de formas (`PELIGROSAS_GRUPO`), los de «No confundir con…» de sus fichas, los que señala Gemini y los que una respuesta hace probables. Cada uno va con el rasgo que lo separa: las `diferencias` del par en `guia/especies.json`; si la guía no tiene el par, los `rasgos_clave` del doble; si no hay ficha, el motivo de Gemini (`rasgoQueDistingue`, `app/src/comparar.ts`).
5. **Otras mortales sin descartar:** las mortales de la guía que no se parecen a los candidatos. Siguen en una caja roja aparte, nunca ocultas, porque el reconocimiento puede fallar.
6. Preguntas guiadas. La primera es «¿Qué hay debajo del sombrero?». Las que solo sirven para las mortales de otros grupos van plegadas.
7. La comparación por pares (solo con los dobles relevantes que tienen ficha), las descartadas y el aviso fijo del experto.

## Reglas de seguridad (sin cambios de fondo)
- Nunca se dice «comestible». Los textos de Gemini pasan por `sinComestible` en la app y en el Worker.
- Una peligrosa solo sale de la lista por respuestas guiadas basadas en rasgos de la guía. «No sé» nunca descarta, y una alerta no se puede descartar con otra respuesta.
- Ninguna mortal se descarta con una sola respuesta, salvo el corte del huevo. «Poros» más el color de esos poros descarta las peligrosas que no son boletos. «Láminas», «pliegues» o «pinchos» descarta los boletos tóxicos. «No tiene sombrero» no descarta nada.
- Sin ningún grupo conocido (seta no reconocida, o solo géneros «otros»), todas las mortales cuentan como relevantes.

## Límites
- Gemini es otra IA con sus propios errores. Necesita cobertura, envía las fotos y la posición a Google y tiene cupo: 50 consultas por IP y día, y 300 en total.
- El modelo local solo propone por parecido visual. Su umbral de «no reconocido» es de 0,28 de coseno, flojo para setas muy distintas de su vocabulario.
- La guía tiene 38 fichas. Un doble que nombra Gemini y que no está en la guía (p. ej. *Rubroboletus legaliae*) sale como «Peligro posible», con el motivo de Gemini y sin ficha ni comparación.
- El descarte por «poros» presupone que el usuario distingue poros de láminas. Es un rasgo básico, pero lo contesta una persona.

# Citations

- app/src/reconocer-ui.ts, app/src/seguridad.ts, app/src/comparar.ts, app/src/gemini.ts
- worker/src/validar.ts (límites de la petición), worker/src/limite.ts (cupos), worker/wrangler.toml
- docs/specs/2026-10-13-mapa-setas-design.md §2
