"""Capa de titularidad (2026-10-15) → data/out/app/titularidad.pmtiles.

    uv run python -m setas_pipeline.exportar titularidad

Capa «titularidad» (polígonos, consulta punto en polígono en la app):
    monte_junta       Catálogo de Montes Públicos, tipo_titul «Comunidad Autónoma de Andalucía»
    monte_municipal   tipo_titul «Ayuntamiento» u «Otras Entidades Públicas»
    coto              terreno cinegético REDIAM (solo refuerza el aviso de finca privada)
    senal_privado     valla, muro, cancela o vía con access=private|no de OSM, con un búfer de BUFER_SENAL_M
    paso_publico      vía pecuaria o sendero REDIAM con un búfer de BUFER_PASO_M (para consultar un punto)
Capa «pasos» (líneas, para pintar): vías pecuarias y senderos REDIAM.

Fuera de un monte público la clase por defecto es «probablemente privado»: no sale de ningún dato. Las señales
(cotos, vallas, access=private) solo refuerzan ese aviso; su ausencia no significa acceso libre.
Norma: Ley 43/2003 de Montes, art. 36.1 (los frutos espontáneos de un monte son de su titular) y Resolución de
23-09-2026 (BOJA 196), punto 8 (en terrenos particulares, autorización del propietario).
"""
from __future__ import annotations
import json, subprocess, tempfile
from pathlib import Path
import yaml

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / "data/out"
APP = OUT / "app"
RAW = BASE / "data/raw"
FUENTES = BASE / "fuentes.yaml"
TESELA_M = 25000
MARGEN_M = 2000
BUFER_SENAL_M = 30.0        # valor de diseño (PENDIENTE de calibrar, legal-acceso.md §3)
BUFER_PASO_M = 20.0         # medio ancho aproximado para consultar un punto junto a la vía
SIMPLIFICAR_M = 5
SIMPLIFICAR_REFUERZO_M = 20  # cotos, señales y búferes de paso: solo se consultan en un punto, no se pintan
SOLO_CONSULTA = ("coto", "senal_privado", "paso_publico")   # solo en el nivel máximo (la app consulta ahí)

JUNTA = "Comunidad Autónoma de Andalucía"
MUNICIPAL = ("Ayuntamiento", "Otras Entidades Públicas")
BARRERAS = ("fence", "wall", "gate")

NORMA = ("Ley 43/2003 de Montes, art. 36.1: el titular del monte es el propietario de sus frutos espontáneos. "
         "Resolución de 23-09-2026 (BOJA 196), punto 8: en terrenos particulares hace falta la autorización "
         "del propietario para recoger setas.")
TEXTOS = {
    "monte_junta": "Monte público (Junta)",
    "monte_municipal": "Monte público municipal: consulta al ayuntamiento",
    "privado": "Probablemente privado: necesitas permiso del dueño para recoger",
    "paso_publico": "Paso público, no recoger fuera",
    "coto": "Coto de caza",
    "senal_privado": "Valla, cancela o paso privado cerca",
}
AVISO = ("No hay datos abiertos fiables de vallas ni de quién es dueño de cada finca. Fuera de los montes "
         "públicos marcados, asume que es privado y pide permiso. " + NORMA)
ATRIBUCION = "REDIAM, Junta de Andalucía (montes públicos, vías pecuarias, senderos, cotos) · © OpenStreetMap ODbL"


# ---------------------------------------------------------------- lógica pura

def clase_monte(tipo_titul: str | None) -> str | None:
    t = (tipo_titul or "").strip()
    if t == JUNTA:
        return "monte_junta"
    if t in MUNICIPAL:
        return "monte_municipal"
    return None          # p. ej. «Particular» (consorciados): no es público


def es_senal_privado(tags: dict) -> bool:
    """Valla, muro o cancela (con cualquier acceso: una cancela abierta no prueba que el paso sea libre) o
    vía con access|foot = private|no."""
    if tags.get("barrier") in BARRERAS:
        return True
    return "highway" in tags and (tags.get("access") in ("private", "no") or tags.get("foot") in ("private", "no"))


def etiqueta_punto(clases: set[str]) -> dict:
    """Clases de los polígonos que contienen un punto → {clase, texto, refuerzos, paso}. Misma regla que la app."""
    if "monte_junta" in clases:
        base = "monte_junta"
    elif "monte_municipal" in clases:
        base = "monte_municipal"
    else:
        base = "privado"
    refuerzos = [c for c in ("coto", "senal_privado") if c in clases] if base == "privado" else []
    return {"clase": base, "texto": TEXTOS[base], "refuerzos": refuerzos, "paso": "paso_publico" in clases}


# ---------------------------------------------------------------- datos

def _wfs(cfg_key: str, zona, cache: str):
    from .descargas import descargar_teselas
    cfg = yaml.safe_load(FUENTES.read_text())[cfg_key]
    return descargar_teselas(cfg["url_patron"], zona, TESELA_M, RAW / cache)


def montes(zona):
    g = _wfs("montes_publicos", zona, "montes_publicos")
    if not len(g):
        return g
    g = g.drop_duplicates("codigo_ja")
    g["clase"] = g["tipo_titul"].map(clase_monte)
    g = g[g["clase"].notna()]
    return g.assign(nombre=g["nombre"].str.strip(), detalle=g["tipo_titul"].str.strip(), codigo=g["codigo_ja"])


def cotos(zona):
    g = _wfs("cotos_caza", zona, "cotos_caza")
    if not len(g):
        return g
    g = g.drop_duplicates("MATRICULA")
    return g.assign(clase="coto", nombre=g["NOMBRE"].str.strip().str.title(), detalle=g["TIPO"].str.strip().str.capitalize(),
                    codigo=g["MATRICULA"])


def vias_pecuarias(zona):
    g = _wfs("vias_pecuarias", zona, "vias_pecuarias")
    if not len(g):
        return g
    g = g.drop_duplicates("CODIGOVIA")
    return g.assign(clase="paso_publico", tipo="via_pecuaria", nombre=g["NOMBRE"].str.strip().str.capitalize(),
                    detalle="Vía pecuaria", codigo=g["CODIGOVIA"])


def senderos(zona):
    from .rutas import senderos_rediam, solo_senderos, TESELA_M as T_RUTAS
    cfg = yaml.safe_load(FUENTES.read_text())["rediam_senderos"]
    # misma caja y teselas que rutas.py (zona + 2 km) para reutilizar su caché
    g = solo_senderos(senderos_rediam(cfg, zona.buffer(MARGEN_M).bounds, RAW / "rediam_senderos"))
    if not len(g):
        return g
    return g.assign(clase="paso_publico", tipo="sendero", nombre=g["nombre"].str.strip().str.title(),
                    detalle="Sendero de uso público", codigo=g["fid_1"].astype(str))


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


def construir(out: Path = APP) -> dict:
    import geopandas as gpd
    import pandas as pd
    from .malla import Malla, leer_tif
    zona = gpd.read_file(OUT / "zona.geojson").to_crs("EPSG:25830").union_all()
    zona_m = zona.buffer(MARGEN_M)
    m, c = montes(zona_m), cotos(zona_m)
    m = m[m.intersects(zona_m)] if len(m) else m
    c = c[c.intersects(zona_m)] if len(c) else c
    vp, se = vias_pecuarias(zona_m), senderos(zona)
    zona_wgs = gpd.GeoSeries([zona_m], crs="EPSG:25830").to_crs("EPSG:4326").iloc[0]
    osm = senales_osm(RAW / "andalucia.osm.pbf", zona_wgs).to_crs("EPSG:25830")
    n_osm = len(osm)
    if (OUT / "edificado.tif").exists() and len(osm):
        osm = osm[~en_lo_edificado(osm.geometry, Malla.cargar(OUT / "malla.json"), leer_tif(OUT / "edificado.tif"))]
    cols = ["clase", "nombre", "detalle", "codigo", "geometry"]
    sen = gpd.GeoDataFrame({"clase": "senal_privado", "nombre": None, "detalle": osm["tipo"], "codigo": None},
                           geometry=osm.buffer(BUFER_SENAL_M), crs="EPSG:25830")
    if len(sen):    # funde los búferes solapados (menos teselas y polígonos)
        sen = gpd.GeoDataFrame({"clase": ["senal_privado"], "nombre": [None], "detalle": ["OSM"], "codigo": [None]},
                               geometry=[sen.union_all()], crs="EPSG:25830").explode(index_parts=False)
    lineas = pd.concat([x for x in (vp, se) if len(x)], ignore_index=True) if len(vp) or len(se) else None
    pasos_buf = gpd.GeoDataFrame(lineas[["clase", "nombre", "detalle", "codigo"]],
                                 geometry=lineas.buffer(BUFER_PASO_M), crs="EPSG:25830") if lineas is not None else None
    poli = gpd.GeoDataFrame(pd.concat([x[cols] for x in (m, c, sen, pasos_buf) if x is not None and len(x)],
                                      ignore_index=True), crs="EPSG:25830")
    poli = poli[poli.intersects(zona_m)].copy()
    consulta = poli["clase"].isin(SOLO_CONSULTA)
    poli["geometry"] = [g.simplify(SIMPLIFICAR_REFUERZO_M if k else SIMPLIFICAR_M) for g, k in zip(poli.geometry, consulta)]
    poli["texto"] = poli["clase"].map(TEXTOS)
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
                        f"--attribution={ATRIBUCION}"], check=True)
    cuenta = poli["clase"].value_counts().to_dict()
    res = {"poligonos": cuenta, "lineas": lin["tipo"].value_counts().to_dict() if len(lin) else {},
           "montes_junta": int((m["clase"] == "monte_junta").sum()) if len(m) else 0,
           "montes_municipales": int((m["clase"] == "monte_municipal").sum()) if len(m) else 0,
           "ha_publicas": round(float(m.geometry.union_all().intersection(zona).area) / 1e4) if len(m) else 0,
           "cotos": len(c), "senales_osm": len(osm), "senales_osm_urbanas_descartadas": n_osm - len(osm)}
    (OUT / "titularidad_resumen.json").write_text(json.dumps(res, ensure_ascii=False, indent=1))
    print(f"  titularidad: {res} · {(out / 'titularidad.pmtiles').stat().st_size / 1e6:.2f} MB", flush=True)
    return res


def titularidad_puntos(puntos_lonlat, ruta: Path = OUT / "titularidad.geojson") -> list[dict]:
    """Etiqueta (etiqueta_punto + nombre del monte) de cada (lon, lat), con los polígonos de titularidad.geojson."""
    import geopandas as gpd
    from shapely import STRtree
    from shapely.geometry import Point
    if not Path(ruta).exists():
        return [None] * len(puntos_lonlat)
    g = gpd.read_file(ruta)
    arbol = STRtree(list(g.geometry))
    res = []
    for lon, lat in puntos_lonlat:
        idx = arbol.query(Point(lon, lat), predicate="intersects")
        clases = {g["clase"].iloc[i] for i in idx}
        e = etiqueta_punto(clases)
        if e["clase"] != "privado":
            e["monte"] = next((str(g["nombre"].iloc[i]) for i in idx if g["clase"].iloc[i] == e["clase"]), None)
        res.append(e)
    return res


if __name__ == "__main__":
    construir()
