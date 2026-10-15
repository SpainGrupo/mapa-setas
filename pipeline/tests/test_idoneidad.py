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
    # 100 = mejor caso: umbría a ≥20° (orientación × pendiente normalizado a máximo 1)
    assert _p(ARBOL["castano"], 600, 0, pend=20) == 100
    assert _p(ARBOL["castano"], 600, 0, pend=10) == 90

def test_fuera_de_altitud_es_cero():
    assert _p(ARBOL["castano"], 1200, 0) == 0

def test_rampa_de_altitud():
    assert _p(ARBOL["castano"], 300, 0, pend=20) == 50

def test_umbria_penaliza_solana():
    # v2: orientación × pendiente; a 10° el efecto es la mitad del máximo (±25 % desde 20°)
    assert _p(ARBOL["castano"], 600, 180) == 70        # 0,875 / 1,25

def test_llano_es_el_factor_bruto_1_entre_el_maximo():
    assert _p(ARBOL["castano"], 600, -1) == 80         # 1 / 1,25

def test_pendiente_extrema_penaliza():
    assert _p(ARBOL["castano"], 600, 0, pend=40) == 50

def test_suelo_y_arbol_se_multiplican():
    assert _p(ARBOL["encina"], 600, 0, pend=20, suelo=SUELO["basico"]) == 25

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


def _p2(perfil, arbol=ARBOL["castano"], ori=0.0, pend=20.0, **capas):
    a = lambda v, t: np.array([[v]], dtype=t)
    c = {k: a(v, "float32" if k == "dist_matorral" else "uint8") for k, v in capas.items()}
    return int(puntuar(perfil, a(arbol, "uint8"), a(600.0, "float32"), a(ori, "float32"),
                       a(pend, "float32"), a(SUELO["acido"], "uint8"), c)[0, 0])


def test_puntuar_v2_aplica_capas():
    P2 = {**P, "dosel": {"opt": [40, 75]}, "humedad": 0.2}
    assert _p2(P2, fcc=60, estado=ESTADO["fustal"], fuego=SIN_FUEGO, humedad=100) == 100
    assert _p2(P2, fcc=60, estado=ESTADO["latizal"], fuego=SIN_FUEGO, humedad=100) == 80
    assert _p2(P2, fcc=60, estado=ESTADO["fustal"], fuego=1, humedad=100) == 30
    assert _p2(P2, fcc=60, estado=ESTADO["fustal"], fuego=SIN_FUEGO, humedad=0) == 83     # 1 / 1,2


def test_humedad_sin_dato_es_neutra():
    assert f_humedad(A(255, t="uint8"), 0.25)[0] == pytest.approx(1.0)
    P2 = {**P, "humedad": 0.25}
    assert _p2(P2, humedad=255) == _p2(P2, humedad=0) == 80


def test_puntuacion_no_se_satura_en_100():
    # Antes: umbría ×1,25 y humedad ×1,25 recortados a 1 → muchas celdas distintas valían 100.
    P2 = {**P, "arboles": {"castano": 1.0, "encina": 0.7}, "humedad": 0.25}
    vals = {_p2(P2, arbol=ARBOL[a], pend=p, humedad=h) for a in ("castano", "encina") for p in (10, 20) for h in (60, 100)}
    assert max(vals) == 100 and len(vals) == 8


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
                a(20.0, "float32"), a(SUELO["acido"], "uint8"), {"fcc": a(0, "uint8")}, desactivar={"dosel"})
    assert int(s[0, 0]) == 100


def test_codigo_de_arbol_desconocido_cuenta_como_otro():
    import numpy as np
    from setas_pipeline.idoneidad import puntuar
    perfil = {"arboles": {"otro": 0.5, "sabina": 1.0}, "altitud": {"min": 0, "opt_min": 0, "opt_max": 3000, "max": 3000},
              "orientacion": "indiferente", "suelo": {"desconocido": 1.0}}
    arbol = np.array([[7, 9, 8, 255]], dtype="uint8")
    z = np.full((1, 4), 500.0, dtype="float32")
    s = puntuar(perfil, arbol, z, np.zeros_like(z), np.zeros_like(z), np.zeros((1, 4), "uint8"), {})
    assert s[0, 0] == s[0, 1]          # código desconocido → 'otro', nunca 'sabina'
    assert s[0, 2] > s[0, 0]           # 8 = sabina con su propio peso
    assert s[0, 3] == 0                # 255 (NODATA) = fuera de zona: 0, como antes de añadir sabina
