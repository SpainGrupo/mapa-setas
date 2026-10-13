import geopandas as gpd, numpy as np
from shapely.geometry import box
from setas_pipeline.malla import Malla, SIN_FUEGO
from setas_pipeline.incendios import anios_desde, rasterizar_anios


def test_anios_desde():
    a = np.array([0, 2026, 2025, 2021, 2000], "uint16")
    assert anios_desde(a, 2026).tolist() == [SIN_FUEGO, 0, 1, 5, 26]


def test_rasterizar_anios_gana_el_mas_reciente():
    m = Malla.desde_bounds(0, 0, 1000, 1000)
    g = gpd.GeoDataFrame({"anio": [2024, 2021, 0]},
                         geometry=[box(0, 0, 500, 1000), box(0, 0, 1000, 1000), box(0, 0, 1000, 1000)],
                         crs="EPSG:25830")
    a = rasterizar_anios(g, m)
    assert a[5, 0] == 2024 and a[5, 9] == 2021
