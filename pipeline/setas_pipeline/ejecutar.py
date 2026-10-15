"""Orquestador de la Fase 1.

    uv run python -m setas_pipeline.ejecutar idoneidad calibracion vista
    uv run python -m setas_pipeline.ejecutar todo [--forzar]

Cada paso se salta si todas sus salidas existen y no son más antiguas que sus entradas, salvo con --forzar.
"""
from __future__ import annotations
import argparse
from pathlib import Path
from .malla import Malla
from .idoneidad import cargar_perfiles

BASE = Path(__file__).resolve().parent.parent
RAW, OUT = BASE / "data/raw", BASE / "data/out"
FUENTES, ESPECIES = BASE / "fuentes.yaml", BASE / "especies.yaml"
ZONA = OUT / "zona.geojson"


def _malla():
    return Malla.cargar(OUT / "malla.json")


def _zona():
    from .zona import construir_zona
    construir_zona(OUT)


def _relieve():
    from .relieve import construir_relieve
    construir_relieve(_malla(), RAW, OUT, FUENTES)


def _vegetacion():
    from .vegetacion import construir_vegetacion
    construir_vegetacion(_malla(), RAW, OUT, FUENTES, ZONA)


def _suelo():
    from .suelo import construir_suelo
    construir_suelo(_malla(), RAW, OUT, FUENTES, ZONA)


def _estructura():
    from .vegetacion import construir_estructura
    construir_estructura(_malla(), RAW, OUT, FUENTES, ZONA)


def _cubierta():
    from .vegetacion import construir_cubierta
    construir_cubierta(_malla(), RAW, OUT, FUENTES, ZONA)


def _incendios():
    from .incendios import construir_fuego
    from .vegetacion import _mfe_arbolado
    from .descargas import cargar_zona
    construir_fuego(_malla(), RAW, OUT, FUENTES, mfe=_mfe_arbolado(RAW, FUENTES, cargar_zona(ZONA)))


def _humedad():
    from .hidrologia import construir_humedad
    construir_humedad(_malla(), RAW, OUT)


def _protegidos():
    from .protegidos import construir_protegidos
    construir_protegidos(_malla(), RAW, OUT, FUENTES, ZONA)


def _accesos():
    from .accesos import construir_accesos
    RAW.mkdir(parents=True, exist_ok=True)
    construir_accesos(_malla(), RAW, OUT, FUENTES)


def _edificado():
    from .edificado import construir_edificado
    construir_edificado(_malla(), RAW, OUT, FUENTES, ZONA)


def _idoneidad():
    from .idoneidad import construir_idoneidad
    construir_idoneidad(OUT, cargar_perfiles(ESPECIES))


def _calibracion():
    from .calibracion import informe
    informe(OUT, cargar_perfiles(ESPECIES), RAW)


def _vista():
    from .vista_previa import vistas
    vistas(OUT, RAW, cargar_perfiles(ESPECIES))


def _por_especie(patron: str):
    return lambda: [OUT / patron.format(k) for k in cargar_perfiles(ESPECIES)]


def _geo():
    return [OUT / "malla.json", FUENTES]


def _entradas_idoneidad():
    from .idoneidad import CAPAS_V2
    return [ESPECIES, *(OUT / f"{n}.tif" for n in ("arbol", "altitud", "orientacion", "pendiente", "suelo",
                                                    *CAPAS_V2))]


# paso → (función, salidas, entradas): se rehace si falta una salida o alguna es más antigua que una entrada
PASOS = {
    "zona": (_zona, lambda: [ZONA, OUT / "malla.json"], lambda: []),
    "relieve": (_relieve, lambda: [OUT / f"{n}.tif" for n in ("altitud", "pendiente", "orientacion")], _geo),
    "vegetacion": (_vegetacion, lambda: [OUT / "arbol.tif"], _geo),
    "suelo": (_suelo, lambda: [OUT / "suelo.tif"], _geo),
    "estructura": (_estructura, lambda: [OUT / "fcc.tif", OUT / "estado.tif"], _geo),
    "cubierta": (_cubierta, lambda: [OUT / "cubierta.tif", OUT / "dist_matorral.tif"], _geo),
    "incendios": (_incendios, lambda: [OUT / "fuego.tif"], _geo),
    "humedad": (_humedad, lambda: [OUT / f"{n}.tif" for n in ("twi", "dist_cauce", "humedad")],
                lambda: [*_geo(), OUT / "altitud.tif"]),
    "protegidos": (_protegidos, lambda: [OUT / "protegido.tif"], _geo),
    "accesos": (_accesos, lambda: [OUT / "distancia_acceso.tif"], _geo),
    "edificado": (_edificado, lambda: [OUT / "edificado.tif"], _geo),
    "idoneidad": (_idoneidad, _por_especie("idoneidad_{}.tif"), _entradas_idoneidad),
    "calibracion": (_calibracion, lambda: [OUT / "calibracion.md"],
                    lambda: [*_por_especie("idoneidad_{}.tif")(), OUT / "citas.geojson"]),
    "vista": (_vista, _por_especie("vista_{}.png"), _por_especie("idoneidad_{}.tif")),
}


def _al_dia(salidas: list[Path], entradas: list[Path]) -> bool:
    if not all(s.exists() for s in salidas):
        return False
    if not entradas:
        return True
    ultima_entrada = max(e.stat().st_mtime for e in entradas if e.exists()) if any(e.exists() for e in entradas) else 0
    return all(s.stat().st_mtime >= ultima_entrada for s in salidas)


def ejecutar(pasos: list[str], forzar: bool = False) -> list[str]:
    """Ejecuta los pasos en orden; devuelve los que se ejecutaron de verdad."""
    if "todo" in pasos:
        pasos = list(PASOS)
    hechos = []
    for p in pasos:
        funcion, salidas, entradas = PASOS[p]
        if not forzar and _al_dia(salidas(), entradas()):
            print(f"[{p}] salidas al día, se salta (usa --forzar para rehacer)")
            continue
        print(f"[{p}] ejecutando…", flush=True)
        funcion()
        hechos.append(p)
    return hechos


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pasos", nargs="+", choices=[*PASOS, "todo"])
    ap.add_argument("--forzar", action="store_true", help="rehacer aunque la salida exista")
    a = ap.parse_args(argv)
    ejecutar(a.pasos, a.forzar)


if __name__ == "__main__":
    main()
