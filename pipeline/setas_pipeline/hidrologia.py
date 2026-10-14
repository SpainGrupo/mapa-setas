"""Humedad topográfica (modelo v2, rec. 7): TWI y distancia a cauces desde el MDT25 del IGN.

Cálculo a 50 m (MDT25 promediado 2×2, como acceso.py): relleno de depresiones (priority-flood con
épsilon, Barnes et al. 2014), direcciones D8, acumulación de flujo, TWI = ln(a / tan β) con
a = área drenada por unidad de anchura de contorno. Cauce = celda con ≥ UMBRAL_CAUCE_M2 drenados.
Se agrega a 100 m (TWI medio, distancia mínima) y se resume en humedad.tif (0–100):
    h = max( (TWI − p50) / (p95 − p50) , 1 − d_cauce / RADIO_CAUCE_M )   recortado a [0, 1]
Salidas: twi.tif (float32), dist_cauce.tif (m, float32), humedad.tif (uint8, 255 fuera de zona).
"""
from __future__ import annotations
import heapq
from pathlib import Path
import numpy as np
from numba import njit
from scipy.ndimage import distance_transform_edt
from .malla import Malla, NODATA_F, escribir_tif, leer_tif

CELDA = 50.0
UMBRAL_CAUCE_M2 = 500_000.0     # 0,5 km² drenados → cauce (barrancos y canutos incluidos)
RADIO_CAUCE_M = 150.0           # bonus de humedad que decae linealmente hasta 150 m del cauce
TAN_MIN = 0.001
EPS = 1e-4
DR = np.array([-1, -1, 0, 1, 1, 1, 0, -1], np.int64)
DC = np.array([0, 1, 1, 1, 0, -1, -1, -1], np.int64)
DIST = np.array([1, 2 ** 0.5, 1, 2 ** 0.5, 1, 2 ** 0.5, 1, 2 ** 0.5])


@njit(cache=True)
def _rellenar(z, valido, dr, dc):
    H, W = z.shape
    zf = z.copy()
    hecho = ~valido
    heap = [(0.0, np.int64(0))]
    heap.pop()
    for i in range(H):
        for j in range(W):
            if not valido[i, j]:
                continue
            borde = i == 0 or j == 0 or i == H - 1 or j == W - 1
            if not borde:
                for k in range(8):
                    if not valido[i + dr[k], j + dc[k]]:
                        borde = True
                        break
            if borde:
                heapq.heappush(heap, (zf[i, j], np.int64(i * W + j)))
                hecho[i, j] = True
    while len(heap):
        h, p = heapq.heappop(heap)
        i, j = p // W, p % W
        for k in range(8):
            a, b = i + dr[k], j + dc[k]
            if a < 0 or b < 0 or a >= H or b >= W or hecho[a, b]:
                continue
            hecho[a, b] = True
            if zf[a, b] <= h:
                zf[a, b] = h + 1e-4
            heapq.heappush(heap, (zf[a, b], np.int64(a * W + b)))
    return zf


def rellenar(z: np.ndarray, valido: np.ndarray) -> np.ndarray:
    """Rellena depresiones: toda celda válida drena hacia el borde o hacia una celda no válida (mar)."""
    return _rellenar(z.astype("float64"), valido.astype(np.bool_), DR, DC)


@njit(cache=True)
def _d8(zf, valido, dr, dc, dist):
    H, W = zf.shape
    rec = np.full(H * W, -1, np.int64)
    for i in range(H):
        for j in range(W):
            if not valido[i, j]:
                continue
            mejor, kk = 0.0, -1
            for k in range(8):
                a, b = i + dr[k], j + dc[k]
                if a < 0 or b < 0 or a >= H or b >= W or not valido[a, b]:
                    continue
                g = (zf[i, j] - zf[a, b]) / dist[k]
                if g > mejor:
                    mejor, kk = g, k
            if kk >= 0:
                rec[i * W + j] = (i + dr[kk]) * W + (j + dc[kk])
    return rec


@njit(cache=True)
def _acumular(orden, rec, peso):
    acc = peso.copy()
    for p in orden:
        r = rec[p]
        if r >= 0:
            acc[r] += acc[p]
    return acc


def acumulacion(zf: np.ndarray, valido: np.ndarray) -> np.ndarray:
    """Celdas drenadas (incluida la propia) por D8 sobre el MDT relleno; 0 fuera de lo válido."""
    rec = _d8(zf, valido.astype(np.bool_), DR, DC, DIST)
    plano = np.where(valido, zf, -np.inf).ravel()
    orden = np.argsort(-plano, kind="stable")
    orden = orden[np.isfinite(plano[orden])]
    acc = _acumular(orden, rec, valido.ravel().astype("float64"))
    return acc.reshape(zf.shape)


def twi(acc: np.ndarray, z: np.ndarray, celda: float) -> np.ndarray:
    dfil, dcol = np.gradient(z.astype("float64"), celda)
    tanb = np.maximum(np.hypot(dfil, dcol), TAN_MIN)
    return np.log(np.maximum(acc, 1) * celda / tanb).astype("float32")


def indice_humedad(t: np.ndarray, d: np.ndarray, valido: np.ndarray) -> np.ndarray:
    """0–100: lo más alto entre el TWI relativo (p50→0, p95→1) y la cercanía a un cauce."""
    p50, p95 = np.percentile(t[valido], [50, 95])
    h_twi = np.clip((t - p50) / max(p95 - p50, 1e-6), 0, 1)
    h_cauce = np.clip(1 - d / RADIO_CAUCE_M, 0, 1)
    h = np.rint(np.maximum(h_twi, h_cauce) * 100)
    return np.where(valido, h, 255).astype("uint8")


def _agregar(a: np.ndarray, f: int, modo: str) -> np.ndarray:
    """Bloques f×f → media o mínimo de las subceldas válidas (no NaN); NaN si no hay ninguna.
    Así una subcelda de mar (z ≤ 0) en la costa no anula la celda de 100 m."""
    import warnings
    H, W = a.shape[0] // f, a.shape[1] // f
    b = a[:H * f, :W * f].reshape(H, f, W, f).astype("float64")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)       # bloques enteros sin dato
        return np.nanmean(b, axis=(1, 3)) if modo == "media" else np.nanmin(b, axis=(1, 3))


def construir_humedad(malla: Malla, raw_dir: Path, out_dir: Path, verbose=True):
    from .acceso import dem_50m
    out_dir = Path(out_dir)
    z = dem_50m(Path(raw_dir), malla).astype("float64")
    valido = z > 0
    zf = rellenar(z, valido)
    acc = acumulacion(zf, valido)
    t50 = np.where(valido, twi(acc, z, CELDA), np.nan)
    cauce = valido & (acc * CELDA * CELDA >= UMBRAL_CAUCE_M2)
    d50 = (distance_transform_edt(~cauce) * CELDA).astype("float32")
    f = int(malla.celda / CELDA)
    t = _agregar(t50, f, "media")
    d = _agregar(d50, f, "min")
    tierra = leer_tif(out_dir / "altitud.tif") != NODATA_F
    tierra &= np.isfinite(t)
    t = np.where(tierra, t, NODATA_F).astype("float32")
    escribir_tif(malla, out_dir / "twi.tif", t, NODATA_F)
    escribir_tif(malla, out_dir / "dist_cauce.tif", np.where(tierra, d, NODATA_F).astype("float32"), NODATA_F)
    h = indice_humedad(t, d, tierra)
    zona = leer_tif(out_dir / "arbol.tif") != 255
    h[~zona] = 255
    escribir_tif(malla, out_dir / "humedad.tif", h, 255)
    if verbose:
        print(f"  humedad: cauces {cauce.mean() * 100:.1f} % de celdas 50 m; "
              f"h≥50 en {(h[zona & tierra] >= 50).mean() * 100:.1f} % de la zona")
    return h
