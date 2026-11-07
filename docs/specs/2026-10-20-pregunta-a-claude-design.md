# «Pregunta a Claude»: chat asistente dentro de la app — diseño

Estado: **borrador para aprobación de Alexander** (2026-10-20). No se implementa nada hasta su OK.
Hereda las reglas del spec principal (`2026-10-13-mapa-setas-design.md` §2): la app nunca afirma que una seta sea comestible y nunca inventa un dato.

## 1. Qué es

Un chat en la propia PWA (no en Claude Code). Alexander escribe o dicta («¿adónde voy mañana a por boletus?», «dame algo nuevo a menos de 40 min», «guárdame el segundo») y Claude contesta usando **los datos de la app**: decide qué consultar, propone adónde ir, enseña los sitios en el mapa, los guarda en Mis sitios y lee sus notas de ruta.

Claude no ve los datos directamente. Pide cosas a la app mediante **herramientas** que se ejecutan en el iPhone sobre los datos locales (sitios.json, meteo en caché, OPFS, IndexedDB). Así los sitios, puntuaciones y semáforos que cita salen siempre del mismo cálculo que ya ve en Hoy y Mapa.

## 2. Arquitectura

```
iPhone (PWA)                         Worker Cloudflare (setas-identificar)        API de Claude
─────────────                        ──────────────────────────────────────       ─────────────
historial + contexto  ── POST /chat ─►  valida origen, tamaño, rondas
                                        límite diario y tope de gasto (KV)
                                        añade system prompt + herramientas ──►  messages.create
                                        filtra texto (seguridad)          ◄──  content, stop_reason, usage
                      ◄─ JSON ─────────  suma el gasto en KV
si stop_reason = tool_use:
  ejecuta herramientas en local
  añade tool_result y vuelve a POST /chat (misma consulta, otra ronda)
```

- **Mismo worker, ruta nueva** `POST /chat`, junto a `/identificar`. Reutiliza CORS, lista blanca de orígenes, lectura de cuerpo limitada y el KV `RATE_LIMIT` (prefijos de clave propios).
- **La clave vive solo en el worker**: secreto `ANTHROPIC_API_KEY` (`wrangler secret put`). El cliente nunca la ve.
- **El system prompt y la definición de herramientas viven en el worker**, no en el cliente: un cliente manipulado no puede cambiar las reglas de seguridad.
- **Worker sin estado**: el cliente guarda la conversación y la reenvía entera en cada llamada (append-only; las respuestas del modelo se guardan tal cual llegan, con sus bloques de razonamiento, porque los modelos actuales rechazan historiales editados).
- **SDK oficial** `@anthropic-ai/sdk` en el worker (funciona en Workers; usa `fetch`). Bucle de herramientas manual repartido entre cliente y worker (el Tool Runner del SDK no sirve porque las herramientas se ejecutan en el iPhone).
- **Modelo**: variable `CLAUDE_MODEL` en `wrangler.toml`. Propuesta: `claude-opus-5-5` con `output_config.effort: "low"` (chat, respuestas cortas). Alternativa más barata: `claude-sonnet-5-5`. Decide Alexander (§8).
- **Rechazos**: `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) para que, si el filtro de seguridad de Anthropic rechaza una pregunta legítima, la reintente otro modelo. Si aun así `stop_reason = "refusal"`, la app muestra «No puedo responder a eso; prueba a reformularlo».
- **Caché de prompt**: `cache_control` automático. System prompt + herramientas (~3–4 K tokens) y el historial previo se leen de caché a 0,05× del precio dentro de la misma conversación.
- **Sin streaming en v1**: respuesta completa con indicador «Pensando…» (respuestas cortas, `max_tokens` 4000). Streaming de texto queda para v2 si la espera molesta.

## 3. Contexto compacto que manda el cliente

Con cada mensaje del usuario la app antepone un bloque de texto breve (no se toca el system prompt, para no romper la caché):

```json
{ "fecha": "2026-10-20", "hora": "09:50", "region": "marbella",
  "posicion": { "lat": 36.51, "lon": -4.88, "precision_m": 900 },
  "pestana": "hoy", "dia_elegido": "+1", "filtro": "grupo:boletos",
  "solo_publicos": true, "max_dificultad": "moderada",
  "top_visible": [{ "id": "boletus_aereus:48211", "puntuacion": 82, "estado": "verde" }],
  "en_linea": true }
```

- La posición va **redondeada a 0,01° (~1 km)** hacia Claude. Las distancias exactas las calcula la app en local con el GPS real.
- Sin GPS: `posicion: null` y las herramientas miden desde Marbella (o el centro de la región), y Claude lo dice.

## 4. Herramientas (se ejecutan en la app)

Todas con `strict: true` y esquema cerrado. Cada resultado es JSON compacto con **ids de sitio** del tipo `especie:id_celda` que la app reconoce. Si Claude pasa un id que no existe, la herramienta devuelve error (`is_error: true`) y no hace nada.

| Herramienta | Entrada | Qué hace / devuelve | Reutiliza |
|---|---|---|---|
| `buscar_sitios` | `especie` o `grupo`, `dia` (0–15), `radio_km?`, `solo_publicos?`, `max_dificultad?`, `orden?` (probabilidad/distancia/dificultad), `n` ≤ 10 | Top del día con: id, especie, lat/lon, puntuación 0–100, semáforo, dificultad, tiempo a pie, subida, distancia desde la posición, titularidad, citas y la **razón** que ya enseña la ficha | `topEspecie`, `topGrupo`, `ordenarTops`, `razonSitio` |
| `semaforo` | `especie`, `sitio_id`, `dia` | Estado, humedad acumulada, banda de altitud, próxima ventana, avisos (aguacero, calor) | `semaforo`, `bandaAltitud`, meteo en caché |
| `ruta_a` | `sitio_id` | Aparcamiento (vía), tiempo a pie, subida, perfil resumido; en el chat aparecen los botones «En coche (Google Maps)» y «Ruta a pie» | `acceso.consultar`, `trazar`, `perfil`, enlace de Mis sitios |
| `mostrar_en_mapa` | `sitio_ids[]` (≤ 10) | Marca y encuadra los sitios en el mapa detrás de la hoja del chat | `mapa`, `hoy-mapa` |
| `guardar_en_mis_sitios` | `sitio_id`, `nota?` (≤ 200), `estrellas?` | Guarda en Mis sitios (con acceso si lo hay) y enseña «Deshacer» | `guardarSitio` |
| `notas_de_ruta` | `ruta?` (id o «última»), `n?` ≤ 30 | Notas grabadas (texto, estrellas, posición, fecha) y resumen de la ruta; también lista Mis sitios | `rutas.ts`, `grabacion.ts`, `sitios.ts` |
| `proponer_sitios_nuevos` | `especie` o `grupo`, `dia`, `radio_km?`, `n` ≤ 5 | Candidatos **de sitios.json** con buena puntuación que **no** están en el top visible, ni en Mis sitios, ni a < 300 m de una nota de ruta. Devuelve los mismos campos que `buscar_sitios` más `por_que_nuevo` | `topEspecie` con n amplio, `fusionar`, `distanciaM` |

**«Sitios nuevos» sin inventar**: Claude solo puede proponer lo que devuelve `proponer_sitios_nuevos`, es decir, celdas que ya puntuó el pipeline (y, cuando exista, las microzonas del Modo campo). Nunca coordenadas suyas. Los sitios que aparecen como tarjetas en el chat se pintan **a partir de los resultados de herramientas**, no del texto del modelo: si Claude escribiera una coordenada o un nombre que no salió de una herramienta, no hay tarjeta ni botón.

## 5. Seguridad y «no inventar»

1. **System prompt** (en el worker): español llano; solo hechos que vengan de herramientas o del contexto; si falta un dato, decirlo («no lo sé», «no hay datos de meteo para ese día»); nunca hablar de comestibilidad, ni de cocinar o probar setas; ante una pregunta de identificación o consumo, mandar a Reconocer + experto; recordar normativa y titularidad (privado / restringido) cuando proponga un sitio.
2. **Filtro en el servidor**: el worker pasa el texto por `PROHIBIDO_GUIA` + `PROHIBIDO_EXTRA` (ya existen en `worker/src/seguridad.ts`). La respuesta lleva dos cosas: `content` original (para el historial, intacto) y `texto` filtrado (lo que se enseña). Así la regla se aplica sin editar el historial.
3. **Pie fijo** bajo cada respuesta, puesto por la app (no por el modelo): «No consumas ninguna seta sin la confirmación de un experto.»
4. **Acciones**: solo guardar en Mis sitios cambia datos, es reversible y enseña «Deshacer». Nada se borra ni se publica desde el chat.
5. **Privacidad**: lo que se manda a Anthropic es la conversación, la posición redondeada y los resultados de herramientas (incluidas notas de ruta si Claude las pide). Se indica en Ajustes.

## 6. Límites y tope de gasto

| Control | Valor propuesto | Dónde |
|---|---|---|
| Consultas por IP y día (mensaje nuevo del usuario) | 30 | `CHAT_DAILY_LIMIT`, KV |
| Rondas de herramientas por consulta | 6 (a la 7.ª, 429 `demasiadas_rondas`) | worker cuenta los turnos `tool_use` seguidos al final del historial |
| Tamaño del cuerpo | 200 KB; historial ≤ 40 mensajes (si no, «Empieza una conversación nueva») | worker |
| **Tope de gasto diario global** | 1,50 USD/día | `CHAT_DAILY_USD`; el worker suma `usage` × precio del modelo en KV y responde 429 `tope_gasto` al superarlo |
| Tope mensual | 25 USD/mes | `CHAT_MONTHLY_USD`, igual |
| **Tope duro** | límite de gasto del workspace en la consola de Anthropic | lo pone Alexander (KV es eventualmente consistente; esto es la red de seguridad real) |
| Sin KV | 503, no se llama a Claude | `REQUIRE_KV="true"` (como hoy) |

## 7. Interfaz

- Botón «Pregunta» (icono de bocadillo) en Mapa y Hoy. Abre una **hoja inferior** (`hoja.ts`) sobre el mapa: así `mostrar_en_mapa` se ve sin salir del chat.
- Campo de texto; el dictado es el del teclado de iOS (gratis, sin permisos nuevos).
- Sugerencias rápidas: «¿Adónde voy hoy?», «Algo nuevo cerca», «¿Qué tal mañana?», «Resume mi última ruta».
- Tarjetas de sitio (puntuación, semáforo, a pie, titularidad) con «Ver», «Ir», «Guardar».
- Sin conexión: el botón aparece atenuado con «Necesita conexión».
- Se guarda solo la última conversación (IndexedDB) y hay «Conversación nueva».
- Contador discreto «quedan N hoy» (cabecera `X-Restantes-Hoy`).

## 8. Coste estimado por consulta

Supuestos: consulta típica = 2–3 rondas (pregunta → `buscar_sitios` → a veces `semaforo` → respuesta); system + herramientas ≈ 3,5 K tokens en caché; resultados de herramientas ≈ 1,5–2 K tokens; salida total (razonamiento breve + texto) ≈ 1–2 K tokens. Precios de lista de Anthropic (consultados 2026-10-20 en la skill `claude-api`).

| Modelo | Precio entrada / salida (USD por millón) | Coste por consulta | 20 consultas/día, 30 días |
|---|---|---|---|
| **Claude Opus 5.5** (propuesta, effort `low`) | 4 / 20 | **≈ 0,04–0,08 USD** | ≈ 25–50 USD/mes |
| Claude Sonnet 5.5 | 2 / 10 | ≈ 0,02–0,04 USD | ≈ 12–25 USD/mes |
| Claude Haiku 5.5 | 0,10 / 0,50 | < 0,005 USD | < 3 USD/mes |

Son estimaciones; la cifra real se mide en las pruebas con `usage` y se ajusta antes de publicar. Con el tope diario de 1,50 USD propuesto caben ~20–35 consultas/día en Opus. Opus razona mejor al combinar semáforo, distancia, dificultad y titularidad; Sonnet suele bastar para este chat; Haiku es casi gratis pero con más riesgo de respuestas flojas y sin reintento automático ante rechazos.

## 9. Pruebas

- **Worker** (vitest, Anthropic simulado con `fetch` falso): validación del cuerpo e historial; límite por IP; rondas máximas; suma de gasto y topes diario/mensual; 503 sin KV; filtro de comestibilidad en `texto` con `content` intacto; manejo de `refusal`, 429/5xx de Anthropic y tiempo agotado; nunca expone la clave.
- **App** (vitest): cada herramienta sobre fixtures (ids válidos e inválidos, filtros, `proponer_sitios_nuevos` excluye top, Mis sitios y notas); construcción del contexto (posición redondeada); el bucle cliente (rondas, errores, `Deshacer`).
- **e2e** (`e2e/chat.e2e.mjs`, Playwright con el worker interceptado y respuestas de Claude grabadas): pregunta → `buscar_sitios` → tarjetas → «Ver» encuadra el mapa → «Guardar» aparece en Mis sitios → pie de seguridad visible; sin conexión, botón atenuado. Se añade a `npm run e2e`.
- **Prueba real opcional** (`e2e:claude-real`, manual, gasta céntimos): una consulta contra el worker desplegado, solo con permiso de Alexander.

## 10. Lo que tiene que hacer Alexander

1. **Aprobar este spec** y elegir modelo (Opus 5.5 propuesto / Sonnet 5.5 / Haiku 5.5) y topes (§6).
2. Cuenta en **console.anthropic.com** con método de pago, crear una **clave de API** y fijar un **límite de gasto mensual** del workspace.
3. Cuando esté implementado: guardar la clave en el worker con `npx wrangler secret put ANTHROPIC_API_KEY` (la pega él; nunca va al repo ni al chat) y autorizar el `wrangler deploy` y la publicación en Pages.

## 11. Fuera de alcance (v1)

Streaming de texto, voz de respuesta (TTS), fotos en el chat (para eso está Reconocer), memoria entre conversaciones, uso por otras personas. Relación con sesiones en curso: «Modo explorar», «Rutas con desnivel» y «Punto del sitio en la pantalla» pueden ampliar las herramientas (`proponer_sitios_nuevos` con microzonas, `ruta_a` con desnivel); el chat se apoya en las funciones existentes y no depende de ellas.
