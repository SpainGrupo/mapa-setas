"""Zona de trabajo: puntos alcanzables en ≤2 h en coche desde Marbella (OSRM)."""
from __future__ import annotations
import json, time
from pathlib import Path
import requests
from pyproj import Transformer
from shapely.geometry import box, mapping
from shapely.ops import unary_union
from .malla import Malla, CRS

ORIGEN = (-4.8825, 36.5101)  # lon, lat
OSRM = "https://router.project-osrm.org/table/v1/driving/"
_a_utm = Transformer.from_crs("EPSG:4326", CRS, always_xy=True)
_a_geo = Transformer.from_crs(CRS, "EPSG:4326", always_xy=True)


def puntos_muestreo(paso_m=5000, radio_m=220_000):
    cx, cy = _a_utm.transform(*ORIGEN)
    pts = []
    n = int(radio_m // paso_m)
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            x, y = cx + i * paso_m, cy + j * paso_m
            if (x - cx) ** 2 + (y - cy) ** 2 <= radio_m ** 2:
                pts.append(_a_geo.transform(x, y))
    return pts


def consultar_osrm(origen, destinos, lote=99, pausa_s=1.0):
    salida = []
    for k in range(0, len(destinos), lote):
        trozo = destinos[k:k + lote]
        coords = ";".join(f"{lon:.5f},{lat:.5f}" for lon, lat in [origen, *trozo])
        r = requests.get(OSRM + coords, params={"sources": "0", "annotations": "duration"}, timeout=60)
        r.raise_for_status()
        j = r.json()
        dur = j["durations"][0][1:]
        snaps = [d.get("distance") for d in j["destinations"][1:]]
        salida += [{"duracion": d, "snap_m": s} for d, s in zip(dur, snaps)]
        time.sleep(pausa_s)  # uso razonable del servidor demo
    return salida


def filtrar_alcanzables(puntos, resultados, max_s=7200, max_snap_m=5000):
    return [p for p, r in zip(puntos, resultados)
            if r["duracion"] is not None and r["snap_m"] is not None
            and r["duracion"] <= max_s and r["snap_m"] <= max_snap_m]


def poligono_zona(puntos, paso_m=5000, crs_entrada="EPSG:4326"):
    if crs_entrada != CRS:
        puntos = [_a_utm.transform(x, y) for x, y in puntos]
    h = paso_m / 2
    return unary_union([box(x - h, y - h, x + h, y + h) for x, y in puntos])


def construir_zona(out_dir: Path) -> Malla:
    pts = puntos_muestreo()
    res = consultar_osrm(ORIGEN, pts)
    pol = poligono_zona(filtrar_alcanzables(pts, res))
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "zona.geojson").write_text(json.dumps(
        {"type": "FeatureCollection", "crs": {"type": "name", "properties": {"name": CRS}},
         "features": [{"type": "Feature", "properties": {}, "geometry": mapping(pol)}]}))
    malla = Malla.desde_bounds(*pol.bounds)
    malla.guardar(out_dir / "malla.json")
    return malla
