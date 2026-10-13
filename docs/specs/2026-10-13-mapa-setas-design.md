# Mapa de setas — Diseño

Fecha: 2026-10-13 · Estado: borrador para revisión de Alexander

## 1. Objetivo

Web app instalable en el móvil (PWA) para buscar setas en la zona a ≤2 h en coche desde Marbella. Indica **dónde** hay hábitat probable para cada especie, **cuándo** ir según la lluvia y la temperatura recientes, ayuda a **reconocer** lo que se encuentra y permite **guardar sitios propios**. Debe funcionar en el monte sin cobertura.

Especies prioritarias: boletus (*B. edulis*, *B. aereus*, *B. aestivalis/reticulatus*, *B. pinophilus*) y *Amanita caesarea*.

Fuera de alcance (v1): uso multiusuario, cuentas, compartir sitios, app nativa.

## 2. Principio de seguridad (no negociable)

- La app **nunca** afirma que un ejemplar sea comestible. Muestra candidatos, rasgos y confusiones peligrosas.
- Si entre los candidatos queda alguna especie mortal o tóxica que no se ha descartado, se muestra en rojo y la ficha de comestible queda bloqueada.
- Aviso fijo y visible: no consumir nada sin la confirmación de un experto (micólogo, sociedad micológica o farmacia).
- La normativa de recolección (parques naturales, permisos, cupos) se toma solo de fuente oficial de la Junta de Andalucía. Si no se ha verificado, se muestra como `pendiente de verificar`, nunca inventada.

## 3. Arquitectura

```
[Mac: pipeline Python]  ──genera──▶  capas estáticas (PMTiles / GeoJSON / JSON)
                                         │
[GitHub Pages: PWA] ◀──────────────────── ┘
   │  service worker: caché offline de app, capas, mapa base y modelo
   │  IndexedDB: mis sitios, último tiempo descargado
   ├──▶ Open-Meteo (directo, sin clave) ── tiempo histórico y previsión
   └──▶ Cloudflare Worker (proxy) ──▶ Gemini API ── reconocimiento online
```

Unidades:

| Unidad | Qué hace | Depende de |
|---|---|---|
| `pipeline/` (Python) | Descarga y procesa los datos fuente y genera las capas y la malla | fuentes §4 |
| `app/` (PWA) | Mapa, capas, GPS, semáforo, guía, mis sitios, reconocedor | salidas del pipeline |
| `worker/` (Cloudflare) | Proxy a Gemini con la clave como secreto y límite de uso | Gemini API |
| `guia/` (datos) | Fichas de especies en JSON y fotos con licencia libre | fuentes §7 |
| `model/` | Clasificador de setas convertido para el navegador | dataset abierto §8 |

## 4. Datos de terreno (pipeline, se ejecuta en el Mac)

- **Zona**: isócrona de 2 h en coche desde Marbella sobre OpenStreetMap (OSRM u openrouteservice).
- **Relieve**: Copernicus DEM 30 m (descarga automatizable; sustituye al MDT25 IGN), del que salen altitud, orientación y pendiente.
- **Vegetación**: Mapa Forestal de España (MFE25) junto con REDIAM (Junta de Andalucía), para obtener la especie arbórea dominante y la cobertura.
- **Suelo**: mapa geológico IGME, clasificado como silíceo/ácido, calizo/básico u otros (peridotitas, etc.).
- **Accesos**: senderos, pistas y carreteras de OSM, para calcular la distancia de cada punto al acceso más cercano.
- **Espacios protegidos**: Espacios Naturales Protegidos (REDIAM), mostrados como capa informativa.
- **Malla**: celdas de unos 100 m. Por celda se guarda árbol, cobertura, altitud, orientación, pendiente, suelo, distancia al acceso y si está en un espacio protegido.

## 5. Idoneidad por especie

- Cada especie tiene un perfil de hábitat en `pipeline/especies.yaml` con árboles asociados, rango de altitud, orientaciones preferidas, tipo de suelo y temporada.
- La puntuación va de 0 a 100 por celda y especie. Se suman factores ponderados y el árbol es eliminatorio: sin el árbol hospedador, la puntuación es 0.
- **Calibración**: se contrasta con observaciones de GBIF e iNaturalist en Andalucía. Se informa qué porcentaje de observaciones cae en celdas con puntuación alta. Las coordenadas públicas suelen venir difuminadas, así que sirven para validar, no para guiar a un punto exacto.
- **Filtro "lejos del acceso"**: un control deslizante de distancia mínima al acceso (0–1000 m) que oculta las celdas que queden más cerca.
- Salida: capas de mapa de calor en PMTiles, una por especie o grupo.

## 6. Cuándo ir (tiempo)

- Una red de 40–60 puntos meteorológicos repartidos por las sierras, y cada celda se asigna al punto más cercano.
- La app consulta Open-Meteo cuando hay cobertura (histórico de 30 días y previsión de 7) y guarda el resultado en IndexedDB con su fecha.
- **Indicadores**: lluvia acumulada en 7, 15 y 30 días; días desde el último episodio de más de 20–25 mm; mínimas y máximas medias de 10 días; previsión.
- **Semáforo por especie y zona**:
  - 🟢 ventana abierta
  - 🟡 esperar, con fecha estimada
  - 🔴 seco, frío o pasado
  - Los umbrales son propios de cada especie (*A. caesarea* necesita más calor) y viven en `especies.yaml`.
- Los umbrales iniciales salen de la bibliografía micológica, se marcan como heurísticos y se ajustan después con los hallazgos propios.
- Al tocar una zona, gráfico de lluvia y temperatura de las últimas 4–6 semanas.

## 7. Guía de especies

- **Grupos v1**:
  - Muy apreciadas: boletus (4), *A. caesarea*, níscalo, rebozuelo y parasol.
  - Comestibles de poco valor: una selección.
  - Tóxicas y mortales: *A. phalloides*, *A. verna*, *A. muscaria*, *A. pantherina*, *Rubroboletus satanas*, *Caloboletus calopus* y otras que se confunden con las anteriores.
- **Cada ficha**: fotos con licencia libre (Wikimedia Commons o iNaturalist CC, con autoría), sombrero, himenio (láminas o poros), pie, volva, anillo, olor, color de la carne al corte, hábitat, temporada y la sección **"No confundir con…"**, con comparativa lado a lado.
- El contenido se redacta a partir de fuentes micológicas citadas y se revisa en el hilo principal antes de publicarlo.

## 8. Reconocedor por cámara

1. **Sin cobertura**: un clasificador entrenado con un dataset abierto de hongos europeos (Danish Fungi 2020 / FungiTastic; **viabilidad por verificar**: licencia, tamaño y precisión en navegador). Corre con ONNX Runtime Web y devuelve las 5 especies más probables con su confianza.
2. **Comprobación guiada**: preguntas que distinguen entre los candidatos (volva, anillo, láminas o poros, azulea al corte, color del interior del huevo). En los huevos de amanita es obligatorio cortarlo en vertical y fotografiar el interior. Las especies peligrosas que no se hayan descartado se muestran en rojo.
3. **Con cobertura (Gemini)**: se envían de 1 a 4 fotos, las respuestas de la comprobación guiada y el contexto del punto GPS (árbol, suelo, altitud, fecha) al Worker, que llama a Gemini. La respuesta se pide en JSON (candidatos, rasgos observados, confusiones peligrosas, nivel de confianza) y se presenta con la misma regla de seguridad que el resto de la app.
   - **Por decidir**: el modelo Gemini concreto (lo elijo en la fase de plan según las capacidades de visión y el precio vigentes).
   - **Worker**: la clave se guarda como secreto, con límite diario de llamadas y restricción de origen.

## 9. Mis sitios

- Punto GPS (o tocando el mapa) con estrella (1–3), nota, especie, fecha y foto. Se guarda en IndexedDB y funciona sin cobertura.
- Exportación e importación en GPX y JSON como copia de seguridad. Más adelante, los hallazgos pueden servir para afinar la idoneidad y los umbrales.

## 10. App (PWA)

- Mapa con MapLibre GL y mapa base topográfico de la zona en PMTiles, cacheado para uso offline. **Pendiente**: medir el peso real y aceptarlo si es razonable (menos de 1 GB).
- Pantallas: Mapa (capas, filtro de especie, filtro de distancia, GPS) · Zona (semáforo, gráfico, hábitat) · Guía · Reconocer · Mis sitios.
- Alojamiento en GitHub Pages (HTTPS, necesario para el GPS, la cámara y la instalación). La URL es pública, pero los datos personales no salen del teléfono.
- Respaldo: exportación de capas y sitios a OsmAnd o Locus Map (GeoJSON/KML y GPX).

## 11. Pruebas y verificación

- **Pipeline**: tests de la puntuación con celdas de prueba (sin árbol hospedador la puntuación es 0, la orientación afecta, etc.) y un informe de calibración con GBIF.
- **Semáforo**: tests con series de tiempo sintéticas (lluvia fuerte hace 12 días con clima templado debe dar 🟢, etc.).
- **App**: prueba e2e en el navegador: carga, modo avión con capas visibles, crear y exportar un sitio, y abrir una ficha.
- **Reconocedor**: conjunto de fotos de prueba por especie. Se mide el acierto en el top-5 y se comprueba que una phalloides nunca aparezca sin la alerta roja.

## 12. Fases de construcción propuestas

1. Pipeline de terreno con la malla y la idoneidad para boletus y caesarea, más la calibración.
2. PWA básica: mapa offline, capas, GPS y mis sitios.
3. Tiempo y semáforo.
4. Guía de especies.
5. Reconocedor sin cobertura con la comprobación guiada.
6. Worker y Gemini.
7. Exportación a OsmAnd/Locus.

## 13. Pendientes abiertos

- Verificar la viabilidad del modelo sin cobertura (licencia, tamaño y precisión).
- Verificar la normativa de recolección en Andalucía en fuente oficial.
- Medir el peso del mapa base offline.
- Clave de Gemini: la crea Alexander y se guarda como secreto del Worker (nunca en el chat ni en el repositorio).
- Cuenta de GitHub y de Cloudflare para el alojamiento.
