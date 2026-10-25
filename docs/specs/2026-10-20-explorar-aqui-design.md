# «Explorar aquí»: diseño (borrador para revisión de Alexander)

Fecha: 2026-10-20 · Estado: **propuesta, sin código** · Stages afectados: `02_pwa`, `06_gemini` (y `01_terreno` solo como consumidor de datos)

## 1. Qué problema resuelve

Ya en el monte, Modo campo (`app/src/campo-ui.ts`, `micro.ts`) enseña en un mini-mapa las mejores celdas de 100 m en ~500 m, e «Ir al sitio» (`ir-sitio.ts`, `brujula.ts`) apunta con la brújula. Faltan dos cosas:

1. **Orientarse sin leer un mapa**: levantar el teléfono y ver *hacia dónde* queda lo bueno y si está arriba o abajo.
2. **Lo que el modelo no ve**: el modelo trabaja con celdas de 100 m y capas de satélite (MFE, WorldCover, MDT) que pueden estar desfasadas o ser groseras. Lo que hay de verdad en el suelo (qué árbol, si el sotobosque está cerrado, si hay hojarasca húmeda o musgo) solo lo ve quien está allí.
3. **Aprender después**: guardar lo observado junto a la ruta para comparar «lo que decía el modelo» con «lo que vi» y «lo que encontré».

Reglas que no cambian: la app **nunca** dice que una seta sea comestible (spec §2) y **nunca** inventa un dato (lo desconocido se muestra como «sin dato» / `PENDIENTE`).

## 2. Qué es viable en iPhone (Safari / PWA) y qué no

| Capacidad | Estado | Fuente / cómo se sabe |
|---|---|---|
| WebXR `immersive-ar` (anclajes, detección de planos, SLAM) | **No disponible** en Safari de iPhone. Descartado. | Safari en iOS no implementa WebXR Device API (consulta 2026-10-20; reconfirmar en la fase 0). |
| Brújula: `webkitCompassHeading` + `DeviceOrientationEvent.requestPermission()` tras un toque | **Sí**. Ya en producción en «Ir al sitio». | `app/src/ir-sitio.ts:6`, `:254`, `brujula.ts` |
| Inclinación del teléfono (`beta`, `gamma`) | Sí, el mismo evento. | Igual que arriba |
| Precisión de la brújula `webkitCompassAccuracy` | Probable (API histórica de WebKit). | **Verificar en la fase 0** |
| GPS con altitud (`watchPosition`) | Sí. Ya en `posicion-viva.ts`. Altitud con ruido vertical de varios metros (lo dice `grabacion.ts`). | Código |
| Cámara en vivo `getUserMedia({video:{facingMode:'environment'}})` | Funciona en Safari de iOS. **Sin verificar en este proyecto** en la PWA instalada (modo standalone): si pide permiso cada vez que se abre y si sobrevive a que iOS recargue la página. La app hoy no usa `getUserMedia` (el reconocedor usa `<input type=file>`). | **Fase 0** |
| Foto fija desde el vídeo (canvas → JPEG) | Sí. Re-codificar en canvas además quita el EXIF (privacidad). | Estándar |
| Vídeo (`MediaRecorder`, MP4/H.264 en iOS) | Sí, pero pesa (decenas de MB por minuto) y casar el rumbo con cada fotograma exige sellos de tiempo propios. | Ver §4.2: se prefieren fotos |
| Seguimiento visual (anclar marcas al paisaje) | No sin WebXR. Las marcas se colocan **solo con brújula + inclinación**: se mueven con el error de la brújula. | Límite asumido |
| Segundo plano | La cámara se corta al bloquear la pantalla o cambiar de app. | Asumido |

Consecuencia: la «realidad aumentada» posible es **una superposición guiada por la brújula**, no AR anclada. Con brújula de móvil en monte (cerca de coches, vallas o rocas con hierro), el error típico es de ±10–20°; las marcas sirven para «hacia allí», no para «ese árbol».

## 3. Opción 1 — «AR ligera» (sin conexión, coste 0)

**Qué hace.** Pantalla a cámara completa. Encima, una marca por cada celda buena cercana (las mismas que elige Modo campo: `micro.ts`, idoneidad ≥ 50, separación ≥ 120 m, máx. 10, radio 500 m; se añade un mínimo de 50 m). Cada marca: icono de la especie, distancia, desnivel («↑ 35 m») e idoneidad. Las celdas fuera del encuadre salen como flecha en el borde («buena zona a tu izquierda, 180 m»).

**Cómo se coloca cada marca.**
- Horizontal: `Δ = normalizar(rumboCelda − rumboTeléfono)` (funciones ya existentes en `brujula.ts`). Si |Δ| < campo de visión/2 → `x = centro + tan(Δ)/tan(FOV/2) × anchoMitad`. El campo de visión horizontal de la cámara trasera principal **no se supone**: se mide en la fase 0 y queda como constante por orientación.
- Vertical: ángulo de elevación `atan2(altCelda − altAquí, dist)` menos la inclinación del teléfono (`beta − 90` en vertical). Para la altitud de *aquí* se usa la **del modelo del terreno** en tu celda (la misma fuente que `altCelda`, `acceso.bin`), no la del GPS: así el desnivel se compara entre dos valores del mismo MDT y el ruido vertical del GPS no mueve las marcas. Si falta una de las dos, la marca va a la altura del horizonte y sin cifra de desnivel.
- Suavizado: media circular de las últimas lecturas de la brújula (~0,5 s). Si `webkitCompassAccuracy` > 25° (o falta), aviso «Brújula poco fiable: aléjate del coche y haz un 8 con el teléfono».
- A menos de 80 m de una celda buena no se dibuja marca: «Estás en una zona buena» (con celdas de 100 m, apuntar a algo que tienes encima no tiene sentido).

**Qué aporta y qué no.** No añade información nueva: es el mismo dato de Modo campo puesto en el paisaje. Su valor es de uso (mirar en vez de leer un mapa, ver «arriba/abajo» de un vistazo). Coste: 0 €; funciona sin cobertura con los datos de la región descargados.

**Riesgos.** Error de brújula (las marcas bailan o señalan mal); batería (cámara + GPS + sensores: sesión que se apaga sola tras 2 min sin tocar); lo que ves no es lo que hay en la celda (una celda de 100 m es una hectárea: la UI lo dice, como ya hace Modo campo).

## 4. Opción 2 — «Captura y análisis» (con conexión, Gemini)

### 4.1 Captura: barrido de 8 direcciones

- Botón «Barrer 360°». La pantalla de cámara marca la siguiente dirección (N, NE, E… cada 45°, empezando por la que mira el teléfono). Cuando el rumbo está a ±10° y el teléfono está quieto y casi vertical, la foto se dispara sola (también con toque).
- Por cada foto se guarda: `rumbo`, precisión de la brújula, `beta`/`gamma`, hora, y una vez por barrido `lat`, `lon`, precisión GPS, altitud GPS y altitud del modelo.
- Fotos de 1024 px de lado mayor, JPEG ~0,8 (≈150–250 KB): 8 fotos ≈ 1,2–2 MB.
- Se guarda **siempre en el teléfono** antes de enviar nada. Sin cobertura queda en cola «Pendiente de analizar».
- **Fotos, no vídeo.** El vídeo pesaría mucho más por la red móvil del monte, y para casar el rumbo con cada fotograma habría que llevar un registro paralelo. Ocho fotos con su rumbo exacto dan lo mismo por dirección. El vídeo queda descartado en la v1 (se puede retomar si las 8 fotos se quedan cortas).

### 4.2 Análisis: Gemini **describe**, la app **decide**

El worker recibe las 8 fotos y les pide a Gemini **solo observaciones**, con valores cerrados por dirección:

```json
{ "direcciones": [ {
    "rumbo": 45,
    "arbol_dominante": "alcornoque|encina|quejigo|castaño|pino|eucalipto|otro|no_se_ve",
    "confianza_arbol": "baja|media|alta",
    "densidad_copas": "abierta|media|cerrada|no_se_ve",
    "sotobosque": "despejado|matorral_bajo|matorral_denso|no_se_ve",
    "suelo_visible": ["hojarasca", "musgo", "pasto", "roca", "tierra_desnuda"],
    "humedad_aparente": "seca|media|humeda|no_se_ve",
    "notas": "texto corto, opcional"
} ] }
```

- La lista de árboles sale de los hospedadores de las especies de la región (`knowledge/`, perfiles de idoneidad). **No** se le pide «dónde hay setas» ni «la mejor dirección»: un modelo de lenguaje inventaría una respuesta segura de sí misma.
- La **mejor dirección** la calcula la app con una función pura y con tests (`explorar.ts`): para cada dirección combina (a) lo observado contra el perfil de la especie elegida (árbol hospedador, copas, sotobosque, humedad) y (b) la idoneidad de las celdas del modelo en ese sector de 45° (de `micro.ts`). Devuelve un orden y **razones de una línea** construidas con los factores reales («alcornoque visto, copas medias, hojarasca húmeda; modelo 72 en ese sector»). Si Gemini contradice al modelo, se dice («el modelo da pinar; en la foto se ve alcornoque»). Los pesos exactos se fijan en el plan a partir de los perfiles existentes, no aquí.
- El worker aplica la misma capa de seguridad que `/identificar`: borra cualquier mención de comestibilidad y valida el esquema. Gemini no mira setas en este modo; si sale una en la foto, se ignora (para eso está «Reconocer»).

### 4.3 Endpoint y cuota

- Nuevo `POST /explorar` en el worker actual (mismo origen permitido, mismo `REQUIRE_KV`). Hasta 8 fotos de ≤ 400 KB; cuerpo ≤ ~4 MB.
- Cuota propia en KV: **10 barridos por IP y día** y un tope global de **60 al día** (valores de partida, a confirmar; ver §8). Cuenta aparte de los reconocimientos, para que explorar no se coma el cupo de «¿qué seta es?».
- Contexto enviado: especie buscada, mes, altitud del modelo, idoneidad del modelo por sector. **Coordenadas redondeadas a 0,01°** (~1 km): a Gemini no le hace falta más y así no recibe tu punto exacto.

### 4.4 Coste por análisis

Con los precios de `gemini-3.8-flash` que ya recoge `worker/README.md` (consultados 2026-10-13: entrada 0,75 $/M tokens, salida 3,75 $/M hasta el 31-12-2026; el doble desde 2027) y la medida del propio README de ~1.000–1.100 tokens por foto:

| Concepto | Tokens aprox. | Hasta fin de 2026 | Desde 2027 |
|---|---|---|---|
| Entrada: 8 fotos + instrucciones + contexto | ~9.500 | ~0,0071 $ | ~0,014 $ |
| Salida: JSON de 8 direcciones + razonamiento medio | ~2.000–2.500 | ~0,0075–0,0094 $ | ~0,015–0,019 $ |
| **Total por barrido** | | **≈ 0,015–0,017 $** | **≈ 0,03 $** |

Peor caso con la cuota propuesta: 60 × 0,017 $ ≈ 1 $/día hasta fin de año. Bajada posible: `media_resolution` media (la documentación de Gemini 3 indica 560 tokens por imagen en vez de 1.120; **verificar** en la fase 0 si basta para distinguir alcornoque de encina) y razonamiento bajo, ya que la salida es una descripción cerrada.

### 4.5 Privacidad

- Las fotos y el punto se guardan solo en el teléfono (IndexedDB/OPFS). Al servidor van solo al pulsar «Analizar». La primera vez, un aviso de una línea: «Las 8 fotos se envían a Google (Gemini) para describir el bosque. No se guardan en nuestro servidor».
- El worker no guarda fotos ni registros con imágenes; solo los contadores de cuota (IP con fecha, como ahora).
- Sin EXIF (re-codificación en canvas) y coordenadas redondeadas (§4.3).
- Con el **nivel gratuito** de Gemini, Google puede usar lo enviado para mejorar sus productos; con el de pago, no. Qué nivel usa hoy la clave es una decisión de Alexander (§8).
- Si sale una persona o una matrícula, la foto sigue en el teléfono y el usuario puede quitarla del barrido antes de enviar.

### 4.6 Riesgos

- **Cobertura**: en barrancos y umbrías del monte suele no haber datos. El análisis puede llegar tarde (en casa), con lo que sirve para aprender pero no para orientarse en el momento. Se mitiga con la cola y con la Opción 1, que no necesita red.
- **Calidad de la descripción**: distinguir alcornoque, encina y quejigo a 30 m con luz de sotobosque es difícil. Se pide `confianza` y `no_se_ve`; con confianza baja, la dirección pesa solo por el modelo.
- **Sesgo de encuadre**: la foto ve 50 m; la celda, 100 m. Lo dice la UI.
- **Coste si se publica la app**: la cuota global protege la factura; si hubiera usuarios ajenos, haría falta otra solución (ver `docs/ideas/monetizacion.md`).

## 5. Guardar observaciones y sacar conclusiones

Nuevo tipo `Observacion` en su propia base de IndexedDB (como `rutas.ts`; idb-keyval, una base por almacén):

```ts
interface Observacion {
  id: string; t: number;
  lat: number; lon: number; precGps: number;
  altGps: number | null; altModelo: number | null;
  especie: string;                 // la buscada ('' = ninguna)
  rutaId: string | null;           // grabación en curso, si la había
  modelo: ValoresCelda | null;     // lo que decía el modelo en tu celda (copia, por si cambian los datos)
  direcciones: { rumbo: number; precBrujula: number | null; foto: Blob; analisis: DireccionGemini | null }[];
  estado: 'sin_analizar' | 'pendiente' | 'analizada' | 'error';
  hallazgo: 'no_mirado' | 'nada' | 'encontrada';   // lo marca el usuario, nunca la app
  nota: string;
}
```

- Si hay una ruta grabándose, cada observación añade una nota (`NotaTrack`) con enlace a la observación, y sale como waypoint en el GPX.
- «Guardar como sitio» crea un `Sitio` en Mis sitios con la observación enlazada.
- **Hallazgo**: al terminar, la app pregunta «¿Encontraste algo aquí?» (Nada / Sí, especie… / Luego). Es la pieza que convierte las observaciones en datos útiles.
- **Conclusiones** (pantalla «Mis observaciones», fase 4): tabla y mapa con, por observación, idoneidad del modelo, lo que se vio y el hallazgo; filtros por especie y mes; y dos resúmenes sencillos: «el modelo acertó / falló donde fuiste» y «árbol observado ≠ árbol del modelo». Sin estadística inventada: con pocos datos, se enseñan los casos, no porcentajes.
- **Exportar** a GeoJSON (sin fotos, o con miniaturas) para que el pipeline (`01_terreno`) pueda usar los hallazgos propios como citas de calibración, con la misma validación espacial que GBIF. Que el pipeline los use es una decisión aparte.

## 6. Recomendación

**Una sola pantalla «Explorar aquí» que crece por fases, con la Opción 2 (captura y análisis) como apuesta principal y la Opción 1 (AR ligera) dentro de ella como modo sin conexión.**

Por qué:
- Las dos opciones necesitan la misma base: cámara en vivo con rumbo e inclinación. La pantalla guiada del barrido (§4.1) *ya es* una vista de cámara con brújula; pintarle encima las celdas de `micro.ts` cuesta poco más.
- La Opción 1 sola no añade información: reordena la que ya da Modo campo. La Opción 2 sí añade lo que falta (el bosque real frente al de satélite) y deja datos para calibrar.
- Las observaciones guardadas (§5) valen aunque no haya cobertura y aunque Gemini falle: son la parte de más valor a largo plazo y no cuestan nada.

## 7. Plan por fases

| Fase | Entrega | Coste | Criterio para seguir |
|---|---|---|---|
| **0. Spike en el iPhone** (desechable) | Página de prueba en la PWA instalada: cámara trasera en standalone (¿pide permiso cada vez?, ¿sobrevive a recargas?), `webkitCompassAccuracy`, medida del campo de visión (vertical y apaisado), estabilidad de la brújula en monte real, peso y tiempo de subida de 8 fotos por 4G, y una llamada de prueba a Gemini con 8 fotos reales a resolución media y a la normal | 0 € + ~0,1 $ | Cámara usable en standalone y brújula con error ≤ 20° la mayor parte del tiempo. Si la cámara falla en standalone → captura con `<input capture>` (una foto por dirección, sin vista en vivo) y la Opción 1 se cae |
| **1. Observaciones + barrido sin conexión** | Pantalla de cámara con rumbo, barrido guiado de 8 fotos, `Observacion` en IndexedDB, enlace a ruta y a Mis sitios, pregunta de hallazgo | 0 € | Probado en una salida real |
| **2. AR ligera** | Marcas de celdas buenas sobre la cámara (§3), desde el mismo `micro-datos.ts` que Modo campo | 0 € | Las marcas señalan la dirección correcta en campo (comparando con el mini-mapa) |
| **3. Análisis con Gemini** | `POST /explorar` con cuota propia, `explorar.ts` (mejor dirección determinista, con tests), cola de pendientes | ~0,016 $/barrido | Las descripciones coinciden con lo que ve Alexander en ≥ 6 de 8 direcciones en 3 salidas |
| **4. Mis observaciones** | Lista + mapa + resúmenes + exportar GeoJSON | 0 € | — |

Pruebas en cada fase: lógica pura con Vitest (como `brujula.test.ts`, `micro.test.ts`), e2e con sensores y cámara simulados (Playwright: `--use-fake-device-for-media-stream` y eventos de orientación inyectados), test del worker con Gemini simulado y una prueba real `*.red.mjs` como `gemini-real.red.mjs`. Las pruebas en el iPhone de Alexander no se pueden automatizar: cada fase acaba con una salida real.

El plan detallado de implementación (writing-plans) se escribe **después** de que Alexander apruebe este spec y la fase 0 dé resultado.

## 8. Decisiones para Alexander

1. ¿De acuerdo con la recomendación (una pantalla, fases 0→4, Gemini en la fase 3)?
2. Cuota de partida: 10 barridos por IP y día, 60 globales (≈ 1 $/día de tope hasta fin de año). ¿Vale?
3. ¿La clave de Gemini está en el nivel de pago? Si es la gratuita, Google puede usar las fotos enviadas (§4.5).
4. ¿Barrido de 8 direcciones (más detalle, ~0,016 $) o de 4 (más rápido y ~la mitad de coste)?
5. ¿Quieres que los hallazgos propios acaben como citas de calibración del pipeline (§5, exportar), o solo para consultarlos tú?
