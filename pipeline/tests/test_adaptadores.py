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


import json
from setas_pipeline.malla import Malla

ZONA = box(300000, 4040000, 340000, 4060000)          # una sola tesela de 50 km
MALLA = Malla(x0=300000.0, y1=4060000.0, ancho=400, alto=200, celda=100.0)


def _fc(*feats):
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": p, "geometry": box(*b).__geo_interface__} for p, b in feats]}


def test_rediam_enp_lee_la_cache_de_siempre_y_normaliza(tmp_path):
    from setas_pipeline.adaptadores import rediam  # noqa: F401  (registra)
    cache = tmp_path / "enp"; cache.mkdir()
    (cache / "300000_4040000_340000_4060000_0.json").write_text(json.dumps(_fc(
        ({"CODIGOESPA": "ES1", "NOMBRE": " Sierra X ", "FIGURA": "Parque Natural "}, (301000, 4041000, 302000, 4042000)),
        ({"CODIGOESPA": "ES2", "NOMBRE": "Nieves", "FIGURA": "Parque Nacional"}, (303000, 4043000, 304000, 4044000)))))
    cfg = {"adaptador": "rediam_enp", "url": "http://no-se-usa/{xmin}", "tesela_m": 50000, "pagina": 10**9}
    g = A.cargar_capa("protegidos", {"protegidos": [cfg]}, A.Contexto(raw=tmp_path, zona=ZONA))
    assert list(g["codigo"]) == ["ES1", "ES2"] and g["nombre"].iloc[0] == "Sierra X" and g["figura"].iloc[0] == "Parque Natural"


def test_clasificar_restriccion_porn_con_tipos_de_la_region():
    from setas_pipeline.adaptadores.rediam import clasificar_restriccion as c
    t = ("A", "ARE", "R")
    assert c("A", "A. Zona de Reserva", t) == "zona_reserva"
    assert c("ARE", "Área de Reserva", t) == "zona_reserva"
    assert c("A", "A. Zona de Reserva. Ámbito marino", t) is None
    assert c("RN", "Reserva Natural", t) == "reserva_natural"
    assert c("B", "B. Zona de Regulación Especial", t) is None
    assert c("ZPP", "Zona de protección de la Reserva Natural", t) is None
    assert c("A", "A. Área de Regulación", t) is None
    assert c("A", "A. Zona de Reserva", ("ARE",)) is None


def test_rediam_porn_usa_la_cache_por_bounds_de_la_malla(tmp_path):
    from setas_pipeline.adaptadores import rediam  # noqa: F401
    xmin, ymin, xmax, ymax = (int(v) for v in MALLA.bounds)
    d = tmp_path / "zonificacion"; d.mkdir()
    (d / f"porn_vigentes_{xmin}_{ymin}_{xmax}_{ymax}.json").write_text(json.dumps(_fc(
        ({"Codigo_zona": "A", "Descripcion_zona": " A. Zona de Reserva ", "Nombre": " Grazalema "}, (301000, 4041000, 302000, 4042000)),
        ({"Codigo_zona": "B", "Descripcion_zona": "B. Regulación", "Nombre": "Otro"}, (303000, 4043000, 304000, 4044000)))))
    cfg = {"adaptador": "rediam_porn", "url": "http://no/{xmin}{ymin}{xmax}{ymax}", "tipos_zona_reserva": ["A", "ARE", "R"]}
    g = A.cargar_capa("restricciones", {"restricciones": [cfg]}, A.Contexto(raw=tmp_path, zona=ZONA, malla=MALLA))
    assert list(g["tipo"]) == ["zona_reserva"] and g["nombre"].iloc[0] == "Grazalema" and g["zona"].iloc[0] == "A. Zona de Reserva"


def test_protegidos_por_figura_saca_el_parque_nacional(tmp_path):
    from setas_pipeline.adaptadores import rediam, derivados  # noqa: F401
    cache = tmp_path / "enp"; cache.mkdir()
    (cache / "300000_4040000_340000_4060000_0.json").write_text(json.dumps(_fc(
        ({"CODIGOESPA": "ES1", "NOMBRE": "X", "FIGURA": "Parque Natural"}, (301000, 4041000, 302000, 4042000)),
        ({"CODIGOESPA": "ES2", "NOMBRE": " Nieves ", "FIGURA": "Parque Nacional "}, (303000, 4043000, 304000, 4044000)))))
    capas = {"protegidos": [{"adaptador": "rediam_enp", "url": "x", "tesela_m": 50000, "pagina": 10**9}],
             "restricciones": [{"adaptador": "protegidos_por_figura", "figura": "Parque Nacional",
                                "tipo": "parque_nacional", "zona": "Parque Nacional"}]}
    g = A.cargar_capa("restricciones", capas, A.Contexto(raw=tmp_path, zona=ZONA, capas=capas))
    assert list(g["tipo"]) == ["parque_nacional"] and list(g["nombre"]) == ["Nieves"] and list(g["zona"]) == ["Parque Nacional"]


def test_rediam_por_anio_respeta_la_ventana(tmp_path, monkeypatch):
    from setas_pipeline.adaptadores import rediam
    pedidas = []
    def falso(url, cache, timeout=180):
        pedidas.append(cache.name)
        return _fc(({}, (301000, 4041000, 302000, 4042000)))
    monkeypatch.setattr(rediam, "obtener", falso)
    cfg = {"adaptador": "rediam_por_anio", "url": "u{anio}{xmin}{ymin}{xmax}{ymax}", "desde": 2008, "hasta": 2025}
    g = A.cargar_capa("incendios", {"incendios": [cfg]}, A.Contexto(raw=tmp_path, zona=ZONA, malla=MALLA, desde_anio=2023))
    assert sorted(set(g["anio"])) == [2023, 2024, 2025] and set(g["fuente"]) == {"REDIAM"}
    assert pedidas[0] == "rediam_2023_300000_4040000_340000_4060000.json"


def test_effis_filtra_por_anio_y_toma_la_url_de_fuentes(tmp_path, monkeypatch):
    from setas_pipeline.adaptadores import effis
    def falso(url, cache, timeout=180):
        assert url.startswith("https://effis/") and cache.parent.name == "incendios"
        return {"type": "FeatureCollection", "features": [
            {"type": "Feature", "properties": {"FIREDATE": f"{y}-08-01"}, "geometry": box(-4.9, 36.5, -4.89, 36.51).__geo_interface__}
            for y in (2010, 2024)]}
    monkeypatch.setattr(effis, "obtener", falso)
    ctx = A.Contexto(raw=tmp_path, zona=ZONA, malla=MALLA, desde_anio=2016,
                     fuentes={"incendios": {"effis_url": "https://effis/{lat0},{lon0},{lat1},{lon1}"}})
    g = A.cargar_capa("incendios", {"incendios": [{"adaptador": "effis"}]}, ctx)
    assert list(g["anio"]) == [2024] and list(g["fuente"]) == ["EFFIS"] and g.crs == A.CRS


def test_solo_senderos_quita_carriles_cicloturistas():
    from shapely.geometry import LineString
    from setas_pipeline.adaptadores.rediam import solo_senderos
    g = gpd.GeoDataFrame({"modalidad": ["Sendero", "Carril cicloturista", None]},
                         geometry=[LineString([(0, 0), (1, 1)])] * 3, crs=A.CRS)
    assert len(solo_senderos(g)) == 2


def test_rediam_senderos_normaliza(tmp_path, monkeypatch):
    from shapely.geometry import LineString
    from setas_pipeline.adaptadores import rediam
    monkeypatch.setattr(rediam, "senderos_rediam", lambda cfg, bbox, cache: gpd.GeoDataFrame(
        {"nombre": [" sendero gr 7 ", "ruta x"], "modalidad": ["Sendero", "Sendero"], "t_dificult": ["Media", None],
         "fid_1": [1, 2]}, geometry=[LineString([(0, 0), (1, 1)])] * 2, crs=A.CRS))
    g = A.cargar_capa("senderos", {"senderos": [{"adaptador": "rediam_senderos", "url_patron": "x", "tesela_m": 50000}]},
                      A.Contexto(raw=tmp_path, zona=ZONA))
    assert list(g.columns) == ["ref", "name", "network", "osmc", "tipo", "fuente", "dificultad", "geometry"]
    assert list(g["name"]) == ["Sendero Gr 7", "Ruta X"] and set(g["fuente"]) == {"rediam"}
