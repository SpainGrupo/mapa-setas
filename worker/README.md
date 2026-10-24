# Worker de reconocimiento (Fase 6)

Proxy de Cloudflare entre la PWA y Gemini. Recibe de 1 a 4 fotos JPEG, las respuestas de la
comprobación guiada y el contexto del punto, llama a `generateContent` con salida JSON
estructurada y devuelve candidatos, especies peligrosas posibles y fotos recomendadas.
Aplica la regla de seguridad del spec §2 en el servidor: borra cualquier afirmación de
comestibilidad, añade siempre los parecidos mortales de los géneros de riesgo y fuerza el aviso
"No consumas ninguna seta sin la confirmación de un experto."

## API

`POST /identificar` · `Content-Type: application/json` · solo desde orígenes en `ALLOWED_ORIGINS`.

```json
{
  "fotos": ["<base64 JPEG, 1–4, ≤1,5 MB cada una; admite prefijo data:image/jpeg;base64,>"],
  "respuestas_guiadas": { "volva": true, "anillo": false, "himenio": "poros", "azulea_al_corte": "si" },
  "contexto": { "arbol": "alcornoque", "suelo": "ácido", "altitud": 650, "fecha": "2026-10-20", "lat": 36.6, "lon": -5.1 },
  "candidatos_offline": [{ "id": "boletus_aereus", "nombre": "Boletus aereus", "score": 0.71 }]
}
```

Respuesta 200 (cabecera `X-Restantes-Hoy` si hay KV):

```json
{
  "candidatos": [{ "nombre_cientifico": "…", "nombre_comun": "…", "confianza": "baja|media|alta",
                   "rasgos_observados": ["…"], "rasgos_que_faltan_ver": ["…"] }],
  "peligrosas_posibles": [{ "nombre_cientifico": "…", "motivo": "…" }],
  "fotos_recomendadas": ["…"],
  "aviso": "No consumas ninguna seta sin la confirmación de un experto."
}
```

Errores: `{ "error": { "codigo": "…", "mensaje": "…" } }`.

| Estado | código | Cuándo |
|---|---|---|
| 400 | `solicitud_invalida` | JSON roto, 0 o más de 4 fotos, foto no JPEG/base64, campos raros |
| 403 | `origen_no_permitido` | Origen fuera de la lista o petición sin `Origin` |
| 404 / 405 / 415 | `ruta_no_encontrada` / `metodo_no_permitido` / `tipo_contenido_no_soportado` | |
| 413 | `carga_demasiado_grande` | Cuerpo > ~8,1 MB o una foto > 1,5 MB |
| 422 | `contenido_bloqueado` | Gemini bloqueó las fotos |
| 429 | `limite_diario_superado` | Más de `DAILY_LIMIT` peticiones por IP y día (UTC) |
| 500 | `configuracion_incompleta` | Falta el secreto `GEMINI_API_KEY` |
| 502 | `gemini_error` / `respuesta_invalida` | Fallo de Gemini o JSON que no cumple el esquema |
| 503 | `gemini_saturado` | Gemini devolvió 429 |
| 504 | `gemini_tiempo_agotado` | Gemini tardó más de 30 s |

## Configuración

| Nombre | Tipo | Valor |
|---|---|---|
| `GEMINI_API_KEY` | secreto | Clave de Google AI Studio. Nunca en `wrangler.toml` ni en git. |
| `GEMINI_MODEL` | var | `gemini-3.8-flash` (ver comentario y fuentes en `wrangler.toml`) |
| `ALLOWED_ORIGINS` | var | Orígenes separados por comas, sin barra final |
| `DAILY_LIMIT` | var | Peticiones por IP y día. Por defecto 50 |
| `GLOBAL_DAILY_LIMIT` | var | Tope global de peticiones por día (todas las IPs). Por defecto 300. 429 `limite_global_superado` |
| `REQUIRE_KV` | var | `"true"` en producción: sin KV o si KV falla, 503 `servicio_no_disponible` y no se llama a Gemini. Con otro valor, fail-open (solo desarrollo) |
| `RATE_LIMIT` | KV | Contadores diarios (por IP y global). Con `REQUIRE_KV` distinto de `"true"`, si falta no limita (útil en local) |

El límite usa KV, que es eventualmente consistente: varias peticiones simultáneas pueden pasar
un poco del tope. Para frenar abuso basta; no es una cuota exacta.

## Desarrollo

```bash
cd worker
npm ci
npm test          # vitest, fetch simulado: no llama a Gemini
npm run typecheck
```

Para `wrangler dev` en local crea `worker/.dev.vars` (está en `.gitignore`) con
`GEMINI_API_KEY=...`. Para trabajar sin KV en local pon `REQUIRE_KV = "false"` en `.dev.vars`; entonces el límite diario queda desactivado y se avisa en el log.

## Desplegar (lo hace Alexander)

1. Crear la clave en Google AI Studio (https://aistudio.google.com/apikey). Conviene activar la
   facturación con un límite de gasto o una alerta de presupuesto en Google Cloud. Esta alerta
   sigue siendo obligatoria: la cabecera Origin la puede falsificar cualquier cliente que no sea un
   navegador, así que el límite por IP y el tope global (`GLOBAL_DAILY_LIMIT`) reducen el riesgo
   pero no sustituyen al presupuesto de Google.
2. Iniciar sesión en Cloudflare:
   ```bash
   cd /Users/alexanderkrupnov/Documents/Claude/setas/worker
   npm ci
   npx wrangler login
   ```
3. Crear el KV del límite diario y pegar el `id` que devuelve en `wrangler.toml`
   (descomentar el bloque `[[kv_namespaces]]`, `binding = "RATE_LIMIT"`):
   ```bash
   npx wrangler kv namespace create RATE_LIMIT
   ```
   Dejar `REQUIRE_KV = "true"` y ajustar `GLOBAL_DAILY_LIMIT` (por defecto 300/día) al gasto asumible.
4. Comprobar en `wrangler.toml` el origen de GitHub Pages: ya está
   `ALLOWED_ORIGINS = "https://spaingrupo.github.io"` (la app vive en
   https://spaingrupo.github.io/mapa-setas/; solo cuentan esquema y host, la ruta no forma parte del
   origen). Para `wrangler dev` en local, los `localhost` van en `.dev.vars`.
5. Guardar la clave como secreto (la pide por teclado; no queda en el historial):
   ```bash
   npx wrangler secret put GEMINI_API_KEY
   ```
6. Desplegar y probar:
   ```bash
   npx wrangler deploy
   curl -i -X OPTIONS https://setas-identificar.<subdominio>.workers.dev/identificar \
        -H "Origin: https://spaingrupo.github.io"   # debe dar 204
   ```
7. Poner la URL `https://setas-identificar.<subdominio>.workers.dev/identificar` en la
   configuración de la app.

Antes del paso 6, según el contrato de `stages/06_gemini`: security-review del Worker y
code-review (high).

## Coste estimado por petición

Precios de `gemini-3.8-flash`, de pago, consultados el 2026-10-13 en
https://ai.google.dev/gemini-api/docs/pricing : entrada (texto/imagen) 0,75 $ por millón de
tokens y salida (con razonamiento) 3,75 $ por millón hasta el 31-12-2026; desde el 01-01-2027,
1,50 $ y 7,50 $. Hay nivel gratuito.

Cálculo para una petición con 4 fotos (unos 1600×1200 px). Según
https://ai.google.dev/gemini-api/docs/image-understanding (2026-10-13), una imagen grande se
parte en teselas de 258 tokens, unos 1.000–1.100 tokens por foto:

| Concepto | Tokens aprox. | Coste hasta fin de 2026 |
|---|---|---|
| Entrada: 4 fotos + instrucciones + datos | ~5.600 | ~0,0042 $ |
| Salida: JSON + razonamiento (nivel medio por defecto) | ~2.000–2.500 | ~0,0075–0,0094 $ |
| **Total** | | **~0,012–0,014 $ (≈ 1,3 céntimos)** |

Con 1 foto sale por ~0,009 $. Desde 2027, el doble (~0,025 $ con 4 fotos). El peor caso por IP
con el límite de 50 al día es ~0,65 $/día. Los tokens de razonamiento son la parte más
incierta: la cifra real está en `usageMetadata` de cada respuesta de Google.

## `/chat` («Pregunta a Claude»)

Segunda ruta del mismo Worker: proxy hacia la API de Claude (SDK oficial `@anthropic-ai/sdk`,
versión fijada en `package.json`). Spec: `docs/specs/2026-10-20-pregunta-a-claude-design.md`.
Sin estado: la app reenvía la conversación entera; las herramientas (`src/chat-herramientas.ts`,
fuente única) las ejecuta la app en el iPhone y el Worker solo reenvía a Claude con el system
prompt (`src/chat-prompt.ts`, constante para no romper la caché de prompt).

`POST /chat` · mismo CORS, lista de orígenes, OPTIONS/405/415 que `/identificar`.

```json
{ "messages": [ { "role": "user", "content": [{ "type": "text", "text": "<contexto_app>{…}</contexto_app> ¿adónde voy hoy?" }] } ] }
```

- `messages` en formato de la API de Anthropic: 1–39 mensajes (máx. 40), alternando `user`/`assistant`,
  empieza y termina en `user`. En `user` solo bloques `text` y `tool_result` (o string). Los `assistant`
  se aceptan tal cual (incluidos los bloques de razonamiento) y nunca se modifican. Cuerpo ≤ 200 KB.
- Consulta nueva = el último `user` tiene `text` y ningún `tool_result`: consume `CHAT_DAILY_LIMIT`
  por IP y día (claves KV `chat:…`, separadas de `rl:…`). Si es una ronda de herramientas no consume,
  pero a la 7.ª ronda de una misma consulta responde 429 `demasiadas_rondas`.

Respuesta 200 (cabecera `X-Restantes-Hoy` solo en consultas nuevas):

```json
{ "content": [ …bloques de Claude, SIN filtrar: guardarlos tal cual como historial… ],
  "stop_reason": "end_turn | tool_use | refusal | max_tokens …",
  "texto": "texto para mostrar, ya filtrado (sin afirmaciones de comestibilidad)",
  "aviso": "No consumas ninguna seta sin la confirmación de un experto." }
```

Si `stop_reason` es `refusal`, `texto` es «No puedo responder a eso; prueba a reformularlo.».

| Estado | código | Cuándo |
|---|---|---|
| 400 | `solicitud_invalida` | JSON roto, roles/bloques no permitidos, no alterna, no acaba en `user` |
| 400 | `conversacion_larga` | Más de 40 mensajes («Empieza una conversación nueva.») |
| 413 | `carga_demasiado_grande` | Cuerpo > 200 KB |
| 429 | `limite_diario_superado` | Más de `CHAT_DAILY_LIMIT` consultas nuevas por IP y día |
| 429 | `demasiadas_rondas` | 6 rondas de herramientas ya hechas en la consulta |
| 429 | `tope_gasto` | Gasto del día ≥ `CHAT_DAILY_USD` o del mes ≥ `CHAT_MONTHLY_USD`; no se llama a Claude |
| 500 | `configuracion_incompleta` | Falta el secreto `ANTHROPIC_API_KEY` |
| 502 | `claude_error` | Cualquier otro fallo de Claude (el detalle solo va al log, nunca al cliente) |
| 503 | `claude_saturado` | Claude devolvió 429 o 529 |
| 503 | `servicio_no_disponible` | Sin KV (o KV falla) con `REQUIRE_KV="true"`; no se llama a Claude |
| 504 | `claude_tiempo_agotado` | Claude tardó más de 45 s (1 reintento del SDK) |

### Configuración del chat

| Nombre | Tipo | Valor |
|---|---|---|
| `ANTHROPIC_API_KEY` | secreto | Clave de console.anthropic.com. Nunca en `wrangler.toml` ni en git. |
| `CLAUDE_MODEL` | var | `claude-opus-5-5` (alternativas: `claude-sonnet-5-5`, `claude-haiku-5-5`; este último sin reintento por rechazos) |
| `CLAUDE_EFFORT` | var | `low` (también `medium`/`high`) |
| `CHAT_DAILY_LIMIT` | var | Consultas nuevas por IP y día. Por defecto 30 |
| `CHAT_DAILY_USD` / `CHAT_MONTHLY_USD` | var | Topes globales de gasto (UTC). Por defecto 1,5 y 25 |

El gasto se estima con `usage` × precio de lista (tabla en `src/chat-gasto.ts`; modelo desconocido =
precios de Opus) y se guarda en KV en microdólares (`chatusd:d:AAAA-MM-DD`, `chatusd:m:AAAA-MM`).
Es aproximado (KV es eventualmente consistente): la red de seguridad real es el límite de gasto
del workspace en Anthropic.

Se llama con `tool_choice: auto` (los forzados dan 400 en estos modelos), `output_config.effort`,
caché automática (`cache_control` superior) y, salvo en Haiku, `fallbacks: "default"` con la beta
`server-side-fallback-2026-07-01`. No se envía `thinking` (adaptativo por defecto en Opus 5.5).

### Lo que tiene que hacer Alexander

1. Crear una clave de API en https://console.anthropic.com (con método de pago) y fijar un
   **límite de gasto mensual del workspace**.
2. Guardarla en el Worker: `cd worker && npx wrangler secret put ANTHROPIC_API_KEY` (la pega él por teclado).
3. Autorizar el `npx wrangler deploy` (nadie lo hace por él) y la publicación en Pages.
