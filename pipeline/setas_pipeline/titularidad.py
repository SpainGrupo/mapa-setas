"""Capa de titularidad (2026-10-15) → data/<region>/out/app/titularidad.pmtiles.

    uv run python -m setas_pipeline.exportar titularidad [--region marbella]

Capa «titularidad» (polígonos, consulta punto en polígono en la app):
    monte_junta       monte público de la comunidad autónoma (capa montes_publicos de la región)
    monte_municipal   monte público de ayuntamiento u otras entidades públicas
    coto              terreno cinegético (capa cotos_caza; solo refuerza el aviso de finca privada)
    senal_privado     valla, muro, cancela o vía con access=private|no de OSM, con un búfer de BUFER_SENAL_M
    paso_publico      vía pecuaria o sendero de uso público (capa pasos_publicos) con un búfer de BUFER_PASO_M
Capa «pasos» (líneas, para pintar): la capa pasos_publicos.

Fuera de un monte público la clase por defecto es «probablemente privado»: no sale de ningún dato. Las señales
(cotos, vallas, access=private) solo refuerzan ese aviso; su ausencia no significa acceso libre.
Fuentes, textos, aviso, norma y atribución de cada región: regiones/<id>.yaml (capas.montes_publicos |
cotos_caza | pasos_publicos, legal.titularidad, atribuciones.titularidad).
"""
from __future__ import annotations
import json, subprocess, tempfile
from pathlib import Path

MARGEN_M = 2000
BUFER_SENAL_M = 30.0        # valor de diseño (PENDIENTE de calibrar, legal-acceso.md §3)
BUFER_PASO_M = 20.0         # medio ancho aproximado para consultar un punto junto a la vía
SIMPLIFICAR_M = 5
SIMPLIFICAR_REFUERZO_M = 20  # cotos, señales y búferes de paso: solo se consultan en un punto, no se pintan
SOLO_CONSULTA = ("coto", "senal_privado", "paso_publico")   # solo en el nivel máximo (la app consulta ahí)
CLASES = ("monte_junta", "monte_municipal", "privado", "paso_publico", "coto", "senal_privado")   # legal.titularidad.textos
BARRERAS = ("fence", "wall", "gate")


# ---------------------------------------------------------------- lógica pura

def es_senal_privado(tags: dict) -> bool:
    """Valla, muro o cancela (con cualquier acceso: una cancela abierta no prueba que el paso sea libre) o
    vía con access|foot = private|no."""
    if tags.get("barrier") in BARRERAS:
        return True
    return "highway" in tags and (tags.get("access") in ("private", "no") or tags.get("foot") in ("private", "no"))


def etiqueta_punto(clases: set[str], textos: dict) -> dict:
    """Clases de los polígonos que contienen un punto → {clase, texto, refuerzos, paso}. Misma regla que la app.
    textos: legal.titularidad.textos de la región."""
    if "monte_junta" in clases:
        base = "monte_junta"
    elif "monte_municipal" in clases:
        base = "monte_municipal"
    else:
        base = "privado"
    refuerzos = [c for c in ("coto", "senal_privado") if c in clases] if base == "privado" else []
    return {"clase": base, "texto": textos[base], "refuerzos": refuerzos, "paso": "paso_publico" in clases}


# ---------------------------------------------------------------- datos

def _capa(region, tipo: str, zona):
    from .adaptadores import cargar_capa, contexto_region
    return cargar_capa(tipo, region.capas, contexto_region(region, zona=zona))


def senales_osm(pbf: Path, zona_wgs):
    """Vallas, muros, cancelas y vías con access=private|no de OSM (EPSG:4326)."""
    import osmium
    import geopandas as gpd
    from shapely import wkb
    from shapely.geometry import Point
    from shapely import prepared
    zp = prepared.prep(zona_wgs)
    fab = osmium.geom.WKBFactory()
    geoms, tipos = [], []
    fp = (osmium.FileProcessor(str(pbf), osmium.osm.NODE | osmium.osm.WAY).with_locations()
          .with_filter(osmium.filter.KeyFilter("barrier", "highway")))
    for o in fp:
        tags = dict(o.tags)
        if not es_senal_privado(tags):
            continue
        try:
            if o.is_node():
                g = Point(o.location.lon, o.location.lat)
            else:
                g = wkb.loads(fab.create_linestring(o), hex=True)
        except Exception:
            continue
        if zp.intersects(g):
            geoms.append(g)
            tipos.append(tags.get("barrier") or f"{tags.get('highway')} privado")
    return gpd.GeoDataFrame({"tipo": tipos}, geometry=geoms, crs="EPSG:4326")


def con_minzoom(fc: dict, zoom: int = 14) -> dict:
    """Las clases SOLO_CONSULTA solo van en el nivel `zoom` de las teselas (tippecanoe minzoom por entidad)."""
    for f in fc["features"]:
        if f["properties"].get("clase") in SOLO_CONSULTA:
            f["tippecanoe"] = {"minzoom": zoom}
    return fc


def fuera_de_publicos(zona, montes_geoms):
    """Polígono de la zona que no es monte público (capa «fuera_publico»: velo del interruptor «solo montes
    públicos» en el mapa)."""
    from shapely import union_all
    g = list(montes_geoms)
    return zona.difference(union_all(g)) if g else zona


def en_lo_edificado(geoms, malla, edificado) -> "np.ndarray":
    """True para las geometrías cuyo punto representativo cae en una celda EXCLUIDA de edificado.tif (casco
    urbano: allí las vallas y muros no aportan nada al aviso de monte privado)."""
    import numpy as np
    from .edificado import EXCLUIDO
    pts = [g.representative_point() for g in geoms]
    xs = np.array([p.x for p in pts]); ys = np.array([p.y for p in pts])
    c = np.floor((xs - malla.x0) / malla.celda).astype(int); f = np.floor((malla.y1 - ys) / malla.celda).astype(int)
    ok = (c >= 0) & (c < malla.ancho) & (f >= 0) & (f < malla.alto)
    res = np.zeros(len(pts), bool)
    res[ok] = edificado[f[ok], c[ok]] == EXCLUIDO
    return res


def n_montes(m, clase: str) -> int:
    """Montes (no piezas) de una clase: un monte en varios recintos comparte código (adaptadores
    sin_repetidos); los recintos sin código cuentan uno a uno."""
    if not len(m):
        return 0
    cod = m.loc[m["clase"] == clase, "codigo"]
    return int(cod.nunique() + cod.isna().sum())


def construir(region, out: Path | None = None) -> dict:
    import geopandas as gpd
    import pandas as pd
    from .malla import Malla, leer_tif
    from .adaptadores.osm import pbf_region
    OUT = region.out
    out = out or region.app
    textos = region.legal["titularidad"]["textos"]
    malla = Malla.cargar(OUT / "malla.json")
    zona = gpd.read_file(OUT / "zona.geojson").to_crs("EPSG:25830").union_all()
    zona_m = zona.buffer(MARGEN_M)
    m, c = _capa(region, "montes_publicos", zona_m), _capa(region, "cotos_caza", zona_m)
    m = m[m.intersects(zona_m)] if len(m) else m
    c = c[c.intersects(zona_m)] if len(c) else c
    lineas = _capa(region, "pasos_publicos", zona_m)
    lineas = lineas if len(lineas) else None
    zona_wgs = gpd.GeoSeries([zona_m], crs="EPSG:25830").to_crs("EPSG:4326").iloc[0]
    osm = senales_osm(pbf_region(region, malla), zona_wgs).to_crs("EPSG:25830")
    n_osm = len(osm)
    if (OUT / "edificado.tif").exists() and len(osm):
        osm = osm[~en_lo_edificado(osm.geometry, malla, leer_tif(OUT / "edificado.tif"))]
    cols = ["clase", "nombre", "detalle", "codigo", "geometry"]
    sen = gpd.GeoDataFrame({"clase": "senal_privado", "nombre": None, "detalle": osm["tipo"], "codigo": None},
                           geometry=osm.buffer(BUFER_SENAL_M), crs="EPSG:25830")
    if len(sen):    # funde los búferes solapados (menos teselas y polígonos)
        sen = gpd.GeoDataFrame({"clase": ["senal_privado"], "nombre": [None], "detalle": ["OSM"], "codigo": [None]},
                               geometry=[sen.union_all()], crs="EPSG:25830").explode(index_parts=False)
    pasos_buf = gpd.GeoDataFrame(lineas[["clase", "nombre", "detalle", "codigo"]],
                                 geometry=lineas.buffer(BUFER_PASO_M), crs="EPSG:25830") if lineas is not None else None
    trozos = [x[cols] for x in (m, c, sen, pasos_buf) if x is not None and len(x)]
    poli = (gpd.GeoDataFrame(pd.concat(trozos, ignore_index=True), crs="EPSG:25830") if trozos
            else gpd.GeoDataFrame({k: [] for k in cols[:-1]}, geometry=[], crs="EPSG:25830"))
    poli = poli[poli.intersects(zona_m)].copy()
    consulta = poli["clase"].isin(SOLO_CONSULTA)
    poli["geometry"] = [g.simplify(SIMPLIFICAR_REFUERZO_M if k else SIMPLIFICAR_M) for g, k in zip(poli.geometry, consulta)]
    poli["texto"] = poli["clase"].map(textos)
    lin = gpd.GeoDataFrame(lineas[["clase", "tipo", "nombre", "codigo"]], geometry=lineas.geometry,
                           crs="EPSG:25830") if lineas is not None else gpd.GeoDataFrame(geometry=[], crs="EPSG:25830")
    lin = lin[lin.intersects(zona_m)].copy()
    lin["geometry"] = lin.simplify(SIMPLIFICAR_M)
    velo = gpd.GeoDataFrame({"clase": ["fuera_publico"]},
                            geometry=[fuera_de_publicos(zona_m, m.geometry if len(m) else []).simplify(20)],
                            crs="EPSG:25830").explode(index_parts=False)
    out.mkdir(parents=True, exist_ok=True)
    wgs = poli.to_crs("EPSG:4326")
    # Para sitios.py (titularidad de cada sitio candidato): mismos polígonos, sin pasar por las teselas.
    (OUT / "titularidad.geojson").write_text(wgs.to_json(drop_id=True, na="drop"))
    with tempfile.TemporaryDirectory() as tmp:
        gp, gl, gv = (Path(tmp) / n for n in ("titularidad.geojson", "pasos.geojson", "fuera.geojson"))
        gp.write_text(json.dumps(con_minzoom(json.loads(wgs.to_json(drop_id=True, na="drop"))), ensure_ascii=False))
        gl.write_text(lin.to_crs("EPSG:4326").to_json(drop_id=True, na="drop"))
        gv.write_text(velo.to_crs("EPSG:4326").to_json(drop_id=True, na="drop"))
        # Tres capas con nombre (-L); con -l tippecanoe las fundiría todas en una.
        destino = out / "titularidad.pmtiles"
        destino.unlink(missing_ok=True)
        subprocess.run(["tippecanoe", "-q", "-f", "-o", str(destino), "-Z", "6", "-z", "14",
                        "--no-tile-size-limit", "--no-feature-limit", "--detect-shared-borders",
                        "-L", f"titularidad:{gp}", "-L", f"pasos:{gl}", "-L", f"fuera_publico:{gv}",
                        f"--attribution={region.atribuciones['titularidad']}"], check=True)
    cuenta = poli["clase"].value_counts().to_dict()
    res = {"poligonos": cuenta, "lineas": lin["tipo"].value_counts().to_dict() if len(lin) else {},
           "montes_junta": n_montes(m, "monte_junta"), "montes_municipales": n_montes(m, "monte_municipal"),
           "ha_publicas": round(float(m.geometry.union_all().intersection(zona).area) / 1e4) if len(m) else 0,
           "cotos": len(c), "senales_osm": len(osm), "senales_osm_urbanas_descartadas": n_osm - len(osm)}
    (OUT / "titularidad_resumen.json").write_text(json.dumps(res, ensure_ascii=False, indent=1))
    print(f"  titularidad: {res} · {(out / 'titularidad.pmtiles').stat().st_size / 1e6:.2f} MB", flush=True)
    return res


def tiene_titularidad(region) -> bool:
    """¿Declara la región alguna capa de titularidad (y por tanto legal.titularidad)?"""
    from .region import CAPAS_TITULARIDAD
    return any(region.capas.get(t) for t in CAPAS_TITULARIDAD) and "titularidad" in region.legal


def cargar_poligonos(region, ruta: Path | None = None):
    """(GeoDataFrame, STRtree) de data/<region>/out/titularidad.geojson (o `ruta`); None si no existe."""
    import geopandas as gpd
    from shapely import STRtree
    ruta = ruta or region.out / "titularidad.geojson"
    if not Path(ruta).exists():
        return None
    g = gpd.read_file(ruta)
    return g, STRtree(list(g.geometry))


def titularidad_puntos(puntos_lonlat, region, ruta: Path | None = None, poligonos=None) -> list[dict]:
    """Etiqueta (etiqueta_punto + nombre del monte) de cada (lon, lat), con los polígonos de
    data/<region>/out/titularidad.geojson (o `ruta`, o `poligonos` ya cargados con cargar_poligonos)."""
    from shapely.geometry import Point
    poligonos = poligonos or cargar_poligonos(region, ruta)
    if poligonos is None or "titularidad" not in region.legal:
        return [None] * len(puntos_lonlat)
    g, arbol = poligonos
    res = []
    for lon, lat in puntos_lonlat:
        idx = arbol.query(Point(lon, lat), predicate="intersects")
        clases = {g["clase"].iloc[i] for i in idx}
        e = etiqueta_punto(clases, region.legal["titularidad"]["textos"])
        if e["clase"] != "privado":
            e["monte"] = next((str(g["nombre"].iloc[i]) for i in idx if g["clase"].iloc[i] == e["clase"]), None)
        res.append(e)
    return res


if __name__ == "__main__":
    from .region import region_cli
    construir(region_cli())
