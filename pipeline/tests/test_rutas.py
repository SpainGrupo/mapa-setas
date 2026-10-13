import pytest
from setas_pipeline.rutas import clasificar_ref


@pytest.mark.parametrize("ref,nombre,tipo", [
    ("GR 7", None, "GR"), ("GR-249", None, "GR"), ("GR 249.3", None, "GR"), ("gr 141", None, "GR"),
    ("PR-A 123", None, "PR"), ("PR A-123", None, "PR"), ("PR-A123", None, "PR"),
    ("SL-A 12", None, "SL"), ("SL-A-5", None, "SL"),
    ("E-4", None, "otro"), ("GRAN SENDA", None, "otro"), ("12", None, "otro"), (None, None, "otro"),
    ("", "Sendero del Pinsapar", "otro"),
    (None, "PR-A 288 Cañada del Cuerno", "PR"),          # sin ref: se mira el nombre
    ("E-4;GR 7", None, "GR"),                            # varias matrículas
    (float("nan"), float("nan"), "otro"),                # nulos de pandas
])
def test_clasificar_ref(ref, nombre, tipo):
    assert clasificar_ref(ref, nombre) == tipo
