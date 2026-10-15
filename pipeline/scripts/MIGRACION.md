# Migración del checkout principal a multi-región (NO ejecutar sin el visto bueno de Alexander)

Plan: `docs/superpowers/plans/2026-10-15-multi-region-fase-a-pipeline.md`, Task 11 Step 4.
Se hace al fusionar `region-alicante` en `main`, en `/Users/alexanderkrupnov/Documents/Claude/setas`.

## Antes de fusionar: `main` se ha movido

Al cerrar la fase A (2026-10-15), `main` lleva 3 commits que esta rama no tiene y que tocan el pipeline:
`b201e6c` (app), `6aa89c1` (citas GBIF+iNat+foros) y `6503042` (máscara de edificado y calibración con citas:
`calibracion.py`, `citas.py`, `edificado.py`, `ejecutar.py`, `idoneidad.py`, `fuentes.yaml`). El checkout
principal tiene además trabajo sin versionar (`titularidad.py`, `titularidad.pmtiles`).

Esos módulos usan todavía rutas fijas (`data/raw`, `data/out`) y el `ejecutar.PASOS` antiguo. Al fusionar hay que
pasarlos a la API de región (`region.raw/out/app`, `pasos_de(region)`, `--region`) y, si traen fuentes regionales,
a `regiones/marbella.yaml`. `tests/test_sin_valores_fijos.py` lo vigila. El dorado de esta rama
(`tests/dorado/marbella.json`) se generó con el código previo a esos commits: tras la fusión no vale y hay que
regenerarlo con `scripts/regresion_marbella.sh antes` sobre el código de `main` **antes** de portar nada, y
comparar con `despues` al terminar.

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
7. El primer `ejecutar accesos` o `exportar acceso|rutas` crea `data/marbella/raw/zona.osm.pbf` (osmium, unos segundos).
8. Quitar el worktree solo cuando la fase B (app) lo diga (spec §8).
