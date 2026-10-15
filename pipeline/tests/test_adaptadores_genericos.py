# Adaptadores genéricos (fase C, Alicante): ArcGIS REST, ArcGIS por año, WFS GeoServer/GML, zip GeoJSON y MFE.
# Las respuestas son grabaciones reales (tests/fixtures/, geometría simplificada; atributos intactos).
import io, json, zipfile
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import geopandas as gpd
import pytest
from shapely.geometry import box
from setas_pipeline import adaptadores as A
from setas_pipeline.adaptadores import generico as G
from setas_pipeline.adaptadores import mfe as M
from setas_pipeline import descargas
from setas_pipeline.malla import ARBOL, CUBIERTA, ESTADO

FX = Path(__file__).parent / "fixtures"
ZONA = box(690000, 4250000, 740000, 4320000)


class _Resp:
    def __init__(self, contenido: bytes, status=200):
        self.content, self.status_code = contenido, status
        self.text = contenido.decode("utf-8", "replace")

    def json(self):
        return json.loads(self.content)

    def raise_for_status(self):
        if self.status_code >= 400:
            import requests
            raise requests.HTTPError(str(self.status_code))

    def iter_content(self, n):
        yield self.content

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _falso_get(monkeypatch, respuestas, modulo=descargas):
    """requests.get falso: la primera clave contenida en la URL decide la respuesta; guarda las URL pedidas."""
    pedidas = []

    def get(url, *a, **kw):
        pedidas.append(url)
        for clave, valor in respuestas.items():
            if clave in url:
                return _Resp(valor if isinstance(valor, bytes) else Path(valor).read_bytes())
        return _Resp(json.dumps({"type": "FeatureCollection", "features": []}).encode())
    monkeypatch.setattr(modulo.requests, "get", get)
    return pedidas


@pytest.fixture(autouse=True)
def _sin_pausas(monkeypatch):
    monkeypatch.setattr(descargas, "PAUSA_S", 0)


def _ctx(tmp_path, **kw):
    return A.Contexto(raw=tmp_path, zona=ZONA, **kw)


# ---------------------------------------------------------------- mapear

def test_mapear_campos_valores_filtro_y_dedup():
    g = gpd.GeoDataFrame({"site": ["A", "A", "B", "C"], "nom": [" Uno ", " Uno ", "Dos", "Tres"],
                          "fig": ["PN", "PN", "PN", "X"]}, geometry=[box(0, 0, 1, 1)] * 4, crs=A.CRS)
    cfg = {"campos": {"codigo": "site", "nombre": "nom"}, "valores": {"figura": "Parque Natural"},
           "filtro": {"fig": ["PN"]}, "dedup": "site"}
    n = A.normalizar("protegidos", G.mapear(g, cfg, "protegidos"))
    assert n[["codigo", "nombre", "figura"]].values.tolist() == [["A", "Uno", "Parque Natural"],
                                                                 ["B", "Dos", "Parque Natural"]]


def test_mapear_excluir_y_prefijo_de_codigo():
    g = gpd.GeoDataFrame({"oid": [1, 2], "fig": ["Natura 2000", "RN"], "nom": ["a", "b"]},
                         geometry=[box(0, 0, 1, 1)] * 2, crs=A.CRS)
    n = G.mapear(g, {"campos": {"codigo": "oid", "nombre": "nom", "figura": "fig"}, "excluir": {"fig": ["Natura 2000"]},
                     "prefijo_codigo": "icv11-"}, "protegidos")
    assert n[["codigo", "figura"]].values.tolist() == [["icv11-2", "RN"]]


def test_protegidos_por_figura_todas_menos_excluidas(monkeypatch, tmp_path):
    from setas_pipeline.adaptadores import derivados
    enp = gpd.GeoDataFrame({"codigo": ["1", "2", "3"], "nombre": ["Mariola", "Font Roja", "Espuña"],
                            "figura": ["PN", "PN", "Parque Regional"]}, geometry=[box(0, 0, 1, 1)] * 3, crs=A.CRS)
    monkeypatch.setattr(A, "cargar_capa", lambda tipo, capas, ctx: enp)
    g = derivados.protegidos_por_figura({"tipo": "espacio_protegido", "zona": "Espacio protegido",
                                         "excluir_nombres": ["Mariola"]}, _ctx(tmp_path))
    assert g["nombre"].tolist() == ["Font Roja", "Espuña"] and (g["tipo"] == "espacio_protegido").all()
    g = derivados.protegidos_por_figura({"tipo": "t", "zona": "z", "figura": ["Parque Regional"]}, _ctx(tmp_path))
    assert g["nombre"].tolist() == ["Espuña"]


def test_mapear_clase_por_valor_quita_las_filas_sin_clase():
    g = gpd.GeoDataFrame({"tipo": ["CUP_GV", "CUP_AYTO", "PART_CONS"], "den": ["a", "b", "c"]},
                         geometry=[box(0, 0, 1, 1)] * 3, crs=A.CRS)
    cfg = {"campos": {"nombre": "den", "detalle": "tipo"},
           "clase": {"campo": "tipo", "valores": {"CUP_GV": "monte_junta", "CUP_AYTO": "monte_municipal"}}}
    n = A.normalizar("montes_publicos", G.mapear(g, cfg, "montes_publicos"))
    assert n["clase"].tolist() == ["monte_junta", "monte_municipal"] and n["nombre"].tolist() == ["a", "b"]


def test_mapear_senderos_clasifica_la_matricula():
    g = gpd.read_file(FX / "icv_pr51.json")
    n = A.normalizar("senderos", G.mapear(g, {"campos": {"ref": "denominaci", "name": "nombre",
                                                          "dificultad": "dificultad"},
                                               "valores": {"fuente": "icv"}}, "senderos"))
    assert len(n) == 2 and set(n["tipo"]) <= {"GR", "PR", "SL", "otro"} and (n["fuente"] == "icv").all()
    assert n["tipo"].iloc[0] == "PR"


# ---------------------------------------------------------------- arcgis

def test_arcgis_pide_query_geojson_por_teselas_y_mapea(tmp_path, monkeypatch):
    pedidas = _falso_get(monkeypatch, {"MapServer/10/query": FX / "icv_parques.json"})
    cfg = {"adaptador": "arcgis", "url": "https://carto.icv.gva.es/arcgis/rest/services/x/MapServer",
           "capas": [10], "tesela_m": 100000, "cache": "icv_enp",
           "campos": {"codigo": "site_code", "nombre": "nombre"}, "valores": {"figura": "Parque Natural"}}
    g = A.cargar_capa("protegidos", {"protegidos": [cfg]}, _ctx(tmp_path))
    assert g["nombre"].tolist() == ["Parc Natural de la Serra de Mariola"] and g["codigo"].iloc[0] == "ES520003"
    q = parse_qs(urlparse(pedidas[0]).query)
    assert q["f"] == ["geojson"] and q["outSR"] == ["25830"] and q["resultOffset"] == ["0"]
    assert (tmp_path / "icv_enp" / "10").is_dir()


def test_arcgis_sigue_paginando_con_exceeded_transfer_limit(tmp_path, monkeypatch):
    # icv_mfe41.json trae 3 entidades y exceededTransferLimit: con página de 3 pide la siguiente
    pedidas = _falso_get(monkeypatch, {"resultOffset=0": FX / "icv_mfe41.json"})
    g = G.consultar_arcgis("https://x/MapServer/41", ZONA, tmp_path / "c", pagina=3, tesela_m=100000)
    assert len(g) == 3 and any("resultOffset=3" in u for u in pedidas)


def test_arcgis_por_anio_respeta_la_ventana(tmp_path, monkeypatch):
    pedidas = _falso_get(monkeypatch, {"resultOffset=0": FX / "icv_incendios_2024.json"})
    cfg = {"adaptador": "arcgis_por_anio", "url": "https://x/MapServer", "capas_anio": {2014: 22, 2024: 121},
           "fuente": "ICV", "cache": "icv_incendios"}
    g = A.cargar_capa("incendios", {"incendios": [cfg]}, _ctx(tmp_path, desde_anio=2016))
    assert set(g["anio"]) == {2024} and (g["fuente"] == "ICV").all() and len(g) == 2
    assert not any("MapServer/22/" in u for u in pedidas)


# ---------------------------------------------------------------- wfs

def test_wfs_geoserver_pagina_con_start_index(tmp_path, monkeypatch):
    pedidas = _falso_get(monkeypatch, {"startIndex=0": FX / "iderm_montes.json"})
    cfg = {"adaptador": "wfs", "url": "https://mapas-gis-inter.carm.es/geoserver/wfs",
           "capa": "PFO_ZOR_DMVP_CARM:MONTES", "pagina": 3, "tesela_m": 100000, "cache": "iderm_montes",
           "campos": {"nombre": "nombremont", "detalle": "propiedad", "codigo": "id_monte"},
           "filtro": {"clas_art11": ["Público"]},
           "clase": {"campo": "propiedad", "valores": {"Comunidad Autónoma": "monte_junta"},
                     "defecto": "monte_municipal"}}
    g = A.cargar_capa("montes_publicos", {"montes_publicos": [cfg]}, _ctx(tmp_path))
    assert len(g) == 3 and set(g["clase"]) <= {"monte_junta", "monte_municipal"}
    q = parse_qs(urlparse(pedidas[0]).query)
    assert q["typeNames"] == ["PFO_ZOR_DMVP_CARM:MONTES"] and q["srsName"] == ["EPSG:25830"]
    assert any("startIndex=3" in u for u in pedidas)


def test_wfs_gml_con_filtro_fes_para_las_ccaa(tmp_path, monkeypatch):
    pedidas = _falso_get(monkeypatch, {"ign.es": FX / "ign_ccaa_murcia.gml"}, modulo=G)
    cfg = {"adaptador": "wfs", "formato": "gml", "url": "https://www.ign.es/wfs-inspire/unidades-administrativas",
           "capa": "au:AdministrativeUnit", "cache": "ccaa",
           "fes": {"campo": "au:nationalCode", "valores": ["34140000000"],
                   "espacio": "http://inspire.ec.europa.eu/schemas/au/4.0", "prefijo": "au"},
           "campos": {"nombre": "text"},
           "clase_id": {"campo": "nationalCode", "valores": {"34140000000": "region_murcia"}}}
    g = A.cargar_capa("ccaa", {"ccaa": [cfg]}, _ctx(tmp_path))
    assert g[["id", "nombre"]].values.tolist() == [["region_murcia", "Región de Murcia"]]
    assert "PropertyIsEqualTo" in pedidas[0] or "FILTER" in pedidas[0]
    # en caché: la segunda vez no pide nada
    A.cargar_capa("ccaa", {"ccaa": [cfg]}, _ctx(tmp_path))
    assert len(pedidas) == 1


# ---------------------------------------------------------------- zip_geojson

def _zip_geojson(feats) -> bytes:
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        z.writestr("Enp2025/enp.geojson", json.dumps({"type": "FeatureCollection", "crs": {
            "type": "name", "properties": {"name": "EPSG:4258"}}, "features": feats}))
    return b.getvalue()


def test_zip_geojson_lee_el_miembro_filtra_y_recorta_a_la_zona(tmp_path, monkeypatch):
    def f(cod, ccaa, lon):
        return {"type": "Feature", "properties": {"SITE_CODE": cod, "SITE_NAME": f"ENP {cod}", "ODESIGNATE": "RN",
                                                  "CCAA": ccaa},
                "geometry": {"type": "Polygon", "coordinates": [[[lon, 38.8], [lon + .01, 38.8], [lon + .01, 38.81],
                                                                 [lon, 38.81], [lon, 38.8]]]}}
    contenido = _zip_geojson([f("A", "Castilla-La Mancha", -1.2), f("B", "Comunitat Valenciana", -0.5),
                              f("C", "Castilla-La Mancha", -4.0)])
    pedidas = _falso_get(monkeypatch, {"Enp2025": contenido}, modulo=G)
    zona = box(570000, 4280000, 760000, 4320000)
    cfg = {"adaptador": "zip_geojson", "url": "https://www.miteco.gob.es/x/Enp2025_geojson.zip",
           "miembro": "*.geojson", "cache": "miteco_enp", "filtro": {"CCAA": ["Castilla-La Mancha"]},
           "campos": {"codigo": "SITE_CODE", "nombre": "SITE_NAME", "figura": "ODESIGNATE"}}
    g = A.cargar_capa("protegidos", {"protegidos": [cfg]}, A.Contexto(raw=tmp_path, zona=zona))
    assert g["codigo"].tolist() == ["A"]                       # B: otra CCAA; C: fuera de la zona
    A.cargar_capa("protegidos", {"protegidos": [cfg]}, A.Contexto(raw=tmp_path, zona=zona))
    assert len(pedidas) == 1                                    # zip en caché


# ---------------------------------------------------------------- MFE

MAPEO_ICV = {"Pinus": "pino", "Quercus ilex": "encina", "Quercus suber": "alcornoque",
             "Quercus faginea": "quejigo", "Juniperus": "sabina", "Castanea": "castano"}


def test_clase_arbol_por_nombre_ifn():
    assert M.clase_arbol_nombre("Pinus halepensis", MAPEO_ICV) == ARBOL["pino"]
    assert M.clase_arbol_nombre("Juniperus oxycedrus", MAPEO_ICV) == ARBOL["sabina"]
    assert M.clase_arbol_nombre("Arbutus unedo ", MAPEO_ICV) == ARBOL["otro"]
    assert M.clase_arbol_nombre(None, MAPEO_ICV) == ARBOL["sin_arbolado"]
    assert M.clase_arbol_nombre("Quercus ilex", MAPEO_ICV) == ARBOL["encina"]


def test_arcgis_mfe_normaliza_la_capa_41_del_icv(tmp_path, monkeypatch):
    _falso_get(monkeypatch, {"resultOffset=0": FX / "icv_mfe41.json"})
    cfg = {"adaptador": "arcgis_mfe", "url": "https://x/MapServer/41", "pagina": 1000, "tesela_m": 100000,
           "cache": "icv_mfe", "mapeo_arbol": MAPEO_ICV,
           "mapeo_cubierta": {"matorral": ["Matorral"], "pastizal_matorral": ["Pastizal-matorral"],
                              "pastizal": ["Herbazal", "Prado"]}}
    g = A.cargar_capa("mfe", {"mfe": [cfg]}, _ctx(tmp_path))
    datos = json.loads((FX / "icv_mfe41.json").read_text())["features"]
    assert len(g) == len(datos)
    for (_, fila), f in zip(g.iterrows(), datos):
        p = f["properties"]
        assert fila["arbol"] == M.clase_arbol_nombre(p["sp1_nom_ifn"], MAPEO_ICV)
        assert fila["fcc"] == int(p["fccarb"] or 0)
        assert fila["anio_incendio"] == 0
    assert set(g["estado"]) <= set(ESTADO.values()) and set(g["cubierta"]) <= set(CUBIERTA.values())


def test_iepnb_mfe_caido_lanza_fuente_caida_sin_trocear(tmp_path, monkeypatch):
    pedidas = []

    def get(url, *a, **kw):
        pedidas.append(url)
        return _Resp(b"no healthy upstream", 503)
    monkeypatch.setattr(M.requests, "get", get)
    monkeypatch.setattr(M.time, "sleep", lambda s: None)
    with pytest.raises(M.FuenteCaida, match="503"):
        M.iepnb_mfe({"adaptador": "iepnb_mfe", "intentos": 3}, _ctx(tmp_path, fuentes={
            "mfe": {"wfs_url": "https://geoserver.iepnb.es/geoserver/wfs"}}))
    assert len(pedidas) == 3 and all("GetCapabilities" in u for u in pedidas)
