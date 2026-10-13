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
