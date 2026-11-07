# Navegar en el monte: Wikiloc frente a nuestra PWA (07/11/2026)

Solo lectura sobre `app/`. Código leído en `main` (`ir-sitio.ts`, `navegar.ts`, `brujula.ts`, `posicion-viva.ts`, `campo-ui.ts`, `campo-ruta.ts`, `ruta-pie.ts`, `ruta.ts`, `perfil-grafico.ts`, `grabacion.ts`, `grabar-ui.ts`, `micro.ts`) y el diseño de «Explorar aquí» en la rama `claude/relaxed-meninsky-eef114` (`docs/specs/2026-10-20-explorar-aqui-design.md`).

## 0. Cómo se verificó Wikiloc (límites)

- `help.wikiloc.com` y `wikiloc.com` devuelven 403 de Cloudflare a las herramientas de lectura. No se ha saltado la protección. Lo que se cita de las páginas de ayuda viene del **resumen que dio el buscador sobre esa URL**, no de haber abierto el artículo. Se marca «ayuda (vía buscador)».
- La ficha de App Store sí se pudo leer entera (https://apps.apple.com/gb/app/id432102730).
- Lo que solo aparece en blogs o reseñas de terceros va como «sin verificar».
- Antes de decidir nada caro conviene abrir a mano los artículos 473, 107 y 738 de la ayuda y probar la app (30 min).

## 1. Tabla: función de Wikiloc → nuestra app → importancia para setas

| Función de Wikiloc | Fuente | ¿La tenemos? (archivo:línea) | Importancia setas |
|---|---|---|---|
| **Seguir ruta**: «Navigate Trail» → «Start Navigation»; las indicaciones empiezan al acercarte al track. Seguir tracks ajenos exige Premium | Ayuda 473 y 842 (vía buscador): https://help.wikiloc.com/article/473-navigate-trail-app · https://help.wikiloc.com/article/842-smartphone-app-wear-os-google | **Parcial.** Seguimos un sendero aparcamiento→sitio o la ruta A* del Modo campo (`ir-sitio.ts:306` `abrirIr`, `campo-ruta.ts` `rutaHacia`). No se puede cargar un GPX ajeno para seguirlo (`deGPX` en `main.ts:995` solo importa sitios) | Media |
| **Aviso de desvío con sonido** (salir, volver y saltarse un tramo) | Ayuda 107 (vía buscador): https://help.wikiloc.com/article/107-app-sound-alerts · App Store | **Parcial.** Aviso visual + vibración al salir >50 m y al volver (`navegar.ts:14,71`, `ir-sitio.ts:139-150`). Sin sonido, sin aviso de «tramo saltado» | Alta |
| **Sin voz**: la ayuda dice que la app no da indicaciones habladas y que lo estudian; algunas fichas de terceros hablan de «voz» | Ayuda 107 (vía buscador); Mergeek y Gizmodo contradicen, sin verificar | No. No hay `speechSynthesis` en `src/` | Media |
| **Mapas offline** gratis (Perfil → Ajustes → Mapas offline); cambiar entre capa online y offline mientras grabas o sigues | App Store; ayuda 622/623/732 (vía buscador): https://help.wikiloc.com/article/622-how-to-manage-your-offline-maps-on-the-wikiloc-app · https://help.wikiloc.com/article/732-follow-trail-offline | **Sí.** Mapas y datos en OPFS (`main.ts:27`, `opfs.ts`); botón «Descargar mapas» (`index.html:382`). Sin chequeo de «¿tengo todo para esta zona?» | Alta |
| **Waypoints** al grabar, con fotos | App Store | **Sí.** «Nota aquí» con posición, texto y 0-3 estrellas (`grabar-ui.ts:199`, `ir-sitio.ts:104`); GPX con `wpt` (`grabacion.ts:144`). Sin foto | Alta |
| **Aviso al pasar cerca de un waypoint** | Solo en una guía de terceros (https://travesiapirenaica.com/en/how-to-use-wikiloc/) | **No.** *Sin verificar en Wikiloc.* Nosotros tampoco avisamos al acercarnos a Mis sitios o notas | Alta (para nosotros) |
| **Perfil de elevación**; al deslizar el dedo sale un punto azul en el mapa | Ayuda 106 (vía buscador): https://help.wikiloc.com/article/106-see-trail-route-direction-app-map | **Parcial.** Perfil SVG táctil de la ruta (`perfil-grafico.ts:25`, usado en `campo-ruta.ts:134` y `main.ts:764`). No marca **dónde estás** mientras navegas ni enseña lo que queda; tampoco enlaza con un punto del mapa | Alta |
| **Tu posición en el perfil mientras navegas** | Sin verificar (solo aparece en páginas de terceros) | No | Alta |
| **Distancia, tiempo o desnivel restante** | Datos de navegación (velocidad, tiempo en movimiento, desnivel, altitud) en una reseña de diseño de terceros (https://screensdesign.com/showcase/wikiloc-outdoor-navigation-gps); «restante» sin verificar | **Parcial.** Distancia restante por el sendero y subida restante (`navegar.ts:50-85`, `ir-sitio.ts:171-181`). **Falta tiempo restante** aunque `ruta-pie.ts:39` ya calcula Tobler | Alta |
| **Brújula / indicador de rumbo** y brújula arriba a la derecha para fijar el norte | App Store; ayuda 473 (vía buscador) | **Sí.** Flecha con brújula, fallback a rumbo de la marcha y a norte (`ir-sitio.ts:6-9,224-263`); «Mapa hacia donde miro» (`ir-sitio.ts:205`) | Alta |
| **Arrastrar el mapa deja de seguirte** | Comportamiento conocido; sin fuente oficial | **Sí.** `ir-sitio.ts:365` | Baja |
| **Volver al inicio** | No se encontró en la ayuda ni en la ficha (la búsqueda solo devolvió Garmin). *Sin verificar* | **No.** Sabemos el aparcamiento (acceso.bin) y el inicio del track grabado, pero no hay botón | Alta |
| **Grabación** de track con pausa/recuperación | App Store | **Sí.** Se guarda en IndexedDB cada ≤3 s y recupera tras recarga de iOS (`grabar-ui.ts:3-8`); GPX/GeoJSON (`grabacion.ts:144,179`). El rastro no se dibuja en el mini-mapa mientras navegas (`ir-sitio.ts:187`) | Alta |
| **Modo ahorro de batería** | No existe como ajuste. La ayuda recomienda mapas offline, modo avión o apagar radios; culpa a la ubicación de alta precisión (ayuda 738 vía buscador: https://help.wikiloc.com/article/738-battery-drains-fast) | **No.** Pantalla siempre encendida con Wake Lock (`ir-sitio.ts:279`), `enableHighAccuracy` fijo (`posicion-viva.ts:38`), mapa repintado hasta 12/s (`ir-sitio.ts:207`) | Alta |
| **Avisos con la pantalla bloqueada** | No verificado | **No posible en PWA/iOS**: Safari puede pausar el GPS (se avisa en `grabar-ui.ts:23`) | Alta (límite) |
| Reloj (Apple Watch, Wear OS, Garmin, Suunto, COROS), «Send to GPS» | App Store; ayuda 842 | No | Baja |
| Live tracking (compartir posición) | App Store | No | Media (seguridad) |
| Planificador de rutas, vista 3D, meteo, filtros por zona | App Store; https://www.wikiloc.com/premium | Planificador **mejor para nosotros**: A* sobre MDT25 con Tobler (`ruta-pie.ts`), dos modos y límite de desnivel (`campo-ruta.ts:40`). Meteo propia | Alta (ya ganamos) |
| Novedades recientes de la app (2025-26): 3D, vídeos 3D, compartir con perfil, adaptación a iOS 26; en Play figura la 3.61.12 (31/07/2026) | App Store (notas 3.21 a 3.31) y Google Play | Nada de eso toca la navegación en campo | — |

Resumen: Wikiloc es un navegador de tracks ajenos; nosotros somos un buscador de **sitios** con la ruta calculada. En seguimiento fino (avisos con sonido, tiempo restante, posición en el perfil, ahorro de batería) vamos por detrás. En planificación por desnivel y en saber **dónde buscar** vamos por delante.

## 2. Las 8 mejoras de más valor, por valor/esfuerzo

| # | Mejora | Qué hacer | Archivos | Esfuerzo | Riesgo |
|---|---|---|---|---|---|
| 1 | **Avisos de desvío que no mientan** | El umbral fijo de 50 m falla con la ruta del Modo campo: la rejilla de respaldo es de 100 m (centros de celda hasta ~70 m de la línea real) y la precisión del GPS en bosque ronda ±15-30 m. Umbral = `max(50, 2×precisión, 0,7×res)`, exigir 2-3 lecturas seguidas fuera (como ya hace `pasoZona`) y no avisar con precisión >50 m. Añadir un pitido corto (WebAudio) además de vibrar | `navegar.ts` (`estadoNavegacion`, constantes), `ir-sitio.ts` (`alerta`), `micro.ts` (reutilizar la histéresis) | S | Precisión del GPS en iOS; `navigator.vibrate` no existe en iOS Safari, así que el sonido y el aviso visual son los únicos canales. Sonido solo si la app está en primer plano |
| 2 | **Tiempo restante y hora de llegada con Tobler** | Con el perfil del sendero/ruta, sumar `tiempoPasoMin` de lo que queda; mostrar «≈ 18 min · llegas a las 12:40». Añadir «quedan 2 h 10 min de luz» (hora de puesta de sol ya calculable) y avisar si ida+vuelta no cabe | `navegar.ts` (nuevo `tiempoRestante`), `ruta-pie.ts:39` (ya existe), `ir-sitio.ts:171`, `meteo.ts`/calendario para el ocaso | S | Tobler da ritmo de excursionista sin parar; buscar setas es más lento: aplicar factor ×1,3-1,5 y decir «sin paradas» |
| 3 | **Avisar al acercarte a tus sitios y notas** (waypoint con proximidad) | Con Mis sitios y las notas de rutas grabadas, avisar a <60 m: «Estás cerca de “Níscalos 2025” (★★★)». Una vez por sitio y salida | `sitios.ts`, `grabacion.ts`, `posicion-viva.ts`, `ir-sitio.ts` / `campo-ui.ts` (nuevo bloque en `pintar`) | S | Batería casi nula (solo comparaciones de distancia). Falsos avisos si la precisión es mala: respetar `PRECISION_MAX_M` |
| 4 | **Volver al coche** (y «volver por donde vine») | Guardar el punto de partida al empezar a grabar o navegar («Coche aquí» a un toque). Botón «Volver»: flecha y distancia al coche; si hay track, seguirlo hacia atrás con el mismo aviso de desvío. Dibujar el rastro en el mini-mapa | `grabar-ui.ts` (guardar inicio), `ir-sitio.ts` (destino=coche y capa de rastro, `pintarMapa`), `rutas.ts`, `navegar.ts` | M | Brújula del móvil falla junto al coche: avisar «aléjate unos pasos». El rastro grabado tiene huecos si iOS pausa el GPS |
| 5 | **Recalcular la ruta al desviarte** | Si estás fuera >N lecturas, botón «Recalcular» (y automático opcional): `rutaPie` desde tu posición al mismo destino con el último modo. Hoy solo dice «vuelve hacia la línea azul» (`ir-sitio.ts:143`) | `ir-sitio.ts`, `campo-ruta.ts` (`calcular`, necesita las cotas cargadas), `ruta-pie.ts` | M | CPU: A* con 60 000 nodos como máximo; medir en iPhone. Sin cotas descargadas (offline sin datos) no hay recálculo: caer a línea recta y decirlo |
| 6 | **Perfil con «Tú estás aquí» y lo que queda** | Dibujar en el perfil un marcador móvil y sombrear lo ya recorrido; encima, «Siguiente: subida 14 % durante 120 m». Tocar el perfil mueve un punto en el mapa (como Wikiloc, ayuda 106) | `perfil-grafico.ts` (devolver API `marcar(dist)`), `ir-sitio.ts` (incrustar el gráfico), `navegar.ts` (distancia recorrida ya sale de `seguir`) | M | Repintado SVG a cada lectura: limitar a 1 vez/s. El perfil usa celdas de 100 m, suaviza pendientes (decirlo) |
| 7 | **Modo ahorro de batería** | Interruptor «Ahorro»: oscurece (negro con flecha y distancia, bueno para OLED), apaga el mapa (`Mini` en pausa), repintado ≤1/s, suelta el Wake Lock cuando llevas >60 s parado y lo pide al tocar, muestra el aviso de Safari. Chequeo previo «Listo para el monte» (mapas, cotas y micro descargados; batería si la API existe) | `ir-sitio.ts` (`pintarMapa`, `pedirBloqueo`), `minimapa.ts`, `campo.css`, `opfs.ts` (comprobación de datos) | M | iOS no permite bajar la frecuencia del GPS desde la web ni seguir con la pantalla bloqueada; la ganancia viene de pantalla y GPU, no del GPS. `getBattery` no existe en Safari: no depender de ella |
| 8 | **Indicaciones habladas** | `speechSynthesis` en español: «Te sales de la ruta», «Has llegado», «Zona buena a 80 m al norte». Wikiloc dice que no tiene voz, así que es un extra | nuevo `voz.ts`, `ir-sitio.ts:alerta`, `campo-ui.ts:alerta`, `ajustes` (interruptor) | S | iOS exige un gesto del usuario para desbloquear la voz y respeta el interruptor de silencio; no suena con la pantalla bloqueada. Sin verificar en la PWA instalada: probar en el iPhone |

Orden recomendado de ejecución: 1, 2 y 3 en un solo bloque (todas S, tocan `navegar.ts`/`ir-sitio.ts`), luego 4 y 5, después 6 y 7, y 8 al final. Sinergia: 2, 4 y 6 comparten el cálculo de recorrido y perfil; conviene escribirlo una vez en `navegar.ts`.

## 3. Dos ideas propias de las setas

**A. «Entras en zona buena» (avisar al entrar, no solo al salir).** `pasoZona` solo avisa de la salida y del regreso (`micro.ts:194-206`); la **primera** entrada en una celda ≥50/100 no avisa (`estuvo` aún es falso). Añadir un aviso de entrada con la razón de la celda (`razonCelda`: árbol, suelo, altitud) y vibración corta: «Entras en una zona buena para níscalos (72/100): pinar, 640 m». Además avisar a ~100 m de la **siguiente** microzona del itinerario. Archivos: `micro.ts` (`AvisoZona` pasa a incluir `'entra'`), `campo-ui.ts:156` (`alerta`). Esfuerzo S. Riesgo: avisos repetidos al borde de la celda (la histéresis actual lo cubre) y el GPS impreciso bajo el pinar: respetar `PRECISION_MAX_M`.

**B. «Seta aquí» con un toque.** Botón grande fijo en Navegar y Modo campo que guarda **sin diálogo** posición, especie activa, hora y precisión en Mis sitios (1 estrella) y en la grabación si existe, con «Deshacer» durante 5 s; la ficha (texto, estrellas, foto) se completa después con calma. Hoy «Nota aquí» abre un diálogo con texto y estrellas (`grabar-ui.ts:199`), demasiado para manos mojadas o con guantes. El hallazgo alimenta la comparación modelo frente a realidad de «Mis observaciones» (rama de Explorar aquí). Archivos: `grabar-ui.ts`, `main.ts:1447` (`guardarSitio`), `ir-sitio.ts`, `campo-ui.ts`. Esfuerzo S. Riesgo: duplicados por doble toque (antirrebote de 3 s) y guardar un punto con mala precisión (guardarla y mostrarla).

Extra de bajo coste: pintar en el mini-mapa las celdas ya recorridas del Modo campo (rastro + celda visitada) para no repasar lo mismo. No se cuenta entre las dos, pero comparte el trabajo de la mejora 4.

## 4. Criterio de comodidad: «terreno cómodo»

**Datos que ya tenemos** por ruta: `total_m`, `subida_m`, `bajada_m`, `min`, `max` y el perfil por celda (`ruta.ts:35`), y el tiempo de Tobler (`ruta-pie.ts:154`). Hoy la dificultad solo mira tiempo y subida total (`ruta.ts:13-18`): una ruta de 25 min con 200 m seguidos de cuesta sale «moderada», igual que 25 min con 200 m repartidos. No distingue cómo es el esfuerzo.

**Cuatro números** (todos salen del perfil, sin datos nuevos):

1. **Desnivel por km**: `(subida+bajada) / km`. Mide el sube-baja total. La bajada cuenta porque cansa rodillas y obliga a volver a subir (en el router ya pesa: `PESO_BAJADA`).
2. **Pendiente media** de subida: `subida_m / distancia de los tramos en subida`, en %.
3. **Pendiente máxima sostenida**: la mayor pendiente medida sobre ventanas de ≥50 m (con celdas de 100 m, sobre un paso). Cuenta como máxima sostenida, no un salto de celda.
4. **Esfuerzo relativo**: tiempo de Tobler de la ruta ÷ tiempo de la misma distancia en llano (Tobler a 0 % da ≈ 5,0 km/h). 1,00 es llano; 1,5 quiere decir «tardas un 50 % más por el terreno». Es el único número que se explica solo.

Referencias de Tobler (calculadas con la fórmula del código `6·e^(−3,5·|s+0,05|)`): subida del 10 % ≈ 3,5 km/h; 20 % ≈ 2,5 km/h; 30 % ≈ 1,8 km/h.

**Tramos**: partir el perfil en subidas, bajadas y llanos con histéresis (cambio de tendencia solo si acumula ≥15 m de desnivel, parecido al `UMBRAL_DESNIVEL_M` = 4 m de `grabacion.ts:15`, pero más alto porque la rejilla es gruesa). Cada tramo: tipo, longitud, desnivel y pendiente media.

**Etiqueta propuesta (umbrales provisionales, a calibrar con 3-4 salidas reales de Alexander; no están contrastados con ninguna fuente):**

| Etiqueta | Pendiente media subida | Máx. sostenida | Esfuerzo relativo |
|---|---|---|---|
| Cómodo | ≤ 5 % | ≤ 10 % | ≤ 1,15 |
| Con algo de cuesta | ≤ 10 % | ≤ 20 % | ≤ 1,4 |
| Exigente | más | más | más |

Regla: manda la peor de las tres. Es más estricta que lo que el router tolera (penaliza desde 15°, o sea 27 %, y prohíbe desde 30°, 58 %, `ruta-pie.ts:20-22`): el filtro de desnivel decide qué es posible; esta etiqueta decide qué es **agradable**. No sustituye a `dificultad()`; se muestra a su lado.

**En la ficha (Ruta a pie y microzona del Modo campo):**

- Línea 1: «**Terreno cómodo** · 1,2 km · +45 m / −30 m · ≈ 20 min».
- Línea 2: «Pendiente media 4 %, máxima 11 % · 3 subidas y 2 bajadas».
- Perfil coloreado por tramo (verde llano, ámbar cuesta, rojo fuerte) **y** con texto o trama para no depender solo del color (regla que ya sigue `perfil-grafico.ts`). El tramo más duro rotulado: «Cuesta de 140 m al 17 %».
- Nota: «Calculado con celdas de 100 m (25 m si hay MDT): las pendientes cortas se suavizan». Con `fuente === 'acceso100'` (`campo-ruta.ts:123`) mostrar la etiqueta con «aprox.».
- En la lista de microzonas, junto a `+12 / −8 m` (`textoDesnivelMicro`), añadir la etiqueta corta («cómodo», «cuesta»). Se puede ordenar y filtrar por ella como hoy por desnivel máximo.

**Durante la navegación:**

- Cabecera: «Quedan 640 m · ≈ 9 min · +30 m». Ya hay distancia y subida restante; añadir tiempo (mejora 2).
- Línea «Ahora»: «Subida suave (6 %)» o «Bajada fuerte (−18 %)» según el tramo bajo tus pies.
- Línea «Después»: «En 180 m, cuesta de 90 m al 15 % (≈ 6 min)». Aviso previo a ~100 m del tramo duro, una vez, para dosificar el esfuerzo y no para alarmar.
- En la vuelta, invertir: lo que subes a la ida se baja y al revés. Mostrar «Vuelta: +30 / −45 m» desde el principio, porque el cansancio de la vuelta decide si merece la pena el sitio (lección del 18/10: un sitio se descartó por la bajada y la subida que pedía, `ruta-pie.ts:2-3`).

**Dónde implementarlo:** una función pura `comodidad(perfil)` en `ruta.ts` (o un `comodidad.ts` con su `.test.ts`) que devuelva números, tramos y etiqueta; la usan `campo-ruta.ts` (ficha), `main.ts:749` (Ruta a pie del coche), `perfil-grafico.ts` (colores de tramo) e `ir-sitio.ts` (durante la navegación). Esfuerzo M. Riesgo principal: umbrales sin calibrar y datos groseros; por eso van marcados «provisional» y la UI debe decir «aprox.».

## 5. Pendiente de comprobar

- Abrir a mano las ayudas 473 (navegar), 107 (alertas) y 738 (batería) y probar la app de Wikiloc 30 min: confirmar avisos de «tramo saltado», tiempo restante y waypoints con proximidad (hoy **sin verificar**).
- Probar en iPhone: voz (`speechSynthesis`), sonido de aviso con la app en primer plano y comportamiento del GPS con Wake Lock tras 20 min.
- Medir el tiempo de `rutaPie` en el iPhone antes de ofrecer recálculo automático (mejora 5).
