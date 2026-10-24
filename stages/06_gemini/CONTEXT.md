# Stage 06_gemini — Contract (ICM Layer 2)

The control point for this stage. Define exactly what it reads, does, and writes. The **Inputs table is the most important part** — name the specific files (and sections) to load, nothing more.

## Inputs
- Layer 4 (working):   ../05_reconocedor/output/
- Layer 3 (reference): ../../knowledge/index.md (solo los conceptos pertinentes)
- Layer 3 (reference): ../../_config/conventions.md

## Process
Worker de Cloudflare como proxy a Gemini; la clave la crea Alexander y va como secreto del Worker. Modelo: GEMINI_MODEL en worker/wrangler.toml. Desde 2026-10-18 Gemini es la primera opinión con conexión (ver ../../knowledge/reference/reconocedor.md).

## Outputs
- worker/ desplegado

## Verify
Puerta de revisión: security-review del Worker antes de desplegar + code-review (high). Antes de dar la etapa por hecha, verification-before-completion.

## Contrato de `POST /explorar` (2026-10-25)
Barrido de fotos del bosque para «Explorar aquí». Contrato completo, errores y coste: `worker/README.md` §`POST /explorar`; código en `worker/src/explorar.ts`; consumidor en la app: `app/src/explorar-red.ts`.

- **Inputs:** `{ fotos: [{ rumbo (entero 0–359), jpeg (base64 JPEG, ≤ 400 KB) }] (1–8), contexto: { especie, especie_nombre, mes, altitud, lat, lon, arboles_region, modelo_sector (una entrada por foto, 0–100 o null) } }`. `contexto` es obligatorio y se rechazan campos desconocidos (también dentro de `contexto`).
- **Outputs:** `{ direcciones: DireccionGemini[] (mismo orden y rumbos que las fotos), aviso }` con `X-Restantes-Hoy`. Gemini **describe** (árbol, copas, sotobosque, suelo, humedad; `no_se_ve` si no se distingue): no identifica setas, no dice dónde hay setas ni hacia dónde ir, no habla de comestibilidad (`limpiarTexto`).
- **Privacidad:** `lat`/`lon` a 2 decimales (redondeados en la app y otra vez en el Worker); no se guardan fotos en el servidor; solo los contadores de cuota.
- **Cuota propia** (aparte de `/identificar`): `EXPLORAR_DAILY_LIMIT = 10` por IP y día, `EXPLORAR_GLOBAL_LIMIT = 60` al día; 429 con mensaje de «barridos».
- **Verify:** `cd worker && npm test && npm run typecheck` (incluye `test/explorar.test.ts`). Antes de desplegar, security-review del Worker y code-review (high), como el resto de la etapa. Pendiente de Alexander: confirmar que la clave de Gemini es de pago (con la gratuita Google puede usar las fotos enviadas).
