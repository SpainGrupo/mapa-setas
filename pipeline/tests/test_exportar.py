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
