# Auditoría impeccable de la app entera (2026-11-07)

Encargo de Alexander: «revisa la app entera, que todo sea con sentido y cómodo, y simplifica o une lo que corresponda».
Método: skill `impeccable` en modo **Operate**, con sus playbooks `critique` (UX y heurísticas), `audit` (accesibilidad,
rendimiento, responsive) y `distill` (simplificar y unir). Dos evaluaciones independientes, como pide `critique`:

- **A · revisión de diseño** (subagente Opus): 495 capturas y el código en `HEAD`. Informe completo:
  `…/scratchpad/auditoria/A/revision-diseno.md`.
- **B · detector y auditoría técnica** (subagente Sonnet): `impeccable detect` en CLI y en el navegador, lectura de
  código, ratios de contraste de los tokens y medidas táctiles. Informe: `…/scratchpad/auditoria/B/auditoria-codigo.md`.
- **Capturas y medidas**: script Playwright que recorre todas las pantallas a 412×915 y 375×812 en claro y a 412×915 en
  oscuro, con los mocks de los e2e (GPS en Marbella, Open-Meteo, chat, Gemini) y día fijo 14/10/2026.

Carpeta de capturas (fuera del repo): `/private/tmp/claude-501/-Users-alexanderkrupnov--claude-spares-spare-5FQybw/adb05b76-289e-422b-bf45-665b93d1ebb2/scratchpad/auditoria/`
(`antes/` y `despues/`, nombre `<id>-<ancho>x<alto>-<tema>.png`; índice de ids y toques en `antes/indice.md`;
medidas en `B/medidas-antes.json`). En este informe, «captura `hoy-1`» quiere decir `antes/hoy-1-412x915-claro.png`
salvo que se diga otra vista.

Límites: GPS, brújula, cámara, tiempo y Gemini simulados; el reconocedor offline no se descargó (Reconocer se vio con
Gemini simulado). No hay prueba en iPhone real.

---

## 1. Puntuación

### Heurísticas de Nielsen (evaluación A)

| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | Buen estado general (tiempo, GPS, grabación, descargas). «Campo» desaparece sin explicación hasta que hay posición. |
| 2 | Lenguaje del mundo real | 2 | Jerga de modelo («el modelo da 64/100 en esta celda», «Modelo ≥ 50 y encontraste», «≈11× la media · top 1 %», «0,20 m³/m³») y mezcla de nombre común y científico según la pantalla. |
| 3 | Control y libertad | 3 | Cancelar, cerrar y volver en todas partes. Zona volvía siempre a Hoy aunque vinieras del mapa. |
| 4 | Consistencia | 2 | «Guardar» en 9 sitios con dos comportamientos; 7 verbos para ir a un sitio; tocar y mantener pulsado el mapa abren tarjetas distintas. |
| 5 | Prevención de errores | 3 | La seguridad del reconocedor es muy sólida. Se guardaban rutas de 0 m al salir de «Navegar aquí». |
| 6 | Reconocer antes que recordar | 2 | «Campo» oculto hasta pulsar «Centrar»; Mis observaciones escondida tras un botón; filtros de Hoy que gobiernan listas 20 pantallas más abajo. |
| 7 | Flexibilidad y eficiencia | 3 | Lo principal está a 2 toques. El problema es el exceso de caminos para lo mismo. |
| 8 | Estética y minimalismo | 1 | Hoy ocupa 30 pantallas; tarjetas de 1,3 pantallas; fórmula de 9 líneas fija; intro duplicada en Reconocer. |
| 9 | Recuperación de errores | 3 | Mensajes claros. «No hay mapas» no ofrecía salida. |
| 10 | Ayuda | 3 | Ayuda contextual («?», «Qué significan», «Cómo buscar»), pero abierta por defecto y con «?» de 28 px. |
| | **Total** | **25/40** | **Aceptable**: base segura y sólida; le sobra peso para ser cómoda. |

Carga cognitiva: fallan 7 de los 8 puntos de la lista (foco único, bloques ≤ 4, jerarquía, una cosa cada vez, ≤ 4
opciones, memoria de trabajo, revelado progresivo). Puntos de decisión con más de 4 opciones: barra de 6 pestañas,
mapa en reposo (~15 controles), Capas (11 interruptores), cabecera de Hoy, «Navegando a» (10 acciones), fin del barrido
de Explorar (7 acciones).

### Auditoría técnica (evaluación B)

| Dimensión | Nota | Hallazgo clave |
|---|---|---|
| Accesibilidad | 3 | Foco visible, regiones vivas, reduced-motion y reduced-transparency bien. Objetivos de 28–44 px; el Mapa sin encabezado; hojas sin Escape. |
| Rendimiento | 2 | `mapa` (1,1 MB, 299 KB gz) y el worker de MapLibre en el arranque; 8 reglas con `blur(22px)`; relojes de 1 s con la pantalla apagada. |
| Tematización | 3 | Tokens OKLCH claro/oscuro. Varios textos con colores del tema equivocado de noche (ver P1-9). |
| Responsive | 3 | Sin desbordes a 375/412. Todo el texto en px: no sigue el tamaño de letra del sistema. |
| Integridad | 2 | Botones y cajas con 7 mínimos distintos (36–64 px); bloque del tema oscuro duplicado entero. |
| **Total** | **13/20** | **Aceptable-bueno** |

Detector `impeccable detect`: 6 hallazgos en CLI, de los que 3 son falsos positivos (`broken-image` en `#foto-sitio`,
`flat-type-hierarchy` sin CSS, `border-accent-on-rounded` en una muestra de leyenda) y 3 reales de poco peso
(`side-tab`: borde lateral de color en `.chat-tarjeta`, `.chip-titularidad` y `.tf-citado`; el estado también va en texto,
así que no es solo color). En el navegador, 5 vistas sin anti-patrones.

---

## 2. Lo que funciona (no tocar)

1. **Seguridad con evidencia, no veredictos.** Dobles mortales en rojo hasta que tú los descartas, «No sé» nunca
   descarta, alerta del huevo blanco, comparación numerada con dibujos (`reconocer-resultado-9`, `reconocer-alerta`).
2. **Acceso y Ruta a pie.** Tres cifras grandes, perfil del coche al punto, «Fuera de ruta» en rojo (`acceso-tarjeta-1`,
   `ruta-perfil-2`, `ruta-fuera`). Es el corazón de la app y se lee al sol.
3. **Pensada para el monte en lo básico**: tema claro de alto contraste, botones grandes en el mapa, etiquetas en la
   barra, grabación que sobrevive a recargas, avisos de sin conexión en cada pantalla.

---

## 3. Hallazgos priorizados

Estado: **Aplicado** (commit), **Propuesta** (cambia el producto: decide Alexander) o **Pendiente** (arreglo que no se
ha hecho en esta pasada, con el motivo). No hay P0: todos los flujos se completan.

### P1 · Mayor

| # | Hallazgo | Captura (antes → después) | Estado |
|---|---|---|---|
| P1-1 | **Hoy no responde «adónde voy» en la primera pantalla**: 30 pantallas, dos listas de «mejores» (20 + 10) más «Mejor monte público», dos «Ordenar por». | `hoy-1`, `hoy-21`, `hoy-30` | Propuesta E1 |
| P1-2 | La fórmula de la «Puntuación del día» (9 líneas) estaba abierta entre los filtros y el primer sitio. | `hoy-1` → `despues/hoy-1` | Aplicado: plegada en «Cómo se ordenan los sitios», con una frase llana arriba (57d8edd) |
| P1-3 | Tarjetas de Hoy largas, con tres cifras que compiten (min a pie, ≈ %, puntuación /100) y un párrafo de 6–8 líneas. | `hoy-2`, `hoy-3` → `despues/hoy-2` | Aplicado en parte: indicador y razón dentro de «Por qué este sitio», plegado; «Ruta a pie» queda en la misma pantalla que la cabecera de la tarjeta (57d8edd). Qué cifra manda: pregunta abierta (§6) |
| P1-4 | «Campo» no existe en el mapa hasta pulsar «Centrar». | `mapa-reposo` frente a `mapa-boton-campo` | Propuesta E3 (cambia la entrada al Modo campo) |
| P1-5 | Tocar el mapa y mantenerlo pulsado abren tarjetas distintas; la de tocar no tiene «Ruta a pie». | `tarjeta-zona`, `acceso-tarjeta-1` | Propuesta E2 |
| P1-6 | El aviso negro fijo de Reconocer tapaba las opciones de «Comprueba tú» al responder. | `reconocer-resultado-5` → `despues/reconocer-resultado-5` | Aplicado: pasa a fijo **arriba**, bajo la cabecera, como la banda de la ficha de Guía; mismo texto, siempre visible (57d8edd) |
| P1-7 | Objetivos táctiles por debajo de 48 px: «?» de 28, interruptor «Solo montes públicos» de 22 (fila de 28), chip de región 36, chips/volver/resúmenes/segmentado/saltos 44, filas de microzona 40, «Cómo buscar» 32, nombres de seta en las tarjetas 24. | `hoy-1`, `hoy-2`, `campo-1`, `capas-1` | Aplicado: todo a `--toque` (48 px); el «?» con zona táctil invisible de 48 px; enlaces de «Exportar día» y «Abrir en Google Maps» a 48 px (9f9c90c, abfce08). Los nombres de seta de las tarjetas solo ganan 4 px (≈ 32 px): con más, pisaban el nombre de la línea de al lado; el arreglo de verdad es E1 |
| P1-8 | Contraste por debajo del objetivo propio (7:1) en claro: rojo de texto 6,3:1 sobre `--lavado`, ámbar 6,5:1 sobre `--ambar-t`, blanco sobre el óxido del botón «Aquí» 6,0:1. | cálculo de tokens (B) | Aplicado: rojo 7,8:1, ámbar 7,7:1, óxido 7,1:1 (9f9c90c) |
| P1-9 | **Modo oscuro**: «Muy difícil» salía blanco sobre claro (1,15:1); los rótulos de los dibujos de Reconocer (1,7:1), las estrellas de valoración (2,3:1), la flecha de Explorar (2,4:1) y el contador de fotos de la Guía usaban colores del tema equivocado. | `hoy-21-412x915-oscuro`, `reconocer-resultado-10-412x915-oscuro` → `despues/reconocer-resultado-10-412x915-oscuro` | Aplicado (9f9c90c; el número de rasgo de los dibujos, que el primer arreglo dejó a 1,05:1, en 089f4bf) |

### P2 · Menor

| # | Hallazgo | Captura | Estado |
|---|---|---|---|
| P2-1 | Nombres comunes y científicos mezclados («Tentullo» en el selector, «Boletus aereus» en Hoy, Campo y Zona). | `hoy-2`, `selector-especie-1`, `campo-1` | Pendiente: toca 5 módulos y muchas e2e; ver propuesta de texto E-texto-1 |
| P2-2 | El aviso al empezar a grabar repetía el texto del panel y lo tapaba 6 s. | `sitios-grabando` | Aplicado: «Grabando la ruta.» 3 s (4835ed9) |
| P2-3 | Zona volvía siempre a «‹ Hoy», aunque vinieras del mapa. | `zona-1` | Aplicado: vuelve a la pantalla de origen y lo dice (57d8edd) |
| P2-4 | «Guardar» en 9 sitios con dos comportamientos (diálogo o guardado mudo de 1 estrella). | `nuevo-sitio`, `campo-ruta-pie`, `hallazgo-pregunta` | Propuesta E7 |
| P2-5 | Siete verbos para «llévame» («Navegar aquí», «Ir», «Ir aquí», «Cómo llegar», «Cómo llegar en coche», «En coche», «Google Maps»). | `chat-respuesta`, `sitios-con-sitio-1`, `tarjeta-zona` | Propuesta E-texto-2 (renombra funciones que ya conoces) |
| P2-6 | «Aquí» quiere decir siete cosas (botón «Aquí», «Navegar aquí», «Ver acceso aquí», «Ir aquí», «Explorar aquí», «Nota aquí», «Guardar sitio aquí»). | `mapa-reposo`, `aqui-cruz` | Propuesta E-texto-2 |
| P2-7 | Fin del barrido de Explorar con dos botones principales a la vez («Guardar» y «Analizar»). | `hallazgo-pregunta` | Aplicado: «Analizar» pasa a secundario (8e76e4f). Las 7 acciones: propuesta E5 |
| P2-8 | La nota de Explorar se repetía en todos los estados y decía lo mismo que la nota junto a «Analizar». | `explorar-camara`, `explorar-fin-1` | Aplicado: queda solo lo de la brújula (8e76e4f) |
| P2-9 | Intro de Reconocer duplicada (dos párrafos sobre Gemini y el reconocedor). | `reconocer-inicial-1` | Aplicado: una línea de seguridad, íntegra («Ni Gemini ni el reconocedor confirman nada, y nunca dicen si una seta se come.»); «Ir a la descarga» → «Descargarlo en Ajustes» (57d8edd) |
| P2-10 | Jerga de modelo en Explorar y Mis observaciones. | `explorar-fin-1`, `observaciones-lista` | Aplicado: «esta zona: 64 de 100 en el mapa», «zona buena / zona floja», «el árbol de la foto no coincide con el mapa» (8e76e4f) |
| P2-11 | El selector de especie enseña hasta tres líneas de fiabilidad por seta («Mapa comprobado: acierta bien» + «Modelo sin validar en esta zona»), que parecen contradecirse. | `selector-especie-6` | Pendiente: no está claro qué región valida cada dato; reescribirlo sin saberlo sería inventar. Pregunta en §6 |
| P2-12 | La cita legal de la titularidad (Ley 43/2003, BOJA…) dentro de la tarjeta de acceso empujaba los botones. | `acceso-tarjeta-1` | Aplicado: plegada en «Qué dice la ley»; el titular y el coto siguen visibles (57d8edd) |
| P2-13 | Nuevo sitio: selector de foto nativo en inglés («Choose File»). | `nuevo-sitio` | Aplicado: botón «Añadir foto» como en Reconocer (57d8edd) |
| P2-14 | Abrir y cerrar «Navegar aquí» sin moverse guardaba «Ruta · 0 m · 3 s». | `ir-sitio-ruta-guardada` | Aplicado: < 30 m y sin notas no se guarda, con aviso (4835ed9) |
| P2-15 | «No hay mapas» sin salida. | `sin-datos` | Aplicado: botón «Ir a descargas» (57d8edd) |
| P2-16 | La pestaña «Reconocer» se cortaba («Reconoce») a 375 px. | `reconocer-resultado-1-375x812-claro` | Aplicado: letra de la barra con `clamp(11px, 3.1vw, 12px)` (57d8edd) |
| P2-17 | La ficha de Guía repite tarjetas de mejores sitios iguales a las de Hoy. | `guia-ficha-caesarea-3` | Propuesta E8 |
| P2-18 | Rendimiento y batería: cabeceras con `backdrop-filter: blur(22px)` en todas las pantallas de lista; relojes de 1 s que repintaban con la pantalla apagada. | código (B) | Aplicado: cabeceras opacas sin desenfoque; relojes en pausa con la página oculta (57d8edd, 4835ed9) |
| P2-19 | Accesibilidad: el Mapa no tiene encabezado; las hojas del mapa no se cierran con Escape; iconos decorativos sin `aria-hidden`. | código (B) | Aplicado (57d8edd). Falta el retorno de foco al cerrar una hoja |
| P2-20 | El mapa (1,1 MB) se carga al arrancar aunque abras Hoy o Guía. | código (B) | Pendiente: la app abre en el Mapa, así que hoy no se gana nada; solo si se aplica E1 (abrir en Hoy) |
| P2-21 | Todo el texto en px: el tamaño de letra del sistema no lo agranda. | código (B) | Pendiente: pasada a rem con revisión visual de todas las pantallas; esfuerzo M |

### P3 · Pulido (no aplicados)

- Mapa: la pista «Mantén pulsado…» ocupa la parte alta hasta que se usa (`mapa-reposo`).
- Capas: 11 interruptores seguidos; dejar 4 arriba y el resto en «Más capas» (`capas-1`).
- Chips de día: «previsión fiable» repetido en cada uno; mostrar la etiqueta solo cuando no lo sea (`hoy-1`).
- «Ordenar por» dos veces en Hoy y «Dificultad a pie» sola en otra línea (`hoy-1`, `hoy-21`).
- Modo campo: «Seta que buscas» y «Desnivel máximo» parecen campos desactivados (`campo-1`).
- Ajustes con texto técnico («Almacenamiento persistente: no · en uso 35 MB de 4330 MB», «20261018.pmtiles maxzoom=15»).
- Zona: «Balance 30 días −14 mm», «0,20 m³/m³» sin traducir a palabras (solo si el pipeline da umbrales; si no, TODO).
- Chat: «Claude no ha escrito respuesta» encima de tarjetas válidas se lee como error (`chat-tarjetas`; puede ser del simulador).
- Mis observaciones: «Cerrar» y «Volver a la lista» a la vez (`observaciones-detalle-1`).
- Borde lateral de color en `.chat-tarjeta`, `.chip-titularidad` y `.tf-citado` (detector `side-tab`).
- Bloque del tema oscuro duplicado entero en `estilos.css` (media query + `[data-tema=oscuro]`).

---

## 4. Estructura actual frente a propuesta

### Actual (6 pestañas; la app abre en el Mapa)

```
Mapa
├─ Cabecera: especie (hoja con 16 grupos) · ficha · Capas (11 capas) · región · pista
├─ Tocar → tarjeta de zona: Ver zona · Navegar aquí · Guardar
├─ Mantener pulsado / «Aquí» + cruz → Acceso a pie: En coche · Ruta a pie · Navegar aquí · marcador
├─ Pregunta → chat (tarjetas Ver / Ir / Guardar)
├─ Guardar → Nuevo sitio
└─ Centrar → aparece Campo → Modo campo → microzona → Ir aquí → Navegar aquí (10 acciones)
                                       └─ Explorar aquí → barrido → Nada / Sí / Luego · Analizar · Guardar como sitio · Otro barrido
Hoy:   Pregunta · 16 días · filtros · Mejores sitios (20) · Mejor monte público · Temporada (16 días)
       · Los 10 mejores por seta (Por seta / Por sitio) · Exportar día · Ver en el mapa · Calendario (12 meses) · → Zona
Mis sitios:  sitios · Mis rutas (Grabar) · Mis observaciones (modal) · Exportar / Importar
Guía:        buscar · 5 filtros · ficha (con lista de mejores sitios)
Reconocer:   fotos → resultado (candidatos, dobles peligrosos, Comprueba tú, Compáralas tú)
Ajustes:     región · mapas · reconocedor · guía · «Pestaña Hoy» · tema · privacidad del chat · Gemini · normativa · datos
Zona (sin pestaña): desde la tarjeta del mapa o desde el final de Hoy
```

### Propuesta (4 pestañas + Modo campo a pantalla completa)

```
Hoy (abre aquí, o en la última pestaña usada)
├─ Cabecera: «Dónde ir hoy» · [Lista | Mapa] · [Filtros] · [Pregunta] · [⚙]
├─ Días en una fila · conmutador Por sitio | Por seta (con su seta)
├─ 5 tarjetas compactas → «Ver más»
│    seta(s) · estado y % · min a pie y subida · dificultad · público/privado
│    [Ruta a pie]  [⋯ Tiempo de la zona · Brújula · En coche · Guardar · Ficha]   ▸ Por qué este sitio
└─ ▸ Cómo se ordenan los sitios · aviso de seguridad
Mapa
├─ especie · capas (4 + «Más capas») · región
├─ Tocar o mantener → una sola tarjeta de punto: estado, titularidad, acceso a pie
│    [Ruta a pie] [Tiempo de la zona] [⋯ Guardar · Brújula · En coche]
└─ [Campo] siempre (pide GPS, centra y entra) · [A pie] (cruz) · [Guardar]
Modo campo → microzonas · Explorar aquí → «¿Encontraste algo?» → Sí: guarda en el Diario · [Reconocer esta seta]
Diario (antes Mis sitios): Sitios | Rutas | Observaciones · Grabar ruta · ⋯ Exportar / Importar
Guía: [Reconocer con foto] arriba · buscar · fichas · Temporada (16 días + meses) · Normativa
Ajustes (engranaje): descargas por región · pantalla · datos y créditos · privacidad del chat y Gemini
```

Boceto de la tarjeta compacta de Hoy (E1), con lo que ya hay en la app y sin datos nuevos:

```
┌──────────────────────────────────────────┐
│ 1  [foto] Tentullo · Boletus aereus  36  │
│           Buen momento ≈ 90 %   min a pie│
│                                   +138 m │
│ Fácil · Monte público (Junta)            │
│ [ Ruta a pie ················ ]  [ ⋯ ]   │
│ ▸ Por qué este sitio                     │
└──────────────────────────────────────────┘
```

---

## 5. Qué se une, se quita o se mueve (propuestas para decidir)

Ordenadas por impacto. ★ = las 5 más importantes. Ninguna está aplicada.

| # | Tipo | Qué | Por qué | Esfuerzo | Riesgo |
|---|---|---|---|---|---|
| ★E1 | se une | «Mejores sitios» + «Los 10 mejores por seta» + «Mejor monte público» → una sola lista en Hoy con conmutador Por sitio / Por seta y filtro «Solo públicos»; filtros en una hoja; Temporada y Calendario fuera de Hoy (E6) | Hoy pasa de ~30 pantallas a 2–3; desaparecen el doble «Ordenar» y las dos listas que no coinciden | M | Medio: decidir cuántos sitios por defecto y dónde queda el aviso de «mejor monte público» |
| ★E2 | se une | Tarjeta de zona (tocar) + Acceso a pie (mantener o cruz) → una tarjeta de punto con «Ruta a pie» como acción principal | El gesto natural (tocar) lleva a lo útil (cómo llegar andando) | M | Bajo |
| ★E3 | se mueve | «Campo» siempre visible en el mapa: al pulsarlo pide GPS, centra y entra; «Centrar» pasa a control pequeño | La función del monte deja de estar escondida tras un truco | S | Bajo |
| ★E4 | se quita / se mueve | Barra de 6 a 4 pestañas: Ajustes a un engranaje en la cabecera; Reconocer como botón principal arriba de Guía y desde el hallazgo de Explorar | Menos opciones en cada pantalla y etiquetas que caben a 375 px | M | Medio: Reconocer pasa a 2 toques |
| ★E5 | se une | Mis sitios + Mis rutas + Mis observaciones + hallazgo de Explorar → «Diario» con segmentado; un hallazgo es un sitio con sus fotos y su barrido | Un solo sitio para lo tuyo; desaparece «Guardar como sitio» | M | Medio: cambia el modelo de datos y la exportación |
| E6 | se mueve | Temporada (16 días) + Calendario (12 meses) → «Temporada» en Guía, una sola vista | Hoy se centra en hoy; el calendario es consulta | M | Bajo |
| E7 | se une | «Guardar» único: guarda al momento y enseña «Guardado · Editar» | Mismo resultado en los 9 sitios | S–M | Bajo |
| E8 | se quita | Lista de mejores sitios dentro de la ficha → botón «Ver sus mejores sitios hoy» | Fichas más cortas, una sola fuente | S | Bajo |
| E9 | se une | Tres entradas al chat (mapa, Hoy, Ajustes) → un icono en la cabecera; la privacidad dentro del chat | Menos ruido en Hoy y en el mapa | S | Bajo |
| E10 | se mueve | Exportar día y Ver en el mapa → cabecera de Hoy | Fuera del flujo de lectura | S | Bajo |
| E11 | se mueve | Zona: «Tiempo de la zona» desde la tarjeta de punto y desde cada tarjeta de Hoy | Contexto claro (la vuelta al origen ya está aplicada) | S | Bajo |
| E12 | se mueve | «Sitios por seta» de Ajustes → hoja de filtros de Hoy | Se ajusta donde se ve | S | Bajo |
| E13 | se mueve | Normativa de recogida de Ajustes → Guía y leyenda de la capa | Es contenido, no un ajuste | S | Bajo (manteniendo «Pendiente de verificar» y el aviso BOJA) |
| E14 | se quita | Región en Ajustes: queda el chip del mapa; Ajustes solo descarga | Un único sitio para elegir región | S | Bajo |
| E15 | se une | «Navegando a»: Google Maps, Google a pie, Guardar y Modo campo → menú «⋯» | De 10 a 4 acciones visibles | S | Bajo |

Lo que **no** se une: Reconocer (foto de una seta), Explorar aquí (fotos del bosque) y Pregunta a Claude (texto) son tareas
distintas. Se proponen enlaces entre ellas, no fusión.

Propuestas de texto que renombran cosas que ya conoces (por eso no se han aplicado):

- **E-texto-1** (P2-1): un formato único en toda la app, «**Tentullo** *Boletus aereus*»; donde no quepa, solo el común.
- **E-texto-2** (P2-5, P2-6): tres verbos para ir a un sitio: «Ruta a pie» (andando, con trazado), «Brújula» (lo que hoy es
  «Navegar aquí» / «Ir aquí») y «En coche» (Google Maps, hoy «Ir», «Cómo llegar», «Cómo llegar en coche»). El botón óxido
  «Aquí» pasa a «A pie» y «Ver acceso aquí» a «Ver acceso».

---

## 6. Preguntas para Alexander

1. De las tres cifras de cada sitio (≈ 90 %, «Puntuación del día 83 de 100» y «≈11× la media · top 1 %»), ¿cuál te hace
   decidir? Las otras dos podrían ir a «Por qué este sitio».
2. ¿Quieres que la app abra en Hoy (E1/E4) o en el Mapa como ahora?
3. Selector de especie: cuando dice «Mapa comprobado: acierta bien» y a la vez «Modelo sin validar en esta zona»,
   ¿la comprobación es de otra región? Con eso se puede dejar en una sola línea sin inventar.
4. ¿Un hallazgo debería ser un solo objeto (sitio + fotos + barrido + especie + nota)? Es la base de E5.

---

## 7. Arreglos aplicados

| Commit | Qué |
|---|---|
| 9f9c90c | Objetivos táctiles a 48 px; contraste 7:1 del texto en claro; colores del tema oscuro corregidos |
| 8e76e4f | Explorar y Mis observaciones sin jerga de «modelo»; un solo botón principal al acabar el barrido; nota corta |
| 4835ed9 | Rutas: sin rutas de 0 m, aviso corto al grabar, relojes en pausa con la pantalla apagada |
| 57d8edd | Hoy (plegables «Cómo se ordenan» y «Por qué este sitio»), Reconocer (aviso arriba, intro única), Zona (vuelve al origen), «Ir a descargas», «Añadir foto», «Qué dice la ley», h1 del Mapa, Escape, cabeceras opacas, pestañas a 375 px |
| abfce08 | Enlaces de Exportar día y Google a 48 px; e2e al día (pestaña Mapa por `data-p`, vuelta de Zona al mapa, fila de Mis observaciones) |
| 089f4bf | Número de rasgo legible en los dibujos de Reconocer con el tema oscuro |

Los avisos de seguridad no se han quitado ni acortado: el de Reconocer cambia de sitio (de abajo a arriba) con el mismo
texto y sigue siempre a la vista; la frase «nunca dice si una seta se come» se conserva.

Verificación: ver §8.

## 8. Verificación

- `npx vitest run`: 57 ficheros, 916 pruebas, todas en verde. `tsc --noEmit`: sin errores. `npm run build`: bien.
- `npm run e2e` completo (los 10 scripts, de `offline` a `chat`), tras el último commit: código de salida 0, 561
  comprobaciones ✔. Se actualizaron con criterio tres e2e: `citas-hoy` (abre «Por qué este sitio» antes del «?»),
  `offline` (pestaña Mapa por `data-p`, porque el «‹ Mapa» de Zona también se llama «Mapa»; comprobación nueva de la
  vuelta de Zona al mapa) y `explorar` (textos sin «modelo»).
- Medidas a 412×915 en claro (mismo script antes y después): controles visibles por debajo de 48 px, de 404 a 150
  apariciones. Lo que queda son falsos positivos de la medida (interruptores de 52×32 y casillas de 26 px dentro de
  filas de 48–52 px que son el objetivo real; chip de región de 36 px con zona táctil de 48) y dos casos reales: los
  nombres de seta de las tarjetas (≈ 32 px, ver P1-7) y los enlaces de fuentes en línea de la ficha (excepción WCAG
  2.5.8 de enlaces dentro de texto). Contraste < 4,5:1 con cifra: solo botones desactivados (exentos).
- Tema oscuro, después: sin textos por debajo de 4,5:1 salvo botones desactivados (`despues/*-412x915-oscuro.png`).
- Detector `impeccable detect` después: los mismos 6 hallazgos de antes (3 falsos positivos y 3 `side-tab` en P3).
- Capturas después: `despues/` con 139 en 412×915 claro y 153 en 412×915 oscuro. No se repitió el juego a 375×812.
