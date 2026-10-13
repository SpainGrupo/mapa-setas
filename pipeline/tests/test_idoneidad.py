import numpy as np
from setas_pipeline.malla import ARBOL, SUELO, NODATA_F
from setas_pipeline.idoneidad import puntuar

P = {"arboles": {"castano": 1.0, "encina": 0.5},
     "altitud": {"min": 200, "opt_min": 400, "opt_max": 800, "max": 1000},
     "orientacion": "umbria",
     "suelo": {"acido": 1.0, "basico": 0.5}}

def _p(arbol, alt, ori, pend=10.0, suelo=SUELO["acido"]):
    a = lambda v, t: np.array([[v]], dtype=t)
    return int(puntuar(P, a(arbol, "uint8"), a(alt, "float32"), a(ori, "float32"),
                       a(pend, "float32"), a(suelo, "uint8"))[0, 0])

def test_sin_arbol_hospedador_es_cero():
    assert _p(ARBOL["pino"], 600, 0) == 0

def test_optimo_completo_es_100():
    assert _p(ARBOL["castano"], 600, 0) == 100

def test_fuera_de_altitud_es_cero():
    assert _p(ARBOL["castano"], 1200, 0) == 0

def test_rampa_de_altitud():
    assert _p(ARBOL["castano"], 300, -1) == 50

def test_umbria_penaliza_solana():
    # v2: orientación × pendiente; a 10° el efecto es la mitad del máximo (±25 % desde 20°)
    assert _p(ARBOL["castano"], 600, 180) == 88

def test_llano_es_neutro():
    assert _p(ARBOL["castano"], 600, -1) == 100

def test_pendiente_extrema_penaliza():
    assert _p(ARBOL["castano"], 600, -1, pend=40) == 50

def test_suelo_y_arbol_se_multiplican():
    assert _p(ARBOL["encina"], 600, -1, suelo=SUELO["basico"]) == 25

def test_nodata_es_cero():
    assert _p(ARBOL["castano"], NODATA_F, 0) == 0

def test_suelo_nodata_es_cero():
    assert _p(ARBOL["castano"], 600, 0, suelo=255) == 0


# ---------------------------------------------------------------- modelo v2 (2026-10-14)
import pytest
from setas_pipeline.malla import ESTADO, CUBIERTA, SIN_FUEGO
from setas_pipeline.idoneidad import (f_dosel, f_estado, f_fuego, f_orientacion_pendiente,
                                      f_humedad, f_cubierta, f_matorral_cerca)

A = lambda *v, t="float32": np.array(v, dtype=t)


def test_dosel_optimo_intermedio():
    f = f_dosel(A(0, 20, 40, 60, 75, 100, t="uint8"), [40, 75])
    assert f.tolist() == pytest.approx([0.6, 0.8, 1.0, 1.0, 1.0, 0.6])


def test_dosel_peso_suaviza():
    assert f_dosel(A(0, t="uint8"), [40, 75], peso=0.5)[0] == pytest.approx(0.8)


def test_estado_fustal_latizal_monte_bravo():
    e = A(ESTADO["fustal"], ESTADO["latizal"], ESTADO["monte_bravo"], ESTADO["sin_dato"], t="uint8")
    assert f_estado(e).tolist() == pytest.approx([1.0, 0.8, 0.4, 1.0])


def test_fuego_por_anios():
    a = A(0, 1, 2, 3, 5, 6, SIN_FUEGO, t="uint8")
    assert f_fuego(a).tolist() == pytest.approx([0.3, 0.3, 0.3, 0.6, 0.6, 1.0, 1.0])


def test_orientacion_pendiente_crece_con_pendiente():
    ori = A(0, 180, 180, 180, -1)
    pend = A(30, 30, 10, 0, 0)
    f = f_orientacion_pendiente(ori, pend, "umbria")
    assert f.tolist() == pytest.approx([1.25, 0.75, 0.875, 1.0, 1.0])


def test_orientacion_pendiente_solana_e_indiferente():
    ori, pend = A(180, 0), A(25, 25)
    assert f_orientacion_pendiente(ori, pend, "solana").tolist() == pytest.approx([1.25, 0.75])
    assert f_orientacion_pendiente(ori, pend, "indiferente").tolist() == pytest.approx([0.875, 1.125])


def test_orientacion_este_es_neutra():
    assert f_orientacion_pendiente(A(90), A(30), "umbria")[0] == pytest.approx(1.0, abs=1e-6)


def test_humedad_bonus_modesto():
    assert f_humedad(A(0, 50, 100, t="uint8"), 0.2).tolist() == pytest.approx([1.0, 1.1, 1.2])
    assert f_humedad(A(100, t="uint8"), -0.1)[0] == pytest.approx(0.9)


def test_cubierta_y_matorral_cerca():
    c = A(CUBIERTA["ninguna"], CUBIERTA["matorral"], CUBIERTA["pastizal"], t="uint8")
    assert f_cubierta(c, {"pastizal": 1.0, "matorral": 0.3}).tolist() == pytest.approx([0, 0.3, 1.0])
    d = A(0, 200, 400)
    assert f_matorral_cerca(d, {"radio_m": 300, "fuera": 0.6}).tolist() == pytest.approx([1, 1, 0.6])


def _p2(perfil, arbol=ARBOL["castano"], ori=-1.0, pend=10.0, **capas):
    a = lambda v, t: np.array([[v]], dtype=t)
    c = {k: a(v, "float32" if k == "dist_matorral" else "uint8") for k, v in capas.items()}
    return int(puntuar(perfil, a(arbol, "uint8"), a(600.0, "float32"), a(ori, "float32"),
                       a(pend, "float32"), a(SUELO["acido"], "uint8"), c)[0, 0])


def test_puntuar_v2_aplica_capas():
    P2 = {**P, "dosel": {"opt": [40, 75]}, "humedad": 0.2}
    assert _p2(P2, fcc=60, estado=ESTADO["fustal"], fuego=SIN_FUEGO, humedad=0) == 100
    assert _p2(P2, fcc=60, estado=ESTADO["latizal"], fuego=SIN_FUEGO, humedad=0) == 80
    assert _p2(P2, fcc=60, estado=ESTADO["fustal"], fuego=1, humedad=0) == 30


def test_puntuar_v2_fuego_solo_micorricicas():
    P2 = {**P, "micorrizica": False}
    assert _p2(P2, fuego=1) == 100


def test_puntuar_v2_cubierta_abierta_sin_arbol():
    P2 = {**P, "arboles": {}, "cubierta": {"pastizal": 0.8}}
    assert _p2(P2, arbol=ARBOL["sin_arbolado"], cubierta=CUBIERTA["pastizal"]) == 80
    assert _p2(P2, arbol=ARBOL["sin_arbolado"], cubierta=CUBIERTA["ninguna"]) == 0


def test_puntuar_v2_desactivar_factor():
    P2 = {**P, "dosel": {"opt": [40, 75]}}
    a = lambda v, t: np.array([[v]], dtype=t)
    s = puntuar(P2, a(ARBOL["castano"], "uint8"), a(600.0, "float32"), a(0.0, "float32"),
                a(10.0, "float32"), a(SUELO["acido"], "uint8"), {"fcc": a(0, "uint8")}, desactivar={"dosel"})
    assert int(s[0, 0]) == 100
