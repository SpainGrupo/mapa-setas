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
