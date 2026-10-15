import dataclasses, json
import pytest
import io
import numpy as np
from PIL import Image
from setas_pipeline.region import cargar_region
from setas_pipeline.exportar import (colormap, aplicar_umbral, png_idoneidad, sombreado,
                                     pixeles_tesela, teselas_bbox)


def test_colormap_cero_transparente_y_cien_color_maximo():
    lut = colormap()
    assert lut.shape == (101, 4) and lut.dtype == np.uint8
    assert lut[0, 3] == 0                               # 0 → transparente
    assert (lut[1:, 3] == 255).all()                    # resto opaco
    assert tuple(lut[100, :3]) == (0, 69, 41)           # 100 → verde más oscuro (#004529)
    # secuencial: la luminosidad baja de forma monótona
    lum = lut[1:, :3].astype(float) @ [0.299, 0.587, 0.114]
    assert (np.diff(lum) <= 0).all()


def test_umbral_distancia_oculta_celdas_cercanas_al_acceso():
    idon = np.array([[50, 80], [100, 0]], dtype=np.uint8)
    dist = np.array([[100.0, 250.0], [600.0, 900.0]], dtype=np.float32)
    assert (aplicar_umbral(idon, dist, 0) == idon).all()
    assert aplicar_umbral(idon, dist, 200).tolist() == [[0, 80], [100, 0]]
    assert aplicar_umbral(idon, dist, 800).tolist() == [[0, 0], [0, 0]]
    # el umbral es inclusivo: a 600 m exactos se ve con umbral 600
    assert aplicar_umbral(idon, dist, 600)[1, 0] == 100


def test_umbral_nodata_de_distancia_se_oculta():
    idon = np.array([[50]], dtype=np.uint8)
    dist = np.array([[-9999.0]], dtype=np.float32)
    assert aplicar_umbral(idon, dist, 0)[0, 0] == 0


def test_png_idoneidad_conserva_transparencia_y_color():
    v = np.zeros((256, 256), dtype=np.uint8)
    v[0, 0] = 100
    img = Image.open(io.BytesIO(png_idoneidad(v))).convert("RGBA")
    assert img.getpixel((0, 0)) == (0, 69, 41, 255)
    assert img.getpixel((1, 1))[3] == 0


def test_sombreado_plano_sin_sombra_y_ladera_norte_sombreada():
    plano = np.full((5, 5), 500.0, dtype=np.float32)
    s = sombreado(plano, 100.0, nodata=-9999.0)
    assert np.allclose(s[1:-1, 1:-1], s[2, 2])
    # sol del noroeste (315°): la ladera que baja hacia el NO sale más clara que la que baja al SE
    yy, xx = np.mgrid[0:5, 0:5].astype(np.float32)
    hacia_se = 1000 - 50 * (xx + yy)
    hacia_no = 1000 + 50 * (xx + yy)
    assert sombreado(hacia_no, 100.0, -9999.0)[2, 2] > sombreado(hacia_se, 100.0, -9999.0)[2, 2]


def test_pixeles_tesela_esquinas():
    lon, lat = pixeles_tesela(0, 0, 0)
    assert lon.shape == (256, 256)
    assert -180 < lon[0, 0] < -179 and 85 > lat[0, 0] > 84
    assert lon[0, 128] == 128.5 / 256 * 360 - 180   # centro de píxel


def test_teselas_bbox_cubre_malaga():
    ts = list(teselas_bbox((-4.5, 36.7, -4.4, 36.75), 10))
    assert (10, 499, 399) in ts and len(ts) <= 4
    for z, x, y in ts:
        assert z == 10


# ---------------------------------------------------------------- Fase 3: puntos meteo

from shapely.geometry import box as _box, Point as _Point
from setas_pipeline.malla import Malla as _Malla
from setas_pipeline.exportar import rejilla_meteo, con_bosque_cerca, voronoi_zonas, alt_media


def test_rejilla_meteo_paso_y_solo_dentro_de_la_zona():
    zona = _box(0, 0, 48000, 24000)
    pts = rejilla_meteo(zona, 12000)
    assert len(pts) == 4 * 2
    assert (6000.0, 6000.0) in pts and (42000.0, 18000.0) in pts
    # zona en L: los centros fuera del polígono se descartan
    ele = zona.difference(_box(24000, 12000, 48000, 24000))
    assert len(rejilla_meteo(ele, 12000)) == 6
    assert all(ele.contains(_Point(p)) for p in rejilla_meteo(ele, 12000))


def test_filtro_descarta_puntos_sin_bosque_en_el_radio():
    malla = _Malla(0.0, 30000.0, 300, 300, 100.0)       # 30 × 30 km
    mascara = np.zeros((300, 300), bool)
    mascara[50, 50] = True                              # celda con bosque en x=5050, y=24950
    pts = [(5000.0, 25000.0), (9000.0, 25000.0), (25000.0, 5000.0)]
    assert con_bosque_cerca(pts, mascara, malla, 6000) == [True, True, False]
    assert con_bosque_cerca(pts, mascara, malla, 3000) == [True, False, False]


def test_voronoi_cubre_toda_la_zona_y_cada_punto_esta_en_su_celda():
    zona = _box(0, 0, 48000, 24000).difference(_box(30000, 15000, 48000, 24000))
    pts = [(6000.0, 6000.0), (18000.0, 18000.0), (42000.0, 6000.0), (20000.0, 5000.0)]
    celdas = voronoi_zonas(pts, zona)
    assert len(celdas) == len(pts)
    from shapely import union_all
    u = union_all(celdas)
    assert abs(u.area - zona.area) < 1e-3 * zona.area
    assert u.symmetric_difference(zona).area < 1e-3 * zona.area
    assert sum(c.area for c in celdas) == pytest.approx(zona.area, rel=1e-6)    # sin solapes
    for p, c in zip(pts, celdas):
        assert c.contains(_Point(p))


def test_alt_media_usa_las_celdas_con_bosque_del_radio():
    malla = _Malla(0.0, 10000.0, 100, 100, 100.0)
    alt = np.full((100, 100), 200.0, dtype=np.float32)
    alt[:, 50:] = 1000.0
    mascara = np.zeros((100, 100), bool)
    mascara[40:60, 60:70] = True                        # todo el bosque a 1000 m
    assert alt_media((5000.0, 5000.0), alt, mascara, malla, 3000) == pytest.approx(1000.0)
    # sin bosque en el radio: media del terreno del radio (ignorando nodata)
    alt[0, 0] = -9999.0
    v = alt_media((1000.0, 9000.0), alt, np.zeros_like(mascara), malla, 500)
    assert v == pytest.approx(200.0)


def test_especies_exporta_reglas_de_tiempo():
    from setas_pipeline.exportar import especies
    es = {e["id"]: e for e in especies(cargar_region("marbella"))}
    assert es["boletus_aereus"]["tiempo"] == {"episodio_mm": 25, "ventana_dias": [8, 20],
                                              "tmin_media": [8, 18], "tmax_media": [15, 27],
                                              "balance_30d_min_mm": -30, "dias_lluvia_30d_min": 3,
                                              "humedad_suelo_min": 0.15, "meses": [5, 6, 9, 10, 11, 12]}
    assert es["amanita_caesarea"]["tiempo"]["ventana_dias"] == [7, 16]
    assert es["amanita_ponderosa"]["tiempo"]["meses"] == [2, 3, 4]
    obligatorias = {"episodio_mm", "ventana_dias", "tmin_media", "tmax_media", "meses"}
    opcionales = {"balance_30d_min_mm", "dias_lluvia_30d_min", "humedad_suelo_min"}
    for e in es.values():
        t = e["tiempo"]
        assert obligatorias <= set(t) <= obligatorias | opcionales, e["id"]
        assert t["ventana_dias"][0] < t["ventana_dias"][1]
        assert all(1 <= m <= 12 for m in t["meses"])


def test_modelo_solo_si_existen_sus_archivos(tmp_path, capsys):
    import json
    from setas_pipeline.exportar import modelo_disponible
    assert modelo_disponible(tmp_path) is None
    (tmp_path / "modelo").mkdir()
    paq = {"version": "x", "dir": "modelo/", "archivos": [{"nombre": "a.onnx", "bytes": 3}]}
    (tmp_path / "modelo" / "paquete.json").write_text(json.dumps(paq))
    assert modelo_disponible(tmp_path) is None
    assert "a.onnx" in capsys.readouterr().out
    (tmp_path / "modelo" / "a.onnx").write_bytes(b"abc")
    assert modelo_disponible(tmp_path) == paq
    # sin paquete.json: se hereda del manifest anterior, con la misma comprobación
    (tmp_path / "modelo" / "paquete.json").unlink()
    (tmp_path / "manifest.json").write_text(json.dumps({"modelo": paq}))
    assert modelo_disponible(tmp_path) == paq
    (tmp_path / "modelo" / "a.onnx").unlink()
    assert modelo_disponible(tmp_path) is None


def test_fiabilidad_segun_n_y_lift_de_validacion():
    from setas_pipeline.exportar import fiabilidad
    assert fiabilidad(47, 2.57) == "buena"
    assert fiabilidad(10, 2.0) == "buena"
    assert fiabilidad(25, 1.99) == "media"
    assert fiabilidad(25, 1.3) == "media"
    assert fiabilidad(13, 0.93) == "baja"
    assert fiabilidad(13, 1.29) == "baja"
    assert fiabilidad(9, 12.3) == "sin_validar"     # n < 10: no se juzga aunque el lift sea alto
    assert fiabilidad(0, None) == "sin_validar"
    assert fiabilidad(None, None) == "sin_validar"  # especie sin calibrar
    assert fiabilidad(15, None) == "sin_validar"    # ningún pliegue con observaciones


def test_especies_lleva_fiabilidad(tmp_path):
    import setas_pipeline.exportar as ex
    r = _region(tmp_path)
    r.out.mkdir(parents=True)
    (r.out / "calibracion.json").write_text(json.dumps(
        {"pleurotus_eryngii": {"n": 13, "lift_ajuste": 1.53, "lift_validacion": 0.93, "pliegues": 4}}))
    es = {e["id"]: e for e in ex.especies(r)}
    assert es["pleurotus_eryngii"]["fiabilidad"] == "baja"
    assert es["boletus_aereus"]["fiabilidad"] == "sin_validar"
    assert all(e["fiabilidad"] in {"buena", "media", "baja", "sin_validar"} for e in es.values())


def test_sitios_en_manifest_solo_si_existe(tmp_path):
    import json
    from setas_pipeline.exportar import sitios_manifest
    assert sitios_manifest(tmp_path) is None
    (tmp_path / "sitios.json").write_text(json.dumps(
        {"version": 1, "generado": "x", "especies": {"a": [{}, {}], "b": []}}))
    assert sitios_manifest(tmp_path) == {"archivo": "sitios.json", "version": 1,
                                         "n_por_especie": {"a": 2, "b": 0}}


def _region(tmp_path, **kw):
    return dataclasses.replace(cargar_region("marbella"), datos=tmp_path, **kw)


def test_especies_sin_habitat_marcadas_y_fuera_de_activas(tmp_path):
    import setas_pipeline.exportar as ex
    activas = tuple(k for k in cargar_region("marbella").especies_activas if k != "boletus_edulis")
    r = _region(tmp_path, especies_activas=activas, especies_sin_habitat=("boletus_edulis",))
    es = ex.especies(r)
    assert [e["id"] for e in es] == list(cargar_region("marbella").especies_activas)     # orden del catálogo
    assert {e["id"]: e["sin_habitat"] for e in es}["boletus_edulis"] is True
    assert "boletus_edulis" not in [e["id"] for e in ex.especies_activas(r)]


def test_especies_aplica_overrides_de_la_region(tmp_path):
    import setas_pipeline.exportar as ex
    r = _region(tmp_path, overrides_especies={"boletus_aereus": {"tiempo": {"episodio_mm": 40}}})
    t = {e["id"]: e for e in ex.especies(r)}["boletus_aereus"]["tiempo"]
    assert t["episodio_mm"] == 40 and t["ventana_dias"] == [8, 20]


def test_manifest_lleva_region_legal_y_sin_habitat(tmp_path):
    import setas_pipeline.exportar as ex
    r = _region(tmp_path)
    r.app.mkdir(parents=True)
    (r.out / "zona.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": [{
        "type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": [[
            [-4.9, 36.5], [-4.8, 36.5], [-4.8, 36.6], [-4.9, 36.6], [-4.9, 36.5]]]}}]}))
    m = ex.escribir_manifest(r)
    assert m["region"] == {"id": "marbella", "nombre": "Marbella", "origen": [-4.8825, 36.5101],
                           "etiqueta_origen": "de Marbella"}
    assert [c["id"] for c in m["legal"]["ccaa"]] == ["AND"] and m["legal"]["ccaa"][0]["verificado"] is False
    assert all(e["sin_habitat"] is False for e in m["especies"])
    assert json.loads((r.app / "manifest.json").read_text())["region"]["id"] == "marbella"


def test_regiones_json_indexa_las_que_tienen_manifest(tmp_path):
    import shutil
    import setas_pipeline.exportar as ex
    from setas_pipeline.region import REGIONES
    regs = tmp_path / "regiones"; regs.mkdir()
    shutil.copy(REGIONES / "marbella.yaml", regs / "marbella.yaml")
    datos = tmp_path / "data"
    (datos / "marbella/out/app").mkdir(parents=True)
    (datos / "marbella/out/app/manifest.json").write_text(json.dumps(
        {"bbox": [-5.9, 36.0, -3.8, 37.5], "total_bytes": 123, "generado": "2026-10-15T10:00:00+00:00"}))
    lista = ex.escribir_regiones(datos, regs)
    assert lista == [{"id": "marbella", "nombre": "Marbella", "origen": [-4.8825, 36.5101],
                      "bbox": [-5.9, 36.0, -3.8, 37.5], "total_bytes": 123, "generado": "2026-10-15T10:00:00+00:00"}]
    assert json.loads((datos / "regiones.json").read_text()) == lista


def test_regiones_junto_a_otros_pasos_tambien_se_escribe(monkeypatch):
    import setas_pipeline.exportar as ex
    hechos = []
    monkeypatch.setattr(ex.Malla, "cargar", staticmethod(lambda ruta: None))
    monkeypatch.setattr(ex, "escribir_manifest", lambda region: hechos.append("manifest") or
                        {"archivos": [], "total_bytes": 0})
    monkeypatch.setattr(ex, "escribir_regiones", lambda: hechos.append("regiones") or [])
    ex.main(["manifest", "regiones", "--region", "marbella"])
    assert hechos == ["manifest", "regiones"]
    hechos.clear()
    ex.main(["regiones"])
    assert hechos == ["regiones"]


def test_umbral_no_pinta_menos_de_30():
    idon = np.array([[29, 30, 1, 100]], dtype=np.uint8)
    dist = np.full((1, 4), 500.0, dtype=np.float32)
    assert aplicar_umbral(idon, dist, 0).tolist() == [[0, 30, 0, 100]]
    assert aplicar_umbral(idon, dist, 0, minimo=0).tolist() == [[29, 30, 1, 100]]


def test_citas_capa_filtra_bbox_y_mapea_especie():
    from setas_pipeline.exportar import citas_capa
    f = lambda esp, lon, lat, **k: {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
                                    "properties": {"especie": esp, "lon": lon, "lat": lat, "origen": "inat",
                                                   "fecha": "2020-11-15T10:00", "url": "u", "licencia": "CC-BY",
                                                   "precision_m": 10, **k}}
    c = {"features": [f("boletus_reticulatus", -4.9, 36.5), f("amanita_caesarea", -1.0, 36.5)]}
    out = citas_capa(c, (-5.5, 36.0, -4.0, 37.0))
    assert len(out) == 1
    p = out[0]["properties"]
    assert p["especie_mapa"] == "boletus_aestivalis" and p["especie"] == "boletus_reticulatus"
    assert p["fecha"] == "2020-11-15" and p["origen"] == "inat" and p["url"] == "u"


def test_lugar_cercano():
    from setas_pipeline.exportar import lugar_cercano
    lug = [("Ojén", 36.565, -4.856), ("Ronda", 36.742, -5.166)]
    assert lugar_cercano(36.58, -4.79, lug) == "Ojén"
    assert lugar_cercano(36.70, -5.10, lug) == "Ronda"
    assert lugar_cercano(36.7, -5.1, []) is None
