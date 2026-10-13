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


if __name__ == "__main__":
    base = Path(__file__).resolve().parent.parent
    out = base / "data/out"
    construir_vegetacion(Malla.cargar(out / "malla.json"), base / "data/raw", out,
                         base / "fuentes.yaml", out / "zona.geojson")
