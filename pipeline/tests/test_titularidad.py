from setas_pipeline.adaptadores.rediam import clase_monte
from setas_pipeline.region import cargar_region
from setas_pipeline.titularidad import CLASES, es_senal_privado, etiqueta_punto

MARBELLA = cargar_region("marbella")
TEXTOS, NORMA = MARBELLA.legal["titularidad"]["textos"], MARBELLA.legal["titularidad"]["norma"]


def test_clase_monte():
    cfg = MARBELLA.capas["montes_publicos"][0]
    assert clase_monte("Comunidad Autónoma de Andalucía", cfg) == "monte_junta"
    assert clase_monte("Ayuntamiento", cfg) == "monte_municipal"
    assert clase_monte("Otras Entidades Públicas", cfg) == "monte_municipal"
    assert clase_monte("Particular", cfg) is None
    assert clase_monte("Ayuntamiento", {"titular_autonomico": "X", "titulares_municipales": []}) is None


def test_textos_de_todas_las_clases():
    assert set(CLASES) <= set(TEXTOS)


def test_senales_privado_osm():
    assert es_senal_privado({"barrier": "fence"})
    assert es_senal_privado({"barrier": "gate"})
    assert es_senal_privado({"highway": "track", "access": "private"})
    assert es_senal_privado({"highway": "path", "foot": "no"})
    assert not es_senal_privado({"highway": "track"})
    assert not es_senal_privado({"highway": "track", "access": "permit"})


def test_privado_por_defecto_y_refuerzos_no_lo_quitan():
    e = etiqueta_punto(set(), TEXTOS)
    assert e["clase"] == "privado" and e["texto"] == TEXTOS["privado"] and e["refuerzos"] == []
    e = etiqueta_punto({"coto", "senal_privado"}, TEXTOS)
    assert e["clase"] == "privado" and e["refuerzos"] == ["coto", "senal_privado"]


def test_monte_publico_manda_y_paso_publico():
    assert etiqueta_punto({"monte_junta", "coto"}, TEXTOS)["clase"] == "monte_junta"
    assert etiqueta_punto({"monte_municipal"}, TEXTOS)["texto"] == "Monte público municipal: consulta al ayuntamiento"
    e = etiqueta_punto({"paso_publico"}, TEXTOS)
    assert e["clase"] == "privado" and e["paso"]
    assert TEXTOS["paso_publico"] == "Paso público, no recoger fuera"


def test_norma_citada():
    assert "Ley 43/2003" in NORMA and "art. 36" in NORMA and "BOJA 196" in NORMA and "punto 8" in NORMA


def test_fuera_de_publicos_y_edificado():
    import numpy as np
    from shapely.geometry import box, Point
    from setas_pipeline.titularidad import fuera_de_publicos, en_lo_edificado
    from setas_pipeline.malla import Malla
    from setas_pipeline.edificado import EXCLUIDO
    z = box(0, 0, 100, 100)
    f = fuera_de_publicos(z, [box(0, 0, 50, 100)])
    assert abs(f.area - 5000) < 1e-6 and not f.contains(Point(25, 50))
    assert fuera_de_publicos(z, []).equals(z)
    m = Malla(x0=0.0, y1=200.0, ancho=2, alto=2, celda=100.0)
    e = np.array([[EXCLUIDO, 0], [0, 0]], np.uint8)
    assert en_lo_edificado([Point(50, 150), Point(150, 150), Point(500, 500)], m, e).tolist() == [True, False, False]


def test_solo_consulta_en_zoom_maximo():
    from setas_pipeline.titularidad import con_minzoom
    fc = {"features": [{"properties": {"clase": "coto"}}, {"properties": {"clase": "monte_junta"}}]}
    out = con_minzoom(fc)
    assert out["features"][0]["tippecanoe"] == {"minzoom": 14} and "tippecanoe" not in out["features"][1]


def test_region_sin_titularidad_no_exporta_ni_etiqueta(tmp_path):
    import dataclasses
    from setas_pipeline.titularidad import tiene_titularidad, titularidad_puntos
    assert tiene_titularidad(MARBELLA)
    capas = {k: v for k, v in MARBELLA.capas.items() if k not in ("montes_publicos", "cotos_caza", "pasos_publicos")}
    legal = {k: v for k, v in MARBELLA.legal.items() if k != "titularidad"}
    r = dataclasses.replace(MARBELLA, capas=capas, legal=legal, datos=tmp_path)
    assert not tiene_titularidad(r)
    assert titularidad_puntos([(-4.9, 36.5)], r) == [None]


def test_titularidad_puntos_con_poligonos(tmp_path):
    import dataclasses, json
    from setas_pipeline.titularidad import cargar_poligonos, titularidad_puntos
    r = dataclasses.replace(MARBELLA, datos=tmp_path)
    r.out.mkdir(parents=True)
    caja = [[-5.0, 36.0], [-4.0, 36.0], [-4.0, 37.0], [-5.0, 37.0], [-5.0, 36.0]]
    (r.out / "titularidad.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"clase": "monte_junta", "nombre": "El Meliche"},
         "geometry": {"type": "Polygon", "coordinates": [caja]}}]}))
    p = cargar_poligonos(r)
    e, f = titularidad_puntos([(-4.5, 36.5), (-3.0, 36.5)], r, poligonos=p)
    assert e["clase"] == "monte_junta" and e["monte"] == "El Meliche" and e["texto"] == TEXTOS["monte_junta"]
    assert f["clase"] == "privado"


def test_montes_mismo_codigo_poligonos_distintos_no_se_pierden(monkeypatch):
    # dos recintos distintos con el mismo codigo_ja (monte en varias piezas) + la misma pieza repetida por
    # solaparse dos teselas: se quita solo la repetida, nunca área
    import geopandas as gpd
    from shapely.geometry import box
    from setas_pipeline.adaptadores import rediam, Contexto, CRS
    cfg = MARBELLA.capas["montes_publicos"][0]
    t = "Ayuntamiento"
    g = gpd.GeoDataFrame({"codigo_ja": ["MA-1", "MA-1", "MA-1", "MA-2"], "nombre": ["A", "A", "A", "B"],
                          "tipo_titul": [t] * 4},
                         geometry=[box(0, 0, 100, 100), box(500, 0, 600, 100), box(0, 0, 100, 100),
                                   box(0, 500, 100, 600)], crs=CRS)
    monkeypatch.setattr(rediam, "_teselas", lambda cfg, ctx: g)
    r = rediam.rediam_montes(cfg, Contexto(raw=".", zona=box(0, 0, 1000, 1000)))
    assert len(r) == 3 and r.area.sum() == 30000
    assert sorted(r["codigo"]) == ["MA-1", "MA-1", "MA-2"]


def test_resumen_cuenta_montes_no_piezas():
    import geopandas as gpd
    from shapely.geometry import box
    from setas_pipeline.titularidad import n_montes
    m = gpd.GeoDataFrame({"clase": ["monte_junta"] * 3 + ["monte_municipal"] * 2,
                          "codigo": ["A", "A", "B", None, None]}, geometry=[box(0, 0, 1, 1)] * 5)
    assert n_montes(m, "monte_junta") == 2 and n_montes(m, "monte_municipal") == 2
    assert n_montes(m.iloc[:0], "monte_junta") == 0
