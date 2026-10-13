"""Accesos: distancia de cada celda a la vía (OSM) más cercana."""
from __future__ import annotations
from pathlib import Path
import numpy as np, geopandas as gpd, osmium, requests, yaml
from scipy.ndimage import distance_transform_edt
from shapely import wkb
from rasterio.features import rasterize
from .malla import Malla, CRS, NODATA_F, escribir_tif


def distancia_a_lineas(mascara: np.ndarray, celda: float) -> np.ndarray:
    return (distance_transform_edt(~mascara) * celda).astype("float32")


def extraer_vias(pbf: Path, tipos: list[str]) -> gpd.GeoDataFrame:
    fab = osmium.geom.WKBFactory()
    geoms = []
    for obj in osmium.FileProcessor(str(pbf)).with_locations().with_filter(osmium.filter.KeyFilter("highway")):
        if obj.is_way() and obj.tags.get("highway") in tipos:
            try:
                geoms.append(wkb.loads(fab.create_linestring(obj), hex=True))
            except osmium.InvalidLocationError:
                pass
    return gpd.GeoDataFrame(geometry=geoms, crs="EPSG:4326")


def construir_accesos(malla: Malla, raw_dir: Path, out_dir: Path, fuentes: Path):
    cfg = yaml.safe_load(Path(fuentes).read_text())["osm"]
    pbf = raw_dir / "andalucia.osm.pbf"
    if not pbf.exists():
        with requests.get(cfg["url"], stream=True, timeout=600) as r:
            r.raise_for_status()
            with open(pbf, "wb") as f:
                for trozo in r.iter_content(1 << 20):
                    f.write(trozo)
    vias = extraer_vias(pbf, cfg["tags_acceso"]["highway"]).to_crs(CRS)
    mascara = rasterize(((g, 1) for g in vias.geometry), out_shape=(malla.alto, malla.ancho),
                        transform=malla.transform, fill=0, all_touched=True, dtype="uint8").astype(bool)
    escribir_tif(malla, out_dir / "distancia_acceso.tif", distancia_a_lineas(mascara, malla.celda), NODATA_F)
