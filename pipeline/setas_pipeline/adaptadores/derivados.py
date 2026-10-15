"""Capas derivadas de otras capas de la misma región."""
from __future__ import annotations
import geopandas as gpd
from . import Contexto, registrar


@registrar("restricciones", "protegidos_por_figura")
def protegidos_por_figura(cfg: dict, ctx: Contexto) -> gpd.GeoDataFrame:
    """Espacios de la capa `protegidos` con FIGURA = cfg.figura → restricción cfg.tipo (p. ej. Parque Nacional)."""
    from . import cargar_capa
    enp = cargar_capa("protegidos", ctx.capas, ctx)
    sel = enp[enp["figura"] == cfg["figura"]].drop_duplicates(subset="codigo")
    return sel.assign(tipo=cfg["tipo"], zona=cfg["zona"])
