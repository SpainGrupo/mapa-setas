import json
import numpy as np
import pytest
from setas_pipeline import acceso as A


def test_tobler_llano_unos_5_kmh_y_cuesta_mas_lenta():
    assert A.tobler_kmh(0.0) == pytest.approx(5.04, abs=0.05)
    assert A.tobler_kmh(-0.05) == pytest.approx(6.0)            # máximo en ligera bajada
    assert A.tobler_kmh(0.3) < 2.0 < A.tobler_kmh(0.1)
    assert A.tobler_kmh(0.2) < A.tobler_kmh(-0.2)               # subir cuesta más que bajar


def _llano(h=5, w=21):
    z = np.full((h, w), 100.0)
    fuentes = np.zeros((h, w), bool); fuentes[:, 0] = True
    return z, fuentes


def test_sendero_mas_rapido_que_campo_a_traves():
    z, fuentes = _llano()
    trans = np.ones_like(fuentes)
    campo = np.full(z.shape, A.MULT_CAMPO)
    sendero = campo.copy(); sendero[2, :] = A.MULT_SENDERO
    t_campo, *_ = A.resolver(z, 50.0, campo, trans, fuentes)
    t_send, *_ = A.resolver(z, 50.0, sendero, trans, fuentes)
    assert t_send[2, -1] < t_campo[2, -1]
    assert t_send[2, -1] / t_campo[2, -1] == pytest.approx(1 / A.MULT_CAMPO, rel=1e-6)
    # 1 km en llano por sendero: ~12 min a 5 km/h
    assert t_send[2, 20] / 60 == pytest.approx(1.0 / A.tobler_kmh(0.0) * 60, rel=1e-6)


def test_intransitable_obliga_a_rodear():
    z, fuentes = _llano(7, 7)
    trans = np.ones_like(fuentes); trans[0:6, 3] = False      # muro con hueco abajo
    t, pred, _ = A.resolver(z, 50.0, np.ones(z.shape), trans, fuentes)
    assert np.isinf(t[0, 3])
    libre, *_ = A.resolver(z, 50.0, np.ones(z.shape), np.ones_like(fuentes), fuentes)
    assert t[0, 6] > libre[0, 6]


def test_trazado_conectado_hasta_una_fuente():
    rng = np.random.default_rng(1)
    z = rng.uniform(0, 30, (15, 15)).cumsum(axis=1)
    fuentes = np.zeros(z.shape, bool); fuentes[0, 0] = True; fuentes[14, 3] = True
    t, pred, _ = A.resolver(z, 50.0, np.full(z.shape, 1.6), np.ones_like(fuentes), fuentes)
    d = A.direccion_desde_pred(pred, fuentes, np.isfinite(t))
    camino = A.trazar(d, 7, 14)
    assert camino[0] == (7, 14) and fuentes[camino[-1]]
    for (f0, c0), (f1, c1) in zip(camino, camino[1:]):
        assert max(abs(f1 - f0), abs(c1 - c0)) == 1               # 8-conexo
        assert t[f1, c1] < t[f0, c0]


def test_subida_acumulada_en_rampa():
    # Rampa que sube 10 m por celda hacia el este, baja 5 m en la última; fuente a la izquierda.
    z = np.array([[0, 10, 20, 30, 25]], float) + 100
    fuentes = np.zeros(z.shape, bool); fuentes[0, 0] = True
    t, pred, _ = A.resolver(z, 50.0, np.ones(z.shape), np.ones_like(fuentes), fuentes)
    s = A.subida_acumulada(z, pred)
    assert s.ravel().tolist() == [0, 10, 20, 30, 30]


def test_subida_acumulada_cadena_larga_y_dos_raices():
    pred = np.array([-1, 0, 1, 2, 3, -1, 5, 6])
    z = np.array([0, 1, 3, 2, 7, 50, 40, 45], float)
    s = A.subida_acumulada(z, pred)
    assert s.tolist() == [0, 1, 3, 3, 8, 0, 0, 5]


def test_reducir_direccion_gruesa_termina_en_fuente():
    rng = np.random.default_rng(3)
    z = rng.uniform(0, 400, (24, 30))
    fuentes = np.zeros(z.shape, bool); fuentes[:, 0] = True; fuentes[23, 15:20] = True
    mult = np.where(rng.random(z.shape) < 0.3, 1.0, 1.6)
    t, pred, origen = A.resolver(z, 50.0, mult, np.ones_like(fuentes), fuentes)
    s = A.subida_acumulada(z, pred)
    tg, sg, og, dg = A.reducir(t, s, origen, pred, fuentes, 2)
    assert tg.shape == (12, 15)
    for f in range(12):
        for c in range(15):
            cam = A.trazar(dg, f, c)
            ts = [tg[p] for p in cam]
            assert all(b < a for a, b in zip(ts, ts[1:]))
            assert tg[cam[-1]] == 0


def test_cerrar_mascara_incluye_el_trazado():
    d = np.full((1, 5), 7, np.uint8); d[0, 0] = 0               # todo va hacia el oeste
    ok = np.zeros((1, 5), bool); ok[0, 4] = True
    assert A.cerrar_mascara(ok, d).all()


def test_agrupar_aparcamientos_uno_por_bloque_y_via():
    f = np.zeros((12, 12), bool); f[5, :] = True; f[:, 2] = True
    via = np.zeros((12, 12), int); via[5, :] = 1; via[:, 2] = 2
    ident, reps = A.agrupar_aparcamientos(f, via, celda=50.0, bloque=300.0)
    assert len(reps) == 4              # vía 1 y vía 2, dos bloques de 300 m cada una
    assert (ident[f] >= 0).all() and (ident[~f] == -1).all()
    for fi, ci, v in reps:
        assert via[fi, ci] == v


def test_apto_coche():
    assert A.apto_coche({"highway": "tertiary"})[0]
    assert A.apto_coche({"highway": "track", "tracktype": "grade1"})[0]
    assert not A.apto_coche({"highway": "track", "tracktype": "grade3"})[0]
    assert not A.apto_coche({"highway": "track"})[0]
    assert not A.apto_coche({"highway": "track", "tracktype": "grade2", "motor_vehicle": "no"})[0]
    assert not A.apto_coche({"highway": "service", "access": "private"})[0]
    assert not A.apto_coche({"highway": "path"})[0]
    assert A.es_camino({"highway": "path"}) and not A.es_camino({"highway": "motorway"})


def test_escribir_y_leer_binario(tmp_path):
    from setas_pipeline.malla import Malla
    m = Malla(x0=300000.0, y1=4100000.0, ancho=3, alto=2, celda=100.0)
    t = np.array([[0, 5, 65535], [1, 2, 3]], np.uint16)
    s = np.array([[0, 50, 65535], [1, 2, 3]], np.uint16)
    o = np.array([[0, 0, 0xFFFFFFFF], [1, 1, 1]], np.uint32)
    d = np.array([[0, 7, 255], [0, 7, 7]], np.uint8)
    aps = [{"id": 0, "lat": 36.1, "lon": -5.1, "nombre": "A", "ref": None, "via": "track"},
           {"id": 1, "lat": 36.2, "lon": -5.2, "nombre": None, "ref": "MA-1", "via": "tertiary"},
           {"id": 2, "lat": 36.3, "lon": -5.3, "nombre": "A", "ref": None, "via": "track"}]
    A.escribir_app(tmp_path, m, t, s, o, d, aps)
    cab, r = A.leer_app(tmp_path)
    assert all(c["offset"] % 4 == 0 for c in cab["capas"].values())
    assert (r["tiempo_pie_min"] == t).all() and (r["origen_id"] == o).all() and (r["direccion"] == d).all()
    assert cab["bytes"] == (tmp_path / "acceso.bin").stat().st_size
    import gzip
    assert gzip.decompress((tmp_path / "acceso.bin.gz").read_bytes()) == (tmp_path / "acceso.bin").read_bytes()
    comp = json.loads((tmp_path / "aparcamientos.json").read_text())
    assert len(comp["vias"]) == 2
    assert [A.aparcamiento(comp, i) for i in range(3)] == aps
