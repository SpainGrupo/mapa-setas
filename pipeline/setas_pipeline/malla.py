"""Malla común: todas las capas comparten CRS, origen y celda."""
from __future__ import annotations
import json, math
from dataclasses import dataclass, asdict
from pathlib import Path
import numpy as np
import rasterio
from rasterio.transform import from_origin

CRS = "EPSG:25830"
NODATA_F = -9999.0
ARBOL = {"sin_arbolado": 0, "alcornoque": 1, "encina": 2, "quejigo": 3,
         "castano": 4, "pino": 5, "pinsapo": 6, "otro": 7,
         "sabina": 8}   # 2026-10-15 multi-región: añadido al final sin renumerar (arbol.tif de Marbella no cambia)
SUELO = {"desconocido": 0, "acido": 1, "basico": 2, "ultrabasico": 3, "otro": 4}
# Modelo v2 (2026-10-14): estructura del rodal y cubierta desarbolada (MFE), años desde el último incendio
ESTADO = {"sin_dato": 0, "monte_bravo": 1, "latizal": 2, "fustal": 3}     # estado de masa de la especie 1
CUBIERTA = {"ninguna": 0, "matorral": 1, "pastizal_matorral": 2, "pastizal": 3}
SIN_FUEGO = 255        # fuego.tif: sin incendio registrado (si no, años desde el último, 0..254)


@dataclass(frozen=True)
class Malla:
    x0: float      # borde oeste
    y1: float      # borde norte
    ancho: int
    alto: int
    celda: float = 100.0

    @classmethod
    def desde_bounds(cls, xmin, ymin, xmax, ymax, celda=100.0) -> "Malla":
        x0 = math.floor(xmin / celda) * celda
        y0 = math.floor(ymin / celda) * celda
        x1 = math.ceil(xmax / celda) * celda
        y1 = math.ceil(ymax / celda) * celda
        return cls(x0, y1, int((x1 - x0) / celda), int((y1 - y0) / celda), celda)

    @property
    def transform(self):
        return from_origin(self.x0, self.y1, self.celda, self.celda)

    @property
    def bounds(self):
        return (self.x0, self.y1 - self.alto * self.celda,
                self.x0 + self.ancho * self.celda, self.y1)

    def guardar(self, ruta: Path) -> None:
        Path(ruta).write_text(json.dumps(asdict(self)))

    @classmethod
    def cargar(cls, ruta: Path) -> "Malla":
        return cls(**json.loads(Path(ruta).read_text()))


def escribir_tif(malla: Malla, ruta: Path, array: np.ndarray, nodata) -> None:
    assert array.shape == (malla.alto, malla.ancho), array.shape
    Path(ruta).parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(ruta, "w", driver="GTiff", height=malla.alto, width=malla.ancho,
                       count=1, dtype=array.dtype, crs=CRS, transform=malla.transform,
                       nodata=nodata, compress="deflate") as dst:
        dst.write(array, 1)


def leer_tif(ruta: Path) -> np.ndarray:
    with rasterio.open(ruta) as src:
        return src.read(1)
