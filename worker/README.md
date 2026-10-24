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

## POST /explorar

Barrido de fotos del bosque desde un punto («Explorar aquí»). Gemini solo **describe** el bosque
(árbol dominante, copas, sotobosque, suelo, humedad); la mejor dirección la calcula la app. Mismo
origen permitido, `Content-Type: application/json`, mismo `REQUIRE_KV` y mismas cabeceras CORS que
`/identificar`. Spec: `docs/specs/2026-10-20-explorar-aqui-design.md` §4.2–§4.5.

```json
{
  "fotos": [{ "rumbo": 0, "jpeg": "<base64 JPEG>" }],
  "contexto": {
    "especie": "boletus_aereus", "especie_nombre": "Boletus aereus", "mes": 10, "altitud": 640,
    "lat": 36.61, "lon": -5.08,
    "arboles_region": ["alcornoque", "encina", "quejigo", "castano", "pino"],
    "modelo_sector": [72, null, 40, 55, 60, 30, null, 20]
  }
}
```

- De 1 a 8 fotos. `rumbo`: entero 0–359. `jpeg`: base64 de un JPEG (cabecera `FF D8 FF`; admite prefijo
  `data:image/jpeg;base64,`), ≤ 400 KB decodificado. Cuerpo máximo ≈ 4,3 MB (`MAX_BYTES_CUERPO_EXPLORAR`).
- `contexto` (objeto obligatorio; campos extra se rechazan): textos ≤ 80 caracteres, `mes` entero 1–12,
  `altitud` número o `null`, `arboles_region` ≤ 30 textos. `modelo_sector`, si se envía, lleva una
  entrada por foto (0–100 o `null` si no hay celdas en ese sector).
- `lat` y `lon` se **redondean otra vez a 2 decimales** (~1 km) en el worker antes de llegar a Gemini.

Respuesta 200 (cabecera `X-Restantes-Hoy` si hay KV): una entrada por foto, en el mismo orden y con
los mismos rumbos que la petición.

```json
{
  "direcciones": [{
    "rumbo": 0,
    "arbol_dominante": "alcornoque|encina|quejigo|castano|pino|eucalipto|otro|no_se_ve",
    "confianza_arbol": "baja|media|alta",
    "densidad_copas": "abierta|media|cerrada|no_se_ve",
    "sotobosque": "despejado|matorral_bajo|matorral_denso|no_se_ve",
    "suelo_visible": ["hojarasca", "musgo", "pasto", "roca", "tierra_desnuda"],
    "humedad_aparente": "seca|media|humeda|no_se_ve",
    "notas": "texto corto, ≤ 200 caracteres"
  }],
  "aviso": "No consumas ninguna seta sin la confirmación de un experto."
}
```

Post-proceso en el servidor: un valor fuera de los enums pasa a `no_se_ve` (la confianza, a `baja`);
si Gemini no devuelve una dirección, esa entrada queda toda en `no_se_ve`; las direcciones sobrantes
o repetidas se ignoran; `notas` pasa por `limpiarTexto` (se sustituye cualquier afirmación de
comestibilidad) y se recorta a 200 caracteres. Las instrucciones a Gemini prohíben identificar setas,
decir dónde hay setas o hacia dónde ir y hablar de comestibilidad. Gemini no recomienda dirección.

Errores (mismos códigos que `/identificar`):

| Estado | código | Cuándo |
|---|---|---|
| 400 | `solicitud_invalida` | JSON roto, 0 o más de 8 fotos, rumbo fuera de 0–359, foto no JPEG/base64, `modelo_sector` de otra longitud, campos raros |
| 403 | `origen_no_permitido` | Origen fuera de la lista o sin `Origin` |
| 404 / 405 / 415 | `ruta_no_encontrada` / `metodo_no_permitido` / `tipo_contenido_no_soportado` | |
| 413 | `carga_demasiado_grande` | Cuerpo > ≈ 4,3 MB o una foto > 400 KB |
| 422 | `contenido_bloqueado` | Gemini bloqueó las fotos |
| 429 | `limite_diario_superado` / `limite_global_superado` | Cupo de `/explorar` agotado (ver abajo) |
| 500 | `configuracion_incompleta` | Falta `GEMINI_API_KEY` |
| 502 | `gemini_error` / `respuesta_invalida` | Fallo de Gemini o JSON sin la lista `direcciones` |
| 503 | `gemini_saturado` / `servicio_no_disponible` | Gemini devolvió 429; o falta KV con `REQUIRE_KV=true` |
| 504 | `gemini_tiempo_agotado` | Gemini tardó más de 30 s |

**Cuota propia**, aparte de `/identificar` (claves de KV `exp:AAAA-MM-DD:<ip>` y `exp:AAAA-MM-DD:__global__`,
frente a `rl:` de los reconocimientos): `EXPLORAR_DAILY_LIMIT` barridos por IP y día (por defecto 10) y
`EXPLORAR_GLOBAL_LIMIT` al día en total (por defecto 60). Un barrido cuenta una vez, tenga 1 o 8 fotos.
Las peticiones inválidas no consumen cupo. Mismo KV eventualmente consistente: el tope es aproximado.

**Coste** (spec §4.4; precios de `gemini-3.8-flash` de la sección «Coste estimado», ~1.000–1.100
tokens por foto): ≈ 9.500 tokens de entrada y ≈ 2.000–2.500 de salida por barrido de 8 fotos, es decir
**≈ 0,015–0,017 $ por barrido hasta el 31-12-2026 y ≈ 0,03 $ desde 2027**. Peor caso con el tope global
por defecto: 60 × 0,017 $ ≈ 1 $/día hasta fin de año. Rebajas posibles (por verificar con fotos reales,
fase 0 del spec): `media_resolution` media (~560 tokens por imagen) y razonamiento bajo.

**Privacidad** (spec §4.5): el worker no guarda fotos ni escribe registros con imágenes; solo los
contadores de cuota (IP con fecha, como en `/identificar`). Las fotos llegan sin EXIF (la app las
re-codifica en un canvas) y las coordenadas se redondean a 0,01° (~1 km) en la app y de nuevo aquí. Las
fotos van a Google (Gemini) para describir el bosque; con el nivel gratuito de la API, Google puede
usar lo enviado para mejorar sus productos, con el de pago no. Qué nivel usa la clave lo decide Alexander.

## Configuración

| Nombre | Tipo | Valor |
|---|---|---|
| `GEMINI_API_KEY` | secreto | Clave de Google AI Studio. Nunca en `wrangler.toml` ni en git. |
| `GEMINI_MODEL` | var | `gemini-3.8-flash` (ver comentario y fuentes en `wrangler.toml`) |
| `ALLOWED_ORIGINS` | var | Orígenes separados por comas, sin barra final |
| `DAILY_LIMIT` | var | Peticiones por IP y día. Por defecto 50 |
| `GLOBAL_DAILY_LIMIT` | var | Tope global de peticiones por día (todas las IPs). Por defecto 300. 429 `limite_global_superado` |
| `EXPLORAR_DAILY_LIMIT` | var | Barridos de `/explorar` por IP y día. Por defecto 10. Cupo aparte del de `/identificar` |
| `EXPLORAR_GLOBAL_LIMIT` | var | Tope global de barridos por día (todas las IPs). Por defecto 60 |
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
