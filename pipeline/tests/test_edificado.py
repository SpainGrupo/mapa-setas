import numpy as np
import pytest
from pathlib import Path
from shapely.geometry import box
from setas_pipeline.malla import Malla, ARBOL, SUELO
from setas_pipeline import edificado as E
from setas_pipeline.idoneidad import puntuar

M = Malla(x0=0.0, y1=1000.0, ancho=10, alto=10, celda=100.0)


def test_huella_y_cerca():
    # edificio de 20×20 m (4 % de la celda) en la celda (fila 2, col 2)
    h, c = E.huella_y_cerca([box(220, 720, 240, 740)], M, tesela=4)
    assert h[2, 2] == pytest.approx(0.04)
    assert h.sum() == pytest.approx(0.04)
    assert c[2, 2] and c[2, 1] and c[3, 2]              # centro a 70 m del edificio
    assert not c[2, 3] and not c[1, 2]                  # centro a 110 m
    assert not c[2, 5] and not c[6, 6]                  # lejos
    assert c.sum() < 12


def test_huella_entre_teselas():
    # un edificio que cruza el borde de tesela (tesela de 4 celdas: borde en x = 400)
    h, c = E.huella_y_cerca([box(380, 500, 420, 510)], M, tesela=4)
    assert h[4, 3] == pytest.approx(0.02) and h[4, 4] == pytest.approx(0.02)


def test_combinar_clases():
    h = np.array([[0.0, 0.01, 0.03, 0.0]], "float32")
    c = np.array([[False, True, True, True]])
    art = np.array([[False, False, False, False]])
    lu = np.array([[False, False, False, True]])
    e = E.combinar(h, c, art, lu, dentro=np.array([[True, True, True, True]]))
    assert e.tolist() == [[E.LIBRE, E.CERCA, E.EXCLUIDO, E.EXCLUIDO]]
    e2 = E.combinar(h, c, dentro=np.array([[False, True, True, True]]))
    assert e2[0, 0] == E.FUERA and e2[0, 3] == E.CERCA


def test_artificial_mfe_vale_cero():
    e = E.combinar(np.zeros((1, 1), "float32"), np.zeros((1, 1), bool), artificial=np.ones((1, 1), bool))
    assert e[0, 0] == E.EXCLUIDO


def test_factor_edificado():
    e = np.array([E.LIBRE, E.CERCA, E.EXCLUIDO, E.FUERA], "uint8")
    assert E.factor_edificado(e).tolist() == [1.0, 0.5, 0.0, 1.0]
    assert E.factor_edificado(e, cerca=1.0).tolist() == [1.0, 1.0, 0.0, 1.0]
    assert E.factor_edificado(e, excluir=False).tolist() == [1.0, 0.5, 1.0, 1.0]


P = {"arboles": {"alcornoque": 1.0}, "altitud": {"min": 0, "opt_min": 100, "opt_max": 900, "max": 1200},
     "orientacion": "indiferente", "suelo": {"acido": 1.0}}


def _s(ed, desactivar=frozenset()):
    a = lambda v, t: np.array([[v]], dtype=t)
    return int(puntuar(P, a(ARBOL["alcornoque"], "uint8"), a(500.0, "float32"), a(-1.0, "float32"),
                       a(0.0, "float32"), a(SUELO["acido"], "uint8"),
                       {"edificado": a(ed, "uint8")}, desactivar)[0, 0])


def test_puntuar_factor_edificado_desactivable():
    base = _s(E.LIBRE)
    assert base > 0
    assert _s(E.EXCLUIDO) == 0
    assert _s(E.CERCA) == round(base / 2)
    assert _s(E.EXCLUIDO, {"edificado"}) == base
    assert _s(E.CERCA, {"borde_urbano"}) == base
    assert _s(E.EXCLUIDO, {"borde_urbano"}) == 0


def test_municipios_atom():
    xml = """<feed><entry><title> 29069-MARBELLA buildings</title>
    <link rel="enclosure" href="https://x/INSPIRE/Buildings/29/29069-MARBELLA/A.ES.SDGC.BU.29069.zip" />
    <georss:polygon>36.4 -5.0 36.4 -4.7 36.6 -4.7 36.6 -5.0 36.4 -5.0</georss:polygon></entry></feed>"""
    m = E.municipios_atom(xml)
    assert m == [{"codigo": "29069", "nombre": "MARBELLA",
                  "url": "https://x/INSPIRE/Buildings/29/29069-MARBELLA/A.ES.SDGC.BU.29069.zip",
                  "bbox": (-5.0, 36.4, -4.7, 36.6)}]
    assert E.municipios_en_zona(m, box(-4.8, 36.5, -4.6, 36.7)) == m
    assert E.municipios_en_zona(m, box(-4.0, 37.0, -3.9, 37.1)) == []


# ---- datos reales: celda con edificio en La Mairena (diagnóstico 2026-10-15) ----
from setas_pipeline.region import cargar_region
OUT = cargar_region("marbella").out


@pytest.mark.skipif(not (OUT / "edificado.tif").exists(), reason="sin data/marbella/out/edificado.tif")
def test_la_mairena_celda_con_edificio_vale_cero():
    from pyproj import Transformer
    from setas_pipeline.malla import leer_tif
    m = Malla.cargar(OUT / "malla.json")
    x, y = Transformer.from_crs("EPSG:4326", "EPSG:25830", always_xy=True).transform(-4.75436, 36.53435)
    f, c = int((m.y1 - y) // m.celda), int((x - m.x0) // m.celda)
    assert leer_tif(OUT / "edificado.tif")[f, c] == E.EXCLUIDO
    for esp in ("boletus_aereus", "amanita_caesarea"):
        assert leer_tif(OUT / f"idoneidad_{esp}.tif")[f, c] == 0, esp


def test_cerca_sin_pixeles_edificados_no_marca_la_esquina_de_la_tesela():
    # caseta de 2×2 m que no cubre ningún centro de píxel de 10 m: la tesela queda sin píxeles edificados y
    # la EDT medía la distancia a un «edificio fantasma» fuera de la esquina superior izquierda de la ventana
    # caseta en la celda (2, 2), centro (250, 750); la tesela 0 (filas y columnas 0-3) empieza en el borde
    # de la malla, sin margen, así que la esquina fantasma cae dentro de la tesela
    h, c = E.huella_y_cerca([box(249, 749, 251, 751)], M, tesela=4)
    assert not c[0, 0] and not c[0, 1]                          # a ≥ 200 m de la caseta
    assert c[2, 2] and c[2, 1] and c[1, 2]                      # a 0 m y a 99 m


def test_cerca_umbral_simetrico_desde_el_centro_de_la_celda():
    # centro de la celda (fila 5, col 5) = (550, 450); edificios de 1 m de ancho a 99 y 101 m, a cada lado
    for dx in (99, -99):
        x = 550 + dx
        _, c = E.huella_y_cerca([box(min(x, x + (1 if dx > 0 else -1)), 445, max(x, x + (1 if dx > 0 else -1)), 455)], M)
        assert c[5, 5], dx
    for dx in (101, -101):
        x = 550 + dx
        _, c = E.huella_y_cerca([box(min(x, x + (1 if dx > 0 else -1)), 445, max(x, x + (1 if dx > 0 else -1)), 455)], M)
        assert not c[5, 5], dx


def test_cerca_cuenta_edificios_justo_fuera_de_la_malla():
    _, c = E.huella_y_cerca([box(-30, 440, -20, 460)], M)          # a 70 m del centro (50, 450) de (5, 0)
    assert c[5, 0] and not c[5, 1]
