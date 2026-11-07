---
type: Reference
title: Vistas de la app y Puntuación del día
description: Cómo decide la app qué especies muestra, qué pinta, qué significa la puntuación y cómo sale la probabilidad del semáforo.
tags: [app, ux]
timestamp: 2026-11-07T14:00:00Z
---

# Notes

- «Puntuación del día» (antes «Calidad del monte») = hábitat × tamaño × lejanía del camino × tiempo × fiabilidad del mapa × factor de citas.
- Tiempo (desde 2026-11-07): factor continuo 0,1 + 0,9 × min(1, p/90), con p la probabilidad estimada del semáforo v3 (0–100). Sin probabilidad (gris) se usa el de antes por estado: verde 1, amarillo 0,5, gris 0,3, rojo 0,1. Así, dentro de un mismo color, sube el sitio cuyo punto meteo da más probabilidad.
- Factor de citas (2026-10-17): ×1,15 si el sitio tiene citas de nivel «punto», ×1,05 si solo «paraje», ×1 sin citas. Solo se aplica en las regiones con `factor_citas: true` en sitios.json (lo decide la validación por bloques del pipeline; ver «Calibración con citas»). En todas, el Top enseña «Citado: foro / iNat / … (N citas, última AAAA)» y, al pulsarlo, la lista de fuentes (origen, fecha, precisión, distancia, enlace, atribución · licencia) con el aviso de las citas.
- Las capas de idoneidad no pintan valores < 30.
- Selector de especies: con GPS manda el punto meteo del usuario; sin GPS, una seta está activa si lo está en algún punto meteo de la vista del mapa (o a ≤ 40 km del centro si la vista es enorme).
- Desde el Top se abre la ficha de la especie.
- Las fichas buscadas llevan aviso neutro, sin la palabra «comestible».

## Semáforo v3: probabilidad estimada (2026-11-07)
- Cada resultado del semáforo trae `probabilidad` (0–100, entera; sin ella en gris). El color sale de la cifra: verde ≥ 50, amarillo ≥ 20, rojo por debajo (`UMBRAL_VERDE`, `UMBRAL_AMARILLO` en semaforo.ts).
- p = P_MAX (0,9) × tiempo × temperatura × humedad × estrés × temporada. Tiempo: rampa lineal en los 10 días previos al inicio de la ventana (nunca antes de 0,3 × ese inicio), meseta en la ventana y caída lineal hasta 0 a fin + max(10 días, 0,4 × ancho). Manda el episodio pasado que más da hoy; la lluvia prevista no baja la cifra de hoy. Temperatura: por cada media de 10 días (mínimas y máximas), max(0, 1 − desvío/6 °C). Humedad acumulada insuficiente × 0,65; golpe de calor o aire seco × 0,7; fuera de temporada × 0,2 (× 0,45 con lluvia fuerte y suelo húmedo).
- Por qué: v2 usaba cortes duros (un día fuera de la ventana = rojo; 0,2 °C fuera = amarillo) y los hallazgos de campo de noviembre de 2026 lo contradecían. Parámetros calibrados con 281 citas fechadas y 843 controles con meteo histórica (docs/investigacion/2026-11-07-semaforo-probabilidad.md, script app/scripts/calibrar-semaforo.mts).
- El «esperar» (ventana aún sin abrir, poca probabilidad hoy) ahora es rojo con `desde`: el calendario lo sigue leyendo como «Empieza en ~X días» y el selector como «su ventana aún no abre». El amarillo se rotula «Puede salir» (antes «Esperar»).
- Dónde se ve la cifra: chips de Hoy (por seta y por sitio, con la sublista de la zona), tarjeta del punto en el mapa, lista de la pestaña Zona, tarjeta del mapa de Hoy y el aviso diario («probabilidad estimada ≈ 62 %»). Es orientativa, no una garantía, y nunca dice nada de comestibilidad.

## Cubierta de copas por sitio (sitios.json v3, 2026-10-18)
- Cada sitio trae `arbol` (moda del MFE en la mancha), `fcc_mfe` (FCC media del MFE), `cubierta_sat` (% de píxeles árbol de ESA WorldCover 2021, 10 m, CC BY 4.0; `arbol_sat.tif`, paso `satelite`) y `cubierta_sat_punto` (300 m alrededor del punto, informativo).
- `factor_cubierta` = 0,3 + 0,7·smoothstep(c / m), c = satélite si hay, si no MFE; m = min(dosel.opt[0], 40). Sin `dosel` o m = 0 → 1. Multiplica la calidad en pipeline (sitios.py) y app (ranking.ts).
- La razón dice «Alcornocal claro, 25 % de copas» (< 10 muy abierto, < 40 claro, < 70 densidad media, resto denso) y avisa si el satélite ve ≥ 15 puntos menos que el MFE o que la mancha alrededor del punto.
- Se eligió WorldCover y no Copernicus HRL TCD 2018 porque esta exige cuenta para descargar. WorldCover es binaria por píxel (no densidad), así que tiende a dar más cubierta que la FCC del MFE en olivares y matorral alto.

# Citations

- commits 56b61c3, 5ba88dd, 42a885c
- app/src/ranking.ts, app/src/hoy-ui.ts, app/src/citas.ts, pipeline/setas_pipeline/citas_sitios.py
- app/src/semaforo.ts (v3), app/scripts/calibrar-semaforo.mts, docs/investigacion/2026-11-07-semaforo-probabilidad.md
- pipeline/setas_pipeline/sitios.py, pipeline/setas_pipeline/cubierta_satelite.py, app/src/razones.ts
