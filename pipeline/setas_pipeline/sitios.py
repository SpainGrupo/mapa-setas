"""Fase 9: sitios candidatos por especie (manchas de idoneidad alta) → data/out/app/sitios.json.

    uv run python -m setas_pipeline.sitios          # o: uv run python -m setas_pipeline.exportar sitios

Mancha: conjunto conectado (8 vecinos) de celdas con idoneidad ≥ UMBRAL y área ≥ MIN_HA. Sin filtro
de distancia al acceso (eso lo decide la app con su propio orden).
Punto representativo: la celda de mayor idoneidad de la mancha con acceso válido (tiempo a pie con dato
en acceso.bin); en empate, la primera en orden de fila. Las manchas sin ninguna celda con acceso se
descartan.
Datos del punto (los mismos arrays de 100 m que lee la app, para que app y pipeline coincidan):
t_pie_min, subida_m y aparcamiento_id de acceso.bin; dist_camino_m de distancia_acceso.tif
(null sin dato); restringido = el punto cae en un recinto de la capa legal (restricciones_gdf);
meteo_id = punto de meteo_puntos.json más cercano.
Orden por calidad = punt_media × ln(1 + area_ha) (premia manchas buenas y grandes, con rendimiento
decreciente del área); se conservan las MAXIMO primeras por especie.
id = índice plano de la celda representativa en la malla (fila·ancho + col): estable entre ejecuciones
mientras no cambie la malla, y sirve para consultar acceso.bin directamente.
Coordenadas: centro de la celda representativa, WGS84, 5 decimales.
"""
from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path
import numpy as np

BASE = Path(__file__).resolve().parent.parent
OUT = BASE / "data/out"
APP = OUT / "app"

VERSION = 1
UMBRAL = 60          # idoneidad mínima de una celda de mancha
MIN_HA = 2.0         # área mínima de la mancha
MAXIMO = 150         # manchas por especie
SIN_U16 = 0xFFFF
SIN_U32 = 0xFFFFFFFF
NODATA_DIST = -9999.0


# ---------------------------------------------------------------- lógica pura

def manchas(idon: np.ndarray, umbral: float = UMBRAL, min_ha: float = MIN_HA, celda: float = 100.0):
    """Etiquetas (0 = fuera) de las manchas 8-conexas de idoneidad ≥ umbral con área ≥ min_ha.
    Devuelve (etiquetas renumeradas 1..n, n)."""
    from scipy import ndimage
    lab, n = ndimage.label(idon >= umbral, structure=np.ones((3, 3), bool))
    if n == 0:
        return lab, 0
    ha_celda = celda * celda / 1e4
    cnt = np.bincount(lab.ravel(), minlength=n + 1)
    ok = cnt * ha_celda >= min_ha - 1e-9
    ok[0] = False
    nuevo = np.zeros(n + 1, lab.dtype)
    nuevo[ok] = np.arange(1, int(ok.sum()) + 1)
    return nuevo[lab], int(ok.sum())


def calidad(punt_media: float, area_ha: float) -> float:
    return punt_media * float(np.log1p(area_ha))


def candidatos(idon, tiempo, subida, origen, dist, celda: float = 100.0, umbral: float = UMBRAL,
               min_ha: float = MIN_HA, maximo: int = MAXIMO) -> list[dict]:
    """Manchas ordenadas por calidad (hasta `maximo`), con fila/col de su punto representativo y los
    datos de acceso en esa celda. `tiempo`/`subida` uint16 (0xFFFF sin dato), `origen` uint32
    (0xFFFFFFFF sin dato), `dist` float (< 0 o NODATA sin dato)."""
    lab, n = manchas(idon, umbral, min_ha, celda)
    if n == 0:
        return []
    H, W = idon.shape
    ha_celda = celda * celda / 1e4
    l = lab.ravel()
    v = idon.ravel().astype(np.float64)
    cnt = np.bincount(l, minlength=n + 1)
    suma = np.bincount(l, weights=v, minlength=n + 1)
    pmax = np.zeros(n + 1)
    np.maximum.at(pmax, l, v)
    # Representativo: mayor idoneidad con acceso; empate → menor índice plano.
    acc = (l > 0) & (tiempo.ravel() != SIN_U16)
    idx = np.flatnonzero(acc)
    orden = np.lexsort((idx, -v[idx], l[idx]))
    idx = idx[orden]
    primero = np.r_[True, l[idx][1:] != l[idx][:-1]]
    rep = {int(l[i]): int(i) for i in idx[primero]}
    res = []
    for k, i in rep.items():
        f, c = divmod(i, W)
        area = cnt[k] * ha_celda
        media = suma[k] / cnt[k]
        d = float(dist[f, c])
        o = int(origen[f, c])
        s = int(subida[f, c])
        res.append({"fila": f, "col": c, "id": i,
                    "area_ha": round(float(area), 1), "punt_media": round(float(media), 1),
                    "punt_max": int(pmax[k]), "t_pie_min": int(tiempo[f, c]),
                    "subida_m": None if s == SIN_U16 else s,
                    "dist_camino_m": None if (d < 0 or not np.isfinite(d)) else int(round(d)),
                    "aparcamiento_id": None if o == SIN_U32 else o,
                    "_calidad": calidad(float(media), float(area))})
    res.sort(key=lambda r: (-r["_calidad"], r["id"]))
    return res[:maximo]


def mas_cercano(lat: float, lon: float, puntos: list[dict]) -> int:
    """id del punto (lat/lon) más cercano (equirectangular; sobra a esta escala)."""
    la = np.array([p["lat"] for p in puntos]); lo = np.array([p["lon"] for p in puntos])
    dx = (lo - lon) * np.cos(np.radians(lat))
    return int(puntos[int(np.argmin(dx * dx + (la - lat) ** 2))]["id"])


def georreferenciar(lista: list[dict], malla, restricciones=None, meteo: list[dict] | None = None) -> list[dict]:
    """Añade lat/lon (centro de celda, WGS84, 5 dec.), restringido y meteo_id; deja los campos del contrato."""
    from pyproj import Transformer
    from shapely import STRtree
    from shapely.geometry import Point
    tr = Transformer.from_crs("EPSG:25830", "EPSG:4326", always_xy=True)
    arbol = STRtree(list(restricciones)) if restricciones is not None and len(restricciones) else None
    res = []
    for r in lista:
        x = malla.x0 + (r["col"] + 0.5) * malla.celda
        y = malla.y1 - (r["fila"] + 0.5) * malla.celda
        lon, lat = tr.transform(x, y)
        restr = bool(len(arbol.query(Point(lon, lat), predicate="intersects"))) if arbol is not None else False
        res.append({"id": r["id"], "lat": round(lat, 5), "lon": round(lon, 5), "area_ha": r["area_ha"],
                    "punt_media": r["punt_media"], "punt_max": r["punt_max"], "t_pie_min": r["t_pie_min"],
                    "subida_m": r["subida_m"], "dist_camino_m": r["dist_camino_m"],
                    "aparcamiento_id": r["aparcamiento_id"], "restringido": restr,
                    "meteo_id": mas_cercano(lat, lon, meteo) if meteo else None})
    return res


# ---------------------------------------------------------------- datos

def calcular(out: Path = APP, verbose: bool = True) -> dict:
    from .acceso import leer_app
    from .exportar import especies, restricciones_gdf
    from .malla import Malla, leer_tif
    malla = Malla.cargar(OUT / "malla.json")
    cab, acc = leer_app(out)
    assert (cab["ancho"], cab["alto"]) == (malla.ancho, malla.alto), "acceso.bin no está en la malla"
    dist = leer_tif(OUT / "distancia_acceso.tif")
    restr = list(restricciones_gdf().geometry)
    meteo = json.loads((out / "meteo_puntos.json").read_text())
    datos = {"version": VERSION, "generado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
             "especies": {}}
    for e in especies():
        idon = leer_tif(OUT / f"idoneidad_{e['id']}.tif")
        lista = candidatos(idon, acc["tiempo_pie_min"], acc["subida_m"], acc["origen_id"], dist, malla.celda)
        datos["especies"][e["id"]] = georreferenciar(lista, malla, restr, meteo)
        if verbose:
            print(f"  sitios {e['id']}: {len(lista)}", flush=True)
    out.mkdir(parents=True, exist_ok=True)
    (out / "sitios.json").write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")))
    return datos


if __name__ == "__main__":
    calcular()
