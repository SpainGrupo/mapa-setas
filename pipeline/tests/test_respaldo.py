import io, json, sqlite3
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image
from rasterio.transform import from_origin
from setas_pipeline.exportar import png_idoneidad
from setas_pipeline.respaldo import (SqliteDB, MBTiles, zonas_buenas, geojson_zonas, kml_zonas,
                                     _a_wgs84, nombre_base)


def _png():
    v = np.zeros((256, 256), dtype=np.uint8)
    v[0, 0] = 100
    return png_idoneidad(v)


def test_sqlitedb_esquema_osmand_bigplanet(tmp_path):
    r = tmp_path / "a.sqlitedb"
    w = SqliteDB(r)
    w.poner(8, 123, 100, _png())
    w.poner(14, 7900, 6420, _png())
    w.cerrar()
    db = sqlite3.connect(r)
    cols = [c[1] for c in db.execute("PRAGMA table_info(tiles)")]
    assert cols[:5] == ["x", "y", "z", "s", "image"]
    info = dict(zip([c[1] for c in db.execute("PRAGMA table_info(info)")], db.execute("SELECT * FROM info").fetchone()))
    # BigPlanet: z = 17 - zoom, también en minzoom/maxzoom
    assert info["tilenumbering"] == "BigPlanet"
    assert info["minzoom"] == 17 - 14 and info["maxzoom"] == 17 - 8
    assert info["inverted_y"] == 0 and info["ellipsoid"] == 0 and info["tilesize"] == 256
    filas = sorted(db.execute("SELECT x, y, z, s FROM tiles"))
    # y sin invertir (XYZ, origen arriba): se guarda tal cual
    assert filas == [(123, 100, 9, 0), (7900, 6420, 3, 0)]
    img = Image.open(io.BytesIO(db.execute("SELECT image FROM tiles WHERE z=9").fetchone()[0]))
    assert img.format == "PNG" and img.convert("RGBA").getpixel((0, 0)) == (0, 69, 41, 255)


def test_mbtiles_esquema_y_filas_tms(tmp_path):
    r = tmp_path / "a.mbtiles"
    w = MBTiles(r, "n", "d")
    w.poner(8, 123, 100, _png())
    w.poner(14, 7900, 6420, _png())
    w.cerrar((-5.0, 36.0, -4.0, 37.0))
    db = sqlite3.connect(r)
    meta = dict(db.execute("SELECT name, value FROM metadata"))
    assert meta["format"] == "png" and meta["type"] == "overlay"
    assert meta["minzoom"] == "8" and meta["maxzoom"] == "14"
    assert meta["bounds"] == "-5.00000,36.00000,-4.00000,37.00000"
    filas = sorted(db.execute("SELECT zoom_level, tile_column, tile_row FROM tiles"))
    assert filas == [(8, 123, 255 - 100), (14, 7900, 16383 - 6420)]
    assert MBTiles.fila_tms(0, 0) == 0


def test_nombre_base():
    assert nombre_base("amanita_caesarea", 400) == "setas_amanita_caesarea_400m"


def _malla_prueba():
    idon = np.zeros((10, 10), dtype=np.uint8)
    dist = np.full((10, 10), 1000.0, dtype=np.float32)
    idon[1:4, 1:4] = 80          # 9 ha, buena
    idon[6, 6] = 70              # 1 celda = 1 ha exacta: se conserva
    idon[8, 1] = 59              # por debajo de 60: fuera
    idon[1:3, 7:9] = 90          # buena pero cerca del acceso → fuera
    dist[1:3, 7:9] = 300.0
    return idon, dist, from_origin(300000, 4100000, 100, 100)


def test_zonas_buenas_filtra_puntuacion_distancia_y_area():
    idon, dist, t = _malla_prueba()
    zs = zonas_buenas(idon, dist, t, 100.0)
    assert [z["area_ha"] for z in zs] == [9.0, 1.0]
    assert zs[0]["puntuacion_media"] == 80.0 and zs[1]["puntuacion_media"] == 70.0
    assert abs(zs[0]["geometry"].area - 90000) < 1
    # con área mínima de 2 ha desaparece la celda suelta
    assert len(zonas_buenas(idon, dist, t, 100.0, area_min_ha=2)) == 1


def test_zonas_buenas_disuelve_celdas_contiguas_y_promedia():
    idon = np.zeros((5, 5), dtype=np.uint8)
    idon[2, 1:4] = [60, 80, 100]
    dist = np.full((5, 5), 500.0, dtype=np.float32)
    zs = zonas_buenas(idon, dist, from_origin(0, 500, 100, 100), 100.0)
    assert len(zs) == 1 and zs[0]["area_ha"] == 3.0 and zs[0]["puntuacion_media"] == 80.0


def test_geojson_y_kml_llevan_propiedades_y_estilo():
    idon, dist, t = _malla_prueba()
    zw = _a_wgs84(zonas_buenas(idon, dist, t, 100.0))
    gj = json.loads(json.dumps(geojson_zonas(zw, "boletus_edulis", "Boletus edulis")))
    p = gj["features"][0]["properties"]
    assert set(p) >= {"especie", "puntuacion_media", "area_ha"} and p["especie"] == "boletus_edulis"
    lon, lat = gj["features"][0]["geometry"]["coordinates"][0][0]
    assert -10 < lon < 0 and 35 < lat < 40
    k = ET.fromstring(kml_zonas(zw, "boletus_edulis", "Boletus edulis").encode())
    ns = {"k": "http://www.opengis.net/kml/2.2"}
    assert len(k.findall(".//k:Placemark", ns)) == 2
    color = k.find(".//k:PolyStyle/k:color", ns).text
    assert color.startswith("80")                      # ~50 % opaco
    assert k.find(".//k:Data[@name='area_ha']/k:value", ns).text == "9.0"
