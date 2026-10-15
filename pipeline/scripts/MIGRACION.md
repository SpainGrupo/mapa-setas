# Migración del checkout principal a multi-región (NO ejecutar sin el visto bueno de Alexander)

Plan: `docs/superpowers/plans/2026-10-15-multi-region-fase-a-pipeline.md`, Task 11 Step 4.
Se hace al fusionar `region-alicante` en `main`, en `/Users/alexanderkrupnov/Documents/Claude/setas`.

## `main` ya está fusionado en esta rama (2026-10-15, hasta `ea16d66`)

Los commits de `main` posteriores a la fase A (`b201e6c` … `ea16d66`: máscara de edificado, calibración con citas,
capa de titularidad, capa de citas, selector por vista del mapa, «Puntuación del día») están fusionados y portados:

- `edificado.py`: provincias del Catastro en `regiones/<id>.yaml` → `edificado.catastro_provincias`; feed ATOM
  nacional en `fuentes.yaml` → `catastro_bu.atom`; landuse OSM del `raw/zona.osm.pbf` de la región.
- `titularidad.py`: fuentes en `capas.montes_publicos | cotos_caza | pasos_publicos` (adaptadores REDIAM en
  `adaptadores/rediam.py`), textos, aviso y norma en `legal.titularidad`, atribución en `atribuciones.titularidad`;
  vallas OSM del `raw/zona.osm.pbf`.
- `citas.py`: centro, radio y CSV de sitios en `citas` (`--region`); caché en `data/<region>/raw/citas/`.
- `exportar.py`: `titularidad`, `citas` y `lugares` con `--region`.
- El dorado `tests/dorado/marbella.json` se regeneró con el código de `main` en `ea16d66` (sin red, sobre un clon
  de los datos del checkout principal) y la regresión `despues` da `OK: 212 archivos, 0 diferencias`. Única
  salvedad: `calibracion.md` cita ahora `data/marbella/out/citas.geojson` en vez de `data/out/citas.geojson`; su
  huella en el dorado es la del informe de `main` con esa ruta cambiada (comprobado: el resto es idéntico byte a byte).

Cachés nuevas que `migrar_datos.sh` mueve con el resto de `raw/` a `marbella/raw/` (no hay que tocarlo):
`catastro_bu/`, `citas/`, `montes_publicos/`, `cotos_caza/`, `vias_pecuarias/`. Salidas nuevas en `out/` que pasan
a `marbella/out/`: `edificado.tif`, `citas.geojson` (entrada de la calibración; solo se rehace con red),
`citas_capa.json`, `titularidad.geojson`, `titularidad_resumen.json`, `app/titularidad.pmtiles`, `app/citas.pmtiles`.
PENDIENTE: el CSV de sitios de foros (`citas.sitios_csv` en `regiones/marbella.yaml`) sigue en un scratchpad de una
sesión anterior; si se quiere conservar, copiarlo a `data/marbella/raw/citas/` y apuntar ahí la clave.

## Pasos

1. En el worktree: `cd pipeline && uv run pytest -q` en verde y la regresión de Marbella (Task 10) en `OK`.
2. Fusionar en `main` (tras el plan de la app, o antes si se acepta el enlace interino de la Task 11) y portar lo
   descrito arriba.
3. `brew install osmium-tool` si falta (`osmium --version`). Ya está en `Z.Funciones Base/setup.sh`.
4. `pipeline/scripts/migrar_datos.sh /Users/alexanderkrupnov/Documents/Claude/setas/pipeline/data`
   (mueve con `mv`, no copia; idempotente).
5. `npm --prefix app run datos` (rehace el enlace `app/public/data` → `pipeline/data/marbella/out/app`).
6. Comprobación sin red:
   `cd pipeline && HTTPS_PROXY=http://127.0.0.1:9 uv run python -m setas_pipeline.exportar manifest --region marbella && uv run python -m setas_pipeline.exportar regiones`
   (el manifest debe traer `titularidad` y `citas` si existen `app/titularidad.pmtiles` y `app/citas.pmtiles`).
7. El primer `ejecutar accesos|edificado` o `exportar acceso|rutas|titularidad|meteo` crea
   `data/marbella/raw/zona.osm.pbf` (osmium, unos segundos).
8. Quitar el worktree solo cuando la fase B (app) lo diga (spec §8).
