"""Fase 8: rutas señalizadas → rutas.pmtiles (capa 'rutas').

Fuentes:
- OSM: relaciones route=hiking|foot (ref, name, network, osmc:symbol) con la geometría de sus vías.
- REDIAM: WFS 'ms:senderos' (senderos señalizados de uso público de la Junta).

    uv run python -m setas_pipeline.rutas
"""
from __future__ import annotations
import json, re
from pathlib import Path
import requests, yaml

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / "data/out"
APP = OUT / "app"
RAW = BASE / "data/raw"
FUENTES = BASE / "fuentes.yaml"
MARGEN_M = 2000
TESELA_M = 50000
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


def senderos_rediam(cfg: dict, bbox25830, cache: Path):
    """Descarga por teselas (con caché) y deduplica por fid_1. Devuelve GeoDataFrame en EPSG:25830."""
    import geopandas as gpd
    import pandas as pd
    cache.mkdir(parents=True, exist_ok=True)
    xmin, ymin, xmax, ymax = bbox25830
    trozos = []
    x = xmin
    while x < xmax:
        y = ymin
        while y < ymax:
            caja = (int(x), int(y), int(min(x + TESELA_M, xmax)), int(min(y + TESELA_M, ymax)))
            ruta = cache / ("senderos_%d_%d_%d_%d.json" % caja)
            if not ruta.exists():
                url = cfg["url_patron"].format(xmin=caja[0], ymin=caja[1], xmax=caja[2], ymax=caja[3])
                r = requests.get(url, timeout=300)
                r.raise_for_status()
                json.loads(r.content)            # que sea GeoJSON válido antes de cachear
                ruta.write_bytes(r.content)
            g = gpd.read_file(ruta)
            if len(g):
                trozos.append(g.set_crs("EPSG:25830", allow_override=True))
            y += TESELA_M
        x += TESELA_M
    if not trozos:
        return gpd.GeoDataFrame(geometry=[], crs="EPSG:25830")
    g = gpd.GeoDataFrame(pd.concat(trozos, ignore_index=True), crs="EPSG:25830")
    return g.drop_duplicates(subset="fid_1")


def construir(out: Path = APP):
    import geopandas as gpd
    from .exportar import _tippecanoe
    cfg = yaml.safe_load(FUENTES.read_text())
    zona = gpd.read_file(OUT / "zona.geojson").to_crs("EPSG:25830").buffer(MARGEN_M).union_all()
    osm = relaciones_osm(RAW / "andalucia.osm.pbf")
    g_osm = gpd.GeoDataFrame(osm, geometry="geometry", crs="EPSG:4326").to_crs("EPSG:25830")
    g_osm = g_osm[g_osm.intersects(zona)].copy()
    g_osm["geometry"] = g_osm.intersection(zona)
    g_osm = gpd.GeoDataFrame({
        "ref": g_osm["ref"], "name": g_osm["name"], "network": g_osm["network"], "osmc": g_osm["osmc"],
        "tipo": [clasificar_ref(r, n) for r, n in zip(g_osm["ref"], g_osm["name"])],
        "fuente": "osm", "dificultad": None}, geometry=g_osm.geometry, crs="EPSG:25830")
    partes = [g_osm]
    rc = cfg.get("rediam_senderos", {})
    if rc.get("url_patron"):
        g_r = senderos_rediam(rc, zona.bounds, RAW / "rediam_senderos")
        g_r = g_r[g_r.intersects(zona)].copy()
        g_r["geometry"] = g_r.intersection(zona)
        partes.append(gpd.GeoDataFrame({
            "ref": None, "name": g_r["nombre"].str.strip().str.title(), "network": None, "osmc": None,
            "tipo": [clasificar_ref(None, n) for n in g_r["nombre"]], "fuente": "rediam",
            "dificultad": g_r.get("t_dificult")}, geometry=g_r.geometry, crs="EPSG:25830"))
    import pandas as pd
    todo = gpd.GeoDataFrame(pd.concat(partes, ignore_index=True), crs="EPSG:25830")
    todo = todo[~todo.geometry.is_empty]
    todo["geometry"] = todo.simplify(SIMPLIFICAR_M)
    todo = todo.to_crs("EPSG:4326")
    out.mkdir(parents=True, exist_ok=True)
    (OUT / "rutas.geojson").write_text(todo.to_json(drop_id=True, na="drop"))
    _tippecanoe(OUT / "rutas.geojson", out / "rutas.pmtiles", "rutas", 8, 14,
                ["--no-feature-limit", "--no-tile-size-limit", "--simplification=4",
                 "--attribution=© OpenStreetMap (ODbL); REDIAM, Junta de Andalucía (CC BY 4.0)"])
    cuenta = todo.groupby(["fuente", "tipo"]).size().to_dict()
    print("  rutas:", len(todo), cuenta, f"{(out / 'rutas.pmtiles').stat().st_size / 1e6:.2f} MB", flush=True)
    return todo


if __name__ == "__main__":
    construir()
