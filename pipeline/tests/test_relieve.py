import numpy as np
from setas_pipeline.malla import Malla
from setas_pipeline.relieve import pendiente_orientacion, teselas_wcs

def _plano(dx_por_col, dy_norte_por_fila, n=7):
    filas, cols = np.mgrid[0:n, 0:n]
    # la fila 0 es el norte: subir hacia el norte = disminuir el índice de fila
    return (cols * dx_por_col + (n - 1 - filas) * dy_norte_por_fila).astype("float32")

def test_sube_al_norte_mira_al_sur():
    p, o = pendiente_orientacion(_plano(0, 20), celda=100)
    assert np.allclose(o[3, 3], 180, atol=0.5)
    assert np.allclose(p[3, 3], np.degrees(np.arctan(0.2)), atol=0.1)

def test_sube_al_este_mira_al_oeste():
    _, o = pendiente_orientacion(_plano(20, 0), celda=100)
    assert np.allclose(o[3, 3], 270, atol=0.5)

def test_llano_es_menos_uno():
    _, o = pendiente_orientacion(np.zeros((5, 5), "float32"), celda=100)
    assert (o == -1).all()

def test_teselas_wcs_cubren_la_malla():
    m = Malla.desde_bounds(161234, 4012345, 399876, 4150001)
    t = teselas_wcs(m, lado_m=100_000)
    xmin, ymin, xmax, ymax = m.bounds
    assert min(a for a, _, _, _ in t) == xmin and max(c for _, _, c, _ in t) == xmax
    assert min(b for _, b, _, _ in t) == ymin and max(d for _, _, _, d in t) == ymax
    area = sum((c - a) * (d - b) for a, b, c, d in t)
    assert area == (xmax - xmin) * (ymax - ymin)          # sin huecos ni solapes
    for a, b, c, d in t:
        assert c - a <= 100_000 and d - b <= 100_000
        assert all(v % 100 == 0 for v in (a, b, c, d))
