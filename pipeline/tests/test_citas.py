import pytest
from setas_pipeline import citas


def _r(esp="boletus_edulis", fecha="2020-10-10", lat=36.5, lon=-4.9, origen="gbif", prec=None, url="u"):
    return {"especie": esp, "fecha": fecha, "lat": lat, "lon": lon, "precision_m": prec, "origen": origen, "url": url}


def test_radio_200km():
    from setas_pipeline.region import cargar_region
    centro, radio = citas.ambito(cargar_region("marbella"))
    assert centro == (36.51, -4.88) and radio == 200.0
    assert citas.dentro_radio(36.51, -4.88, centro, radio) and citas.dentro_radio(36.37, -5.62, centro, radio)
    assert not citas.dentro_radio(37.99, -3.47, centro, radio)          # Jaén, > 200 km


def test_dedupe_misma_especie_fecha_y_100m():
    a = _r(origen="inat", url="a"); b = _r(lat=36.5004, url="b")        # ~44 m
    c = _r(lat=36.502, url="c")                                          # ~220 m: se queda
    d = _r(esp="amanita_caesarea", url="d"); e = _r(fecha="2020-10-11", url="e")
    out = citas.deduplicar([b, a, c, d, e])
    assert sorted(r["url"] for r in out) == ["a", "c", "d", "e"]
    assert [r for r in out if r["url"] == "a"][0]["tambien_en"] == ["b"]


def test_sin_fecha_no_se_deduplica():
    assert len(citas.deduplicar([_r(fecha=None, url="a"), _r(fecha=None, url="b")])) == 2


def test_normaliza_gbif_licencia_y_origen():
    x = {"key": 1, "decimalLatitude": 36.5, "decimalLongitude": -4.9, "eventDate": "2020-10-10T00:00",
         "license": "http://creativecommons.org/licenses/by-nc/4.0/legalcode", "datasetKey": citas.DS_INAT,
         "basisOfRecord": "HUMAN_OBSERVATION", "recordedBy": "ana"}
    r = citas.normaliza_gbif("boletus_edulis", x)
    assert r["licencia"] == "CC-BY-NC-4.0" and r["origen"] == "inat" and r["atribucion"] == "ana"


def test_inat_oscurecida_exige_precision():
    o = {"id": 1, "geojson": {"coordinates": ["-4.9", "36.5"]}, "obscured": True, "positional_accuracy": None,
         "public_positional_accuracy": None, "license_code": "cc-by-nc", "quality_grade": "research"}
    assert citas.normaliza_inat("boletus_edulis", o) is None
    o["public_positional_accuracy"] = 25000
    r = citas.normaliza_inat("boletus_edulis", o)
    assert r["precision_m"] == 25000 and r["licencia"] == "CC-BY-NC" and r["confianza"] == "alta"


def test_origen_csv():
    assert citas.origen_csv("https://www.gbif.org/occurrence/1") is None
    assert citas.origen_csv("https://pmc.ncbi.nlm.nih.gov/articles/x/") == "literatura"
    assert citas.origen_csv("https://www.malagahoy.es/x") == "foro"


def test_taxa_extra_por_region_sin_tocar_las_demas():
    import dataclasses
    from setas_pipeline import citas as C
    from setas_pipeline.region import cargar_region
    m = cargar_region("marbella")
    assert C.taxa_region(m) == C.TAXA
    a = dataclasses.replace(m, citas={**m.citas, "taxa": {"morchella_spp": ["Morchella esculenta"]}})
    t = C.taxa_region(a)
    assert t["morchella_spp"] == ["Morchella esculenta"] and "morchella_spp" not in C.TAXA


def test_gbif_claves_no_acepta_el_genero(monkeypatch):
    monkeypatch.setattr(citas, "_get", lambda url, p: {"matchType": "HIGHERRANK", "rank": "GENUS", "usageKey": 8187})
    assert citas.gbif_claves("Terfezia inventada") is None
    monkeypatch.setattr(citas, "_get", lambda url, p: {"matchType": "EXACT", "rank": "SPECIES", "status": "SYNONYM",
                                                       "usageKey": 5954988, "acceptedUsageKey": 5954691})
    assert citas.gbif_claves("Boletus aestivalis") == 5954691


def test_construir_sin_red_con_cache(tmp_path, monkeypatch):
    # con las respuestas crudas en caché, citas no debe tocar la red (ni para resolver las claves GBIF)
    import dataclasses, json
    from setas_pipeline.region import cargar_region
    m = cargar_region("marbella")
    r = dataclasses.replace(m, citas={**m.citas, "sitios_csv": None, "taxa": {}}, datos=tmp_path)
    raw = r.raw / "citas"
    raw.mkdir(parents=True)
    for esp in citas.TAXA:
        (raw / f"gbif_{esp}.json").write_text("[]")
        (raw / f"inat_{esp}.json").write_text("[]")
    (raw / "gbif_boletus_edulis.json").write_text(json.dumps([{
        "key": 1, "decimalLatitude": 36.51, "decimalLongitude": -4.88, "datasetKey": "x", "eventDate": "2020-10-10"}]))
    monkeypatch.setattr(citas, "_get", lambda *a, **k: pytest.fail("no debe pedir nada a la red"))
    regs, _ = citas.construir(r)
    assert [x["especie"] for x in regs] == ["boletus_edulis"]


def test_leer_sitios_no_publica_la_frase_de_la_fuente(tmp_path):
    from setas_pipeline.citas import leer_sitios
    f = tmp_path / "s.csv"
    f.write_text("lugar,lat,lon,precision,especies,fecha,fuente_url,cita,confianza\n"
                 "Genal,36.6,-5.2,comarca (aprox.),b. aereus,2021,https://www.surinenglish.com/a.html,"
                 "good crop of porcini,media\n", encoding="utf-8")
    regs, _ = leer_sitios(f, (36.6, -5.2), 50)
    assert regs and all(r["atribucion"] == "surinenglish.com" for r in regs)
    assert not any("porcini" in str(v) for r in regs for v in r.values())
