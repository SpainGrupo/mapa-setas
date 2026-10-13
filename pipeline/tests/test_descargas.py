from shapely.geometry import box, Polygon
from shapely.ops import unary_union
from setas_pipeline.descargas import teselas

def test_teselas_cubren_bounds():
    zona = box(1000, 2000, 61000, 32000)
    ts = teselas(zona, 25000)
    cubierto = unary_union([box(*t) for t in ts])
    assert cubierto.covers(zona)
    assert all(t[2] - t[0] <= 25000 and t[3] - t[1] <= 25000 for t in ts)

def test_teselas_omite_las_que_no_tocan_la_zona():
    # L: solo la esquina inferior izquierda y la columna izquierda
    zona = Polygon([(0, 0), (100, 0), (100, 10), (10, 10), (10, 100), (0, 100)])
    ts = teselas(zona, 50)
    assert len(ts) == 3          # de 4 (2x2), la superior derecha no toca la zona
    assert (50, 50, 100, 100) not in ts
