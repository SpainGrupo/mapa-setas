"""Zona de trabajo: puntos alcanzables en ≤ zona.max_s en coche desde el origen de la región (OSRM)."""
from __future__ import annotations
import json, time
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


def poligono_zona(puntos, paso_m=5000, crs_entrada="EPSG:4326"):
    if crs_entrada != CRS:
        puntos = [_a_utm.transform(x, y) for x, y in puntos]
    h = paso_m / 2
    return unary_union([box(x - h, y - h, x + h, y + h) for x, y in puntos])


def cerrar_zona(pol, distancia_m):
    """Cierre morfológico + relleno de agujeros: la rejilla de muestreo deja huecos
    en la sierra (puntos que OSRM ajusta a una carretera lejana) aunque los pueblos
    de dentro estén a <2 h (p. ej. Grazalema)."""
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
