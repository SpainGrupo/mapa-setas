"""Huella dorada de las salidas de una región (regresión de Marbella, spec multi-región §7.1).

    uv run python -m setas_pipeline.dorado generar  --out <dir out> --dorado tests/dorado/marbella.json --desde EPOCH
    uv run python -m setas_pipeline.dorado comparar --out <dir out> --dorado tests/dorado/marbella.json --desde EPOCH
(scripts/regresion_marbella.sh los llama con el out viejo antes del refactor y con el de la región después.)

Qué entra (rutas relativas a out/):
- *.tif: sha256 de los píxeles + dtype, forma, nodata, transform y CRS (no los bytes del archivo).
- *.json / *.geojson: sha256 del JSON canónico sin las claves `generado`. app/manifest.json se guarda
  entero, normalizado: sin `region`, `legal`, `atribuciones`, `ccaa`, `avisos` ni `especies[].sin_habitat` /
  `calibrado` (claves nuevas permitidas), sin
  `total_bytes` (va aparte con tolerancia) y con `bytes` = null en los .pmtiles.
- *.pmtiles: tamaño (±1 %), zooms, nº de teselas, bbox (±1e-4°), name y attribution.
- *.mbtiles / *.sqlitedb: tamaño (±1 %).
- Resto (.bin, .gz, .png, .md, .kml, .txt…): sha256 de los bytes.
Con --desde, todo archivo con huella debe ser posterior a esa marca (prueba de que se re-ejecutó),
salvo ENTRADAS (salen del paso zona, que necesita OSRM, o de citas.py, que necesita GBIF; no se re-ejecutan).
"""
from __future__ import annotations
import argparse, hashlib, json, sys
from pathlib import Path
import numpy as np

VERSION = 1
TOLERANCIA = 0.01
TOLERANCIA_BBOX_E7 = 1000
MANIFEST = "app/manifest.json"
MANIFEST_NUEVAS = ("region", "legal", "atribuciones", "ccaa", "avisos")
MANIFEST_ESPECIE_NUEVAS = ("sin_habitat", "calibrado")
MANIFEST_FUERA = ("modelo",)            # clave del reconocedor (modelo/construir.py): no es del pipeline, como SIN_HUELLA
# No los produce ningún paso re-ejecutable sin red (base = Protomaps) o no son del pipeline actual.
NO_REGENERADOS = {"region_base.geojson", "base_build.txt", "vista_arbol.png", "vista_suelo.png", "app/base.pmtiles"}
SIN_HUELLA = ("app/modelo/",)            # paquete del reconocedor (modelo/construir.py), no es del pipeline
# citas.geojson sale de citas.py, que necesita red (GBIF species/match) aunque tenga caché: se huella pero no se
# re-ejecuta (la calibración y la capa de citas sí se rehacen a partir de él).
ENTRADAS = {"zona.geojson", "malla.json", "citas.geojson"}
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
    n = {k: v for k, v in m.items() if k not in MANIFEST_NUEVAS + MANIFEST_FUERA and k != "total_bytes"}
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


def _nombre_relativo(nombre, out: Path | None, rel: str | None = None):
    """tippecanoe pone como `name` la ruta absoluta de salida (-o): se guarda relativa a out/ ("<out>/app/x.pmtiles")
    para que la huella no dependa de dónde estén los datos (esquema plano frente a <region>/out, otra máquina).
    Si el archivo se generó en otro árbol y se copió aquí (p. ej. otro worktree), la ruta no cuelga de out/; si acaba
    en la ruta relativa del propio archivo (`rel`), es la de -o en aquel árbol y se normaliza igual."""
    if out is None or not isinstance(nombre, str) or not Path(nombre).is_absolute():
        return nombre
    try:
        return "<out>/" + Path(nombre).resolve().relative_to(Path(out).resolve()).as_posix()
    except ValueError:
        pass
    if rel and Path(nombre).parts[-len(Path(rel).parts):] == Path(rel).parts:
        return "<out>/" + rel
    return nombre


def huella_pmtiles(p: Path, out: Path | None = None) -> dict:
    from pmtiles.reader import Reader, MmapSource
    with open(p, "rb") as f:
        r = Reader(MmapSource(f))
        h, md = r.header(), r.metadata()
    return {"bytes": p.stat().st_size, "zoom": [h["min_zoom"], h["max_zoom"]],
            "teselas": h.get("addressed_tiles_count"),
            "bbox_e7": [h["min_lon_e7"], h["min_lat_e7"], h["max_lon_e7"], h["max_lat_e7"]],
            "atribucion": md.get("attribution"),
            "nombre": _nombre_relativo(md.get("name"), out, p.relative_to(out).as_posix() if out else None)}


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
            res["pmtiles"][rel] = huella_pmtiles(p, out)
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
        for k in sorted((set(dm) | set(am)) - set(MANIFEST_FUERA)):
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
