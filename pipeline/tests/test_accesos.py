import numpy as np
from setas_pipeline.accesos import distancia_a_lineas

def test_distancia_a_lineas():
    m = np.zeros((5, 5), bool); m[:, 0] = True   # camino en la columna 0
    d = distancia_a_lineas(m, celda=100)
    assert d[2, 0] == 0 and d[2, 3] == 300
