"""Fuentes REDIAM (Junta de Andalucía): RENPA, zonificación PORN, perímetros de incendios por año y senderos.
Código movido de protegidos.py, exportar.py (restricciones), incendios.py (_rediam) y rutas.py sin cambios de
comportamiento: mismas URL, mismos nombres de caché."""
from __future__ import annotations
import json
from pathlib import Path
import geopandas as gpd
import pandas as pd
import requests
from . import CRS, Contexto, registrar, vacio
from ..descargas import descargar_teselas, obtener


@registrar("protegidos", "rediam_enp")
def rediam_enp(cfg: dict, ctx: Contexto) -> gpd.GeoDataFrame:
    g = descargar_teselas(cfg["url"], ctx.zona, cfg["tesela_m"], Path(ctx.raw) / cfg.get("cache", "enp"),
                          pagina=cfg.get("pagina", 10**9))
    if not len(g):
        return vacio("protegidos")
    return g.assign(codigo=g["CODIGOESPA"], nombre=g["NOMBRE"].str.strip(), figura=g["FIGURA"].str.strip())


def clasificar_restriccion(codigo_zona: str, descripcion: str, tipos_zona_reserva) -> str | None:
    """Zonificación PORN → tipo de restricción (o None si la zona no restringe la recolección)."""
    c, d = (codigo_zona or "").strip(), (descripcion or "").strip().lower()
    if "marino" in d:
        return None
    if c == "RN" or d == "reserva natural":
        return "reserva_natural"
    if c in tuple(tipos_zona_reserva) and "reserva" in d:
        return "zona_reserva"
    return None


@registrar("restricciones", "rediam_porn")
def rediam_porn(cfg: dict, ctx: Contexto) -> gpd.GeoDataFrame:
    xmin, ymin, xmax, ymax = (int(v) for v in ctx.malla.bounds)
    datos = obtener(cfg["url"].format(xmin=xmin, ymin=ymin, xmax=xmax, ymax=ymax),
                    Path(ctx.raw) / "zonificacion" / f"porn_vigentes_{xmin}_{ymin}_{xmax}_{ymax}.json", timeout=600)
    porn = gpd.GeoDataFrame.from_features(datos["features"], crs=CRS)
    if not len(porn):
        return vacio("restricciones")
    tipos = tuple(cfg["tipos_zona_reserva"])
    porn["tipo"] = [clasificar_restriccion(c, d, tipos) for c, d in zip(porn["Codigo_zona"], porn["Descripcion_zona"])]
    porn = porn[porn["tipo"].notna()]
    return porn.assign(nombre=porn["Nombre"].str.strip(), zona=porn["Descripcion_zona"].str.strip())


@registrar("incendios", "rediam_por_anio")
def rediam_por_anio(cfg: dict, ctx: Contexto) -> gpd.GeoDataFrame:
    xmin, ymin, xmax, ymax = (int(v) for v in ctx.malla.bounds)
    raw = Path(ctx.raw) / "incendios"
    raw.mkdir(parents=True, exist_ok=True)
    out = []
    for y in range(max(ctx.desde_anio, cfg["desde"]), cfg["hasta"] + 1):
        url = cfg["url"].format(anio=y, xmin=xmin, ymin=ymin, xmax=xmax, ymax=ymax)
        datos = obtener(url, raw / f"rediam_{y}_{xmin}_{ymin}_{xmax}_{ymax}.json", timeout=600)
        g = gpd.GeoDataFrame.from_features(datos.get("features", []), crs=CRS)
        if len(g):
            out.append(g.assign(anio=y, fuente="REDIAM")[["anio", "fuente", "geometry"]])
    return gpd.GeoDataFrame(pd.concat(out, ignore_index=True), crs=CRS) if out else vacio("incendios")


def solo_senderos(g):
    """Quita los equipamientos REDIAM que no son senderos a pie (modalidad «Carril cicloturista»)."""
    if "modalidad" not in g.columns:
        return g
    m = g["modalidad"].fillna("").astype(str).str.lower()
    return g[~m.str.contains("cicl")]


def senderos_rediam(cfg: dict, bbox25830, cache: Path):
    """Descarga por teselas de cfg.tesela_m (con caché) y deduplica por fid_1. Devuelve GeoDataFrame en EPSG:25830."""
    tesela_m = cfg.get("tesela_m", 50000)
    cache.mkdir(parents=True, exist_ok=True)
    xmin, ymin, xmax, ymax = bbox25830
    trozos = []
    x = xmin
    while x < xmax:
        y = ymin
        while y < ymax:
            caja = (int(x), int(y), int(min(x + tesela_m, xmax)), int(min(y + tesela_m, ymax)))
            ruta = cache / ("senderos_%d_%d_%d_%d.json" % caja)
            if not ruta.exists():
                url = cfg["url_patron"].format(xmin=caja[0], ymin=caja[1], xmax=caja[2], ymax=caja[3])
                r = requests.get(url, timeout=300)
                r.raise_for_status()
                json.loads(r.content)            # que sea GeoJSON válido antes de cachear
                ruta.write_bytes(r.content)
            g = gpd.read_file(ruta)
            if len(g):
                trozos.append(g.set_crs(CRS, allow_override=True))
            y += tesela_m
        x += tesela_m
    if not trozos:
        return gpd.GeoDataFrame(geometry=[], crs=CRS)
    g = gpd.GeoDataFrame(pd.concat(trozos, ignore_index=True), crs=CRS)
    return g.drop_duplicates(subset="fid_1")


@registrar("senderos", "rediam_senderos")
def rediam_senderos(cfg: dict, ctx: Contexto) -> gpd.GeoDataFrame:
    from ..rutas import clasificar_ref
    g = solo_senderos(senderos_rediam(cfg, ctx.zona.bounds, Path(ctx.raw) / "rediam_senderos"))
    if not len(g):
        return vacio("senderos")
    return gpd.GeoDataFrame({
        "ref": None, "name": g["nombre"].str.strip().str.title(), "network": None, "osmc": None,
        "tipo": [clasificar_ref(None, n) for n in g["nombre"]], "fuente": "rediam",
        "dificultad": g.get("t_dificult")}, geometry=g.geometry, crs=CRS)
