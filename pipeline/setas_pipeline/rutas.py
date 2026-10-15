"""Fase 8: rutas señalizadas → rutas.pmtiles (capa 'rutas').

Fuentes: la capa `senderos` de la región (adaptadores; en Marbella, relaciones OSM route=hiking|foot con
ref, name, network y osmc:symbol, y el WFS 'ms:senderos' de REDIAM con los senderos señalizados de la Junta).

    uv run python -m setas_pipeline.rutas [--region marbella]
"""
from __future__ import annotations
import re
from pathlib import Path

MARGEN_M = 2000
SIMPLIFICAR_M = 5


def clasificar_ref(ref: str | None, nombre: str | None = None) -> str:
    """GR / PR / SL según la matrícula del sendero ('GR 7', 'PR-A 123', 'SL-A 12'…); si no, 'otro'."""
    patron = re.compile(r"^\s*(GR|PR|SL)(?:[\s.\-_]*[A-Z]{1,3})?[\s.\-_]*\d")
    for texto in (ref, nombre):
        if isinstance(texto, str) and texto:
            for parte in re.split(r"[;,/]", texto.upper()):
                m = patron.match(parte)
                if m:
                    return m.group(1)
    return "otro"


def relaciones_osm(pbf: Path):
    """Dos pasadas: (1) relaciones de senderismo y sus vías miembro; (2) geometría de esas vías."""
    import osmium
    from shapely import wkb
    from shapely.geometry import MultiLineString
    rels, ids = [], set()
    for r in osmium.FileProcessor(str(pbf), osmium.osm.RELATION) \
            .with_filter(osmium.filter.TagFilter(("route", "hiking"), ("route", "foot"))):
        if r.tags.get("type") != "route":
            continue
        vias = [m.ref for m in r.members if m.type == "w"]
        if not vias:
            continue
        rels.append({"id": r.id, "ref": r.tags.get("ref"), "name": r.tags.get("name"),
                     "network": r.tags.get("network"), "osmc": r.tags.get("osmc:symbol"),
                     "vias": vias})
        ids.update(vias)
    fab = osmium.geom.WKBFactory()
    geom = {}
    for w in osmium.FileProcessor(str(pbf), osmium.osm.NODE | osmium.osm.WAY).with_locations() \
            .with_filter(osmium.filter.IdFilter(ids).enable_for(osmium.osm.WAY)):
        if w.is_way():
            try:
                geom[w.id] = wkb.loads(fab.create_linestring(w), hex=True)
            except Exception:
                pass
    res = []
    for r in rels:
        partes = [geom[i] for i in r.pop("vias") if i in geom]
        if partes:
            r["geometry"] = MultiLineString(partes)
            res.append(r)
    return res


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
