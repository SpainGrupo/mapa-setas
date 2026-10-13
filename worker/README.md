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
4. Poner en `wrangler.toml` el origen de GitHub Pages, por ejemplo
   `ALLOWED_ORIGINS = "https://USUARIO.github.io"` (solo esquema y host; la ruta del repo no
   forma parte del origen). Quitar los `localhost` si no se van a usar.
5. Guardar la clave como secreto (la pide por teclado; no queda en el historial):
   ```bash
   npx wrangler secret put GEMINI_API_KEY
   ```
6. Desplegar y probar:
   ```bash
   npx wrangler deploy
   curl -i -X OPTIONS https://setas-identificar.<subdominio>.workers.dev/identificar \
        -H "Origin: https://USUARIO.github.io"      # debe dar 204
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
