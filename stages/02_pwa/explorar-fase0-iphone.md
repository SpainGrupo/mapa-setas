# «Explorar aquí»: lista de comprobación en el iPhone (fase 0)

Para Alexander, con la PWA **instalada** en la pantalla de inicio (modo standalone) y la versión nueva ya publicada. Nada de esto se puede automatizar: el código está probado con cámara y sensores falsos (`app/e2e/explorar.e2e.mjs`), pero los valores reales solo salen del teléfono. Anota cada resultado al lado de la casilla.

Spec: `docs/specs/2026-10-20-explorar-aqui-design.md` §2, §4.4, §7 (fase 0). Criterio para seguir con el uso en campo: cámara usable en standalone y brújula con error ≤ 20° la mayor parte del tiempo. Si la cámara falla en standalone, queda el respaldo (una foto por dirección con la cámara del móvil) y las marcas sobre la cámara no sirven.

## Cámara
- [ ] Modo campo › «Explorar aquí» abre la cámara trasera en vivo (no el selector de archivos).
- [ ] ¿Pide permiso de cámara **cada vez** que se abre? (anotar: sí / solo la primera)
- [ ] ¿Sobrevive a una recarga? Con el barrido empezado, bloquear y desbloquear el móvil o cambiar de app y volver: ¿sigue la cámara o hay que pulsar «Reanudar»?
- [ ] Diagnóstico: 4 toques seguidos en el rumbo (arriba a la derecha). Apuntar «cámara: vivo» y la resolución que da (por ejemplo 1920×1080).

## Brújula
- [ ] «Activar brújula» pide permiso una vez y el rumbo se mueve al girar.
- [ ] ¿Hay `webkitCompassAccuracy`? Lo enseña el diagnóstico (4 toques en el rumbo): anotar el valor en tres sitios (casa, campo abierto, junto al coche).
- [ ] Estabilidad en el monte: en un punto fijo, girar 360° despacio y volver al mismo árbol. ¿Cuántos grados de diferencia? (objetivo ≤ 20°). ¿Sale «Brújula poco fiable»?

## Campo de visión (provisional: `FOV_H`/`FOV_V` en `app/src/explorar-geo.ts`)
Los valores actuales **no están medidos**: horizontal 52° con el móvil en vertical y 68° en apaisado; vertical 68° en vertical y 52° en apaisado.
- [ ] Poner dos objetos a ±X° del centro con la brújula (por ejemplo ±20°) y mirar si caen justo en el borde de la imagen. Repetir con el móvil en vertical y en apaisado.
- [ ] Anotar el campo de visión real: horizontal ____° / vertical ____° (vertical y apaisado).
- [ ] Marcas AR: con el mini-mapa de Modo campo al lado, ¿la marca de una microzona señala hacia el mismo lado que el mapa?

## Barrido
- [ ] En vertical, el disparo automático salta solo al apuntar a ±10° y estar quieto; «Foto ahora» funciona.
- [ ] **En apaisado no hay disparo automático** (la inclinación `beta` cambia de eje): comprobar que ahí solo vale «Foto ahora» y que la guía no engaña.
- [ ] Tiempo de subida de un barrido de 8 fotos por 4G (pulsar «Analizar» con datos móviles): ____ s. Peso total enviado: ____ MB.
- [ ] Sin cobertura: «Analizar» deja «Pendiente: se analizará con conexión» y se analiza solo al volver la red.
- [ ] Batería: ¿cuánto baja en 10 minutos con cámara, GPS y brújula? La app se pausa sola tras 2 minutos sin tocar.

## Calidad del análisis (tres salidas)
- [ ] Salida 1, Salida 2, Salida 3: en cada barrido, comparar lo que dice Gemini de cada dirección (árbol, copas, sotobosque, humedad) con lo que ves. Criterio: **≥ 6 de 8 direcciones correctas** por barrido.
- [ ] ¿Distingue alcornoque de encina y quejigo a unos 30 m con luz de sotobosque? (anotar casos fallidos)
- [ ] ¿La «Mejor dirección» y sus razones tienen sentido? Ninguna pantalla debe hablar de comestibilidad.
- [ ] «Mis observaciones»: el resumen, la exportación GeoJSON y el borrado funcionan; el sitio guardado aparece en Mis sitios.

## Qué se hace con los resultados
- Actualizar `FOV_H` y `FOV_V` en `app/src/explorar-geo.ts` con los valores medidos y quitar la palabra «provisional» de su comentario y del contrato (`stages/02_pwa/CONTEXT.md`).
- Decidir `media_resolution` de Gemini (media: unos 560 tokens por imagen en vez de 1.120, la mitad de coste de entrada) si alcanzan las 6 de 8 direcciones.
- Si la brújula no baja de ±20° de forma habitual, replantear las marcas AR (quedarían solo como orientación aproximada o se quitan).
- Confirmar si la clave de Gemini es de pago (con la gratuita Google puede usar las fotos enviadas; el aviso de privacidad ya lo dice a medias).
