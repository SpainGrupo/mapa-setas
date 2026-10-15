"""Accesos: distancia de cada celda a la vía (OSM) más cercana."""
from __future__ import annotations
from pathlib import Path
import numpy as np, geopandas as gpd, osmium, yaml
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


def construir_accesos(malla: Malla, out_dir: Path, fuentes: Path, pbf: Path):
    """pbf: el OSM recortado a la zona de la región (adaptadores.osm.pbf_zona)."""
    cfg = yaml.safe_load(Path(fuentes).read_text())["osm"]
    vias = extraer_vias(pbf, cfg["tags_acceso"]["highway"]).to_crs(CRS)
    if vias.empty:
        raise ValueError("0 vías extraídas: revisa osm.tags_acceso en fuentes.yaml o el pbf")
    mascara = rasterize(((g, 1) for g in vias.geometry), out_shape=(malla.alto, malla.ancho),
                        transform=malla.transform, fill=0, all_touched=True, dtype="uint8").astype(bool)
    escribir_tif(malla, Path(out_dir) / "distancia_acceso.tif", distancia_a_lineas(mascara, malla.celda), NODATA_F)
