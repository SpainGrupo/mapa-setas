import pandas as pd
from setas_pipeline.malla import SUELO
from setas_pipeline.suelo import clasificar_litologia

MAPEO = {"ultrabasico": ["peridotita", "serpentinita"],
         "acido": ["granito", "pizarra", "esquisto", "gneis", "cuarcita", "arenisca"],
         "basico": ["caliza", "dolomia", "dolomía", "marga", "yeso"]}

def test_clasificar_litologia():
    s = clasificar_litologia(pd.Series(["Peridotitas serpentinizadas", "Pizarras y esquistos",
                                        "Calizas y dolomías", "Aluvial", None]), MAPEO)
    assert list(s) == [SUELO["ultrabasico"], SUELO["acido"], SUELO["basico"], SUELO["otro"], SUELO["desconocido"]]
