"""Ningún valor de Marbella/Andalucía ni ruta plana de datos queda en el código (van en regiones/<id>.yaml)."""
from pathlib import Path
import pytest

CODIGO = Path(__file__).resolve().parent.parent / "setas_pipeline"
PROHIBIDO = ["-4.8825", "andalucia.osm.pbf", "data/out", "data/raw", "BOJA", "Sierra de las Nieves",
             "juntadeandalucia.es", "router.project-osrm.org", '"Marbella"']


@pytest.mark.parametrize("texto", PROHIBIDO)
def test_sin_valores_fijos(texto):
    hallados = [f"{p.relative_to(CODIGO)}:{i}" for p in CODIGO.rglob("*.py")
                for i, linea in enumerate(p.read_text().splitlines(), 1) if texto in linea]
    assert not hallados, f"{texto!r} sigue en el código: {hallados}"


def test_fuentes_yaml_sin_lo_regional():
    import yaml
    f = yaml.safe_load((CODIGO.parent / "fuentes.yaml").read_text())
    assert not {"enp", "rediam_senderos", "zonificacion_porn"} & set(f)
    assert "url" not in f["osm"] and "provincias" not in f["mfe"]
    assert not [k for k in f["incendios"] if k.startswith("rediam")]
    assert "effis_url" in f["incendios"]
