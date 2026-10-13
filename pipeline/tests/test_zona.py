from shapely.geometry import Point
from setas_pipeline.zona import filtrar_alcanzables, poligono_zona

def test_filtrar_alcanzables_descarta_lejos_y_mal_ajustados():
    pts = [(0, 0), (1, 1), (2, 2), (3, 3)]
    res = [{"duracion": 100, "snap_m": 10},
           {"duracion": 8000, "snap_m": 10},
           {"duracion": 100, "snap_m": 9000},
           {"duracion": None, "snap_m": None}]
    assert filtrar_alcanzables(pts, res) == [(0, 0)]

def test_poligono_zona_une_cuadrados():
    # dos puntos UTM contiguos a 5 km → un rectángulo de 10×5 km
    pol = poligono_zona([(300_000, 4_000_000), (305_000, 4_000_000)], paso_m=5000, crs_entrada="EPSG:25830")
    assert abs(pol.area - 10_000 * 5_000) < 1
    assert pol.contains(Point(302_500, 4_000_000))
