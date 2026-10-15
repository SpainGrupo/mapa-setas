"""Incendios → fuego.tif: años desde el último incendio registrado en cada celda (modelo v2, rec. 3).

Fuentes: la capa `incendios` de la región (adaptadores; en Marbella, perímetros REDIAM/INFOCA por año
y EFFIS burnt areas MODIS, que cubre el año en curso) más el MFE ("Procede de incendio con fecha",
fc_evento). Por celda se queda el año más reciente.
255 (SIN_FUEGO) = sin incendio en la ventana considerada; NODATA no se usa (fuera de zona = 255 también,
la idoneidad ya es 0 allí por arbol.tif).
"""
from __future__ import annotations
import json
from datetime import date
import geopandas as gpd, numpy as np, pandas as pd
from pyproj import Transformer
from rasterio.features import rasterize
from .malla import Malla, CRS, SIN_FUEGO, escribir_tif

VENTANA_ANIOS = 10        # solo interesan los ≤5 años; se guarda algo más por si cambia la regla


def anios_desde(anio: np.ndarray, ref: int) -> np.ndarray:
    """Raster de año del último incendio (0 = ninguno) → años transcurridos (uint8, 255 = ninguno).
    Un incendio del año de referencia cuenta como 0 años."""
    a = np.asarray(anio).astype("int32")
    d = np.clip(ref - a, 0, 254)
    return np.where(a > 0, d, SIN_FUEGO).astype("uint8")


def rasterizar_anios(gdf: gpd.GeoDataFrame, malla: Malla) -> np.ndarray:
    """Año más reciente por celda: se pinta en orden ascendente, el último gana."""
    gdf = gdf[gdf["anio"] > 0].sort_values("anio").to_crs(CRS)
    formas = [(g, int(a)) for g, a in zip(gdf.geometry, gdf["anio"]) if g is not None and not g.is_empty]
    if not formas:
        return np.zeros((malla.alto, malla.ancho), "uint16")
    return rasterize(formas, out_shape=(malla.alto, malla.ancho), transform=malla.transform,
                     fill=0, dtype="uint16")


def caja_wgs84(bounds, n: int = 32) -> tuple[float, float, float, float]:
    """(lon0, lat0, lon1, lat1) que contiene el rectángulo UTM `bounds`: se transforma el contorno
    densificado (n puntos por lado), no solo dos esquinas (los lados UTM son curvos en lon/lat)."""
    tr = Transformer.from_crs(CRS, "EPSG:4326", always_xy=True)
    xmin, ymin, xmax, ymax = bounds
    u = np.linspace(0.0, 1.0, n + 1)
    xs = np.concatenate([xmin + (xmax - xmin) * u, np.full_like(u, xmax), xmax - (xmax - xmin) * u, np.full_like(u, xmin)])
    ys = np.concatenate([np.full_like(u, ymin), ymin + (ymax - ymin) * u, np.full_like(u, ymax), ymax - (ymax - ymin) * u])
    lon, lat = tr.transform(xs, ys)
    return float(np.min(lon)), float(np.min(lat)), float(np.max(lon)), float(np.max(lat))


def construir_fuego(malla: Malla, region, ref: int | None = None, mfe: gpd.GeoDataFrame | None = None):
    from .adaptadores import contexto_region, cargar_capa
    ref = ref or date.today().year
    desde = ref - VENTANA_ANIOS
    ctx = contexto_region(region, malla=malla, desde_anio=desde)
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
    out_dir.mkdir(parents=True, exist_ok=True)
    escribir_tif(malla, out_dir / "fuego.tif", a, None)
    resumen = gdf.groupby(["fuente", "anio"]).size().to_dict()
    (out_dir / "fuego_resumen.json").write_text(json.dumps(
        {"ref": ref, "poligonos": {f"{k[0]} {k[1]}": int(v) for k, v in resumen.items()},
         "celdas_0_2": int(((a <= 2)).sum()), "celdas_3_5": int(((a >= 3) & (a <= 5)).sum())}, indent=1))
    return a
