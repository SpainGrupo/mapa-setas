import numpy as np
from setas_pipeline.malla import Malla
from setas_pipeline.calibracion import valores_en_puntos, resumen, nombres_cientificos

def test_valores_en_puntos_y_lift():
    m = Malla.desde_bounds(0, 0, 1000, 1000)
    r = np.zeros((10, 10), "uint8"); r[:, :2] = 80        # el 20 % de la zona es bueno
    v = valores_en_puntos(m, r, [(50, 950), (150, 50), (950, 950)])
    assert list(v) == [80, 80, 0]
    s = resumen(v, r)
    assert s["n"] == 3 and abs(s["pct_obs_buenas"] - 66.7) < 0.1
    assert abs(s["lift"] - 66.7 / 20) < 0.01

def test_nombres_cientificos_con_barra():
    assert nombres_cientificos("Boletus aestivalis / reticulatus") == ["Boletus aestivalis", "Boletus reticulatus"]
    assert nombres_cientificos("Amanita caesarea") == ["Amanita caesarea"]
