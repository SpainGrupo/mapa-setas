# Vegetación por región (fase C): fuente principal caída → respaldo por CCAA y NODATA donde no hay fuente.
import json
import geopandas as gpd
import numpy as np
from shapely.geometry import box
from setas_pipeline import adaptadores as A, avisos
from setas_pipeline.adaptadores.mfe import FuenteCaida
from setas_pipeline.idoneidad import puntuar
from setas_pipeline.malla import ARBOL, CUBIERTA, Malla, leer_tif
from setas_pipeline.region import Region
from setas_pipeline import vegetacion as V

ZONA = box(0, 0, 2000, 1000)                 # 20 × 10 celdas de 100 m
CV = box(0, 0, 1000, 1000)                   # mitad oeste: Comunitat Valenciana (con respaldo)
MU = box(1000, 0, 2000, 1000)                # mitad este: Murcia (sin fuente)


def _region(tmp_path, capas):
    return Region(id="prueba", nombre="Prueba", etiqueta_origen="de Prueba", origen=(0.0, 0.0), zona={},
                  osm_extractos=("https://x",), capas=capas, especies_activas=("a",), especies_sin_habitat=(),
                  overrides_especies={}, legal={}, atribuciones={}, config=tmp_path / "prueba.yaml", datos=tmp_path)


def _registrar(monkeypatch):
    def caida(cfg, ctx):
        raise FuenteCaida("https://iepnb no responde (HTTP 503) tras 3 intentos")

    def icv(cfg, ctx):
        return gpd.GeoDataFrame({"id": ["1", "2"], "arbol": [ARBOL["pino"], ARBOL["sin_arbolado"]], "fcc": [50, 0],
                                 "estado": [3, 0], "cubierta": [0, CUBIERTA["matorral"]], "anio_incendio": [0, 0],
                                 "artificial": [False, False]},
                                geometry=[box(0, 0, 500, 1000), box(500, 0, 1000, 1000)], crs=A.CRS)

    def ccaa(cfg, ctx):
        return gpd.GeoDataFrame({"id": ["comunitat_valenciana", "region_murcia"], "nombre": ["C. Valenciana", "Murcia"]},
                                geometry=[CV, MU], crs=A.CRS)
    monkeypatch.setitem(A.REGISTRO["mfe"], "caida", caida)
    monkeypatch.setitem(A.REGISTRO["mfe"], "icv", icv)
    monkeypatch.setitem(A.REGISTRO["ccaa"], "ign", ccaa)


CAPAS = {"mfe": [{"adaptador": "caida", "nombre": "MFE nacional (IEPNB)"},
                 {"adaptador": "icv", "respaldo": True, "ambito": "comunitat_valenciana", "nombre": "MFE50 del ICV"}],
         "ccaa": [{"adaptador": "ign"}]}


def test_principal_caida_usa_el_respaldo_y_deja_nodata_sin_fuente(tmp_path, monkeypatch):
    _registrar(monkeypatch)
    r = _region(tmp_path, CAPAS)
    malla = Malla.desde_bounds(*ZONA.bounds)
    r.out.mkdir(parents=True)
    V.construir_vegetacion_region(malla, r, zona=ZONA)
    arbol = leer_tif(r.out / "arbol.tif")
    assert (arbol[:, :5] == ARBOL["pino"]).all() and (arbol[:, 5:10] == ARBOL["sin_arbolado"]).all()
    assert (arbol[:, 10:] == V.NODATA).all()
    for n in ("fcc", "estado", "cubierta"):
        assert (leer_tif(r.out / f"{n}.tif")[:, 10:] == V.NODATA).all(), n
    assert (leer_tif(r.out / "cubierta.tif")[:, 5:10] == CUBIERTA["matorral"]).all()
    assert (leer_tif(r.out / "dist_matorral.tif")[:, 10:] == -1).all()
    txt = avisos.leer(r.out)
    assert len(txt) == 2 and "IEPNB" in txt[0] and "503" in txt[0]
    assert "50 %" in txt[1] and "Murcia" in txt[1] and "Valenciana" not in txt[1]
    g = gpd.read_file(r.out / V.MFE_REGION)
    assert len(g) == 2 and set(g.columns) >= {"anio_incendio", "artificial"}


def test_principal_que_responde_salta_el_respaldo(tmp_path, monkeypatch):
    _registrar(monkeypatch)
    monkeypatch.setitem(A.REGISTRO["mfe"], "caida", A.REGISTRO["mfe"]["icv"])
    r = _region(tmp_path, CAPAS)
    malla = Malla.desde_bounds(*ZONA.bounds)
    r.out.mkdir(parents=True)
    avisos.registrar(r.out, "mfe", ["viejo"])
    V.construir_vegetacion_region(malla, r, zona=ZONA)
    arbol = leer_tif(r.out / "arbol.tif")
    assert (arbol[:, 10:] == ARBOL["sin_arbolado"]).all()          # la principal cubre toda la zona
    assert avisos.leer(r.out) == []


def test_todas_las_fuentes_caidas_dejan_toda_la_zona_en_nodata(tmp_path, monkeypatch):
    _registrar(monkeypatch)
    monkeypatch.setitem(A.REGISTRO["mfe"], "icv", A.REGISTRO["mfe"]["caida"])
    r = _region(tmp_path, CAPAS)
    r.out.mkdir(parents=True)
    V.construir_vegetacion_region(Malla.desde_bounds(*ZONA.bounds), r, zona=ZONA)
    assert (leer_tif(r.out / "arbol.tif") == V.NODATA).all()
    assert "100 %" in avisos.leer(r.out)[-1]


def test_nodata_no_se_puntua_como_sabina():
    perfil = {"arboles": {"sabina": 1.0}, "altitud": {"min": 0, "opt_min": 0, "opt_max": 2000, "max": 3000},
              "orientacion": "indiferente", "suelo": {"basico": 1.0}}
    arbol = np.array([[ARBOL["sabina"], V.NODATA]], "uint8")
    uno = np.ones((1, 2), "float32")
    s = puntuar(perfil, arbol, uno * 500, uno * -1, uno * 0, np.array([[2, 2]], "uint8"))
    assert s[0, 0] > 0 and s[0, 1] == 0


def test_ejecutar_reintenta_la_vegetacion_si_quedaron_avisos(tmp_path):
    from setas_pipeline import ejecutar as E
    r = _region(tmp_path, CAPAS)
    r.out.mkdir(parents=True)
    for n in ("arbol", "fcc", "estado", "cubierta", "dist_matorral"):
        (r.out / f"{n}.tif").write_bytes(b"x")
    tabla = E.pasos_de(r)
    assert all(p.exists() for p in tabla["vegetacion"][1]())
    avisos.registrar(r.out, "mfe", ["Sin datos de vegetación en el 40 % de la zona"])
    assert not all(p.exists() for p in tabla["vegetacion"][1]())
    assert r.out / "mfe_region.gpkg" in tabla["incendios"][2]()
