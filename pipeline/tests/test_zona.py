from shapely.geometry import Point
from setas_pipeline.zona import filtrar_alcanzables, poligono_zona

def test_filtrar_alcanzables_descarta_lejos_y_mal_ajustados():
    pts = [(0, 0), (1, 1), (2, 2), (3, 3)]
    res = [{"duracion": 100, "snap_m": 10},
           {"duracion": 8000, "snap_m": 10},
           {"duracion": 100, "snap_m": 9000},
           {"duracion": None, "snap_m": None}]
    assert filtrar_alcanzables(pts, res, max_s=7200, max_snap_m=5000) == [(0, 0)]


def test_puntos_de_marbella_iguales_que_antes_del_refactor():
    import hashlib, json
    from pathlib import Path
    from setas_pipeline.region import cargar_region
    from setas_pipeline.zona import puntos_muestreo
    r = cargar_region("marbella")
    p = puntos_muestreo(r.origen, r.zona["paso_m"], r.zona["radio_m"])
    esperado = json.loads((Path(__file__).parent / "dorado" / "zona_puntos.json").read_text())
    assert len(p) == esperado["n"]
    assert hashlib.sha256(json.dumps(p).encode()).hexdigest() == esperado["sha256"]

def test_poligono_zona_une_cuadrados():
    # dos puntos UTM contiguos a 5 km → un rectángulo de 10×5 km
    pol = poligono_zona([(300_000, 4_000_000), (305_000, 4_000_000)], paso_m=5000, crs_entrada="EPSG:25830")
    assert abs(pol.area - 10_000 * 5_000) < 1
    assert pol.contains(Point(302_500, 4_000_000))


def test_cerrar_zona_une_huecos_y_rellena_agujeros():
    from shapely.geometry import box, Polygon
    from setas_pipeline.zona import cerrar_zona
    # dos bloques separados 4 km → uno solo; un agujero interior → relleno
    a, b = box(0, 0, 10_000, 10_000), box(14_000, 0, 24_000, 10_000)
    z = cerrar_zona(a.union(b), distancia_m=5000)
    assert z.geom_type == "Polygon" and z.contains(Point(12_000, 5_000))
    con_agujero = Polygon(box(0, 0, 30_000, 30_000).exterior, [box(10_000, 10_000, 20_000, 20_000).exterior.coords])
    assert cerrar_zona(con_agujero, 5000).contains(Point(15_000, 15_000))
