import json, uuid
from setas_pipeline import citas_docs as cd

GUIA = {"lactarius_deliciosus": ("Lactarius deliciosus", "níscalo; mízcalo"), "morchella_spp": ("Morchella esculenta", "colmenilla")}


def _f(esp, fecha, lat, lon, url, conf="alta", prec=10, origen="inat"):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {"especie": esp, "fecha": fecha, "lat": lat, "lon": lon, "precision_m": prec, "fuente": "iNaturalist (research)",
                           "origen": origen, "licencia": "CC-BY", "url": url, "confianza": conf}}


GJ = {"features": [_f("morchella_spp", "2025-11", 38.1, -0.5, "u1", "media", None), _f("lactarius_deliciosus", "2026-11-07", 38.2, -0.4, "u2"),
                   _f("suillus_luteus", None, 38.3, -0.3, "u3", "baja"), _f("lactarius_deliciosus", "2026-04-13T15:49:29", 38.4, -0.2, "u4", origen="gbif")]}


def test_filas_orden_y_nombres():
    r = cd.filas(GJ, GUIA)
    assert [x["url"] for x in r] == ["u2", "u4", "u1", "u3"]
    assert [x["fecha"] for x in r] == sorted([x["fecha"] for x in r], reverse=True)       # sin fecha al final
    assert r[-1]["especie"] == "Suillus luteus" and r[-1]["nombre_comun"] == ""          # sin ficha propia: el id
    assert next(x for x in r if x["url"] == "u1")["especie"] == "Morchella esculenta"


def test_csv_cabecera_y_precision_vacia():
    t = cd.a_csv(cd.filas(GJ, GUIA)).split("\r\n")
    assert t[0] == "especie,nombre_comun,fecha,lat,lon,precision_m,fuente,url,confianza,licencia"
    assert any(l.startswith("Morchella esculenta,colmenilla,2025-11,38.1,-0.5,,") for l in t)


def test_gpx_ids_estables_y_fechas_validas():
    r = cd.filas(GJ, GUIA)
    g = cd.a_gpx(r, {"u1": "id-previo"})
    assert 'id="id-previo"' in g                                                           # la cita ya conocida conserva su id
    assert f'id="{uuid.uuid5(uuid.NAMESPACE_URL, "u2")}"' in g                             # la nueva, uuid5 de su url
    assert "<time>2026-04-13T00:00:00Z</time>" in g and "<time>2025-11T" not in g
    assert "<name>M. esculenta 11/25</name>" in g and "<name>S. luteus s/f</name>" in g
    assert "Precisión: no declarada" in g and 'estrellas="3"' in g and 'estrellas="1" especie="suillus_luteus"' in g
    assert cd.ids_previos(g)["u1"] == "id-previo"


def test_resumen_cuenta_por_fuente_anyo_y_especie():
    L = "\n".join(cd.seccion_resumen("X", cd.filas(GJ, GUIA)))
    assert "## X: 4 citas" in L and "**Por fuente:** gbif 1, inat 3" in L
    assert "**Por año:** sin  1, 2026 2, 2025 1" in L
    assert "| Lactarius deliciosus | níscalo; mízcalo | 2 |" in L


def test_exportar_escribe_los_tres_ficheros(tmp_path):
    (tmp_path / "d" / "alicante" / "out").mkdir(parents=True)
    (tmp_path / "d" / "alicante" / "out" / "citas.geojson").write_text(json.dumps(GJ))
    guia = tmp_path / "g.json"
    guia.write_text(json.dumps([{"id": "lactarius_deliciosus", "nombre_cientifico": "Lactarius deliciosus (L.) Gray", "nombres_comunes": ["níscalo"]}]))
    n = cd.exportar(["alicante"], tmp_path / "o", tmp_path / "d", guia)
    assert n == {"alicante": 4}
    assert {p.name for p in (tmp_path / "o").iterdir()} == {"citas-alicante.csv", "citas-alicante.gpx", "RESUMEN.md"}
