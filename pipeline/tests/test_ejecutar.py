import os
from setas_pipeline import ejecutar


def _paso(tmp_path, monkeypatch, t_in, t_out):
    ent, sal = tmp_path / "in.txt", tmp_path / "out.txt"
    ent.write_text("x"); sal.write_text("y")
    os.utime(ent, (t_in, t_in)); os.utime(sal, (t_out, t_out))
    llamadas = []
    monkeypatch.setattr(ejecutar, "PASOS", {"p": (lambda: llamadas.append(1), lambda: [sal], lambda: [ent])})
    return llamadas


def test_entrada_mas_nueva_reejecuta(tmp_path, monkeypatch):
    llamadas = _paso(tmp_path, monkeypatch, t_in=2000, t_out=1000)
    assert ejecutar.ejecutar(["p"]) == ["p"] and llamadas


def test_entrada_mas_antigua_se_salta(tmp_path, monkeypatch):
    llamadas = _paso(tmp_path, monkeypatch, t_in=1000, t_out=2000)
    assert ejecutar.ejecutar(["p"]) == [] and not llamadas
