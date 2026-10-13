"""Idoneidad 0–100 por especie (modelo v2, 2026-10-14; todo HEURÍSTICO).

    hábitat = max(árbol × dosel × estado de masa, cubierta desarbolada)
    idoneidad = hábitat × altitud × (orientación × pendiente) × pendiente extrema × suelo
                × incendio (solo micorrícicas) × humedad (TWI / cauces) × jaral cercano (si el perfil lo pide)

Fuentes de cada factor: docs/investigacion/2026-10-14-factores-y-trucos.md (recs. 2, 3, 4, 7, 8).
Las capas v2 son opcionales: si falta una, su factor es neutro (1).
"""
from __future__ import annotations
from pathlib import Path
import numpy as np, yaml
from .malla import ARBOL, SUELO, ESTADO, CUBIERTA, SIN_FUEGO, NODATA_F, Malla, leer_tif, escribir_tif

PENDIENTE_MAX = 35.0
FACTOR_PENDIENTE = 0.5
# Orientación × pendiente (de-Miguel et al. 2014): el efecto norte/sur crece con la pendiente.
AMPLITUD_ORIENTACION = 0.25      # ±25 % a partir de PENDIENTE_PLENA (rec. 4)
PENDIENTE_PLENA = 20.0           # grados
FACTOR_INDIFERENTE = 0.5         # las "indiferentes" con la mitad de peso, hacia umbría
# Dosel (Bonet 2008/2010, de-Miguel 2014): óptimo intermedio de FCC; 0,6 en los extremos (rec. 2)
DOSEL_EXTREMO = 0.6
ESTADO_FACTOR = {"sin_dato": 1.0, "monte_bravo": 0.4, "latizal": 0.8, "fustal": 1.0}
# Incendio (7.º CFE: −73 % al año 1, −19 % al año 5): ×0,3 años 0–2, ×0,6 años 3–5 (rec. 3)
FUEGO = ((2, 0.3), (5, 0.6))

FACTORES_V2 = {"dosel", "estado", "fuego", "orientacion_pendiente", "humedad", "cubierta", "matorral_cerca"}
CAPAS_V2 = ("fcc", "estado", "fuego", "humedad", "cubierta", "dist_matorral")


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


def _peso(f, peso: float):
    """Suaviza (peso < 1) o mantiene un factor multiplicativo: 1 − peso·(1 − f)."""
    return (1.0 - peso * (1.0 - f)).astype("float32")


def f_orientacion_pendiente(ori, pend, modo: str) -> np.ndarray:
    """1 en llano; 1 ± A·min(pend/20°, 1)·cos(orientación). Umbría: + al norte; solana: + al sur;
    indiferente: como umbría con la mitad de amplitud."""
    amp = AMPLITUD_ORIENTACION * (FACTOR_INDIFERENTE if modo == "indiferente" else 1.0)
    signo = -1.0 if modo == "solana" else 1.0
    s = np.clip(np.asarray(pend, "float32") / PENDIENTE_PLENA, 0, 1)
    c = np.cos(np.radians(ori))
    f = 1.0 + signo * amp * s * c
    return np.where(np.asarray(ori) < 0, 1.0, f).astype("float32")


def f_dosel(fcc, opt, peso: float = 1.0) -> np.ndarray:
    """FCC arbolada (%) con óptimo [lo, hi]: 1 dentro; lineal hasta 0,6 en 0 % y en 100 %."""
    lo, hi = opt
    x = np.asarray(fcc, "float32")
    f = np.ones_like(x)
    f = np.where(x < lo, DOSEL_EXTREMO + (1 - DOSEL_EXTREMO) * x / max(lo, 1e-6), f)
    f = np.where(x > hi, 1 - (1 - DOSEL_EXTREMO) * (x - hi) / max(100 - hi, 1e-6), f)
    return _peso(f, peso)


def f_estado(estado, pesos: dict | None = None) -> np.ndarray:
    t = _tabla({**ESTADO_FACTOR, **(pesos or {})}, ESTADO, defecto=1.0)
    return t[np.minimum(estado, max(ESTADO.values()))]


def f_fuego(anios) -> np.ndarray:
    a = np.asarray(anios)
    f = np.ones(a.shape, "float32")
    for hasta, factor in reversed(FUEGO):
        f = np.where((a != SIN_FUEGO) & (a <= hasta), factor, f)
    return f.astype("float32")


def f_humedad(h, peso: float) -> np.ndarray:
    """Índice de humedad 0–100 (TWI alto / cerca de cauce) → 1 + peso·h. Peso negativo = prefiere seco."""
    return (1.0 + peso * np.asarray(h, "float32") / 100.0).astype("float32")


def f_cubierta(cubierta, pesos: dict) -> np.ndarray:
    return _tabla(pesos, CUBIERTA)[np.minimum(cubierta, max(CUBIERTA.values()))]


def f_matorral_cerca(dist, cfg: dict) -> np.ndarray:
    return np.where(np.asarray(dist) <= cfg["radio_m"], 1.0, cfg["fuera"]).astype("float32")


def puntuar(perfil, arbol, altitud, orientacion, pendiente, suelo, capas: dict | None = None,
            desactivar=frozenset()) -> np.ndarray:
    capas = capas or {}
    on = lambda nombre, capa=None: nombre not in desactivar and (capa is None or capa in capas)
    f_arbol = _tabla(perfil["arboles"], ARBOL)[np.minimum(arbol, max(ARBOL.values()))]
    if "dosel" in perfil and on("dosel", "fcc"):
        f_arbol = f_arbol * f_dosel(capas["fcc"], perfil["dosel"]["opt"], perfil["dosel"].get("peso", 1.0))
    if on("estado", "estado"):
        f_arbol = f_arbol * _peso(f_estado(capas["estado"]), perfil.get("peso_estado", 1.0))
    f_hab = f_arbol
    if "cubierta" in perfil and on("cubierta", "cubierta"):
        f_hab = np.maximum(f_hab, f_cubierta(capas["cubierta"], perfil["cubierta"]))
    f_suelo = _tabla(perfil["suelo"], SUELO, defecto=0.6)[np.minimum(suelo, max(SUELO.values()))]
    f_alt = _f_altitud(altitud, perfil["altitud"])
    if on("orientacion_pendiente"):
        f_ori = f_orientacion_pendiente(orientacion, pendiente, perfil["orientacion"])
    else:
        f_ori = 1.0
    f_pend = np.where(pendiente > PENDIENTE_MAX, FACTOR_PENDIENTE, 1.0)
    s = f_hab * f_suelo * f_alt * f_ori * f_pend
    if perfil.get("penaliza_fuego", perfil.get("micorrizica", True)) and on("fuego", "fuego"):
        s = s * f_fuego(capas["fuego"])
    if perfil.get("humedad") and on("humedad", "humedad"):
        s = s * f_humedad(capas["humedad"], perfil["humedad"])
    if "matorral_cerca" in perfil and on("matorral_cerca", "dist_matorral"):
        s = s * f_matorral_cerca(capas["dist_matorral"], perfil["matorral_cerca"])
    # 255 = fuera de la zona (NODATA) en arbol.tif y suelo.tif
    s = np.where((altitud == NODATA_F) | (arbol == 255) | (suelo == 255), 0, s)
    return np.rint(np.clip(s, 0, 1) * 100).astype("uint8")


def cargar_capas(out_dir: Path) -> tuple[dict, dict]:
    out_dir = Path(out_dir)
    base = {n: leer_tif(out_dir / f"{n}.tif") for n in ["arbol", "altitud", "orientacion", "pendiente", "suelo"]}
    v2 = {n: leer_tif(out_dir / f"{n}.tif") for n in CAPAS_V2 if (out_dir / f"{n}.tif").exists()}
    return base, v2


def construir_idoneidad(out_dir: Path, perfiles: dict, desactivar=frozenset(), sufijo: str = ""):
    malla = Malla.cargar(Path(out_dir) / "malla.json")
    base, v2 = cargar_capas(out_dir)
    for clave, perfil in perfiles.items():
        s = puntuar(perfil, base["arbol"], base["altitud"], base["orientacion"], base["pendiente"],
                    base["suelo"], v2, desactivar)
        escribir_tif(malla, Path(out_dir) / f"idoneidad_{clave}{sufijo}.tif", s, 0)
