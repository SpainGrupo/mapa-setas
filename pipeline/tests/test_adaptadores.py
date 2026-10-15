# pipeline/tests/test_adaptadores.py
import geopandas as gpd
import pytest
from shapely.geometry import box
from setas_pipeline import adaptadores as A


def _ctx(tmp_path, **kw):
    return A.Contexto(raw=tmp_path, zona=box(0, 0, 1, 1), **kw)


def test_vacio_tiene_las_columnas_del_contrato():
    g = A.vacio("incendios")
    assert list(g.columns) == ["anio", "fuente", "geometry"] and len(g) == 0 and g.crs == A.CRS


def test_normalizar_ordena_columnas_y_reproyecta():
    g = gpd.GeoDataFrame({"fuente": ["X"], "anio": [2020], "extra": [1]}, geometry=[box(-4.9, 36.5, -4.8, 36.6)],
                         crs="EPSG:4326")
    n = A.normalizar("incendios", g)
    assert list(n.columns) == ["anio", "fuente", "geometry"] and n.crs == A.CRS
    assert n.geometry.iloc[0].bounds[0] > 1000           # metros, no grados


def test_normalizar_rechaza_columnas_que_faltan():
    g = gpd.GeoDataFrame({"anio": [1]}, geometry=[box(0, 0, 1, 1)], crs=A.CRS)
    with pytest.raises(ValueError, match="fuente"):
        A.normalizar("incendios", g)


def test_registrar_tipo_desconocido_falla():
    with pytest.raises(KeyError):
        A.registrar("inventado", "x")


def test_cargar_capa_concatena_en_el_orden_de_la_config(tmp_path, monkeypatch):
    def fuente(nombre):
        return lambda cfg, ctx: gpd.GeoDataFrame({"anio": [cfg["anio"]], "fuente": [nombre]},
                                                 geometry=[box(0, 0, 1, 1)], crs=A.CRS)
    monkeypatch.setitem(A.REGISTRO["incendios"], "f1", fuente("f1"))
    monkeypatch.setitem(A.REGISTRO["incendios"], "f2", fuente("f2"))
    capas = {"incendios": [{"adaptador": "f2", "anio": 2020}, {"adaptador": "f1", "anio": 2021}]}
    g = A.cargar_capa("incendios", capas, _ctx(tmp_path))
    assert list(g["fuente"]) == ["f2", "f1"] and list(g.index) == [0, 1]


def test_cargar_capa_sin_fuentes_da_vacio(tmp_path):
    g = A.cargar_capa("protegidos", {}, _ctx(tmp_path))
    assert len(g) == 0 and list(g.columns) == ["codigo", "nombre", "figura", "geometry"]


def test_registro_trae_los_adaptadores_de_marbella():
    # se rellenan en las Tasks 5 y 6; este test queda en rojo hasta entonces si se ejecuta antes
    pytest.importorskip("setas_pipeline.adaptadores.rediam")
