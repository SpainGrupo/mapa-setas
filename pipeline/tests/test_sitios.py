import math
import numpy as np
import pytest
from setas_pipeline import sitios as S
from setas_pipeline.malla import Malla

SIN = 0xFFFF


def _malla_sintetica():
    """10×10: mancha A (diagonal 8-conexa, 4 celdas), mancha B (bloque 2×3), celda suelta C (1 ha)."""
    idon = np.zeros((10, 10), np.uint8)
    idon[0, 0], idon[1, 1], idon[2, 2], idon[3, 3] = 70, 90, 65, 60      # A: solo conecta en diagonal
    idon[6:8, 5:8] = [[80, 95, 70], [75, 60, 85]]                       # B
    idon[0, 9] = 99                                                      # C: 1 celda → fuera
    idon[5, 0] = 59                                                      # bajo el umbral
    tiempo = np.full((10, 10), 10, np.uint16)
    subida = np.full((10, 10), 50, np.uint16)
    origen = np.full((10, 10), 3, np.uint32)
    dist = np.full((10, 10), 250.0, np.float32)
    return idon, tiempo, subida, origen, dist


def test_manchas_8_vecinos_y_filtro_de_area():
    idon, *_ = _malla_sintetica()
    lab, n = S.manchas(idon)
    assert n == 2
    assert len({lab[0, 0], lab[1, 1], lab[2, 2], lab[3, 3]}) == 1 and lab[0, 0] > 0   # diagonal = una
    assert lab[0, 9] == 0 and lab[5, 0] == 0
    assert (lab[6:8, 5:8] > 0).all() and lab[6, 5] != lab[0, 0]


def test_area_minima_en_hectareas():
    idon = np.zeros((4, 4), np.uint8); idon[0, 0:2] = 80
    assert S.manchas(idon, min_ha=2.0)[1] == 1
    assert S.manchas(idon, min_ha=2.5)[1] == 0
    assert S.manchas(idon, min_ha=2.0, celda=50.0)[1] == 0                  # 2 × 0,25 ha


def test_representativo_mejor_celda_con_acceso():
    idon, tiempo, subida, origen, dist = _malla_sintetica()
    tiempo[6, 6] = SIN                                                      # la mejor de B sin acceso
    tiempo[7, 7] = 42; subida[7, 7] = 120; origen[7, 7] = 9; dist[7, 7] = 333.4
    res = S.candidatos(idon, tiempo, subida, origen, dist)
    b = next(r for r in res if r["area_ha"] == 6.0)
    assert (b["fila"], b["col"]) == (7, 7)
    assert b["punt_max"] == 95 and b["punt_media"] == pytest.approx(77.5)
    assert (b["t_pie_min"], b["subida_m"], b["aparcamiento_id"], b["dist_camino_m"]) == (42, 120, 9, 333)
    assert b["id"] == 7 * 10 + 7


def test_mancha_sin_acceso_se_descarta_y_orden_por_calidad():
    idon, tiempo, subida, origen, dist = _malla_sintetica()
    res = S.candidatos(idon, tiempo, subida, origen, dist)
    assert [r["area_ha"] for r in res] == [6.0, 4.0]                        # B: 77,5·ln7 > A: 71,25·ln5
    assert res[0]["_calidad"] == pytest.approx(77.5 * math.log(7))
    tiempo[0:4, 0:4] = SIN
    assert [r["area_ha"] for r in S.candidatos(idon, tiempo, subida, origen, dist)] == [6.0]
    assert len(S.candidatos(idon, *_malla_sintetica()[1:], maximo=1)) == 1


def test_dist_sin_dato_es_null():
    idon, tiempo, subida, origen, dist = _malla_sintetica()
    dist[:] = -9999.0
    assert all(r["dist_camino_m"] is None for r in S.candidatos(idon, tiempo, subida, origen, dist))


def test_georreferenciar_restringido_y_meteo():
    from shapely.geometry import box
    from pyproj import Transformer
    idon, tiempo, subida, origen, dist = _malla_sintetica()
    m = Malla(x0=320000.0, y1=4060000.0, ancho=10, alto=10, celda=100.0)
    res = S.candidatos(idon, tiempo, subida, origen, dist)
    tr = Transformer.from_crs("EPSG:25830", "EPSG:4326", always_xy=True)
    # Recinto que cubre solo la mitad sur de la malla (mancha B), en WGS84.
    lo0, la0 = tr.transform(m.x0 - 50, m.y1 - 1000 - 50)
    lo1, la1 = tr.transform(m.x0 + 1050, m.y1 - 500)
    lon_b, lat_b = tr.transform(m.x0 + 650, m.y1 - 650)        # centro de (6, 6)
    meteo = [{"id": 4, "lat": lat_b + 0.5, "lon": lon_b}, {"id": 7, "lat": lat_b, "lon": lon_b + 0.01}]
    g = S.georreferenciar(res, m, [box(lo0, la0, lo1, la1)], meteo)
    assert list(g[0]) == ["id", "lat", "lon", "area_ha", "punt_media", "punt_max", "t_pie_min", "subida_m",
                          "dist_camino_m", "aparcamiento_id", "restringido", "meteo_id"]
    b, a = g
    assert b["restringido"] is True and a["restringido"] is False
    assert b["meteo_id"] == 7
    assert b["lat"] == round(b["lat"], 5) and b["lon"] == pytest.approx(lon_b, abs=1e-4)
    assert S.georreferenciar(res, m, None, meteo)[0]["restringido"] is False
