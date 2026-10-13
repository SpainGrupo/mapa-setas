# Mapa de setas — Plan Fase 3: tiempo y semáforo

> **For agentic workers:** executor Opus, tarea a tarea, con TDD en toda la lógica pura (la regla del semáforo es el núcleo y va 100 % testeada).

**Goal:** Saber **cuándo ir**. Para cada zona y especie, un semáforo 🟢🟡🔴 calculado con la lluvia y la temperatura reales de los últimos 30 días y la previsión de 7, con un gráfico por zona. Si no hay cobertura, se muestra el último dato guardado.

**Spec:** `docs/specs/2026-10-13-mapa-setas-design.md` §6. App: `app/` (Fase 2). Pipeline: `pipeline/setas_pipeline/exportar.py`.

## Decisiones (cerradas)

- **Puntos meteo**:
  - En `exportar.py` (subcomando `meteo`) se toma una rejilla de **12 km** sobre la zona.
  - Se conservan solo los puntos con bosque hospedador cerca: alguna celda con idoneidad ≥30 para cualquier especie en un radio de 6 km. Objetivo: 40–80 puntos.
  - **Salida**: `meteo_puntos.json` con `{id, lat, lon, alt_media}` y `meteo_zonas.pmtiles`. El segundo contiene los polígonos de Voronoi de los puntos, recortados a la zona, con la propiedad `id`.
  - Ambos van en el manifest y en la descarga offline.
- **Fuente**: Open-Meteo Forecast API, una sola petición con todas las coordenadas separadas por comas.
  - Variables diarias: `precipitation_sum`, `temperature_2m_max`, `temperature_2m_min`.
  - Parámetros: `past_days=30`, `forecast_days=7`, `timezone=Europe/Madrid`.
  - Si la URL resulta demasiado larga, se parte en lotes de 40 puntos. Sin clave.
  - El aviso de atribución "Datos meteorológicos: Open-Meteo.com (CC BY 4.0)" va en Ajustes.
- **Corrección por altitud**: el modelo de Open-Meteo devuelve la altitud de su celda (`elevation`). Las temperaturas se ajustan a `alt_media` del punto con −0,65 °C por cada 100 m.
- **Caché**: en IndexedDB (`setas-meteo`) se guarda `{fecha_consulta, datos por punto}`.
  - Se refresca al abrir la app si los datos tienen más de 3 h y hay red, y también con el botón "Actualizar tiempo".
  - Sin red se usa la caché y se muestra "actualizado hace X". Si la caché tiene más de 72 h, el semáforo sale gris con el texto "datos antiguos".
- **Reglas por especie**: un bloque `tiempo:` en `pipeline/especies.yaml`, que se exporta al manifest. Valores **heurísticos v1**, ajustables con hallazgos propios:

```yaml
# en cada especie:
tiempo:
  episodio_mm: 25        # lluvia acumulada en ≤3 días consecutivos que dispara la fructificación
  ventana_dias: [8, 20]  # días tras el episodio en que suele salir
  tmin_media: [8, 18]    # media de mínimas de los últimos 10 días (rango favorable)
  tmax_media: [15, 27]   # media de máximas de los últimos 10 días
```

Valores de partida:

| Especie | episodio_mm | ventana_dias | tmin_media | tmax_media |
|---|---|---|---|---|
| boletus_aereus | 25 | [8, 20] | [8, 18] | [15, 27] |
| boletus_aestivalis | 20 | [7, 18] | [10, 20] | [18, 30] |
| boletus_edulis | 25 | [8, 21] | [5, 15] | [12, 24] |
| boletus_pinophilus | 25 | [8, 21] | [4, 14] | [10, 22] |
| amanita_caesarea | 20 | [7, 16] | [12, 20] | [20, 30] |

- **Regla del semáforo**: es una función pura `semaforo(serie, reglas, hoy) → {estado, motivo, desde?, hasta?}`.
  1. Se busca el **último episodio**: la ventana más reciente de 1 a 3 días consecutivos con lluvia acumulada ≥ `episodio_mm`, entre los 30 días pasados y la previsión. `d` es el número de días desde el final del episodio hasta hoy; si el episodio cae en la previsión, `d` es negativo.
  2. Con `d` dentro de `ventana_dias` y las dos medias de temperatura de 10 días dentro de su rango, el estado es 🟢 "ventana abierta", con `hasta` = fin de la ventana.
  3. Con `d < ventana_min` (episodio reciente o previsto), el estado es 🟡 "esperar", con `desde` = episodio + `ventana_min`. Si la temperatura está fuera de rango, el motivo lo dice.
  4. Con `d` en ventana pero temperatura fuera de rango, el estado es 🟡 "lluvia buena, temperatura justa", indicando cuál falla.
  5. Sin episodio, o con `d > ventana_max`, el estado es 🔴 "seco" o "ventana pasada".
  6. Si hay episodio previsto en la previsión, el motivo se completa con "lluvia prevista el DD/MM".
- **UI**:
  - **Pestaña Zona** (se habilita):
    - Al tocar el mapa se elige el punto meteo más cercano.
    - Panel con el semáforo de las 5 especies (la elegida arriba), el motivo y las fechas.
    - Debajo, un gráfico SVG propio sin librería: barras de lluvia diaria, líneas de Tmin y Tmax, una línea vertical en "hoy", la previsión sombreada y una banda de la ventana de la especie elegida. Sigue la skill `dataviz` y es legible al sol (contraste alto, eje grande).
  - **Capa del mapa "Semáforo"**: los polígonos de Voronoi coloreados por el estado de la especie elegida, con opacidad 0,35. Se activa desde el panel de capas.
  - **Texto fijo**: "Orientativo: reglas de aficionado, no ciencia exacta."
- **Sin cambios en la seguridad**: el semáforo habla de *cuándo buscar*, nunca de comestibilidad.

## Tareas

1. **Pipeline**: subcomando `meteo` (puntos, Voronoi, PMTiles) y exportación de `tiempo:` al manifest. Tests: rejilla y filtro (puntos sin bosque descartados) y Voronoi con cobertura completa de la zona.
2. **`app/src/meteo.ts`**: cliente de Open-Meteo con lotes, corrección por altitud y caché en IndexedDB. Tests con fetch simulado: lotes, corrección y caducidad.
3. **`app/src/semaforo.ts`**: la regla. Tests mínimos:
   - 30 mm hace 12 días con temperatura templada → 🟢.
   - 30 mm hace 3 días → 🟡 con `desde` correcto.
   - Seco 30 días → 🔴.
   - 30 mm hace 25 días → 🔴 "ventana pasada".
   - 30 mm hace 12 días con frío (tmin 3) → 🟡 por temperatura.
   - Lluvia repartida en 3 días (10+10+10) → cuenta como episodio.
   - Episodio solo en la previsión → 🟡 "lluvia prevista".
   - Caché de más de 72 h → gris.
   - El mismo día con 2 episodios → manda el más reciente.
4. **UI**: pestaña Zona, gráfico SVG, capa Semáforo y estado de actualización.
5. **e2e**:
   - Con fetch de Open-Meteo interceptado por un fixture fijo: tocar el mapa → panel con estados esperados para el fixture → captura.
   - Modo offline → recarga → la Zona muestra la caché con "actualizado hace".
6. **Puerta**: `code-review` high.

## Criterios de aceptación

- `npm run build`, `vitest`, `pytest` y e2e en verde. Capturas en `app/e2e/capturas/`.
- Una consulta real a Open-Meteo (una vez, en desarrollo) funciona y su resultado se muestra; las fechas y el resumen de estados se apuntan en el informe.
