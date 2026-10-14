import geopandas as gpd, numpy as np
from shapely.geometry import box
from setas_pipeline.malla import Malla, SIN_FUEGO
from setas_pipeline.incendios import anios_desde, rasterizar_anios


def test_anios_desde():
    a = np.array([0, 2026, 2025, 2021, 2000], "uint16")
    assert anios_desde(a, 2026).tolist() == [SIN_FUEGO, 0, 1, 5, 26]


def test_rasterizar_anios_gana_el_mas_reciente():
    m = Malla.desde_bounds(0, 0, 1000, 1000)
    g = gpd.GeoDataFrame({"anio": [2024, 2021, 0]},
                         geometry=[box(0, 0, 500, 1000), box(0, 0, 1000, 1000), box(0, 0, 1000, 1000)],
                         crs="EPSG:25830")
    a = rasterizar_anios(g, m)
    assert a[5, 0] == 2024 and a[5, 9] == 2021


def test_caja_wgs84_contiene_todo_el_contorno():
    from pyproj import Transformer
    from setas_pipeline.incendios import caja_wgs84
    b = (400000.0, 4000000.0, 600000.0, 4100000.0)
    lon0, lat0, lon1, lat1 = caja_wgs84(b)
    tr = Transformer.from_crs("EPSG:25830", "EPSG:4326", always_xy=True)
    lon_m, lat_m = tr.transform(500000.0, 4100000.0)       # centro del lado norte: más al norte que las esquinas
    lon_nw, _ = tr.transform(400000.0, 4100000.0)          # esquina NO: más al oeste que la SO
    assert lat1 >= lat_m and lon0 <= lon_nw
    for x in np.linspace(b[0], b[2], 7):
        for y in np.linspace(b[1], b[3], 7):
            lo, la = tr.transform(x, y)
            assert lon0 - 1e-9 <= lo <= lon1 + 1e-9 and lat0 - 1e-9 <= la <= lat1 + 1e-9


def test_construir_fuego_sin_poligonos(tmp_path, monkeypatch):
    import yaml
    from setas_pipeline import incendios as I
    monkeypatch.setattr(I, "_rediam", lambda *a, **k: [])
    monkeypatch.setattr(I, "_effis", lambda *a, **k: [])
    f = tmp_path / "fuentes.yaml"
    f.write_text(yaml.safe_dump({"incendios": {"rediam_desde": 2015, "rediam_hasta": 2024}}))
    m = Malla(x0=300000.0, y1=4100000.0, ancho=4, alto=3, celda=100.0)
    a = I.construir_fuego(m, tmp_path, tmp_path, f, ref=2026)
    assert (a == SIN_FUEGO).all()
