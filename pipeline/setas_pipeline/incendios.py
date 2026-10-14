"""Incendios → fuego.tif: años desde el último incendio registrado en cada celda (modelo v2, rec. 3).

Fuentes (fuentes.yaml → incendios): perímetros REDIAM/INFOCA por año (WFS, CC BY 4.0), EFFIS
burnt areas MODIS (WFS, CC BY 4.0; cubre el año en curso, que REDIAM aún no publica) y el MFE
("Procede de incendio con fecha", fc_evento). Por celda se queda el año más reciente.
255 (SIN_FUEGO) = sin incendio en la ventana considerada; NODATA no se usa (fuera de zona = 255 también,
la idoneidad ya es 0 allí por arbol.tif).
"""
from __future__ import annotations
import json
from datetime import date
from pathlib import Path
import geopandas as gpd, numpy as np, pandas as pd, yaml
from pyproj import Transformer
from rasterio.features import rasterize
from .malla import Malla, CRS, SIN_FUEGO, escribir_tif
from .descargas import obtener

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


def _rediam(cfg: dict, malla: Malla, raw: Path, anios) -> list[gpd.GeoDataFrame]:
    xmin, ymin, xmax, ymax = (int(v) for v in malla.bounds)
    out = []
    for y in anios:
        url = cfg["rediam_url"].format(anio=y, xmin=xmin, ymin=ymin, xmax=xmax, ymax=ymax)
        datos = obtener(url, raw / f"rediam_{y}_{xmin}_{ymin}_{xmax}_{ymax}.json", timeout=600)
        g = gpd.GeoDataFrame.from_features(datos.get("features", []), crs=CRS)
        if len(g):
            out.append(g.assign(anio=y, fuente="REDIAM")[["anio", "fuente", "geometry"]])
    return out


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


def _effis(cfg: dict, malla: Malla, raw: Path, desde: int) -> list[gpd.GeoDataFrame]:
    lon0, lat0, lon1, lat1 = caja_wgs84(malla.bounds)
    # Redondeo hacia fuera para no recortar la caja.
    caja = [np.floor(lat0 * 1000) / 1000, np.floor(lon0 * 1000) / 1000,
            np.ceil(lat1 * 1000) / 1000, np.ceil(lon1 * 1000) / 1000]
    caja = [round(float(v), 3) for v in caja]
    url = cfg["effis_url"].format(lat0=caja[0], lon0=caja[1], lat1=caja[2], lon1=caja[3])
    datos = obtener(url, raw / f"effis_{'_'.join(map(str, caja))}.json", timeout=600)
    g = gpd.GeoDataFrame.from_features(datos.get("features", []), crs="EPSG:4326")
    if not len(g):
        return []
    g["anio"] = g["FIREDATE"].astype(str).str[:4].astype(int)
    g = g[g["anio"] >= desde]
    return [g.assign(fuente="EFFIS")[["anio", "fuente", "geometry"]].to_crs(CRS)]


def construir_fuego(malla: Malla, raw_dir: Path, out_dir: Path, fuentes: Path, ref: int | None = None,
                    mfe: gpd.GeoDataFrame | None = None):
    ref = ref or date.today().year
    cfg = yaml.safe_load(Path(fuentes).read_text())["incendios"]
    raw = Path(raw_dir) / "incendios"
    raw.mkdir(parents=True, exist_ok=True)
    desde = ref - VENTANA_ANIOS
    anios_rediam = [y for y in range(max(desde, cfg["rediam_desde"]), cfg["rediam_hasta"] + 1)]
    trozos = _rediam(cfg, malla, raw, anios_rediam) + _effis(cfg, malla, raw, desde)
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
    escribir_tif(malla, Path(out_dir) / "fuego.tif", a, None)
    resumen = gdf.groupby(["fuente", "anio"]).size().to_dict()
    (Path(out_dir) / "fuego_resumen.json").write_text(json.dumps(
        {"ref": ref, "poligonos": {f"{k[0]} {k[1]}": int(v) for k, v in resumen.items()},
         "celdas_0_2": int(((a <= 2)).sum()), "celdas_3_5": int(((a >= 3) & (a <= 5)).sum())}, indent=1))
    return a
