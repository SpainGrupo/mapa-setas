"""Adaptadores de fuente por tipo de capa (spec multi-región §3.3).

Un adaptador recibe la entrada de la config de la región (`cfg`: dict con `adaptador` y sus parámetros) y
un `Contexto`, y devuelve un GeoDataFrame en EPSG:25830 con las columnas de CONTRATO[tipo] más `geometry`.
Las descargas pasan por descargas.py (caché en disco, reintentos, paginación).

Añadir una fuente nueva (ArcGIS, WFS, zip GeoJSON…): una función decorada con @registrar("<tipo>", "<nombre>")
en un módulo de este paquete, importado al final de este archivo. La región la declara en `capas.<tipo>`.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable
import geopandas as gpd
import pandas as pd

CRS = "EPSG:25830"
CONTRATO: dict[str, tuple[str, ...]] = {
    "protegidos": ("codigo", "nombre", "figura"),
    "restricciones": ("tipo", "nombre", "zona"),
    "incendios": ("anio", "fuente"),
    "senderos": ("ref", "name", "network", "osmc", "tipo", "fuente", "dificultad"),
    # titularidad.py (2026-10-15). clase: monte_junta | monte_municipal (montes_publicos), coto (cotos_caza),
    # paso_publico (pasos_publicos, líneas; tipo via_pecuaria | sendero).
    "montes_publicos": ("clase", "nombre", "detalle", "codigo"),
    "cotos_caza": ("clase", "nombre", "detalle", "codigo"),
    "pasos_publicos": ("clase", "tipo", "nombre", "detalle", "codigo"),
    # Multi-región, fase C. ccaa: comunidad autónoma (id de la lista cerrada de la app, nombre).
    # mfe: vegetación normalizada por recinto, con los códigos de malla.py (ARBOL, ESTADO, CUBIERTA); fcc 0–100,
    # anio_incendio 0 = no consta, artificial = recinto urbano/artificial (edificado.py).
    "ccaa": ("id", "nombre"),
    "mfe": ("id", "arbol", "fcc", "estado", "cubierta", "anio_incendio", "artificial"),
}


@dataclass(frozen=True)
class Contexto:
    raw: Path                                   # caché de la región (data/<region>/raw)
    zona: object                                # geometría shapely EPSG:25830 que usa el paso que llama
    malla: object | None = None                 # Malla de la región
    fuentes: dict = field(default_factory=dict)  # fuentes.yaml (nacional y compartido)
    capas: dict = field(default_factory=dict)    # capas de la región (adaptadores derivados)
    osm_pbf: Callable[[], Path] | None = None   # pbf recortado a la zona (se construye al pedirlo)
    desde_anio: int | None = None               # incendios: primer año de la ventana


Adaptador = Callable[[dict, Contexto], gpd.GeoDataFrame]
REGISTRO: dict[str, dict[str, Adaptador]] = {t: {} for t in CONTRATO}


def registrar(tipo: str, nombre: str):
    if tipo not in REGISTRO:
        raise KeyError(f"tipo de capa desconocido: {tipo}")

    def deco(f: Adaptador) -> Adaptador:
        REGISTRO[tipo][nombre] = f
        return f
    return deco


def vacio(tipo: str) -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame({c: [] for c in CONTRATO[tipo]}, geometry=[], crs=CRS)


def normalizar(tipo: str, gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    faltan = [c for c in CONTRATO[tipo] if c not in gdf.columns]
    if faltan:
        raise ValueError(f"{tipo}: faltan columnas {faltan}")
    if gdf.crs is None:
        raise ValueError(f"{tipo}: GeoDataFrame sin CRS")
    g = gdf[[*CONTRATO[tipo], gdf.geometry.name]]
    if g.geometry.name != "geometry":
        g = g.rename_geometry("geometry")
    return g if g.crs == CRS else g.to_crs(CRS)


def cargar_capa(tipo: str, capas: dict, ctx: Contexto) -> gpd.GeoDataFrame:
    """Une las fuentes de `capas[tipo]` en el orden de la config (cada una normalizada)."""
    trozos = []
    for cfg in capas.get(tipo, []):
        g = normalizar(tipo, REGISTRO[tipo][cfg["adaptador"]](cfg, ctx))
        if len(g):
            trozos.append(g)
    if not trozos:
        return vacio(tipo)
    return gpd.GeoDataFrame(pd.concat(trozos, ignore_index=True), crs=CRS)



def contexto_region(region, malla=None, zona=None, desde_anio: int | None = None) -> Contexto:
    """Contexto completo de una región (el mismo en la Fase 1 y en la exportación): malla y zona de data/<region>/out
    (zona None si aún no hay zona.geojson), fuentes.yaml, capas de la región y el pbf OSM recortado bajo demanda."""
    import yaml
    from ..descargas import cargar_zona
    from ..malla import Malla
    from ..region import FUENTES
    from .osm import pbf_region
    malla = malla if malla is not None else Malla.cargar(region.out / "malla.json")
    if zona is None and (region.out / "zona.geojson").exists():
        zona = cargar_zona(region.out / "zona.geojson")
    return Contexto(raw=region.raw, zona=zona, malla=malla, fuentes=yaml.safe_load(Path(FUENTES).read_text()),
                    capas=region.capas, osm_pbf=lambda: pbf_region(region, malla), desde_anio=desde_anio)


from . import rediam, effis, derivados, osm, generico, mfe  # noqa: E402,F401  (registran sus adaptadores)
