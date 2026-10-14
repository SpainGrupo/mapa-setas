import pytest
from setas_pipeline.rutas import clasificar_ref


@pytest.mark.parametrize("ref,nombre,tipo", [
    ("GR 7", None, "GR"), ("GR-249", None, "GR"), ("GR 249.3", None, "GR"), ("gr 141", None, "GR"),
    ("PR-A 123", None, "PR"), ("PR A-123", None, "PR"), ("PR-A123", None, "PR"),
    ("SL-A 12", None, "SL"), ("SL-A-5", None, "SL"),
    ("E-4", None, "otro"), ("GRAN SENDA", None, "otro"), ("12", None, "otro"), (None, None, "otro"),
    ("", "Sendero del Pinsapar", "otro"),
    (None, "PR-A 288 Cañada del Cuerno", "PR"),          # sin ref: se mira el nombre
    ("E-4;GR 7", None, "GR"),                            # varias matrículas
    (float("nan"), float("nan"), "otro"),                # nulos de pandas
])
def test_clasificar_ref(ref, nombre, tipo):
    assert clasificar_ref(ref, nombre) == tipo


def test_rediam_sin_carriles_cicloturistas():
    import geopandas as gpd
    from shapely.geometry import LineString
    from setas_pipeline.rutas import solo_senderos
    g = gpd.GeoDataFrame({"nombre": ["a", "b", "c"],
                          "modalidad": ["Sendero señalizado", "Carril cicloturista", None]},
                         geometry=[LineString([(0, 0), (1, 1)])] * 3, crs="EPSG:25830")
    assert solo_senderos(g)["nombre"].tolist() == ["a", "c"]
