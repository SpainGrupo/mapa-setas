"""Regresión de Marbella (spec §7.1). No re-ejecuta el pipeline (eso lo hace scripts/regresion_marbella.sh
despues, ~decenas de minutos): compara las salidas que haya en data/marbella/out con el dorado."""
import json
from pathlib import Path
import pytest
from setas_pipeline import dorado as D
from setas_pipeline.region import cargar_region

DORADO = Path(__file__).parent / "dorado" / "marbella.json"
OUT = cargar_region("marbella").out


@pytest.mark.skipif(not (OUT / "app" / "manifest.json").exists(), reason="sin datos de Marbella en data/marbella/out")
def test_salidas_de_marbella_iguales_al_dorado():
    difs = D.comparar(json.loads(DORADO.read_text()), D.huella(OUT))
    assert not difs, "\n".join(difs[:50])
