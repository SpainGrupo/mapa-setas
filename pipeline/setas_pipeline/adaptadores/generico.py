"""Adaptadores genéricos (multi-región, fase C): ArcGIS REST, ArcGIS por año, WFS (GeoServer paginado o GML con
filtro FES) y GeoJSON dentro de un zip. Lo propio de cada fuente (URL, capas, campos) va en la config de la región:

    campos:  {columna_del_contrato: columna_de_la_fuente}
    valores: {columna_del_contrato: constante}
    filtro:  {columna_de_la_fuente: [valores que se conservan]}
    excluir: {columna_de_la_fuente: [valores que se quitan]}
    prefijo_codigo: texto que se antepone a `codigo` (códigos únicos entre capas)
    clase:   {campo, valores: {valor_fuente: clase}, defecto}   # columna `clase`; sin clase → la fila se quita
    clase_id: igual que `clase`, pero rellena `id` (capa ccaa)
    dedup:   columna_de_la_fuente

En `senderos`, si no se da `tipo`, sale de la matrícula (rutas.clasificar_ref). Las columnas del contrato que no se
dan quedan vacías (None).
"""
from __future__ import annotations
import fnmatch, hashlib, time, zipfile
from pathlib import Path
from urllib.parse import quote, urlencode
import geopandas as gpd
import pandas as pd
import requests
from . import CONTRATO, CRS, Contexto, registrar, vacio
from ..descargas import descargar_teselas

TESELA_M = 50000
PAGINA = 1000
TIPOS_VECTORIALES = ("protegidos", "restricciones", "montes_publicos", "cotos_caza", "pasos_publicos", "senderos",
                     "ccaa")


# ---------------------------------------------------------------- mapeo a las columnas del contrato

def _texto(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    return v.strip() if isinstance(v, str) else v


def _clases(serie: pd.Series, regla: dict) -> pd.Series:
    valores = {str(k): v for k, v in regla["valores"].items()}
    defecto = regla.get("defecto")
    return serie.map(lambda v: valores.get(str(_texto(v)), defecto) if _texto(v) is not None else defecto)


def mapear(gdf: gpd.GeoDataFrame, cfg: dict, tipo: str) -> gpd.GeoDataFrame:
    """Fuente cruda → columnas del contrato de `tipo` (+ geometry). Ver el docstring del módulo."""
    if not len(gdf):
        return vacio(tipo)
    g = gdf
    for campo, permitidos in (cfg.get("filtro") or {}).items():
        g = g[g[campo].map(_texto).isin(list(permitidos))]
    for campo, fuera in (cfg.get("excluir") or {}).items():
        g = g[~g[campo].map(_texto).isin(list(fuera))]
    if cfg.get("dedup"):
        g = g.drop_duplicates(cfg["dedup"])
    datos = {}
    for col, regla, destino in (("clase", cfg.get("clase"), "clase"), ("id", cfg.get("clase_id"), "id")):
        if regla:
            datos[destino] = _clases(g[regla["campo"]], regla).tolist()
    for col, campo in (cfg.get("campos") or {}).items():
        datos[col] = [_texto(v) for v in g[campo]]
    for col, v in (cfg.get("valores") or {}).items():
        datos[col] = [v] * len(g)
    if cfg.get("prefijo_codigo") and "codigo" in datos:      # códigos únicos entre capas (p. ej. objectid)
        datos["codigo"] = [None if c is None else f"{cfg['prefijo_codigo']}{c}" for c in datos["codigo"]]
    if tipo == "senderos" and "tipo" not in datos:
        from ..rutas import clasificar_ref
        datos["tipo"] = [clasificar_ref(r, n) for r, n in zip(datos.get("ref", [None] * len(g)),
                                                              datos.get("name", [None] * len(g)))]
    for col in CONTRATO[tipo]:
        datos.setdefault(col, [None] * len(g))
    out = gpd.GeoDataFrame(datos, geometry=list(g.geometry), crs=g.crs or CRS)
    for col in ("clase", "id"):
        if col in CONTRATO[tipo] and (cfg.get("clase") if col == "clase" else cfg.get("clase_id")):
            out = out[out[col].notna()]
    return out.reset_index(drop=True)


# ---------------------------------------------------------------- ArcGIS REST

def plantilla_arcgis(url_capa: str, where: str = "1=1", campos: str = "*") -> str:
    """Query de una capa de MapServer por envolvente, GeoJSON en EPSG:25830, paginado (resultOffset)."""
    return (url_capa.rstrip("/") + "/query?where=" + quote(where, safe="") +
            "&geometry={xmin},{ymin},{xmax},{ymax}&geometryType=esriGeometryEnvelope&inSR=25830&outSR=25830"
            "&spatialRel=esriSpatialRelIntersects&outFields=" + quote(campos, safe=",*") +
            "&returnGeometry=true&orderByFields=objectid&resultOffset={offset}&resultRecordCount={count}&f=geojson")


def consultar_arcgis(url_capa: str, zona, cache: Path, pagina: int = PAGINA, tesela_m: float = TESELA_M,
                     where: str = "1=1") -> gpd.GeoDataFrame:
    g = descargar_teselas(plantilla_arcgis(url_capa, where), zona, tesela_m, Path(cache), pagina=pagina)
    # las teselas se solapan en los recintos de borde
    return g[~g.geometry.to_wkb().duplicated()] if len(g) else g


def _capas(cfg: dict) -> list:
    if "capas" in cfg:
        c = cfg["capas"]
        return list(c.values()) if isinstance(c, dict) else list(c)
    return [cfg["capa"]] if "capa" in cfg else [None]


def _url_capa(cfg: dict, capa) -> str:
    return cfg["url"].rstrip("/") + ("" if capa is None else f"/{capa}")


def _zona(ctx: Contexto):
    if ctx.zona is not None:
        return ctx.zona
    from shapely.geometry import box
    return box(*ctx.malla.bounds)


def arcgis(cfg: dict, ctx: Contexto, tipo: str) -> gpd.GeoDataFrame:
    cache = Path(ctx.raw) / cfg.get("cache", "arcgis")
    trozos = [consultar_arcgis(_url_capa(cfg, c), _zona(ctx), cache / str(c), cfg.get("pagina", PAGINA),
                               cfg.get("tesela_m", TESELA_M), cfg.get("where", "1=1")) for c in _capas(cfg)]
    trozos = [t for t in trozos if len(t)]
    if not trozos:
        return vacio(tipo)
    return mapear(gpd.GeoDataFrame(pd.concat(trozos, ignore_index=True), crs=CRS), cfg, tipo)


@registrar("incendios", "arcgis_por_anio")
def arcgis_por_anio(cfg: dict, ctx: Contexto) -> gpd.GeoDataFrame:
    """Perímetros por año, una capa por año (`capas_anio: {año: id}`), dentro de la ventana ctx.desde_anio."""
    cache = Path(ctx.raw) / cfg.get("cache", "incendios_arcgis")
    out = []
    for anio, capa in sorted((int(a), c) for a, c in cfg["capas_anio"].items()):
        if ctx.desde_anio is not None and anio < ctx.desde_anio:
            continue
        g = consultar_arcgis(_url_capa(cfg, capa), _zona(ctx), cache / str(anio), cfg.get("pagina", 2000),
                             cfg.get("tesela_m", TESELA_M))
        if len(g):
            out.append(gpd.GeoDataFrame({"anio": anio, "fuente": cfg.get("fuente", "arcgis")},
                                        index=range(len(g)), geometry=list(g.geometry), crs=CRS))
    return gpd.GeoDataFrame(pd.concat(out, ignore_index=True), crs=CRS) if out else vacio("incendios")


# ---------------------------------------------------------------- WFS

def plantilla_wfs(cfg: dict) -> str:
    """GetFeature GeoJSON paginado (startIndex/count) por envolvente en EPSG:25830 (GeoServer)."""
    base = {"service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": cfg["capa"],
            "outputFormat": "application/json", "srsName": "EPSG:25830"}
    if cfg.get("orden"):
        base["sortBy"] = cfg["orden"]
    return (cfg["url"] + "?" + urlencode(base, safe=":/") +
            "&bbox={xmin},{ymin},{xmax},{ymax},urn:ogc:def:crs:EPSG::25830&count={count}&startIndex={offset}")


def filtro_fes(fes: dict) -> str:
    """Filtro FES 2.0: campo = uno de los valores (OR)."""
    cond = "".join(f"<fes:PropertyIsEqualTo><fes:ValueReference>{fes['campo']}</fes:ValueReference>"
                   f"<fes:Literal>{v}</fes:Literal></fes:PropertyIsEqualTo>" for v in fes["valores"])
    if len(fes["valores"]) > 1:
        cond = f"<fes:Or>{cond}</fes:Or>"
    ns = f' xmlns:{fes["prefijo"]}="{fes["espacio"]}"' if fes.get("prefijo") else ""
    return f'<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0"{ns}>{cond}</fes:Filter>'


def obtener_bytes(url: str, cache: Path, intentos: int = 5, timeout: int = 600) -> Path:
    """GET binario con caché en disco y reintentos con espera creciente (5xx, timeouts, conexión)."""
    cache = Path(cache)
    if cache.exists():
        return cache
    cache.parent.mkdir(parents=True, exist_ok=True)
    espera = 5.0
    for i in range(intentos):
        try:
            r = requests.get(url, timeout=timeout)
            if r.status_code >= 500:
                raise requests.HTTPError(f"{r.status_code}")
            r.raise_for_status()
            parcial = cache.with_name(cache.name + ".part")
            parcial.write_bytes(r.content)
            parcial.rename(cache)
            return cache
        except (requests.HTTPError, requests.Timeout, requests.ConnectionError) as e:
            if i == intentos - 1 or (isinstance(e, requests.HTTPError) and not str(e).startswith("5")):
                raise
            print(f"  reintento {i + 1} ({e}) {url[:120]}", flush=True)
            time.sleep(espera)
            espera *= 2
    raise RuntimeError("inalcanzable")


def wfs(cfg: dict, ctx: Contexto, tipo: str) -> gpd.GeoDataFrame:
    cache = Path(ctx.raw) / cfg.get("cache", "wfs")
    if cfg.get("formato") == "gml":
        params = {"service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": cfg["capa"],
                  "srsName": "EPSG:25830"}
        if cfg.get("fes"):
            params["FILTER"] = filtro_fes(cfg["fes"])
        url = cfg["url"] + "?" + urlencode(params)
        ruta = obtener_bytes(url, cache / f"{hashlib.sha1(url.encode()).hexdigest()[:12]}.gml")
        g = gpd.read_file(ruta)
        g = g.set_crs(CRS, allow_override=True) if g.crs is None else g.to_crs(CRS)
    else:
        g = descargar_teselas(plantilla_wfs(cfg), _zona(ctx), cfg.get("tesela_m", TESELA_M), cache,
                              pagina=cfg.get("pagina", PAGINA))
        if len(g):
            g = g[~g.geometry.to_wkb().duplicated()]
    return mapear(g, cfg, tipo)


# ---------------------------------------------------------------- GeoJSON dentro de un zip

def zip_geojson(cfg: dict, ctx: Contexto, tipo: str) -> gpd.GeoDataFrame:
    ruta = obtener_bytes(cfg["url"], Path(ctx.raw) / cfg.get("cache", "zip") / cfg["url"].rsplit("/", 1)[-1],
                         timeout=1800)
    with zipfile.ZipFile(ruta) as z:
        miembros = [n for n in z.namelist() if fnmatch.fnmatch(n, cfg.get("miembro", "*.geojson"))]
    if len(miembros) != 1:
        raise ValueError(f"{ruta}: el patrón {cfg.get('miembro')!r} casa con {len(miembros)} miembros: {miembros[:5]}")
    zona = _zona(ctx)
    g = gpd.read_file(f"zip://{ruta}!{miembros[0]}")
    zona_g = gpd.GeoSeries([zona], crs=CRS).to_crs(g.crs).iloc[0] if g.crs else zona
    g = g[g.intersects(zona_g)]
    return mapear(g.to_crs(CRS) if len(g) else g, cfg, tipo)


for _t in TIPOS_VECTORIALES:
    registrar(_t, "wfs")(lambda cfg, ctx, _t=_t: wfs(cfg, ctx, _t))
    if _t != "ccaa":
        registrar(_t, "arcgis")(lambda cfg, ctx, _t=_t: arcgis(cfg, ctx, _t))
        registrar(_t, "zip_geojson")(lambda cfg, ctx, _t=_t: zip_geojson(cfg, ctx, _t))
