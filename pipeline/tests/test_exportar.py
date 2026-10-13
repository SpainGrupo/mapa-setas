import pytest
import io
import numpy as np
from PIL import Image
from setas_pipeline.exportar import (colormap, aplicar_umbral, png_idoneidad, sombreado,
                                     pixeles_tesela, teselas_bbox)


def test_colormap_cero_transparente_y_cien_color_maximo():
    lut = colormap()
    assert lut.shape == (101, 4) and lut.dtype == np.uint8
    assert lut[0, 3] == 0                               # 0 → transparente
    assert (lut[1:, 3] == 255).all()                    # resto opaco
    assert tuple(lut[100, :3]) == (0, 69, 41)           # 100 → verde más oscuro (#004529)
    # secuencial: la luminosidad baja de forma monótona
    lum = lut[1:, :3].astype(float) @ [0.299, 0.587, 0.114]
    assert (np.diff(lum) <= 0).all()


def test_umbral_distancia_oculta_celdas_cercanas_al_acceso():
    idon = np.array([[50, 80], [100, 0]], dtype=np.uint8)
    dist = np.array([[100.0, 250.0], [600.0, 900.0]], dtype=np.float32)
    assert (aplicar_umbral(idon, dist, 0) == idon).all()
    assert aplicar_umbral(idon, dist, 200).tolist() == [[0, 80], [100, 0]]
    assert aplicar_umbral(idon, dist, 800).tolist() == [[0, 0], [0, 0]]
    # el umbral es inclusivo: a 600 m exactos se ve con umbral 600
    assert aplicar_umbral(idon, dist, 600)[1, 0] == 100


def test_umbral_nodata_de_distancia_se_oculta():
    idon = np.array([[50]], dtype=np.uint8)
    dist = np.array([[-9999.0]], dtype=np.float32)
    assert aplicar_umbral(idon, dist, 0)[0, 0] == 0


def test_png_idoneidad_conserva_transparencia_y_color():
    v = np.zeros((256, 256), dtype=np.uint8)
    v[0, 0] = 100
    img = Image.open(io.BytesIO(png_idoneidad(v))).convert("RGBA")
    assert img.getpixel((0, 0)) == (0, 69, 41, 255)
    assert img.getpixel((1, 1))[3] == 0


def test_sombreado_plano_sin_sombra_y_ladera_norte_sombreada():
    plano = np.full((5, 5), 500.0, dtype=np.float32)
    s = sombreado(plano, 100.0, nodata=-9999.0)
    assert np.allclose(s[1:-1, 1:-1], s[2, 2])
    # sol del noroeste (315°): la ladera que baja hacia el NO sale más clara que la que baja al SE
    yy, xx = np.mgrid[0:5, 0:5].astype(np.float32)
    hacia_se = 1000 - 50 * (xx + yy)
    hacia_no = 1000 + 50 * (xx + yy)
    assert sombreado(hacia_no, 100.0, -9999.0)[2, 2] > sombreado(hacia_se, 100.0, -9999.0)[2, 2]


def test_pixeles_tesela_esquinas():
    lon, lat = pixeles_tesela(0, 0, 0)
    assert lon.shape == (256, 256)
    assert -180 < lon[0, 0] < -179 and 85 > lat[0, 0] > 84
    assert lon[0, 128] == 128.5 / 256 * 360 - 180   # centro de píxel


def test_teselas_bbox_cubre_malaga():
    ts = list(teselas_bbox((-4.5, 36.7, -4.4, 36.75), 10))
    assert (10, 499, 399) in ts and len(ts) <= 4
    for z, x, y in ts:
        assert z == 10


# ---------------------------------------------------------------- Fase 3: puntos meteo

from shapely.geometry import box as _box, Point as _Point
from setas_pipeline.malla import Malla as _Malla
from setas_pipeline.exportar import rejilla_meteo, con_bosque_cerca, voronoi_zonas, alt_media


def test_rejilla_meteo_paso_y_solo_dentro_de_la_zona():
    zona = _box(0, 0, 48000, 24000)
    pts = rejilla_meteo(zona, 12000)
    assert len(pts) == 4 * 2
    assert (6000.0, 6000.0) in pts and (42000.0, 18000.0) in pts
    # zona en L: los centros fuera del polígono se descartan
    ele = zona.difference(_box(24000, 12000, 48000, 24000))
    assert len(rejilla_meteo(ele, 12000)) == 6
    assert all(ele.contains(_Point(p)) for p in rejilla_meteo(ele, 12000))


def test_filtro_descarta_puntos_sin_bosque_en_el_radio():
    malla = _Malla(0.0, 30000.0, 300, 300, 100.0)       # 30 × 30 km
    mascara = np.zeros((300, 300), bool)
    mascara[50, 50] = True                              # celda con bosque en x=5050, y=24950
    pts = [(5000.0, 25000.0), (9000.0, 25000.0), (25000.0, 5000.0)]
    assert con_bosque_cerca(pts, mascara, malla, 6000) == [True, True, False]
    assert con_bosque_cerca(pts, mascara, malla, 3000) == [True, False, False]


def test_voronoi_cubre_toda_la_zona_y_cada_punto_esta_en_su_celda():
    zona = _box(0, 0, 48000, 24000).difference(_box(30000, 15000, 48000, 24000))
    pts = [(6000.0, 6000.0), (18000.0, 18000.0), (42000.0, 6000.0), (20000.0, 5000.0)]
    celdas = voronoi_zonas(pts, zona)
    assert len(celdas) == len(pts)
    from shapely import union_all
    u = union_all(celdas)
    assert abs(u.area - zona.area) < 1e-3 * zona.area
    assert u.symmetric_difference(zona).area < 1e-3 * zona.area
    assert sum(c.area for c in celdas) == pytest.approx(zona.area, rel=1e-6)    # sin solapes
    for p, c in zip(pts, celdas):
        assert c.contains(_Point(p))


def test_alt_media_usa_las_celdas_con_bosque_del_radio():
    malla = _Malla(0.0, 10000.0, 100, 100, 100.0)
    alt = np.full((100, 100), 200.0, dtype=np.float32)
    alt[:, 50:] = 1000.0
    mascara = np.zeros((100, 100), bool)
    mascara[40:60, 60:70] = True                        # todo el bosque a 1000 m
    assert alt_media((5000.0, 5000.0), alt, mascara, malla, 3000) == pytest.approx(1000.0)
    # sin bosque en el radio: media del terreno del radio (ignorando nodata)
    alt[0, 0] = -9999.0
    v = alt_media((1000.0, 9000.0), alt, np.zeros_like(mascara), malla, 500)
    assert v == pytest.approx(200.0)


def test_especies_exporta_reglas_de_tiempo():
    from setas_pipeline.exportar import especies
    es = {e["id"]: e for e in especies()}
    assert es["boletus_aereus"]["tiempo"] == {"episodio_mm": 25, "ventana_dias": [8, 20],
                                              "tmin_media": [8, 18], "tmax_media": [15, 27]}
    assert es["amanita_caesarea"]["tiempo"]["ventana_dias"] == [7, 16]
    for e in es.values():
        t = e["tiempo"]
        assert set(t) == {"episodio_mm", "ventana_dias", "tmin_media", "tmax_media"}
        assert t["ventana_dias"][0] < t["ventana_dias"][1]
