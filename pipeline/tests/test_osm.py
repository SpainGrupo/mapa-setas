import shutil
from pathlib import Path
import pytest
from setas_pipeline.adaptadores import osm as O


def test_nombre_extracto():
    assert O.nombre_extracto("https://download.geofabrik.de/europe/spain/andalucia-latest.osm.pbf") == "andalucia.osm.pbf"


def test_caja_recorte_contiene_la_malla_con_margen():
    from pyproj import Transformer
    b = (250000.0, 4000000.0, 400000.0, 4150000.0)
    lon0, lat0, lon1, lat1 = O.caja_recorte(b)
    tr = Transformer.from_crs("EPSG:25830", "EPSG:4326", always_xy=True)
    for x in (b[0] - 5000, b[2] + 5000):
        for y in (b[1] - 5000, b[3] + 5000):
            lo, la = tr.transform(x, y)
            assert lon0 <= lo <= lon1 and lat0 <= la <= lat1


def test_ordenes_un_extracto_sin_merge(tmp_path):
    d = tmp_path / "zona.osm.pbf"
    o = O.ordenes_osmium([tmp_path / "osm/andalucia.osm.pbf"], (-5.5, 36.0, -4.0, 37.2), d)
    assert o == [["osmium", "extract", "-b", "-5.500,36.000,-4.000,37.200", "-s", "smart", "-f", "pbf",
                  "--overwrite", "-o", str(tmp_path / "zona.osm.pbf.part"), str(tmp_path / "osm/andalucia.osm.pbf")]]


def test_ordenes_varios_extractos_recorta_y_fusiona(tmp_path):
    d = tmp_path / "zona.osm.pbf"
    e = [tmp_path / "osm/valencia.osm.pbf", tmp_path / "osm/murcia.osm.pbf"]
    o = O.ordenes_osmium(e, (-1.5, 37.8, 0.2, 39.2), d)
    assert [x[1] for x in o] == ["extract", "extract", "merge"]
    assert o[2][-2:] == [str(tmp_path / "_recorte_0.osm.pbf"), str(tmp_path / "_recorte_1.osm.pbf")]
    assert str(tmp_path / "zona.osm.pbf.part") in o[2]


@pytest.mark.skipif(shutil.which("osmium") is None, reason="sin osmium-tool")
def test_pbf_zona_recorta_de_verdad(tmp_path):
    import osmium
    from osmium.osm.mutable import Node, Way
    from pyproj import Transformer
    src = tmp_path / "osm" / "andalucia.osm.pbf"
    src.parent.mkdir()
    w = osmium.SimpleWriter(str(src))
    w.add_node(Node(id=1, location=(-4.90, 36.50), tags={}))
    w.add_node(Node(id=2, location=(-4.89, 36.51), tags={}))
    w.add_node(Node(id=3, location=(-1.00, 39.00), tags={}))
    w.add_node(Node(id=4, location=(-1.01, 39.01), tags={}))
    w.add_way(Way(id=10, nodes=[1, 2], tags={"highway": "track"}))
    w.add_way(Way(id=11, nodes=[3, 4], tags={"highway": "track"}))
    w.close()
    tr = Transformer.from_crs("EPSG:4326", "EPSG:25830", always_xy=True)
    x, y = tr.transform(-4.895, 36.505)
    destino = O.pbf_zona(tmp_path, ["https://x/andalucia-latest.osm.pbf"], (x - 2000, y - 2000, x + 2000, y + 2000))
    vias = [o.id for o in osmium.FileProcessor(str(destino)) if o.is_way()]
    assert destino == tmp_path / "zona.osm.pbf" and vias == [10]
    mt = destino.stat().st_mtime
    assert O.pbf_zona(tmp_path, ["https://x/andalucia-latest.osm.pbf"], (x - 2000, y - 2000, x + 2000, y + 2000)) == destino
    assert destino.stat().st_mtime == mt                                  # misma firma: no se rehace
