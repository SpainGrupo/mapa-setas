# Fase 9: tops por día, calendario y ruta a pie

Aprobado por Alexander el 2026-10-14.

## Decisiones
- **Ficha de acceso**: se quita "Abrir en otra app". Queda "Cómo llegar en coche" (Google Maps hasta el aparcamiento) y se añade **"Ruta a pie"**:
  - Vista de la ruta desde el aparcamiento hasta el punto, con distancia, tiempo, desnivel y perfil de altura.
  - Dificultad:
    - **fácil**: ≤30 min y ≤150 m
    - **moderada**: ≤60 min y ≤350 m
    - **difícil**: ≤120 min y ≤700 m
    - **muy difícil**: el resto
  - Seguimiento con GPS: posición, distancia restante y aviso de "fuera de ruta" a más de 80 m. Todo funciona sin cobertura.
- **Pestaña "Hoy"** (sustituye a "Zona" y la incluye; al tocar el mapa se sigue abriendo el panel de zona):
  - **Selector de día**: de hoy a +15 días. Open-Meteo `forecast_days=16`. Fiabilidad de la proyección: 1–3 días alta, 4–7 media, 8–15 baja.
  - **Top 10 por seta** para el día elegido.
  - **Top general**: los N mejores sitios de cada seta activa (N=2 por defecto, 3 configurable en Ajustes), ordenados, máximo 20.
  - Fórmula del orden: calidad del sitio × factor del semáforo ese día (verde 1, amarillo 0,5, gris 0,3, rojo 0,1) × fiabilidad de la especie (buena 1, media 0,85, sin validar 0,75, baja 0,6) × bonus por poco pisado (más lejos del camino) × filtro de dificultad máxima elegido por el usuario. Una especie "activa" ese día es la que no está en rojo.
  - Cada sitio muestra la seta, la puntuación, el semáforo, el tiempo a pie, el desnivel, la dificultad y si está en zona restringida. Botones: Ver en mapa, Ruta a pie, Cómo llegar en coche y Guardar.
  - **Calendario**: tabla de 12 especies por 12 meses con la marca del día elegido. Cada especie lleva su estado ("ya sale", "empieza en ~X días", "aguanta hasta ~fecha") y va ordenada por prioridad. Al tocarla se ven sus tops y su ficha.

## Contrato de datos (pipeline → app)
- `sitios.json` (en el manifest y en la descarga offline): `{version:1, generado, especies:{<id>:[{id, lat, lon, area_ha, punt_media, punt_max, t_pie_min, subida_m, dist_camino_m, aparcamiento_id, restringido, meteo_id}]}}`.
  - Hasta 150 manchas por especie, ordenadas por calidad.
  - Cada mancha es un conjunto conectado (8 vecinos) de celdas con idoneidad ≥60 y área ≥2 ha.
  - Su punto representativo es la celda con mejor puntuación dentro de la mancha y con acceso válido.
- `acceso.bin`: se añade una capa `altitud` (u16, en m, nodata 0xFFFF) para el perfil de cualquier ruta. La cabecera `acceso.json` sube de versión y la app debe aceptar las dos versiones.
