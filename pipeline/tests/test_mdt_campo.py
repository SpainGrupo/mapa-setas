import gzip, json
import numpy as np
from setas_pipeline import mdt_campo as MD


def test_a_u16_mar_nan_y_nodata_a_cero():
    z = np.array([[512.4, 0.0, -3.0], [np.nan, -32768, 0.3]])
    assert MD.a_u16(z, -32768).tolist() == [[512, 0, 0], [0, 0, 1]]   # 0,3 m no se confunde con «sin dato»


def test_codificar_y_decodificar_es_sin_perdida():
    rng = np.random.default_rng(1)
    t = 16
    u = (np.add.outer(np.arange(t) * 7, np.arange(t) * 3) + 300 + rng.integers(-4, 5, (t, t))).astype("uint16")
    u[0, 0] = 0; u[5, :] = 0; u[:, 9] = 2586                       # sin dato y saltos bruscos
    b = MD.codificar_tesela(u)
    assert len(b) == 2 * t * t
    assert (MD.decodificar_tesela(b, t) == u).all()


def test_ladera_regular_comprime_a_residuos_casi_nulos():
    t = 32
    u = np.add.outer(np.arange(t) * 5, np.arange(t) * 2).astype("uint16") + 100
    b = np.frombuffer(MD.codificar_tesela(u), "uint8")
    assert (b[t * t:] == 0).all()                                   # plano alto vacío: residuos < 128
    assert len(gzip.compress(b.tobytes())) < 120


def test_escribir_indice_y_bloques(tmp_path):
    t = 4
    z = np.arange(8 * 6, dtype="uint16").reshape(8, 6) + 10        # 2 × 2 teselas, la columna 1 con borde
    cab = MD.escribir(tmp_path, 100.0, 900.0, z, [(0, 0), (1, 1)], t)
    j = json.loads((tmp_path / "mdt_campo.json").read_text())
    assert j == cab and j["res_m"] == 25.0 and j["tesela"] == 4 and j["ancho"] == 6 and j["alto"] == 8
    assert j["codificacion"] == MD.CODIFICACION and [(f, c) for f, c, *_ in j["indice"]] == [(0, 0), (1, 1)]
    datos = (tmp_path / "mdt_campo.bin").read_bytes()
    assert len(datos) == j["bytes"]
    _, _, off, n = j["indice"][1]
    u = MD.decodificar_tesela(gzip.decompress(datos[off:off + n]), t)
    assert u[0, 0] == z[4, 4] and u[3, 1] == z[7, 5] and u[0, 2] == MD.NODATA   # columna 6 no existe: relleno


def test_teselas_fuera_de_la_rejilla_se_omiten():
    z = np.ones((4, 4), "uint16")
    assert [(f, c) for f, c, _ in MD.teselar(z, [(0, 0), (3, 3)], 4)] == [(0, 0)]
