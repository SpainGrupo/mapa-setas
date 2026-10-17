import json
import numpy as np
import pytest
from setas_pipeline import citas_sitios as C


def _cita(x, y, prec=None, origen="inat", fecha="2022-10-01", **k):
    return {"x": x, "y": y, "precision_m": prec, "origen": origen, "fecha": fecha, "url": k.get("url", "https://ej.org/1"),
            "fuente": "iNaturalist", "atribucion": "alguien", "licencia": k.get("licencia", "CC-BY-4.0")}


def test_radio_de_asignacion():
    assert C.radio(None) == 1000
    assert C.radio(10) == 1000
    assert C.radio(2500) == 2500
    assert C.radio(5000) == 5000
    assert C.radio(5001) is None


def test_asignacion_nivel_punto_y_paraje():
    sitios = np.array([[0.0, 0.0], [10_000.0, 0.0], [20_000.0, 0.0], [30_000.0, 0.0]])
    citas = [
        _cita(800, 0, prec=30),                 # sitio 0: punto (precisa y a ≤ 1 km)
        _cita(10_900, 0, prec=None),            # sitio 1: sin precisión a 900 m → paraje
        _cita(21_500, 0, prec=None),            # a 1,5 km sin precisión → no se asigna
        _cita(23_000, 0, prec=3000),            # sitio 2: precisión 3 km, a 3 km → paraje
        _cita(30_000, 0, prec=8000),            # > 5 km de precisión → nunca
    ]
    r = C.asignar(sitios, citas)
    assert r[0]["nivel"] == "punto" and r[0]["n"] == 1 and r[0]["refs"][0]["dist_m"] == 800
    assert r[1]["nivel"] == "paraje" and r[1]["n"] == 1 and r[1]["refs"][0]["precision_m"] is None
    assert r[2]["nivel"] == "paraje" and r[2]["n"] == 1 and r[2]["refs"][0]["dist_m"] == 3000
    assert r[3] is None
    assert C.factor(r[0]) == 1.15 and C.factor(r[1]) == 1.05 and C.factor(None) == 1.0


def test_precisa_pero_lejos_es_paraje():
    # Precisión 1 km pero a 1,2 km: radio max(1000, 1000) = 1000 → no se asigna; precisión 1,5 km a 1,2 km → paraje.
    s = np.array([[0.0, 0.0]])
    assert C.asignar(s, [_cita(1200, 0, prec=1000)]) == [None]
    assert C.asignar(s, [_cita(1200, 0, prec=1500)])[0]["nivel"] == "paraje"


def test_refs_ordenadas_por_fecha_con_tope_y_resumen():
    s = np.array([[0.0, 0.0]])
    citas = [_cita(10 * i, 0, prec=10, fecha=f"20{10 + i:02d}-05-01", origen=("foro" if i == 3 else "gbif"))
             for i in range(12)] + [_cita(5, 0, prec=10, fecha=None, url="javascript:alert(1)")]
    r = C.asignar(s, citas)[0]
    assert r["n"] == 13 and len(r["refs"]) == C.MAX_REFS
    assert [x["fecha"][:4] for x in r["refs"][:3]] == ["2021", "2020", "2019"]
    assert r["ultima"] == "2021"
    assert r["origenes"] == ["foro", "inat", "gbif"]          # orden de citas.ts (ORIGENES)
    assert all(set(x) == {"origen", "fecha", "precision_m", "dist_m", "url", "fuente", "atribucion", "licencia"} for x in r["refs"])
    # La sin fecha queda al final (fuera del tope) y una URL que no es http(s) no se publica.
    sin = C.asignar(s, [_cita(5, 0, prec=10, fecha=None, url="javascript:alert(1)")])[0]
    assert sin["ultima"] is None and sin["refs"][0]["url"] is None


def test_textos_que_hablan_de_comestibilidad_no_pasan():
    c = _cita(10, 0, prec=10)
    c["atribucion"] = "Excelente comestible, muy buscada"
    c["fuente"] = "Foro X"
    r = C.asignar(np.array([[0.0, 0.0]]), [c])[0]["refs"][0]
    assert r["atribucion"] is None and r["fuente"] == "Foro X"


def test_evaluable_como_la_calibracion():
    assert C.evaluable({"precision_m": None, "origen": "gbif"})
    assert C.evaluable({"precision_m": 1000, "origen": "inat"})
    assert not C.evaluable({"precision_m": 1001, "origen": "inat"})
    assert C.evaluable({"precision_m": 100, "origen": "foro"})
    assert not C.evaluable({"precision_m": 1000, "origen": "literatura"})
    assert not C.evaluable({"precision_m": None, "origen": "foro"})


def _sitios(n, punt=50.0):
    return [{"id": i, "punt_media": punt - i * 0.1, "area_ha": 10.0, "bonus_pisado": 1.0} for i in range(n)]


def test_aciertos_top_y_esperados():
    s = _sitios(20)
    xy = np.array([[i * 10_000.0, 0.0] for i in range(20)])
    cal = np.array([C.calidad(x) for x in s]); ids = np.arange(20)
    # Una cita junto al sitio 0 (top) y otra junto al 15 (fuera del top 10); otra lejos de todo (no alcanzable).
    ev = np.array([[100.0, 0.0], [150_100.0, 0.0], [0.0, 50_000.0]])
    r = C.aciertos_top(cal, ids, xy, ev, n=10)
    assert r == {"alcanzables": 2, "aciertos": 1, "esperados": pytest.approx(2 * 10 / 20)}
    assert C.aciertos_top(cal[:10], ids[:10], xy[:10], ev, n=10) is None          # top = todo
    # Con el factor que sube el 15 por encima del 9 (calidades muy cercanas) el acierto pasa a 2.
    fac = np.ones(20); fac[15] = 1.15
    assert C.aciertos_top(cal * fac, ids, xy, ev, n=10)["aciertos"] == 2


def test_validacion_por_bloques_no_usa_las_citas_evaluadas():
    """La cita evaluada del pliegue 0 no enciende el factor de su propio pliegue: solo las de otros pliegues."""
    s = _sitios(24)
    xy = np.array([[i * 10_000.0, 0.0] for i in range(24)])
    pl_s = np.array([0] * 12 + [1] * 12)
    # Cita evaluable junto al sitio 11 (pliegue 0, fuera del top 10 por calidad).
    citas = [_cita(110_100.0, 0, prec=10)]
    r = C.validar_especie(s, xy, pl_s, citas, np.array([0]), k=2, n=10)
    assert r["alcanzables"] == 1 and r["afectados"] == 0 and r["aciertos_sin"] == r["aciertos_con"] == 0
    # Una cita de entrenamiento (pliegue 1) junto al sitio 11 sí lo sube al top 10 del pliegue 0.
    citas2 = citas + [_cita(110_300.0, 0, prec=10)]
    r2 = C.validar_especie(s, xy, pl_s, citas2, np.array([0, 1]), k=2, n=10)
    assert r2["afectados"] >= 1 and r2["aciertos_con"] == 1 and r2["aciertos_sin"] == 0
    assert r2["lift_con"] > r2["lift_sin"] == 0


def test_decidir():
    base = {"n_eval": 0, "pliegues": 1, "afectados": 0}
    poco = {"a": {**base, "alcanzables": 3, "aciertos_sin": 1, "aciertos_con": 2, "esperados": 1.0}}
    assert C.decidir(poco, 10)["factor_citas"] is False
    assert C.decidir(poco, 10)["motivo"] == "sin_prueba"
    peor = {"a": {**base, "alcanzables": 12, "aciertos_sin": 4, "aciertos_con": 3, "esperados": 2.0}}
    assert C.decidir(peor, 10)["factor_citas"] is False and C.decidir(peor, 10)["motivo"] == "empeora"
    igual = {"a": {**base, "alcanzables": 6, "aciertos_sin": 2, "aciertos_con": 2, "esperados": 1.0},
             "b": {**base, "alcanzables": 6, "aciertos_sin": 1, "aciertos_con": 1, "esperados": 1.0}}
    d = C.decidir(igual, 10)
    assert d["factor_citas"] is True and d["lift_sin"] == d["lift_con"] == 1.5 and d["juzgadas"] == []


def test_anio_corte():
    citas = [{"fecha": f"{2010 + i}-01-01"} for i in range(10)] + [{"fecha": None}]
    assert C.anio_corte(citas, 0.3) == 2017
    assert C.anio_corte([{"fecha": None}]) is None


def test_anotar_escribe_campo_y_factor(tmp_path):
    from setas_pipeline.malla import Malla
    from pyproj import Transformer
    tr = Transformer.from_crs("EPSG:25830", "EPSG:4326", always_xy=True)
    malla = Malla(300_000.0, 4_100_000.0, 200, 200, 100.0)
    sitios = []
    for i in range(3):
        lon, lat = tr.transform(301_000.0 + i * 5000, 4_099_000.0)
        sitios.append({"id": i, "lat": round(lat, 5), "lon": round(lon, 5), "punt_media": 70, "area_ha": 5, "bonus_pisado": 1})
    lon, lat = tr.transform(301_200.0, 4_099_000.0)
    feats = [{"type": "Feature", "geometry": None, "properties": {
        "especie": "boletus_reticulatus", "fecha": "2023-10-02", "lat": lat, "lon": lon, "precision_m": 20,
        "fuente": "iNaturalist", "origen": "inat", "licencia": "sin licencia (todos los derechos reservados)",
        "url": "https://www.inaturalist.org/observations/1", "atribucion": "alguien"}}]
    out = tmp_path / "out"; out.mkdir()
    (out / "citas.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}))

    class R:
        id = "prueba"
    R.out = out
    datos = {"version": 2, "especies": {"boletus_aestivalis": sitios}}
    res = C.anotar(R, datos, malla, verbose=False)
    s0 = datos["especies"]["boletus_aestivalis"][0]
    assert s0["citas"]["nivel"] == "punto" and s0["citas"]["n"] == 1 and s0["citas"]["ultima"] == "2023"
    assert "citas" not in datos["especies"]["boletus_aestivalis"][1]
    assert datos["factor_citas"] is False and res["decision"]["motivo"] == "sin_prueba"
    assert (out / "validacion_citas.md").read_text().startswith("# Validación del factor")
    assert not any("comestible" in l.lower() for l in (out / "validacion_citas.md").read_text().splitlines())
    # Sin citas.geojson: sin campo y factor apagado.
    (out / "citas.geojson").unlink()
    datos2 = {"version": 2, "especies": {"boletus_aestivalis": [dict(x) for x in sitios]}}
    datos2["especies"]["boletus_aestivalis"][0]["citas"] = {"n": 9}
    C.anotar(R, datos2, malla, verbose=False)
    assert datos2["factor_citas"] is False and all("citas" not in s for s in datos2["especies"]["boletus_aestivalis"])
