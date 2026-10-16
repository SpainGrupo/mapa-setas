"""Fuentes REDIAM (Junta de Andalucía): RENPA, zonificación PORN, perímetros de incendios por año, senderos y, para
la titularidad (2026-10-15), montes públicos, terrenos cinegéticos y vías pecuarias.
Código movido de protegidos.py, exportar.py (restricciones), incendios.py (_rediam), rutas.py y titularidad.py sin
cambios de comportamiento: mismas URL, mismos nombres de caché."""
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


# ---------------------------------------------------------------- titularidad (titularidad.py)

def clase_monte(tipo_titul: str | None, cfg: dict) -> str | None:
    """tipo_titul del Catálogo de Montes Públicos → monte_junta | monte_municipal | None (p. ej. «Particular»:
    consorciados, no es público). Los valores de cada clase los da la config (titular_autonomico,
    titulares_municipales)."""
    t = (tipo_titul or "").strip()
    if t == cfg["titular_autonomico"]:
        return "monte_junta"
    if t in tuple(cfg["titulares_municipales"]):
        return "monte_municipal"
    return None


def _teselas(cfg: dict, ctx: Contexto) -> gpd.GeoDataFrame:
    return descargar_teselas(cfg["url_patron"], ctx.zona, cfg["tesela_m"], Path(ctx.raw) / cfg["cache"])


def sin_repetidos(g: gpd.GeoDataFrame, codigo: str) -> gpd.GeoDataFrame:
    """Quita las entidades repetidas por el solape de teselas: mismo código Y misma geometría. Un mismo
    código puede tener varias piezas distintas (monte en varios recintos, vía en tramos): se conservan todas."""
    clave = g.geometry.normalize().to_wkb()
    return g[~pd.DataFrame({"c": g[codigo].values, "g": clave.values}).duplicated().values]


@registrar("montes_publicos", "rediam_montes")
def rediam_montes(cfg: dict, ctx: Contexto) -> gpd.GeoDataFrame:
    g = _teselas(cfg, ctx)
    if not len(g):
        return vacio("montes_publicos")
    g = sin_repetidos(g, "codigo_ja")
    g["clase"] = [clase_monte(t, cfg) for t in g["tipo_titul"]]
    g = g[g["clase"].notna()]
    return g.assign(nombre=g["nombre"].str.strip(), detalle=g["tipo_titul"].str.strip(), codigo=g["codigo_ja"])


@registrar("cotos_caza", "rediam_cotos")
def rediam_cotos(cfg: dict, ctx: Contexto) -> gpd.GeoDataFrame:
    g = _teselas(cfg, ctx)
    if not len(g):
        return vacio("cotos_caza")
    g = sin_repetidos(g, "MATRICULA")
    return g.assign(clase="coto", nombre=g["NOMBRE"].str.strip().str.title(),
                    detalle=g["TIPO"].str.strip().str.capitalize(), codigo=g["MATRICULA"])


@registrar("pasos_publicos", "rediam_vias_pecuarias")
def rediam_vias_pecuarias(cfg: dict, ctx: Contexto) -> gpd.GeoDataFrame:
    g = _teselas(cfg, ctx)
    if not len(g):
        return vacio("pasos_publicos")
    g = sin_repetidos(g, "CODIGOVIA")
    return g.assign(clase="paso_publico", tipo="via_pecuaria", nombre=g["NOMBRE"].str.strip().str.capitalize(),
                    detalle="Vía pecuaria", codigo=g["CODIGOVIA"])


@registrar("pasos_publicos", "rediam_senderos")
def rediam_senderos_paso(cfg: dict, ctx: Contexto) -> gpd.GeoDataFrame:
    """Senderos de uso público como paso público. Sin url_patron propio, usa la fuente `rediam_senderos` de
    capas.senderos de la región (misma caja y caché que rutas.py: zona + 2 km, raw/rediam_senderos)."""
    fuente = cfg if "url_patron" in cfg else next(
        f for f in ctx.capas.get("senderos", []) if f.get("adaptador") == "rediam_senderos")
    g = solo_senderos(senderos_rediam(fuente, ctx.zona.bounds, Path(ctx.raw) / "rediam_senderos"))
    if not len(g):
        return vacio("pasos_publicos")
    return g.assign(clase="paso_publico", tipo="sendero", nombre=g["nombre"].str.strip().str.title(),
                    detalle="Sendero de uso público", codigo=g["fid_1"].astype(str))
