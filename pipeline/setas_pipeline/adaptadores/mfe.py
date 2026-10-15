"""Vegetación (tipo de capa `mfe`, multi-región fase C): recintos del Mapa Forestal normalizados a los códigos de
malla.py, para regiones que declaran `capas.mfe` (las que no, como Marbella, siguen con vegetacion.py tal cual).

- `iepnb_mfe`: WFS nacional del IEPNB (el mismo de fuentes.yaml → mfe). Antes de descargar comprueba que el servidor
  responde (GetCapabilities con reintentos); si no, lanza FuenteCaida sin trocear páginas contra un servidor caído.
- `arcgis_mfe`: MFE50 del ICV (ArcGIS REST, capa 41), con la especie 1 por nombre IFN (`sp1_nom_ifn`).
"""
from __future__ import annotations
import time
from pathlib import Path
import geopandas as gpd
import numpy as np
import pandas as pd
import requests
from . import CRS, Contexto, registrar, vacio
from ..malla import ARBOL, CUBIERTA, ESTADO

ESPERAS_S = (30, 60, 120)          # entre comprobaciones de salud del IEPNB


class FuenteCaida(RuntimeError):
    """La fuente no responde (5xx, timeout o conexión) tras los reintentos."""


def clase_arbol_nombre(nombre, mapeo: dict) -> int:
    """Especie 1 por nombre IFN → código ARBOL: el prefijo más largo de `mapeo` que casa; sin especie →
    sin_arbolado; especie sin prefijo → otro."""
    if nombre is None or (isinstance(nombre, float) and pd.isna(nombre)) or not str(nombre).strip():
        return ARBOL["sin_arbolado"]
    n = str(nombre).strip()
    for prefijo in sorted(mapeo, key=len, reverse=True):
        if n.startswith(prefijo):
            return ARBOL[mapeo[prefijo]]
    return ARBOL["otro"]


def _cubierta(textos: pd.Series, mapeo: dict) -> list[int]:
    inv = {str(v).strip().lower(): CUBIERTA[k] for k, vs in mapeo.items() for v in vs}
    return [inv.get(str(t).strip().lower(), CUBIERTA["ninguna"]) if isinstance(t, str) else CUBIERTA["ninguna"]
            for t in textos]


def _estado(textos: pd.Series) -> list[int]:
    from ..vegetacion import ESTADO_MFE
    return [ESTADO[ESTADO_MFE.get(str(t).strip().lower(), "sin_dato")] if isinstance(t, str) else ESTADO["sin_dato"]
            for t in textos]


def _gdf(ids, arbol, fcc, estado, cubierta, anio, artificial, geometria) -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame({"id": [str(i) for i in ids], "arbol": np.asarray(arbol, "uint8"),
                             "fcc": np.clip(np.nan_to_num(np.asarray(fcc, "float64")), 0, 100).astype("uint8"),
                             "estado": np.asarray(estado, "uint8"), "cubierta": np.asarray(cubierta, "uint8"),
                             "anio_incendio": np.asarray(anio, "int32"), "artificial": np.asarray(artificial, bool)},
                            geometry=list(geometria), crs=CRS)


@registrar("mfe", "arcgis_mfe")
def arcgis_mfe(cfg: dict, ctx: Contexto) -> gpd.GeoDataFrame:
    from .generico import consultar_arcgis, _zona
    g = consultar_arcgis(cfg["url"], _zona(ctx), Path(ctx.raw) / cfg.get("cache", "mfe_arcgis"),
                         cfg.get("pagina", 1000), cfg.get("tesela_m", 25000))
    if not len(g):
        return vacio("mfe")
    if "idfotofija" in g.columns:
        g = g.drop_duplicates("idfotofija")
    tipestr = g.get("tipestr_definicion", pd.Series([None] * len(g), index=g.index))
    artificial = tipestr.fillna("").str.strip().isin(cfg.get("artificial", ["Artificial"]))
    return _gdf(g.get("idfotofija", g.index), [clase_arbol_nombre(n, cfg["mapeo_arbol"]) for n in g["sp1_nom_ifn"]],
                pd.to_numeric(g["fccarb"], errors="coerce"), _estado(g["e1_definicion"]),
                _cubierta(tipestr, cfg.get("mapeo_cubierta", {})), [0] * len(g), artificial, g.geometry)


def comprobar_wfs(url: str, intentos: int = 3, esperas=ESPERAS_S) -> None:
    """GetCapabilities con reintentos; FuenteCaida si no responde 2xx."""
    ultimo = ""
    for i in range(intentos):
        try:
            r = requests.get(f"{url}?service=WFS&request=GetCapabilities", timeout=60)
            if r.status_code < 400:
                return
            ultimo = f"HTTP {r.status_code}"
        except (requests.Timeout, requests.ConnectionError) as e:
            ultimo = type(e).__name__
        if i < intentos - 1:
            espera = esperas[min(i, len(esperas) - 1)]
            print(f"  IEPNB no responde ({ultimo}); nuevo intento en {espera} s", flush=True)
            time.sleep(espera)
    raise FuenteCaida(f"{url} no responde ({ultimo}) tras {intentos} intentos")


@registrar("mfe", "iepnb_mfe")
def iepnb_mfe(cfg: dict, ctx: Contexto) -> gpd.GeoDataFrame:
    from ..descargas import descargar_teselas
    from ..vegetacion import (PAGINA_MFE, TESELA_MFE, anio_incendio_mfe, clasificar, clasificar_cubierta,
                              clasificar_estado, plantilla_mfe)
    from ..edificado import TIPESTR_ARTIFICIAL
    m = ctx.fuentes["mfe"]
    comprobar_wfs(m["wfs_url"], cfg.get("intentos", 3))
    zona = ctx.zona
    arb = descargar_teselas(plantilla_mfe(m), zona, TESELA_MFE, Path(ctx.raw) / "mfe", pagina=PAGINA_MFE)
    arb = arb.drop_duplicates("id_ff21") if len(arb) else arb
    d = ctx.fuentes["mfe_desarbolado"]
    des = descargar_teselas(plantilla_mfe(m, d["filtro"]), zona, TESELA_MFE, Path(ctx.raw) / "mfe_desarbolado",
                            pagina=d["pagina"])
    des = des.drop_duplicates("id_ff21") if len(des) else des
    trozos = []
    if len(arb):
        trozos.append(_gdf(arb["id_ff21"], clasificar(arb[m["campo_especie_dominante"]], m["mapeo_arbol"]),
                           arb["nm_fccarb"].fillna(0), clasificar_estado(arb["nom_e1"]), [0] * len(arb),
                           anio_incendio_mfe(arb).astype(int),
                           arb["nb_tipestr"].fillna("").str.lower().str.contains(TIPESTR_ARTIFICIAL), arb.geometry))
    if len(des):
        trozos.append(_gdf(des["id_ff21"], [ARBOL["sin_arbolado"]] * len(des), [0] * len(des),
                           [ESTADO["sin_dato"]] * len(des), clasificar_cubierta(des["id_tipestr"], d["mapeo_cubierta"]),
                           [0] * len(des), [False] * len(des), des.geometry))
    return gpd.GeoDataFrame(pd.concat(trozos, ignore_index=True), crs=CRS) if trozos else vacio("mfe")
