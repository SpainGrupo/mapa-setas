import numpy as np
import pytest
from setas_pipeline.malla import Malla
from setas_pipeline.calibracion import valores_en_puntos, resumen, nombres_cientificos

def test_valores_en_puntos_y_lift():
    m = Malla.desde_bounds(0, 0, 1000, 1000)
    r = np.zeros((10, 10), "uint8"); r[:, :2] = 80        # el 20 % de la zona es bueno
    v = valores_en_puntos(m, r, [(50, 950), (150, 50), (950, 950)])
    assert list(v) == [80, 80, 0]
    s = resumen(v, r)
    assert s["n"] == 3 and abs(s["pct_obs_buenas"] - 66.7) < 0.1
    assert abs(s["lift"] - 66.7 / 20) < 0.01

def test_nombres_cientificos_con_barra():
    assert nombres_cientificos("Boletus aestivalis / reticulatus") == ["Boletus aestivalis", "Boletus reticulatus"]
    assert nombres_cientificos("Amanita caesarea") == ["Amanita caesarea"]


# ---- hallazgos code-review fase 1 ----
from shapely.geometry import box
from setas_pipeline import calibracion


class _R:
    def __init__(self, j):
        self._j = j

    def json(self):
        return self._j


def test_clave_taxon_sin_coincidencia_devuelve_none(monkeypatch):
    monkeypatch.setattr(calibracion.requests, "get", lambda *a, **k: _R({"matchType": "NONE"}))
    assert calibracion.clave_taxon("Inventus nullus") is None


def test_ocurrencias_salta_claves_none(tmp_path, monkeypatch):
    monkeypatch.setattr(calibracion, "clave_taxon", lambda n: None)
    monkeypatch.setattr(calibracion, "descargar_ocurrencias",
                        lambda *a, **k: pytest.fail("no debe descargar sin clave"))
    pts = calibracion.ocurrencias({"nombre": "Inventus nullus"}, box(300000, 4040000, 310000, 4050000), tmp_path)
    assert pts == []


def test_ocurrencias_cache_depende_de_la_zona(tmp_path, monkeypatch):
    monkeypatch.setattr(calibracion, "clave_taxon", lambda n: 1)
    monkeypatch.setattr(calibracion, "descargar_ocurrencias", lambda *a, **k: [(-4.0, 36.5, None)])
    p = {"nombre": "Boletus edulis"}
    calibracion.ocurrencias(p, box(300000, 4040000, 310000, 4050000), tmp_path)
    calibracion.ocurrencias(p, box(300000, 4040000, 320000, 4060000), tmp_path)
    assert len(list((tmp_path / "gbif").glob("boletus_edulis_*.json"))) == 2


def test_pliegues_por_bloques_de_10_km():
    from setas_pipeline.calibracion import pliegues_bloques
    m = Malla(x0=0.0, y1=50000.0, ancho=500, alto=500, celda=100.0)      # 50×50 km → 25 bloques
    p = pliegues_bloques(m, k=5, bloque_m=10000.0)
    assert p.shape == (500, 500)
    assert (p[:100, :100] == p[0, 0]).all()                           # un bloque, un pliegue
    assert sorted(np.unique(p).tolist()) == [0, 1, 2, 3, 4]
    assert all((np.unique(p[::100, ::100]) == np.arange(5)))
    assert np.bincount(p[::100, ::100].ravel()).tolist() == [5] * 5   # equilibrados
    assert (pliegues_bloques(m, k=5, bloque_m=10000.0) == p).all()    # determinista


def test_validacion_bloques_lift_en_bloques_retenidos():
    from setas_pipeline.calibracion import validacion_bloques
    m = Malla(x0=0.0, y1=200.0, ancho=4, alto=2, celda=100.0)
    r = np.array([[80, 0, 80, 80], [0, 0, 0, 0]], np.uint8)
    tierra = np.ones_like(r, bool)
    pl = np.array([[0, 0, 1, 1], [0, 0, 1, 1]])
    xy = [(50, 150), (150, 150), (250, 150), (350, 50)]                # pliegue 0: 1/2 buenas; 1: 1/2
    v = validacion_bloques(m, r, tierra, xy, pl, k=2)
    # pliegue 0: obs 50 % / zona 25 % = 2; pliegue 1: 50 % / 50 % = 1
    assert v["lifts"] == [2.0, 1.0] and v["lift_medio"] == 1.5 and v["pliegues"] == 2
    vacio = validacion_bloques(m, r, tierra, [], pl, k=2)
    assert vacio["lift_medio"] is None and vacio["pliegues"] == 0


def test_citas_especie_y_precision():
    from setas_pipeline.calibracion import citas_especie, filtrar_precision
    f = lambda esp, prec, origen="inat": {"properties": {"especie": esp, "lon": -4.9, "lat": 36.5, "precision_m": prec,
                                                         "origen": origen}}
    c = {"features": [f("boletus_reticulatus", 50), f("boletus_reticulatus", None), f("boletus_reticulatus", 5000),
                      f("boletus_reticulatus", 100, "foro"), f("boletus_reticulatus", 1000, "foro"),
                      f("boletus_reticulatus", 5000, "literatura"), f("boletus_reticulatus", None, "literatura"),
                      f("amanita_caesarea", 10)]}
    pts = citas_especie(c, "boletus_aestivalis")          # clave del pipeline → id de la guía
    assert len(pts) == 7
    ok, sin, descartadas = filtrar_precision(pts)
    # sin incertidumbre declarada se conserva (criterio de filtrar_incertidumbre); > 1 km fuera;
    # foros/literatura solo con precisión «punto» (≤ 100 m)
    assert [p[2:] for p in ok] == [(50, "inat"), (None, "inat"), (100, "foro")]
    assert sin == 1 and descartadas == 4


def test_decidir_borde_urbano():
    from setas_pipeline.calibracion import decidir_borde_urbano
    v = lambda e, b: {"exclusion": {"val": {"lift_medio": e}}, "exclusion_borde": {"val": {"lift_medio": b}}}
    res = {"a": {"celda": {"n": 20}, "variantes": v(2.0, 2.5)},
           "b": {"celda": {"n": 5}, "variantes": v(2.0, 1.0)}}          # n < 10: no cuenta
    assert decidir_borde_urbano(res) == (True, [])
    res["c"] = {"celda": {"n": 12}, "variantes": v(3.0, 2.9)}
    assert decidir_borde_urbano(res) == (False, ["c"])


def test_clave_taxon_no_acepta_el_genero(monkeypatch):
    # GBIF, si no reconoce la especie, devuelve el género (matchType HIGHERRANK, rank GENUS): no vale esa clave
    monkeypatch.setattr(calibracion.requests, "get", lambda *a, **k: _R(
        {"matchType": "HIGHERRANK", "rank": "GENUS", "usageKey": 8187, "genusKey": 8187}))
    assert calibracion.clave_taxon("Boletus inventadus") is None
    monkeypatch.setattr(calibracion.requests, "get", lambda *a, **k: _R(
        {"matchType": "EXACT", "rank": "GENUS", "usageKey": 8187}))
    assert calibracion.clave_taxon("Boletus") is None


def test_clave_taxon_sinonimo_da_la_aceptada(monkeypatch):
    # regla B. aestivalis = B. reticulatus: el sinónimo resuelve a la clave del aceptado
    monkeypatch.setattr(calibracion.requests, "get", lambda *a, **k: _R(
        {"matchType": "EXACT", "rank": "SPECIES", "status": "SYNONYM", "usageKey": 5954988,
         "acceptedUsageKey": 5954691, "speciesKey": 5954691}))
    assert calibracion.clave_taxon("Boletus aestivalis") == 5954691
