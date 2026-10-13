import geopandas as gpd, pandas as pd, numpy as np
from shapely.geometry import box
from setas_pipeline.malla import Malla, ARBOL
from setas_pipeline.vegetacion import clasificar, rasterizar_clases

def test_clasificar_mapea_desconocido_y_nulo():
    mapeo = {"46": "alcornoque", "72": "castano"}
    s = clasificar(pd.Series(["46", "72", "999", None]), mapeo)
    assert list(s) == [ARBOL["alcornoque"], ARBOL["castano"], ARBOL["otro"], ARBOL["sin_arbolado"]]

def test_clasificar_acepta_float_y_nan():
    # id_sp1 llega como float cuando hay nulos: 72.0 debe casar con "72"
    mapeo = {"46": "alcornoque", "72": "castano"}
    s = clasificar(pd.Series([72.0, np.nan, 46]), mapeo)
    assert list(s) == [ARBOL["castano"], ARBOL["sin_arbolado"], ARBOL["alcornoque"]]

def test_rasterizar_clases_pinta_poligono():
    m = Malla.desde_bounds(0, 0, 1000, 1000)
    gdf = gpd.GeoDataFrame({"clase": [ARBOL["castano"]]}, geometry=[box(0, 500, 500, 1000)], crs="EPSG:25830")
    a = rasterizar_clases(gdf, "clase", m)
    assert a[0, 0] == ARBOL["castano"] and a[9, 9] == ARBOL["sin_arbolado"]
