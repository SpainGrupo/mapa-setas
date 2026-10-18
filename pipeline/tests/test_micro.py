import gzip, json
import numpy as np
from setas_pipeline import micro as MI
from setas_pipeline.malla import Malla, NODATA_F


def test_orientacion_mitad_de_grado_llano_y_nodata():
    o = np.array([0.0, 181.0, 359.4, -1.0, NODATA_F], "float32")
    assert MI.codificar_orientacion(o).tolist() == [0, 90, 0, MI.LLANO, MI.NODATA]   # 359,4° ≈ 0° (al norte)


def test_pendiente_y_cauce():
    assert MI.codificar_pendiente(np.array([12.4, 95, NODATA_F], "float32")).tolist() == [12, 90, 255]
    assert MI.codificar_cauce(np.array([0, 64, 4000, NODATA_F], "float32")).tolist() == [0, 6, MI.CAUCE_MAX, 255]


def test_teselar_omite_teselas_sin_habitat_y_rellena_bordes():
    alto, ancho, t = 5, 7, 4
    fac = [np.full((alto, ancho), 3, "uint8")]
    idon = np.zeros((alto, ancho), "uint8"); idon[4, 6] = 80     # solo la tesela (1, 1)
    teselas = list(MI.teselar(fac, [idon], t))
    assert [(a, b) for a, b, _ in teselas] == [(1, 1)]
    bloque = np.frombuffer(teselas[0][2], "uint8").reshape(2, t, t)
    assert bloque[0, 0, 0] == 3 and bloque[0, 1, 0] == MI.NODATA     # fila 5 no existe: relleno NODATA
    assert bloque[1, 0, 2] == 80 and bloque[1, 0, 3] == 0            # idoneidad: relleno 0


def test_escribir_indice_y_bloques_gzip(tmp_path):
    m = Malla(x0=0.0, y1=1000.0, ancho=6, alto=6, celda=100.0)
    fac = [np.full((6, 6), i, "uint8") for i in range(len(MI.CAPAS_FACTOR))]
    a = np.zeros((6, 6), "uint8"); a[0, 0] = 50; a[5, 5] = 90
    cab = MI.escribir(tmp_path, m, fac, ["boletus_aereus"], [a], {"boletus_aereus": {"arboles": {"alcornoque": 1.0}, "tiempo": {}}}, 4)
    j = json.loads((tmp_path / "micro.json").read_text())
    assert j == cab and j["tesela"] == 4 and j["especies"] == ["boletus_aereus"]
    assert [c["id"] for c in j["capas"]][-1] == "idon_boletus_aereus"
    assert j["perfiles"]["boletus_aereus"] == {"arboles": {"alcornoque": 1.0}}       # sin `tiempo`
    assert [(f, c) for f, c, *_ in j["indice"]] == [(0, 0), (1, 1)]
    datos = (tmp_path / "micro.bin").read_bytes()
    assert len(datos) == j["bytes"]
    f, c, off, n = j["indice"][1]
    bloque = np.frombuffer(gzip.decompress(datos[off:off + n]), "uint8").reshape(len(j["capas"]), 4, 4)
    assert bloque[-1, 1, 1] == 90 and bloque[2, 0, 0] == 2
