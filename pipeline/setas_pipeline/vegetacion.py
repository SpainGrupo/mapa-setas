"""Vegetación: MFE (WFS IEPNB) → clase de árbol dominante por celda."""
from __future__ import annotations
from pathlib import Path
from urllib.parse import quote
import numpy as np, pandas as pd, geopandas as gpd, yaml
from rasterio.features import rasterize
from .malla import Malla, ARBOL, ESTADO, CUBIERTA, CRS, escribir_tif
from .descargas import descargar_teselas, cargar_zona

NODATA = 255
PAGINA_MFE = 100   # el servidor corta la respuesta a los 30 s; si una página falla se parte
TESELA_MFE = 25000


def clasificar(codigos: pd.Series, mapeo: dict) -> pd.Series:
    def uno(c):
        if c is None or pd.isna(c):
            return ARBOL["sin_arbolado"]
        try:
            clave = str(int(float(c)))     # 72.0 → "72"
        except (TypeError, ValueError):
            clave = str(c)
        return ARBOL[mapeo.get(clave, "otro")]
    return codigos.astype(object).map(uno).astype("uint8")


def rasterizar_clases(gdf: gpd.GeoDataFrame, columna: str, malla: Malla, fill=None) -> np.ndarray:
    gdf = gdf.to_crs(CRS)
    fill = ARBOL["sin_arbolado"] if fill is None else fill
    formas = [(g, int(v)) for g, v in zip(gdf.geometry, gdf[columna]) if g is not None and not g.is_empty]
    if not formas:
        return np.full((malla.alto, malla.ancho), fill, dtype="uint8")
    return rasterize(formas, out_shape=(malla.alto, malla.ancho), transform=malla.transform,
                     fill=fill, dtype="uint8")


def mascara_zona(zona, malla: Malla) -> np.ndarray:
    return rasterize([(zona, 1)], out_shape=(malla.alto, malla.ancho), transform=malla.transform,
                     fill=0, dtype="uint8").astype(bool)


def plantilla_mfe(cfg: dict, filtro: str | None = None) -> str:
    """WFS con filtro CQL: solo recintos con especie arbórea (id_sp1 <> 0). Los desarbolados
    no hacen falta (son el fondo) y algunos (urbano, 'Artificial') son tan grandes que el
    servidor corta la respuesta a los 30 s. CQL y bbox son excluyentes en GeoServer: el bbox va
    dentro del filtro."""
    filtro = filtro or f"{cfg['campo_especie_dominante']}<>0"
    filtro = quote(f"{filtro} AND BBOX(geom,{{xmin}},{{ymin}},{{xmax}},{{ymax}},'EPSG:25830')", safe="{},")
    return (f"{cfg['wfs_url']}?service=WFS&version=2.0.0&request=GetFeature&typeNames={cfg['capa']}"
            "&outputFormat=application/json&srsName=EPSG:25830"
            "&count={count}&startIndex={offset}&sortBy=id_ff21&cql_filter=" + filtro)


def construir_vegetacion(malla: Malla, raw_dir: Path, out_dir: Path, fuentes: Path, zona_path: Path):
    cfg = yaml.safe_load(Path(fuentes).read_text())["mfe"]
    zona = cargar_zona(zona_path)
    plantilla = plantilla_mfe(cfg)
    gdf = descargar_teselas(plantilla, zona, TESELA_MFE, Path(raw_dir) / "mfe", pagina=PAGINA_MFE)
    gdf = gdf.drop_duplicates("id_ff21")
    gdf["clase"] = clasificar(gdf[cfg["campo_especie_dominante"]], cfg["mapeo_arbol"])
    a = rasterizar_clases(gdf, "clase", malla)
    a[~mascara_zona(zona, malla)] = NODATA
    escribir_tif(malla, Path(out_dir) / "arbol.tif", a, NODATA)
    return a


# ---------------------------------------------------------------- modelo v2 (2026-10-14)
ESTADO_MFE = {"fustal": "fustal", "latizal": "latizal", "monte bravo": "monte_bravo", "repoblado": "monte_bravo"}
INCENDIO_CON_FECHA = 1      # id_evento del MFE: "Procede de incendio con fecha" (fecha en fc_evento)
DIST_MAX_M = 5000.0


def clasificar_estado(textos: pd.Series) -> pd.Series:
    """nom_e1 del MFE → ESTADO (Repoblado cuenta como Monte bravo; resto → sin_dato)."""
    def uno(t):
        if t is None or (isinstance(t, float) and pd.isna(t)):
            return ESTADO["sin_dato"]
        return ESTADO[ESTADO_MFE.get(str(t).strip().lower(), "sin_dato")]
    return textos.map(uno).astype("uint8")


def clasificar_cubierta(codigos: pd.Series, mapeo: dict) -> pd.Series:
    """id_tipestr del MFE desarbolado → CUBIERTA según mapeo {clase: [códigos]}."""
    inv = {int(c): CUBIERTA[k] for k, cs in mapeo.items() for c in cs}
    return codigos.map(lambda c: inv.get(int(c), CUBIERTA["ninguna"]) if pd.notna(c) else CUBIERTA["ninguna"]
                       ).astype("uint8")


def anio_incendio_mfe(gdf: gpd.GeoDataFrame) -> pd.Series:
    """Año del incendio del que procede el recinto (solo 'con fecha'); 0 = no consta."""
    ok = (gdf["id_evento"] == INCENDIO_CON_FECHA) & (gdf["fc_evento"] > 0)
    return gdf["fc_evento"].where(ok, 0).astype("uint16")


def _mfe_arbolado(raw_dir: Path, fuentes: Path, zona):
    cfg = yaml.safe_load(Path(fuentes).read_text())["mfe"]
    gdf = descargar_teselas(plantilla_mfe(cfg), zona, TESELA_MFE, Path(raw_dir) / "mfe", pagina=PAGINA_MFE)
    return gdf.drop_duplicates("id_ff21")


def construir_estructura(malla: Malla, raw_dir: Path, out_dir: Path, fuentes: Path, zona_path: Path):
    """fcc.tif (FCC arbolada %, 0 sin arbolado) y estado.tif (estado de masa de la especie 1)."""
    zona = cargar_zona(zona_path)
    gdf = _mfe_arbolado(raw_dir, fuentes, zona)
    gdf["fcc"] = gdf["nm_fccarb"].fillna(0).clip(0, 100).astype("uint8")
    gdf["estado"] = clasificar_estado(gdf["nom_e1"])
    fuera = ~mascara_zona(zona, malla)
    for nombre in ("fcc", "estado"):
        a = rasterizar_clases(gdf, nombre, malla, fill=0)
        a[fuera] = NODATA
        escribir_tif(malla, Path(out_dir) / f"{nombre}.tif", a, NODATA)
    return gdf


def construir_cubierta(malla: Malla, raw_dir: Path, out_dir: Path, fuentes: Path, zona_path: Path):
    """MFE desarbolado forestal (id_clamfe=140) → cubierta.tif y dist_matorral.tif (m al matorral más
    cercano: proxy de jaral para el gurumelo)."""
    from scipy.ndimage import distance_transform_edt
    cfg = yaml.safe_load(Path(fuentes).read_text())
    zona = cargar_zona(zona_path)
    c = cfg["mfe_desarbolado"]
    gdf = descargar_teselas(plantilla_mfe(cfg["mfe"], c["filtro"]), zona, TESELA_MFE,
                            Path(raw_dir) / "mfe_desarbolado", pagina=c["pagina"])
    gdf = gdf.drop_duplicates("id_ff21")
    gdf["cub"] = clasificar_cubierta(gdf["id_tipestr"], c["mapeo_cubierta"])
    a = rasterizar_clases(gdf[gdf["cub"] > 0], "cub", malla, fill=CUBIERTA["ninguna"])
    fuera = ~mascara_zona(zona, malla)
    matorral = np.isin(a, [CUBIERTA["matorral"], CUBIERTA["pastizal_matorral"]])
    d = (distance_transform_edt(~matorral) * malla.celda).astype("float32") if matorral.any() \
        else np.full(a.shape, DIST_MAX_M, "float32")
    d = np.minimum(d, DIST_MAX_M)
    a[fuera] = NODATA
    escribir_tif(malla, Path(out_dir) / "cubierta.tif", a, NODATA)
    escribir_tif(malla, Path(out_dir) / "dist_matorral.tif", d, -1.0)
    return a


# ---------------------------------------------------------------- multi-región, fase C (capas.mfe de la región)
MFE_REGION = "mfe_region.gpkg"          # recintos normalizados (incendios.py y edificado.py los leen de aquí)


def _ccaa_de(ctx, region):
    from .adaptadores import cargar_capa
    return cargar_capa("ccaa", region.capas, ctx) if "ccaa" in region.capas else None


def mfe_region(malla: Malla, region, zona):
    """Fuentes de `capas.mfe` en orden → (recintos normalizados, área cubierta, avisos).
    Cada fuente cubre `ambito`: «zona» (por defecto) o un id de la capa `ccaa`. Si una fuente de ámbito «zona»
    responde, las marcadas `respaldo: true` se saltan. Una fuente caída deja un aviso; nunca vegetación inventada."""
    import requests
    from datetime import date
    from shapely import union_all
    from .adaptadores import REGISTRO, contexto_region, normalizar, vacio
    from .adaptadores.mfe import FuenteCaida
    ctx = contexto_region(region, malla=malla, zona=zona)
    ccaa = None
    trozos, areas, avisos_ = [], [], []
    principal = False
    for cfg in region.capas["mfe"]:
        if cfg.get("respaldo") and principal:
            continue
        nombre = cfg.get("nombre", cfg["adaptador"])
        try:
            g = normalizar("mfe", REGISTRO["mfe"][cfg["adaptador"]](cfg, ctx))
        except (FuenteCaida, requests.RequestException) as e:
            avisos_.append(f"Vegetación: {nombre} no respondió el {date.today().isoformat()} ({e}).")
            print(f"  WARNING: {avisos_[-1]}", flush=True)
            continue
        ambito = cfg.get("ambito", "zona")
        if ambito == "zona":
            area, principal = zona, True
        else:
            ccaa = _ccaa_de(ctx, region) if ccaa is None else ccaa
            if ccaa is None or not (ccaa["id"] == ambito).any():
                raise ValueError(f"capas.mfe: ámbito '{ambito}' sin polígono en la capa ccaa de la región")
            area = union_all(list(ccaa[ccaa["id"] == ambito].geometry)).intersection(zona)
            g = g[g.intersects(area)]
        trozos.append(g)
        areas.append(area)
        print(f"  MFE {nombre}: {len(g)} recintos", flush=True)
    gdf = gpd.GeoDataFrame(pd.concat(trozos, ignore_index=True), crs=CRS) if trozos else vacio("mfe")
    cubierto = union_all(areas) if areas else None
    falta = zona if cubierto is None else zona.difference(cubierto)
    if not falta.is_empty and falta.area > 0.001 * zona.area:
        ccaa = _ccaa_de(ctx, region) if ccaa is None else ccaa
        nombres = []
        if ccaa is not None:
            for _, c in ccaa.iterrows():
                if c.geometry.intersection(falta).area > 0.01 * falta.area:
                    nombres.append(c["nombre"])
        pct = round(100 * falta.area / zona.area)
        donde = f" ({', '.join(nombres)})" if nombres else ""
        avisos_.append(f"Sin datos de vegetación en el {pct} % de la zona{donde}: ninguna fuente del Mapa Forestal "
                       "respondió para esa parte. Esas celdas salen sin puntuar (no es «baja idoneidad»).")
        print(f"  WARNING: {avisos_[-1]}", flush=True)
    return gdf, cubierto, avisos_


def construir_vegetacion_region(malla: Malla, region, zona=None):
    """arbol, fcc, estado, cubierta y dist_matorral de una región con `capas.mfe`, con NODATA (255; −1 en
    dist_matorral) donde ninguna fuente cubre la zona. Escribe también out/mfe_region.gpkg y los avisos."""
    from scipy.ndimage import distance_transform_edt
    from . import avisos
    out = region.out
    zona = cargar_zona(out / "zona.geojson") if zona is None else zona
    gdf, cubierto, textos = mfe_region(malla, region, zona)
    dentro = mascara_zona(zona, malla)
    sin = np.ones_like(dentro) if cubierto is None or cubierto.is_empty else ~(dentro & mascara_zona(cubierto, malla))
    arb = gdf[gdf["arbol"] != ARBOL["sin_arbolado"]]
    a = rasterizar_clases(arb, "arbol", malla)
    a[sin] = NODATA
    escribir_tif(malla, out / "arbol.tif", a, NODATA)
    for nombre in ("fcc", "estado"):
        v = rasterizar_clases(arb, nombre, malla, fill=0)
        v[sin] = NODATA
        escribir_tif(malla, out / f"{nombre}.tif", v, NODATA)
    cub = rasterizar_clases(gdf[gdf["cubierta"] > 0], "cubierta", malla, fill=CUBIERTA["ninguna"])
    matorral = np.isin(cub, [CUBIERTA["matorral"], CUBIERTA["pastizal_matorral"]])
    d = (distance_transform_edt(~matorral) * malla.celda).astype("float32") if matorral.any() \
        else np.full(cub.shape, DIST_MAX_M, "float32")
    d = np.minimum(d, DIST_MAX_M)
    cub[sin] = NODATA
    d[sin & dentro] = -1.0
    escribir_tif(malla, out / "cubierta.tif", cub, NODATA)
    escribir_tif(malla, out / "dist_matorral.tif", d, -1.0)
    (out / MFE_REGION).unlink(missing_ok=True)
    if len(gdf):
        gdf.to_file(out / MFE_REGION, driver="GPKG")
    avisos.registrar(out, "mfe", textos)
    print(f"  vegetación: {int((sin & dentro).sum())} celdas de la zona sin datos (NODATA) de {int(dentro.sum())}",
          flush=True)
    return a


def leer_mfe_region(out: Path) -> gpd.GeoDataFrame:
    from .adaptadores import vacio
    ruta = Path(out) / MFE_REGION
    return gpd.read_file(ruta) if ruta.exists() else vacio("mfe")


if __name__ == "__main__":
    from .region import region_cli, FUENTES
    r = region_cli()
    construir_vegetacion(Malla.cargar(r.out / "malla.json"), r.raw, r.out, FUENTES, r.out / "zona.geojson")
