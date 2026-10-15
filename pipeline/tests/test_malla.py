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
def test_arbol_sabina_al_final_sin_renumerar():
    from setas_pipeline.malla import ARBOL
    assert ARBOL == {"sin_arbolado": 0, "alcornoque": 1, "encina": 2, "quejigo": 3,
                     "castano": 4, "pino": 5, "pinsapo": 6, "otro": 7, "sabina": 8}


def test_mapeo_arbol_no_usa_sabina_todavia():
    import yaml
    from pathlib import Path
    f = yaml.safe_load((Path(__file__).resolve().parent.parent / "fuentes.yaml").read_text())
    assert "sabina" not in set(f["mfe"]["mapeo_arbol"].values())
