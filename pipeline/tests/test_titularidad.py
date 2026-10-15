from setas_pipeline.titularidad import clase_monte, es_senal_privado, etiqueta_punto, TEXTOS, NORMA


def test_clase_monte():
    assert clase_monte("Comunidad Autónoma de Andalucía") == "monte_junta"
    assert clase_monte("Ayuntamiento") == "monte_municipal"
    assert clase_monte("Otras Entidades Públicas") == "monte_municipal"
    assert clase_monte("Particular") is None


def test_senales_privado_osm():
    assert es_senal_privado({"barrier": "fence"})
    assert es_senal_privado({"barrier": "gate"})
    assert es_senal_privado({"highway": "track", "access": "private"})
    assert es_senal_privado({"highway": "path", "foot": "no"})
    assert not es_senal_privado({"highway": "track"})
    assert not es_senal_privado({"highway": "track", "access": "permit"})


def test_privado_por_defecto_y_refuerzos_no_lo_quitan():
    e = etiqueta_punto(set())
    assert e["clase"] == "privado" and e["texto"] == TEXTOS["privado"] and e["refuerzos"] == []
    e = etiqueta_punto({"coto", "senal_privado"})
    assert e["clase"] == "privado" and e["refuerzos"] == ["coto", "senal_privado"]


def test_monte_publico_manda_y_paso_publico():
    assert etiqueta_punto({"monte_junta", "coto"})["clase"] == "monte_junta"
    assert etiqueta_punto({"monte_municipal"})["texto"] == "Monte público municipal: consulta al ayuntamiento"
    e = etiqueta_punto({"paso_publico"})
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
