from shapely.geometry import box, Polygon
from shapely.ops import unary_union
from setas_pipeline.descargas import teselas

def test_teselas_cubren_bounds():
    zona = box(1000, 2000, 61000, 32000)
    ts = teselas(zona, 25000)
    cubierto = unary_union([box(*t) for t in ts])
    assert cubierto.covers(zona)
    assert all(t[2] - t[0] <= 25000 and t[3] - t[1] <= 25000 for t in ts)

def test_teselas_omite_las_que_no_tocan_la_zona():
    # L: solo la esquina inferior izquierda y la columna izquierda
    zona = Polygon([(0, 0), (100, 0), (100, 10), (10, 10), (10, 100), (0, 100)])
    ts = teselas(zona, 50)
    assert len(ts) == 3          # de 4 (2x2), la superior derecha no toca la zona
    assert (50, 50, 100, 100) not in ts


# ---- hallazgos code-review fase 1 ----
import json
import pytest, requests
from setas_pipeline import descargas


class _Resp:
    def __init__(self, status, cuerpo="{}"):
        self.status_code, self.text = status, cuerpo

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(str(self.status_code))

    def json(self):
        return json.loads(self.text)


def test_obtener_4xx_no_reintenta(tmp_path, monkeypatch):
    llamadas = []
    monkeypatch.setattr(descargas.requests, "get", lambda *a, **k: (llamadas.append(1), _Resp(400))[1])
    monkeypatch.setattr(descargas.time, "sleep", lambda s: None)
    with pytest.raises(requests.HTTPError):
        descargas.obtener("http://x/", tmp_path / "c.json")
    assert len(llamadas) == 1


def test_obtener_5xx_reintenta(tmp_path, monkeypatch):
    llamadas = []
    monkeypatch.setattr(descargas.requests, "get", lambda *a, **k: (llamadas.append(1), _Resp(503))[1])
    monkeypatch.setattr(descargas.time, "sleep", lambda s: None)
    with pytest.raises(requests.HTTPError):
        descargas.obtener("http://x/", tmp_path / "c.json", reintentos=3)
    assert len(llamadas) == 3


def test_entidad_omitida_no_cachea_unido_y_registra(tmp_path, monkeypatch):
    def falso(url, cache, reintentos=5, timeout=180):
        q = dict(p.split("=") for p in url.split("?")[1].split("&"))
        off, n = int(q["o"]), int(q["c"])
        if off <= 3 < off + n:
            raise requests.ConnectionError("corta")
        return {"type": "FeatureCollection", "features": [
            {"type": "Feature", "geometry": {"type": "Point", "coordinates": [0, 0]}, "properties": {"id": off + i}}
            for i in range(n) if off + i < 6]}
    monkeypatch.setattr(descargas, "obtener", falso)
    zona = box(0, 0, 1000, 1000)
    gdf = descargas.descargar_teselas("http://x/{xmin}_{ymin}_{xmax}_{ymax}?o={offset}&c={count}",
                                      zona, 5000, tmp_path, pagina=4)
    assert sorted(gdf["id"]) == [0, 1, 2, 4, 5]
    omitidos = json.loads((tmp_path / "omitidos.json").read_text())
    assert len(omitidos) == 1 and "o=3" in omitidos[0]
    assert not (tmp_path / "0_0_1000_1000_0.json").exists()   # sin caché unido: un reintento lo recupera
