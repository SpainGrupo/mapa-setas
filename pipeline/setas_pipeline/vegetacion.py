"""Vegetación: MFE (WFS IEPNB) → clase de árbol dominante por celda."""
from __future__ import annotations
from pathlib import Path
from urllib.parse import quote
import numpy as np, pandas as pd, geopandas as gpd, yaml
from rasterio.features import rasterize
from .malla import Malla, ARBOL, CRS, escribir_tif
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


def plantilla_mfe(cfg: dict) -> str:
    """WFS con filtro CQL: solo recintos con especie arbórea (id_sp1 <> 0). Los desarbolados
    no hacen falta (son el fondo) y algunos (urbano, 'Artificial') son tan grandes que el
    servidor corta la respuesta a los 30 s. CQL y bbox son excluyentes en GeoServer: el bbox va
    dentro del filtro."""
    filtro = quote(f"{cfg['campo_especie_dominante']}<>0 AND "
                   "BBOX(geom,{xmin},{ymin},{xmax},{ymax},'EPSG:25830')", safe="{},")
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


if __name__ == "__main__":
    base = Path(__file__).resolve().parent.parent
    out = base / "data/out"
    construir_vegetacion(Malla.cargar(out / "malla.json"), base / "data/raw", out,
                         base / "fuentes.yaml", out / "zona.geojson")
