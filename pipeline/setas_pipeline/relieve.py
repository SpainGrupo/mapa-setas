"""Relieve: MDT25 del IGN (WCS, PNOA-LiDAR) → altitud, pendiente y orientación en la malla."""
from __future__ import annotations
from pathlib import Path
import numpy as np
import requests, yaml
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.merge import merge
from .malla import Malla, CRS, NODATA_F, escribir_tif

LLANO_GRADOS = 2.0
_ND16 = -32768


def pendiente_orientacion(z: np.ndarray, celda: float):
    dz_dfila, dz_dcol = np.gradient(z.astype("float64"), celda)
    dz_dx = dz_dcol            # este
    dz_dy = -dz_dfila          # norte (las filas crecen hacia el sur)
    pend = np.degrees(np.arctan(np.hypot(dz_dx, dz_dy)))
    orient = (np.degrees(np.arctan2(-dz_dx, -dz_dy)) + 360) % 360
    orient = np.where(pend < LLANO_GRADOS, -1.0, orient)
    return pend.astype("float32"), orient.astype("float32")


def teselas_wcs(malla: Malla, lado_m: float = 100_000):
    """Teselas (xmin, ymin, xmax, ymax) que cubren la malla, ajustadas a su rejilla."""
    xmin, ymin, xmax, ymax = malla.bounds
    out = []
    y = ymin
    while y < ymax:
        y2 = min(y + lado_m, ymax)
        x = xmin
        while x < xmax:
            out.append((x, y, min(x + lado_m, xmax), y2))
            x += lado_m
        y += lado_m
    return out


def construir_relieve(malla: Malla, raw_dir: Path, out_dir: Path, fuentes: Path):
    dem = yaml.safe_load(Path(fuentes).read_text())["dem"]
    dir_dem = Path(raw_dir) / "dem"
    dir_dem.mkdir(parents=True, exist_ok=True)
    rutas = []
    for xmin, ymin, xmax, ymax in teselas_wcs(malla, dem["tesela_m"]):
        ruta = dir_dem / f"mdt25_{int(xmin)}_{int(ymin)}.tif"
        if not ruta.exists():
            url = dem["url_patron"].format(coverage_id=dem["coverage_id"], xmin=int(xmin),
                                           xmax=int(xmax), ymin=int(ymin), ymax=int(ymax))
            r = requests.get(url, timeout=300)
            r.raise_for_status()
            if r.content[:2] not in (b"II", b"MM"):
                raise RuntimeError(f"WCS no devolvió un TIFF: {r.content[:200]!r}")
            ruta.write_bytes(r.content)
        rutas.append(ruta)
    srcs = [rasterio.open(p) for p in rutas]
    mosaico, trans = merge(srcs, nodata=_ND16)
    for s in srcs:
        s.close()
    z = mosaico[0]
    z[(z <= 0) & (z != _ND16)] = _ND16      # mar: 0 y negativos de costa
    alt = np.full((malla.alto, malla.ancho), NODATA_F, "float32")
    reproject(z, alt, src_transform=trans, src_crs=CRS, src_nodata=_ND16,
              dst_transform=malla.transform, dst_crs=CRS, dst_nodata=NODATA_F,
              resampling=Resampling.average)
    mar = alt == NODATA_F
    pend, orient = pendiente_orientacion(np.where(mar, np.nan, alt), malla.celda)
    # el borde de costa hereda NaN del gradiente: también queda como NODATA
    nd = mar | np.isnan(pend)
    pend[nd] = NODATA_F
    orient[nd] = NODATA_F
    out_dir = Path(out_dir)
    escribir_tif(malla, out_dir / "altitud.tif", alt, NODATA_F)
    escribir_tif(malla, out_dir / "pendiente.tif", pend, NODATA_F)
    escribir_tif(malla, out_dir / "orientacion.tif", orient, NODATA_F)
