import numpy as np
from setas_pipeline.malla import Malla, escribir_tif, leer_tif

def test_desde_bounds_ajusta_a_100m():
    m = Malla.desde_bounds(300_050, 4_000_020, 300_960, 4_000_510)
    assert (m.x0, m.y1) == (300_000, 4_000_600)
    assert (m.ancho, m.alto) == (10, 6)

def test_roundtrip_json_y_tif(tmp_path):
    m = Malla.desde_bounds(0, 0, 500, 300)
    m.guardar(tmp_path / "malla.json")
    m2 = Malla.cargar(tmp_path / "malla.json")
    assert m2 == m
    a = np.arange(15, dtype="float32").reshape(3, 5)
    escribir_tif(m, tmp_path / "a.tif", a, nodata=-9999.0)
    assert np.array_equal(leer_tif(tmp_path / "a.tif"), a)
