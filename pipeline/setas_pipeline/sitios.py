"""Fase 9: sitios candidatos por especie (manchas de idoneidad alta) → data/<region>/out/app/sitios.json.

    uv run python -m setas_pipeline.sitios [--region marbella]   # o: uv run python -m setas_pipeline.exportar sitios

Mancha: conjunto conectado (8 vecinos) de celdas con idoneidad ≥ UMBRAL y área ≥ MIN_HA. Sin filtro
de distancia al acceso (eso lo decide la app con su propio orden).
Submancha: celdas de una mancha dentro de cada cuadrado de 1 km de la rejilla alineada con la malla
(así una mancha enorme da muchos sitios distintos); se descartan las de área < MIN_HA.
area_ha = área de la submancha; area_mancha_ha = la de la mancha entera.
bonus_pisado = clip(dist_camino_m / 300, 0,4, 1): 0,4 en un camino o vía, 1 a ≥ 300 m (sin dato → 0,4).
Punto representativo: la celda con acceso válido (tiempo a pie con dato en acceso.bin) que maximiza
idoneidad × bonus_pisado dentro de la submancha; en empate, la primera en orden de fila. Las
submanchas sin ninguna celda con acceso se descartan.
Datos del punto (los mismos arrays de 100 m que lee la app, para que app y pipeline coincidan):
t_pie_min, subida_m y aparcamiento_id de acceso.bin; dist_camino_m de distancia_acceso.tif
(null sin dato); restringido = el punto cae en un recinto de la capa legal (restricciones_gdf);
meteo_id = punto de meteo_puntos.json más cercano.
Orden por calidad = punt_media × ln(1 + area_ha) × bonus_pisado (manchas buenas, grandes con rendimiento
decreciente y poco pisadas). Se eligen de forma voraz las MAXIMO primeras por especie saltando las que
estén a < 1,5 km de otra ya elegida.
id = índice plano de la celda representativa en la malla (fila·ancho + col): estable entre ejecuciones
mientras no cambie la malla, y sirve para consultar acceso.bin directamente.
Coordenadas: centro de la celda representativa, WGS84, 5 decimales.
"""
from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path
import numpy as np


VERSION = 1
UMBRAL = 60          # idoneidad mínima de una celda de mancha
MIN_HA = 2.0         # área mínima de la mancha
MAXIMO = 150         # sitios por especie
TESELA_M = 1000.0    # las manchas se trocean en cuadrados de este lado (submanchas)
SEPARACION_M = 1500.0  # distancia mínima entre dos sitios elegidos de la misma especie
DIST_PISADO = 300.0  # m al camino a partir de los cuales el bonus por poco pisado es 1
BONUS_MIN = 0.4      # bonus en un camino (o sin dato de distancia)
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


def bonus_pisado(dist) -> np.ndarray:
    """Bonus por poco pisado: clip(dist_camino_m / 300, 0,4, 1); sin dato de distancia → 0,4."""
    d = np.asarray(dist, dtype=np.float64)
    ok = np.isfinite(d) & (d >= 0)
    return np.where(ok, np.clip(np.where(ok, d, 0.0) / DIST_PISADO, BONUS_MIN, 1.0), BONUS_MIN)


def calidad(punt_media: float, area_ha: float, bonus: float = 1.0) -> float:
    return punt_media * float(np.log1p(area_ha)) * bonus


def candidatos(idon, tiempo, subida, origen, dist, celda: float = 100.0, umbral: float = UMBRAL,
               min_ha: float = MIN_HA, maximo: int = MAXIMO, tesela_m: float = TESELA_M,
               separacion_m: float = SEPARACION_M) -> list[dict]:
    """Submanchas ordenadas por calidad (hasta `maximo`, separadas ≥ `separacion_m`), con fila/col de su
    punto representativo y los datos de acceso en esa celda. `tiempo`/`subida` uint16 (0xFFFF sin dato),
    `origen` uint32 (0xFFFFFFFF sin dato), `dist` float (< 0 o NODATA sin dato)."""
    lab, n = manchas(idon, umbral, min_ha, celda)
    if n == 0:
        return []
    H, W = idon.shape
    ha_celda = celda * celda / 1e4
    l = lab.ravel()
    v = idon.ravel().astype(np.float64)
    area_mancha = np.bincount(l, minlength=n + 1) * ha_celda
    # Submancha = celdas de la mancha dentro de cada cuadrado de la rejilla de `tesela_m` (alineada a la malla).
    t = max(1, int(round(tesela_m / celda)))
    ff, cc = np.divmod(np.arange(H * W, dtype=np.int64), W)
    nt = (W + t - 1) // t
    clave = np.where(l > 0, l.astype(np.int64) * ((H + t - 1) // t * nt) + (ff // t) * nt + cc // t, -1)
    dentro = clave >= 0
    _, sub = np.unique(clave[dentro], return_inverse=True)
    ns = int(sub.max()) + 1
    celdas = np.flatnonzero(dentro)
    cnt = np.bincount(sub, minlength=ns)
    suma = np.bincount(sub, weights=v[celdas], minlength=ns)
    pmax = np.zeros(ns)
    np.maximum.at(pmax, sub, v[celdas])
    # Representativo: máximo de idoneidad × bonus_pisado entre las celdas con acceso; empate → menor índice.
    bonus = bonus_pisado(dist).ravel()
    acc = tiempo.ravel()[celdas] != SIN_U16
    idx, sb = celdas[acc], sub[acc]
    orden = np.lexsort((idx, -(v[idx] * bonus[idx]), sb))
    idx, sb = idx[orden], sb[orden]
    primero = np.r_[True, sb[1:] != sb[:-1]] if sb.size else np.zeros(0, bool)
    res = []
    for k, i in zip(sb[primero], idx[primero]):
        k, i = int(k), int(i)
        area = cnt[k] * ha_celda
        if area < min_ha - 1e-9:
            continue
        f, c = divmod(i, W)
        media = suma[k] / cnt[k]
        d = float(dist[f, c])
        o = int(origen[f, c])
        s_ = int(subida[f, c])
        b = float(bonus[i])
        res.append({"fila": f, "col": c, "id": i,
                    "area_ha": round(float(area), 1), "area_mancha_ha": round(float(area_mancha[l[i]]), 1),
                    "punt_media": round(float(media), 1), "punt_max": int(pmax[k]),
                    "t_pie_min": int(tiempo[f, c]), "subida_m": None if s_ == SIN_U16 else s_,
                    "dist_camino_m": None if (d < 0 or not np.isfinite(d)) else int(round(d)),
                    "aparcamiento_id": None if o == SIN_U32 else o, "bonus_pisado": round(b, 2),
                    "_calidad": calidad(float(media), float(area), b)})
    res.sort(key=lambda r: (-r["_calidad"], r["id"]))
    # Diversidad: voraz, se salta lo que esté a < separacion_m de uno ya elegido.
    elegidos, sep2 = [], (separacion_m / celda) ** 2
    for r in res:
        if len(elegidos) >= maximo:
            break
        if all((r["fila"] - e["fila"]) ** 2 + (r["col"] - e["col"]) ** 2 >= sep2 for e in elegidos):
            elegidos.append(r)
    return elegidos


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
                    "area_mancha_ha": r["area_mancha_ha"],
                    "punt_media": r["punt_media"], "punt_max": r["punt_max"], "t_pie_min": r["t_pie_min"],
                    "subida_m": r["subida_m"], "dist_camino_m": r["dist_camino_m"],
                    "aparcamiento_id": r["aparcamiento_id"], "bonus_pisado": r["bonus_pisado"],
                    "restringido": restr,
                    "meteo_id": mas_cercano(lat, lon, meteo) if meteo else None})
    return res


# ---------------------------------------------------------------- datos

def calcular(region, out: Path | None = None, verbose: bool = True) -> dict:
    from .acceso import leer_app
    from .exportar import especies_activas, restricciones_gdf
    from .malla import Malla, leer_tif
    out = out or region.app
    malla = Malla.cargar(region.out / "malla.json")
    cab, acc = leer_app(out)
    assert (cab["ancho"], cab["alto"]) == (malla.ancho, malla.alto), "acceso.bin no está en la malla"
    dist = leer_tif(region.out / "distancia_acceso.tif")
    restr = list(restricciones_gdf(region).geometry)
    meteo = json.loads((out / "meteo_puntos.json").read_text())
    datos = {"version": VERSION, "generado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
             "especies": {}}
    for e in especies_activas(region):
        idon = leer_tif(region.out / f"idoneidad_{e['id']}.tif")
        lista = candidatos(idon, acc["tiempo_pie_min"], acc["subida_m"], acc["origen_id"], dist, malla.celda)
        datos["especies"][e["id"]] = georreferenciar(lista, malla, restr, meteo)
        if verbose:
            print(f"  sitios {e['id']}: {len(lista)}", flush=True)
    out.mkdir(parents=True, exist_ok=True)
    (out / "sitios.json").write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")))
    return datos


if __name__ == "__main__":
    from .region import region_cli
    calcular(region_cli())
