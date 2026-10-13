import numpy as np
from setas_pipeline.hidrologia import rellenar, acumulacion, twi, indice_humedad


def _valle(n=9):
    # V en x (cauce en la columna central) que baja hacia el sur (última fila)
    i, j = np.mgrid[0:n, 0:n]
    return (np.abs(j - n // 2) * 10.0 + (n - i) * 1.0 + 100).astype("float64")


def test_rellenar_quita_un_hoyo():
    z = np.full((5, 5), 10.0); z[2, 2] = 1.0
    zf = rellenar(z, np.ones_like(z, bool))
    assert zf[2, 2] > 10.0 and zf[0, 0] == 10.0


def test_acumulacion_concentra_en_el_cauce():
    z = _valle()
    v = np.ones_like(z, bool)
    acc = acumulacion(rellenar(z, v), v)
    assert acc[-1, 4] == acc.max()            # salida del valle
    assert acc[4, 4] > acc[4, 0]              # fondo > ladera
    assert acc[0, 0] == 1


def test_acumulacion_respeta_no_validos():
    z = _valle(); v = np.ones_like(z, bool); v[:, 0] = False
    acc = acumulacion(rellenar(z, v), v)
    assert (acc[:, 0] == 0).all()


def test_twi_mayor_en_vaguada():
    z = _valle(); v = np.ones_like(z, bool)
    t = twi(acumulacion(rellenar(z, v), v), z, 50.0)
    assert t[6, 4] > t[6, 1]


def test_indice_humedad_cauce_y_percentiles():
    t = np.array([[0, 1, 2, 3]], "float32")
    d = np.array([[1000, 1000, 1000, 0]], "float32")
    v = np.array([[True, True, True, False]])
    h = indice_humedad(t, d, v)
    assert h[0, 0] == 0 and h[0, 3] == 255
    assert h[0, 1] == 0 and h[0, 2] == 100       # p50 = 1 → 0 ; p95 = 1,9 → 1
