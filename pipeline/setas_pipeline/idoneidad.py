"""Idoneidad 0–100 por especie: árbol × altitud × orientación × pendiente × suelo."""
from __future__ import annotations
from pathlib import Path
import numpy as np, yaml
from .malla import ARBOL, SUELO, NODATA_F, Malla, leer_tif, escribir_tif

LLANO = 0.9
PENDIENTE_MAX = 35.0
FACTOR_PENDIENTE = 0.5


def cargar_perfiles(ruta: Path) -> dict:
    return yaml.safe_load(Path(ruta).read_text())


def _tabla(pesos: dict, codigos: dict, defecto=0.0) -> np.ndarray:
    t = np.full(max(codigos.values()) + 1, defecto, "float32")
    for k, v in pesos.items():
        t[codigos[k]] = v
    return t


def _f_altitud(alt, a):
    f = np.zeros_like(alt, dtype="float32")
    sube = (alt >= a["min"]) & (alt < a["opt_min"])
    f[sube] = (alt[sube] - a["min"]) / (a["opt_min"] - a["min"])
    f[(alt >= a["opt_min"]) & (alt <= a["opt_max"])] = 1.0
    baja = (alt > a["opt_max"]) & (alt <= a["max"])
    f[baja] = (a["max"] - alt[baja]) / (a["max"] - a["opt_max"])
    return f


def _f_orientacion(ori, modo):
    if modo == "indiferente":
        f = np.ones_like(ori, dtype="float32")
    else:
        # cos=1 mirando al norte y -1 al sur → umbría: 0.7..1.0 ; solana: al revés
        c = np.cos(np.radians(ori))
        f = (0.85 + 0.15 * c) if modo == "umbria" else (0.85 - 0.15 * c)
        f = f.astype("float32")
    return np.where(ori < 0, LLANO if modo != "indiferente" else 1.0, f)


def puntuar(perfil, arbol, altitud, orientacion, pendiente, suelo) -> np.ndarray:
    f_arbol = _tabla(perfil["arboles"], ARBOL)[np.minimum(arbol, max(ARBOL.values()))]
    f_suelo = _tabla(perfil["suelo"], SUELO, defecto=0.6)[np.minimum(suelo, max(SUELO.values()))]
    f_alt = _f_altitud(altitud, perfil["altitud"])
    f_ori = _f_orientacion(orientacion, perfil["orientacion"])
    f_pend = np.where(pendiente > PENDIENTE_MAX, FACTOR_PENDIENTE, 1.0)
    s = f_arbol * f_suelo * f_alt * f_ori * f_pend
    s = np.where((altitud == NODATA_F) | (arbol == 255), 0, s)
    return np.rint(np.clip(s, 0, 1) * 100).astype("uint8")


def construir_idoneidad(out_dir: Path, perfiles: dict):
    malla = Malla.cargar(out_dir / "malla.json")
    capas = {n: leer_tif(out_dir / f"{n}.tif")
             for n in ["arbol", "altitud", "orientacion", "pendiente", "suelo"]}
    for clave, perfil in perfiles.items():
        s = puntuar(perfil, capas["arbol"], capas["altitud"], capas["orientacion"],
                    capas["pendiente"], capas["suelo"])
        escribir_tif(malla, out_dir / f"idoneidad_{clave}.tif", s, 0)
