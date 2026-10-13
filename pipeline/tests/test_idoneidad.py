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
    assert _p(ARBOL["castano"], 300, 0) == 50

def test_umbria_penaliza_solana():
    assert _p(ARBOL["castano"], 600, 180) == 70

def test_llano_es_neutro():
    assert _p(ARBOL["castano"], 600, -1) == 90

def test_pendiente_extrema_penaliza():
    assert _p(ARBOL["castano"], 600, 0, pend=40) == 50

def test_suelo_y_arbol_se_multiplican():
    assert _p(ARBOL["encina"], 600, 0, suelo=SUELO["basico"]) == 25

def test_nodata_es_cero():
    assert _p(ARBOL["castano"], NODATA_F, 0) == 0

def test_suelo_nodata_es_cero():
    assert _p(ARBOL["castano"], 600, 0, suelo=255) == 0
