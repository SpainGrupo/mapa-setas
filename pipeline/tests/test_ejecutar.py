import os
from setas_pipeline import ejecutar
from setas_pipeline.region import cargar_region


def _paso(tmp_path, monkeypatch, t_in, t_out):
    ent, sal = tmp_path / "in.txt", tmp_path / "out.txt"
    ent.write_text("x"); sal.write_text("y")
    os.utime(ent, (t_in, t_in)); os.utime(sal, (t_out, t_out))
    llamadas = []
    monkeypatch.setattr(ejecutar, "pasos_de",
                        lambda region: {"p": (lambda: llamadas.append(1), lambda: [sal], lambda: [ent])})
    return llamadas


def test_entrada_mas_nueva_reejecuta(tmp_path, monkeypatch):
    llamadas = _paso(tmp_path, monkeypatch, t_in=2000, t_out=1000)
    assert ejecutar.ejecutar(["p"]) == ["p"] and llamadas


def test_entrada_mas_antigua_se_salta(tmp_path, monkeypatch):
    llamadas = _paso(tmp_path, monkeypatch, t_in=1000, t_out=2000)
    assert ejecutar.ejecutar(["p"]) == [] and not llamadas


def test_pasos_de_usan_las_rutas_de_la_region(tmp_path):
    import dataclasses
    r = dataclasses.replace(cargar_region("marbella"), datos=tmp_path)
    p = ejecutar.pasos_de(r)
    assert set(p) == {"zona", "relieve", "vegetacion", "suelo", "estructura", "cubierta", "incendios", "humedad",
                      "protegidos", "accesos", "satelite", "edificado", "idoneidad", "calibracion", "vista"}
    assert set(p) == set(ejecutar.NOMBRES)
    assert all(s.parent == r.out for s in p["relieve"][1]())
    assert p["edificado"][1]() == [r.out / "edificado.tif"]
    assert r.out / "citas.geojson" in p["calibracion"][2]()
    assert r.config in p["relieve"][2]()              # cambiar la config de la región rehace los pasos
    assert len(p["idoneidad"][1]()) == 22


def test_cli_rechaza_region_desconocida():
    import pytest
    with pytest.raises(SystemExit):
        ejecutar.main(["zona", "--region", "no_existe"])
