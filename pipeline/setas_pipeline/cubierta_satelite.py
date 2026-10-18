"""Cubierta arbórea satelital reciente → data/<region>/out/arbol_sat.tif (% de la celda de 100 m con árbol).

    uv run python -m setas_pipeline.cubierta_satelite [--region marbella]   # o: ejecutar satelite

Fuente: ESA WorldCover 2021 v200 (Sentinel-1/2, 10 m), clase 10 «Tree cover». Licencia CC BY 4.0.
Teselas COG de 3°×3° en el bucket público de AWS (sin cuenta), leídas por ventanas con /vsicurl/ (no se
descarga la tesela entera). Elegida frente a Copernicus HRL Tree Cover Density 2018 porque esta exige cuenta
del Land Monitoring Service para descargar; WorldCover es abierta y más reciente (2021 frente a 2018).
Limitación: es una clase binaria por píxel de 10 m (árbol sí/no), no densidad de copas; un árbol suelto de copa
pequeña puede no verse y el matorral alto puede confundirse con árbol. Se usa como % de píxeles árbol en la
celda de 100 m (media de 100 píxeles), comparable en orden de magnitud con la FCC del MFE.
Salida: uint8 0–100, NODATA 255 (fuera de las teselas o en agua/sin dato de WorldCover).
"""
from __future__ import annotations
import math
import numpy as np

URL = ("/vsicurl/https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/"
       "ESA_WorldCover_10m_2021_v200_{tesela}_Map.tif")
CLASE_ARBOL = 10
NODATA = 255
BLOQUE = 200          # celdas de la malla por bloque de lectura (20 km)
FUENTE = "ESA WorldCover 2021 v200 (10 m, clase árbol)"


def nombre_tesela(lat0: int, lon0: int) -> str:
    """Nombre de tesela WorldCover para la esquina SO (múltiplos de 3): N36W006, N39E000…"""
    return f"{'N' if lat0 >= 0 else 'S'}{abs(lat0):02d}{'E' if lon0 >= 0 else 'W'}{abs(lon0):03d}"


def teselas_bbox(lon0: float, lat0: float, lon1: float, lat1: float) -> list[str]:
    la = range(math.floor(lat0 / 3) * 3, math.floor(lat1 / 3) * 3 + 1, 3)
    lo = range(math.floor(lon0 / 3) * 3, math.floor(lon1 / 3) * 3 + 1, 3)
    return [nombre_tesela(a, o) for a in la for o in lo]


def calcular(region, verbose: bool = True):
    import rasterio
    from rasterio.warp import reproject, Resampling, transform_bounds
    from rasterio.windows import from_bounds, Window
    from rasterio.transform import from_origin
    from .malla import Malla, CRS, escribir_tif
    malla = Malla.cargar(region.out / "malla.json")
    suma = np.zeros((malla.alto, malla.ancho), "float32")     # % árbol × fracción cubierta por la tesela
    peso = np.zeros((malla.alto, malla.ancho), "float32")     # fracción de la celda con dato
    x1, y0 = malla.x0 + malla.ancho * malla.celda, malla.y1 - malla.alto * malla.celda
    bb = transform_bounds(CRS, "EPSG:4326", malla.x0, y0, x1, malla.y1)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY="5",
                      GDAL_HTTP_RETRY_DELAY="2", VSI_CACHE="TRUE"):
        for t in teselas_bbox(*bb):
            try:
                src = rasterio.open(URL.format(tesela=t))
            except rasterio.errors.RasterioIOError:
                if verbose:
                    print(f"  satélite: tesela {t} no existe (mar), se salta", flush=True)
                continue
            with src:
                for f0 in range(0, malla.alto, BLOQUE):
                    for c0 in range(0, malla.ancho, BLOQUE):
                        h, w = min(BLOQUE, malla.alto - f0), min(BLOQUE, malla.ancho - c0)
                        bx0 = malla.x0 + c0 * malla.celda; by1 = malla.y1 - f0 * malla.celda
                        b4 = transform_bounds(CRS, "EPSG:4326", bx0, by1 - h * malla.celda, bx0 + w * malla.celda, by1)
                        win = from_bounds(*b4, src.transform).round_offsets().round_lengths()
                        win = win.intersection(Window(0, 0, src.width, src.height)) if _corta(win, src) else None
                        if win is None or win.width < 1 or win.height < 1:
                            continue
                        a = src.read(1, window=win)
                        valido = a != 0
                        if not valido.any():
                            continue
                        arbol = np.where(valido, (a == CLASE_ARBOL).astype("float32") * 100, np.nan).astype("float32")
                        cob = valido.astype("float32")
                        tr_src = src.window_transform(win)
                        tr_dst = from_origin(bx0, by1, malla.celda, malla.celda)
                        da = np.full((h, w), np.nan, "float32"); dv = np.zeros((h, w), "float32")
                        reproject(arbol, da, src_transform=tr_src, src_crs=src.crs, dst_transform=tr_dst,
                                  dst_crs=CRS, src_nodata=np.nan, dst_nodata=np.nan, resampling=Resampling.average)
                        reproject(cob, dv, src_transform=tr_src, src_crs=src.crs, dst_transform=tr_dst,
                                  dst_crs=CRS, src_nodata=None, dst_nodata=0, resampling=Resampling.average)
                        ok = np.isfinite(da) & (dv > 0)
                        suma[f0:f0 + h, c0:c0 + w] += np.where(ok, da * dv, 0)
                        peso[f0:f0 + h, c0:c0 + w] += np.where(ok, dv, 0)
            if verbose:
                print(f"  satélite: tesela {t} leída", flush=True)
    res = np.full(suma.shape, NODATA, "uint8")
    ok = peso > 0.05
    res[ok] = np.clip(np.round(suma[ok] / peso[ok]), 0, 100).astype("uint8")
    escribir_tif(malla, region.out / "arbol_sat.tif", res, NODATA)
    if verbose:
        print(f"  satélite: arbol_sat.tif ({ok.mean():.0%} de celdas con dato)", flush=True)
    return res


def _corta(win, src) -> bool:
    return not (win.col_off >= src.width or win.row_off >= src.height
                or win.col_off + win.width <= 0 or win.row_off + win.height <= 0)


if __name__ == "__main__":
    from .region import region_cli
    calcular(region_cli())
