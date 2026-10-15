# pipeline/tests/test_dorado.py
import json, os, time
import numpy as np
import pytest
from setas_pipeline import dorado as D
from setas_pipeline.malla import Malla, escribir_tif

M = Malla(x0=300000.0, y1=4100000.0, ancho=4, alto=3, celda=100.0)


def _out(tmp_path):
    out = tmp_path / "out"
    (out / "app").mkdir(parents=True)
    escribir_tif(M, out / "arbol.tif", np.arange(12, dtype="uint8").reshape(3, 4), 255)
    (out / "calibracion.json").write_text(json.dumps({"x": {"n": 3}}))
    (out / "app" / "sitios.json").write_text(json.dumps({"version": 1, "generado": "2026-01-01T00:00:00+00:00", "especies": {}}))
    (out / "app" / "acceso.bin").write_bytes(b"\x01\x02")
    (out / "app" / "manifest.json").write_text(json.dumps({
        "generado": "2026-01-01T00:00:00+00:00", "bbox": [1, 2, 3, 4],
        "especies": [{"id": "a", "nombre": "A", "fiabilidad": "baja"}],
        "archivos": [{"nombre": "x.pmtiles", "bytes": 1000}, {"nombre": "acceso.bin.gz", "bytes": 7}],
        "total_bytes": 1007}))
    return out


def test_sin_generado_quita_la_clave_a_cualquier_profundidad():
    assert D.sin_generado({"generado": 1, "a": [{"generado": 2, "b": 3}]}) == {"a": [{"b": 3}]}


def test_normalizar_manifest_ignora_solo_las_claves_nuevas_multi_region():
    m = {"generado": "t", "bbox": [1], "region": {"id": "marbella"}, "legal": {"ccaa": []},
         "especies": [{"id": "a", "sin_habitat": False, "nombre": "A"}],
         "archivos": [{"nombre": "x.pmtiles", "bytes": 10}, {"nombre": "a.json", "bytes": 5}],
         "total_bytes": 15, "otra_nueva": 1}
    n = D.normalizar_manifest(m)
    assert n == {"bbox": [1], "especies": [{"id": "a", "nombre": "A"}],
                 "archivos": [{"nombre": "x.pmtiles", "bytes": None}, {"nombre": "a.json", "bytes": 5}],
                 "otra_nueva": 1}


def test_huella_identica_no_da_diferencias(tmp_path):
    out = _out(tmp_path)
    assert D.comparar(D.huella(out), D.huella(out)) == []


def test_un_pixel_distinto_se_detecta(tmp_path):
    out = _out(tmp_path)
    antes = D.huella(out)
    a = np.arange(12, dtype="uint8").reshape(3, 4); a[0, 0] = 99
    escribir_tif(M, out / "arbol.tif", a, 255)
    difs = D.comparar(antes, D.huella(out))
    assert len(difs) == 1 and "arbol.tif" in difs[0]


def test_generado_no_cuenta_pero_otra_clave_si(tmp_path):
    out = _out(tmp_path)
    antes = D.huella(out)
    (out / "app" / "sitios.json").write_text(json.dumps({"version": 1, "generado": "otro", "especies": {}}))
    assert D.comparar(antes, D.huella(out)) == []
    (out / "app" / "sitios.json").write_text(json.dumps({"version": 2, "especies": {}}))
    assert any("app/sitios.json" in d for d in D.comparar(antes, D.huella(out)))


def test_tamano_pmtiles_con_tolerancia_del_1_por_ciento():
    base = {"bytes": 100000, "zoom": [8, 13], "teselas": 5, "bbox_e7": [0, 0, 10, 10],
            "atribucion": "a", "nombre": "n"}
    dor = {"pmtiles": {"app/x.pmtiles": base}}
    assert D.comparar(dor, {"pmtiles": {"app/x.pmtiles": {**base, "bytes": 100900}}}) == []
    assert D.comparar(dor, {"pmtiles": {"app/x.pmtiles": {**base, "bytes": 102000}}})
    assert D.comparar(dor, {"pmtiles": {"app/x.pmtiles": {**base, "atribucion": "b"}}})


def test_archivo_que_falta_o_sobra_es_diferencia(tmp_path):
    out = _out(tmp_path)
    antes = D.huella(out)
    (out / "calibracion.json").unlink()
    assert any("calibracion.json" in d for d in D.comparar(antes, D.huella(out)))


def test_desde_exige_que_todo_se_haya_regenerado(tmp_path):
    out = _out(tmp_path)
    viejo = time.time() - 3600
    os.utime(out / "calibracion.json", (viejo, viejo))
    with pytest.raises(D.NoRegenerado, match="calibracion.json"):
        D.huella(out, desde=time.time() - 60)


def test_entradas_fijas_no_exigen_regeneracion(tmp_path):
    out = _out(tmp_path)
    (out / "malla.json").write_text(json.dumps({"x0": 1}))
    viejo = time.time() - 3600
    os.utime(out / "malla.json", (viejo, viejo))
    # malla.json y zona.geojson son entradas (el paso zona necesita OSRM): entran en la huella sin exigir mtime
    h = D.huella(out, desde=time.time() - 60)
    assert "malla.json" in h["json"]


def test_solo_limita_la_comparacion(tmp_path):
    out = _out(tmp_path)
    antes = D.huella(out)
    (out / "calibracion.json").write_text("{}")
    assert D.comparar(antes, D.huella(out), solo=["arbol.tif"]) == []


def test_pmtiles_real(tmp_path):
    from pmtiles.tile import TileType
    from setas_pipeline.exportar import _Salida
    out = tmp_path / "out"; (out / "app").mkdir(parents=True)
    s = _Salida(out / "app" / "x.pmtiles", TileType.PNG, "x", "d")
    s.poner(8, 120, 100, b"png")
    s.cerrar((-5.0, 36.0, -4.0, 37.0), 8, 8, "IGN")
    h = D.huella(out)["pmtiles"]["app/x.pmtiles"]
    assert h["zoom"] == [8, 8] and h["atribucion"] == "IGN" and h["nombre"] == "x" and h["bytes"] > 0


def test_edificado_y_titularidad_se_exigen_regenerados_y_citas_es_entrada(tmp_path):
    """Tras fusionar main (2026-10-15) edificado y titularidad salen de pasos de la rama: deben regenerarse.
    citas.geojson (citas.py, necesita GBIF) es una entrada: se huella sin exigir que sea nueva."""
    out = _out(tmp_path)
    viejo = time.time() - 3600
    for rel in ("edificado.tif", "titularidad_resumen.json", "app/titularidad.pmtiles"):
        (out / rel).write_bytes(b"x")
        os.utime(out / rel, (viejo, viejo))
    with pytest.raises(D.NoRegenerado) as e:
        D.huella(out, desde=time.time() - 60)
    assert set(e.value.rutas) >= {"edificado.tif", "titularidad_resumen.json", "app/titularidad.pmtiles"}
    for rel in ("edificado.tif", "titularidad_resumen.json", "app/titularidad.pmtiles"):
        (out / rel).unlink()
    (out / "citas.geojson").write_text('{"type": "FeatureCollection", "features": []}')
    os.utime(out / "citas.geojson", (viejo, viejo))
    h = D.huella(out, desde=time.time() - 60)
    assert "citas.geojson" in h["json"]


def test_nombre_pmtiles_con_ruta_absoluta_se_guarda_relativo_a_out(tmp_path):
    from pmtiles.tile import TileType
    from setas_pipeline.exportar import _Salida
    hs = []
    for sub in ("a/out", "b/marbella/out"):
        out = tmp_path / sub; (out / "app").mkdir(parents=True)
        destino = out / "app" / "x.pmtiles"
        s = _Salida(destino, TileType.PNG, str(destino), "d")      # como tippecanoe: name = ruta de -o
        s.poner(8, 120, 100, b"png")
        s.cerrar((-5.0, 36.0, -4.0, 37.0), 8, 8, "IGN")
        hs.append(D.huella(out))
    assert hs[0]["pmtiles"]["app/x.pmtiles"]["nombre"] == "<out>/app/x.pmtiles"
    assert hs[1]["pmtiles"]["app/x.pmtiles"]["nombre"] == "<out>/app/x.pmtiles"   # (el tamaño cambia con la ruta)
