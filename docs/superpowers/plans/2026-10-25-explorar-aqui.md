# «Explorar aquí»: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pantalla «Explorar aquí» en la PWA: cámara con rumbo, barrido de 8 fotos guardado como observación, marcas AR ligeras de las celdas buenas, análisis del barrido con Gemini vía `POST /explorar` y lista «Mis observaciones» con exportación.

**Architecture:** Lógica pura y con tests en módulos sin DOM (`explorar-geo.ts`, `explorar.ts`, `observaciones-datos.ts`), como `brujula.ts`/`micro.ts`. La UI (`explorar-ui.ts`, `camara.ts`) sigue el patrón de `ir-sitio.ts`/`campo-ui.ts`. El worker gana una ruta nueva con validación, esquema y cuota propios, reutilizando `http.ts`, `limite.ts` y `seguridad.ts`. Gemini solo **describe**; la mejor dirección la calcula `explorar.ts`.

**Tech Stack:** TypeScript, Vite, Vitest, idb-keyval, MapLibre (mini-mapa existente), Playwright (e2e con `--use-fake-device-for-media-stream`), Cloudflare Workers + KV.

**Spec:** `docs/specs/2026-10-20-explorar-aqui-design.md` (aprobado por Alexander el 2026-10-25, con la opción recomendada en cada punto del §8).

## Decisiones del §8 (fijadas)

1. Recomendación aceptada: una pantalla, fases 1→4. La fase 0 (prueba en iPhone) **no se puede automatizar**: se deja como lista de comprobación manual en `stages/02_pwa/` y el código trae respaldo (`<input capture>` si `getUserMedia` falla).
2. Cuota: `EXPLORAR_DAILY_LIMIT = 10` por IP y día, `EXPLORAR_GLOBAL_LIMIT = 60` al día, contadores propios en KV.
3. Nivel de Gemini: no se cambia nada en código; el aviso de privacidad dice que las fotos van a Google. Pendiente de Alexander confirmar que la clave es de pago.
4. Barrido de **8** direcciones (cada 45°).
5. Hallazgos: **solo exportar** GeoJSON; el pipeline no los consume todavía.

## Global Constraints

- La app nunca afirma que una seta sea comestible (spec §2). Todo texto de Gemini pasa por `limpiarTexto` en el worker y por el neutralizador de `app/src/gemini.ts` en la app.
- Nunca inventar un dato: lo que falta se muestra «sin dato»; nunca un número por defecto.
- Coordenadas enviadas al worker redondeadas a 0,01°.
- Fotos: 1024 px el lado mayor, JPEG calidad 0,8, re-codificadas en canvas (sin EXIF), ≤ 400 KB cada una tras codificar (si pasa, bajar calidad a 0,7 y luego 0,6).
- Nada se envía a la red sin pulsar «Analizar». Aviso de privacidad la primera vez: «Las 8 fotos se envían a Google (Gemini) para describir el bosque. No se guardan en nuestro servidor.»
- Español de España en la UI, mismo tono que el resto (`_config/voice.md`); copy nuevo con pase humanizer.
- `uv` para Python (no aplica aquí), `npm` en `app/` y `worker/`. Sin dependencias nuevas salvo `fake-indexeddb` como devDependency si los tests de IndexedDB la necesitan.
- Sin push ni publicación. Commits pequeños en `claude/relaxed-meninsky-eef114`, terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Comandos: `cd app && npm test`, `cd app && npx tsc --noEmit`, `cd app && npm run build`, e2e `cd app && node e2e/explorar.e2e.mjs` (después de `npm run build`, mismo arranque que `campo-micro.e2e.mjs`); worker `cd worker && npm test && npm run typecheck`.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `app/src/explorar-geo.ts` (+ `.test.ts`) | Puro: proyección AR, filtro de celdas, media circular, guía del barrido |
| `app/src/observaciones-datos.ts` (+ `.test.ts`) | Tipo `Observacion`, validación, GeoJSON, waypoint |
| `app/src/observaciones.ts` | IndexedDB (idb-keyval, base propia `setas-observaciones`) |
| `app/src/camara.ts` | `getUserMedia` / respaldo `<input capture>`, captura JPEG |
| `app/src/explorar-ui.ts` + estilos en `app/src/campo.css` | Pantalla: cámara, rumbo, barrido, marcas AR, hallazgo, análisis |
| `app/src/explorar.ts` (+ `.test.ts`) | Puro: puntuación por dirección, mejor dirección, razones |
| `app/src/explorar-red.ts` (+ `.test.ts`) | Construir petición (coordenadas redondeadas), enviar, validar respuesta |
| `app/src/observaciones-ui.ts` | «Mis observaciones»: lista, detalle, exportar |
| `app/e2e/explorar.e2e.mjs` | e2e de todo el flujo con cámara y sensores falsos |
| `worker/src/explorar.ts` (+ `worker/test/explorar.test.ts`) | Validar petición, instrucciones, esquema, post-proceso |
| `worker/src/index.ts`, `worker/src/limite.ts`, `worker/wrangler.toml`, `worker/README.md` | Ruta, cuota, variables y documentación |

---

### Task 1: `explorar-geo.ts` (puro)

**Files:** Create `app/src/explorar-geo.ts`, `app/src/explorar-geo.test.ts`

**Interfaces:**
- Consumes: `normalizar` de `brujula.ts`; `ValoresCelda` de `micro.ts`.
- Produces:

```ts
export const DIST_MIN_MARCA_M = 50;   // las celdas más cerca no llevan marca
export const DENTRO_M = 80;           // a menos de esto de una celda buena: «Estás en una zona buena»
export const PASO_BARRIDO = 45;
export const TOLERANCIA_RUMBO = 10;   // ±° para disparar
export const BETA_MIN = 70, BETA_MAX = 110; // teléfono casi vertical
export const PRECISION_BRUJULA_MAX = 25;
/** Campo de visión horizontal (°) en vertical y apaisado. PENDIENTE medir en iPhone (fase 0): valores provisionales
 * documentados como tales; la UI no los presenta como medidos. */
export const FOV_H = { vertical: 52, apaisado: 68 };
export const FOV_V = { vertical: 68, apaisado: 52 };

export interface Marca { x: number; y: number; visible: boolean; lado: 'izq' | 'der' | null; dist_m: number; desnivel: number | null }
/** Δ = normalizar(rumboCelda − rumboTel) llevado a (−180,180]. Visible si |Δ| < fovH/2.
 * x = w/2 + tan(Δ)/tan(fovH/2) · w/2. Fuera: lado = Δ<0 ? 'izq' : 'der', x pegada al borde (0 o w).
 * Elevación e = atan2(desnivel, dist) en grados (desnivel null → e = 0); pitch = beta − 90;
 * y = h/2 − tan(e − pitch)/tan(fovV/2) · h/2, recortada a [0,h]. */
export function proyectar(c: { rumbo: number; dist_m: number; desnivel: number | null }, rumboTel: number, beta: number,
  fov: { h: number; v: number }, pantalla: { w: number; h: number }): Marca;
export const deltaAngulo: (a: number, b: number) => number; // a − b en (−180,180]
/** Media circular (vectores unitarios) de ángulos en grados; null si la lista está vacía o la resultante es ~0. */
export function mediaCircular(angulos: number[]): number | null;
/** Celdas para marcas: dist ≥ DIST_MIN_MARCA_M; `dentro` = alguna celda con dist < DENTRO_M. */
export function celdasMarca<T extends { dist_m: number }>(cs: T[]): { marcas: T[]; dentro: boolean };
/** Rumbos objetivo del barrido empezando por el más cercano a `inicio` redondeado a múltiplo de 45: 8 valores. */
export function rumbosBarrido(inicio: number): number[];
/** Listo para disparar: |Δ(objetivo, actual)| ≤ TOLERANCIA_RUMBO, beta en [BETA_MIN, BETA_MAX] y `quieto`. */
export function listoParaDisparar(objetivo: number, actual: number | null, beta: number | null, quieto: boolean): boolean;
/** Quieto: desviación circular de las últimas lecturas (≥ 5) < 3°. */
export function estaQuieto(ultimas: number[]): boolean;
/** Sector de 45° centrado en `rumbo`: celdas con |Δ(c.rumbo, rumbo)| ≤ 22,5. */
export function enSector<T extends { rumbo: number }>(cs: T[], rumbo: number): T[];
```

- [ ] **Step 1: Tests que fallan** (`explorar-geo.test.ts`), al menos:
  - `proyectar({rumbo: 90, dist_m: 200, desnivel: 0}, 90, 90, {h:52,v:68}, {w:400,h:800})` → `x≈200, y≈400, visible true, lado null`.
  - rumbo de la celda 10° a la derecha → `x > 200`; 120° a la derecha → `visible false, lado 'der', x 400`; 120° a la izquierda → `lado 'izq', x 0`.
  - cruce del norte: celda 5°, teléfono 355° → Δ = +10 → `x > 200`.
  - desnivel +100 a 100 m (45°) con beta 90 → `y` recortada a 0; desnivel `null` → `y` = h/2 con beta 90.
  - `mediaCircular([350, 10])` ≈ 0; `mediaCircular([])` null; `mediaCircular([0, 180])` null.
  - `celdasMarca` quita las de 30 m y marca `dentro` con una a 70 m.
  - `rumbosBarrido(100)` = `[90,135,180,225,270,315,0,45]`.
  - `listoParaDisparar(90, 98, 90, true)` true; `(90, 101, 90, true)` false; beta 40 false; `actual null` false; `quieto false` false.
  - `estaQuieto` con 5 lecturas en ±1° true; con 4 lecturas false; con ±10° false.
  - `enSector` con celdas a 0, 20, 30, 340 y rumbo 0 → 0, 20, 340.
- [ ] **Step 2:** `cd app && npx vitest run src/explorar-geo.test.ts` → FAIL (módulo no existe).
- [ ] **Step 3:** Implementar exactamente las firmas de arriba; cabecera de comentario como `brujula.ts` (qué hace, que es puro, que el FOV es provisional).
- [ ] **Step 4:** Mismo comando → PASS; `npx tsc --noEmit` limpio.
- [ ] **Step 5:** Commit `feat(explorar): geometría pura de marcas y barrido`.

### Task 2: Observaciones (tipo, validación, GeoJSON, IndexedDB)

**Files:** Create `app/src/observaciones-datos.ts`, `app/src/observaciones-datos.test.ts`, `app/src/observaciones.ts`

**Interfaces:**
- Consumes: `ValoresCelda` (`micro.ts`); `NotaTrack` (`grabacion.ts`).
- Produces (en `observaciones-datos.ts`):

```ts
export type ArbolObs = 'alcornoque' | 'encina' | 'quejigo' | 'castano' | 'pino' | 'eucalipto' | 'otro' | 'no_se_ve';
export interface DireccionGemini {
  rumbo: number; arbol_dominante: ArbolObs; confianza_arbol: 'baja' | 'media' | 'alta';
  densidad_copas: 'abierta' | 'media' | 'cerrada' | 'no_se_ve';
  sotobosque: 'despejado' | 'matorral_bajo' | 'matorral_denso' | 'no_se_ve';
  suelo_visible: ('hojarasca' | 'musgo' | 'pasto' | 'roca' | 'tierra_desnuda')[];
  humedad_aparente: 'seca' | 'media' | 'humeda' | 'no_se_ve';
  notas: string;
}
export interface DireccionObs { rumbo: number; precBrujula: number | null; foto: Blob | null; analisis: DireccionGemini | null }
export interface Observacion {
  id: string; t: number; lat: number; lon: number; precGps: number;
  altGps: number | null; altModelo: number | null; especie: string; rutaId: string | null;
  modelo: Omit<ValoresCelda, 'dist_m' | 'rumbo'> | null;
  /** Idoneidad máxima del modelo por sector de 45° (índice = posición en `direcciones`), null = sin celdas. */
  modeloSector: (number | null)[];
  /** Árbol (nombre de ARBOL en micro.ts) de la celda de mayor idoneidad de cada sector; null = sin celdas o sin árbol. */
  arbolSector: (string | null)[];
  direcciones: DireccionObs[];
  estado: 'sin_analizar' | 'pendiente' | 'analizada' | 'error';
  error: string | null;
  hallazgo: 'no_mirado' | 'nada' | 'encontrada'; especieHallada: string; nota: string;
}
export function nuevaObservacion(p: { lat: number; lon: number; precGps: number; altGps: number | null; altModelo: number | null;
  especie: string; rutaId: string | null; t?: number; id?: string }): Observacion; // estado 'sin_analizar', hallazgo 'no_mirado', listas vacías
/** Normaliza lo leído de IndexedDB; null si no es una observación válida (como validarTrack en grabacion.ts). */
export function validarObservacion(x: unknown): Observacion | null;
/** FeatureCollection de puntos sin fotos: propiedades id, fecha ISO, especie, hallazgo, especieHallada, nota, idon (modelo?.idon ?? null),
 * arbol_modelo, y por dirección {rumbo, arbol, copas, sotobosque, humedad} si hay análisis. */
export function aGeoJSON(obs: Observacion[]): GeoJSON.FeatureCollection;
/** Nota de ruta enlazada: texto «Observación: <resumen corto>», estrellas 0. */
export function notaDeObservacion(o: Observacion): NotaTrack;
```

- `observaciones.ts`: `listarObservaciones(): Promise<Observacion[]>` (más reciente primero), `leerObservacion(id)`, `guardarObservacion(o)`, `borrarObservacion(id)`; base `createStore('setas-observaciones', 'observaciones')` como `rutas.ts`.

- [ ] **Step 1: Tests** de `nuevaObservacion` (valores iniciales, `modeloSector`/`arbolSector` vacíos), `validarObservacion` (rechaza sin lat; acepta y rellena `error: null` si falta; descarta direcciones mal formadas), `aGeoJSON` (sin campo foto en las propiedades; coordenadas `[lon, lat]`; `idon` null si no hay modelo), `notaDeObservacion` (misma t/lat/lon/alt, estrellas 0, texto ≤ `MAX_NOTA`).
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS + tsc.
- [ ] **Step 5:** Commit `feat(explorar): observaciones con validación y GeoJSON`.

### Task 3: Cámara y pantalla «Explorar aquí» con barrido (sin conexión)

**Files:** Create `app/src/camara.ts`, `app/src/explorar-ui.ts`, `app/e2e/explorar.e2e.mjs`; Modify `app/src/campo-ui.ts` (botón «Explorar aquí»), `app/src/campo.css`, `app/src/main.ts` (iniciar), `app/package.json` (añadir `node e2e/explorar.e2e.mjs` a `e2e` y `e2e:campo`).

**Interfaces:**
- Consumes: Task 1 y Task 2; `orientacionDe`, `suavizarAngulo` (`brujula.ts`); `escucharGps`, `PosicionGps` (`posicion-viva.ts`); grabación en curso (`leerGrabacion`/`guardarGrabacion` de `rutas.ts`); `guardarSitio` (`sitios.ts`); altitud del modelo con `cotasEn` (`mdt-datos.ts`) en una caja mínima alrededor de tu punto; `celdasAlrededor`, `celdaAqui` (`micro-datos.ts`).
- Produces:

```ts
// camara.ts
export interface Camara { video: HTMLVideoElement | null; modo: 'vivo' | 'archivo'; parar(): void }
/** getUserMedia({video:{facingMode:'environment', width:{ideal:1920}}, audio:false}); si falla o no existe → modo 'archivo'. */
export async function abrirCamara(contenedor: HTMLElement): Promise<Camara>;
/** Fotograma actual (vivo) o foto elegida (archivo, <input type=file accept=image/* capture=environment>) → JPEG
 * 1024 px lado mayor, calidad 0,8 bajando a 0,7/0,6 si pasa de 400 KB. */
export async function capturar(c: Camara): Promise<Blob>;
export const LADO_MAX = 1024, BYTES_MAX = 400 * 1024;
// explorar-ui.ts
export interface ContextoExplorar { especie: () => string; region: () => string /* para micro y mdt */ }
export function iniciarExplorar(c: ContextoExplorar): void;
export async function abrirExplorar(): Promise<void>;
```

Comportamiento (pantalla completa, patrón de `ir-sitio.ts`):
- Al abrir: cámara (vivo o archivo), botón «Activar brújula» si `DeviceOrientationEvent.requestPermission` existe (mismo flujo que `ir-sitio.ts` `activarBrujula`), GPS con `escucharGps`. Rumbo suavizado con `suavizarAngulo` y, para decidir si está quieto, últimas 8 lecturas en `estaQuieto`. Si `webkitCompassAccuracy` > 25 o falta y no hay lecturas en 3 s: aviso «Brújula poco fiable: aléjate del coche y haz un 8 con el teléfono».
- Barra superior: rumbo actual (N, NE… + grados), precisión GPS, «Cerrar».
- «Barrer 360°»: `rumbosBarrido(rumboActual)`; anillo con 8 marcas, la siguiente resaltada y flecha «gira a la derecha/izquierda». Dispara solo con `listoParaDisparar`; también con botón. En modo archivo: un botón por dirección («Foto hacia NE») sin disparo automático.
- Al acabar las 8 (o «Terminar» con ≥ 1): crea `Observacion` (Task 2) con `modelo` = `celdaAqui`, `modeloSector` = máximo `idon` de `enSector(celdasAlrededor(...), rumbo)` por dirección (null si vacío), `arbolSector` = `ARBOL[celda.arbol]` de esa misma celda (null si vacío o sin árbol), `altModelo` de `cotasEn` (null si falla), guarda en IndexedDB; si hay grabación en curso, añade `notaDeObservacion` a sus notas y pone `rutaId`.
- Pregunta de hallazgo: «¿Encontraste algo aquí?» Nada / Sí (selector de especie de la guía) / Luego. Botones «Guardar como sitio» (crea `Sitio` con nota «Observación <fecha>») y «Analizar» (Task 6; en esta tarea, deshabilitado con «Disponible pronto» oculto tras Task 6 — simplemente no se pinta hasta Task 6).
- Diagnóstico: 5 toques en el rumbo muestran un texto pequeño con `webkitCompassAccuracy`, modo de cámara (vivo/archivo), resolución del vídeo y orientación de pantalla (para la fase 0).
- Batería: sin toques 2 min → para cámara y sensores y muestra «Pausado para ahorrar batería · Reanudar».
- Copy de la UI: pase humanizer antes de cerrar la tarea.

e2e (`explorar.e2e.mjs`, Chromium con `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`, región de prueba de `e2e/fixtures/region-prueba` como `campo-micro.e2e.mjs`): geolocalización falsa dentro de la región; inyectar `deviceorientation` con `webkitCompassHeading` vía `page.evaluate(() => window.dispatchEvent(Object.assign(new Event('deviceorientation'), {webkitCompassHeading: H, beta: 90, gamma: 0})))` repetido para que esté quieto; abrir Modo campo → «Explorar aquí» → «Barrer 360°» → recorrer los 8 rumbos → comprobar en IndexedDB una observación con 8 direcciones y fotos `image/jpeg` ≤ 400 KB → responder «Nada» → «Guardar como sitio» y comprobar que aparece en Mis sitios. Segundo caso: `navigator.mediaDevices.getUserMedia` roto con `addInitScript` → aparece modo archivo.

- [ ] Step 1: escribir el e2e (falla). Step 2: `camara.ts`. Step 3: `explorar-ui.ts` + botón en `campo-ui.ts` + estilos. Step 4: `npm test`, `tsc`, `npm run build`, e2e nuevo y `e2e:campo` PASS. Step 5: commit `feat(explorar): pantalla con cámara, brújula y barrido de 8 fotos`.

### Task 4: AR ligera (marcas de celdas buenas)

**Files:** Modify `app/src/explorar-ui.ts`, `app/src/campo.css`, `app/e2e/explorar.e2e.mjs`

**Interfaces:** Consumes `proyectar`, `celdasMarca`, `FOV_H`, `FOV_V` (Task 1); selección de microzonas de `micro.ts` (la misma función que usa `campo-ui.ts`, misma especie); `cotasEn` para la altitud de cada celda y de tu celda (desnivel = altCelda − altAquí, ambos del modelo; null si falta uno).

- Capa absoluta sobre el vídeo; una marca por microzona (icono de la especie como en Modo campo, «180 m · ↑ 35 m · 72»); fuera de cuadro → chip en el borde «← buena zona, 180 m». `dentro` → banda «Estás en una zona buena». Recalcular a cada lectura de brújula (rAF) y al moverte > 50 m. Sin datos de micro para la región → «Sin datos de microzonas aquí» y solo barrido. Orientación de pantalla elige `FOV_*.vertical/apaisado`.
- Aviso fijo pequeño: «Cada marca es una celda de 100 m, no un punto exacto».
- e2e: con rumbo hacia una microzona conocida del fixture, la marca está visible y centrada (±25 % del ancho); girando 180°, está como chip de borde.
- [ ] Steps: e2e que falla → implementar → `npm test`, `tsc`, build, e2e PASS → commit `feat(explorar): marcas AR de microzonas sobre la cámara`.

### Task 5: Worker `POST /explorar`

**Files:** Create `worker/src/explorar.ts`, `worker/test/explorar.test.ts`; Modify `worker/src/index.ts`, `worker/src/limite.ts`, `worker/src/http.ts` (si hace falta un código de error nuevo), `worker/wrangler.toml`, `worker/README.md`.

**Interfaces (contrato que consume Task 6):**

Petición:
```json
{ "fotos": [{ "rumbo": 0, "jpeg": "<base64>" }],
  "contexto": { "especie": "boletus_aereus", "especie_nombre": "Boletus aereus", "mes": 10, "altitud": 640,
                "lat": 36.61, "lon": -5.08, "arboles_region": ["alcornoque","encina","quejigo","castano","pino"],
                "modelo_sector": [72, null, 40, 55, 60, 30, null, 20] } }
```
- 1–8 fotos, `rumbo` entero 0–359, `jpeg` base64 JPEG (cabecera FF D8) ≤ 400 KB decodificado; `MAX_BYTES_CUERPO_EXPLORAR = ceil(8 · 400 KB · 4/3) + 64 KB`.
- `lat`/`lon` se **redondean otra vez** a 2 decimales en el worker; `modelo_sector` misma longitud que `fotos`, valores 0–100 o null; strings ≤ 80; `mes` 1–12; `altitud` número o null.
- Respuesta 200: `{ "direcciones": DireccionGemini[] (mismo orden y rumbos que la petición), "aviso": AVISO }` con cabecera `X-Restantes-Hoy`.
- Errores: los mismos códigos de `/identificar`; 429 `limite_diario_superado` / `limite_global_superado` con los contadores propios.

Implementación:
- `validarPeticionExplorar(cuerpo): PeticionExplorar` (lanza `ErrorHttp(400, 'solicitud_invalida', …)`).
- `INSTRUCCIONES_EXPLORAR`: «Describe solo el bosque de cada foto: árbol dominante, densidad de copas, sotobosque, suelo visible, humedad aparente. Si no se distingue, `no_se_ve`. No identifiques setas ni digas dónde hay setas ni hacia dónde ir. No hables de comer ni de comestibilidad.» Más el contexto (mes, altitud, lista de árboles de la región).
- `ESQUEMA_EXPLORAR`: `responseSchema` con los enums exactos de `DireccionGemini` (Task 2) y `rumbo` entero.
- `cuerpoGeminiExplorar(p)`: una parte de texto «Foto rumbo N°» antes de cada imagen inline; `generationConfig` con `responseMimeType: application/json`, el esquema, y `thinkingConfig` de nivel bajo si el modelo lo admite como en `cuerpoGemini` (copiar el patrón existente; si allí no hay `thinkingConfig`, no añadirlo).
- `postProcesarExplorar(bruto, rumbos)`: valida enums (valor fuera → `no_se_ve`/`baja`), fuerza el orden y los rumbos de la petición (falta una dirección → todo `no_se_ve`), `notas` por `limpiarTexto` y recortadas a 200, y añade `aviso: AVISO`.
- `limite.ts`: `consumir` acepta un prefijo de clave (`'exp:'`) y límites propios; `EXPLORAR_DAILY_LIMIT` por defecto 10 y `EXPLORAR_GLOBAL_LIMIT` 60 en `wrangler.toml` [vars] con comentario. Mismo `REQUIRE_KV`.
- `index.ts`: enrutar `/explorar` igual que `/identificar` (origen, método, `Content-Type`, tamaño, cuota, Gemini, errores 502/503/504).
- README: sección `POST /explorar` (contrato, errores, cuota, coste ≈ 0,015–0,017 $ por barrido hasta fin de 2026 y ≈ 0,03 $ desde 2027, citando la tabla del spec §4.4) y privacidad (no se guardan fotos; coordenadas a 0,01°).

Tests (`worker/test/explorar.test.ts`, Gemini simulado como en los tests existentes): petición válida → 200 con 8 direcciones en orden; 9 fotos → 400; foto PNG → 400; foto > 400 KB → 413; `lat` 36.6149 llega a Gemini como 36.61; Gemini devuelve «comestible» en notas → sustituido; enum desconocido → `no_se_ve`; falta una dirección → rellenada; cuota 11.ª petición de la misma IP → 429 y no cuenta en el cupo de `/identificar`; origen no permitido → 403.

- [ ] Steps: tests que fallan → implementar → `cd worker && npm test && npm run typecheck` PASS (todos, también los de `/identificar`) → commit `feat(worker): POST /explorar con cuota propia`.

### Task 6: Análisis en la app y mejor dirección

**Files:** Create `app/src/explorar.ts`, `app/src/explorar.test.ts`, `app/src/explorar-red.ts`, `app/src/explorar-red.test.ts`; Modify `app/src/explorar-ui.ts`, `app/e2e/explorar.e2e.mjs`.

**Interfaces:**
- Consumes: `Observacion`, `DireccionGemini` (Task 2); `PerfilMicro`, `ARBOL` (`micro.ts`); `urlWorker` (`gemini.ts`); contrato de Task 5.
- Produces:

```ts
// explorar.ts
export const PESOS = { arbol: 0.5, copas: 0.2, humedad: 0.2, sotobosque: 0.1 } as const;
export const FCC_COPAS = { abierta: 15, media: 50, cerrada: 85 } as const;
export const FACTOR_SOTOBOSQUE = { despejado: 1, matorral_bajo: 0.8, matorral_denso: 0.5 } as const;
export interface PuntuacionDir { rumbo: number; total: number | null; observado: number | null; modelo: number | null; razones: string[] }
/** Observado (0–1) = media ponderada de los componentes disponibles:
 *  arbol: null si 'no_se_ve' o confianza 'baja'; si no, perfil.arboles?.[clave] ?? 0 (clave: castano, otro/eucalipto → 0).
 *  copas: null si 'no_se_ve' o sin perfil.dosel; 1 si FCC_COPAS dentro de dosel.opt, 0,6 si fuera.
 *  humedad: null si 'no_se_ve' o perfil.humedad ausente/0; v = humeda 1, media 0, seca −1; (sign(peso)·v + 1)/2.
 *  sotobosque: null si 'no_se_ve'; FACTOR_SOTOBOSQUE.
 *  Sin ningún componente → null. */
export function puntuarObservado(d: DireccionGemini, p: PerfilMicro | null): { valor: number | null; razones: string[] };
/** total = 0,5·observado + 0,5·modelo/100 si hay los dos; el que haya si solo uno; null si ninguno.
 * Razones de una línea con factores reales: «alcornoque visto (confianza media)», «copas medias», «hojarasca y musgo»,
 * «se ve húmedo», «modelo 72 en ese sector». Contradicción: si la celda del modelo `arbolModeloSector` (nombre de ARBOL)
 * difiere del árbol observado con confianza media/alta → «el modelo da <x>; en la foto se ve <y>». */
export function puntuarDirecciones(o: Observacion, p: PerfilMicro | null, arbolModeloSector: (string | null)[]): PuntuacionDir[];
/** La de mayor total; empate → la de mayor modelo; ninguna con total → null («Sin datos suficientes para elegir»). */
export function mejorDireccion(ps: PuntuacionDir[]): PuntuacionDir | null;
// explorar-red.ts
export const redondear2 = (x: number) => Math.round(x * 100) / 100;
export async function peticionExplorar(o: Observacion, ctx: { especieNombre: string; arbolesRegion: string[] }): Promise<object>; // fotos → base64
export function validarRespuestaExplorar(x: unknown, rumbos: number[]): DireccionGemini[]; // lanza si no cumple
export async function analizar(o: Observacion, ctx: {...}, url: string, f?: typeof fetch): Promise<Observacion>;
  // éxito → estado 'analizada' y analisis en cada dirección; sin red → 'pendiente'; error HTTP → 'error' con el mensaje del worker
export async function analizarPendientes(): Promise<number>; // al volver la conexión ('online') y al abrir Explorar
```
- `arbolModeloSector` es `o.arbolSector` (Task 2, relleno en Task 3).
- UI: botón «Analizar» (aviso de privacidad la primera vez, guardado en `localStorage` con try/catch), estado «Pendiente: se analizará con conexión», resultado como lista de 8 direcciones con flecha, total 0–100 y razones; la mejor resaltada con «Mejor dirección: NE» y la línea fija «Es una orientación por el aspecto del bosque, no garantiza setas.» En la vista de cámara, la mejor dirección sale como marca grande.
- Tests `explorar.test.ts`: perfil `{arboles:{alcornoque:1, encina:0.8}, dosel:{opt:[40,70]}, humedad: 0.5}`; dirección alcornoque/media/media/húmeda/despejado → observado 1; encina confianza baja → árbol ignorado; todo `no_se_ve` + modelo null → total null; contradicción produce la razón; `mejorDireccion` desempate por modelo; ninguna razón contiene «comest».
- Tests `explorar-red.test.ts`: `redondear2(36.6149)` = 36.61; petición con lat/lon redondeadas y fotos en base64 sin prefijo; respuesta con 7 direcciones → lanza; `analizar` con `fetch` que rechaza → 'pendiente'; 429 → 'error' con mensaje.
- e2e: interceptar `**/explorar` con Playwright `route` y devolver un JSON fijo; comprobar «Mejor dirección» y que la petición lleva lat con ≤ 2 decimales; offline → «Pendiente», volver online → analizada.
- [ ] Steps: tests → implementar → `npm test`, `tsc`, build, e2e PASS → commit `feat(explorar): análisis del barrido y mejor dirección`.

### Task 7: «Mis observaciones» y exportación

**Files:** Create `app/src/observaciones-ui.ts`; Modify donde vive el menú de Mis sitios / rutas (buscar `listarRutas` en la UI y añadir la entrada al lado), `app/src/grabacion.ts` solo si el GPX no incluye ya las notas como waypoints (comprobar con su test), `app/e2e/explorar.e2e.mjs`.

- Lista por fecha: miniatura de la primera foto, especie, hallazgo, idoneidad del modelo en tu celda, «Mejor: NE» si analizada. Detalle: 8 fotos con su rumbo y análisis, editar hallazgo y nota, «Analizar» si no lo está, «Borrar» (con confirmación), «Ver en el mapa».
- Resumen arriba, sin porcentajes con < 10 observaciones: «Modelo ≥ 50 y encontraste: N · Modelo ≥ 50 y nada: N · Modelo < 50 y encontraste: N» y «Árbol visto distinto del modelo: N casos» (lista de los casos). Con ≥ 10, además el porcentaje.
- «Exportar GeoJSON» con `aGeoJSON` → descarga `observaciones-AAAA-MM-DD.geojson` (mismo mecanismo de descarga que `exportar-dia.ts`).
- e2e: tras el flujo de Task 3/6 la observación aparece en la lista, el resumen cuenta 1 y la exportación descarga un GeoJSON con 1 feature sin fotos.
- [ ] Steps: e2e → implementar → `npm test`, `tsc`, build, `npm run e2e` completo PASS → commit `feat(explorar): Mis observaciones con resumen y GeoJSON`.

### Task 8: Documentación ICM y lista de la fase 0

**Files:** Modify `stages/02_pwa/CONTEXT.md`, `stages/06_gemini/CONTEXT.md` (contrato `/explorar`); Create `stages/02_pwa/explorar-fase0-iphone.md`.

- `explorar-fase0-iphone.md`: lista de comprobación para Alexander en el iPhone con la PWA instalada: ¿pide permiso de cámara cada vez?, ¿sobrevive a una recarga?, ¿hay `webkitCompassAccuracy`? (lo muestra el diagnóstico de 5 toques en el rumbo, Task 3), medir el campo de visión (poner dos objetos a ±X° con la brújula y ver si caen en el borde), estabilidad de la brújula en el monte, tiempo de subida de un barrido con 4G, calidad del análisis en 3 salidas (≥ 6 de 8 direcciones correctas). Con los resultados se actualizan `FOV_H/FOV_V` y se decide `media_resolution`.
- [ ] Commit `docs(explorar): contratos ICM y lista de prueba en iPhone`.
