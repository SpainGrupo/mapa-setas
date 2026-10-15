# Multi-región, Fase A (pipeline) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactorizar el pipeline Python para que funcione por región (`--region`, config `pipeline/regiones/<id>.yaml`, rutas `pipeline/data/<region>/…`, adaptadores de fuente) sin cambiar ni un píxel de las salidas de Marbella, demostrado con una huella dorada generada antes del refactor.

**Architecture:** Primero se fija una huella dorada de Marbella re-ejecutando sin red el código actual sobre un clon APFS de la caché. Después se introduce `Region` (carga y valida la YAML), un paquete `setas_pipeline/adaptadores/` con un registro por tipo de capa (`protegidos`, `restricciones`, `incendios`, `senderos`) al que se mueve tal cual la lógica REDIAM/EFFIS/OSM, y se sustituye cada constante `BASE/RAW/OUT/APP` por `region.raw/out/app`. Al final se re-ejecuta todo sin red con `--region marbella` y se compara con la huella; solo se permiten las claves nuevas del manifest.

**Tech Stack:** Python 3.12 (`uv run` en `pipeline/`), pytest, geopandas/rasterio/pyosmium, osmium-tool (CLI, nuevo), tippecanoe, pmtiles (Python), bash.

**Spec:** `docs/specs/2026-10-15-multi-region-alicante-design.md` (§2, §3.1–3.4, §3.5 `sin_habitat`, §3.6 `legal.ccaa`, §3.7, §4.1 layout publicado, §7.1–7.2).

## Global Constraints

- Python 3.12 vía `uv run` dentro de `pipeline/`. Nunca `pip` ni el python del sistema.
- Identificadores en español sin tildes (`region`, `especies_activas`, `cargar_capa`…).
- Trabajo en el worktree `/Users/alexanderkrupnov/Documents/Claude/setas-alicante` (rama `region-alicante`). El checkout principal `/Users/alexanderkrupnov/Documents/Claude/setas` solo se **lee** (clonado de datos). Nunca se escribe en él durante este plan.
- «Marbella no cambia. Sus salidas del pipeline son idénticas antes y después del refactor (§7.1)». Diferencias permitidas en la comparación: solo `manifest.region`, `manifest.legal` y `manifest.especies[].sin_habitat` (más `generado`, y ±1 % en tamaños de pmtiles/sqlite).
- «El enum `ARBOL` … gana `sabina` … **añadido al final** sin renumerar, para que `arbol.tif` de Marbella siga idéntico.»
- «Las fuentes de datos distintas se resuelven con **adaptadores** declarados en la config, no con ramas `if region == …`.»
- Regla del proyecto: nunca inventar un hecho; lo desconocido es `PENDIENTE`. La app nunca afirma comestibilidad (no aplica a este plan, pero no se toca ningún texto de seguridad).
- TDD para la lógica. Commits frecuentes; cada mensaje termina con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Procesos largos (re-ejecución del pipeline): se lanzan con `nohup` a un log y se espera **en primer plano** (bucle `until … sleep` o la herramienta Monitor). Nunca terminar el turno con un proceso pendiente.
- Directorio temporal: el scratchpad de la sesión (`$SCRATCH` en este plan). Nada en `/tmp`.

## Hechos verificados al escribir el plan (2026-10-15)

- `pipeline/data/` no existe en el worktree. Datos reales en `/Users/alexanderkrupnov/Documents/Claude/setas/pipeline/data` (`raw` ≈ 1,0 GB con `andalucia.osm.pbf` 186 MB, `out` ≈ 559 MB con `out/app/modelo/` del reconocedor).
- `pytest` del worktree: 132 passed (58 s).
- `osmium` (osmium-tool) **no está instalado** (`which osmium` vacío; `brew list osmium-tool` falla). `tippecanoe` y `pmtiles` sí.
- Pasos que necesitan red aunque haya caché: `ejecutar zona` (OSRM, sin caché en el código) y `exportar base` (Protomaps). Todo lo demás lee caché (`descargas.obtener`, teselas WFS/ArcGIS, DEM, GBIF, pbf). La regresión excluye esos dos pasos y lo demuestra ejecutándose con los proxies apuntando a un puerto cerrado.
- `idoneidad.py:123` hace `np.minimum(arbol, max(ARBOL.values()))`: hoy el NODATA 255 de `arbol.tif` cae en `otro` (7). Si `sabina` = 8 sin más, el 255 pasaría a `sabina` y cambiaría la idoneidad fuera de zona. Task 3 lo corrige conservando el comportamiento.
- `exportar_protegidos` y `restricciones_gdf` leen hoy la caché RENPA con `glob("*_0.json")`; tras el refactor la leen vía `descargar_teselas` (mismas teselas, mismos archivos). Puede cambiar el **orden** de filas → tamaño de `protegidos.pmtiles`/`restricciones.pmtiles` dentro del ±1 %; los rasters y `sitios.json` no dependen del orden.
- `fuego.tif` usa `date.today().year` como año de referencia: la huella vale para 2026. Si se compara en 2027 cambia (riesgo anotado, no se corrige aquí).

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `pipeline/setas_pipeline/dorado.py` | Crear | Huella dorada de un `out/` (rasters, JSON normalizados, binarios, pmtiles) y comparación con tolerancias. CLI `generar`/`comparar`. |
| `pipeline/scripts/regresion_marbella.sh` | Crear | Re-ejecuta sin red todos los pasos con caché (`antes`: código viejo; `despues`: `--region marbella`) y genera/compara la huella. |
| `pipeline/scripts/migrar_datos.sh` | Crear | Migra `pipeline/data/{raw,out}` a `pipeline/data/marbella/{raw,out}` + `_comun/gbif` + `raw/osm/`. Idempotente. |
| `pipeline/tests/dorado/marbella.json` | Crear (generado) | Huella dorada de Marbella antes del refactor. |
| `pipeline/tests/dorado/zona_puntos.json` | Crear (generado) | `n` y sha256 de `puntos_muestreo()` antes del refactor (zona no se re-ejecuta: OSRM). |
| `pipeline/regiones/marbella.yaml` | Crear | Todos los valores de Marbella/Andalucía que hoy están en código y en `fuentes.yaml`. |
| `pipeline/setas_pipeline/region.py` | Crear | `Region`, `cargar_region`, `validar`, `listar_regiones`, `argumento_region`, `region_cli`, `fusionar`. |
| `pipeline/setas_pipeline/adaptadores/__init__.py` | Crear | `CONTRATO`, `Contexto`, `REGISTRO`, `registrar`, `vacio`, `normalizar`, `cargar_capa`. |
| `pipeline/setas_pipeline/adaptadores/rediam.py` | Crear | `rediam_enp`, `rediam_porn` (+`clasificar_restriccion`), `rediam_por_anio`, `rediam_senderos` (+`senderos_rediam`, `solo_senderos`). |
| `pipeline/setas_pipeline/adaptadores/effis.py` | Crear | `effis` (incendios). |
| `pipeline/setas_pipeline/adaptadores/derivados.py` | Crear | `protegidos_por_figura` (restricciones a partir de la capa de protegidos). |
| `pipeline/setas_pipeline/adaptadores/osm.py` | Crear | `osm_relaciones` (senderos), `pbf_zona` (osmium extract + merge), `descargar_extracto`. |
| `pipeline/setas_pipeline/malla.py` | Modificar | `ARBOL` + `sabina: 8`. |
| `pipeline/setas_pipeline/idoneidad.py` | Modificar | Códigos de árbol desconocidos → `otro` (conserva el 255 → 7). |
| `pipeline/setas_pipeline/zona.py` | Modificar | Parámetros de la región; sin `ORIGEN`/`OSRM`. |
| `pipeline/setas_pipeline/ejecutar.py` | Modificar | `pasos_de(region)`, `--region`. |
| `pipeline/setas_pipeline/{protegidos,accesos,incendios,vista_previa,vegetacion,suelo}.py` | Modificar | Región/adaptadores en vez de rutas y fuentes fijas. |
| `pipeline/setas_pipeline/{exportar,acceso,sitios,rutas,respaldo}.py` | Modificar | `region` en todas las funciones de datos; manifest con `region`/`legal`/`sin_habitat`; `exportar regiones`. |
| `pipeline/fuentes.yaml` | Modificar | Sale lo regional (osm.url, enp, rediam_senderos, incendios.rediam_*, zonificacion_porn). |
| `pipeline/tests/test_region.py`, `test_adaptadores.py`, `test_osm.py`, `test_dorado.py`, `test_migrar_datos.py`, `test_regresion_marbella.py` | Crear | Tests nuevos. |
| `pipeline/tests/test_{malla,idoneidad,zona,ejecutar,exportar,incendios,rutas,calibracion}.py` | Modificar | Firmas nuevas. |
| `app/scripts/enlazar-datos.mjs`, `app/scripts/publicar.sh`, `app/src/acceso.test.ts`, `app/src/ranking.test.ts`, `modelo/construir.py`, `README.md`, `stages/01_terreno/CONTEXT.md` | Modificar (mínimo) | Ruta de datos `pipeline/data/marbella/out/app` (interina hasta el plan de la app). |

## Tasks

1. Huella dorada: módulo `dorado` (TDD)
2. Clonar datos, script de regresión y generar el dorado con el código actual
3. `ARBOL` gana `sabina` sin cambiar Marbella
4. Interfaz de adaptadores y registro
5. Adaptadores REDIAM, EFFIS y derivados (lógica movida tal cual)
6. OSM: osmium-tool, `pbf_zona` y `osm_relaciones`
7. `Region`: `marbella.yaml`, carga, validación y perfiles por región
8. Fase 1 por región: `zona`, `ejecutar --region`, módulos de capas y migración de datos del worktree
9. Exportación por región: `exportar`/`acceso`/`sitios`/`rutas`/`respaldo`, manifest y `exportar regiones`
10. Regresión final de Marbella
11. Rutas de la app y del reconocedor + migración del checkout principal (instrucciones, no se ejecutan)

---

### Task 1: Huella dorada: módulo `dorado` (TDD)

**Files:**
- Create: `pipeline/setas_pipeline/dorado.py`
- Test: `pipeline/tests/test_dorado.py`

**Interfaces:**
- Consumes: `setas_pipeline.malla.Malla`, `escribir_tif` (para fixtures de test); `setas_pipeline.exportar._Salida` (fixture pmtiles).
- Produces:
  - `sin_generado(o) -> object`
  - `normalizar_manifest(m: dict) -> dict`
  - `huella(out: Path, desde: float | None = None) -> dict` (lanza `NoRegenerado` si hay archivos con mtime < `desde`)
  - `comparar(dorado: dict, actual: dict, solo: list[str] | None = None) -> list[str]` (lista de diferencias, vacía = OK)
  - CLI: `uv run python -m setas_pipeline.dorado generar|comparar --out DIR --dorado JSON [--desde EPOCH] [--solo REL ...]`

- [x] **Step 1: Write the failing tests**

```python
# pipeline/tests/test_dorado.py
import json, os, time
import numpy as np
import pytest
from setas_pipeline import dorado as D
from setas_pipeline.malla import Malla, escribir_tif

M = Malla(x0=300000.0, y1=4100000.0, ancho=4, alto=3, celda=100.0)


def _out(tmp_path):
    out = tmp_path / "out"
    (out / "app").mkdir(parents=True)
    escribir_tif(M, out / "arbol.tif", np.arange(12, dtype="uint8").reshape(3, 4), 255)
    (out / "calibracion.json").write_text(json.dumps({"x": {"n": 3}}))
    (out / "app" / "sitios.json").write_text(json.dumps({"version": 1, "generado": "2026-01-01T00:00:00+00:00", "especies": {}}))
    (out / "app" / "acceso.bin").write_bytes(b"\x01\x02")
    (out / "app" / "manifest.json").write_text(json.dumps({
        "generado": "2026-01-01T00:00:00+00:00", "bbox": [1, 2, 3, 4],
        "especies": [{"id": "a", "nombre": "A", "fiabilidad": "baja"}],
        "archivos": [{"nombre": "x.pmtiles", "bytes": 1000}, {"nombre": "acceso.bin.gz", "bytes": 7}],
        "total_bytes": 1007}))
    return out


def test_sin_generado_quita_la_clave_a_cualquier_profundidad():
    assert D.sin_generado({"generado": 1, "a": [{"generado": 2, "b": 3}]}) == {"a": [{"b": 3}]}


def test_normalizar_manifest_ignora_solo_las_claves_nuevas_multi_region():
    m = {"generado": "t", "bbox": [1], "region": {"id": "marbella"}, "legal": {"ccaa": []},
         "especies": [{"id": "a", "sin_habitat": False, "nombre": "A"}],
         "archivos": [{"nombre": "x.pmtiles", "bytes": 10}, {"nombre": "a.json", "bytes": 5}],
         "total_bytes": 15, "otra_nueva": 1}
    n = D.normalizar_manifest(m)
    assert n == {"bbox": [1], "especies": [{"id": "a", "nombre": "A"}],
                 "archivos": [{"nombre": "x.pmtiles", "bytes": None}, {"nombre": "a.json", "bytes": 5}],
                 "otra_nueva": 1}


def test_huella_identica_no_da_diferencias(tmp_path):
    out = _out(tmp_path)
    assert D.comparar(D.huella(out), D.huella(out)) == []


def test_un_pixel_distinto_se_detecta(tmp_path):
    out = _out(tmp_path)
    antes = D.huella(out)
    a = np.arange(12, dtype="uint8").reshape(3, 4); a[0, 0] = 99
    escribir_tif(M, out / "arbol.tif", a, 255)
    difs = D.comparar(antes, D.huella(out))
    assert len(difs) == 1 and "arbol.tif" in difs[0]


def test_generado_no_cuenta_pero_otra_clave_si(tmp_path):
    out = _out(tmp_path)
    antes = D.huella(out)
    (out / "app" / "sitios.json").write_text(json.dumps({"version": 1, "generado": "otro", "especies": {}}))
    assert D.comparar(antes, D.huella(out)) == []
    (out / "app" / "sitios.json").write_text(json.dumps({"version": 2, "especies": {}}))
    assert any("app/sitios.json" in d for d in D.comparar(antes, D.huella(out)))


def test_tamano_pmtiles_con_tolerancia_del_1_por_ciento():
    base = {"bytes": 100000, "zoom": [8, 13], "teselas": 5, "bbox_e7": [0, 0, 10, 10],
            "atribucion": "a", "nombre": "n"}
    dor = {"pmtiles": {"app/x.pmtiles": base}}
    assert D.comparar(dor, {"pmtiles": {"app/x.pmtiles": {**base, "bytes": 100900}}}) == []
    assert D.comparar(dor, {"pmtiles": {"app/x.pmtiles": {**base, "bytes": 102000}}})
    assert D.comparar(dor, {"pmtiles": {"app/x.pmtiles": {**base, "atribucion": "b"}}})


def test_archivo_que_falta_o_sobra_es_diferencia(tmp_path):
    out = _out(tmp_path)
    antes = D.huella(out)
    (out / "calibracion.json").unlink()
    assert any("calibracion.json" in d for d in D.comparar(antes, D.huella(out)))


def test_desde_exige_que_todo_se_haya_regenerado(tmp_path):
    out = _out(tmp_path)
    viejo = time.time() - 3600
    os.utime(out / "calibracion.json", (viejo, viejo))
    with pytest.raises(D.NoRegenerado, match="calibracion.json"):
        D.huella(out, desde=time.time() - 60)


def test_entradas_fijas_no_exigen_regeneracion(tmp_path):
    out = _out(tmp_path)
    (out / "malla.json").write_text(json.dumps({"x0": 1}))
    viejo = time.time() - 3600
    os.utime(out / "malla.json", (viejo, viejo))
    # malla.json y zona.geojson son entradas (el paso zona necesita OSRM): entran en la huella sin exigir mtime
    h = D.huella(out, desde=time.time() - 60)
    assert "malla.json" in h["json"]


def test_solo_limita_la_comparacion(tmp_path):
    out = _out(tmp_path)
    antes = D.huella(out)
    (out / "calibracion.json").write_text("{}")
    assert D.comparar(antes, D.huella(out), solo=["arbol.tif"]) == []


def test_pmtiles_real(tmp_path):
    from pmtiles.tile import TileType
    from setas_pipeline.exportar import _Salida
    out = tmp_path / "out"; (out / "app").mkdir(parents=True)
    s = _Salida(out / "app" / "x.pmtiles", TileType.PNG, "x", "d")
    s.poner(8, 120, 100, b"png")
    s.cerrar((-5.0, 36.0, -4.0, 37.0), 8, 8, "IGN")
    h = D.huella(out)["pmtiles"]["app/x.pmtiles"]
    assert h["zoom"] == [8, 8] and h["atribucion"] == "IGN" and h["nombre"] == "x" and h["bytes"] > 0
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && uv run pytest tests/test_dorado.py -v`
Expected: FAIL con `ImportError: cannot import name 'dorado'`.

- [x] **Step 3: Write the implementation**

```python
# pipeline/setas_pipeline/dorado.py
"""Huella dorada de las salidas de una región (regresión de Marbella, spec multi-región §7.1).

    uv run python -m setas_pipeline.dorado generar  --out <dir out> --dorado tests/dorado/marbella.json --desde EPOCH
    uv run python -m setas_pipeline.dorado comparar --out <dir out> --dorado tests/dorado/marbella.json --desde EPOCH
(scripts/regresion_marbella.sh los llama con el out viejo antes del refactor y con el de la región después.)

Qué entra (rutas relativas a out/):
- *.tif: sha256 de los píxeles + dtype, forma, nodata, transform y CRS (no los bytes del archivo).
- *.json / *.geojson: sha256 del JSON canónico sin las claves `generado`. app/manifest.json se guarda
  entero, normalizado: sin `region`, `legal` ni `especies[].sin_habitat` (claves nuevas permitidas), sin
  `total_bytes` (va aparte con tolerancia) y con `bytes` = null en los .pmtiles.
- *.pmtiles: tamaño (±1 %), zooms, nº de teselas, bbox (±1e-4°), name y attribution.
- *.mbtiles / *.sqlitedb: tamaño (±1 %).
- Resto (.bin, .gz, .png, .md, .kml, .txt…): sha256 de los bytes.
Con --desde, todo archivo con huella debe ser posterior a esa marca (prueba de que se re-ejecutó),
salvo ENTRADAS (salen del paso zona, que necesita OSRM y no se re-ejecuta).
"""
from __future__ import annotations
import argparse, hashlib, json, sys
from pathlib import Path
import numpy as np

VERSION = 1
TOLERANCIA = 0.01
TOLERANCIA_BBOX_E7 = 1000
MANIFEST = "app/manifest.json"
MANIFEST_NUEVAS = ("region", "legal")
MANIFEST_ESPECIE_NUEVAS = ("sin_habitat",)
# No los produce ningún paso re-ejecutable sin red (base = Protomaps) o no son del pipeline actual.
NO_REGENERADOS = {"citas.geojson", "region_base.geojson", "base_build.txt", "vista_arbol.png",
                  "vista_suelo.png", "app/base.pmtiles"}
SIN_HUELLA = ("app/modelo/",)            # paquete del reconocedor (modelo/construir.py), no es del pipeline
ENTRADAS = {"zona.geojson", "malla.json"}
CATEGORIAS = ("tif", "json", "sha", "tamano", "pmtiles")


class NoRegenerado(RuntimeError):
    def __init__(self, rutas: list[str]):
        super().__init__(f"{len(rutas)} archivo(s) no regenerados: {', '.join(rutas[:20])}")
        self.rutas = rutas


def _sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sin_generado(o):
    if isinstance(o, dict):
        return {k: sin_generado(v) for k, v in o.items() if k != "generado"}
    if isinstance(o, list):
        return [sin_generado(v) for v in o]
    return o


def _canonico(o) -> bytes:
    return json.dumps(o, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()


def normalizar_manifest(m: dict) -> dict:
    m = sin_generado(m)
    n = {k: v for k, v in m.items() if k not in MANIFEST_NUEVAS and k != "total_bytes"}
    if "especies" in n:
        n["especies"] = [{k: v for k, v in e.items() if k not in MANIFEST_ESPECIE_NUEVAS} for e in n["especies"]]
    if "archivos" in n:
        n["archivos"] = [{**a, "bytes": None if a["nombre"].endswith(".pmtiles") else a["bytes"]}
                         for a in n["archivos"]]
    return n


def huella_tif(p: Path) -> dict:
    import rasterio
    with rasterio.open(p) as s:
        a = s.read()
        return {"sha256": _sha(np.ascontiguousarray(a).tobytes()), "dtype": str(a.dtype), "forma": list(a.shape),
                "nodata": s.nodata, "transform": [round(v, 6) for v in tuple(s.transform)[:6]], "crs": str(s.crs)}


def huella_pmtiles(p: Path) -> dict:
    from pmtiles.reader import Reader, MmapSource
    with open(p, "rb") as f:
        r = Reader(MmapSource(f))
        h, md = r.header(), r.metadata()
    return {"bytes": p.stat().st_size, "zoom": [h["min_zoom"], h["max_zoom"]],
            "teselas": h.get("addressed_tiles_count"),
            "bbox_e7": [h["min_lon_e7"], h["min_lat_e7"], h["max_lon_e7"], h["max_lat_e7"]],
            "atribucion": md.get("attribution"), "nombre": md.get("name")}


def huella(out: Path, desde: float | None = None) -> dict:
    out = Path(out)
    res = {"version": VERSION, **{c: {} for c in CATEGORIAS}, "manifest": None, "manifest_total_bytes": None}
    viejos = []
    for p in sorted(out.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(out).as_posix()
        if rel in NO_REGENERADOS or rel.startswith(SIN_HUELLA) or p.name.startswith("."):
            continue
        if desde is not None and rel not in ENTRADAS and p.stat().st_mtime < desde:
            viejos.append(rel)
            continue
        suf = p.suffix.lower()
        if suf == ".tif":
            res["tif"][rel] = huella_tif(p)
        elif suf == ".pmtiles":
            res["pmtiles"][rel] = huella_pmtiles(p)
        elif rel == MANIFEST:
            m = json.loads(p.read_text())
            res["manifest"] = normalizar_manifest(m)
            res["manifest_total_bytes"] = m.get("total_bytes")
        elif suf in (".json", ".geojson"):
            res["json"][rel] = _sha(_canonico(sin_generado(json.loads(p.read_text()))))
        elif suf in (".mbtiles", ".sqlitedb"):
            res["tamano"][rel] = p.stat().st_size
        else:
            res["sha"][rel] = _sha(p.read_bytes())
    if viejos:
        raise NoRegenerado(viejos)
    return res


def _cerca(a: float | None, b: float | None, tol: float = TOLERANCIA) -> bool:
    if a is None or b is None:
        return a == b
    return abs(a - b) <= tol * max(abs(b), 1)


def comparar(dorado: dict, actual: dict, solo: list[str] | None = None) -> list[str]:
    filtro = (lambda r: r in solo) if solo else (lambda r: True)
    difs = []
    for cat in CATEGORIAS:
        d, a = dorado.get(cat, {}), actual.get(cat, {})
        for rel in sorted(set(d) | set(a)):
            if not filtro(rel):
                continue
            if rel not in a:
                difs.append(f"falta {rel}")
            elif rel not in d:
                difs.append(f"sobra {rel} (no está en el dorado)")
            elif cat == "tamano":
                if not _cerca(a[rel], d[rel]):
                    difs.append(f"{rel}: tamaño {a[rel]} frente a {d[rel]} (>±1 %)")
            elif cat == "pmtiles":
                x, y = a[rel], d[rel]
                if not _cerca(x["bytes"], y["bytes"]):
                    difs.append(f"{rel}: tamaño {x['bytes']} frente a {y['bytes']} (>±1 %)")
                for k in ("zoom", "teselas", "atribucion", "nombre"):
                    if x.get(k) != y.get(k):
                        difs.append(f"{rel}: {k} {x.get(k)!r} frente a {y.get(k)!r}")
                if any(abs(p - q) > TOLERANCIA_BBOX_E7 for p, q in zip(x["bbox_e7"], y["bbox_e7"])):
                    difs.append(f"{rel}: bbox {x['bbox_e7']} frente a {y['bbox_e7']}")
            elif a[rel] != d[rel]:
                difs.append(f"{rel}: distinto ({cat})")
    if filtro(MANIFEST) and (dorado.get("manifest") is not None or actual.get("manifest") is not None):
        dm, am = dorado.get("manifest") or {}, actual.get("manifest") or {}
        for k in sorted(set(dm) | set(am)):
            if dm.get(k) != am.get(k):
                difs.append(f"{MANIFEST}: clave '{k}' distinta")
        if not _cerca(actual.get("manifest_total_bytes"), dorado.get("manifest_total_bytes")):
            difs.append(f"{MANIFEST}: total_bytes {actual.get('manifest_total_bytes')} frente a "
                        f"{dorado.get('manifest_total_bytes')} (>±1 %)")
    return difs


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("accion", choices=["generar", "comparar"])
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--dorado", type=Path, required=True)
    ap.add_argument("--desde", type=float, default=None, help="epoch: todo debe ser posterior (re-ejecutado)")
    ap.add_argument("--solo", nargs="+", default=None, help="rutas relativas a out/ que se comparan")
    a = ap.parse_args(argv)
    h = huella(a.out, a.desde)
    n = sum(len(h[c]) for c in CATEGORIAS) + (h["manifest"] is not None)
    if a.accion == "generar":
        a.dorado.parent.mkdir(parents=True, exist_ok=True)
        a.dorado.write_text(json.dumps(h, ensure_ascii=False, indent=1, sort_keys=True) + "\n")
        print(f"dorado: {n} archivos → {a.dorado}")
        return 0
    difs = comparar(json.loads(a.dorado.read_text()), h, a.solo)
    for d in difs:
        print("DIFERENCIA", d)
    print(f"{'OK' if not difs else 'FALLO'}: {n} archivos comparados, {len(difs)} diferencias")
    return 1 if difs else 0


if __name__ == "__main__":
    sys.exit(main())
```

- [x] **Step 4: Run tests to verify they pass**

Run: `cd pipeline && uv run pytest tests/test_dorado.py -v`
Expected: PASS (11 tests). Si `Reader.header()` no trae `addressed_tiles_count` o `min_lon_e7` en la versión instalada de `pmtiles`, mira las claves reales con `uv run python -c "from pmtiles.reader import Reader, MmapSource; f=open('…','rb'); print(Reader(MmapSource(f)).header())"` sobre el pmtiles del test y ajusta `huella_pmtiles` (no el test).

- [x] **Step 5: Commit**

```bash
git add pipeline/setas_pipeline/dorado.py pipeline/tests/test_dorado.py
git commit -m "test(pipeline): huella dorada de las salidas de una región

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Clonar datos, script de regresión y generar el dorado con el código actual

**Files:**
- Create: `pipeline/scripts/regresion_marbella.sh`
- Create (generados): `pipeline/tests/dorado/marbella.json`, `pipeline/tests/dorado/zona_puntos.json`
- Datos (no versionados, `pipeline/data/` está en `.gitignore`): `pipeline/data/raw`, `pipeline/data/out` del worktree

**Interfaces:**
- Consumes: `setas_pipeline.dorado` (Task 1); CLIs actuales `ejecutar`/`exportar` (sin `--region`).
- Produces: `pipeline/scripts/regresion_marbella.sh antes|despues` (usado en Task 10); `tests/dorado/marbella.json` (huella); `tests/dorado/zona_puntos.json` con `{"n": int, "sha256": str}` (usado en Task 8).

- [x] **Step 1: Clonar la caché y las salidas (clon APFS, solo lectura del checkout principal)**

```bash
SRC=/Users/alexanderkrupnov/Documents/Claude/setas/pipeline/data
DST=/Users/alexanderkrupnov/Documents/Claude/setas-alicante/pipeline/data
test ! -e "$DST" || { echo "ya existe $DST"; exit 1; }
mkdir -p "$DST"
cp -c -R -p "$SRC/raw" "$DST/raw"
cp -c -R -p "$SRC/out" "$DST/out"
(cd "$SRC" && find raw out -type f | wc -l); (cd "$DST" && find raw out -type f | wc -l)
du -sh "$DST/raw" "$DST/out"
```
Expected: mismo número de archivos en los dos lados; ~1,0 GB y ~559 MB. `-p` conserva los mtimes (no afecta: la regresión usa `--forzar`). Si `cp -c` falla por volumen distinto, para y avisa (no copiar 1,5 GB sin clon sin preguntar).

- [x] **Step 2: Huella informativa de lo publicado hoy (antes de regenerar)**

```bash
cd /Users/alexanderkrupnov/Documents/Claude/setas-alicante/pipeline
uv run python -m setas_pipeline.dorado generar --out data/out --dorado "$SCRATCH/dorado_publicado.json"
```
Expected: `dorado: N archivos`. Sirve en el Step 6 para saber si lo publicado coincide con el código actual (informativo; no bloquea).

- [x] **Step 3: Escribir el script de regresión**

```bash
#!/usr/bin/env bash
# pipeline/scripts/regresion_marbella.sh
# Regresión de Marbella (spec multi-región §7.1). Rehace SIN RED todo lo que se puede rehacer desde la caché
# y genera (antes) o compara (despues) la huella dorada tests/dorado/marbella.json.
#
#   pipeline/scripts/regresion_marbella.sh antes     # código previo al refactor: data/out, sin --region → genera
#   pipeline/scripts/regresion_marbella.sh despues   # código multi-región: data/marbella/out, --region marbella → compara
#
# Sin red: los proxies apuntan a un puerto cerrado y cualquier petición HTTP falla en el acto (prueba de que todo
# sale de la caché). CON_RED=1 lo desactiva (solo para rellenar una caché incompleta; nunca para generar el dorado).
# Fuera de la regresión (necesitan red sin caché): `ejecutar zona` (OSRM) y `exportar base` (Protomaps).
# zona.geojson, malla.json y base.pmtiles se reutilizan tal cual (ver ENTRADAS y NO_REGENERADOS en dorado.py).
set -euo pipefail
cd "$(dirname "$0")/.."
MODO="${1:?uso: regresion_marbella.sh antes|despues}"
if [[ "${CON_RED:-0}" != 1 ]]; then
  export HTTP_PROXY=http://127.0.0.1:9 HTTPS_PROXY=http://127.0.0.1:9 http_proxy=http://127.0.0.1:9 \
         https_proxy=http://127.0.0.1:9 ALL_PROXY=http://127.0.0.1:9 NO_PROXY= no_proxy=
fi
case "$MODO" in
  antes)   R=();                  OUT=data/out;          ACCION=generar ;;
  despues) R=(--region marbella); OUT=data/marbella/out; ACCION=comparar ;;
  *) echo "modo desconocido: $MODO" >&2; exit 2 ;;
esac
paso() { echo "[$(date +%H:%M:%S)] $*"; }
T0=$(date +%s)
paso "ejecutar (todo menos zona) --forzar"
uv run python -m setas_pipeline.ejecutar relieve vegetacion suelo estructura cubierta incendios humedad \
  protegidos accesos idoneidad calibracion vista --forzar ${R[@]+"${R[@]}"}
paso "exportar capas meteo acceso sitios rutas (+ manifest)"
uv run python -m setas_pipeline.exportar capas meteo acceso sitios rutas ${R[@]+"${R[@]}"}
paso "exportar respaldo"
uv run python -m setas_pipeline.exportar respaldo ${R[@]+"${R[@]}"}
paso "dorado $ACCION"
uv run python -m setas_pipeline.dorado "$ACCION" --out "$OUT" --dorado tests/dorado/marbella.json --desde "$T0"
paso FIN
```

```bash
chmod +x pipeline/scripts/regresion_marbella.sh
bash -n pipeline/scripts/regresion_marbella.sh && echo sintaxis-ok
```

- [x] **Step 4: Lanzar la regresión `antes` y esperar en primer plano**

```bash
cd /Users/alexanderkrupnov/Documents/Claude/setas-alicante
nohup pipeline/scripts/regresion_marbella.sh antes > "$SCRATCH/regresion_antes.log" 2>&1 &
echo $! > "$SCRATCH/regresion_antes.pid"
```
Espera en primer plano (llamadas sucesivas de ≤10 min, o Monitor), sin terminar el turno:
```bash
until ! kill -0 "$(cat "$SCRATCH/regresion_antes.pid")" 2>/dev/null; do sleep 30; done; tail -5 "$SCRATCH/regresion_antes.log"
```
Expected: la última línea es `[hh:mm:ss] FIN` y antes `dorado: N archivos → tests/dorado/marbella.json`. Anota la duración (primera y última marca) para el informe.

Si falla con un error de conexión al proxy `127.0.0.1:9`, es un paso que aún pide red: anota cuál (URL del traceback) y decide así:
- Caché GBIF/WFS incompleta: `CON_RED=1 pipeline/scripts/regresion_marbella.sh antes` una vez (rellena la caché), y después **otra vez sin red** para generar el dorado. Anótalo en el informe.
- Cualquier otro paso con red obligatoria: para y reporta (no se improvisa una exclusión).

Si falla con `NoRegenerado` (archivos de `out/` que ningún paso reescribe): para cada ruta, comprueba con `grep -rn "<nombre>" pipeline/setas_pipeline` si algún paso la produce. Si ninguno la produce, añádela a `NO_REGENERADOS` en `dorado.py` con un comentario, añade el caso a `test_dorado.py`, haz commit y relanza solo el paso del dorado: `cd pipeline && uv run python -m setas_pipeline.dorado generar --out data/out --dorado tests/dorado/marbella.json --desde <T0 del log>` (T0 = epoch de la primera marca; usa `date -j -f "%H:%M:%S" …` o relanza el script completo).

- [x] **Step 5: Huella de los puntos de muestreo de la zona (zona no se re-ejecuta)**

```bash
cd /Users/alexanderkrupnov/Documents/Claude/setas-alicante/pipeline
uv run python -c "
import json, hashlib
from setas_pipeline.zona import puntos_muestreo
p = puntos_muestreo()
print(json.dumps({'n': len(p), 'sha256': hashlib.sha256(json.dumps(p).encode()).hexdigest()}))
" > tests/dorado/zona_puntos.json
cat tests/dorado/zona_puntos.json
```
Expected: `{"n": <~6000>, "sha256": "<64 hex>"}`.

- [x] **Step 6: Comparar lo publicado con lo regenerado (informativo)**

```bash
cd pipeline && uv run python -m setas_pipeline.dorado comparar --out data/out --dorado "$SCRATCH/dorado_publicado.json" | tail -20
```
Expected: cualquier resultado. Copia el resumen al informe («lo publicado hoy coincide / difiere en X con el código actual»). No se corrige nada aquí.

- [x] **Step 7: Suite completa y commit**

```bash
cd pipeline && uv run pytest -q 2>&1 | tail -2
git add pipeline/scripts/regresion_marbella.sh pipeline/tests/dorado/marbella.json pipeline/tests/dorado/zona_puntos.json
git commit -m "test(pipeline): dorado de Marbella generado sin red con el código previo al refactor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: `133+ passed`.

---

### Task 3: `ARBOL` gana `sabina` sin cambiar Marbella

**Files:**
- Modify: `pipeline/setas_pipeline/malla.py:12-13`
- Modify: `pipeline/setas_pipeline/idoneidad.py:123`
- Test: `pipeline/tests/test_malla.py`, `pipeline/tests/test_idoneidad.py`

**Interfaces:**
- Produces: `ARBOL["sabina"] == 8`. Ningún código de `fuentes.yaml → mfe.mapeo_arbol` apunta a `sabina` en esta fase (el mapeo de *Juniperus* es de la fase de datos de Alicante y debe ir por región, porque en la zona de Marbella cambiaría `arbol.tif`).

- [x] **Step 1: Write the failing tests**

```python
# añadir a pipeline/tests/test_malla.py
def test_arbol_sabina_al_final_sin_renumerar():
    from setas_pipeline.malla import ARBOL
    assert ARBOL == {"sin_arbolado": 0, "alcornoque": 1, "encina": 2, "quejigo": 3,
                     "castano": 4, "pino": 5, "pinsapo": 6, "otro": 7, "sabina": 8}


def test_mapeo_arbol_no_usa_sabina_todavia():
    import yaml
    from pathlib import Path
    f = yaml.safe_load((Path(__file__).resolve().parent.parent / "fuentes.yaml").read_text())
    assert "sabina" not in set(f["mfe"]["mapeo_arbol"].values())
```

```python
# añadir a pipeline/tests/test_idoneidad.py
def test_codigo_de_arbol_desconocido_cuenta_como_otro():
    import numpy as np
    from setas_pipeline.idoneidad import puntuar
    perfil = {"arboles": {"otro": 0.5, "sabina": 1.0}, "altitud": {"min": 0, "opt_min": 0, "opt_max": 3000, "max": 3000},
              "orientacion": "indiferente", "suelo": {"desconocido": 1.0}}
    arbol = np.array([[7, 255, 8]], dtype="uint8")
    z = np.full((1, 3), 500.0, dtype="float32")
    s = puntuar(perfil, arbol, z, np.zeros_like(z), np.zeros_like(z), np.zeros((1, 3), "uint8"), {})
    assert s[0, 0] == s[0, 1]          # 255 (NODATA) → 'otro', como antes de añadir sabina
    assert s[0, 2] > s[0, 0]           # 8 = sabina con su propio peso
```
(Si la firma real de `puntuar` difiere en los argumentos opcionales, ajusta la llamada mirando `idoneidad.py:119`; el contenido de las aserciones no cambia.)

- [x] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && uv run pytest tests/test_malla.py tests/test_idoneidad.py -v -k "sabina or desconocido"`
Expected: FAIL (`'sabina'` no está en `ARBOL`).

- [x] **Step 3: Implementation**

`malla.py:12-13`:
```python
ARBOL = {"sin_arbolado": 0, "alcornoque": 1, "encina": 2, "quejigo": 3,
         "castano": 4, "pino": 5, "pinsapo": 6, "otro": 7,
         "sabina": 8}   # 2026-10-15 multi-región: añadido al final sin renumerar (arbol.tif de Marbella no cambia)
```

`idoneidad.py:123` (sustituye la línea):
```python
    codigo = np.where(arbol > max(ARBOL.values()), ARBOL["otro"], arbol)   # NODATA 255 y códigos raros → otro
    f_arbol = _tabla(perfil["arboles"], ARBOL)[codigo]
```

- [x] **Step 4: Run tests**

Run: `cd pipeline && uv run pytest -q`
Expected: todo PASS.

- [x] **Step 5: Commit**

```bash
git add pipeline/setas_pipeline/malla.py pipeline/setas_pipeline/idoneidad.py pipeline/tests/test_malla.py pipeline/tests/test_idoneidad.py
git commit -m "feat(pipeline): ARBOL gana sabina al final; NODATA sigue contando como otro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Interfaz de adaptadores y registro

**Files:**
- Create: `pipeline/setas_pipeline/adaptadores/__init__.py`
- Test: `pipeline/tests/test_adaptadores.py`

**Interfaces:**
- Produces:
  - `CRS = "EPSG:25830"`
  - `CONTRATO: dict[str, tuple[str, ...]]` con `protegidos=(codigo, nombre, figura)`, `restricciones=(tipo, nombre, zona)`, `incendios=(anio, fuente)`, `senderos=(ref, name, network, osmc, tipo, fuente, dificultad)`; todas con `geometry` al final.
  - `@dataclass(frozen=True) Contexto(raw: Path, zona, malla=None, fuentes: dict = {}, capas: dict = {}, osm_pbf: Callable[[], Path] | None = None, desde_anio: int | None = None)`
  - `REGISTRO: dict[str, dict[str, Adaptador]]`; `Adaptador = Callable[[dict, Contexto], GeoDataFrame]`
  - `registrar(tipo: str, nombre: str)` (decorador)
  - `vacio(tipo) -> GeoDataFrame`, `normalizar(tipo, gdf) -> GeoDataFrame`, `cargar_capa(tipo, capas: dict, ctx) -> GeoDataFrame`

- [x] **Step 1: Write the failing tests**

```python
# pipeline/tests/test_adaptadores.py
import geopandas as gpd
import pytest
from shapely.geometry import box
from setas_pipeline import adaptadores as A


def _ctx(tmp_path, **kw):
    return A.Contexto(raw=tmp_path, zona=box(0, 0, 1, 1), **kw)


def test_vacio_tiene_las_columnas_del_contrato():
    g = A.vacio("incendios")
    assert list(g.columns) == ["anio", "fuente", "geometry"] and len(g) == 0 and g.crs == A.CRS


def test_normalizar_ordena_columnas_y_reproyecta():
    g = gpd.GeoDataFrame({"fuente": ["X"], "anio": [2020], "extra": [1]}, geometry=[box(-4.9, 36.5, -4.8, 36.6)],
                         crs="EPSG:4326")
    n = A.normalizar("incendios", g)
    assert list(n.columns) == ["anio", "fuente", "geometry"] and n.crs == A.CRS
    assert n.geometry.iloc[0].bounds[0] > 1000           # metros, no grados


def test_normalizar_rechaza_columnas_que_faltan():
    g = gpd.GeoDataFrame({"anio": [1]}, geometry=[box(0, 0, 1, 1)], crs=A.CRS)
    with pytest.raises(ValueError, match="fuente"):
        A.normalizar("incendios", g)


def test_registrar_tipo_desconocido_falla():
    with pytest.raises(KeyError):
        A.registrar("inventado", "x")


def test_cargar_capa_concatena_en_el_orden_de_la_config(tmp_path, monkeypatch):
    def fuente(nombre):
        return lambda cfg, ctx: gpd.GeoDataFrame({"anio": [cfg["anio"]], "fuente": [nombre]},
                                                 geometry=[box(0, 0, 1, 1)], crs=A.CRS)
    monkeypatch.setitem(A.REGISTRO["incendios"], "f1", fuente("f1"))
    monkeypatch.setitem(A.REGISTRO["incendios"], "f2", fuente("f2"))
    capas = {"incendios": [{"adaptador": "f2", "anio": 2020}, {"adaptador": "f1", "anio": 2021}]}
    g = A.cargar_capa("incendios", capas, _ctx(tmp_path))
    assert list(g["fuente"]) == ["f2", "f1"] and list(g.index) == [0, 1]


def test_cargar_capa_sin_fuentes_da_vacio(tmp_path):
    g = A.cargar_capa("protegidos", {}, _ctx(tmp_path))
    assert len(g) == 0 and list(g.columns) == ["codigo", "nombre", "figura", "geometry"]


def test_registro_trae_los_adaptadores_de_marbella():
    # se rellenan en las Tasks 5 y 6; este test queda en rojo hasta entonces si se ejecuta antes
    pytest.importorskip("setas_pipeline.adaptadores.rediam")
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && uv run pytest tests/test_adaptadores.py -v`
Expected: FAIL (`No module named 'setas_pipeline.adaptadores'`).

- [x] **Step 3: Implementation**

```python
# pipeline/setas_pipeline/adaptadores/__init__.py
"""Adaptadores de fuente por tipo de capa (spec multi-región §3.3).

Un adaptador recibe la entrada de la config de la región (`cfg`: dict con `adaptador` y sus parámetros) y
un `Contexto`, y devuelve un GeoDataFrame en EPSG:25830 con las columnas de CONTRATO[tipo] más `geometry`.
Las descargas pasan por descargas.py (caché en disco, reintentos, paginación).

Añadir una fuente nueva (ArcGIS, WFS, zip GeoJSON…): una función decorada con @registrar("<tipo>", "<nombre>")
en un módulo de este paquete, importado al final de este archivo. La región la declara en `capas.<tipo>`.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable
import geopandas as gpd
import pandas as pd

CRS = "EPSG:25830"
CONTRATO: dict[str, tuple[str, ...]] = {
    "protegidos": ("codigo", "nombre", "figura"),
    "restricciones": ("tipo", "nombre", "zona"),
    "incendios": ("anio", "fuente"),
    "senderos": ("ref", "name", "network", "osmc", "tipo", "fuente", "dificultad"),
}


@dataclass(frozen=True)
class Contexto:
    raw: Path                                   # caché de la región (data/<region>/raw)
    zona: object                                # geometría shapely EPSG:25830 que usa el paso que llama
    malla: object | None = None                 # Malla de la región
    fuentes: dict = field(default_factory=dict)  # fuentes.yaml (nacional y compartido)
    capas: dict = field(default_factory=dict)    # capas de la región (adaptadores derivados)
    osm_pbf: Callable[[], Path] | None = None   # pbf recortado a la zona (se construye al pedirlo)
    desde_anio: int | None = None               # incendios: primer año de la ventana


Adaptador = Callable[[dict, Contexto], gpd.GeoDataFrame]
REGISTRO: dict[str, dict[str, Adaptador]] = {t: {} for t in CONTRATO}


def registrar(tipo: str, nombre: str):
    if tipo not in REGISTRO:
        raise KeyError(f"tipo de capa desconocido: {tipo}")

    def deco(f: Adaptador) -> Adaptador:
        REGISTRO[tipo][nombre] = f
        return f
    return deco


def vacio(tipo: str) -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame({c: [] for c in CONTRATO[tipo]}, geometry=[], crs=CRS)


def normalizar(tipo: str, gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    faltan = [c for c in CONTRATO[tipo] if c not in gdf.columns]
    if faltan:
        raise ValueError(f"{tipo}: faltan columnas {faltan}")
    if gdf.crs is None:
        raise ValueError(f"{tipo}: GeoDataFrame sin CRS")
    g = gdf[[*CONTRATO[tipo], gdf.geometry.name]]
    if g.geometry.name != "geometry":
        g = g.rename_geometry("geometry")
    return g if g.crs == CRS else g.to_crs(CRS)


def cargar_capa(tipo: str, capas: dict, ctx: Contexto) -> gpd.GeoDataFrame:
    """Une las fuentes de `capas[tipo]` en el orden de la config (cada una normalizada)."""
    trozos = []
    for cfg in capas.get(tipo, []):
        g = normalizar(tipo, REGISTRO[tipo][cfg["adaptador"]](cfg, ctx))
        if len(g):
            trozos.append(g)
    if not trozos:
        return vacio(tipo)
    return gpd.GeoDataFrame(pd.concat(trozos, ignore_index=True), crs=CRS)
```
(Las líneas `from . import rediam, effis, derivados, osm  # noqa: E402,F401` se añaden al final en las Tasks 5 y 6.)

- [x] **Step 4: Run tests**

Run: `cd pipeline && uv run pytest tests/test_adaptadores.py -v`
Expected: PASS (el último test sale SKIPPED hasta la Task 5).

- [x] **Step 5: Commit**

```bash
git add pipeline/setas_pipeline/adaptadores/__init__.py pipeline/tests/test_adaptadores.py
git commit -m "feat(pipeline): interfaz y registro de adaptadores de fuente por tipo de capa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Adaptadores REDIAM, EFFIS y derivados (lógica movida tal cual)

**Files:**
- Create: `pipeline/setas_pipeline/adaptadores/rediam.py`, `adaptadores/effis.py`, `adaptadores/derivados.py`
- Modify: `pipeline/setas_pipeline/adaptadores/__init__.py` (imports al final)
- Test: `pipeline/tests/test_adaptadores.py`

Los módulos viejos (`protegidos.py`, `incendios.py`, `exportar.py`, `rutas.py`) **no se tocan aún**: siguen funcionando con su código hasta las Tasks 8–9. Aquí solo se copia su lógica a los adaptadores, con los mismos nombres de caché.

**Interfaces:**
- Consumes: `descargas.descargar_teselas`, `descargas.obtener`, `incendios.caja_wgs84` (import perezoso), `rutas.clasificar_ref` (import perezoso).
- Produces (registrados):
  - `protegidos/rediam_enp` — cfg `{url, tesela_m, pagina, cache?}`; caché `raw/<cache|enp>/<xmin>_<ymin>_<xmax>_<ymax>_0.json`; columnas `codigo=CODIGOESPA`, `nombre=NOMBRE.strip()`, `figura=FIGURA.strip()`.
  - `restricciones/rediam_porn` — cfg `{url, tipos_zona_reserva}`; caché `raw/zonificacion/porn_vigentes_<bounds malla>.json`.
  - `incendios/rediam_por_anio` — cfg `{url, desde, hasta}`; caché `raw/incendios/rediam_<anio>_<bounds>.json`; años `max(ctx.desde_anio, desde)..hasta`.
  - `incendios/effis` — cfg `{url?}` (si no, `ctx.fuentes["incendios"]["effis_url"]`); caché `raw/incendios/effis_<caja>.json`; `anio >= ctx.desde_anio`.
  - `senderos/rediam_senderos` — cfg `{url_patron, tesela_m}`; caché `raw/rediam_senderos/senderos_<caja>.json`.
  - `restricciones/protegidos_por_figura` — cfg `{figura, tipo, zona}`.
  - funciones puras: `rediam.clasificar_restriccion(codigo_zona, descripcion, tipos_zona_reserva) -> str | None`, `rediam.solo_senderos(g)`, `rediam.senderos_rediam(cfg, bbox25830, cache) -> GeoDataFrame`.

- [x] **Step 1: Write the failing tests**

```python
# añadir a pipeline/tests/test_adaptadores.py
import json
from setas_pipeline.malla import Malla

ZONA = box(300000, 4040000, 340000, 4060000)          # una sola tesela de 50 km
MALLA = Malla(x0=300000.0, y1=4060000.0, ancho=400, alto=200, celda=100.0)


def _fc(*feats):
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": p, "geometry": box(*b).__geo_interface__} for p, b in feats]}


def test_rediam_enp_lee_la_cache_de_siempre_y_normaliza(tmp_path):
    from setas_pipeline.adaptadores import rediam  # noqa: F401  (registra)
    cache = tmp_path / "enp"; cache.mkdir()
    (cache / "300000_4040000_340000_4060000_0.json").write_text(json.dumps(_fc(
        ({"CODIGOESPA": "ES1", "NOMBRE": " Sierra X ", "FIGURA": "Parque Natural "}, (301000, 4041000, 302000, 4042000)),
        ({"CODIGOESPA": "ES2", "NOMBRE": "Nieves", "FIGURA": "Parque Nacional"}, (303000, 4043000, 304000, 4044000)))))
    cfg = {"adaptador": "rediam_enp", "url": "http://no-se-usa/{xmin}", "tesela_m": 50000, "pagina": 10**9}
    g = A.cargar_capa("protegidos", {"protegidos": [cfg]}, A.Contexto(raw=tmp_path, zona=ZONA))
    assert list(g["codigo"]) == ["ES1", "ES2"] and g["nombre"].iloc[0] == "Sierra X" and g["figura"].iloc[0] == "Parque Natural"


def test_clasificar_restriccion_porn_con_tipos_de_la_region():
    from setas_pipeline.adaptadores.rediam import clasificar_restriccion as c
    t = ("A", "ARE", "R")
    assert c("A", "A. Zona de Reserva", t) == "zona_reserva"
    assert c("ARE", "Área de Reserva", t) == "zona_reserva"
    assert c("A", "A. Zona de Reserva. Ámbito marino", t) is None
    assert c("RN", "Reserva Natural", t) == "reserva_natural"
    assert c("B", "B. Zona de Regulación Especial", t) is None
    assert c("ZPP", "Zona de protección de la Reserva Natural", t) is None
    assert c("A", "A. Área de Regulación", t) is None
    assert c("A", "A. Zona de Reserva", ("ARE",)) is None


def test_rediam_porn_usa_la_cache_por_bounds_de_la_malla(tmp_path):
    from setas_pipeline.adaptadores import rediam  # noqa: F401
    xmin, ymin, xmax, ymax = (int(v) for v in MALLA.bounds)
    d = tmp_path / "zonificacion"; d.mkdir()
    (d / f"porn_vigentes_{xmin}_{ymin}_{xmax}_{ymax}.json").write_text(json.dumps(_fc(
        ({"Codigo_zona": "A", "Descripcion_zona": " A. Zona de Reserva ", "Nombre": " Grazalema "}, (301000, 4041000, 302000, 4042000)),
        ({"Codigo_zona": "B", "Descripcion_zona": "B. Regulación", "Nombre": "Otro"}, (303000, 4043000, 304000, 4044000)))))
    cfg = {"adaptador": "rediam_porn", "url": "http://no/{xmin}{ymin}{xmax}{ymax}", "tipos_zona_reserva": ["A", "ARE", "R"]}
    g = A.cargar_capa("restricciones", {"restricciones": [cfg]}, A.Contexto(raw=tmp_path, zona=ZONA, malla=MALLA))
    assert list(g["tipo"]) == ["zona_reserva"] and g["nombre"].iloc[0] == "Grazalema" and g["zona"].iloc[0] == "A. Zona de Reserva"


def test_protegidos_por_figura_saca_el_parque_nacional(tmp_path):
    from setas_pipeline.adaptadores import rediam, derivados  # noqa: F401
    cache = tmp_path / "enp"; cache.mkdir()
    (cache / "300000_4040000_340000_4060000_0.json").write_text(json.dumps(_fc(
        ({"CODIGOESPA": "ES1", "NOMBRE": "X", "FIGURA": "Parque Natural"}, (301000, 4041000, 302000, 4042000)),
        ({"CODIGOESPA": "ES2", "NOMBRE": " Nieves ", "FIGURA": "Parque Nacional "}, (303000, 4043000, 304000, 4044000)))))
    capas = {"protegidos": [{"adaptador": "rediam_enp", "url": "x", "tesela_m": 50000, "pagina": 10**9}],
             "restricciones": [{"adaptador": "protegidos_por_figura", "figura": "Parque Nacional",
                                "tipo": "parque_nacional", "zona": "Parque Nacional"}]}
    g = A.cargar_capa("restricciones", capas, A.Contexto(raw=tmp_path, zona=ZONA, capas=capas))
    assert list(g["tipo"]) == ["parque_nacional"] and list(g["nombre"]) == ["Nieves"] and list(g["zona"]) == ["Parque Nacional"]


def test_rediam_por_anio_respeta_la_ventana(tmp_path, monkeypatch):
    from setas_pipeline.adaptadores import rediam
    pedidas = []
    def falso(url, cache, timeout=180):
        pedidas.append(cache.name)
        return _fc(({}, (301000, 4041000, 302000, 4042000)))
    monkeypatch.setattr(rediam, "obtener", falso)
    cfg = {"adaptador": "rediam_por_anio", "url": "u{anio}{xmin}{ymin}{xmax}{ymax}", "desde": 2008, "hasta": 2025}
    g = A.cargar_capa("incendios", {"incendios": [cfg]}, A.Contexto(raw=tmp_path, zona=ZONA, malla=MALLA, desde_anio=2023))
    assert sorted(set(g["anio"])) == [2023, 2024, 2025] and set(g["fuente"]) == {"REDIAM"}
    assert pedidas[0] == "rediam_2023_300000_4040000_340000_4060000.json"


def test_effis_filtra_por_anio_y_toma_la_url_de_fuentes(tmp_path, monkeypatch):
    from setas_pipeline.adaptadores import effis
    def falso(url, cache, timeout=180):
        assert url.startswith("https://effis/") and cache.parent.name == "incendios"
        return {"type": "FeatureCollection", "features": [
            {"type": "Feature", "properties": {"FIREDATE": f"{y}-08-01"}, "geometry": box(-4.9, 36.5, -4.89, 36.51).__geo_interface__}
            for y in (2010, 2024)]}
    monkeypatch.setattr(effis, "obtener", falso)
    ctx = A.Contexto(raw=tmp_path, zona=ZONA, malla=MALLA, desde_anio=2016,
                     fuentes={"incendios": {"effis_url": "https://effis/{lat0},{lon0},{lat1},{lon1}"}})
    g = A.cargar_capa("incendios", {"incendios": [{"adaptador": "effis"}]}, ctx)
    assert list(g["anio"]) == [2024] and list(g["fuente"]) == ["EFFIS"] and g.crs == A.CRS


def test_solo_senderos_quita_carriles_cicloturistas():
    from shapely.geometry import LineString
    from setas_pipeline.adaptadores.rediam import solo_senderos
    g = gpd.GeoDataFrame({"modalidad": ["Sendero", "Carril cicloturista", None]},
                         geometry=[LineString([(0, 0), (1, 1)])] * 3, crs=A.CRS)
    assert len(solo_senderos(g)) == 2


def test_rediam_senderos_normaliza(tmp_path, monkeypatch):
    from shapely.geometry import LineString
    from setas_pipeline.adaptadores import rediam
    monkeypatch.setattr(rediam, "senderos_rediam", lambda cfg, bbox, cache: gpd.GeoDataFrame(
        {"nombre": [" sendero gr 7 ", "ruta x"], "modalidad": ["Sendero", "Sendero"], "t_dificult": ["Media", None],
         "fid_1": [1, 2]}, geometry=[LineString([(0, 0), (1, 1)])] * 2, crs=A.CRS))
    g = A.cargar_capa("senderos", {"senderos": [{"adaptador": "rediam_senderos", "url_patron": "x", "tesela_m": 50000}]},
                      A.Contexto(raw=tmp_path, zona=ZONA))
    assert list(g.columns) == ["ref", "name", "network", "osmc", "tipo", "fuente", "dificultad", "geometry"]
    assert list(g["name"]) == ["Sendero Gr 7", "Ruta X"] and set(g["fuente"]) == {"rediam"}
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && uv run pytest tests/test_adaptadores.py -v`
Expected: FAIL (`No module named 'setas_pipeline.adaptadores.rediam'`).

- [x] **Step 3: Implementation**

```python
# pipeline/setas_pipeline/adaptadores/rediam.py
"""Fuentes REDIAM (Junta de Andalucía): RENPA, zonificación PORN, perímetros de incendios por año y senderos.
Código movido de protegidos.py, exportar.py (restricciones), incendios.py (_rediam) y rutas.py sin cambios de
comportamiento: mismas URL, mismos nombres de caché."""
from __future__ import annotations
import json
from pathlib import Path
import geopandas as gpd
import pandas as pd
import requests
from . import CRS, Contexto, registrar, vacio
from ..descargas import descargar_teselas, obtener


@registrar("protegidos", "rediam_enp")
def rediam_enp(cfg: dict, ctx: Contexto) -> gpd.GeoDataFrame:
    g = descargar_teselas(cfg["url"], ctx.zona, cfg["tesela_m"], Path(ctx.raw) / cfg.get("cache", "enp"),
                          pagina=cfg.get("pagina", 10**9))
    if not len(g):
        return vacio("protegidos")
    return g.assign(codigo=g["CODIGOESPA"], nombre=g["NOMBRE"].str.strip(), figura=g["FIGURA"].str.strip())


def clasificar_restriccion(codigo_zona: str, descripcion: str, tipos_zona_reserva) -> str | None:
    """Zonificación PORN → tipo de restricción (o None si la zona no restringe la recolección)."""
    c, d = (codigo_zona or "").strip(), (descripcion or "").strip().lower()
    if "marino" in d:
        return None
    if c == "RN" or d == "reserva natural":
        return "reserva_natural"
    if c in tuple(tipos_zona_reserva) and "reserva" in d:
        return "zona_reserva"
    return None


@registrar("restricciones", "rediam_porn")
def rediam_porn(cfg: dict, ctx: Contexto) -> gpd.GeoDataFrame:
    xmin, ymin, xmax, ymax = (int(v) for v in ctx.malla.bounds)
    datos = obtener(cfg["url"].format(xmin=xmin, ymin=ymin, xmax=xmax, ymax=ymax),
                    Path(ctx.raw) / "zonificacion" / f"porn_vigentes_{xmin}_{ymin}_{xmax}_{ymax}.json", timeout=600)
    porn = gpd.GeoDataFrame.from_features(datos["features"], crs=CRS)
    if not len(porn):
        return vacio("restricciones")
    tipos = tuple(cfg["tipos_zona_reserva"])
    porn["tipo"] = [clasificar_restriccion(c, d, tipos) for c, d in zip(porn["Codigo_zona"], porn["Descripcion_zona"])]
    porn = porn[porn["tipo"].notna()]
    return porn.assign(nombre=porn["Nombre"].str.strip(), zona=porn["Descripcion_zona"].str.strip())


@registrar("incendios", "rediam_por_anio")
def rediam_por_anio(cfg: dict, ctx: Contexto) -> gpd.GeoDataFrame:
    xmin, ymin, xmax, ymax = (int(v) for v in ctx.malla.bounds)
    raw = Path(ctx.raw) / "incendios"
    raw.mkdir(parents=True, exist_ok=True)
    out = []
    for y in range(max(ctx.desde_anio, cfg["desde"]), cfg["hasta"] + 1):
        url = cfg["url"].format(anio=y, xmin=xmin, ymin=ymin, xmax=xmax, ymax=ymax)
        datos = obtener(url, raw / f"rediam_{y}_{xmin}_{ymin}_{xmax}_{ymax}.json", timeout=600)
        g = gpd.GeoDataFrame.from_features(datos.get("features", []), crs=CRS)
        if len(g):
            out.append(g.assign(anio=y, fuente="REDIAM")[["anio", "fuente", "geometry"]])
    return gpd.GeoDataFrame(pd.concat(out, ignore_index=True), crs=CRS) if out else vacio("incendios")


def solo_senderos(g):
    """Quita los equipamientos REDIAM que no son senderos a pie (modalidad «Carril cicloturista»)."""
    if "modalidad" not in g.columns:
        return g
    m = g["modalidad"].fillna("").astype(str).str.lower()
    return g[~m.str.contains("cicl")]


def senderos_rediam(cfg: dict, bbox25830, cache: Path, tesela_m: float = 50000):
    """Descarga por teselas (con caché) y deduplica por fid_1. Devuelve GeoDataFrame en EPSG:25830."""
    cache.mkdir(parents=True, exist_ok=True)
    xmin, ymin, xmax, ymax = bbox25830
    trozos = []
    x = xmin
    while x < xmax:
        y = ymin
        while y < ymax:
            caja = (int(x), int(y), int(min(x + tesela_m, xmax)), int(min(y + tesela_m, ymax)))
            ruta = cache / ("senderos_%d_%d_%d_%d.json" % caja)
            if not ruta.exists():
                url = cfg["url_patron"].format(xmin=caja[0], ymin=caja[1], xmax=caja[2], ymax=caja[3])
                r = requests.get(url, timeout=300)
                r.raise_for_status()
                json.loads(r.content)            # que sea GeoJSON válido antes de cachear
                ruta.write_bytes(r.content)
            g = gpd.read_file(ruta)
            if len(g):
                trozos.append(g.set_crs(CRS, allow_override=True))
            y += tesela_m
        x += tesela_m
    if not trozos:
        return gpd.GeoDataFrame(geometry=[], crs=CRS)
    g = gpd.GeoDataFrame(pd.concat(trozos, ignore_index=True), crs=CRS)
    return g.drop_duplicates(subset="fid_1")


@registrar("senderos", "rediam_senderos")
def rediam_senderos(cfg: dict, ctx: Contexto) -> gpd.GeoDataFrame:
    from ..rutas import clasificar_ref
    g = solo_senderos(senderos_rediam(cfg, ctx.zona.bounds, Path(ctx.raw) / "rediam_senderos", cfg["tesela_m"]))
    if not len(g):
        return vacio("senderos")
    return gpd.GeoDataFrame({
        "ref": None, "name": g["nombre"].str.strip().str.title(), "network": None, "osmc": None,
        "tipo": [clasificar_ref(None, n) for n in g["nombre"]], "fuente": "rediam",
        "dificultad": g.get("t_dificult")}, geometry=g.geometry, crs=CRS)
```

```python
# pipeline/setas_pipeline/adaptadores/effis.py
"""EFFIS (Copernicus): perímetros de áreas quemadas MODIS. Nacional/europeo; la URL vive en fuentes.yaml."""
from __future__ import annotations
from pathlib import Path
import geopandas as gpd
import numpy as np
from . import CRS, Contexto, registrar, vacio
from ..descargas import obtener


@registrar("incendios", "effis")
def effis(cfg: dict, ctx: Contexto) -> gpd.GeoDataFrame:
    from ..incendios import caja_wgs84
    lon0, lat0, lon1, lat1 = caja_wgs84(ctx.malla.bounds)
    caja = [np.floor(lat0 * 1000) / 1000, np.floor(lon0 * 1000) / 1000,
            np.ceil(lat1 * 1000) / 1000, np.ceil(lon1 * 1000) / 1000]       # redondeo hacia fuera
    caja = [round(float(v), 3) for v in caja]
    patron = cfg.get("url") or ctx.fuentes["incendios"]["effis_url"]
    raw = Path(ctx.raw) / "incendios"
    datos = obtener(patron.format(lat0=caja[0], lon0=caja[1], lat1=caja[2], lon1=caja[3]),
                    raw / f"effis_{'_'.join(map(str, caja))}.json", timeout=600)
    g = gpd.GeoDataFrame.from_features(datos.get("features", []), crs="EPSG:4326")
    if not len(g):
        return vacio("incendios")
    g["anio"] = g["FIREDATE"].astype(str).str[:4].astype(int)
    g = g[g["anio"] >= ctx.desde_anio]
    return g.assign(fuente="EFFIS")[["anio", "fuente", "geometry"]].to_crs(CRS)
```

```python
# pipeline/setas_pipeline/adaptadores/derivados.py
"""Capas derivadas de otras capas de la misma región."""
from __future__ import annotations
import geopandas as gpd
from . import Contexto, registrar


@registrar("restricciones", "protegidos_por_figura")
def protegidos_por_figura(cfg: dict, ctx: Contexto) -> gpd.GeoDataFrame:
    """Espacios de la capa `protegidos` con FIGURA = cfg.figura → restricción cfg.tipo (p. ej. Parque Nacional)."""
    from . import cargar_capa
    enp = cargar_capa("protegidos", ctx.capas, ctx)
    sel = enp[enp["figura"] == cfg["figura"]].drop_duplicates(subset="codigo")
    return sel.assign(tipo=cfg["tipo"], zona=cfg["zona"])
```

Al final de `adaptadores/__init__.py`:
```python
from . import rediam, effis, derivados  # noqa: E402,F401  (registran sus adaptadores)
```

Nota: en `test_rediam_por_anio_respeta_la_ventana` el monkeypatch de `obtener` debe aceptar `timeout` como keyword (ya lo hace).

- [x] **Step 4: Run tests**

Run: `cd pipeline && uv run pytest tests/test_adaptadores.py -v && uv run pytest -q`
Expected: PASS todo (los módulos viejos siguen intactos).

- [x] **Step 5: Commit**

```bash
git add pipeline/setas_pipeline/adaptadores pipeline/tests/test_adaptadores.py
git commit -m "feat(pipeline): adaptadores REDIAM, EFFIS y derivados con la lógica y la caché de siempre

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: OSM: osmium-tool, `pbf_zona` y `osm_relaciones`

**Files:**
- Create: `pipeline/setas_pipeline/adaptadores/osm.py`
- Modify: `pipeline/setas_pipeline/adaptadores/__init__.py` (import de `osm`)
- Test: `pipeline/tests/test_osm.py`

**Interfaces:**
- Consumes: `incendios.caja_wgs84` (import perezoso), `rutas.relaciones_osm`, `rutas.clasificar_ref` (perezosos).
- Produces:
  - `MARGEN_PBF_M = 5000`
  - `nombre_extracto(url: str) -> str` (`andalucia-latest.osm.pbf` → `andalucia.osm.pbf`)
  - `descargar_extracto(url: str, destino: Path) -> Path` (no descarga si existe)
  - `caja_recorte(bounds_malla, margen=MARGEN_PBF_M) -> tuple[float, float, float, float]` (lon0, lat0, lon1, lat1, 3 decimales hacia fuera)
  - `ordenes_osmium(entradas: list[Path], caja, destino: Path) -> list[list[str]]`
  - `pbf_zona(raw: Path, extractos: list[str], bounds_malla) -> Path` → `raw/zona.osm.pbf` (+ `raw/zona.osm.json` con la firma)
  - registrado `senderos/osm_relaciones` (usa `ctx.osm_pbf()`)

Decisión: recorte con `osmium extract -s smart` (vías completas y multipolígonos completos) sobre la malla + 5 km. `rutas` recorta a la zona + 2 km y `acceso`/`accesos` rasterizan solo dentro de la malla, así que lo que queda fuera del recorte nunca llegaba a las salidas: con un solo extracto las salidas de Marbella deben ser idénticas (lo prueba la Task 10). Con un solo extracto no hay `merge`.

- [x] **Step 1: Instalar osmium-tool**

Lee primero `/Users/alexanderkrupnov/Documents/Claude/Z.Funciones Base/README.md` (regla del workspace). Si no aparece osmium-tool:
```bash
brew install osmium-tool && osmium --version | head -1
```
Expected: `osmium version 1.x`. Anota en el informe que hay que añadir osmium-tool a `Z.Funciones Base/setup.sh` (fuera de este repo; no lo edites).

- [x] **Step 2: Write the failing tests**

```python
# pipeline/tests/test_osm.py
import shutil
from pathlib import Path
import pytest
from setas_pipeline.adaptadores import osm as O


def test_nombre_extracto():
    assert O.nombre_extracto("https://download.geofabrik.de/europe/spain/andalucia-latest.osm.pbf") == "andalucia.osm.pbf"


def test_caja_recorte_contiene_la_malla_con_margen():
    from pyproj import Transformer
    b = (250000.0, 4000000.0, 400000.0, 4150000.0)
    lon0, lat0, lon1, lat1 = O.caja_recorte(b)
    tr = Transformer.from_crs("EPSG:25830", "EPSG:4326", always_xy=True)
    for x in (b[0] - 5000, b[2] + 5000):
        for y in (b[1] - 5000, b[3] + 5000):
            lo, la = tr.transform(x, y)
            assert lon0 <= lo <= lon1 and lat0 <= la <= lat1


def test_ordenes_un_extracto_sin_merge(tmp_path):
    d = tmp_path / "zona.osm.pbf"
    o = O.ordenes_osmium([tmp_path / "osm/andalucia.osm.pbf"], (-5.5, 36.0, -4.0, 37.2), d)
    assert o == [["osmium", "extract", "-b", "-5.500,36.000,-4.000,37.200", "-s", "smart", "-f", "pbf",
                  "--overwrite", "-o", str(tmp_path / "zona.osm.pbf.part"), str(tmp_path / "osm/andalucia.osm.pbf")]]


def test_ordenes_varios_extractos_recorta_y_fusiona(tmp_path):
    d = tmp_path / "zona.osm.pbf"
    e = [tmp_path / "osm/valencia.osm.pbf", tmp_path / "osm/murcia.osm.pbf"]
    o = O.ordenes_osmium(e, (-1.5, 37.8, 0.2, 39.2), d)
    assert [x[1] for x in o] == ["extract", "extract", "merge"]
    assert o[2][-2:] == [str(tmp_path / "_recorte_0.osm.pbf"), str(tmp_path / "_recorte_1.osm.pbf")]
    assert str(tmp_path / "zona.osm.pbf.part") in o[2]


@pytest.mark.skipif(shutil.which("osmium") is None, reason="sin osmium-tool")
def test_pbf_zona_recorta_de_verdad(tmp_path):
    import osmium
    from osmium.osm.mutable import Node, Way
    from pyproj import Transformer
    src = tmp_path / "osm" / "andalucia.osm.pbf"
    src.parent.mkdir()
    w = osmium.SimpleWriter(str(src))
    w.add_node(Node(id=1, location=(-4.90, 36.50), tags={}))
    w.add_node(Node(id=2, location=(-4.89, 36.51), tags={}))
    w.add_node(Node(id=3, location=(-1.00, 39.00), tags={}))
    w.add_node(Node(id=4, location=(-1.01, 39.01), tags={}))
    w.add_way(Way(id=10, nodes=[1, 2], tags={"highway": "track"}))
    w.add_way(Way(id=11, nodes=[3, 4], tags={"highway": "track"}))
    w.close()
    tr = Transformer.from_crs("EPSG:4326", "EPSG:25830", always_xy=True)
    x, y = tr.transform(-4.895, 36.505)
    destino = O.pbf_zona(tmp_path, ["https://x/andalucia-latest.osm.pbf"], (x - 2000, y - 2000, x + 2000, y + 2000))
    vias = [o.id for o in osmium.FileProcessor(str(destino)) if o.is_way()]
    assert destino == tmp_path / "zona.osm.pbf" and vias == [10]
    mt = destino.stat().st_mtime
    assert O.pbf_zona(tmp_path, ["https://x/andalucia-latest.osm.pbf"], (x - 2000, y - 2000, x + 2000, y + 2000)) == destino
    assert destino.stat().st_mtime == mt                                  # misma firma: no se rehace
```
(Comprueba con la versión instalada de pyosmium que `osmium.osm.mutable.Node(location=(lon, lat))` y `SimpleWriter.add_node/add_way/close` existen; si cambia el nombre, ajusta el fixture, no la aserción.)

- [x] **Step 3: Run tests to verify they fail**

Run: `cd pipeline && uv run pytest tests/test_osm.py -v`
Expected: FAIL (`No module named 'setas_pipeline.adaptadores.osm'`).

- [x] **Step 4: Implementation**

```python
# pipeline/setas_pipeline/adaptadores/osm.py
"""OpenStreetMap: extractos de Geofabrik recortados a la zona y fusionados con osmium-tool (raw/zona.osm.pbf),
y relaciones de senderismo (adaptador `osm_relaciones`). accesos.py, acceso.py y rutas.py leen zona.osm.pbf."""
from __future__ import annotations
import json, math, shutil, subprocess
from pathlib import Path
import geopandas as gpd
import requests
from . import CRS, Contexto, registrar, vacio

MARGEN_PBF_M = 5000      # malla + 5 km (rutas usa zona + 2 km; acceso/accesos solo la malla)


def nombre_extracto(url: str) -> str:
    return url.rsplit("/", 1)[-1].replace("-latest", "")


def descargar_extracto(url: str, destino: Path) -> Path:
    destino = Path(destino)
    if destino.exists():
        return destino
    destino.parent.mkdir(parents=True, exist_ok=True)
    parcial = destino.with_name(destino.name + ".part")
    with requests.get(url, stream=True, timeout=600) as r:
        r.raise_for_status()
        with open(parcial, "wb") as f:
            for trozo in r.iter_content(1 << 20):
                f.write(trozo)
    parcial.rename(destino)
    return destino


def caja_recorte(bounds_malla, margen: float = MARGEN_PBF_M) -> tuple[float, float, float, float]:
    from ..incendios import caja_wgs84
    xmin, ymin, xmax, ymax = bounds_malla
    lon0, lat0, lon1, lat1 = caja_wgs84((xmin - margen, ymin - margen, xmax + margen, ymax + margen))
    return (math.floor(lon0 * 1000) / 1000, math.floor(lat0 * 1000) / 1000,
            math.ceil(lon1 * 1000) / 1000, math.ceil(lat1 * 1000) / 1000)


def ordenes_osmium(entradas: list[Path], caja, destino: Path) -> list[list[str]]:
    b = ",".join(f"{v:.3f}" for v in caja)
    parcial = destino.with_name(destino.name + ".part")
    if len(entradas) == 1:
        return [["osmium", "extract", "-b", b, "-s", "smart", "-f", "pbf", "--overwrite",
                 "-o", str(parcial), str(entradas[0])]]
    recortes = [destino.with_name(f"_recorte_{i}.osm.pbf") for i in range(len(entradas))]
    ordenes = [["osmium", "extract", "-b", b, "-s", "smart", "--overwrite", "-o", str(r), str(e)]
               for e, r in zip(entradas, recortes)]
    ordenes.append(["osmium", "merge", "-f", "pbf", "--overwrite", "-o", str(parcial), *map(str, recortes)])
    return ordenes


def pbf_zona(raw: Path, extractos: list[str], bounds_malla) -> Path:
    """raw/zona.osm.pbf: extractos (raw/osm/) recortados a la malla + margen y fusionados. Se rehace si cambia la
    caja o la lista de extractos (raw/zona.osm.json) o si un extracto es más nuevo."""
    raw = Path(raw)
    destino = raw / "zona.osm.pbf"
    marca = raw / "zona.osm.json"
    caja = caja_recorte(bounds_malla)
    firma = json.dumps({"caja": caja, "extractos": list(extractos)})
    entradas = [descargar_extracto(u, raw / "osm" / nombre_extracto(u)) for u in extractos]
    if (destino.exists() and marca.exists() and marca.read_text() == firma
            and destino.stat().st_mtime >= max(e.stat().st_mtime for e in entradas)):
        return destino
    if shutil.which("osmium") is None:
        raise RuntimeError("Falta osmium-tool (brew install osmium-tool): recorta y fusiona los extractos OSM")
    for orden in ordenes_osmium(entradas, caja, destino):
        subprocess.run(orden, check=True)
    destino.with_name(destino.name + ".part").rename(destino)
    for r in raw.glob("_recorte_*.osm.pbf"):
        r.unlink()
    marca.write_text(firma)
    return destino


@registrar("senderos", "osm_relaciones")
def osm_relaciones(cfg: dict, ctx: Contexto) -> gpd.GeoDataFrame:
    from ..rutas import relaciones_osm, clasificar_ref
    rels = relaciones_osm(ctx.osm_pbf())
    if not rels:
        return vacio("senderos")
    g = gpd.GeoDataFrame(rels, geometry="geometry", crs="EPSG:4326").to_crs(CRS)
    return gpd.GeoDataFrame({
        "ref": g["ref"], "name": g["name"], "network": g["network"], "osmc": g["osmc"],
        "tipo": [clasificar_ref(r, n) for r, n in zip(g["ref"], g["name"])],
        "fuente": "osm", "dificultad": None}, geometry=g.geometry, crs=CRS)
```

En `adaptadores/__init__.py` cambia la última línea a:
```python
from . import rediam, effis, derivados, osm  # noqa: E402,F401  (registran sus adaptadores)
```

- [x] **Step 5: Run tests**

Run: `cd pipeline && uv run pytest tests/test_osm.py -v && uv run pytest -q`
Expected: PASS (el test real de osmium no puede salir SKIPPED: si sale, falta el Step 1).

- [x] **Step 6: Commit**

```bash
git add pipeline/setas_pipeline/adaptadores pipeline/tests/test_osm.py
git commit -m "feat(pipeline): recorte y fusión de extractos OSM (osmium) y adaptador osm_relaciones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `Region`: `marbella.yaml`, carga, validación y perfiles por región

**Files:**
- Create: `pipeline/regiones/marbella.yaml`
- Create: `pipeline/setas_pipeline/region.py`
- Test: `pipeline/tests/test_region.py`

**Interfaces:**
- Consumes: `adaptadores.REGISTRO` (validación, import perezoso), `idoneidad.cargar_perfiles`.
- Produces:
  - `BASE`, `REGIONES = BASE/"regiones"`, `DATOS = BASE/"data"`, `FUENTES`, `ESPECIES`, `POR_DEFECTO = "marbella"`
  - `class RegionInvalida(ValueError)` con `.errores: list[str]`
  - `@dataclass(frozen=True) Region(id, nombre, etiqueta_origen, origen: tuple[float, float], zona: dict, osm_extractos: tuple[str, ...], capas: dict[str, list[dict]], especies_activas: tuple[str, ...], especies_sin_habitat: tuple[str, ...], overrides_especies: dict, legal: dict, atribuciones: dict, config: Path, datos: Path = DATOS)`
    - propiedades `raw = datos/id/"raw"`, `out = datos/id/"out"`, `app = out/"app"`, `respaldo = out/"respaldo"`, `comun = datos/"_comun"`
    - `perfiles(catalogo: dict, incluir_sin_habitat: bool = False) -> dict` (orden del catálogo, overrides fusionados)
  - `fusionar(base: dict, cambios: dict) -> dict` (fusión profunda, no muta)
  - `validar(d: dict, ruta: Path, catalogo: dict) -> list[str]`
  - `cargar_region(id: str = POR_DEFECTO, regiones: Path = REGIONES, datos: Path = DATOS, especies: Path = ESPECIES) -> Region`
  - `listar_regiones(regiones: Path = REGIONES) -> list[str]`
  - `argumento_region(ap: argparse.ArgumentParser) -> None` (añade `--region`, default `marbella`, choices = `listar_regiones()`)
  - `region_cli(argv=None) -> Region` (para los bloques `__main__`)

- [x] **Step 1: Write `pipeline/regiones/marbella.yaml`**

Contenido exacto (los textos se copian carácter a carácter de `exportar.py:427-438`, `rutas.py:141`, `exportar.py:353,423,488`, `respaldo.py:40,346`, `zona.py:11-12,17,44,57` y de los bloques de `fuentes.yaml` indicados; las claves de documentación —`nombre`, `licencia`, `verificacion`, `catalogo`…— se mueven tal cual desde `fuentes.yaml` dentro de cada entrada):

```yaml
# Región Marbella (≤2 h en coche). Valores que antes estaban fijos en el código y en fuentes.yaml
# (spec multi-región §3.1). Lo nacional y compartido (DEM, IGME, MFE, EFFIS, GBIF, acceso a pie) sigue en fuentes.yaml.
id: marbella
nombre: "Marbella"
etiqueta_origen: "de Marbella"
origen: {lon: -4.8825, lat: 36.5101}            # zona.py:11 (antes ORIGEN)

zona:                                           # zona.py: isócrona OSRM
  radio_m: 220000
  paso_m: 5000
  max_s: 7200
  max_snap_m: 5000
  cierre_m: 5000
  osrm: "https://router.project-osrm.org/table/v1/driving/"

osm_extractos:                                  # antes fuentes.yaml osm.url
  # Verificado: 307 → andalucia-AAMMDD.osm.pbf, 200, 195 MB (2026-10-12), cabecera OSMHeader correcta.
  # El extracto es de Andalucía: no incluye Gibraltar.
  - "https://download.geofabrik.de/europe/spain/andalucia-latest.osm.pbf"

capas:
  protegidos:
    - adaptador: rediam_enp
      # (mover aquí, tal cual, nombre/metodo/wfs_url/capa/formato/verificacion/otras_capas/licencia de fuentes.yaml → enp)
      url: "https://www.juntadeandalucia.es/medioambiente/mapwms/REDIAM_RENPA?service=WFS&version=2.0.0&request=GetFeature&typeNames=ms:eennpp&outputFormat=application/json;%20subtype=geojson&srsName=EPSG:25830&bbox={xmin},{ymin},{xmax},{ymax},urn:ogc:def:crs:EPSG::25830"
      tesela_m: 50000
      pagina: 1000000000            # sin paginar: pocos espacios por tesela (protegidos.py PAGINA_ENP)
      cache: enp
  restricciones:
    - adaptador: rediam_porn
      # (mover aquí nombre/metodo/catalogo/campos/verificacion/licencia de fuentes.yaml → zonificacion_porn)
      url: "https://www.juntadeandalucia.es/medioambiente/mapwms/REDIAM_zonificacion_PORN_vigentes?service=WFS&version=2.0.0&request=GetFeature&typeNames=ms:porn_vigentes&outputFormat=application/json;%20subtype=geojson&srsName=EPSG:25830&bbox={xmin},{ymin},{xmax},{ymax},urn:ogc:def:crs:EPSG::25830"
      tipos_zona_reserva: ["A", "ARE", "R"]   # Codigo_zona de los PORN con "Reserva" en la descripción
    - adaptador: protegidos_por_figura
      # fuentes.yaml zonificacion_porn.parque_nacional: "Parque Nacional Sierra de las Nieves: de la caché RENPA (enp, FIGURA = 'Parque Nacional')."
      figura: "Parque Nacional"
      tipo: parque_nacional
      zona: "Parque Nacional"
  incendios:
    - adaptador: rediam_por_anio
      # (mover aquí rediam_catalogo/rediam_licencia/rediam_verificacion de fuentes.yaml → incendios)
      url: "https://www.juntadeandalucia.es/medioambiente/mapwms/REDIAM_perimetros_incendios_forestales?service=WFS&version=2.0.0&request=GetFeature&typeNames=ms:perim_incendios_{anio}&outputFormat=application/json;%20subtype=geojson&srsName=EPSG:25830&bbox={xmin},{ymin},{xmax},{ymax},urn:ogc:def:crs:EPSG::25830"
      desde: 2008
      hasta: 2025
    - adaptador: effis                     # URL en fuentes.yaml → incendios.effis_url (nacional)
  senderos:
    - adaptador: osm_relaciones
    - adaptador: rediam_senderos
      # (mover aquí nombre/metodo/wfs_url/capa/verificacion/catalogo/licencia/atribucion de fuentes.yaml → rediam_senderos)
      url_patron: "https://www.juntadeandalucia.es/medioambiente/mapwms/REDIAM_Equipamientos_Uso_Publico_Andalucia?service=WFS&version=2.0.0&request=GetFeature&typeNames=ms:senderos&outputFormat=application/json;%20subtype=geojson&srsName=EPSG:25830&bbox={xmin},{ymin},{xmax},{ymax},urn:ogc:def:crs:EPSG::25830"
      tesela_m: 50000

especies:                                       # orden = el de especies.yaml (el manifest sigue el catálogo)
  activas: [boletus_aereus, boletus_aestivalis, boletus_edulis, boletus_pinophilus, amanita_caesarea,
            lactarius_deliciosus, lactarius_sanguifluus, cantharellus_cibarius, amanita_ponderosa,
            macrolepiota_procera, pleurotus_eryngii, terfezia_arenaria]
  sin_habitat: []
overrides_especies: {}

legal:
  aviso: &aviso "Málaga (Res. 23-09-2026, BOJA 196, vigente hasta 31-05-2027): autoconsumo ≤3 kg por persona y día sin autorización en montes públicos, salvo Zonas de Reserva; de día, sin rastrillos ni remover el mantillo. Fincas privadas: permiso del propietario. Cádiz: la última resolución encontrada es de 2019, sin confirmar su vigencia."
  tipos_restriccion:                            # exportar.py TEXTO_RESTRICCION (docs/investigacion/2026-10-14-factores-y-trucos.md §4)
    zona_reserva: "Zona de Reserva del espacio protegido: recolectar setas exige autorización previa."
    reserva_natural: "Reserva Natural: recolectar setas exige autorización previa."
    parque_nacional: "Parque Nacional Sierra de las Nieves: trátalo como recolección con autorización (Ley 9/2021); no recolectes sin permiso."
  ccaa:
    - id: AND
      nombre: "Andalucía"
      norma: "Resolución de 23-09-2026, DT de Sostenibilidad y Medio Ambiente de Málaga (BOJA 196, 08-10-2026)"
      cupo_kg_dia: 3
      texto: *aviso
      # PENDIENTE: cotejar con el PDF del BOJA y decidir con Alexander si pasa a true (el texto incluye Cádiz sin confirmar).
      verificado: false
      fuente_url: "https://www.juntadeandalucia.es/boja/2026/196/BOJA26-196-00003-13150-01_00344382.pdf"

atribuciones:
  idoneidad: "IGN CC BY 4.0 · © MITECO MFE · IGME · REDIAM CC BY 4.0 · © OpenStreetMap ODbL"   # exportar.py:353, respaldo.py:40
  protegidos: "REDIAM CC BY 4.0"                                                              # exportar.py:423
  restricciones: "REDIAM CC BY 4.0 (zonificación PORN, RENPA)"                                # exportar.py:488
  rutas: "© OpenStreetMap (ODbL); REDIAM, Junta de Andalucía (CC BY 4.0)"                     # rutas.py:141
  respaldo_protegidos: "Espacios protegidos: REDIAM (Junta de Andalucía), CC BY 4.0"          # respaldo.py:346

notas_fuentes:
  mfe_provincias: [Malaga, Cadiz, Sevilla, Granada, Cordoba]   # antes fuentes.yaml mfe.provincias (solo documentación)
```

Los comentarios `(mover aquí …)` se sustituyen por las claves reales copiadas de `fuentes.yaml` (líneas 148-157, 245-253, 224-230, 179-188). `fuentes.yaml` todavía no se toca (lo hace la Task 9, cuando ya nadie lee esas claves).

- [x] **Step 2: Write the failing tests**

```python
# pipeline/tests/test_region.py
import dataclasses, shutil
from pathlib import Path
import pytest
import yaml
from setas_pipeline import region as R

AVISO = ("Málaga (Res. 23-09-2026, BOJA 196, vigente hasta 31-05-2027): autoconsumo ≤3 kg por persona y día "
         "sin autorización en montes públicos, salvo Zonas de Reserva; de día, sin rastrillos ni remover el "
         "mantillo. Fincas privadas: permiso del propietario. Cádiz: la última resolución encontrada es de 2019, "
         "sin confirmar su vigencia.")
TEXTOS = {
    "zona_reserva": "Zona de Reserva del espacio protegido: recolectar setas exige autorización previa.",
    "reserva_natural": "Reserva Natural: recolectar setas exige autorización previa.",
    "parque_nacional": "Parque Nacional Sierra de las Nieves: trátalo como recolección con autorización "
                       "(Ley 9/2021); no recolectes sin permiso.",
}


def test_marbella_recoge_exactamente_los_valores_que_estaban_en_el_codigo():
    r = R.cargar_region("marbella")
    assert r.origen == (-4.8825, 36.5101) and r.nombre == "Marbella" and r.etiqueta_origen == "de Marbella"
    assert r.zona == {"radio_m": 220000, "paso_m": 5000, "max_s": 7200, "max_snap_m": 5000, "cierre_m": 5000,
                      "osrm": "https://router.project-osrm.org/table/v1/driving/"}
    assert r.osm_extractos == ("https://download.geofabrik.de/europe/spain/andalucia-latest.osm.pbf",)
    assert r.legal["aviso"] == AVISO and r.legal["tipos_restriccion"] == TEXTOS
    assert [c["id"] for c in r.legal["ccaa"]] == ["AND"] and r.legal["ccaa"][0]["texto"] == AVISO
    assert r.atribuciones["idoneidad"] == "IGN CC BY 4.0 · © MITECO MFE · IGME · REDIAM CC BY 4.0 · © OpenStreetMap ODbL"
    assert r.atribuciones["rutas"] == "© OpenStreetMap (ODbL); REDIAM, Junta de Andalucía (CC BY 4.0)"
    assert [f["adaptador"] for f in r.capas["incendios"]] == ["rediam_por_anio", "effis"]
    assert r.capas["restricciones"][0]["tipos_zona_reserva"] == ["A", "ARE", "R"]


def test_rutas_por_region():
    r = R.cargar_region("marbella", datos=Path("/x/data"))
    assert (r.raw, r.out, r.app, r.comun, r.respaldo) == (
        Path("/x/data/marbella/raw"), Path("/x/data/marbella/out"), Path("/x/data/marbella/out/app"),
        Path("/x/data/_comun"), Path("/x/data/marbella/out/respaldo"))


def test_marbella_activa_las_12_especies_en_el_orden_del_catalogo():
    from setas_pipeline.idoneidad import cargar_perfiles
    cat = cargar_perfiles(R.ESPECIES)
    r = R.cargar_region("marbella")
    assert list(r.perfiles(cat)) == list(cat) and r.especies_sin_habitat == ()


def test_fusionar_es_profunda_y_no_muta():
    base = {"tiempo": {"ventana_dias": [7, 18], "meses": [9, 10]}, "nombre": "X"}
    f = R.fusionar(base, {"tiempo": {"ventana_dias": [10, 25]}})
    assert f == {"tiempo": {"ventana_dias": [10, 25], "meses": [9, 10]}, "nombre": "X"}
    assert base["tiempo"]["ventana_dias"] == [7, 18]


def test_perfiles_con_overrides_y_sin_habitat():
    cat = {"a": {"nombre": "A", "tiempo": {"episodio_mm": 20, "meses": [10]}}, "b": {"nombre": "B"}, "c": {"nombre": "C"}}
    r = dataclasses.replace(R.cargar_region("marbella"), especies_activas=("c", "a"), especies_sin_habitat=("b",),
                            overrides_especies={"a": {"tiempo": {"episodio_mm": 30}}})
    assert list(r.perfiles(cat)) == ["a", "c"]                                   # orden del catálogo
    assert r.perfiles(cat)["a"]["tiempo"] == {"episodio_mm": 30, "meses": [10]}
    assert list(r.perfiles(cat, incluir_sin_habitat=True)) == ["a", "b", "c"]


def _copia(tmp_path, cambio):
    d = yaml.safe_load((R.REGIONES / "marbella.yaml").read_text())
    cambio(d)
    (tmp_path / "marbella.yaml").write_text(yaml.safe_dump(d, allow_unicode=True))
    return tmp_path


@pytest.mark.parametrize("cambio, mensaje", [
    (lambda d: d.pop("origen"), "origen"),
    (lambda d: d["zona"].pop("radio_m"), "zona.radio_m"),
    (lambda d: d.__setitem__("osm_extractos", []), "osm_extractos"),
    (lambda d: d["capas"]["incendios"].append({"adaptador": "inventado"}), "inventado"),
    (lambda d: d["capas"].__setitem__("montes", [{"adaptador": "x"}]), "montes"),
    (lambda d: d["especies"]["activas"].append("seta_inventada"), "seta_inventada"),
    (lambda d: d["especies"]["sin_habitat"].append("boletus_edulis"), "boletus_edulis"),
    (lambda d: d["overrides_especies"].__setitem__("otra", {}), "otra"),
    (lambda d: d["legal"]["ccaa"][0].pop("verificado"), "verificado"),
    (lambda d: d["atribuciones"].pop("rutas"), "rutas"),
    (lambda d: d.__setitem__("id", "otra_cosa"), "id"),
])
def test_validacion_rechaza_configs_rotas(tmp_path, cambio, mensaje):
    regiones = _copia(tmp_path, cambio)
    with pytest.raises(R.RegionInvalida, match=mensaje):
        R.cargar_region("marbella", regiones=regiones)


def test_listar_y_cli(tmp_path):
    assert "marbella" in R.listar_regiones()
    assert R.region_cli([]).id == "marbella"
    with pytest.raises(SystemExit):
        R.region_cli(["--region", "no_existe"])
```

- [x] **Step 3: Run tests to verify they fail**

Run: `cd pipeline && uv run pytest tests/test_region.py -v`
Expected: FAIL (`cannot import name 'region'`).

- [x] **Step 4: Implementation**

```python
# pipeline/setas_pipeline/region.py
"""Configuración por región (spec multi-región §3.1): pipeline/regiones/<id>.yaml → Region.

Rutas: pipeline/data/<region>/raw, pipeline/data/<region>/out (con out/app) y pipeline/data/_comun (GBIF).
"""
from __future__ import annotations
import argparse, copy
from dataclasses import dataclass
from pathlib import Path
import yaml

BASE = Path(__file__).resolve().parent.parent        # pipeline/
REGIONES = BASE / "regiones"
DATOS = BASE / "data"
FUENTES = BASE / "fuentes.yaml"
ESPECIES = BASE / "especies.yaml"
POR_DEFECTO = "marbella"

OBLIGATORIAS = ("id", "nombre", "etiqueta_origen", "origen", "zona", "osm_extractos", "capas", "especies",
                "legal", "atribuciones")
CLAVES_ZONA = ("radio_m", "paso_m", "max_s", "max_snap_m", "cierre_m", "osrm")
CLAVES_CCAA = ("id", "nombre", "norma", "cupo_kg_dia", "texto", "verificado", "fuente_url")
CLAVES_ATRIBUCION = ("idoneidad", "protegidos", "restricciones", "rutas", "respaldo_protegidos")


class RegionInvalida(ValueError):
    def __init__(self, ruta: Path, errores: list[str]):
        super().__init__(f"{ruta}: " + "; ".join(errores))
        self.errores = errores


def fusionar(base: dict, cambios: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in cambios.items():
        out[k] = fusionar(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else copy.deepcopy(v)
    return out


@dataclass(frozen=True)
class Region:
    id: str
    nombre: str
    etiqueta_origen: str
    origen: tuple[float, float]          # lon, lat
    zona: dict
    osm_extractos: tuple[str, ...]
    capas: dict
    especies_activas: tuple[str, ...]
    especies_sin_habitat: tuple[str, ...]
    overrides_especies: dict
    legal: dict
    atribuciones: dict
    config: Path
    datos: Path = DATOS

    @property
    def raw(self) -> Path:
        return self.datos / self.id / "raw"

    @property
    def out(self) -> Path:
        return self.datos / self.id / "out"

    @property
    def app(self) -> Path:
        return self.out / "app"

    @property
    def respaldo(self) -> Path:
        return self.out / "respaldo"

    @property
    def comun(self) -> Path:
        return self.datos / "_comun"

    def perfiles(self, catalogo: dict, incluir_sin_habitat: bool = False) -> dict:
        """Perfiles de la región en el orden del catálogo (especies.yaml), con overrides_especies fusionados."""
        validas = set(self.especies_activas) | (set(self.especies_sin_habitat) if incluir_sin_habitat else set())
        return {k: fusionar(v, self.overrides_especies.get(k, {})) for k, v in catalogo.items() if k in validas}


def validar(d: dict, ruta: Path, catalogo: dict) -> list[str]:
    from .adaptadores import REGISTRO
    e = [f"falta la clave '{k}'" for k in OBLIGATORIAS if k not in d]
    if e:
        return e
    if d["id"] != Path(ruta).stem:
        e.append(f"id '{d['id']}' no coincide con el archivo '{Path(ruta).stem}'")
    o = d["origen"]
    if not (isinstance(o, dict) and -180 <= o.get("lon", 999) <= 180 and -90 <= o.get("lat", 999) <= 90):
        e.append("origen debe ser {lon, lat} en grados")
    e += [f"falta zona.{k}" for k in CLAVES_ZONA if k not in d["zona"]]
    x = d["osm_extractos"]
    if not (isinstance(x, list) and x and all(isinstance(u, str) and u.startswith("https://") for u in x)):
        e.append("osm_extractos debe ser una lista no vacía de URL https")
    for tipo, fuentes in d["capas"].items():
        if tipo not in REGISTRO:
            e.append(f"capa desconocida '{tipo}' (conocidas: {sorted(REGISTRO)})")
            continue
        for f in fuentes:
            if f.get("adaptador") not in REGISTRO[tipo]:
                e.append(f"capas.{tipo}: adaptador desconocido '{f.get('adaptador')}' (conocidos: {sorted(REGISTRO[tipo])})")
    act, sin = d["especies"].get("activas", []), d["especies"].get("sin_habitat", [])
    if not act:
        e.append("especies.activas está vacía")
    for k in [*act, *sin]:
        if k not in catalogo:
            e.append(f"especie '{k}' no está en especies.yaml")
    for k in set(act) & set(sin):
        e.append(f"especie '{k}' a la vez en activas y sin_habitat")
    for k in d.get("overrides_especies", {}) or {}:
        if k not in set(act) | set(sin):
            e.append(f"overrides_especies.{k}: la especie no está en la región")
    legal = d["legal"]
    for k in ("aviso", "tipos_restriccion", "ccaa"):
        if k not in legal:
            e.append(f"falta legal.{k}")
    for i, c in enumerate(legal.get("ccaa") or []):
        e += [f"legal.ccaa[{i}]: falta {k}" for k in CLAVES_CCAA if k not in c]
        if "verificado" in c and not isinstance(c["verificado"], bool):
            e.append(f"legal.ccaa[{i}].verificado debe ser true/false")
    if not legal.get("ccaa"):
        e.append("legal.ccaa está vacía")
    e += [f"falta atribuciones.{k}" for k in CLAVES_ATRIBUCION if k not in d["atribuciones"]]
    return e


def cargar_region(id: str = POR_DEFECTO, regiones: Path = REGIONES, datos: Path = DATOS,
                  especies: Path = ESPECIES) -> Region:
    from .idoneidad import cargar_perfiles
    ruta = Path(regiones) / f"{id}.yaml"
    d = yaml.safe_load(ruta.read_text())
    errores = validar(d, ruta, cargar_perfiles(especies))
    if errores:
        raise RegionInvalida(ruta, errores)
    return Region(id=d["id"], nombre=d["nombre"], etiqueta_origen=d["etiqueta_origen"],
                  origen=(float(d["origen"]["lon"]), float(d["origen"]["lat"])), zona=d["zona"],
                  osm_extractos=tuple(d["osm_extractos"]), capas=d["capas"],
                  especies_activas=tuple(d["especies"]["activas"]),
                  especies_sin_habitat=tuple(d["especies"].get("sin_habitat") or ()),
                  overrides_especies=d.get("overrides_especies") or {}, legal=d["legal"],
                  atribuciones=d["atribuciones"], config=ruta, datos=Path(datos))


def listar_regiones(regiones: Path = REGIONES) -> list[str]:
    return sorted(p.stem for p in Path(regiones).glob("*.yaml"))


def argumento_region(ap: argparse.ArgumentParser) -> None:
    ap.add_argument("--region", default=POR_DEFECTO, choices=listar_regiones(),
                    help=f"región (pipeline/regiones/<id>.yaml); por defecto {POR_DEFECTO}")


def region_cli(argv=None) -> Region:
    ap = argparse.ArgumentParser()
    argumento_region(ap)
    return cargar_region(ap.parse_args(argv).region)
```

- [x] **Step 5: Run tests**

Run: `cd pipeline && uv run pytest tests/test_region.py -v && uv run pytest -q`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add pipeline/regiones/marbella.yaml pipeline/setas_pipeline/region.py pipeline/tests/test_region.py
git commit -m "feat(pipeline): config por región (marbella.yaml) con carga, validación y perfiles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Fase 1 por región: `zona`, `ejecutar --region`, módulos de capas y migración de datos del worktree

**Files:**
- Create: `pipeline/scripts/migrar_datos.sh`, `pipeline/tests/test_migrar_datos.py`
- Modify: `pipeline/setas_pipeline/zona.py`, `ejecutar.py`, `protegidos.py`, `accesos.py`, `incendios.py`, `vista_previa.py`, `vegetacion.py:138-142`, `suelo.py:41-45`
- Test: `pipeline/tests/test_zona.py`, `test_ejecutar.py`, `test_incendios.py`

**Interfaces:**
- Consumes: `Region`, `cargar_region`, `argumento_region`, `region_cli` (Task 7); `Contexto`, `cargar_capa` (Task 4); `pbf_zona` (Task 6); `tests/dorado/zona_puntos.json` (Task 2).
- Produces:
  - `zona.puntos_muestreo(origen, paso_m, radio_m)`, `zona.consultar_osrm(origen, destinos, url, lote=99, pausa_s=1.0)`, `zona.filtrar_alcanzables(puntos, resultados, max_s, max_snap_m)`, `zona.cerrar_zona(pol, distancia_m)`, `zona.construir_zona(region) -> Malla`
  - `ejecutar.pasos_de(region) -> dict[str, tuple]`, `ejecutar.ejecutar(pasos, forzar=False, region=None) -> list[str]`, CLI `--region`
  - `protegidos.construir_protegidos(malla, region)`
  - `accesos.construir_accesos(malla, out_dir, fuentes, pbf)` (sin descarga dentro)
  - `incendios.construir_fuego(malla, region, ref=None, mfe=None)` (`_rediam`/`_effis` desaparecen)
  - `vista_previa.vista_especie(out_dir, raw_dir, clave, perfil, zona, origen, etiqueta)`, `vista_previa.vistas(out_dir, raw_dir, perfiles, origen, etiqueta)`
  - `pipeline/scripts/migrar_datos.sh <pipeline/data>`

- [x] **Step 1: Write the failing tests**

```python
# pipeline/tests/test_zona.py — sustituye test_filtrar_alcanzables_… y añade el de la huella
def test_filtrar_alcanzables_descarta_lejos_y_mal_ajustados():
    pts = [(0, 0), (1, 1), (2, 2), (3, 3)]
    res = [{"duracion": 100, "snap_m": 10},
           {"duracion": 8000, "snap_m": 10},
           {"duracion": 100, "snap_m": 9000},
           {"duracion": None, "snap_m": None}]
    assert filtrar_alcanzables(pts, res, max_s=7200, max_snap_m=5000) == [(0, 0)]


def test_puntos_de_marbella_iguales_que_antes_del_refactor():
    import hashlib, json
    from pathlib import Path
    from setas_pipeline.region import cargar_region
    from setas_pipeline.zona import puntos_muestreo
    r = cargar_region("marbella")
    p = puntos_muestreo(r.origen, r.zona["paso_m"], r.zona["radio_m"])
    esperado = json.loads((Path(__file__).parent / "dorado" / "zona_puntos.json").read_text())
    assert len(p) == esperado["n"]
    assert hashlib.sha256(json.dumps(p).encode()).hexdigest() == esperado["sha256"]
```

```python
# pipeline/tests/test_ejecutar.py — sustituye _paso y añade
import os
from setas_pipeline import ejecutar
from setas_pipeline.region import cargar_region


def _paso(tmp_path, monkeypatch, t_in, t_out):
    ent, sal = tmp_path / "in.txt", tmp_path / "out.txt"
    ent.write_text("x"); sal.write_text("y")
    os.utime(ent, (t_in, t_in)); os.utime(sal, (t_out, t_out))
    llamadas = []
    monkeypatch.setattr(ejecutar, "pasos_de",
                        lambda region: {"p": (lambda: llamadas.append(1), lambda: [sal], lambda: [ent])})
    return llamadas

# (test_entrada_mas_nueva_reejecuta y test_entrada_mas_antigua_se_salta quedan igual)


def test_pasos_de_usan_las_rutas_de_la_region(tmp_path):
    import dataclasses
    r = dataclasses.replace(cargar_region("marbella"), datos=tmp_path)
    p = ejecutar.pasos_de(r)
    assert set(p) == {"zona", "relieve", "vegetacion", "suelo", "estructura", "cubierta", "incendios", "humedad",
                      "protegidos", "accesos", "idoneidad", "calibracion", "vista"}
    assert all(s.parent == r.out for s in p["relieve"][1]())
    assert r.config in p["relieve"][2]()              # cambiar la config de la región rehace los pasos
    assert len(p["idoneidad"][1]()) == 12


def test_cli_rechaza_region_desconocida():
    import pytest
    with pytest.raises(SystemExit):
        ejecutar.main(["zona", "--region", "no_existe"])
```

```python
# pipeline/tests/test_incendios.py — sustituye test_construir_fuego_sin_poligonos
def test_construir_fuego_sin_poligonos(tmp_path):
    import dataclasses
    from setas_pipeline import incendios as I
    from setas_pipeline.region import cargar_region
    r = dataclasses.replace(cargar_region("marbella"), datos=tmp_path, capas={})
    m = Malla(x0=300000.0, y1=4100000.0, ancho=4, alto=3, celda=100.0)
    a = I.construir_fuego(m, r, ref=2026)
    assert (a == SIN_FUEGO).all() and (r.out / "fuego.tif").exists() and (r.out / "fuego_resumen.json").exists()
```

```python
# pipeline/tests/test_migrar_datos.py
import subprocess
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "migrar_datos.sh"


def _plano(d: Path):
    (d / "raw" / "gbif").mkdir(parents=True)
    (d / "raw" / "gbif" / "x.json").write_text("[]")
    (d / "raw" / "andalucia.osm.pbf").write_bytes(b"pbf")
    (d / "raw" / "enp").mkdir()
    (d / "out" / "app").mkdir(parents=True)
    (d / "out" / "app" / "manifest.json").write_text("{}")


def test_migra_el_esquema_plano(tmp_path):
    _plano(tmp_path)
    r = subprocess.run(["bash", str(SCRIPT), str(tmp_path)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    assert (tmp_path / "marbella/raw/osm/andalucia.osm.pbf").read_bytes() == b"pbf"
    assert (tmp_path / "marbella/raw/enp").is_dir()
    assert (tmp_path / "_comun/gbif/x.json").exists()
    assert (tmp_path / "marbella/out/app/manifest.json").exists()
    assert not (tmp_path / "raw").exists() and not (tmp_path / "out").exists()


def test_es_idempotente(tmp_path):
    _plano(tmp_path)
    subprocess.run(["bash", str(SCRIPT), str(tmp_path)], check=True)
    r = subprocess.run(["bash", str(SCRIPT), str(tmp_path)], capture_output=True, text=True)
    assert r.returncode == 0 and "Ya migrado" in r.stdout + r.stderr


def test_falla_sin_datos(tmp_path):
    r = subprocess.run(["bash", str(SCRIPT), str(tmp_path)], capture_output=True, text=True)
    assert r.returncode == 1
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && uv run pytest tests/test_zona.py tests/test_ejecutar.py tests/test_incendios.py tests/test_migrar_datos.py -v`
Expected: FAIL (firmas viejas, `pasos_de` y script inexistentes).

- [x] **Step 3: `zona.py`**

```python
"""Zona de trabajo: puntos alcanzables en ≤ zona.max_s en coche desde el origen de la región (OSRM)."""
from __future__ import annotations
import json, time
from pathlib import Path
import requests
from pyproj import Transformer
from shapely.geometry import box, mapping, Polygon
from shapely.ops import unary_union
from .malla import Malla, CRS

_a_utm = Transformer.from_crs("EPSG:4326", CRS, always_xy=True)
_a_geo = Transformer.from_crs(CRS, "EPSG:4326", always_xy=True)


def puntos_muestreo(origen, paso_m, radio_m):
    cx, cy = _a_utm.transform(*origen)
    pts = []
    n = int(radio_m // paso_m)
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            x, y = cx + i * paso_m, cy + j * paso_m
            if (x - cx) ** 2 + (y - cy) ** 2 <= radio_m ** 2:
                pts.append(_a_geo.transform(x, y))
    return pts


def consultar_osrm(origen, destinos, url, lote=99, pausa_s=1.0):
    salida = []
    for k in range(0, len(destinos), lote):
        trozo = destinos[k:k + lote]
        coords = ";".join(f"{lon:.5f},{lat:.5f}" for lon, lat in [origen, *trozo])
        r = requests.get(url + coords, params={"sources": "0", "annotations": "duration"}, timeout=60)
        r.raise_for_status()
        j = r.json()
        dur = j["durations"][0][1:]
        snaps = [d.get("distance") for d in j["destinations"][1:]]
        salida += [{"duracion": d, "snap_m": s} for d, s in zip(dur, snaps)]
        time.sleep(pausa_s)  # uso razonable del servidor demo
    return salida


def filtrar_alcanzables(puntos, resultados, max_s, max_snap_m):
    return [p for p, r in zip(puntos, resultados)
            if r["duracion"] is not None and r["snap_m"] is not None
            and r["duracion"] <= max_s and r["snap_m"] <= max_snap_m]

# poligono_zona: sin cambios

def cerrar_zona(pol, distancia_m):
    """(docstring sin cambios)"""
    cerrado = pol.buffer(distancia_m, join_style="mitre").buffer(-distancia_m, join_style="mitre")
    partes = getattr(cerrado, "geoms", [cerrado])
    return unary_union([Polygon(p.exterior) for p in partes])


def construir_zona(region) -> Malla:
    z = region.zona
    pts = puntos_muestreo(region.origen, z["paso_m"], z["radio_m"])
    res = consultar_osrm(region.origen, pts, z["osrm"])
    pol = cerrar_zona(poligono_zona(filtrar_alcanzables(pts, res, z["max_s"], z["max_snap_m"]), paso_m=z["paso_m"]),
                      z["cierre_m"])
    out_dir = region.out
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "zona.geojson").write_text(json.dumps(
        {"type": "FeatureCollection", "crs": {"type": "name", "properties": {"name": CRS}},
         "features": [{"type": "Feature", "properties": {}, "geometry": mapping(pol)}]}))
    malla = Malla.desde_bounds(*pol.bounds)
    malla.guardar(out_dir / "malla.json")
    return malla
```
(`poligono_zona(puntos, paso_m=5000, crs_entrada=…)` se deja con su firma; `construir_zona` le pasa `paso_m` explícito.)

- [x] **Step 4: `ejecutar.py`**

```python
"""Orquestador de la Fase 1 por región.

    uv run python -m setas_pipeline.ejecutar idoneidad calibracion vista [--region marbella]
    uv run python -m setas_pipeline.ejecutar todo [--forzar] [--region marbella]

Cada paso se salta si todas sus salidas existen y no son más antiguas que sus entradas, salvo con --forzar.
Las entradas incluyen fuentes.yaml y la config de la región.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import yaml
from .malla import Malla
from .idoneidad import cargar_perfiles
from .region import Region, cargar_region, argumento_region, FUENTES, ESPECIES


def pasos_de(region: Region) -> dict:
    RAW, OUT = region.raw, region.out
    ZONA = OUT / "zona.geojson"

    def _malla():
        return Malla.cargar(OUT / "malla.json")

    def _perfiles():
        return region.perfiles(cargar_perfiles(ESPECIES))

    def _zona():
        from .zona import construir_zona
        construir_zona(region)

    def _relieve():
        from .relieve import construir_relieve
        construir_relieve(_malla(), RAW, OUT, FUENTES)

    def _vegetacion():
        from .vegetacion import construir_vegetacion
        construir_vegetacion(_malla(), RAW, OUT, FUENTES, ZONA)

    def _suelo():
        from .suelo import construir_suelo
        construir_suelo(_malla(), RAW, OUT, FUENTES, ZONA)

    def _estructura():
        from .vegetacion import construir_estructura
        construir_estructura(_malla(), RAW, OUT, FUENTES, ZONA)

    def _cubierta():
        from .vegetacion import construir_cubierta
        construir_cubierta(_malla(), RAW, OUT, FUENTES, ZONA)

    def _incendios():
        from .incendios import construir_fuego
        from .vegetacion import _mfe_arbolado
        from .descargas import cargar_zona
        construir_fuego(_malla(), region, mfe=_mfe_arbolado(RAW, FUENTES, cargar_zona(ZONA)))

    def _humedad():
        from .hidrologia import construir_humedad
        construir_humedad(_malla(), RAW, OUT)

    def _protegidos():
        from .protegidos import construir_protegidos
        construir_protegidos(_malla(), region)

    def _accesos():
        from .accesos import construir_accesos
        from .adaptadores.osm import pbf_zona
        RAW.mkdir(parents=True, exist_ok=True)
        malla = _malla()
        construir_accesos(malla, OUT, FUENTES, pbf_zona(RAW, list(region.osm_extractos), malla.bounds))

    def _idoneidad():
        from .idoneidad import construir_idoneidad
        construir_idoneidad(OUT, _perfiles())

    def _calibracion():
        from .calibracion import informe
        informe(OUT, _perfiles(), region.comun)             # GBIF compartido: data/_comun/gbif

    def _vista():
        from .vista_previa import vistas
        vistas(OUT, region.comun, _perfiles(), region.origen, region.nombre)

    def _por_especie(patron: str):
        return lambda: [OUT / patron.format(k) for k in _perfiles()]

    def _geo():
        return [OUT / "malla.json", FUENTES, region.config]

    def _entradas_idoneidad():
        from .idoneidad import CAPAS_V2
        return [ESPECIES, region.config, *(OUT / f"{n}.tif" for n in ("arbol", "altitud", "orientacion",
                                                                       "pendiente", "suelo", *CAPAS_V2))]

    # paso → (función, salidas, entradas): se rehace si falta una salida o alguna es más antigua que una entrada
    return {
        "zona": (_zona, lambda: [ZONA, OUT / "malla.json"], lambda: []),
        "relieve": (_relieve, lambda: [OUT / f"{n}.tif" for n in ("altitud", "pendiente", "orientacion")], _geo),
        "vegetacion": (_vegetacion, lambda: [OUT / "arbol.tif"], _geo),
        "suelo": (_suelo, lambda: [OUT / "suelo.tif"], _geo),
        "estructura": (_estructura, lambda: [OUT / "fcc.tif", OUT / "estado.tif"], _geo),
        "cubierta": (_cubierta, lambda: [OUT / "cubierta.tif", OUT / "dist_matorral.tif"], _geo),
        "incendios": (_incendios, lambda: [OUT / "fuego.tif"], _geo),
        "humedad": (_humedad, lambda: [OUT / f"{n}.tif" for n in ("twi", "dist_cauce", "humedad")],
                    lambda: [*_geo(), OUT / "altitud.tif"]),
        "protegidos": (_protegidos, lambda: [OUT / "protegido.tif"], _geo),
        "accesos": (_accesos, lambda: [OUT / "distancia_acceso.tif"], _geo),
        "idoneidad": (_idoneidad, _por_especie("idoneidad_{}.tif"), _entradas_idoneidad),
        "calibracion": (_calibracion, lambda: [OUT / "calibracion.md"], _por_especie("idoneidad_{}.tif")),
        "vista": (_vista, _por_especie("vista_{}.png"), _por_especie("idoneidad_{}.tif")),
    }


NOMBRES = ("zona", "relieve", "vegetacion", "suelo", "estructura", "cubierta", "incendios", "humedad",
           "protegidos", "accesos", "idoneidad", "calibracion", "vista")


def _al_dia(salidas: list[Path], entradas: list[Path]) -> bool:
    # (cuerpo sin cambios)


def ejecutar(pasos: list[str], forzar: bool = False, region: Region | None = None) -> list[str]:
    """Ejecuta los pasos en orden; devuelve los que se ejecutaron de verdad."""
    region = region or cargar_region()
    tabla = pasos_de(region)
    if "todo" in pasos:
        pasos = list(tabla)
    hechos = []
    for p in pasos:
        funcion, salidas, entradas = tabla[p]
        if not forzar and _al_dia(salidas(), entradas()):
            print(f"[{region.id}/{p}] salidas al día, se salta (usa --forzar para rehacer)")
            continue
        print(f"[{region.id}/{p}] ejecutando…", flush=True)
        funcion()
        hechos.append(p)
    return hechos


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pasos", nargs="+", choices=[*NOMBRES, "todo"])
    ap.add_argument("--forzar", action="store_true", help="rehacer aunque la salida exista")
    argumento_region(ap)
    a = ap.parse_args(argv)
    ejecutar(a.pasos, a.forzar, cargar_region(a.region))


if __name__ == "__main__":
    main()
```
Ojo: el test `test_pasos_de_usan_las_rutas_de_la_region` comprueba que `set(p) == set(NOMBRES)`; mantén los dos en el mismo orden. Quita el `import yaml` si no se usa.

- [x] **Step 5: `protegidos.py`, `accesos.py`, `incendios.py`, `vista_previa.py`, `__main__` de `vegetacion.py`/`suelo.py`**

`protegidos.py` (sustituye `construir_protegidos` y el `__main__`; quita `TESELA_ENP`, `PAGINA_ENP`, `import yaml` y `descargar_teselas`):
```python
def construir_protegidos(malla: Malla, region):
    from .adaptadores import Contexto, cargar_capa
    zona = cargar_zona(region.out / "zona.geojson")
    gdf = cargar_capa("protegidos", region.capas, Contexto(raw=region.raw, zona=zona, malla=malla, capas=region.capas))
    a = rasterizar_protegidos(gdf, zona, malla)
    escribir_tif(malla, region.out / "protegido.tif", a, NODATA)
    return a


if __name__ == "__main__":
    from .region import region_cli
    r = region_cli()
    construir_protegidos(Malla.cargar(r.out / "malla.json"), r)
```
Docstring del módulo: «Espacios protegidos (capa `protegidos` de la región) → 1 dentro de un espacio, 0 fuera, 255 (NODATA) fuera de la zona isócrona…».

`accesos.py` (sustituye `construir_accesos`; quita `import requests`):
```python
def construir_accesos(malla: Malla, out_dir: Path, fuentes: Path, pbf: Path):
    cfg = yaml.safe_load(Path(fuentes).read_text())["osm"]
    vias = extraer_vias(pbf, cfg["tags_acceso"]["highway"]).to_crs(CRS)
    if vias.empty:
        raise ValueError("0 vías extraídas: revisa osm.tags_acceso en fuentes.yaml o el pbf")
    mascara = rasterize(((g, 1) for g in vias.geometry), out_shape=(malla.alto, malla.ancho),
                        transform=malla.transform, fill=0, all_touched=True, dtype="uint8").astype(bool)
    escribir_tif(malla, Path(out_dir) / "distancia_acceso.tif", distancia_a_lineas(mascara, malla.celda), NODATA_F)
```

`incendios.py`: borra `_rediam` y `_effis` (ya viven en los adaptadores; `caja_wgs84` se queda aquí porque la usan `effis` y `osm`). Docstring: «Fuentes: la capa `incendios` de la región (adaptadores) más el MFE…». Sustituye `construir_fuego`:
```python
def construir_fuego(malla: Malla, region, ref: int | None = None, mfe: gpd.GeoDataFrame | None = None):
    from .adaptadores import Contexto, cargar_capa
    from .region import FUENTES
    ref = ref or date.today().year
    desde = ref - VENTANA_ANIOS
    ctx = Contexto(raw=region.raw, zona=None, malla=malla, fuentes=yaml.safe_load(Path(FUENTES).read_text()),
                   capas=region.capas, desde_anio=desde)
    trozos = []
    capa = cargar_capa("incendios", region.capas, ctx)
    if len(capa):
        trozos.append(capa)
    if mfe is not None and len(mfe):
        from .vegetacion import anio_incendio_mfe
        m = mfe.assign(anio=anio_incendio_mfe(mfe).astype(int), fuente="MFE")
        trozos.append(m[m["anio"] >= desde][["anio", "fuente", "geometry"]])
    if trozos:
        gdf = gpd.GeoDataFrame(pd.concat(trozos, ignore_index=True), crs=CRS)
    else:
        print("  WARNING: ningún perímetro de incendio en la ventana; fuego.tif queda sin incendios")
        gdf = gpd.GeoDataFrame({"anio": [], "fuente": []}, geometry=[], crs=CRS)
    a = anios_desde(rasterizar_anios(gdf, malla), ref)
    out_dir = region.out
    escribir_tif(malla, out_dir / "fuego.tif", a, None)
    resumen = gdf.groupby(["fuente", "anio"]).size().to_dict()
    (out_dir / "fuego_resumen.json").write_text(json.dumps(
        {"ref": ref, "poligonos": {f"{k[0]} {k[1]}": int(v) for k, v in resumen.items()},
         "celdas_0_2": int(((a <= 2)).sum()), "celdas_3_5": int(((a >= 3) & (a <= 5)).sum())}, indent=1))
    return a
```
Quita `from .descargas import obtener` si queda sin uso.

`vista_previa.py`: quita `from .zona import ORIGEN`; firmas nuevas:
```python
"""Vista previa por especie: idoneidad (0 transparente), contorno de la zona, origen de la región y GBIF."""

def vista_especie(out_dir: Path, raw_dir: Path, clave: str, perfil: dict, zona, origen, etiqueta: str) -> Path:
    ...                                     # cuerpo igual, salvo:
    mx, my = a_utm([origen])[0]
    ax.plot(mx, my, marker="*", color="crimson", ms=14, mec="k", label=etiqueta)
    kept, _, _ = filtrar_incertidumbre(ocurrencias(perfil, zona, raw_dir))
    ...


def vistas(out_dir: Path, raw_dir: Path, perfiles: dict, origen, etiqueta: str) -> list[Path]:
    zona = cargar_zona(Path(out_dir) / "zona.geojson")
    return [vista_especie(out_dir, raw_dir, k, p, zona, origen, etiqueta) for k, p in perfiles.items()]
```

`vegetacion.py:138-142` y `suelo.py:41-45` (`__main__`):
```python
if __name__ == "__main__":
    from .region import region_cli, FUENTES
    r = region_cli()
    construir_vegetacion(Malla.cargar(r.out / "malla.json"), r.raw, r.out, FUENTES, r.out / "zona.geojson")
```
(en `suelo.py`, `construir_suelo(...)` con los mismos argumentos).

- [x] **Step 6: `pipeline/scripts/migrar_datos.sh`**

```bash
#!/usr/bin/env bash
# Migra pipeline/data del esquema plano (raw/, out/) al multi-región (spec multi-región §3.2):
#   raw/                 → marbella/raw/
#   raw/andalucia.osm.pbf → marbella/raw/osm/andalucia.osm.pbf   (extractos OSM por región)
#   raw/gbif/            → _comun/gbif/                           (clave = hash del WKT de la zona)
#   out/                 → marbella/out/
# Idempotente: si ya existe <data>/marbella, no hace nada.
#   pipeline/scripts/migrar_datos.sh /ruta/a/pipeline/data
set -euo pipefail
D="${1:?uso: migrar_datos.sh <pipeline/data>}"
cd "$D"
if [[ -d marbella ]]; then echo "Ya migrado: existe $D/marbella"; exit 0; fi
[[ -d raw && -d out ]] || { echo "No hay raw/ y out/ en $D" >&2; exit 1; }
mkdir marbella
mv raw marbella/raw
mv out marbella/out
mkdir -p marbella/raw/osm _comun
[[ -f marbella/raw/andalucia.osm.pbf ]] && mv marbella/raw/andalucia.osm.pbf marbella/raw/osm/andalucia.osm.pbf
[[ -d marbella/raw/gbif ]] && mv marbella/raw/gbif _comun/gbif
echo "Migrado $D → marbella/{raw,out}, _comun/gbif, marbella/raw/osm/"
```
`chmod +x pipeline/scripts/migrar_datos.sh`.

- [x] **Step 7: Arreglar el resto de llamadas y correr la suite**

```bash
cd pipeline
grep -rn "construir_fuego\|construir_protegidos\|construir_accesos\|vistas(\|vista_especie(\|puntos_muestreo(\|filtrar_alcanzables(\|cerrar_zona(\|from .zona import ORIGEN\|ejecutar.PASOS" setas_pipeline tests
uv run pytest -q
```
Expected: cada llamada usa la firma nueva; `pytest` en verde. (`exportar.py`, `acceso.py`, `rutas.py`, `sitios.py`, `respaldo.py` aún usan `data/out`: se cambian en la Task 9. Sus tests no tocan disco real.)

- [x] **Step 8: Migrar los datos clonados del worktree y comprobar tres capas sin red**

```bash
cd /Users/alexanderkrupnov/Documents/Claude/setas-alicante/pipeline
scripts/migrar_datos.sh "$PWD/data" && ls data data/marbella data/marbella/raw/osm data/_comun
export HTTP_PROXY=http://127.0.0.1:9 HTTPS_PROXY=http://127.0.0.1:9 http_proxy=http://127.0.0.1:9 https_proxy=http://127.0.0.1:9 NO_PROXY= no_proxy=
T0=$(date +%s)
uv run python -m setas_pipeline.ejecutar protegidos incendios accesos --forzar --region marbella
uv run python -m setas_pipeline.dorado comparar --out data/marbella/out --dorado tests/dorado/marbella.json \
  --solo protegido.tif fuego.tif distancia_acceso.tif
```
Expected: se crea `data/marbella/raw/zona.osm.pbf` (osmium) y `OK: … 0 diferencias` (el `comparar` con `--solo` sin `--desde`). Si `distancia_acceso.tif` difiere, el recorte OSM no es equivalente: usa superpowers:systematic-debugging (compara `extraer_vias` sobre `osm/andalucia.osm.pbf` y sobre `zona.osm.pbf` limitadas a la malla) antes de tocar el margen o la estrategia.

- [x] **Step 9: Commit**

```bash
git add pipeline/setas_pipeline pipeline/scripts/migrar_datos.sh pipeline/tests
git commit -m "feat(pipeline): fase 1 por región (--region, data/<region>/, adaptadores, osmium) y script de migración

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Exportación por región: `exportar`/`acceso`/`sitios`/`rutas`/`respaldo`, manifest y `exportar regiones`

**Files:**
- Modify: `pipeline/setas_pipeline/exportar.py`, `acceso.py`, `sitios.py`, `rutas.py`, `respaldo.py`, `pipeline/fuentes.yaml`
- Test: `pipeline/tests/test_exportar.py`, `test_rutas.py`, `test_respaldo.py` (si alguna aserción usa la atribución), `test_acceso.py` (llamadas con rutas por defecto), nuevo `pipeline/tests/test_sin_valores_fijos.py`

**Interfaces:**
- Consumes: `Region`, `cargar_region`, `argumento_region`, `listar_regiones`, `REGIONES`, `DATOS`, `ESPECIES`, `FUENTES`; `Contexto`, `cargar_capa`; `pbf_zona`.
- Produces:
  - `exportar._contexto(region, zona=None) -> Contexto` (zona por defecto: `cargar_zona(region.out/"zona.geojson")`)
  - `exportar._bbox_zona(region, margen=MARGEN_M)`, `exportar._calibracion(region)`, `exportar.especies(region) -> list[dict]` (cada una con `sin_habitat: bool`), `exportar.especies_activas(region)`
  - `exportar.exportar_rasters(region, malla, out=None)`, `exportar_curvas(region, malla, out=None)`, `exportar_protegidos(region, out=None)`, `restricciones_gdf(region)`, `exportar_restricciones(region, out=None)`, `exportar_base(region, out=None, maxzoom=…, build=None)`, `exportar_meteo(region, out=None)`, `escribir_manifest(region, out=None)`, `escribir_regiones(datos=DATOS, regiones=REGIONES) -> list[dict]`
  - manifest: `region: {id, nombre, origen: [lon, lat], etiqueta_origen}`, `legal: {ccaa: [...]}`, `especies[].sin_habitat`, `restricciones.tipos/aviso` desde `region.legal`
  - `acceso.calcular(region, pbf=None, out=None, verbose=True)`, `acceso.dem_50m(raw, malla)`, `acceso.anadir_altitud(region, out=None)`, `acceso.leer_app(out)`, `acceso.consultar(lat, lon, out)`, CLI `--region`
  - `sitios.calcular(region, out=None, verbose=True)`, CLI `--region`
  - `rutas.construir(region, out=None)`; `rutas.clasificar_ref` y `rutas.relaciones_osm` se quedan; `solo_senderos`/`senderos_rediam` viven en `adaptadores.rediam`
  - `respaldo.exportar_respaldo(region, malla=None, out=None)`, `exportar_rasters_respaldo(region, malla, out, …)`, `exportar_zonas(region, malla, out)`, `escribir_readme(region, out)`, `MBTiles(ruta, nombre, descripcion, atribucion="")`, `geojson_zonas(zw, especie, nombre, atribucion="")`, `kml_zonas(zw, especie, nombre, atribucion="")`
  - `pipeline/data/regiones.json`: `[{id, nombre, origen, bbox, total_bytes, generado}]`

- [x] **Step 1: Write the failing tests**

```python
# pipeline/tests/test_exportar.py — sustituye test_especies_exporta_reglas_de_tiempo (primera línea),
# test_clasificar_restriccion_porn y test_especies_lleva_fiabilidad; añade los de manifest y regiones
import dataclasses, json
from setas_pipeline.region import cargar_region


def _region(tmp_path, **kw):
    return dataclasses.replace(cargar_region("marbella"), datos=tmp_path, **kw)


def test_especies_exporta_reglas_de_tiempo():
    from setas_pipeline.exportar import especies
    es = {e["id"]: e for e in especies(cargar_region("marbella"))}
    # … resto del test sin cambios


def test_especies_lleva_fiabilidad(tmp_path):
    import setas_pipeline.exportar as ex
    r = _region(tmp_path)
    r.out.mkdir(parents=True)
    (r.out / "calibracion.json").write_text(json.dumps(
        {"pleurotus_eryngii": {"n": 13, "lift_ajuste": 1.53, "lift_validacion": 0.93, "pliegues": 4}}))
    es = {e["id"]: e for e in ex.especies(r)}
    assert es["pleurotus_eryngii"]["fiabilidad"] == "baja"
    assert es["boletus_aereus"]["fiabilidad"] == "sin_validar"
    assert all(e["fiabilidad"] in {"buena", "media", "baja", "sin_validar"} for e in es.values())


def test_especies_sin_habitat_marcadas_y_fuera_de_activas(tmp_path):
    import setas_pipeline.exportar as ex
    activas = tuple(k for k in cargar_region("marbella").especies_activas if k != "boletus_edulis")
    r = _region(tmp_path, especies_activas=activas, especies_sin_habitat=("boletus_edulis",))
    es = ex.especies(r)
    assert [e["id"] for e in es] == list(cargar_region("marbella").especies_activas)     # orden del catálogo
    assert {e["id"]: e["sin_habitat"] for e in es}["boletus_edulis"] is True
    assert "boletus_edulis" not in [e["id"] for e in ex.especies_activas(r)]


def test_especies_aplica_overrides_de_la_region(tmp_path):
    import setas_pipeline.exportar as ex
    r = _region(tmp_path, overrides_especies={"boletus_aereus": {"tiempo": {"episodio_mm": 40}}})
    t = {e["id"]: e for e in ex.especies(r)}["boletus_aereus"]["tiempo"]
    assert t["episodio_mm"] == 40 and t["ventana_dias"] == [8, 20]


def test_manifest_lleva_region_legal_y_sin_habitat(tmp_path):
    import setas_pipeline.exportar as ex
    r = _region(tmp_path)
    r.app.mkdir(parents=True)
    (r.out / "zona.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": [{
        "type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": [[
            [-4.9, 36.5], [-4.8, 36.5], [-4.8, 36.6], [-4.9, 36.6], [-4.9, 36.5]]]}}]}))
    m = ex.escribir_manifest(r)
    assert m["region"] == {"id": "marbella", "nombre": "Marbella", "origen": [-4.8825, 36.5101],
                           "etiqueta_origen": "de Marbella"}
    assert [c["id"] for c in m["legal"]["ccaa"]] == ["AND"] and m["legal"]["ccaa"][0]["verificado"] is False
    assert all(e["sin_habitat"] is False for e in m["especies"])
    assert json.loads((r.app / "manifest.json").read_text())["region"]["id"] == "marbella"


def test_regiones_json_indexa_las_que_tienen_manifest(tmp_path):
    import shutil
    import setas_pipeline.exportar as ex
    from setas_pipeline.region import REGIONES
    regs = tmp_path / "regiones"; regs.mkdir()
    shutil.copy(REGIONES / "marbella.yaml", regs / "marbella.yaml")
    datos = tmp_path / "data"
    (datos / "marbella/out/app").mkdir(parents=True)
    (datos / "marbella/out/app/manifest.json").write_text(json.dumps(
        {"bbox": [-5.9, 36.0, -3.8, 37.5], "total_bytes": 123, "generado": "2026-10-15T10:00:00+00:00"}))
    lista = ex.escribir_regiones(datos, regs)
    assert lista == [{"id": "marbella", "nombre": "Marbella", "origen": [-4.8825, 36.5101],
                      "bbox": [-5.9, 36.0, -3.8, 37.5], "total_bytes": 123, "generado": "2026-10-15T10:00:00+00:00"}]
    assert json.loads((datos / "regiones.json").read_text()) == lista
```
Borra `test_clasificar_restriccion_porn` de `test_exportar.py` (ya está en `test_adaptadores.py`).

```python
# pipeline/tests/test_rutas.py: cambia el import de solo_senderos
#   from setas_pipeline.adaptadores.rediam import solo_senderos
```

```python
# pipeline/tests/test_sin_valores_fijos.py
"""Ningún valor de Marbella/Andalucía ni ruta plana de datos queda en el código (van en regiones/<id>.yaml)."""
from pathlib import Path
import pytest

CODIGO = Path(__file__).resolve().parent.parent / "setas_pipeline"
PROHIBIDO = ["-4.8825", "andalucia.osm.pbf", "data/out", "data/raw", "BOJA", "Sierra de las Nieves",
             "juntadeandalucia.es", "router.project-osrm.org", '"Marbella"']


@pytest.mark.parametrize("texto", PROHIBIDO)
def test_sin_valores_fijos(texto):
    hallados = [f"{p.relative_to(CODIGO)}:{i}" for p in CODIGO.rglob("*.py")
                for i, linea in enumerate(p.read_text().splitlines(), 1) if texto in linea]
    assert not hallados, f"{texto!r} sigue en el código: {hallados}"


def test_fuentes_yaml_sin_lo_regional():
    import yaml
    f = yaml.safe_load((CODIGO.parent / "fuentes.yaml").read_text())
    assert not {"enp", "rediam_senderos", "zonificacion_porn"} & set(f)
    assert "url" not in f["osm"] and "provincias" not in f["mfe"]
    assert not [k for k in f["incendios"] if k.startswith("rediam")]
    assert "effis_url" in f["incendios"]
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd pipeline && uv run pytest tests/test_exportar.py tests/test_rutas.py tests/test_sin_valores_fijos.py -v`
Expected: FAIL (firmas viejas, `escribir_regiones` inexistente, valores fijos presentes).

- [x] **Step 3: `exportar.py`**

Cabecera y constantes:
```python
"""Fase 2: genera los datos de la app (PMTiles + manifest.json) de una región a partir de data/<region>/out/*.tif.

    uv run python -m setas_pipeline.exportar capas      [--region marbella]   # idoneidad×umbral, sombreado, curvas, protegidos
    uv run python -m setas_pipeline.exportar base       [--region …]          # extracto de Protomaps (red)
    uv run python -m setas_pipeline.exportar meteo      [--region …]          # Fase 3: puntos meteo + teselas de Voronoi
    uv run python -m setas_pipeline.exportar acceso     [--region …]          # Fase 8: acceso.bin/json + aparcamientos.json
    uv run python -m setas_pipeline.exportar rutas      [--region …]          # Fase 8: rutas.pmtiles
    uv run python -m setas_pipeline.exportar sitios     [--region …]          # Fase 9: sitios.json
    uv run python -m setas_pipeline.exportar altitud    [--region …]          # Fase 9: añade la capa altitud a acceso.bin
    uv run python -m setas_pipeline.exportar manifest   [--region …]
    uv run python -m setas_pipeline.exportar todo       [--region …]
    uv run python -m setas_pipeline.exportar respaldo   [--region …]          # Fase 7: OsmAnd/Locus (out/respaldo/)
    uv run python -m setas_pipeline.exportar regiones                         # índice pipeline/data/regiones.json

Salida en data/<region>/out/app/ (no se versiona; la app la enlaza en app/public/data).
"""
...
from .malla import Malla, leer_tif
from .region import Region, cargar_region, argumento_region, listar_regiones, DATOS, REGIONES, ESPECIES, FUENTES
```
Borra `BASE`, `OUT`, `APP`, `ESPECIES` (viene de `region`), `TEXTO_RESTRICCION`, `AVISO_LEGAL`, `TIPOS_ZONA_RESERVA` y `clasificar_restriccion`.

Funciones de región (sustituyen las de mismo nombre):
```python
def _contexto(region: Region, zona=None):
    from .adaptadores import Contexto
    from .adaptadores.osm import pbf_zona
    from .descargas import cargar_zona
    malla = Malla.cargar(region.out / "malla.json")
    return Contexto(raw=region.raw, zona=zona if zona is not None else cargar_zona(region.out / "zona.geojson"),
                    malla=malla, fuentes=yaml.safe_load(FUENTES.read_text()), capas=region.capas,
                    osm_pbf=lambda: pbf_zona(region.raw, list(region.osm_extractos), malla.bounds))


def _bbox_zona(region: Region, margen=MARGEN_M):
    import geopandas as gpd
    z = gpd.read_file(region.out / "zona.geojson").to_crs("EPSG:25830")
    z = z.buffer(margen).to_crs("EPSG:4326")
    return tuple(float(v) for v in z.total_bounds), z.union_all()


def _calibracion(region: Region) -> dict:
    ruta = region.out / "calibracion.json"
    return json.loads(ruta.read_text()) if ruta.exists() else {}


def especies(region: Region) -> list[dict]:
    """Especies de la región en el orden de especies.yaml (activas y sin hábitat), con overrides aplicados."""
    from .idoneidad import cargar_perfiles
    cal = _calibracion(region)
    perfiles = region.perfiles(cargar_perfiles(ESPECIES), incluir_sin_habitat=True)
    return [{"id": k, "nombre": v["nombre"], **({"tiempo": v["tiempo"]} if "tiempo" in v else {}),
             "fiabilidad": fiabilidad(cal.get(k, {}).get("n"), cal.get(k, {}).get("lift_validacion")),
             "sin_habitat": k in region.especies_sin_habitat}
            for k, v in perfiles.items()]


def especies_activas(region: Region) -> list[dict]:
    """Las que tienen capas (las `sin_habitat` no exportan pmtiles, spec §3.5)."""
    return [e for e in especies(region) if not e["sin_habitat"]]
```

Resto de funciones de datos (cambios mecánicos, se listan todos):
- `exportar_meteo(region, out=None)`: `out = out or region.app`; `Malla.cargar(region.out / "malla.json")`; `region.out / "zona.geojson"`; bucle `for e in especies_activas(region)`; `leer_tif(region.out / f"idoneidad_{e['id']}.tif")`; `region.out / "altitud.tif"`.
- `exportar_rasters(region, malla, out=None)`: `out = out or region.app`; `bbox, zona = _bbox_zona(region)`; `region.out / "distancia_acceso.tif"`; `for e in especies_activas(region)`; `region.out / f"idoneidad_…"`; `region.out / "altitud.tif"`; `atr_i = region.atribuciones["idoneidad"]`.
- `exportar_curvas(region, malla, out=None)`: `out = out or region.app`; `region.out / "altitud.tif"`; `region.out / "zona.geojson"`.
- `exportar_protegidos`:
```python
def exportar_protegidos(region: Region, out: Path | None = None):
    """Espacios naturales protegidos (capa `protegidos` de la región, caché de la Fase 1) → protegidos.pmtiles."""
    from .adaptadores import cargar_capa
    out = out or region.app
    ctx = _contexto(region)
    gdf = cargar_capa("protegidos", region.capas, ctx).drop_duplicates(subset="codigo")
    gdf = gdf[gdf.intersects(ctx.zona)]
    gdf = gdf[["nombre", "figura", "geometry"]].to_crs("EPSG:4326")
    with tempfile.TemporaryDirectory() as tmp:
        gj = Path(tmp) / "protegidos.geojson"
        gj.write_text(gdf.to_json())
        _tippecanoe(gj, out / "protegidos.pmtiles", "protegidos", 6, 13,
                    ["--no-tile-size-limit", "--detect-shared-borders",
                     f"--attribution={region.atribuciones['protegidos']}"])
    print(f"  protegidos: {len(gdf)} espacios", flush=True)
```
- `restricciones_gdf` / `exportar_restricciones`:
```python
def restricciones_gdf(region: Region):
    """Capa legal de la región (capa `restricciones`: p. ej. Zonas de Reserva PORN, Reservas Naturales,
    Parque Nacional) recortada a la zona, con el texto de legal.tipos_restriccion. EPSG:4326."""
    from .adaptadores import cargar_capa
    ctx = _contexto(region)
    gdf = cargar_capa("restricciones", region.capas, ctx)
    gdf = gdf[gdf.intersects(ctx.zona)].copy()
    gdf["texto"] = gdf["tipo"].map(region.legal["tipos_restriccion"])
    return gdf.to_crs("EPSG:4326")


def exportar_restricciones(region: Region, out: Path | None = None):
    out = out or region.app
    gdf = restricciones_gdf(region)
    with tempfile.TemporaryDirectory() as tmp:
        gj = Path(tmp) / "restricciones.geojson"
        gj.write_text(gdf.to_json())
        _tippecanoe(gj, out / "restricciones.pmtiles", "restricciones", 6, 14,
                    ["--no-tile-size-limit", "--detect-shared-borders",
                     f"--attribution={region.atribuciones['restricciones']}"])
    print(f"  restricciones: {len(gdf)} recintos {gdf['tipo'].value_counts().to_dict()}", flush=True)
    return gdf
```
- `exportar_base(region, out=None, maxzoom=ZOOM_BASE_MAX, build=None)`: `out = out or region.app`; `_, zona = _bbox_zona(region)`.
- `escribir_manifest`:
```python
def escribir_manifest(region: Region, out: Path | None = None) -> dict:
    out = out or region.app
    extra = ["meteo_puntos.json", *ACCESO_ARCHIVOS, "sitios.json"]
    rutas = sorted(out.glob("*.pmtiles")) + [out / n for n in extra if (out / n).exists()]
    archivos = [{"nombre": p.name, "bytes": p.stat().st_size} for p in rutas]
    bbox, _ = _bbox_zona(region, 0)
    build = (out.parent / "base_build.txt")
    m = {
        "generado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        # Multi-región (2026-10-15): de qué región es este manifest y su normativa por comunidad autónoma.
        "region": {"id": region.id, "nombre": region.nombre, "origen": list(region.origen),
                   "etiqueta_origen": region.etiqueta_origen},
        "legal": {"ccaa": region.legal["ccaa"]},
        "bbox": [round(v, 5) for v in bbox],
        "especies": especies(region),
        # … umbrales, zoom, base, meteo, acceso, rutas: sin cambios …
        "restricciones": ({"capa": "restricciones.pmtiles", "tipos": region.legal["tipos_restriccion"],
                           "aviso": region.legal["aviso"]}
                          if (out / "restricciones.pmtiles").exists() else None),
        "sitios": sitios_manifest(out),
        "archivos": archivos,
        "total_bytes": sum(a["bytes"] for a in archivos),
    }
    modelo = modelo_disponible(out)
    if modelo:
        m["modelo"] = modelo
    (out / "manifest.json").write_text(json.dumps(m, ensure_ascii=False, indent=1))
    return m
```
- `escribir_regiones`:
```python
def escribir_regiones(datos: Path = DATOS, regiones: Path = REGIONES) -> list[dict]:
    """Índice de regiones para la app (spec §3.7): data/regiones.json. Solo las que ya tienen manifest."""
    lista = []
    for rid in listar_regiones(regiones):
        r = cargar_region(rid, regiones=regiones, datos=datos)
        ruta = r.app / "manifest.json"
        if not ruta.exists():
            print(f"  regiones: {rid} sin manifest ({ruta}); no entra en el índice", flush=True)
            continue
        m = json.loads(ruta.read_text())
        lista.append({"id": r.id, "nombre": r.nombre, "origen": list(r.origen), "bbox": m["bbox"],
                      "total_bytes": m["total_bytes"], "generado": m["generado"]})
    Path(datos).mkdir(parents=True, exist_ok=True)
    (Path(datos) / "regiones.json").write_text(json.dumps(lista, ensure_ascii=False, indent=1))
    return lista
```
- `main`:
```python
def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("pasos", nargs="+", choices=["capas", "restricciones", "base", "meteo", "acceso", "altitud", "rutas",
                                                 "sitios", "manifest", "respaldo", "regiones", "todo"])
    ap.add_argument("--maxzoom", type=int, default=ZOOM_BASE_MAX)
    argumento_region(ap)
    a = ap.parse_args(argv)
    pasos = set(a.pasos)
    if pasos == {"regiones"}:
        lista = escribir_regiones()
        print(f"regiones.json: {[r['id'] for r in lista]}")
        return
    region = cargar_region(a.region)
    malla = Malla.cargar(region.out / "malla.json")
    if pasos & {"capas", "todo"}:
        print("rasters…", flush=True); exportar_rasters(region, malla)
        print("curvas…", flush=True); exportar_curvas(region, malla)
        print("protegidos…", flush=True); exportar_protegidos(region)
        print("restricciones…", flush=True); exportar_restricciones(region)
    if pasos == {"restricciones"}:
        print("restricciones…", flush=True); exportar_restricciones(region)
    if pasos & {"base", "todo"}:
        exportar_base(region, maxzoom=a.maxzoom)
    if pasos & {"meteo", "todo"}:
        print("meteo…", flush=True); exportar_meteo(region)
    if pasos & {"acceso", "todo"}:
        from .acceso import calcular
        print("acceso…", flush=True); calcular(region)
    if "altitud" in pasos and not pasos & {"acceso", "todo"}:
        from .acceso import anadir_altitud
        print("altitud en acceso…", flush=True); anadir_altitud(region)
    if pasos & {"sitios", "todo"}:
        from .sitios import calcular as calcular_sitios
        print("sitios…", flush=True); calcular_sitios(region)
    if pasos & {"rutas", "todo"}:
        from .rutas import construir
        print("rutas…", flush=True); construir(region)
    if pasos == {"respaldo"}:
        from .respaldo import exportar_respaldo
        print("respaldo…", flush=True); exportar_respaldo(region, malla)
        return
    m = escribir_manifest(region)
    print(f"manifest {region.id}: {len(m['archivos'])} archivos, {m['total_bytes'] / 1e6:.1f} MB")
```

- [x] **Step 4: `acceso.py`**

Borra `BASE`, `OUT`, `APP`, `RAW`. Docstring de uso: `uv run python -m setas_pipeline.acceso [--region marbella]   # escribe data/<region>/out/app/acceso.*`.
```python
def dem_50m(raw: Path, malla) -> np.ndarray:
    """Mosaico de las teselas MDT25 en caché, promediado 2×2 → malla de 50 m alineada con malla.json."""
    import rasterio
    W25, H25 = int(malla.ancho * malla.celda / 25), int(malla.alto * malla.celda / 25)
    # … resto igual


def calcular(region, pbf: Path | None = None, out: Path | None = None, verbose=True):
    …                                                    # imports igual
    out = out or region.app
    malla = Malla.cargar(region.out / "malla.json")
    if pbf is None:
        from .adaptadores.osm import pbf_zona
        pbf = pbf_zona(region.raw, list(region.osm_extractos), malla.bounds)
    z = dem_50m(region.raw, malla)
    …                                                    # igual, con region.out en vez de OUT:
    zona = gpd.read_file(region.out / "zona.geojson").to_crs("EPSG:25830").buffer(500).union_all()
    …
    escribir_app(out, malla, t_min, s_m, o_id, d8, aparcamientos,
                 alt=altitud_u16(leer_tif_malla(region.out / "altitud.tif")))
    escribir_tif(malla, region.out / "tiempo_pie.tif", …)
    escribir_tif(malla, region.out / "subida_pie.tif", …)


def anadir_altitud(region, out: Path | None = None) -> dict:
    out = out or region.app
    malla = Malla.cargar(region.out / "malla.json")      # (y region.out / "altitud.tif" donde ponía OUT)
    …

def leer_app(out: Path): …            # sin valor por defecto
def consultar(lat: float, lon: float, out: Path) -> dict: …


def main(argv=None):
    from .region import argumento_region, cargar_region
    ap = argparse.ArgumentParser()
    ap.add_argument("--consultar", nargs=2, type=float, metavar=("LAT", "LON"), action="append")
    ap.add_argument("--solo-altitud", action="store_true",
                    help="añade/actualiza la capa altitud sobre el acceso ya calculado")
    argumento_region(ap)
    a = ap.parse_args(argv)
    region = cargar_region(a.region)
    if a.solo_altitud:
        print(anadir_altitud(region)["capas"]["altitud"])
        return
    if a.consultar:
        for lat, lon in a.consultar:
            print(lat, lon, consultar(lat, lon, region.app))
        return
    calcular(region)
```
(Lee las líneas 482-516 antes de editar `anadir_altitud`/`leer_app`/`consultar` y sustituye cada `OUT`/`APP` por `region.out`/`out`.)

- [x] **Step 5: `sitios.py`, `rutas.py`, `respaldo.py`**

`sitios.py`: borra `BASE`, `OUT`, `APP`; docstring: `… → data/<region>/out/app/sitios.json` y `uv run python -m setas_pipeline.sitios [--region marbella]`.
```python
def calcular(region, out: Path | None = None, verbose: bool = True) -> dict:
    from .acceso import leer_app
    from .exportar import especies_activas, restricciones_gdf
    from .malla import Malla, leer_tif
    out = out or region.app
    malla = Malla.cargar(region.out / "malla.json")
    cab, acc = leer_app(out)
    assert (cab["ancho"], cab["alto"]) == (malla.ancho, malla.alto), "acceso.bin no está en la malla"
    dist = leer_tif(region.out / "distancia_acceso.tif")
    restr = list(restricciones_gdf(region).geometry)
    meteo = json.loads((out / "meteo_puntos.json").read_text())
    datos = {"version": VERSION, "generado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
             "especies": {}}
    for e in especies_activas(region):
        idon = leer_tif(region.out / f"idoneidad_{e['id']}.tif")
        lista = candidatos(idon, acc["tiempo_pie_min"], acc["subida_m"], acc["origen_id"], dist, malla.celda)
        datos["especies"][e["id"]] = georreferenciar(lista, malla, restr, meteo)
        if verbose:
            print(f"  sitios {e['id']}: {len(lista)}", flush=True)
    out.mkdir(parents=True, exist_ok=True)
    (out / "sitios.json").write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")))
    return datos


if __name__ == "__main__":
    from .region import region_cli
    calcular(region_cli())
```

`rutas.py`: borra `BASE`, `OUT`, `APP`, `RAW`, `FUENTES`, `TESELA_M`, `solo_senderos`, `senderos_rediam`, `import requests`, `import yaml` (si quedan sin uso). Docstring: «Fuentes: la capa `senderos` de la región (p. ej. relaciones OSM route=hiking|foot y senderos REDIAM)… `uv run python -m setas_pipeline.rutas [--region marbella]`».
```python
def construir(region, out: Path | None = None):
    import geopandas as gpd
    from .exportar import _tippecanoe, _contexto
    from .adaptadores import cargar_capa
    out = out or region.app
    zona = gpd.read_file(region.out / "zona.geojson").to_crs("EPSG:25830").buffer(MARGEN_M).union_all()
    todo = cargar_capa("senderos", region.capas, _contexto(region, zona=zona))
    todo = todo[todo.intersects(zona)].copy()
    todo["geometry"] = todo.intersection(zona)
    todo = todo[~todo.geometry.is_empty]
    todo["geometry"] = todo.simplify(SIMPLIFICAR_M)
    todo = todo.to_crs("EPSG:4326")
    out.mkdir(parents=True, exist_ok=True)
    (region.out / "rutas.geojson").write_text(todo.to_json(drop_id=True, na="drop"))
    _tippecanoe(region.out / "rutas.geojson", out / "rutas.pmtiles", "rutas", 8, 14,
                ["--no-feature-limit", "--no-tile-size-limit", "--simplification=4",
                 f"--attribution={region.atribuciones['rutas']}"])
    cuenta = todo.groupby(["fuente", "tipo"]).size().to_dict()
    print("  rutas:", len(todo), cuenta, f"{(out / 'rutas.pmtiles').stat().st_size / 1e6:.2f} MB", flush=True)
    return todo


if __name__ == "__main__":
    from .region import region_cli
    construir(region_cli())
```

`respaldo.py`: borra `SALIDA` y `ATRIBUCION`. Docstring: «Salida en data/<region>/out/respaldo/ … `uv run python -m setas_pipeline.respaldo [--region marbella]`».
- `MBTiles.__init__(self, ruta, nombre, descripcion, atribucion: str = "")` guarda `self.atribucion`; en `cerrar` usa `"attribution": self.atribucion`.
- `geojson_zonas(zonas_wgs, especie, nombre, atribucion: str = "")` → `"attribution": atribucion`.
- `kml_zonas(zonas_wgs, especie, nombre, atribucion: str = "")` → `… Datos: {atribucion}` en la descripción.
- `exportar_rasters_respaldo(region, malla, out, zooms=ZOOM_RESPALDO, umbrales=UMBRALES_RESPALDO)`: `bbox, zona = ex._bbox_zona(region)`; `region.out / …` en los `leer_tif`; `for e in ex.especies_activas(region)`; `MBTiles(out / f"{k}.mbtiles", k, desc, region.atribuciones["idoneidad"])`.
- `exportar_zonas(region, malla, out)`: `region.out / …`; `ex.especies_activas(region)`; `geojson_zonas(zw, e["id"], e["nombre"], region.atribuciones["idoneidad"])`; `kml_zonas(…, region.atribuciones["idoneidad"])`.
- `escribir_readme(region, out)`: `especies` desde `ex.especies_activas(region)`; la línea `- Espacios protegidos: REDIAM (Junta de Andalucía), CC BY 4.0` pasa a `- {region.atribuciones['respaldo_protegidos']}`.
- `exportar_respaldo(region, malla=None, out=None)`: `out = out or region.respaldo`; `malla = malla or Malla.cargar(region.out / "malla.json")`; pasa `region` a las tres funciones.
- `__main__`: `from .region import region_cli; for p in exportar_respaldo(region_cli()): print(p.name, _tamano(p))`.

- [x] **Step 6: Limpiar `fuentes.yaml`**

Cuando nada lo lee (`grep -rn '"enp"\|rediam_senderos\|zonificacion_porn\|rediam_url\|rediam_desde\|cfg\["url"\]' pipeline/setas_pipeline` solo da adaptadores con su `cfg` de región):
- `osm`: borra `url:` y los dos comentarios de Geofabrik (ya están en `marbella.yaml`). Se quedan `licencia` y `tags_acceso`.
- `mfe`: borra `provincias:` (en `marbella.yaml → notas_fuentes.mfe_provincias`).
- Borra los bloques `enp:` (148-157), `rediam_senderos:` (179-188) y `zonificacion_porn:` (245-253) — su contenido ya está en las entradas de `marbella.yaml`.
- `incendios`: borra `rediam_url`, `rediam_desde`, `rediam_hasta`, `rediam_catalogo`, `rediam_licencia`, `rediam_verificacion` (ya en `marbella.yaml`); cambia `nombre` a `"Perímetros de incendios: capa 'incendios' de cada región (regiones/<id>.yaml) + EFFIS (MODIS burnt areas) + MFE con fecha"` y `atribucion` a `"EFFIS, Copernicus Emergency Management Service (CC BY 4.0) · © MITECO MFE (más la fuente regional: ver regiones/<id>.yaml)"`.
- Encabezado: añade debajo de la línea 3 `# Multi-región (2026-10-15): lo regional vive en pipeline/regiones/<id>.yaml; aquí solo lo nacional y compartido.`
- La línea 23 (`mar: … verificado frente a Marbella`) se queda: es la nota de verificación del DEM, no un parámetro.

- [x] **Step 7: Run the whole suite**

```bash
cd pipeline
grep -rn "ex\.OUT\|exportar\.OUT\|\.APP\b\|SALIDA\|ATRIBUCION\|TEXTO_RESTRICCION\|AVISO_LEGAL\|especies()" setas_pipeline tests
uv run pytest -q
```
Expected: el grep no da nada (salvo comentarios explicativos); `pytest` en verde, incluido `test_sin_valores_fijos.py`. Si `test_acceso.py` llama a `dem_50m`/`calcular` con valores por defecto, pásale rutas de `tmp_path` explícitas.

- [x] **Step 8: Prueba rápida sin red del manifest y del índice**

```bash
cd /Users/alexanderkrupnov/Documents/Claude/setas-alicante/pipeline
HTTP_PROXY=http://127.0.0.1:9 HTTPS_PROXY=http://127.0.0.1:9 uv run python -m setas_pipeline.exportar manifest --region marbella
uv run python -m setas_pipeline.dorado comparar --out data/marbella/out --dorado tests/dorado/marbella.json --solo app/manifest.json
uv run python -m setas_pipeline.exportar regiones && cat data/regiones.json
```
Expected: `OK … 0 diferencias` para el manifest (solo cambian `region`, `legal`, `sin_habitat` y `generado`, que se ignoran) y `regiones.json` con una entrada `marbella`.

- [x] **Step 9: Commit**

```bash
git add pipeline/setas_pipeline pipeline/fuentes.yaml pipeline/tests
git commit -m "feat(pipeline): exportación por región, manifest con region/legal/sin_habitat y regiones.json

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Regresión final de Marbella

**Files:**
- Create: `pipeline/tests/test_regresion_marbella.py`
- (Solo si hace falta corregir) cualquier módulo de `setas_pipeline/`

**Interfaces:**
- Consumes: `scripts/regresion_marbella.sh despues`, `tests/dorado/marbella.json`, `dorado.huella/comparar`.

- [ ] **Step 1: Test que compara lo que haya en disco con el dorado (se salta sin datos)**

```python
# pipeline/tests/test_regresion_marbella.py
"""Regresión de Marbella (spec §7.1). No re-ejecuta el pipeline (eso lo hace scripts/regresion_marbella.sh
despues, ~decenas de minutos): compara las salidas que haya en data/marbella/out con el dorado."""
import json
from pathlib import Path
import pytest
from setas_pipeline import dorado as D
from setas_pipeline.region import cargar_region

DORADO = Path(__file__).parent / "dorado" / "marbella.json"
OUT = cargar_region("marbella").out


@pytest.mark.skipif(not (OUT / "app" / "manifest.json").exists(), reason="sin datos de Marbella en data/marbella/out")
def test_salidas_de_marbella_iguales_al_dorado():
    difs = D.comparar(json.loads(DORADO.read_text()), D.huella(OUT))
    assert not difs, "\n".join(difs[:50])
```

- [ ] **Step 2: Re-ejecutar todo sin red con el código nuevo**

```bash
cd /Users/alexanderkrupnov/Documents/Claude/setas-alicante
nohup pipeline/scripts/regresion_marbella.sh despues > "$SCRATCH/regresion_despues.log" 2>&1 &
echo $! > "$SCRATCH/regresion_despues.pid"
```
Espera en primer plano:
```bash
until ! kill -0 "$(cat "$SCRATCH/regresion_despues.pid")" 2>/dev/null; do sleep 30; done; tail -15 "$SCRATCH/regresion_despues.log"
```
Expected: `OK: N archivos comparados, 0 diferencias` y `FIN`; N igual al de la generación (Task 2, Step 4).

- [ ] **Step 3: Si hay diferencias**

Usa superpowers:systematic-debugging. Pistas por tipo:
- `.tif` distinto: localiza el primer paso que lo produce (`ejecutar` del log) y compara su lógica vieja (`git show <commit de la Task 2>:pipeline/setas_pipeline/<modulo>.py`) con la nueva. Para `distancia_acceso.tif` / `tiempo_pie.tif` / `app/acceso.bin*`, el sospechoso es el recorte OSM (Task 6).
- `app/sitios.json`: depende de `restricciones_gdf` (geometrías, no orden) y de `meteo_puntos.json`.
- `rutas.geojson`: orden o columnas de `cargar_capa("senderos", …)` frente a la concatenación vieja.
- pmtiles fuera del ±1 % o con otra `atribucion`/`teselas`: revisa la cadena de `atribuciones` en `marbella.yaml` y el filtro por zona.
- `respaldo/README_respaldo.md` distinto: el README lleva la tabla de tamaños de los `.sqlitedb`/`.mbtiles` (1 decimal en MB); si solo cambia esa tabla y los tamaños están dentro del ±1 %, no es una regresión: anótalo y pregunta antes de tocar `dorado.py`.
- `app/manifest.json: clave 'X' distinta`: solo `region`, `legal` y `especies[].sin_habitat` pueden cambiar; cualquier otra es un fallo.
Corrige en el código (nunca en el dorado), commit, y repite el Step 2. No se regenera el dorado salvo que el usuario lo autorice.

- [ ] **Step 4: Suite completa y commit**

```bash
cd pipeline && uv run pytest -q 2>&1 | tail -2
git add pipeline/tests/test_regresion_marbella.py
git commit -m "test(pipeline): regresión de Marbella frente al dorado (se salta sin datos)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: todo PASS, `test_salidas_de_marbella_iguales_al_dorado` PASSED (no SKIPPED). Anota en el informe la duración de las dos regresiones.

---

### Task 11: Rutas de la app y del reconocedor + migración del checkout principal (instrucciones, no se ejecutan)

**Files:**
- Modify: `app/scripts/enlazar-datos.mjs:1,8`, `app/scripts/publicar.sh:3,18`, `app/src/acceso.test.ts:109,214`, `app/src/ranking.test.ts:100`, `modelo/construir.py:8,32,33`, `README.md:19,44`, `stages/01_terreno/CONTEXT.md:14`

**Interfaces:**
- Produces: mientras no llegue el plan de la app, la app sigue leyendo un `data/` plano con los datos de Marbella: `app/public/data` → `pipeline/data/marbella/out/app`. El layout publicado definitivo (spec §4.1: `data/regiones.json`, `data/<region>/…`, `data/modelo/`) es del plan de la app; este plan deja listo `pipeline/data/regiones.json` y `pipeline/data/<region>/out/app/` para que ese plan lo copie.

- [ ] **Step 1: Cambios mínimos de ruta**

- `app/scripts/enlazar-datos.mjs`: comentario de la línea 1 → `// Enlaza <app>/<dir>/data → pipeline/data/marbella/out/app (interino hasta el selector de región; los datos no se versionan).`; línea 8 → `const destino = '../../pipeline/data/marbella/out/app';`
- `app/scripts/publicar.sh`: línea 3 `(pipeline/data/out/app)` → `(pipeline/data/marbella/out/app)`; línea 18 → `DATOS="$RAIZ/pipeline/data/marbella/out/app"   # interino: una sola región; el layout data/<region>/ llega con el plan de la app`.
- `app/src/acceso.test.ts:109` y `:214`, `app/src/ranking.test.ts:100`: `pipeline/data/out/app/` → `pipeline/data/marbella/out/app/`.
- `modelo/construir.py`: línea 8 `pipeline/data/out/app/modelo/` → `pipeline/data/marbella/out/app/modelo/`; líneas 32-33 `"pipeline/data/out/app/…"` → `"pipeline/data/marbella/out/app/…"` (el plan de la app lo moverá a `data/modelo/`, compartido).
- `README.md:19,44` y `stages/01_terreno/CONTEXT.md:14`: `pipeline/data/out` → `pipeline/data/<region>/out` (con una frase: «`--region` en los CLIs, por defecto `marbella`; config en `pipeline/regiones/<id>.yaml`»).

- [ ] **Step 2: Verificar**

```bash
cd /Users/alexanderkrupnov/Documents/Claude/setas-alicante
grep -rn "data/out" app/scripts app/src modelo/construir.py README.md stages pipeline/setas_pipeline | grep -v node_modules
test -d app/node_modules || npm --prefix app ci
npm --prefix app run datos && ls -l app/public/data
npx --prefix app vitest run src/acceso.test.ts src/ranking.test.ts
```
Expected: grep vacío; `public/data -> ../../pipeline/data/marbella/out/app`; los tests de datos reales salen PASSED (no saltados: el worktree tiene los datos migrados).

- [ ] **Step 3: Commit**

```bash
git add app/scripts/enlazar-datos.mjs app/scripts/publicar.sh app/src/acceso.test.ts app/src/ranking.test.ts modelo/construir.py README.md stages/01_terreno/CONTEXT.md
git commit -m "chore: la app y el reconocedor leen pipeline/data/marbella/out/app (interino multi-región)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Instrucciones de migración del checkout principal — NO ejecutar en este plan**

Se hacen al fusionar `region-alicante` en `main`, con el visto bueno de Alexander, en `/Users/alexanderkrupnov/Documents/Claude/setas`:
1. Antes de fusionar: `cd pipeline && uv run pytest -q` en verde en el worktree y la Task 10 en `OK`.
2. Fusionar en `main` (tras el plan de la app, o antes si se acepta el enlace interino de esta Task).
3. `brew install osmium-tool` si falta (`osmium --version`).
4. `pipeline/scripts/migrar_datos.sh /Users/alexanderkrupnov/Documents/Claude/setas/pipeline/data` (mueve con `mv`, no copia; idempotente).
5. `npm --prefix app run datos` (rehace el enlace `app/public/data`).
6. Comprobación sin red: `cd pipeline && HTTPS_PROXY=http://127.0.0.1:9 uv run python -m setas_pipeline.exportar manifest --region marbella && uv run python -m setas_pipeline.exportar regiones`.
7. El primer `ejecutar accesos`/`exportar acceso|rutas` crea `data/marbella/raw/zona.osm.pbf` (osmium, unos segundos).
8. Quitar el worktree solo cuando la Fase B/app lo diga (spec §8).

- [ ] **Step 5: Wrap-up**

Run: `cd pipeline && uv run pytest -q` y `git log --oneline region-alicante -12`.
Expected: todo en verde; un commit por task.

---

## Self-review (hecho al escribir el plan)

**Cobertura del brief y del spec:**
- Dorado primero (§7.1): Tasks 1–2; re-ejecución real sin red con `--forzar` y comprobación de mtime (`--desde`); pasos con red (zona/OSRM, base/Protomaps) excluidos y documentados; puntos de muestreo de la zona fijados aparte (Task 2 Step 5 → Task 8 test).
- `marbella.yaml` con todos los valores fijos (zona.py:11-12,17,44,57; accesos.py:29; acceso.py:24-26,302; rutas.py:14-20,79-141; protegidos.py; incendios.py:40-48,87-88; exportar.py:27-30,353,407-488; respaldo.py:32,40,346; vista_previa.py:1,9,24-25; fuentes.yaml:62,92,148-157,179-188,224-234,245-253): Tasks 7–9, con `test_sin_valores_fijos.py` como guarda. `fuentes.yaml:23` se deja (nota de verificación, no parámetro). Las líneas `acceso.py:421,428` del brief son la cabecera de `acceso.json` (CRS y bbox calculados de la malla): no tienen valor de Marbella.
- `region.py` + `--region` en `ejecutar`, `exportar`, `acceso`, `sitios` (y `rutas`, `respaldo`, `protegidos`, `vegetacion`, `suelo` vía `region_cli`): Tasks 7–9. Rutas `data/<region>/{raw,out}` y `data/_comun/gbif`: Task 8 (migración) + `Region`.
- Adaptadores §3.3: Tasks 4–6 (rediam, effis, osm, derivados); el registro admite `arcgis`, `wfs`, `zip_geojson` y `arcgis_por_anio` con solo `@registrar` en un módulo nuevo. OSM multi-extracto con osmium extract+merge: Task 6.
- `ARBOL` + `sabina` al final: Task 3 (con el arreglo del 255 → otro).
- `overrides_especies`, `especies.activas/sin_habitat`: Task 7 (`Region.perfiles`) y Task 9 (`especies`, `especies_activas`, sin pmtiles para `sin_habitat`).
- Manifest `region`, `legal.ccaa[]` (una entrada AND con el texto de hoy), `especies[].sin_habitat` y `exportar regiones`: Task 9; ignoradas exactamente esas claves en el dorado (Task 1).
- Migración del checkout principal como instrucciones no ejecutadas + cambios mínimos de rutas de la app: Task 11.

**Fuera de esta fase (a propósito):** capa `ccaa.pmtiles` (§3.6), `avisos[]` del manifest (§6), mapeo de *Juniperus* a `sabina` (por región, fase de Alicante), mover el modelo a `data/modelo/` (plan de la app), `mfe` como capa con adaptador (hoy es nacional en `fuentes.yaml`), caché de OSRM.

**Consistencia de nombres:** `cargar_capa(tipo, capas, ctx)` igual en Tasks 4, 5, 6, 8, 9; `pbf_zona(raw, extractos, bounds_malla)` igual en Tasks 6, 8, 9; `region.comun` para GBIF en `_calibracion` y `_vista` (Task 8); `especies_activas(region)` en exportar/sitios/respaldo (Task 9); `Contexto(raw, zona, malla, fuentes, capas, osm_pbf, desde_anio)` en todas.
