import geopandas as gpd
from shapely.geometry import box
from setas_pipeline.malla import Malla, CRS
from setas_pipeline.protegidos import rasterizar_protegidos, NODATA

def test_protegido_fuera_de_zona_es_nodata():
    m = Malla.desde_bounds(0, 0, 1000, 1000)
    zona = box(0, 0, 500, 1000)                        # mitad oeste
    enp = gpd.GeoDataFrame(geometry=[box(0, 500, 1000, 1000)], crs=CRS)   # mitad norte
    a = rasterizar_protegidos(enp, zona, m)
    assert a[0, 0] == 1 and a[9, 0] == 0              # dentro de zona: ENP / no ENP
    assert a[0, 9] == NODATA and a[9, 9] == NODATA    # fuera de zona
