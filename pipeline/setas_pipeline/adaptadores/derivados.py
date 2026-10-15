"""Capas derivadas de otras capas de la misma región."""
from __future__ import annotations
import geopandas as gpd
from . import Contexto, registrar


@registrar("restricciones", "protegidos_por_figura")
def protegidos_por_figura(cfg: dict, ctx: Contexto) -> gpd.GeoDataFrame:
    """Espacios de la capa `protegidos` con FIGURA = cfg.figura → restricción cfg.tipo (p. ej. Parque Nacional).
    `figura` puede ser una lista o faltar (todas las figuras); `excluir_nombres` quita espacios por nombre (los que
    tienen una restricción propia en otra fuente)."""
    from . import cargar_capa
    enp = cargar_capa("protegidos", ctx.capas, ctx)
    if "figura" in cfg:
        figuras = cfg["figura"] if isinstance(cfg["figura"], list) else [cfg["figura"]]
        enp = enp[enp["figura"].isin(figuras)]
    if cfg.get("excluir_nombres"):
        enp = enp[~enp["nombre"].isin(cfg["excluir_nombres"])]
    sel = enp.drop_duplicates(subset="codigo")
    return sel.assign(tipo=cfg["tipo"], zona=cfg["zona"])
